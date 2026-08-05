# 🤖 Chatbot Setup Guide

## What You Just Got

A fully functional AI assistant for your portfolio, powered by **Google Gemini 2.5 Flash** with complete RAG (Retrieval-Augmented Generation) — it knows your entire resume, all 7 projects, your work experience, skills, and education.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Backend (Node)  │────▶│  Gemini API     │
│   (React/Vite)  │◀────│  Express + CORS  │◀────│  (Google AI)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
   Port 3000                Port 3001
```

**In production:** The backend serves both the API and the static frontend from a single server.

## Step 1: Get Your Gemini API Key (FREE)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Copy the key (starts with `AIza...`)
4. Paste it in `/Users/sohampatel/workspace/Porfolio/backend/.env`:

```bash
cd /Users/sohampatel/workspace/Porfolio/backend
echo "GEMINI_API_KEY=your_actual_key_here" > .env
```

> 💡 **Gemini 2.5 Flash free tier:** 1,500 requests/day, 1M tokens/minute. More than enough for a portfolio.

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
echo "GEMINI_API_KEY=your_key" > .env

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
6. Add environment variable: `GEMINI_API_KEY`

### Railway ($5/month free credit)
1. Push to GitHub
2. Deploy the `backend/` folder
3. Add `GEMINI_API_KEY` as environment variable
4. The `npm start` command handles everything

## Files Created/Modified

| File | Purpose |
|------|---------|
| `backend/server.js` | Express server with Gemini API integration |
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

All of this is embedded in the prompt — no vector DB needed. Gemini's 1M token window handles it easily.

## Customizing the Personality

Edit `/Users/sohampatel/workspace/Porfolio/backend/server.js` and modify the `SYSTEM_PROMPT` constant near the top. Look for the "RESPONSE GUIDELINES" section.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Gemini API key not configured" | Add `.env` file with `GEMINI_API_KEY=...` in `backend/` |
| CORS errors in browser | Backend CORS is enabled by default; check port 3001 is running |
| "Empty response from Gemini" | Usually a safety filter; check the prompt isn't blocked |
| Chat button not showing | Check browser console for errors; verify build succeeded |
