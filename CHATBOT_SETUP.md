# 🤖 Chatbot Setup Guide

## What You Just Got

A fully functional AI assistant for your portfolio, powered by a **self-hosted LLM** (any OpenAI-compatible endpoint) with complete RAG (Retrieval-Augmented Generation) — it knows your entire resume, all 7 projects, your work experience, skills, and education.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Backend (Node)  │────▶│  Your LLM (/v1) │
│   (React/Vite)  │◀────│  Express + CORS  │◀────│  (Google AI)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
   Port 3000                Port 3001
```

**In production:** The backend serves both the API and the static frontend from a single server.

## Step 1: Point the Backend at a Model

There is no third-party AI vendor in this project. The backend talks to **any
OpenAI-compatible `/chat/completions` endpoint**, so the model can be one you
run yourself.

**Fastest path — Ollama on the Mac:**

```bash
ollama pull qwen2.5:7b-instruct     # chat, summaries, Q&A
ollama pull qwen2.5vl:7b            # frame captions (or moondream / gemma3:4b / qwen3-vl:4b)
ollama serve                        # exposes http://127.0.0.1:11434/v1

cd /Users/sohampatel/workspace/Porfolio/backend
cat > .env <<'ENV'
PORT=3001
LLM_API_BASE=http://127.0.0.1:11434/v1
LLM_MODEL=qwen2.5:7b-instruct
LLM_VISION_MODEL=qwen2.5vl:7b
ENV
```

`GET /api/health` reports which models are wired up. If `LLM_API_BASE` is
unset, chat and narration return **503 with an honest message** rather than
pretending to work.

> The same four variables point at vLLM, llama.cpp `--server`, LM Studio, a
> Hugging Face Inference Endpoint, or any hosted OpenAI-compatible gateway.
> Swapping the model is an env change, not a code change.

## Step 2: Run Locally

**Terminal 1 — Backend:**
```bash
cd /Users/sohampatel/workspace/Porfolio/backend
npm start
```

**Terminal 2 — Frontend (dev mode with API proxy):**
```bash
cd /Users/sohampatel/workspace/Porfolio/app
npm run dev
```

Open http://localhost:3000 and test the chatbot (bottom-right corner).

## Step 3: Production Deploy (One-Server Setup)

Build the frontend, then run the backend which serves both:

```bash
# 1. Build frontend
cd /Users/sohampatel/workspace/Porfolio/app
npm run build

# 2. Set production API key
cd /Users/sohampatel/workspace/Porfolio/backend
echo "LLM_API_BASE=https://<your-model-server>/v1\nLLM_MODEL=qwen2.5-7b-instruct" > .env

# 3. Start server (serves frontend + API)
npm start
```

The server runs on port 3001 and serves:
- `http://localhost:3001/` → Your portfolio (static files)
- `http://localhost:3001/api/chat` → Chatbot API
- `http://localhost:3001/api/health` → Health check

## Deploy to Render/Railway/Fly.io

### Render (Free tier available)
1. Push to GitHub
2. Create a new Web Service on Render
3. Root directory: `backend/`
4. Build command: `cd ../app && npm install && npm run build`
5. Start command: `node server.js`
6. Add environment variables: `LLM_API_BASE`, `LLM_MODEL`, `LLM_VISION_MODEL` (a laptop Ollama is not reachable from Render — use a hosted endpoint)

### Railway ($5/month free credit)
1. Push to GitHub
2. Deploy the `backend/` folder
3. Add `LLM_API_BASE` / `LLM_MODEL` / `LLM_VISION_MODEL` as environment variables
4. The `npm start` command handles everything

## Files Created/Modified

| File | Purpose |
|------|---------|
| `backend/server.js` | Express server; one `callLLM()` transport for chat, captions, summaries and Q&A |
| `backend/package.json` | Backend dependencies (Express, CORS, dotenv) |
| `backend/.env.example` | API key template |
| `app/src/components/Chatbot.tsx` | Frontend chat widget (updated to call API) |
| `app/vite.config.ts` | Added proxy for `/api` → `localhost:3001` |

## What the Chatbot Knows

The system prompt includes your complete portfolio:
- **Personal:** Name, education (3 degrees), location, contact
- **Experience:** 4 roles (Altera, Electrum, Promact, OTH TA) with full details
- **Projects:** All 7 projects with tech stacks, timelines, outcomes
- **Skills:** 40+ skills with proficiency levels
- **Research:** AI Conference talk on Cor2Vox

All of this is embedded in the system prompt — no vector DB needed. It is ~6k tokens, so any 8k-context model handles it; 32k gives comfortable room for conversation history.

## Customizing the Personality

Edit `/Users/sohampatel/workspace/Porfolio/backend/server.js` and modify the `SYSTEM_PROMPT` constant near the top. Look for the "RESPONSE GUIDELINES" section.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 503 "Chat is not configured" | Add `LLM_API_BASE=...` to `backend/.env` and restart |
| CORS errors in browser | Backend CORS is enabled by default; check port 3001 is running |
| 502 from `/api/chat` | Model server reachable but erroring — check its own log and that `LLM_MODEL` matches a model it has loaded |
| Captions say "no captioning engine" | Neither `SCENE_API_BASE` nor `LLM_API_BASE` is answering; detection still runs locally in the browser |
| Chat button not showing | Check browser console for errors; verify build succeeded |
