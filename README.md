# Soham Patel — Portfolio

A portfolio that runs its own demos. Object detection runs in the visitor's
browser, the digital twin steps a live simulation, and the assistant streams
answers from a hosted model. Nothing here is a screenshot of something that
once worked.

**Live site:** [www.sohampatel.dev](https://www.sohampatel.dev)

> The site runs on Google Cloud Run and scales to zero when idle, so the first
> visit after a quiet period can take a few seconds to wake up.

---

## Contents

- [What's on the site](#whats-on-the-site)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [How it fits together](#how-it-fits-together)
- [Model providers](#model-providers)
- [Deploying](#deploying)
- [Further documentation](#further-documentation)

---

## What's on the site

| Page | What it does | Where it runs |
|---|---|---|
| `/` | The portfolio, with **Nexus**, an assistant that answers questions about my work from the facts on the site | Model call on the server |
| `/scene` | **SceneLab**: YOLOv8n-seg object detection on a webcam or an uploaded clip, keyframe captions, and Q&A over what was seen | Detection in the **browser** (ONNX Runtime Web); captions on the server |
| `/medqa` | Medical question answering with retrieval, plus a check that the answer is supported by the sources | Node, in-process embeddings |
| `/project/:id` | Project write-ups, including the Smart Tabletop Factory digital twin ([code](https://github.com/soham10i/stf-hw)) | Browser + Cloud Run |
| `/robot` | SLAM and maze-navigation replay | Browser |
| `/notes`, `/blog` | Long-form technical write-ups (notes are editable with an admin token) | Server |

**Privacy on `/scene`:** camera frames are never uploaded. Detection runs
locally. Only sampled keyframes are sent for captioning, and only while
narration is switched on.

---

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind, GSAP, Lenis |
| Backend | Node 22, Express |
| In-browser ML | ONNX Runtime Web (YOLOv8n-seg) |
| Models | Groq (text), OpenRouter (text fallback), NVIDIA NIM (vision), ElevenLabs (voice) |
| Storage | Supabase (chat history, saved scenes) |
| Optional service | FastAPI + BLIP captioning (`scene-api/`) |
| Hosting | Docker image on Google Cloud Run (a Render blueprint is also included) |

---

## Quick start

**Requirements:** Node 22, npm, and [Git LFS](https://git-lfs.com) (the demo
videos are stored in LFS).

```bash
git lfs install && git lfs pull          # fetch the demo videos
cp backend/.env.example backend/.env     # then add at least one API key
(cd app && npm ci) && (cd backend && npm ci)
```

Start the dev servers (Vite on `:3000`, Express on `:3001`, `/api` proxied):

```bash
scripts/dev.sh up
```

Stop them:

```bash
scripts/dev.sh down
```

Run the production setup locally (one origin, built assets). This is where
deployment-only bugs show up:

```bash
scripts/preview.sh       # → http://localhost:3001
```

Check a running deployment, local or live:

```bash
node scripts/smoke.js                           # localhost
node scripts/smoke.js https://www.sohampatel.dev
```

`smoke.js` exits with the number of failed checks, so it works in CI as is.
Optional services (BLIP, MedQA) report `skip` instead of failing.

> **Without Git LFS** the videos are 130-byte text pointers and the video demos
> play nothing. The build checks for this and fails loudly.

---

## Project layout

```
app/          React frontend, organised by feature: src/features/<feature>/
backend/      Express API: config / middleware / services / routes
scene-api/    FastAPI + BLIP captioning service (optional, deployed separately)
training/     MedQA and BLIP fine-tuning pipelines (Colab / vast.ai)
scripts/      dev, preview, smoke test, provider probe
docs/         deployment, providers, costs
nexus/        A separate project developed here for now; see nexus/README.md
```

---

## How it fits together

One Node process serves both the built frontend and the API. One origin means
no CORS setup, no preflight latency and no split deploy to keep in sync.

```
visitor ──► Express (one container)
              ├── /api/chat     ─┐
              ├── /api/scene    ─┼─► LLM transport ──► Groq        (text)
              ├── /api/medqa    ─┘                 ──► OpenRouter  (text fallback)
              ├── /api/tts                         ──► NVIDIA NIM  (vision)
              ├── /api/notes
              ├── /api/contact
              └── static app/dist + SPA fallback
                        │ optional
                        ▼
              scene-api (FastAPI + BLIP captioning)
```

Every model call goes through one transport,
[`backend/src/services/llm.js`](backend/src/services/llm.js), which speaks the
OpenAI wire format. There is no vendor SDK in the repo, so switching providers
is a config change, not a code change.

---

## Model providers

The assistant needs one OpenAI-compatible endpoint. Two variables are enough:

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
```

- `LLM_PROVIDER` picks a preset from
  [`backend/src/config/providers.js`](backend/src/config/providers.js), which
  supplies the base URL and model id. Only the key is a secret.
- `LLM_API_BASE` and `LLM_MODEL` override the preset, for example to point at a
  self-hosted vLLM or a local Ollama.

Free tiers change often. Check which model ids still answer before relying on
them:

```bash
scripts/probe-providers.sh
```

Measured latencies and known failure modes are in
[docs/PROVIDERS.md](docs/PROVIDERS.md).

---

## Deploying

**Google Cloud Run (live).** [`cloudbuild.yaml`](cloudbuild.yaml) builds one
image from [`backend/Dockerfile`](backend/Dockerfile) (frontend + API) and
pushes it to Artifact Registry in `europe-west1`. API keys come from Secret
Manager and are never set as plain environment variables. The exact deploy
command is in the header of `cloudbuild.yaml`.

**Render (alternative).** [`render.yaml`](render.yaml) is a Render Blueprint
for a single web service. Step-by-step setup is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Further documentation

| Document | Covers |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Setup, environment variables, failure triage |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Free-tier model providers, measured |
| [docs/SCENE_API.md](docs/SCENE_API.md) | Hosting the BLIP captioning service on a GPU |
| [docs/COSTS.md](docs/COSTS.md) | What each piece costs at each tier |
