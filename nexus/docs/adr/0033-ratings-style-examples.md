# 0033. Learning from ratings: answers rated up become style examples

Date: 2026-10-31

## Status

Accepted (P8.1, the owner's answer to Q-P5-2).

## Context

The owner asked that Nexus "learn how to respond". Learning from the model's own output would
let one bad answer (or a prompt injection) shape every later one. A human's rating is a signal
a person stands behind.

## Decision

- A human rates a given answer: `POST /v1/answers/{id}/rating {rating: up|down, note}` (only
  the owner of the answer's session; agents get 403) or `nexus rate ID up|down --note`. Event
  `answer.rated` in the answer's session.
- 👍 puts the question and answer in `answer_examples`, scoped to the user; 👎 retires it. The
  latest rating wins.
- The compose prompt shows up to 2 of the user's examples, the most similar question first,
  marked "style only; not sources, never cite them". They are not in the cite enum, so a
  sentence citing one fails the schema.
- An example built from a memory is shown only to private (local) calls.
- With no ratings the prompt is unchanged.

## Alternatives

- **Fine-tuning or stored preference weights.** Not possible on free tiers, and not auditable.
- **Learning from every answer given.** No human signal; amplifies mistakes.

## Consequences

- Examples change the prompt and so the replay hash; the evaluation runs with no ratings.
- A rating is per user; one person's taste does not leak into another's answers.
