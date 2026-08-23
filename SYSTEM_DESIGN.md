# Soham Patel Portfolio — System Design

A single-page portfolio with three interactive engineering demos and an
LLM-backed assistant. React + TypeScript + Vite on the front, a small Express
service on the back.

This document describes what is actually in the repository. If you change the
architecture, change this file in the same commit.

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | React 19 + Vite 7 | SPA, built with `tsc -b && vite build` |
| Language | TypeScript 5 | Strict project references |
| Styling | Tailwind CSS 3.4 | Custom design tokens in `src/index.css`; no component library |
| Routing | React Router 7 | `BrowserRouter`, five routes plus a catch-all |
| Animation | Framer Motion (factory demo), CSS keyframes elsewhere | GSAP was removed with the old sections |
| 3D | Three.js r147 loaded at runtime | Vendored in `public/vendor/`, unpkg as fallback |
| Icons | lucide-react | |
| Backend | Express 4 | `backend/server.js`, ~450 lines, no framework beyond Express |
| LLM | Google Gemini 2.5 Flash | Direct REST call, streaming via SSE |
| Deployment | Render (single service) | Express serves the built SPA from `app/dist` |

The runtime dependency list is deliberately small — six packages. Anything that
is not imported by `src/` should not be in `package.json`.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                          BROWSER                               │
│                                                                │
│  Home (/)            ProjectDetail (/project/:id)              │
│  FactoryDemo (/factory)                                        │
│  FactoryTwin3D (/factory-twin)   ─┐  lazy-loaded, each pulls   │
│  AutonomousRobot (/robot)        ─┘  the Three.js engine       │
│  NotFound (*)                                                  │
│                                                                │
│  ChatPanel — lazy-loaded, opens on demand                      │
└────────────────────────────────────────────────────────────────┘
                            │
                            │  POST /api/chat/stream  (SSE)
                            │  POST /api/contact
                            ▼
┌────────────────────────────────────────────────────────────────┐
│                    EXPRESS (backend/server.js)                 │
│                                                                │
│  rate limit (30 req / 5 min / IP, in-memory)                   │
│  validation  →  token budgeting  →  Gemini 2.5 Flash           │
│  contact     →  Resend email + local .jsonl log                │
│  static      →  serves ../app/dist, SPA fallback to index.html │
└────────────────────────────────────────────────────────────────┘
```

There is **no vector store and no embedding step**. The assistant's knowledge is
a single hand-written system prompt constant in `backend/server.js`. This is a
deliberate trade: the corpus is one person's résumé, it fits comfortably in
context, and it costs nothing to operate. Do not describe this as RAG.

---

## Directory structure

```
app/
├── public/
│   ├── factory-twin-3d.js      # <factory-twin-3d> custom element
│   ├── webots-world-3d.js      # <webots-world-3d> custom element
│   ├── vendor/                 # three.min.js, OrbitControls.js
│   ├── videos/                 # demo recordings (large — see Known issues)
│   ├── worlds/                 # maze world JSON for the robot sim
│   ├── og-image.png            # 1200×630 social card
│   ├── robots.txt
│   └── sitemap.xml
├── src/
│   ├── App.tsx                 # routes
│   ├── main.tsx                # entry, Lenis smooth scroll, ThemeProvider
│   ├── index.css               # design tokens, both themes, glass material
│   ├── pages/                  # Home, ProjectDetail, FactoryDemo,
│   │                           #   FactoryTwin3D, AutonomousRobot, NotFound
│   ├── components/             # SiteHeader, SiteBackground, ChatPanel,
│   │                           #   MarkdownText, FactoryTwin, MazeWorld,
│   │                           #   CellDiagram, ThemeProvider
│   ├── lib/                    # palettes, twin (engine loaders), lenis, markdown
│   └── data/                   # portfolio.ts (all content), twinDetail.ts
└── index.html                  # meta, OG/Twitter cards, JSON-LD, theme bootstrap

