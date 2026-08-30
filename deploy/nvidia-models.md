# NVIDIA NIM API — Model Selection Guide

Available models on NVIDIA's free tier for portfolio use.

---

## 🏆 Recommended Models by Use Case

### Text Generation (Chat, MedQA, Summarisation)

| Model | Size | Context Window | Strengths | Free Tier Limit |
|---|---|---|---|---|
| `meta/llama-3.1-8b-instruct` | 8B | 128K tokens | Fast, efficient, good balance | ~1,000 req/day |
| `meta/llama-3.1-70b-instruct` | 70B | 128K tokens | **Best reasoning**, medical accuracy | ~100 req/day |
| `nvidia/nemotron-4-340b-instruct` | 340B | 4K tokens | State-of-the-art reasoning | ~50 req/day |
| `mistralai/mistral-7b-instruct-v0.2` | 7B | 32K tokens | Long context, good instruction following | ~1,000 req/day |
| `mistralai/mixtral-8x7b-instruct-v0.1` | 47B (MoE) | 32K tokens | Strong reasoning, efficient MoE | ~100 req/day |

**Recommendation for MedQA:**
- **Default:** `meta/llama-3.1-8b-instruct` (fast, good enough)
- **Better accuracy:** `meta/llama-3.1-70b-instruct` (slower but smarter)
- **Maximum accuracy:** `nvidia/nemotron-4-340b-instruct` (slowest, best reasoning)

### Vision-Language (SceneLab Image Understanding)

| Model | Size | Vision | Strengths | Free Tier Limit |
|---|---|---|---|---|
| `meta/llama-3.2-11b-vision-instruct` | 11B | ✅ | Fast vision + text | ~500 req/day |
| `meta/llama-3.2-90b-vision-instruct` | 90B | ✅ | **Best vision understanding** | ~50 req/day |

**Recommendation:**
- **Default:** `meta/llama-3.2-11b-vision-instruct`
- **Better scene understanding:** `meta/llama-3.2-90b-vision-instruct`

### Embeddings (MedQA RAG Retrieval)

| Model | Dimensions | Strengths | Free Tier Limit |
|---|---|---|---|
| `nvidia/nv-embedqa-e5-v5` | 1024 | Optimized for QA retrieval | ~1,000 req/day |
| `nvidia/llama-3.2-nv-embedqa-1b-v2` | 2048 | Higher quality embeddings | ~500 req/day |

**Note:** Your current MedQA uses `Xenova/all-MiniLM-L6-v2` (local, 384-dim). Switching to NVIDIA embeddings requires code changes.

---

## 📊 Context Window Comparison

```
Llama 3.1 (8B/70B)  ├────────────────────────────────────────────────┤ 128K tokens
Mistral (7B)          ├────────────────────┤ 32K tokens
Nemotron 340B         ├────────┤ 4K tokens
Mixtral 8x7B          ├────────────────────┤ 32K tokens

Your current MedQA context:
  - System prompt: ~200 tokens
  - Retrieved evidence (5 docs): ~500 tokens
  - Question + options: ~100 tokens
  - Response: ~200 tokens
  - Total per request: ~1,000 tokens

All models handle this easily. Context window only matters for:
  - Very long medical case studies
  - Multi-turn conversations with full history
  - SceneLab summarisation with many keyframes
```

---

## ⚡ Speed vs Accuracy Trade-off

| Model | Latency (per request) | Medical Accuracy | Best For |
|---|---|---|---|
| Llama 3.1 8B | ~300ms | ⭐⭐⭐ | Fast chat, general QA |
| Llama 3.1 70B | ~800ms | ⭐⭐⭐⭐⭐ | MedQA, complex reasoning |
| Nemotron 340B | ~2s | ⭐⭐⭐⭐⭐ | Maximum accuracy, slow |
| Mixtral 8x7B | ~600ms | ⭐⭐⭐⭐ | Good balance |

---

## 🔧 Configuration Examples

### Option A: Fast & Cheap (Default)
```bash
LLM_API_BASE=https://integrate.api.nvidia.com/v1
LLM_MODEL=meta/llama-3.1-8b-instruct
LLM_VISION_MODEL=meta/llama-3.2-11b-vision-instruct
LLM_API_KEY=nvapi-xxx
```
**Use case:** General chat, MedQA, SceneLab. Fast, good enough accuracy. ~1,000 req/day.

### Option B: High Accuracy MedQA
```bash
LLM_API_BASE=https://integrate.api.nvidia.com/v1
LLM_MODEL=meta/llama-3.1-70b-instruct
LLM_VISION_MODEL=meta/llama-3.2-11b-vision-instruct
LLM_API_KEY=nvapi-xxx
```
**Use case:** When medical accuracy is critical. Slower but significantly better. ~100 req/day.

### Option C: Maximum Capability
```bash
LLM_API_BASE=https://integrate.api.nvidia.com/v1
LLM_MODEL=nvidia/nemotron-4-340b-instruct
LLM_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
LLM_API_KEY=nvapi-xxx
```
**Use case:** Demo days, interviews, when you need to impress. Slowest but smartest. ~50 req/day.

---

## 🧪 Testing Larger Models

```bash
# Test 70B model
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta/llama-3.1-70b-instruct",
    "messages": [{"role": "user", "content": "Explain aspirin mechanism in 2 sentences"}],
    "max_tokens": 100
  }'

# Test 340B model
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/nemotron-4-340b-instruct",
    "messages": [{"role": "user", "content": "Explain aspirin mechanism in 2 sentences"}],
    "max_tokens": 100
  }'
```

---

## ⚠️ Free Tier Limits by Model Size

| Model Size | Approx. Free Requests/Day | Rate Limit |
|---|---|---|
| 8B | ~1,000 | 20/min |
| 11B (vision) | ~500 | 10/min |
| 70B | ~100 | 5/min |
| 90B (vision) | ~50 | 3/min |
| 340B | ~50 | 3/min |

> **Strategy:** Use 8B for general traffic, route difficult MedQA questions to 70B.

---

## 🎯 My Recommendation for Your Portfolio

**Phase 1 (Now):** Use `meta/llama-3.1-8b-instruct` for everything.
- Fast enough for good UX
- 1,000 req/day is plenty
- Good medical accuracy

**Phase 2 (Demo/Interview):** Switch to `meta/llama-3.1-70b-instruct`.
- Noticeably better reasoning
- 100 req/day still covers demo traffic
- Impressive to show you use large models

**Phase 3 (After fine-tuning):** Use your self-hosted fine-tuned 7B model.
- Faster than API (local GPU)
- Domain-specific accuracy
- No rate limits

---

## 📝 Updating Your Config

Edit `backend/.env`:

```bash
# For better accuracy (70B model)
LLM_MODEL=meta/llama-3.1-70b-instruct

# For maximum accuracy (340B model)
LLM_MODEL=nvidia/nemotron-4-340b-instruct

# For better vision (90B vision model)
LLM_VISION_MODEL=meta/llama-3.2-90b-vision-instruct
```

Restart backend:
```bash
cd backend && node server.js
```

---

*Last updated: 2026-08-30*
