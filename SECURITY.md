# Security review

Findings from a pass over the whole codebase and the deployment configuration,
with what was done about each. Severity is judged against a public deploy —
several of these are harmless on localhost and serious the moment the site is
reachable from the internet.

## Fixed

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | **High** | `backend/Dockerfile` ran `COPY backend/.env ./`, baking the API key and `ADMIN_TOKEN` into an image layer. Anyone able to pull the image could recover them with `docker history`. | Line removed. Secrets are passed at run time only. `.dockerignore` now excludes `**/.env` so a secret cannot even enter the build context. |
| 2 | **High** | Rate limiting keyed on `req.ip` without `trust proxy`. Behind Fly or Render that is the proxy's address, so every visitor shared one bucket — one caller could lock out the whole site, and per-IP limits were meaningless. | `app.set('trust proxy', 1)`. |
| 3 | **Medium** | CORS defaulted to `origin: true`, reflecting **any** origin, in production as well as development. Any website could call this API from a visitor's browser. | Production defaults to same-origin only. `ALLOWED_ORIGINS` opts specific origins back in. Development still reflects, for the Vite dev server. |
| 4 | **Medium** | No security headers at all: framable (clickjacking), MIME-sniffable, full referrer leakage, no CSP. | `src/middleware/security.js` sets CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS over TLS in production. The CSP allows no external script host — three.js, ONNX Runtime, KaTeX and marked are all served from this origin. |
| 5 | **Medium** | `ADMIN_TOKEN` compared after `padEnd(64)`, which silently ignored everything past the 64th character of a longer token. | Both sides are SHA-256 hashed, then compared with `timingSafeEqual` — equal-length buffers whatever the input, so the constant-time compare is correct and total. |
| 6 | **Medium** | `messages.jsonl` grew without limit. Even rate-limited, one IP can append ~8,600 messages a day — a disk-exhaustion path on a 512 MB instance. | 5 MB ceiling; past it the form fails closed with a clear message. |
| 7 | **Low** | `express.json({ limit: '3mb' })` applied to every route, including chat and contact, which need kilobytes. | Per-route limits: 64 kB chat and contact, 1 MB notes, 3 MB scene (the only route carrying base64 keyframes). |
| 8 | **Low** | `X-Powered-By: Express` advertised the stack. | `app.disable('x-powered-by')`. |
| 9 | **Low** | The Dockerfile ran as root and never copied `backend/notes/`, so the notes API would have returned an empty list in production. | Runs as the unprivileged `node` user; notes are copied; a `HEALTHCHECK` is defined. |

## Verified, no change needed

- **Path traversal on notes.** `/api/notes/:slug` is the only route that
  interpolates user input into a filesystem path, and the slug must match
  `^[a-z0-9][a-z0-9-]{1,63}$`. Tested with `..%2f..%2fserver` and
  `../server.js` on both GET and DELETE — both rejected before touching disk.
- **Secrets in git.** No `.env` is tracked and none appears in history; a scan
  for Google, OpenAI and Hugging Face key patterns across all tracked files
  found nothing.
- **Visitor video and camera frames.** These never reach the server. Detection
  is entirely in-browser; only sampled keyframes are posted, and only while
  narration is enabled.

## Accepted limitations, stated rather than hidden

- **Rate limiting is per process, in memory.** Correct for a single instance,
  which is what this deploys as. More than one instance would need Redis; that
  is a documented boundary, not an oversight.
- **Notes are rendered with `dangerouslySetInnerHTML`.** They are authored only
  by the `ADMIN_TOKEN` holder and carry inline SVG figures by design. If that
  token leaked, stored XSS would be possible — so the token is the security
  boundary, and it should be a long random value, not a memorable one.
- **The contact mailbox is a file on the instance's disk.** On Fly or Render's
  ephemeral filesystem it does not survive a redeploy. Acceptable for a
  portfolio; a real mailbox would forward to email.
- **The Dockerfile is unbuilt.** There was no Docker daemon available in the
  environment where these changes were made, so it is reviewed but not
  executed. Build it once before relying on it.
