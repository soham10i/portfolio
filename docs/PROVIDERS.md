# Model providers — free tier, measured

Every number here was measured against a live endpoint, not read off a pricing
page. Free tiers change without notice; re-measure rather than trusting this
file, with:

```bash
scripts/probe-providers.sh                    # is each configured provider answering?
scripts/probe-providers.sh models groq        # what ids does it actually serve?
```

## How provider selection works

`backend/src/config/providers.js` is a registry mapping a provider name to a
base URL and a default model id. A deployment sets a name and a key:

```bash
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
```

Three roles are resolved independently, because the free tiers are not good at
the same things:

| Role | Provider variable | Purpose |
|---|---|---|
| text | `LLM_PROVIDER` | chat, SceneLab summaries and Q&A, MedQA generation |
| vision | `LLM_VISION_PROVIDER` | SceneLab keyframe captioning |
| fallback | `LLM_FALLBACK_PROVIDER` | retried once on a 429 or 5xx from the primary |

Explicit `LLM_API_BASE` / `LLM_MODEL` / `LLM_API_KEY` always win over the
preset. Nothing in the registry can trap you.

**The fallback must be a different vendor.** Its entire job is to survive one
vendor's quota wall; pointing it at the same one buys nothing.

## The recommended configuration

```bash
LLM_PROVIDER=groq                  GROQ_API_KEY=gsk_...
LLM_FALLBACK_PROVIDER=openrouter   OPENROUTER_API_KEY=sk-or-...
LLM_VISION_PROVIDER=nvidia         NVIDIA_API_KEY=nvapi-...
```

Groq is primary because a chat widget is judged on how fast the first token
appears, and nothing free is close. OpenRouter is the fallback because
`openrouter/free` is an auto-router across a pool — it survives any single
model being retired, which is exactly what a fallback needs. NVIDIA handles
vision because it is the only free tier here still serving vision models.

## Measured, August 2026

Single request, `max_tokens: 256`, prompt `"Reply with exactly: ok"`.

| Provider | Model | Result | Latency |
|---|---|---|---|
| OpenRouter | `openrouter/free` | 200, `ok` | 1 515 ms |
| Google AI Studio | `gemini-flash-lite-latest` | 200, `ok` | 655 ms |
| Google AI Studio | `gemini-3.5-flash-lite` | 200, `ok` | 645 ms |
| Google AI Studio | `gemini-2.5-flash` | 200, `ok` | **16 389 ms** |
| Google AI Studio | `gemini-2.0-flash-lite` | **404 — retired** | — |
| Google AI Studio | `gemini-flash-latest` | 503 — high demand | — |
| Google AI Studio | `gemini-3.7-flash` | 503 — high demand | — |
| OpenRouter | `google/gemma-4-31b-it:free` | **404**, though `/models` lists it | — |
| Groq | `llama-3.3-70b-versatile` | not yet measured — no key on file | — |

## Failure modes worth knowing

**A 200 is not a success.** A reasoning model can spend its entire `max_tokens`
budget on hidden thinking and return `finish_reason: "length"` with empty
content. `gemini-2.5-flash` does exactly this at small budgets, and takes 16
seconds even when it does answer. `backend/src/routes/chat.js` carries a retry
at a larger budget specifically to survive this; the better fix is not to pick
a reasoning model for conversational turns. `scripts/probe-providers.sh` reports
this case as `empty`, not `ok`.

**`/models` is not a list of models you can call.** OpenRouter listed
`google/gemma-4-31b-it:free`; calling it returned 404. Probe the actual
completion endpoint, never the catalogue.

**Google retires dated model ids.** `gemini-2.0-flash-lite` was a reasonable
default and now answers 404. The rolling aliases — `gemini-flash-lite-latest` —
are the only ids that survive this, which is why the registry uses one. The
tradeoff is that an alias can silently move under you; the `-lite` alias has
been stable and the full `gemini-flash-latest` alias was returning 503 for
capacity at the time of measurement.

**NVIDIA NIM's free text models are gone.** As of August 2026 the 8B and 70B
text endpoints are EOL or 404 while the vision models still answer. Pointing
`LLM_PROVIDER` at `nvidia` will disappoint you; pointing `LLM_VISION_PROVIDER`
at it will not.

**Groq meters tokens per day, not requests.** A handful of long answers costs
more of the quota than many short ones. `budgetFor()` in
`backend/src/services/llm.js` already sizes the response cap from the shape of
the question — 256 tokens for a greeting, 2048 for "compare X and Y" — which
matters more on Groq than anywhere else.

## Adding a provider

Add an entry to `PROVIDERS` in `backend/src/config/providers.js`. It needs a
base URL that ends before `/chat/completions`, a default model id, the name of
the environment variable holding its key, and a `notes` string recording
whatever surprised you. Nothing else in the codebase changes — that is the
point of speaking the OpenAI wire format instead of a vendor SDK.
