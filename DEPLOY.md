# Deploying

One process serves the built frontend *and* the API, so there is nothing to
configure between them — no CORS, no proxy, no second service. That is the
whole reason for this shape.

## Before the first deploy

```bash
cd app && npm ci && npm run build     # must be clean
cd ../backend && npm ci --omit=dev
NODE_ENV=production node server.js    # boot log states CORS and model status
```

The production boot log must say `🌐 CORS: same-origin only`. If it says
`any origin (dev)`, `NODE_ENV` did not reach the process — fix that before
going public, or any website can call this API from a visitor's browser.

## The one real decision: where the language model lives

The backend speaks OpenAI's `/chat/completions` to whatever `LLM_API_BASE`
names. On your Mac that is Ollama at `127.0.0.1:11434/v1`. **A cloud instance
cannot reach your Mac**, so there are three options and they are not equal:

| Option | Cost | What a visitor gets |
|---|---|---|
| **Ship with no LLM** | £0 | Detection, keyframes, detector-written descriptions and clip summaries all work. Chat and Q&A return an honest 503. |
| Hosted OpenAI-compatible endpoint | ~£0–20/mo | Everything works. Set `LLM_API_BASE`, `LLM_MODEL`, `LLM_VISION_MODEL`, `LLM_API_KEY`. |
| Small GPU box running vLLM | £30+/mo | Everything works, and it is genuinely *your* deployment — the strongest version for a CV. |

Option 1 is a legitimate launch state, not a broken one: the scene demo falls
back to detector-only narration and says so on the page. **Do not block the
deploy on the model.** A live site with an honest 503 on the chatbot beats a
perfect site nobody can reach.

## Render

Root directory `backend/`.

- Build: `cd ../app && npm ci && npm run build && cd ../backend && npm ci --omit=dev`
- Start: `node server.js`

| Key | Notes |
|---|---|
| `NODE_ENV` | `production` — required, or CORS stays open |
| `ADMIN_TOKEN` | notes editing; omit to make the notes section read-only |
| `LLM_API_BASE` | omit to launch without a model (see above) |
| `LLM_MODEL`, `LLM_VISION_MODEL`, `LLM_API_KEY` | only alongside `LLM_API_BASE` |
| `ALLOWED_ORIGINS` | leave unset — same-origin is what a single service wants |
| `SCENE_API_BASE` | only if the FastAPI + BLIP service is hosted |

Free tier sleeps after 15 minutes idle; the first request then takes ~10 s.

## Fly

```bash
fly launch --name <name> --region fra     # dockerfile = backend/Dockerfile
fly secrets set NODE_ENV=production ADMIN_TOKEN=...
fly deploy
```

The Dockerfile passes secrets at run time only (never baked into a layer),
runs as the unprivileged `node` user, and has a `HEALTHCHECK` on
`/api/health`. It has **not been built yet** — build it once locally before
relying on it.

## Payload

`app/public` carries ~36 MB that must ship: the vendored three.js and ONNX
Runtime (13 MB), the YOLOv8n-seg weights (14 MB), and the maze recordings
(9 MB). None of it downloads until a visitor opens the page that needs it —
the model only on `/scene`, a clip only when its tab is opened
(`preload="metadata"`, with a poster frame so the panel is never blank).

The uncompressed source clips are kept in `app/public/videos/_orig/`.
**Do not commit that folder** — nothing serves it, and it is 49 MB.

## After deploying

```bash
curl -s https://<host>/api/health          # llm true/false, models named
curl -s https://<host>/api/scene/status    # which captioner, if any
curl -sI https://<host>/ | grep -i strict-transport   # HSTS, TLS only
```

Then open `/`, `/robot`, `/scene`, `/notes` and confirm no console errors.

## Security

`SECURITY.md` lists the nine findings that were fixed and the limits that were
accepted. The two that matter on a public deploy: `NODE_ENV=production` must
be set, and `ADMIN_TOKEN` must be a long random value — if it leaks, notes are
rendered as HTML and stored XSS becomes possible.
