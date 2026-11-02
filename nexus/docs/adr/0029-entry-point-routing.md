# 0029. One entry point with a deterministic ask/act rule

Date: 2026-10-31

## Status

Accepted (P8).

## Context

The blueprint wants one place to type: a question goes to the answerer (P7), a request to the
planner (P6). A model could classify, but that is a call, a cost and a non-deterministic result
on every message.

## Decision

- `POST /v1/sessions/{id}/messages {text, mode: auto|ask|act}`. An explicit mode wins.
- `auto` is `routing.route`, a few regular expressions, no model:
  1. a request for information ("can you tell me", "show me", "explain", "summarize",
     "let me know") is `ask`;
  2. a polite imperative ("please", "can/could/would you", "I'd like you to") is `act`;
  3. a question mark or a first word that opens a question is `ask`;
  4. anything else, `act`. Empty text is `ask`.
- **A wrong route is never unsafe.** `ask` acts on nothing. `act` proposes through the gate and
  executes nothing until the owner calls `execute`. The route is returned, so a client can resend
  with an explicit mode.
- A 30-case table test pins the rule.

## Alternatives

- **A model classifier.** Better on odd phrasings, but costs a call per message and can change
  under a new model.
- **Two endpoints and no auto.** Simplest and fully explicit; kept as `mode`, but the blueprint
  asks for one entry point.

## Consequences

- Phrasings outside the table will be misrouted sometimes. The cost is a re-send, not a wrong
  action.
