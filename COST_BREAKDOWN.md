# Total Deployment Cost Breakdown

**Date:** 2026-08-30  
**Scope:** Full portfolio deployment including web hosting, GPU inference, fine-tuning, domain, and storage.

---

## 1. Portfolio Web Hosting

### Option A: Render (Current Setup)

| Tier | Plan | Cost | Notes |
|---|---|---|---|
| Free | Render Free | **$0** | Sleeps after 15 min idle; 10s cold start |
| Standard | Render Starter | **$7/month** | No sleep; 512 MB RAM; custom domains |
| Pro | Render Pro | **$25/month** | 2 GB RAM; faster builds; priority support |

> **Recommendation:** Start on **Free**, upgrade to Starter ($7) when you're actively job searching. The cold start on Free is annoying for demos.

### Option B: Fly.io (Alternative)

| Plan | Cost | Notes |
|---|---|---|
| Shared-cpu-1x | **$1.94/month** | 256 MB RAM; stays awake |
| Shared-cpu-2x | **$7.74/month** | 512 MB RAM; what you need for MedQA embedder |
| Performance-1x | **$15.48/month** | 1 GB RAM; comfortable headroom |

> Fly is cheaper than Render for always-on services. But Render's free tier is genuinely free.

---

## 2. LLM Inference (GPU for Chat, MedQA, SceneLab)

You need an OpenAI-compatible endpoint for:
- Chatbot (`/api/chat`)
- MedQA RAG (`/api/medqa/ask`)
- SceneLab summarisation + Q&A (`/api/scene/summarise`, `/api/scene/ask`)
- NLI verification

### Option A: Self-Hosted on Cloud GPU (Recommended)

| Provider | GPU | VRAM | Cost/hr | Est. Monthly (always-on) |
|---|---|---|---|---|
| **RunPod** | RTX A4000 | 16 GB | ~$0.44 | **~$320/mo** |
| **Vast.ai** | RTX 3090 | 24 GB | ~$0.18–0.25 | **~$130–180/mo** |
| **Vast.ai** | RTX 4090 | 24 GB | ~$0.30–0.40 | **~$220–290/mo** |
| **Lambda Labs** | A10 | 24 GB | ~$0.60 | **~$440/mo** |
| **Paperspace** | A4000 | 16 GB | ~$0.51 | **~$370/mo** |

> **BUT:** You don't need it always-on. Options to reduce cost:

| Strategy | Cost | When to Use |
|---|---|---|
| **On-demand only** | $0.18–0.44/hr used | Turn on for demos, off otherwise |
| **Serverless (RunPod)** | ~$0.001/request | Scales to zero; pay per API call |
| **Spot/Interruptible** | ~50% discount | Vast.ai interruptible instances |

### Option B: API Providers (No GPU Management)

| Provider | Model Access | Cost | Best For |
|---|---|---|---|
| **OpenRouter** | Mix of open/closed | ~$0.50–2.00/M tokens | Easy setup, no GPU |
| **Groq** | Llama 3, Mixtral | ~$0.30/M tokens | Fastest inference |
| **Together AI** | Mixtral, Llama | ~$0.60/M tokens | Good balance |
| **OpenAI** | GPT-4o, GPT-4 | ~$2.50–10/M tokens | Best quality, most expensive |
| **Anthropic** | Claude 3.5 | ~$3.00/M tokens | Best reasoning |

> For a portfolio with moderate traffic (~1,000 requests/month), an API provider costs **$5–20/month**.

### My Recommendation for LLM

**Phase 1 (Now):** Use **OpenRouter** or **Groq** — no GPU rental, no ops, instant setup. Cost: **$5–15/month**.

**Phase 2 (Later):** When you want to demonstrate "self-hosted AI" on your CV, rent a **Vast.ai RTX 3090** for **$0.18/hr**, run vLLM, and keep it on only during active job search. Cost: **~$40/month** (6 hrs/day).

---

## 3. BLIP Captioning Service (scene-api)

This is lightweight inference (~0.3s per image on GPU, ~2s on CPU).

| Hosting Option | Cost | Notes |
|---|---|---|
| **RunPod Serverless** | ~$0.001/request | Scales to zero; ideal for portfolio |
| **Hugging Face Inference Endpoints** | ~$0.06/hr | Managed, easy setup |
| **Self-hosted (Vast.ai RTX 3090)** | ~$0.18/hr | Shared with LLM on same GPU |
| **Google Cloud Run + GPU** | ~$0.50/hr | Overkill for this workload |

### Recommendation

**RunPod Serverless** with min workers = 0. You pay only when SceneLab sends a keyframe.

**Estimated cost:** $0–2/month for a portfolio.

---

## 4. Fine-Tuning / Training Medical Model (MedQA)

This is where costs get serious. You mentioned wanting to fine-tune or full-train a model for medical QA.

### Fine-Tuning (LoRA / QLoRA) — Cheaper

| Model Size | Method | GPU | Time | Cost |
|---|---|---|---|---|
| 7B | QLoRA (4-bit) | RTX 4090 (24GB) | 2–4 hrs | **~$0.60–1.20** (one-time) |
| 7B | LoRA (16-bit) | A100 (40GB) | 1–2 hrs | **~$1.50–3.00** (one-time) |
| 14B | QLoRA (4-bit) | A100 (40GB) | 4–6 hrs | **~$3.00–4.50** (one-time) |
| 70B | QLoRA (4-bit) | A100 (80GB) | 8–12 hrs | **~$6.00–9.00** (one-time) |

> **Fine-tuning is cheap** because it's a one-time cost (or occasional retrain). You train once, save the LoRA weights (~10–500 MB), and use them for inference.

### Full Pre-Training — Expensive

