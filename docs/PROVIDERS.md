# Model providers — measured, not assumed

Every number here came from a real request against a real key. Re-measure
rather than trusting this file:

```bash
scripts/probe-providers.sh                    # is each configured provider answering?
scripts/probe-providers.sh models groq        # what ids does it actually serve?
```

## The configuration this repo ships

| Role | Provider | Model | Measured |
|---|---|---|---|
| chat | Google AI Studio | `gemini-3.5-flash-lite` | 815 ms |
| vision | NVIDIA NIM | `meta/llama-3.2-11b-vision-instruct` | 1 463 ms on a 19 KB JPEG |
| fallback | Groq | `openai/gpt-oss-120b` | 611 ms |

Three roles resolve independently, because the free tiers are not good at the
same things:

| Role | Variables | Used by |
|---|---|---|
| text | `LLM_PROVIDER`, `LLM_MODEL` | chat, SceneLab summaries and Q&A, MedQA generation |
| vision | `LLM_VISION_PROVIDER`, `LLM_VISION_MODEL` | SceneLab keyframe captioning |
| fallback | `LLM_FALLBACK_PROVIDER`, `LLM_FALLBACK_MODEL` | retried once on 429 or 5xx from the primary |

`LLM_PROVIDER` indexes `backend/src/config/providers.js`, which supplies the
base URL and a default model id, so only the key is a secret. Explicit
`LLM_API_BASE` / `LLM_MODEL` always win.

**The fallback must be a different vendor.** Its entire job is surviving one
vendor's quota wall.

## Measured 2026-08-30

Single request, `max_tokens: 256`, prompt `"Reply with exactly: ok"`. Vision
rows used a 19 KB JPEG with `max_tokens: 120`.

### Working

| Provider | Model | Latency | Note |
|---|---|---|---|
| Groq | `openai/gpt-oss-20b` | 219 ms | 131k ctx |
| Groq | `qwen/qwen3.8-27b` | 285 ms | 131k ctx, text only |
| Groq | `groq/compound` | 527 ms | |
| Groq | `openai/gpt-oss-120b` | 611 ms | 131k ctx |
| Gemini | `gemini-flash-lite-latest` | 613 ms | rolling alias |
| Gemini | `gemini-3.5-flash-lite` | 815 ms | |
| **NVIDIA** | **`meta/llama-3.2-11b-vision-instruct`** | **1 463 ms** | **vision** |
| OpenRouter | `openrouter/free` | 1 515 ms | at 14:31; key 401'd by 15:40 |
| NVIDIA | `nvidia/nemotron-3-super-120b-a12b` | 2 321 ms | |
| Gemini | `gemini-3.5-flash-lite` (vision) | 3 663 ms | |
| NVIDIA | `nvidia/nemotron-3-ultra-550b-a55b` | 5 850 ms | 550B / 55B active |

### Broken, and commonly recommended anyway

| Provider | Model | Result |
|---|---|---|
| Groq | `llama-3.3-70b-versatile` | **absent from the catalogue entirely** |
| Gemini | `gemini-2.5-flash-lite` | **404** — "no longer available to new users" |
| Gemini | `gemini-2.0-flash-lite` | **404** — retired |
| Gemini | `gemini-2.5-flash` | 200, but **16 389 ms**, and empty at small budgets |
| Gemini | `gemini-flash-latest`, `gemini-3.7-flash` | 503 — high demand |
| NVIDIA | `meta/llama-3.2-90b-vision-instruct` | **timed out at 90 s** |
| NVIDIA | `nemotron-4-340b-instruct` | 404 — "Not found for account" |
| NVIDIA | `llama-3.1-nemotron-ultra-253b-v1` | 404 — not provisioned |
| NVIDIA | `llama-3.1-nemotron-70b-instruct` | 404 — not provisioned |
| OpenRouter | `google/gemma-4-31b-it:free` | 404, despite appearing in `/models` |

## Qwen

Qwen **text** is free on Groq: `qwen/qwen3.8-27b` (285 ms) and
`qwen/qwen3.6-27b`, both 131k context. Set it as the fallback model and you get
Qwen in the stack at no cost.

