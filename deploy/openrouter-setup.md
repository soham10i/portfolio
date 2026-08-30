# OpenRouter Setup Guide

**Goal:** Get a free/cheap LLM API key for your portfolio.

**Why OpenRouter?**
- Free tier: 200 requests/day on select models
- Pay-as-you-go: ~$0.50–2.00 per million tokens
- One API key accesses 100+ models (Llama, Qwen, Mistral, GPT-4, Claude)
- OpenAI-compatible format — works with your existing code

---

## Step 1: Sign Up

1. Go to [openrouter.ai](https://openrouter.ai)
2. Sign up with GitHub or email
3. Verify email

---

## Step 2: Get API Key

1. Dashboard → **Keys** → **Create Key**
2. Name it `portfolio`
3. Copy the key: `sk-or-v1-xxxxxxxxxx`

---

## Step 3: Add Credits (Optional)

**Free tier:** 200 requests/day on free models (Llama 3.1 8B, Mistral 7B, etc.)

**If you need more:**
- Go to **Credits** → Add $5–10
- Pay with card or crypto
- No minimum, no subscription

---

## Step 4: Configure Your Portfolio

### Local Development

Edit `/Users/sohampatel/workspace/Porfolio/backend/.env`:

```bash
# OpenRouter endpoint
LLM_API_BASE=https://openrouter.ai/api/v1

# Free tier model (200 req/day)
LLM_MODEL=meta-llama/llama-3.1-8b-instruct
LLM_VISION_MODEL=meta-llama/llama-3.2-11b-vision-instruct

# OR: Better quality, still cheap
# LLM_MODEL=qwen/qwen-2.5-14b-instruct
# LLM_VISION_MODEL=qwen/qwen-2.5-vl-7b-instruct

# Your OpenRouter key
LLM_API_KEY=sk-or-v1-your-key-here
```

Then restart:
```bash
cd /Users/sohampatel/workspace/Porfolio/backend
node server.js
```

### Render Production

In your Render dashboard → Environment:

| Key | Value |
|---|---|
| `LLM_API_BASE` | `https://openrouter.ai/api/v1` |
| `LLM_MODEL` | `meta-llama/llama-3.1-8b-instruct` |
| `LLM_VISION_MODEL` | `meta-llama/llama-3.2-11b-vision-instruct` |
| `LLM_API_KEY` | `sk-or-v1-your-key-here` |

---

## Step 5: Test

```bash
# Local test
curl -s http://localhost:3001/api/health
# Expected: {"llm": true, "model": "meta-llama/llama-3.1-8b-instruct", ...}

# Chat test
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, what is your name?", "history": []}'

# MedQA test
curl -s -X POST http://localhost:3001/api/medqa/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "A 45-year-old man has chest pain. First line treatment?",
    "options": {"A": "Aspirin", "B": "Morphine", "C": "Nitroglycerin", "D": "Oxygen"}
  }'
```

---

## Recommended Models on OpenRouter

| Model | Cost | Quality | Free Tier |
|---|---|---|---|
| `meta-llama/llama-3.1-8b-instruct` | Free / cheap | Good | ✅ 200 req/day |
| `qwen/qwen-2.5-14b-instruct` | ~$0.15/M tokens | Very good | ❌ |
| `anthropic/claude-3.5-haiku` | ~$1.00/M tokens | Excellent | ❌ |
| `google/gemini-flash-1.5` | ~$0.15/M tokens | Very good | ❌ |
| `openai/gpt-4o-mini` | ~$0.15/M tokens | Very good | ❌ |

> **For a portfolio:** Start with `llama-3.1-8b-instruct` (free). Upgrade to `qwen-2.5-14b-instruct` when you need better medical reasoning.

---

## Cost Estimates on OpenRouter

| Usage | Model | Monthly Cost |
|---|---|---|
| Light (100 requests) | Llama 3.1 8B | **$0** (free tier) |
| Moderate (1,000 requests) | Llama 3.1 8B | **~$2–5** |
| Heavy (10,000 requests) | Qwen 2.5 14B | **~$15–25** |

---

## Troubleshooting

### "401 Unauthorized"
**Cause:** Invalid API key.  
**Fix:** Check your key in OpenRouter dashboard. Keys start with `sk-or-v1-`.

### "429 Rate Limited"
**Cause:** Free tier exceeded (200 req/day).  
**Fix:** Wait 24 hours, or add $5 credit to your OpenRouter account.

### "Model not found"
**Cause:** Incorrect model ID.  
**Fix:** Use the exact model slug from [openrouter.ai/models](https://openrouter.ai/models). Include the provider prefix (e.g., `meta-llama/`, `qwen/`).

---

## Alternative: Groq (Faster, Free Tier)

If OpenRouter is slow, try **Groq** — they have the fastest inference on the planet.

1. Sign up at [groq.com](https://groq.com)
2. Get API key
3. Set:
   ```
   LLM_API_BASE=https://api.groq.com/openai/v1
   LLM_MODEL=llama-3.1-8b-instant
   LLM_API_KEY=gsk_your_key
   ```

Groq free tier: ~1,000,000 tokens/day. Plenty for a portfolio.