| Model Size | GPU | Time | Cost |
|---|---|---|---|
| 1B from scratch | 8× A100 | 1–2 weeks | **~$5,000–10,000** |
| 7B from scratch | 32× A100 | 2–4 weeks | **~$50,000–100,000** |
| 70B from scratch | 256× H100 | 1–2 months | **~$500,000+** |

> **Full training is NOT feasible for a student portfolio.** Use fine-tuning or RAG instead.

### My Recommendation for MedQA

**Don't fine-tune yet.** Your current RAG pipeline with:
- 120 curated Q&A pairs (`medqa-seed.json`)
- `@xenova/transformers` embeddings
- LLM for generation + NLI verification

...already produces good results at **$0 extra cost**.

**When to fine-tune:** After you collect 1,000+ real user interactions showing where the RAG pipeline fails. Then do a **single QLoRA run** (~$1–3) and upload the LoRA weights.

---

## 5. Domain Name

| Provider | .com | .dev | .ai | .co | Notes |
|---|---|---|---|---|---|
| **Cloudflare** | ~$10/yr | ~$12/yr | — | ~$12/yr | No markup; best DNS |
| **Namecheap** | ~$9–14/yr | ~$14/yr | ~$70/yr | ~$12/yr | Free WHOIS privacy |
| **Google Domains** | ~$12/yr | ~$12/yr | ~$70/yr | ~$12/yr | Clean UI |
| **Porkbun** | ~$9/yr | ~$11/yr | ~$60/yr | ~$11/yr | Cheapest renewals |

> **Recommendation:** **Cloudflare** or **Porkbun** for a `.dev` domain (~$12/year). `.dev` looks professional for a developer portfolio.

---

## 6. Storage & Assets

| Component | Current Size | Host | Cost |
|---|---|---|---|
| Frontend build (`dist/`) | ~2 MB | Render/Fly (included) | **$0** |
| YOLO model (`yolov8n-seg.onnx`) | 14 MB | Serves from `public/` | **$0** |
| ONNX Runtime WASM | 11 MB | Serves from `public/` | **$0** |
| Maze videos (`videos/`) | 74 MB | Serves from `public/` | **$0** |
| MedQA index (`data/`) | 1 MB | Serves from backend | **$0** |
| Contact messages | grows slowly | Ephemeral file | **$0** |

Everything fits within the free tier limits of Render/Fly. No external storage needed.

---

## 7. Total Monthly Cost — 3 Scenarios

### Scenario A: Student / Zero Budget 💰

| Component | Provider | Cost |
|---|---|---|
| Web hosting | Render Free | **$0** |
| LLM inference | Groq / OpenRouter free tier | **$0** |
| BLIP captions | Disabled (VLM fallback only) | **$0** |
| Domain | None (use `*.onrender.com`) | **$0** |
| **TOTAL** | | **$0/month** |

> Trade-offs: Cold starts on Render, no custom domain, limited LLM credits.

---

### Scenario B: Job Search Ready 🚀

| Component | Provider | Cost |
|---|---|---|
| Web hosting | Render Starter | **$7** |
| LLM inference | OpenRouter (pay-as-you-go) | **$10–15** |
| BLIP captions | RunPod Serverless | **$0–2** |
| Domain | Cloudflare `.dev` | **$1** (amortized) |
| **TOTAL** | | **$18–25/month** |

> This is the sweet spot. Fast, reliable, custom domain, professional appearance.

---

### Scenario C: Full Self-Hosted (CV Impressive) 🎯

| Component | Provider | Cost |
|---|---|---|
| Web hosting | Fly.io shared-cpu-2x | **$8** |
| LLM + BLIP | Vast.ai RTX 3090 (6 hrs/day) | **~$35** |
| Domain | Cloudflare `.dev` | **$1** |
| Monitoring | UptimeRobot free | **$0** |
| **TOTAL** | | **$44/month** |

> Everything is genuinely yours. "Self-hosted LLM on cloud GPU" is a strong CV talking point.

---

## 8. One-Time Costs

| Item | Cost | When |
|---|---|---|
| Domain registration (`.dev`) | **$12** | Once/year |
| MedQA LoRA fine-tuning run | **$1–3** | When you have enough training data |
| BLIP model cache download | **$0** | Included in Docker build |
| SSL certificate | **$0** | Let's Encrypt (auto) |

---

## 9. Cost Optimization Strategies

1. **Start free, upgrade when needed.** Render Free → Starter only when cold starts hurt UX.

2. **Use API providers first, self-host later.** Groq/OpenRouter cost $5–15/month vs $130–320/month for dedicated GPU. Switch to self-hosted GPU only when you want the "I run my own models" CV line.

3. **Turn off GPU when not job searching.** Vast.ai lets you destroy/resume instances instantly. Run your GPU only during:
   - Active job applications
   - Interview periods
   - Demo days / career fairs

4. **Bundle LLM + BLIP on one GPU.** A single RTX 3090 (24GB) can serve both your LLM (7B–14B) and BLIP simultaneously. Don't rent two GPUs.

5. **Use spot/preemptible instances.** Vast.ai interruptible = 50% cheaper. Fine for a portfolio (if it goes down, restart it).

---

## 10. My Final Recommendation

**Month 1–2 (Build & Test):**
- Render Free + OpenRouter free tier
- Cost: **$0**

**Month 3+ (Job Search Active):**
- Render Starter ($7) + OpenRouter ($10–15) + `.dev` domain ($1)
- Cost: **$18–25/month**

**Later (CV Polish):**
- Add a Vast.ai RTX 3090 for 1 month, screenshot your self-hosted setup, write a blog post about it
- Cost: **~$130 for that month**
- Then go back to OpenRouter for daily use

---

*Last updated: 2026-08-30*
