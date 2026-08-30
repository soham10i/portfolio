# Scene API Deployment — GPU Cloud

Deploy the BLIP captioning service (`scene-api/`) to a GPU cloud provider.

---

## Prerequisites

1. Docker installed locally
2. Docker Hub account (or GitHub Container Registry)
3. GPU cloud account (RunPod / Vast.ai / Lambda Labs)

---

## Option 1: RunPod Serverless (Recommended for Portfolios)

Best for: APIs with sporadic traffic. Scales to zero. Pay per request.

### Step 1: Build and Push Docker Image

```bash
cd /Users/sohampatel/workspace/Porfolio/scene-api

# Build
docker build -t your-dockerhub-username/scene-api:latest .

# Push
docker push your-dockerhub-username/scene-api:latest
```

### Step 2: Create Serverless Endpoint

1. Go to [runpod.io](https://runpod.io) → Serverless
2. Click **New Endpoint**
3. Fill in:
   - **Endpoint Name:** `scene-api`
   - **Image:** `your-dockerhub-username/scene-api:latest`
   - **Container Port:** `8000`
   - **Min Workers:** `0` (scales to zero)
   - **Max Workers:** `1`
   - **GPU:** `NVIDIA RTX A4000` (cheapest) or `A5000`
   - **Flashboot:** Enable (faster cold starts)
   - **Environment Variables:**
     - `DEVICE=cuda`
     - `MODEL_NAME=Salesforce/blip-image-captioning-base`

4. Save

### Step 3: Get Endpoint URL

RunPod gives you a URL like:
```
https://api.runpod.ai/v2/your-endpoint-id/runsync
```

Copy this and set it as `SCENE_API_BASE` in your portfolio backend.

### Step 4: Test

```bash
curl -X POST https://api.runpod.ai/v2/your-endpoint-id/runsync \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "file": "data:image/jpeg;base64,/9j/4AAQ..."
    }
  }'
```

> Note: RunPod Serverless uses a slightly different request format. You may need to adapt `main.py` to handle RunPod's payload wrapper, or use their **Custom Endpoint** feature.

---

## Option 2: Vast.ai (Cheapest Persistent GPU)

Best for: Keeping a GPU running for demos.

### Step 1: Find a Cheap Instance

1. Go to [vast.ai](https://vast.ai)
2. Search: `RTX 3090` or `RTX 4090`
3. Sort by price
4. Select one with `cuda: 12.x` and `Docker` support

### Step 2: Deploy via Docker

Rent the instance, then SSH in:

```bash
ssh -p PORT root@IP_ADDRESS

# Install Docker (if not present)
curl -fsSL https://get.docker.com | sh

# Pull and run
mkdir -p /opt/scene-api
cd /opt/scene-api

docker run -d \
  --name scene-api \
  --gpus all \
  -p 8000:8000 \
  -e DEVICE=cuda \
  -e MODEL_NAME=Salesforce/blip-image-captioning-base \
  your-dockerhub-username/scene-api:latest

# Verify
curl http://localhost:8000/health
```

### Step 3: Expose Publicly

Vast.ai instances get a public IP. Your URL is:
```
http://IP_ADDRESS:8000
```

Set this as `SCENE_API_BASE` in your portfolio.

---

## Option 3: Hugging Face Inference Endpoints (Easiest)

Best for: Zero DevOps, managed scaling.

1. Go to [huggingface.co/inference-endpoints](https://huggingface.co/inference-endpoints)
2. Create new endpoint:
   - **Model:** `Salesforce/blip-image-captioning-base`
   - **Instance:** `NVIDIA T4 - small` (~$0.06/hr)
   - **Auto-scale:** Enable
3. Copy the endpoint URL
4. Set as `SCENE_API_BASE`

> Note: HF Inference Endpoints expects a specific payload format. You may need a thin proxy adapter or modify `backend/src/services/captioner.js` to match.

---

## Option 4: Local (No GPU)

For development and testing without GPU:

```bash
cd /Users/sohampatel/workspace/Porfolio/scene-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DEVICE=cpu python main.py
```

BLIP on CPU takes ~2 seconds per image. Fine for testing, too slow for production.

---

## Cost Comparison

| Provider | Type | Cost | Best For |
|---|---|---|---|
| **RunPod Serverless** | Pay/request | ~$0.001/request | Portfolio (scales to zero) |
| **Vast.ai** | Hourly | ~$0.18–0.30/hr | Persistent, cheapest |
| **HF Endpoints** | Hourly | ~$0.06/hr | Managed, easiest |
| **Local CPU** | Free | $0 | Development only |

---

## Integration Checklist

After deploying scene-api:

- [ ] `curl SCENE_API_BASE/health` returns `{"status":"ok"}`
- [ ] `curl -X POST SCENE_API_BASE/process-frame -F "file=@test.jpg"` returns caption
- [ ] Portfolio `SCENE_API_BASE` env var is set
- [ ] SceneLab UI shows "BLIP online" (green dot)
- [ ] Keyframes get captions from BLIP (not just VLM fallback)

---

## Troubleshooting

### "CUDA out of memory"
**Fix:** Use a smaller model (`blip-image-captioning-base` instead of `large`) or upgrade GPU.

### "Model download slow on first start"
**Fix:** The Dockerfile pre-caches weights. If building yourself, ensure the cache step runs during build.

### "RunPod returns 500"
**Fix:** RunPod Serverless wraps requests. Check their docs for payload format or use **Custom Endpoints**.
