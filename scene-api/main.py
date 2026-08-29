"""Scene Captioning API — FastAPI + BLIP

A lightweight image-captioning microservice for the portfolio's real-time
scene-understanding demo.  One model is loaded at startup and kept hot;
requests are single-threaded through it so GPU memory stays bounded.
"""

import asyncio
import io
import os
import time
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from transformers import BlipForConditionalGeneration, BlipProcessor

# ── config ──────────────────────────────────────────────────────────────────
DEVICE = os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MODEL_NAME = os.getenv("MODEL_NAME", "Salesforce/blip-image-captioning-base")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", "15728640"))  # 15 MiB
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Globals set during lifespan
processor: BlipProcessor | None = None
model: BlipForConditionalGeneration | None = None
_start_time: float = 0.0


# ── lifespan (load model once) ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, model, _start_time
    print(f"[scene-api] Loading {MODEL_NAME} on {DEVICE} …")
    t0 = time.time()
    processor = BlipProcessor.from_pretrained(MODEL_NAME)
    model = BlipForConditionalGeneration.from_pretrained(MODEL_NAME)
    model.to(DEVICE)
    model.eval()
    print(f"[scene-api] Model ready in {time.time() - t0:.2f}s")
    _start_time = time.time()
    yield
    print("[scene-api] Shutting down")


app = FastAPI(
    title="Scene Captioning API",
    description="BLIP-based image captioning for portfolio SceneLab",
    version="1.0.0",
    lifespan=lifespan,
)

# Single-threaded captioning lock — keeps VRAM usage predictable
_cap_lock = asyncio.Lock()


# ── helpers ─────────────────────────────────────────────────────────────────
def _caption(image: Image.Image, max_length: int = 50) -> tuple[str, float]:
    """Run BLIP on a PIL image. Returns (caption, processing_time_seconds)."""
    inputs = processor(image, return_tensors="pt").to(DEVICE)
    t0 = time.time()
    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=max_length)
    dt = time.time() - t0
    caption = processor.decode(output_ids[0], skip_special_tokens=True)
    return caption.strip(), dt


# ── routes ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "uptime_seconds": round(time.time() - _start_time, 1),
    }


@app.post("/process-frame")
async def process_frame(file: UploadFile = File(...)):
    # ── validate upload ──
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(400, f"Expected image/*, got {content_type}")

    body = await file.read()
    if len(body) > MAX_IMAGE_BYTES:
        raise HTTPException(413, f"Image too large: {len(body)} bytes (max {MAX_IMAGE_BYTES})")

    # ── decode ──
    try:
        image = Image.open(io.BytesIO(body)).convert("RGB")
    except Exception as exc:
        raise HTTPException(400, f"Invalid image: {exc}")

    # ── caption (single-threaded through model) ──
    async with _cap_lock:
        # asyncio.to_thread keeps the event loop alive while PyTorch hogs the GIL
        caption, dt = await asyncio.to_thread(_caption, image)

    return {
        "scene_description": caption,
        "captions": [caption],
        "confidence_score": None,        # BLIP base doesn't expose confidence
        "detections": None,              # Detection happens in browser, not here
        "processing_time": round(dt, 3),
    }


@app.exception_handler(Exception)
async def _catchall(request, exc):
    return JSONResponse({"error": str(exc)}, status_code=500)


# ── entrypoint ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, log_level=os.getenv("LOG_LEVEL", "info"))
