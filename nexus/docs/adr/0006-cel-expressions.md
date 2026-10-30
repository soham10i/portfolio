# 0006. CEL for preconditions, effects and envelopes

Date: 2026-10-30

## Status

Accepted. Contracts store CEL strings from P0; evaluation starts in P2.

## Context

Actions declare `preconditions` (must hold before execution), `effects` (must hold after, for
verification) and `envelope` limits. Compensation parameters are computed from the proposal and
the previous state. These expressions are written by pack authors and evaluated by the gate on
live plant state, so they must be side-effect free, terminating and safe to run on untrusted input.

## Decision

Write these expressions in **CEL (Common Expression Language)**. In P0 the schemas only check
that each is a non-empty string (`cel_expr` in `common.schema.json`). P2 adds parsing,
type-checking against the pack's observables and params, and evaluation, with an evaluation
cost limit. The CEL library is chosen in P2, with its own ADR and licence check.

## Alternatives considered

- **Python expressions (`eval`, or a restricted AST walker).** Unsafe or easy to get wrong, and
  ties packs to Python.
- **JSONLogic.** Safe but verbose and hard for people to read and review.
- **Rego (OPA).** Excellent for policy, which P2 may still use for the gate itself, but heavy
  for one-line preconditions and less familiar to pack authors.
- **A custom DSL.** All the cost of a language with none of the ecosystem.

## Consequences

- Expressions are portable: Go, Java, C++ and Python implementations exist.
- CEL is not Turing complete, so evaluation always terminates.
- Until P2, a typo in an expression is not caught; P0 validates only that it is a string.
