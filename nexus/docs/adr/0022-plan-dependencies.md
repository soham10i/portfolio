# 0022. The executor enforces `depends_on`

Date: 2026-10-31

## Status

Accepted (P6).

## Context

The proposal contract has had `depends_on` since P0 ("proposal ids that must succeed first"),
but nothing set it, so nothing enforced it. The P6 planner sets it for every step that depends
on another. A step whose decision is ALLOW could otherwise run before the step it needs, for
example the temperature set before the lights it was ordered after.

## Decision

- `Executor.run` refuses a decision whose proposal has a `depends_on` entry without a
  `succeeded` execution (or `shadowed`, in shadow mode). The refusal code is
  `DEPENDENCY_PENDING`, with one `DEPENDENCY_NOT_SUCCEEDED` reason per missing proposal.
- The check runs after the binding check and **before** any claim, so the idempotency key is not
  spent and the decision is not marked used. The same decision runs once its dependencies have
  succeeded.
- The gate does not check dependencies. An approval is about the step itself; whether it can
  run yet is an execution question.
- A dependency that failed or was compensated never becomes `succeeded`, so its dependents stay
  refused until a human proposes something new.

## Alternatives

- **Have the gate deny it.** A decision is immutable and spent once, so the step could never run
  after its dependency succeeds; it would need a new proposal each time.
- **Have the planner execute in order.** The planner would need an executor and a binding, which
  ADR-0020 rules out.
- **Wait inside `run` until the dependency finishes.** It holds a connection and a claim for an
  unbounded time, and it hides ordering mistakes.

## Consequences

- Plans with dependencies run in any order of `nexus run` calls; the out-of-order ones are
  refused, visibly and without side effects, and can be retried.
- A refusal is an event in the session stream, so a retried step leaves one
  `execution.refused` per early attempt.
