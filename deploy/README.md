# Complete Deployment Architecture

This document describes every resource, configuration file, and step needed to deploy the full portfolio stack.

---

## 📁 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PORTFOLIO (Monolithic Web Service)                  │
│  Repository: https://github.com/soham10i/portfolio                            │
│                                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   React SPA │  │  Express API│  │   MedQA RAG │  │   SceneLab Proxy    │  │
│  │   (Vite)    │  │   (Node.js) │  │   (Node.js) │  │   (Node.js)         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                │                    │             │
│         └────────────────┴────────────────┴────────────────────┘             │
│                                     │                                        │
│                              ┌──────┴──────┐                                 │
│                              │  Render /   │                                 │
│                              │  Fly.io     │                                 │
│                              │  ($0–7/mo)  │                                 │
│                              └──────┬──────┘                                 │
│                                     │                                        │
│         ┌───────────────────────────┼───────────────────────────┐            │
│         ▼                           ▼                           ▼            │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────────────┐ │
│  │  OpenRouter │           │  Vast.ai    │           │  Self-hosted vLLM   │ │
│  │  ($5–15/mo) │           │  ($0.18/hr) │           │  (your hardware)    │ │
│  └─────────────┘           └─────────────┘           └─────────────────────┘ │
│         │                           │                                        │
│         └───────────────────────────┴────────────────────────────────────────┘
│                                     │
│                              ┌──────┴──────┐
│                              │  scene-api  │
│                              │  (FastAPI   │
│                              │   + BLIP)   │
│                              │  (optional) │
│                              └─────────────┘
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Required Files

### 1. Portfolio Web Service

| File | Purpose | Deploy Target |
|---|---|---|
| `render.yaml` | Render Blueprint (IaC) | Render root directory |
| `backend/Dockerfile` | Container build | Render / Fly / Docker |
| `backend/server.js` | Express entry point | Container runtime |
| `backend/.env.example` | Env var template | Copy to `.env` locally |
| `backend/data/` | MedQA index + seed | Must be in Docker image |

### 2. Scene Captioning API (Optional)

| File | Purpose | Deploy Target |
|---|---|---|
| `scene-api/main.py` | FastAPI + BLIP | GPU cloud / Docker |
| `scene-api/Dockerfile` | GPU container build | GPU cloud |
| `scene-api/requirements.txt` | Python deps | pip install |
| `scene-api/.env.example` | Env var template | Copy to `.env` locally |

### 3. Local Development

| File | Purpose |
|---|---|
| `docker-compose.yml` | Spins up both services locally |
| `backend/.env` | Local backend config (gitignored) |
| `scene-api/.env` | Local scene-api config (gitignored) |

---

## 🚀 Deployment Targets

### Target 1: Render (Primary)

**Best for:** Free tier, easy setup, auto-deploy from GitHub.

**Steps:**
1. Push `render.yaml` to repo root
2. Render Dashboard → Blueprints → New Blueprint Instance
3. Connect `soham10i/portfolio`
4. Set environment variables in dashboard:
   - `LLM_API_BASE` (your OpenRouter/Groq/vLLM endpoint)
   - `LLM_MODEL`
   - `LLM_API_KEY`
   - `ADMIN_TOKEN` (auto-generated, copy from dashboard)
   - `SCENE_API_BASE` (leave empty initially)
5. Deploy

**Verify:**
```bash
curl https://YOUR_HOST.onrender.com/api/health
curl https://YOUR_HOST.onrender.com/api/medqa/status
curl https://YOUR_HOST.onrender.com/api/scene/status
```

### Target 2: Fly.io (Alternative)

**Best for:** Cheaper always-on pricing, EU regions.

**Steps:**
```bash
# 1. Install flyctl and login
fly auth login

# 2. Launch (creates fly.toml)
fly launch --name soham-portfolio --region fra --dockerfile backend/Dockerfile

# 3. Set secrets
fly secrets set NODE_ENV=production
fly secrets set LLM_API_BASE=https://your-endpoint.com/v1
fly secrets set LLM_MODEL=qwen2.5:14b-instruct
fly secrets set LLM_API_KEY=sk-...
fly secrets set ADMIN_TOKEN=$(openssl rand -base64 32)

# 4. Deploy
fly deploy
```

### Target 3: Local (Docker Compose)

**Best for:** Development, testing before deploy.

**Prerequisites:**
- Docker + Docker Compose
- NVIDIA Container Toolkit (for GPU scene-api)

**Steps:**
```bash
# 1. Configure environment
cp backend/.env.example backend/.env
cp scene-api/.env.example scene-api/.env
# Edit both files with your values

# 2. Build and run
docker compose up --build

# 3. Access
# Portfolio: http://localhost:3001
# Scene API: http://localhost:8000
```

---