Qwen **vision** is not free anywhere. OpenRouter lists 53 Qwen models, 26 of
them vision-capable, and **zero** of those are `:free` — the free pool is
text-only. Funding the account makes it cheap rather than free:

| Model | Input $/M | Output $/M | Context |
|---|---|---|---|
| `qwen/qwen3-vl-8b-instruct` | 0.117 | 0.455 | 262k |
| `qwen/qwen3-vl-32b-instruct` | 0.104 | 0.416 | 131k |
| `qwen/qwen3-vl-30b-a3b-instruct` | 0.15 | 0.60 | 262k |
| `qwen/qwen2.5-vl-72b-instruct` | 0.25 | 0.75 | 128k |
| `qwen/qwen3-vl-235b-a22b-instruct` | 0.21 | 1.90 | 262k |

A 512 px keyframe is roughly 1 000 image tokens, so `qwen3-vl-8b-instruct`
costs about **$0.14 per thousand captions**. The $10 minimum credit buys on the
order of 70 000 captions and also lifts the free-tier request cap from ~50/day
to ~1000/day. That is a reasonable purchase — it is just not the free tier.

```bash
LLM_VISION_PROVIDER=openrouter
LLM_VISION_MODEL=qwen/qwen3-vl-8b-instruct
OPENROUTER_API_KEY=sk-or-...
```

## Larger models on NVIDIA

NVIDIA NIM is the only free tier here serving models in the hundreds of
billions of parameters, and two of them answer on a normal developer key:

| Model | Params | Latency |
|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b` | 550B total, 55B active (MoE) | 5 850 ms |
| `nvidia/nemotron-3-super-120b-a12b` | 120B total, 12B active | 2 321 ms |

Five to six seconds is unacceptable behind a chat box and perfectly fine for
work that is one-shot and already slow: MedQA answer generation, SceneLab clip
summarisation. Use the `nvidia-large` preset for those paths rather than making
every chat turn wait.

Not every model in the 83-entry catalogue is provisioned per account. Three of
the large Nemotrons returned `404 "Not found for account"`. Probe before
configuring.

## Failure modes worth knowing

**A 200 is not a success.** A reasoning model can spend its entire `max_tokens`
budget on hidden thinking and return `finish_reason: "length"` with empty
content. `gemini-2.5-flash` does exactly this at small budgets and takes 16
seconds even when it answers. `scripts/probe-providers.sh` reports this as
`empty`, not `ok`, and `scripts/smoke.js` counts it as a failure.

**`/models` is not a list of models you can call.** OpenRouter listed
`google/gemma-4-31b-it:free`; calling it returned 404. Gemini listed
`gemini-2.5-flash-lite`; calling it returned 404. NVIDIA listed three large
Nemotrons that are not provisioned. Probe the completion endpoint, never the
catalogue.

**Bigger is not faster, and sometimes not usable.** NVIDIA's 90B vision model
timed out at 90 seconds while its 11B sibling answered in 1.5 seconds with a
caption that was just as accurate for this task. For keyframe captioning the
11B is not a compromise, it is the correct choice.

**Groq drops models without ceremony.** `llama-3.3-70b-versatile` is cited all
over the internet and is not in the catalogue at all. Groq is an inference shop,
not a model zoo — its catalogue was 14 entries on the day of measurement, of
which four were speech or safety models.

**Keys die.** The OpenRouter key on file answered `openrouter/free` at 14:31 and
returned `401 "User not found"` for every model, including `/credits`, by 15:40
the same day. This is the argument for a configured fallback on a different
vendor, and for `smoke.js` running against production rather than trusting a
green deploy.

## Adding a provider

Add an entry to `PROVIDERS` in `backend/src/config/providers.js`: a base URL
ending before `/chat/completions`, a default model id, the name of the
environment variable holding its key, and a `notes` string recording whatever
surprised you. Nothing else changes — that is the point of speaking the OpenAI
wire format instead of a vendor SDK.
