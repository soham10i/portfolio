# 0015. A model router on the standard library, free providers only, with a usage ledger

Date: 2026-10-31

## Status

Accepted (P5).

## Context

The planner (P6) needs structured answers from a language model. The owner has no budget, so
the router must run on free tiers (Gemini, Groq) and a local model (Ollama), and must not be
able to spend money by accident. Free tiers rate-limit and have daily quotas; Gemini's free tier
may use what it receives to improve Google's products. The blueprint asks for failover, schema
retries (at most 2), budgets per request and per day, and an event for every call.

## Decision

1. **No SDKs.** Each provider kind is a request builder and a response parser over plain JSON
   HTTP (`gemini`, `openai` for any OpenAI-compatible API such as Groq, `ollama`). The transport
   is `urllib.request` in a worker thread, behind a one-method protocol that tests replace.
   No new dependency.
2. **Spending is opt-in twice.** A provider is `free` (prices must be 0) or paid. A paid provider
   needs a positive `daily_budget_usd` (default 0), both prices, and a request whose
   `Budget.max_cost_usd` (default 0) covers the estimate. Any of these missing → `model.refused`
   BUDGET_EXCEEDED, with no request sent.
3. **Ledger with reservation.** `model_usage (provider, day)` counts requests, tokens and
   micro-dollars. Before a request, one transaction locks the row, checks the daily request cap
   and budget, and reserves the request and its estimated cost (prompt characters / 4 plus
   `max_output_tokens`, priced). Settling replaces the estimate with the actual cost in the same
   transaction as the `model.called` event. Concurrent calls cannot go over a quota or budget.
4. **Keys by name.** The config holds environment variable names only, and the validator rejects
   anything that does not look like one. Keys go in headers (`x-goog-api-key`,
   `Authorization`), never URLs, and are scrubbed from any error text before it is stored.
5. **Privacy flag.** `private=True` uses only providers with `private_ok` (by default only Ollama).
6. **Failover rules.** 429 and 5xx/connection errors cool the provider down (`Retry-After`, capped
   at 600 s, else `cooldown_s`) and move on. Other 4xx move on without a cooldown. Output that is
   not JSON or does not match the schema is retried on the same provider at most twice, then the
   call fails with OUTPUT_INVALID: the problem is the request, not the provider.
7. **Events.** `model.called` for each attempt (provider, model, attempt, outcome, HTTP status,
   tokens, cost, latency, prompt SHA-256, the output when valid, a short error), `model.refused`
   for each skip, on `session/<id>` or the `models` stream.

## Consequences

- A crash between reserving and settling leaves the reservation in place until the day ends: the
  ledger can over-count, never under-count. `model_usage` is therefore not rebuildable exactly
  from events, unlike `state`; it is a budget guard, and the events are the record.
- Cooldowns live in memory per router. Several processes each learn about a 429 on their own.
- The token estimate is rough. It decides budgets, not bills; the event records the provider's
  own token counts.
- Prompts are stored as a hash only, until P6 decides what a plan's evidence must include.
- Provider response formats can change. The parsers fail closed (`error`, failover), and
  `make test-live` checks them against the real APIs with the owner's free keys.
