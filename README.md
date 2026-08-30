# Portfolio — Soham Patel

A portfolio that runs its own demos. Every interactive piece on the site is the
real thing executing in front of the visitor: object detection runs in their
browser, the digital twin steps a live simulation, the assistant streams tokens
from a hosted model. Nothing on it is a screenshot of something that once worked.

**Live:** _set the Render URL here once the service is created_

---

## What is actually running

| Route | What it does | Where the compute happens |
|---|---|---|
| `/` | Portfolio, with a streaming assistant ("JARVIS") that answers from a grounded system prompt | model call is server-side |
| `/scene` | **SceneLab** — YOLOv8n-seg object detection on webcam or an uploaded clip, keyframe captioning, and grounded Q&A over the resulting keyframe log | detection in the **visitor's browser** (ONNX Runtime Web); captioning server-side |
| `/medqa` | Retrieval-augmented medical QA over a local corpus, with NLI verification of the generated answer | Node, in-process embeddings |
| `/factory-twin` | Smart Tabletop Factory digital twin — PLC I/O model and a 3D cell view | browser |
| `/robot` | SLAM / maze navigation replay | browser |
| `/notes` | Long-form technical write-ups, editable with an admin token | server |

The privacy claim on `/scene` is load-bearing and worth stating plainly: camera
frames are never uploaded. Detection runs locally, and only sampled keyframes
are sent for captioning, and only while narration is switched on.

---

## Architecture

One Node process serves the built SPA *and* the API. That is a deliberate
choice, not a shortcut — a single origin means no CORS to configure, no
preflight latency, no split deploy to keep in sync, and one free instance
instead of two.

```
                     ┌──────────────────────────────────────┐
   visitor ────────► │  Render web service (free, 512 MB)   │
                     │                                      │
                     │   express                            │
                     │     ├── /api/chat      ─┐            │
                     │     ├── /api/scene     ─┼─► LLM      │──► Groq        (text, primary)
                     │     ├── /api/medqa     ─┘  transport │──► OpenRouter  (text, fallback)
                     │     ├── /api/notes                   │──► NVIDIA NIM  (vision)
                     │     ├── /api/contact                 │
                     │     └── static app/dist + SPA fallback
                     └──────────────────────────────────────┘
                                     │ optional
                                     ▼
                          scene-api (FastAPI + BLIP)
                          own captioning model, when hosted
```

Every model call goes through **one transport** (`backend/src/services/llm.js`)
speaking the OpenAI wire format. There is no vendor SDK anywhere in this
repository, which is why swapping providers is an environment change rather
than a code change.

```
app/          React 19 + Vite + Tailwind. Feature-sliced: src/features/<feature>/
backend/      Express. config / middleware / services / routes, nothing else.
scene-api/    FastAPI + BLIP captioning service (optional, deployed separately)
training/     MedQA and BLIP fine-tuning pipelines (Colab / vast.ai)
scripts/      dev, preview, smoke, provider probe
docs/         deployment, providers, costs
```

---

## Running it

```bash
cp backend/.env.example backend/.env     # add one API key
(cd app && npm ci) && (cd backend && npm ci)

scripts/dev.sh up          # Vite :3000 + Express :3001, /api proxied
scripts/dev.sh down
```

To reproduce the production topology locally — single origin, built assets,
SPA fallback — which is where deployment-only bugs actually show up:

```bash
scripts/preview.sh         # → http://localhost:3001
```

Verify a deployment, local or live:

```bash
node scripts/smoke.js                            # localhost
node scripts/smoke.js https://your.onrender.com  # production
```

`smoke.js` exits with the number of failed checks, so it drops into CI unchanged.
Checks for optional services (BLIP, MedQA) report `skip` rather than failing — a
free-tier deploy without them is a valid deploy.

### Git LFS is required

The demo videos are stored in Git LFS. Without it, `git clone` gives you
130-byte text pointers and the video demos play nothing:

```bash
git lfs install && git lfs pull
```

The Render build fails loudly on unfetched pointers rather than shipping a
portfolio whose demos are broken.

---

## Model providers

The assistant needs one OpenAI-compatible endpoint. Set two variables:

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
```

`LLM_PROVIDER` indexes a small registry (`backend/src/config/providers.js`)
that supplies the base URL and a model id, so only the key is a secret and the
Render dashboard holds a provider *name* rather than a URL that goes stale.
Explicit `LLM_API_BASE` / `LLM_MODEL` always override the preset — point it at
a self-hosted vLLM or a local Ollama and the registry steps out of the way.

Free tiers churn constantly. Before trusting any model id:

```bash
scripts/probe-providers.sh
```

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for measured latencies and the
specific failure modes each provider has already caused here.

---

## Deploying

Render Blueprint, checked in as `render.yaml`. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Render setup, environment, failure modes
- [docs/PROVIDERS.md](docs/PROVIDERS.md) — free-tier model providers, measured
- [docs/SCENE_API.md](docs/SCENE_API.md) — hosting the BLIP captioning service on a GPU
- [docs/COSTS.md](docs/COSTS.md) — what each piece costs at each tier