backend/
├── server.js                   # the whole API
├── Dockerfile
└── package.json
```

All page content lives in `src/data/portfolio.ts`. Adding a project means
editing that file, not writing a component.

---

## Design system

Defined entirely as CSS custom properties in `src/index.css`.

- **Two themes.** `:root` and `[data-theme="dark"]` carry the dark values so the
  first paint is never colourless; `[data-theme="light"]` overrides. An inline
  script in `index.html` sets the attribute before first paint, which is what
  prevents the flash of wrong theme.
- **Four swappable palettes** (`src/lib/palettes.ts`), persisted to
  `localStorage` and applied by rewriting the `--p` / `--s` / `--a` tokens.
- **Glass material.** A set of `--glass-*` tokens — tint, hairline, specular
  rim, two shadows, and an opaque fallback. Dark mode tints with the navy
  surface rather than white, which is what stops it looking grey.
- Primary/secondary/accent pairs are chosen to hold WCAG AA (4.5:1) against both
  the page background and the lightened glass surface.

---

## Chat assistant

**Personality and knowledge**: one `SYSTEM_PROMPT` constant. It covers
education, four roles, seven projects, skills, and response-length rules.

**Token budgeting** (`budgetFor`): the prompt classifies the incoming message as
a greeting, a reasoning-heavy question, a depth request, or a plain factual
question, and sets `maxOutputTokens` and `thinkingBudget` accordingly. Gemini
2.5 Flash counts thinking tokens against `maxOutputTokens`, so the cap always
includes the thinking budget — getting this wrong returns an empty response with
`finishReason: MAX_TOKENS`. The non-streaming endpoint retries once with
thinking disabled if that happens.

**Streaming**: `/api/chat/stream` proxies Gemini's SSE frames and re-emits them
as `{delta}` / `{done}` / `{error}` events. `/api/chat` is the non-streaming
equivalent, kept for compatibility.

**Safety and limits**: 30 requests per 5 minutes per IP (in-memory, so it resets
when the instance restarts), 4,000 characters per message, 20 messages of
history, 30-second upstream timeout, four Gemini safety categories at
`BLOCK_MEDIUM_AND_ABOVE`. The API key travels in the `x-goog-api-key` header,
never in the URL, so it stays out of request logs.

---

## Contact form

`POST /api/contact` validates the payload, appends it to `backend/messages.jsonl`
as a local convenience log, then delivers it by email through Resend.

The disk is ephemeral on Render — every redeploy and idle spin-down wipes it —
so the email is the only real delivery path. When `RESEND_API_KEY` is unset the
endpoint returns `{ok: true, delivered: false}` and the UI tells the sender to
email directly instead of claiming the message arrived.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | for chat | Gemini REST auth |
| `RESEND_API_KEY` | for contact | Transactional email; without it the form reports non-delivery |
| `CONTACT_TO` | no | Recipient address (defaults to Soham's) |
| `CONTACT_FROM` | no | Verified sender domain |
| `ALLOWED_ORIGINS` | production | Comma-separated CORS allowlist; open when unset |
| `PORT` | no | Defaults to 3001 |
| `VITE_CHAT_API_BASE` | no | Front-end API base; defaults to `/api` |

---

## Build and performance

`npm run build` in `app/` produces roughly:

| Asset | Raw | Gzip |
|---|---|---|
| Initial JS | 471 KB | 148 KB |
| CSS | 45 KB | 9 KB |
| ChatPanel (lazy) | 12 KB | 4 KB |
| Each 3D viewer (lazy) | 14–16 KB | 4–5 KB |

The 3D viewers and the chat panel are route- and interaction-split so they stay
out of the initial payload. Three.js itself is never bundled — the custom
elements fetch it at runtime only when a viewer mounts.

---

## Known issues

- **Video weight.** `app/public/videos/` holds ~25 MB of mp4 committed to git,
  which is most of the repository's size. These should be re-encoded and moved
  to a CDN or Git LFS.
- **No tests, no CI.** Neither the front-end nor the Express service has a test
  suite or a build check on push.
- **No résumé PDF.** `public/` has no `resume.pdf`, so the site cannot offer the
  download a portfolio of this kind is expected to have.
- **Rate limiting is per-instance.** In-memory buckets reset on restart, which
  on Render's free tier happens often.
