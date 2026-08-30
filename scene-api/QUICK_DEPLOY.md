# Scene API (BLIP) — Quick Deploy Guide

Deploy the BLIP captioning service so SceneLab shows "BLIP online" instead of "VLM fallback."

**Current status:** SceneLab works with VLM fallback via OpenRouter. Deploying BLIP makes captions faster and cheaper (no LLM tokens spent on image description).

---

## Option A: Vast.ai — Cheapest Persistent GPU (Recommended for immediate deploy)

**Best for:** Keeping a GPU running during job search. ~$0.18/hr. Turn on/off instantly.

### Step 1: Sign up & Find GPU
1. Go to [vast.ai](https://vast.ai)
2. Sign up and add $5–10 credit (card or crypto)
3. Search: `RTX 3090` or `RTX 4090`
4. Sort by price, pick cheapest with `cuda: 12.x`

### Step 2: Rent & SSH
Click **Rent**, then SSH:
```bash
ssh -p <PORT> root@<IP>
```

### Step 3: Install & Run
```bash
# Install Python 3.11 + pip
apt-get update && apt-get install -y python3.11 python3.11-venv python3-pip

# Clone your repo
git clone https://github.com/soham10i/portfolio.git
cd portfolio/scene-api

# Create venv & install
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run on GPU
DEVICE=cuda python main.py
```

Service starts on port `8000`.

### Step 4: Expose & Connect
Vast.ai gives you a public IP. Your scene-api URL is:
```
http://<IP>:8000
```

Test it:
```bash
curl http://<IP>:8000/health
curl -X POST http://<IP>:8000/process-frame -F "file=@test.jpg"
```

### Step 5: Update Portfolio
Go to Render Dashboard → `soham-portfolio` → Environment:

| Variable | Value |
|---|---|
| `SCENE_API_BASE` | `http://<IP>:8000` |

Redeploy or wait for auto-deploy.

### Step 6: Verify
Open your portfolio → `/scene` → start camera → check if keyframes show "BLIP" as the engine.

---

## Option B: RunPod Serverless — Scales to Zero (Best long-term)

**Best for:** True serverless. Pay ~$0.001/request. Costs $0 when no one visits.

### Step 1: Build Docker Image (GitHub Actions)

Since Docker isn't available locally, use GitHub Actions to build automatically.

Create `.github/workflows/build-scene-api.yml` in your repo:

```yaml
name: Build and Push Scene API

on:
  push:
    paths:
      - 'scene-api/**'
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./scene-api
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/scene-api:latest
```

### Step 2: Add GitHub Secrets
1. Go to GitHub repo → Settings → Secrets → Actions
2. Add:
   - `DOCKERHUB_USERNAME` — your Docker Hub username
   - `DOCKERHUB_TOKEN` — create at [hub.docker.com/settings/security](https://hub.docker.com/settings/security)

### Step 3: Push to Trigger Build
```bash
git add .github/workflows/build-scene-api.yml
git commit -m "ci: add scene-api docker build"
git push
```

GitHub Actions builds and pushes the image automatically.

### Step 4: Create RunPod Serverless Endpoint
1. Go to [runpod.io](https://runpod.io) → Serverless
2. New Endpoint:
   - **Image:** `your-dockerhub-username/scene-api:latest`
   - **Container Port:** `8000`
   - **Min Workers:** `0`
   - **Max Workers:** `1`
   - **GPU:** `RTX A4000`
   - **Env:** `DEVICE=cuda`, `MODEL_NAME=Salesforce/blip-image-captioning-base`
3. Save & copy endpoint URL

### Step 5: Update Portfolio
Set `SCENE_API_BASE` to your RunPod endpoint URL.

---

## Option C: Hugging Face Inference Endpoints (Easiest, but pricier)

**Best for:** Zero DevOps. They manage everything.

1. Go to [huggingface.co/inference-endpoints](https://huggingface.co/inference-endpoints)
2. Create endpoint:
   - **Model:** `Salesforce/blip-image-captioning-base`
   - **Instance:** `NVIDIA T4 - small` (~$0.06/hr)
   - **Auto-scale:** On
3. Copy endpoint URL
4. **Problem:** HF uses a different API format than our FastAPI app
5. **Fix needed:** Modify `backend/src/services/captioner.js` to call HF's API format

This option requires code changes. Use Option A or B for immediate results.

---

## 💰 Cost Comparison

| Option | Cost | Setup | Best For |
|---|---|---|---|
| **Vast.ai** | ~$0.18/hr (~$130/mo always-on) | 10 min | Demo periods, job search |
| **RunPod Serverless** | ~$0.001/request | 30 min | Long-term, scales to zero |
| **HF Endpoints** | ~$0.06/hr (~$43/mo) | 5 min | Zero maintenance |

**Pro tip:** Start with Vast.ai, run it for a week during active job search, then destroy it. Cost: **~$30** for the month.

---

## 🎯 My Recommendation

**Right now:** Use **Option A (Vast.ai)**. It's the fastest to set up and gives you a working BLIP service in 10 minutes.

**Later:** Switch to **Option B (RunPod Serverless)** when you want true serverless scaling.
