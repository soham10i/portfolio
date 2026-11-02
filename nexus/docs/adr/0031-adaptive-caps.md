# 0031. Per-minute caps from the providers' docs, adapted at run time

Date: 2026-10-31

## Status

Accepted (P8.1, the owner's answers to Q-P5-1 and Q-P5-2). Updates ADR-0015 and ADR-0021.

## Context

The router (ADR-0015) had daily request caps and a fixed cooldown after a 429. The owner kept
the order (Gemini first, it has the most free quota) and Groq not private, and asked for caps
taken from the docs that adapt. The free tiers also limit requests and tokens per minute. Groq's
`llama-3.3-70b-versatile` shuts down on 2026-08-16.

## Decision

- Per provider: `requests_per_minute`, `tokens_per_minute`, `quota_timezone` and `max_wait_s`,
  set below the published free-tier limits (values and sources in P8.1.md §2). Groq moves to
  `openai/gpt-oss-120b` with `reasoning_effort: low`.
- `llm/limits.py` keeps, per provider and per process (`SHARED`), a sliding one-minute window
  of requests and tokens. The effective per-minute limit halves on a 429 and grows back by one
  per success, never above the configured value. A provider with no configured limit only
  cools down.
- What the provider says wins: a Gemini `RetryInfo.retryDelay` sets the pause, and a per-day
  `QuotaFailure` marks the day used up. Groq's `x-ratelimit-remaining-requests: 0` marks the day
  used up; too few tokens left waits for `x-ratelimit-reset-tokens`.
- A used-up day is stored in `model_usage.exhausted_at`, so every process skips the provider
  (`QUOTA_EXHAUSTED`) until midnight in its `quota_timezone`.
- A window that frees within `max_wait_s` is waited for; otherwise the call moves on
  (`RATE_LIMITED`) and the answer's notes say why.

## Alternatives

- **Fixed caps only.** Simple, but a tier that tightens would show up only as 429s.
- **A shared rate limiter in Postgres.** Exact across processes, but a write per call; only
  the used-up day needs to be shared, and it is.

## Consequences

- Two processes can each use a full minute window; the provider's 429 then halves both.
- Groq is configured but not tested live here (no key); its header handling is tested with fakes.
