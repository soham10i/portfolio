# Deployment

One Render free web service runs the whole site: a single Node process serving
the built SPA and the API from the same origin. The optional BLIP captioning
service (`scene-api/`) is separate and needs a GPU — see
[SCENE_API.md](SCENE_API.md).

## First deploy

1. **Push the repo to GitHub** with LFS objects intact. Confirm before pushing:

   ```bash
   git lfs ls-files          # six .mp4 files, each with a *
   ```

2. **Render Dashboard → Blueprints → New Blueprint** → connect the repo.
   `render.yaml` at the root is detected automatically; it defines the service,
   the build, the health check and every environment variable.

3. **Fill in the three secrets** Render prompts for (they are `sync: false` in
   the blueprint, so they are never in the repository):

   | Variable | Where to get it |
   |---|---|
   | `GROQ_API_KEY` | https://console.groq.com/keys |
   | `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
   | `NVIDIA_API_KEY` | https://build.nvidia.com |

   `SCENE_API_BASE` and `ALLOWED_ORIGINS` are left blank on purpose. See
   [PROVIDERS.md](PROVIDERS.md) for why these three vendors.

4. **Verify**, rather than clicking around:

   ```bash
   node scripts/smoke.js https://<your-service>.onrender.com
   ```

   Twelve checks, exit code is the failure count. Optional services report
   `skip`, not `fail`.

## What the build does

```
app:      npm ci --include=dev && npm run build     # devDeps needed: vite, tsc
backend:  npm ci --omit=dev                         # ships without them
verify:   app/dist/index.html exists
          no .mp4 is an unfetched LFS pointer
start:    node backend/server.js
```

The LFS check is there because the failure it catches is invisible: an
unfetched pointer is a valid 130-byte file that Express serves happily with a
`video/mp4` content type, and the visitor sees a dead player. Better a failed
deploy than a portfolio whose demos do not play.

## Environment

Everything the process reads is in `backend/src/config/index.js`, and nothing
else in the codebase touches `process.env`. `backend/.env.example` is the
annotated template.

The site runs with **no** model configured — `/api/chat` answers 503 with an
honest message and every other route works. That is intentional: a missing key
must never take the portfolio down.

| Variable | Default | Effect if unset |
|---|---|---|
| `LLM_PROVIDER` + its key | — | chat, SceneLab summaries and MedQA generation return 503 |
| `LLM_FALLBACK_PROVIDER` + its key | — | a 429 from the primary is fatal for that request |
| `LLM_VISION_PROVIDER` + its key | inherits text | keyframe captioning falls back to the text provider |
| `MEDQA_ENABLED` | `true` | — |
| `SCENE_API_BASE` | — | SceneLab captions with the vision model; detection unaffected |
| `ADMIN_TOKEN` | generated | notes are read-only |
| `ALLOWED_ORIGINS` | — | same-origin only in production, which is correct here |

## Free-tier realities

**Cold starts.** A free instance spins down after ~15 minutes idle and takes
30–60 s to answer the first request. An evaluator opening the link cold sees a
blank page for most of a minute. Mitigations, in order of honesty: warm it with
an external uptime pinger before you send the link; or accept it and say so.
`server.js` handles `SIGTERM` by draining connections, so a spin-down mid-answer
does not truncate a reply.

**512 MB of RAM.** The largest allocation in the process is the MedQA
embedder, loaded lazily on the first `/api/medqa/*` request and held after. If
the instance starts OOM-restarting under load, set `MEDQA_ENABLED=false` — the
rest of the site keeps working and that route returns a clear 503.

**Ephemeral disk.** `backend/notes/` and `backend/messages.jsonl` are written
to a filesystem that is discarded on every deploy and every spin-down. Contact
messages submitted through the site do not survive. If they need to, they must
go somewhere off-box — a database or a webhook — and that is not built.

**No LFS quota concern.** ~25 MB of video against GitHub's 1 GB free LFS
bandwidth per month is roughly 40 builds. Not a limit worth engineering around.

## Failure triage

Read the boot banner first; it prints exactly what is and is not configured.

| Symptom | Cause |
|---|---|
| every route 404s, including `/api/health` | the service is not running — check the build log |
| the SPA loads, `/api/chat` returns 503 | no `LLM_PROVIDER`/`LLM_API_BASE`, or the key is empty |
| `/api/chat` returns 502 | the provider answered an error; the log line carries its message |
| chat is fine, then dies for the rest of the day | free-tier quota exhausted; the fallback vendor is not configured |
| video players are blank | LFS pointers were served — the build check should have caught this |
| `/scene` says no captioning engine | no vision provider and no `SCENE_API_BASE` |
| instance restarts under load | MedQA embedder plus traffic exceeding 512 MB; set `MEDQA_ENABLED=false` |

## Deploying elsewhere

Nothing here is Render-specific except `render.yaml`. The process needs Node 22,
`PORT` from the environment, and `app/dist` built next to `backend/`.
`backend/Dockerfile` and `docker-compose.yml` cover the container path, and the
compose file also brings up `scene-api` locally for the full stack.
