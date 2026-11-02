# 0032. Answers cover the question's points, ask when it is unclear, and size their output

Date: 2026-10-31

## Status

Accepted (P8.1, the owner's answer to Q-P5-2). Extends ADR-0023.

## Context

The owner asked that an answer cover the points the user asked, that Nexus ask clarifying
questions when needed, and that the output-token limit be dynamic. The grounding rules of P7
(every sentence cited, checked and reviewed, or dropped) must still hold.

## Decision

- **Points.** The compose reply lists the points the question asks (1–6), and each sentence
  names its point. A point no kept sentence answers, or that the critic reports as missed, is
  returned as `uncovered`, "not found in the sources". It is never filled in.
- **Dynamic limits.** Compose: `clamp(192 + 96·points + 24·sources, 256, max_output_tokens)`,
  where `points` is a rough count from the question's wording. Critic:
  `clamp(128 + 48·sentences, 192, 512)`. Budgets stay at $0.
- **Clarify.** Status `clarify` and event `answer.clarify_requested`, with up to 3 questions:
  - with no model call, when nothing was found and the question names an ambiguous asset (the
    question lists the asset graph's candidates);
  - when the model decides the sources answer different readings differently.
  A reply comes back with `clarifies: <answer_id>` in the same session and is answered as
  "original question + Clarification: reply". After 2 rounds clarify is no longer offered (the
  schema allows no questions) and the answerer abstains instead.
- A reply that clarifies is always answered, never planned, whatever the requested mode.
- Two more deterministic checks on each sentence: inline source markers (`[l2]`, `[d1, d3]`)
  are removed from the text (the citations are structured, and a marker's digits read as a
  value), and a sentence that only says the sources do not answer ("The sources do not state…")
  is dropped as `NOT_AN_ANSWER`, so a question nothing answers ends as an abstention.

## Alternatives

- **Always ask when a mention is ambiguous.** Would ask about "a zone's lights" even when the
  documents answer it for every zone.
- **A fixed, larger output limit.** Simpler, but wastes the per-minute token window.

## Consequences

- The recorded grounding evaluation had to be re-recorded (the prompt and schema changed).
- The point count only sizes the limit; a wrong guess costs tokens, not correctness.
