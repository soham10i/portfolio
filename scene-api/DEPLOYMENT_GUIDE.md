# Cloud GPU Deployment Guide for Students

**Goal:** Deploy the `scene-api` (BLIP captioning) as cheaply as possible.
**Workload:** Light inference (~2 keyframes/minute per visitor). Model needs ~2 GB VRAM.
**Model:** `Salesforce/blip-image-captioning-base` (1.5 GB download, 2 GB VRAM at runtime)

---

## 🏆 Top 3 Recommendations (Ranked for Students)

### 1. RunPod Serverless ⭐ BEST FOR APIs

**Why:** Built for exactly this use case — inference APIs that scale to zero.

| Feature | Detail |
|---|---|
| Free credit | $5–10 on signup |
| Cost | ~$0.001–0.003 per request (serverless) |
| GPU | RTX A4000 / A5000 / A6000 |
| Cold start | ~5–10 seconds (acceptable for portfolio) |
| Setup | Upload Docker image, get HTTPS endpoint |
| Best for | **This exact use case** — lightweight inference API |

**Deploy steps:**
1. Sign up at [runpod.io](https://runpod.io) → Serverless
2. Create a new serverless endpoint
3. Point container image to your Docker Hub image (or use RunPod's registry)
4. Select GPU: RTX A4000 (cheap) or A5000 (faster cold start)
5. Set min workers = 0 (scales to zero), max workers = 1
6. Copy the endpoint URL → set as `SCENE_API_BASE` in your portfolio

**Estimated cost:** If your portfolio gets 100 visitors/month, each triggering 10 captions = ~$0.50/month. With $5 free credit, you run free for almost a year.

---

### 2. Google Cloud Platform ⭐ BEST FREE TIER

**Why:** $300 free credit for 90 days = ~100 hours of T4 GPU. Most reliable.

| Feature | Detail |
|---|---|
| Free credit | $300 for 90 days (new accounts) |
| Cost after | ~$0.35/hr T4 on-demand; ~$0.12/hr spot |
| GPU | NVIDIA T4 (16 GB) — overkill but available |
| Setup | Complex (GCE + Docker + firewall rules) |
| Best for | Students with GCP experience, or learning cloud |

**Deploy steps:**
1. Sign up at [cloud.google.com](https://cloud.google.com) → get $300 credit
2. Create a Compute Engine VM: `g1-small` + 1× NVIDIA T4
3. Install NVIDIA drivers + Docker
4. `docker run -p 8000:8000 --gpus all scene-api`
5. Allow firewall rule on port 8000
6. Set static IP → `SCENE_API_BASE=http://YOUR_IP:8000`

**Estimated cost:** T4 spot at $0.12/hr × 24hr × 30 days = **$86/month** if always-on. Use preemptible instances or shut down when not needed.

> 💡 **Pro tip:** With $300 credit, you can run a T4 24/7 for ~3.5 months. After that, switch to spot instances or move to RunPod.

---

### 3. Vast.ai ⭐ CHEAPEST PERSISTENT

**Why:** Peer-to-peer GPU marketplace. Cheapest hourly rates on the planet.

| Feature | Detail |
|---|---|
| Free credit | None |
| Cost | RTX 3090 at ~$0.18/hr; RTX 4090 at ~$0.30/hr |
| GPU | RTX 3090 (24 GB), RTX 4090 (24 GB), RTX 2080 Ti |
| Setup | SSH into rented machine, run Docker |
| Best for | Cost-sensitive, comfortable with Linux/SSH |

**Deploy steps:**
1. Sign up at [vast.ai](https://vast.ai)
2. Search for "RTX 3090" → sort by price
3. Rent instance (minimum 1 hour)
4. SSH in: `ssh -p PORT root@IP`
5. Install Docker, pull your image, run container
6. Set `SCENE_API_BASE=http://IP:8000`

**Estimated cost:** RTX 3090 at $0.18/hr. If you keep it running 24/7 = **~$130/month**. But for a portfolio, you can:
- Run only when showcasing (turn on/off)
- Use the **interruptible** option for ~50% discount
- Or rent for just $1-2 when demoing to recruiters

---

## 🎓 Other Student Options

### Lambda Labs — $30 Free Credit
- **URL:** [lambdalabs.com](https://lambdalabs.com)
- **Free:** $30 credit for new users
- **GPU:** A10 (24 GB) at ~$0.60/hr
- **Runtime on $30:** ~50 hours
- **Best for:** Experimentation, not persistent hosting (no serverless)
- **Note:** Instances are on-demand; you pay while running. Good for testing your Docker image before moving to cheaper hosts.

### Paperspace Gradient — Free M4000 Tier
- **URL:** [paperspace.com](https://paperspace.com)
- **Free:** M4000 (8 GB VRAM) — enough for BLIP-base!
- **Limit:** Free tier has limited hours; may sleep after inactivity
- **Best for:** Prototyping, not production API hosting
- **Note:** Their "Gradient" notebooks are free; persistent deployment may require paid tier.

### Hugging Face Spaces — Free ZeroGPU
- **URL:** [huggingface.co/spaces](https://huggingface.co/spaces)
- **Free:** Yes, with ZeroGPU (ephemeral GPU)
- **Limit:** Cold starts, shared GPU queue, not persistent
- **Best for:** Demo only, not reliable API backend

### Oracle Cloud — Always-Free A10
- **URL:** [oracle.com/cloud/free](https://oracle.com/cloud/free)
- **Free:** Always-free tier includes Ampere A1 (A10 GPU, 1/8th of A10)
- **Limit:** Very limited availability, complex signup, may be waitlisted
- **Best for:** If you can get it, genuinely free forever

### Kaggle / Google Colab — NOT SUITABLE
- **Free:** Yes (T4/P100)
- **Limit:** No persistent URL, notebooks timeout, no API hosting
- **Verdict:** Great for training, **impossible** for production API

---

## 📊 Full Comparison Table

| Provider | Free Credit | Cheapest GPU | $/hr | Best For | Ease |
|---|---|---|---|---|---|
| **RunPod Serverless** | $5–10 | RTX A4000 | $0.001/request | **This API** | ⭐⭐⭐ |
| **Google Cloud** | $300/90d | T4 spot | $0.12 | Reliable hosting | ⭐⭐ |
| **Vast.ai** | $0 | RTX 3090 | $0.18 | Cheapest persistent | ⭐⭐ |
| **Lambda Labs** | $30 | A10 | $0.60 | Testing, research | ⭐⭐⭐ |
| **Paperspace** | M4000 tier | M4000 | Free | Prototyping | ⭐⭐⭐ |
| **Oracle Cloud** | Always-free | A10 (1/8) | Free | If you can get it | ⭐ |
| **AWS (Student)** | $100–150/yr | T4 spot | $0.20 | Learning AWS | ⭐ |
| **Azure (Student)** | $100/yr | NC6s v3 | ~$0.90 | Learning Azure | ⭐ |

---

## 🎯 My Recommendation for You

Given you're a student with a portfolio that gets intermittent traffic:

### Phase 1: Deploy Free (Now)
1. **Sign up for Google Cloud** → get $300 credit
2. Deploy `scene-api` on a **T4 spot instance** (~$0.12/hr)
3. With $300, you get **2,500 hours** of runtime
4. Set `SCENE_API_BASE` to your GCP IP

### Phase 2: Long-term (After credits expire)
1. Move to **RunPod Serverless**
2. Pay ~$0.001 per request
3. Scales to zero = costs nothing when no one visits
4. Total monthly cost: **$0–2** for a portfolio

### Phase 3: Scale (If traffic grows)
1. Stay on RunPod Serverless but increase max workers
2. Or rent a cheap Vast.ai RTX 3090 for $0.18/hr and keep it always-on

---

## 🚀 Quick Deploy: RunPod Serverless (Recommended)

```bash
# 1. Build and push Docker image
cd /Users/sohampatel/workspace/Porfolio/scene-api
docker build -t your-dockerhub/scene-api:latest .
docker push your-dockerhub/scene-api:latest

# 2. In RunPod console:
#    - New Serverless Endpoint
#    - Image: your-dockerhub/scene-api:latest
#    - GPU: RTX A4000
#    - Min Workers: 0  (scales to zero)
#    - Max Workers: 1
#    - Container Port: 8000
#    - Health Check: /health

# 3. Copy the endpoint URL, e.g.:
#    https://api.runpod.ai/v2/abc123/runsync

# 4. Set in portfolio backend:
fly secrets set SCENE_API_BASE=https://api.runpod.ai/v2/abc123
# or on Render dashboard
```

---

## 🧪 Test Locally First

Before spending money, verify everything works:

```bash
cd /Users/sohampatel/workspace/Porfolio/scene-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py

# In another terminal:
curl -X POST http://localhost:8000/process-frame \
  -F "file=@/path/to/test.jpg"
# Expected: {"scene_description":"...","captions":["..."],...}

curl http://localhost:8000/health
# Expected: {"status":"ok","model":"...","device":"cpu",...}
```

---

## 💡 Pro Tips

1. **Start with CPU mode locally** — BLIP-base on CPU takes ~2s per image. Good enough to verify your API contract before renting GPU.

2. **Use RunPod Serverless for portfolio** — A portfolio has bursty traffic (recruiter visits, then silence). Serverless means you pay $0 when no one is looking.

3. **Cache model weights in Docker** — The Dockerfile already does this. First container start is fast; no download delays.

4. **Monitor costs** — Set billing alerts at $5, $10, $20. All providers support this.

5. **Keep a Vast.ai backup** — If RunPod is down or expensive, spin up a $0.18/hr Vast.ai instance for demo day.
