"""Scene Captioning API — FastAPI + Qwen2-VL

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
from fastapi import FastAPI, File, HTTPException, UploadFile, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from PIL import Image
from transformers import AutoProcessor, Qwen2VLForConditionalGeneration
from qwen_vl_utils import process_vision_info
import tempfile
import shutil
import os

# ── config ──────────────────────────────────────────────────────────────────
DEVICE = os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen/Qwen2-VL-7B-Instruct")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", "15728640"))  # 15 MiB
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Globals set during lifespan
processor = None
model = None
_start_time: float = 0.0


# ── lifespan (load model once) ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, model, _start_time
    print(f"[scene-api] Loading {MODEL_NAME} on {DEVICE} …")
    t0 = time.time()
    processor = AutoProcessor.from_pretrained(MODEL_NAME)
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        MODEL_NAME, torch_dtype="auto", device_map="auto" if DEVICE == "cuda" else None
    )
    if DEVICE != "cuda":
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


@app.post("/interpolate")
async def interpolate_video(file: UploadFile = File(...)):
    """Receives a video, runs RIFE AI frame interpolation to 60fps, and returns it."""
    if not file.content_type.startswith("video/"):
        raise HTTPException(400, "Only video files are supported")
        
    # Lazy import to avoid loading RIFE on startup if not used
    try:
        from interpolation import process_video_rife
    except ImportError:
        raise HTTPException(501, "Interpolation module not installed or available")

    # Create temporary directory for processing
    tmpdir = tempfile.mkdtemp()
    input_path = os.path.join(tmpdir, "input.mp4")
    output_path = os.path.join(tmpdir, "output_60fps.mp4")
    
    with open(input_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
        
    try:
        # Run AI interpolation (blocking call, should ideally be async or offloaded)
        success = process_video_rife(input_path, output_path, target_fps=60)
        if not success:
            raise HTTPException(500, "Video interpolation failed")
            
        return FileResponse(
            output_path, 
            media_type="video/mp4", 
            filename="interpolated.mp4",
            background=BackgroundTasks().add_task(shutil.rmtree, tmpdir, ignore_errors=True)
        )
    except Exception as e:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise HTTPException(500, f"Interpolation error: {str(e)}")

# ── helpers ─────────────────────────────────────────────────────────────────
def _caption(image: Image.Image, max_length: int = 150) -> tuple[str, float]:
    """Run Qwen2-VL on a PIL image. Returns (caption, processing_time_seconds)."""
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": "Describe this scene in detail, focusing on objects, spatial relationships, and small details."},
            ]
        }
    ]
    
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt"
    ).to(DEVICE)
    
    t0 = time.time()
    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=max_length)
    dt = time.time() - t0
    
    generated_ids_trimmed = [
        out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, output_ids)
    ]
    caption = processor.batch_decode(generated_ids_trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0]
    
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