## 🔑 Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Server port |
| `NODE_ENV` | No | `development` | `production` or `development` |
| `LLM_API_BASE` | No | — | OpenAI-compatible endpoint URL |
| `LLM_MODEL` | No | `qwen2.5:7b-instruct` | Text generation model |
| `LLM_VISION_MODEL` | No | `qwen2.5vl:7b` | Vision model for SceneLab |
| `LLM_API_KEY` | No | — | API key for endpoint |
| `SCENE_API_BASE` | No | — | URL of scene-api service |
| `ADMIN_TOKEN` | No | — | Secret for notes editing |
| `ALLOWED_ORIGINS` | No | — | CORS origins (unset = same-origin) |

### Scene API (`scene-api/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `HOST` | No | `0.0.0.0` | Bind address |
| `PORT` | No | `8000` | Server port |
| `MODEL_NAME` | No | `Salesforce/blip-image-captioning-base` | HuggingFace model |
| `DEVICE` | No | `cuda` | `cuda` or `cpu` |
| `MAX_IMAGE_BYTES` | No | `15728640` | Max upload size (15 MB) |
| `LOG_LEVEL` | No | `info` | Logging level |

---

## 🌐 Connecting Services

### Without Scene API (VLM Fallback Only)

```
Portfolio Backend ──► LLM_API_BASE (for chat, medqa, scene summarise/ask)
```

SceneLab detection runs in browser. Captions fall back to VLM via `LLM_API_BASE`.

**Set:** `SCENE_API_BASE=` (empty)

### With Scene API (Full Pipeline)

```
Portfolio Backend ──► SCENE_API_BASE ──► scene-api (BLIP captions)
                └──► LLM_API_BASE  ───► LLM (summarise, Q&A, chat, medqa)
```

**Set:** `SCENE_API_BASE=https://your-scene-api.com`

---

## 📊 Resource Requirements

### Portfolio Web Service

| Resource | Free Tier | Recommended |
|---|---|---|
| RAM | 512 MB | 512 MB–1 GB |
| CPU | Shared | Shared |
| Disk | 1 GB ephemeral | 1 GB ephemeral |
| Network | Included | Included |

### Scene API (BLIP)

| Resource | Minimum | Recommended |
|---|---|---|
| GPU | None (CPU fallback) | NVIDIA T4 / RTX 3090 |
| VRAM | 0 GB (CPU) | 2 GB |
| RAM | 2 GB | 4 GB |
| Disk | 5 GB | 5 GB |

---

## 🔄 Deploy Order

### Phase 1: Portfolio Only (Now)
1. Deploy portfolio to Render
2. Set `LLM_API_BASE` to OpenRouter or Groq
3. Verify all tabs work
4. Cost: **$0–7/month**

### Phase 2: Add Scene API (Later)
1. Deploy `scene-api` to RunPod Serverless or Vast.ai
2. Set `SCENE_API_BASE` on portfolio backend
3. Verify SceneLab shows "BLIP online"
4. Cost: **+$0–2/month**

### Phase 3: Self-Hosted LLM (CV Polish)
1. Rent Vast.ai RTX 3090
2. Run vLLM with your chosen model
3. Point `LLM_API_BASE` to your GPU
4. Run for 1 month, document it
5. Cost: **~$130 one-time**

---

## 🛠 Troubleshooting

### "Cannot find module '@xenova/transformers'"
**Cause:** Backend dependencies not installed during build.  
**Fix:** Ensure build command includes `cd backend && npm ci --omit=dev`.

### "MedQA index not found"
**Cause:** `backend/data/` not in Docker image.  
**Fix:** `Dockerfile` must include `COPY backend/data ./data`.

### "No captioning engine available" in SceneLab
**Cause:** Neither `SCENE_API_BASE` nor `LLM_API_BASE` is reachable.  
**Fix:** Set at least one of them. Detection works regardless.

### "CORS error" in browser console
**Cause:** `ALLOWED_ORIGINS` misconfigured or `NODE_ENV` not set to `production`.  
**Fix:** In production, leave `ALLOWED_ORIGINS` unset for same-origin. Ensure `NODE_ENV=production`.

---

## 📁 File Tree (Deployment-Relevant)

```
portfolio/
├── render.yaml                 # Render Blueprint
├── docker-compose.yml          # Local dev stack
├── backend/
│   ├── Dockerfile              # Portfolio container
│   ├── server.js               # Express entry
│   ├── .env.example            # Env template
│   ├── package.json
│   ├── data/                   # MedQA index (must ship in image)
│   │   ├── medqa-index.json
│   │   └── medqa-seed.json
│   ├── notes/                  # Study notes content
│   └── src/
│       ├── config/             # Env config
│       ├── routes/             # API routes
│       ├── services/           # Business logic
│       └── middleware/         # Security, rate limits
├── app/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/                    # React frontend
│       ├── features/
│       │   ├── scene-lab/      # SceneLab demo
│       │   ├── medqa/          # MedQA demo
│       │   ├── robot/          # Autonomous robot
│       │   └── ...
│       └── app/App.tsx         # Router
├── scene-api/
│   ├── Dockerfile              # BLIP service container
│   ├── main.py                 # FastAPI app
│   ├── requirements.txt
│   └── .env.example
├── deploy/
│   └── README.md               # This file
└── PRODUCTION_DEPLOY_GUIDE.md  # Detailed production guide
```

---

*Generated: 2026-08-30*
