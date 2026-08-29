# Scene API — FastAPI + BLIP Image Captioning Service

A lightweight, standalone image captioning microservice for the portfolio's SceneLab feature. Deploy this on any GPU cloud and point `SCENE_API_BASE` at it.

## API Contract

Matches what `backend/src/services/captioner.js` expects:

### `POST /process-frame`
**Request:** `multipart/form-data` with a `file` field (JPEG image)

**Response:**
```json
{
  "scene_description": "a person sitting at a desk with a laptop",
  "captions": ["a person sitting at a desk with a laptop"],
  "confidence_score": 0.92,
  "detections": 3,
  "processing_time": 0.34
}
```

### `GET /health`
**Response:**
```json
{
  "status": "ok",
  "model": "Salesforce/blip-image-captioning-base",
  "device": "cuda",
  "uptime_seconds": 1234
}
```

## Quick Start (Local)

```bash
cd scene-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# CPU mode (slow but works for testing)
DEVICE=cpu python main.py

# GPU mode
CUDA_VISIBLE_DEVICES=0 python main.py
```

Service starts on `http://0.0.0.0:8000`.

## Docker

```bash
docker build -t scene-api .
docker run -p 8000:8000 --gpus all -e DEVICE=cuda scene-api
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DEVICE` | `cuda` | `cuda` or `cpu` |
| `MODEL_NAME` | `Salesforce/blip-image-captioning-base` | HuggingFace model ID |
| `MAX_IMAGE_BYTES` | `15728640` | 15 MB upload limit |
| `MAX_WORKERS` | `1` | Uvicorn workers |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warning` |

## Integration with Portfolio

Set this environment variable on your portfolio backend:

```bash
SCENE_API_BASE=https://your-scene-api-host.com
```

The portfolio's `captioner.js` will automatically:
1. Send keyframes to `/process-frame`
2. Fall back to VLM if this service is unreachable
3. Show "BLIP online" in the SceneLab UI

## Model Options

| Model | VRAM | Speed | Quality | Best For |
|---|---|---|---|---|
| `Salesforce/blip-image-captioning-base` | ~2 GB | Fast | Good | **Default** — balanced |
| `Salesforce/blip-image-captioning-large` | ~3.5 GB | Medium | Better | Higher quality captions |
| `Salesforce/blip2-opt-2.7b` | ~6 GB | Slow | Best | Richer descriptions |
| `microsoft/git-base-coco` | ~1.5 GB | Fast | Good | Alternative lightweight |

Change via `MODEL_NAME` env var.
