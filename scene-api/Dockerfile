# Multi-stage build for GPU inference
# Uses NVIDIA PyTorch base image for CUDA support

# ── build stage ─────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN python3.11 -m pip install --no-cache-dir -r requirements.txt

# Pre-download model weights during build so container starts fast
# This adds ~1.5GB to the image but avoids cold-start downloads
RUN python3.11 -c "
from transformers import BlipProcessor, BlipForConditionalGeneration
m = 'Salesforce/blip-image-captioning-base'
BlipProcessor.from_pretrained(m)
BlipForConditionalGeneration.from_pretrained(m)
print('Model cached')
"

# ── runtime stage ───────────────────────────────────────────────────────────
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEVICE=cuda
ENV MODEL_NAME=Salesforce/blip-image-captioning-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/dist-packages /usr/local/lib/python3.11/dist-packages
COPY --from=builder /root/.cache/huggingface /root/.cache/huggingface

# Copy application code
COPY main.py .

# Healthcheck
HEALTHCHECK --interval=30s --timeout=8s --start-period=60s \
    CMD python3.11 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

EXPOSE 8000

CMD ["python3.11", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
