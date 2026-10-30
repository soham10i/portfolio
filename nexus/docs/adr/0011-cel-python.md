# 0011. cel-python evaluates CEL

Date: 2026-10-30

## Status

Accepted. Implements ADR-0006 in P2.

## Context

ADR-0006 chose CEL for preconditions, effects and compensation params and left the library to
P2, with a licence check. The gate's budget is p95 < 50 ms per decision over 10k decisions.

## Decision

Use **cel-python** (`celpy`), 0.5.0, Apache-2.0 (its `LICENSE` file; the wheel metadata leaves
the licence field empty, so `pip-licenses` shows `UNKNOWN`; the deny-list check passes it, and
the licence was read by hand). Its
dependencies are MIT or BSD: `lark`, `jmespath`, `pendulum`, `google-re2`, `pyyaml`. Measured
on an Apple M4 before adoption: compile ≈ 0.07 ms, evaluation of a two-clause precondition
≈ 0.14 ms.

How NEXUS uses it:

- Expressions are compiled once when a pack is loaded; a parse error makes the pack invalid
  (semantic rule `CEL_SYNTAX`, also reported by `nexus validate`).
- CEL is strict about `int` versus `double`, so values are converted by their declared contract
  type before evaluation: a `number` param or observable is always a double, an `integer`
  always an int. `params.temp <= 240.0` therefore works when the proposal sends `240`.
- World state is exposed as nested maps; `[n]` in an observable id becomes an integer map key,
  so `state.oven.zone[params.zone].mode` reads `oven.zone[2].mode`. The maps record which
  leaves an expression reads; those reads are the ones checked for freshness and recorded in the
  decision's `state_versions`.
- A reference to a key that is not present is an evaluation error, which the gate turns into a
  DENY with `STATE_UNKNOWN`; it is never treated as false.

## Alternatives considered

- **`cel-expr-python` (Google's C++ bindings).** Faster and closer to the reference
  implementation, but a native build on every platform, and newer.
- **A hand-written evaluator for a CEL subset.** Small, but a second language to get right.

## Consequences

- cel-python has no evaluation cost limit. Expressions are at most 500 characters, params are
  scalars and the state is bounded by the pack's observables, so evaluation is short; the gate
  benchmark measures it.
- Five new transitive dependencies, all on the licence allow-list.
