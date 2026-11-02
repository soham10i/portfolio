# 0021. Planner model defaults (conservative, pending Q-P5-2)

Date: 2026-10-31

## Status

Accepted as a default (P6). Q-P5-1 and Q-P5-2 are still open; this ADR changes when the owner
answers them.

## Context

The planner sends the request, the catalog and any context items to a model. Q-P5-2 (which
models and daily caps the router should use) is unanswered, and Q-P5-1 (whether Groq may see
private data) is too. A request typed by an operator can contain private data, so the safe
default matters more than plan quality.

## Decision

- **Private by default.** `Planner(private=True)` and `nexus ask` without `--cloud` only use
  providers with `private_ok: true`. In the packaged config that is Ollama alone. With Ollama
  not running, the plan gives up with "no model provider gave an answer" rather than sending
  the request to a cloud tier.
- **`--cloud` / `private=False` is an explicit opt-in** per call. It is used by the evaluation,
  whose 40 tasks are synthetic and public, and by the opt-in live test.
- **Free only, always.** Every planner call carries `Budget(max_cost_usd=0)`, so the router
  refuses any provider that is not `free: true`, whatever the config says. Paid providers keep
  a daily budget of 0.
- **The router's packaged order and models are unchanged:** Gemini Flash-Lite, then Groq, then
  Ollama. The planner adds no model names of its own. The evaluation was recorded with
  `gemini-flash-lite-latest`, the first free provider with a key in the environment.
- **Temperature 0** and **1024 output tokens** for both the plan and the critic call.

## Alternatives

- **Cloud by default** (Gemini first). Better plans with no setup, but every request would leave
  the machine, and Gemini's free tier may use what it receives. Rejected until the owner
  decides otherwise.
- **Pick a bigger default model** (full Gemini Flash, a 70B Groq model). That is exactly the
  Q-P5-2 choice, and full Flash was overloaded on the free tier during P5.
- **A separate, smaller model for the critic.** Needs a second model decision, also Q-P5-2.

## Consequences

- Out of the box, `nexus ask` needs Ollama running, or `--cloud` and a free key.
- The recorded evaluation measures Flash-Lite. A different default model needs a new recording
  (`scripts/eval_planner.py --live --record`) before its numbers mean anything.
- Answering Q-P5-1 "yes" would let `private=True` plans use Groq, with no planner change.
