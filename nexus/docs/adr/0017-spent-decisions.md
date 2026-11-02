# 0017. A decision refused at its final re-check is spent

Date: 2026-10-31

## Status

Accepted (P4.1, answers Q-P3-2 "no").

## Context

The executor claims a decision by inserting its idempotency key into `executions`, then re-checks
the gate on fresh state (kill switch, preconditions, staleness) right before calling the device.
A claim refused at that re-check kept its row with status `refused`. The open question was
whether the same decision may be run again once the cause is gone (the kill switch is switched
off, the state moves back inside the limits).

## Decision

- No. A refused claim is final: `executor.run` on that decision, or on any decision that reuses
  its idempotency key, appends `execution.refused` with code `DECISION_SPENT` and calls nothing.
- The key stays consumed. Running the action again needs a fresh proposal with a new key,
  through the gate, which decides on the state of that moment.

## Alternatives

- Allow a retry after a refusal: simple for agents, but the run would happen on state the
  decision was never judged against.
- Expire refusals after a time: still runs an old decision on new conditions, only later.

## Consequences

- A decision approved under one set of conditions can never execute later under others it was
  not judged against, for example after a long kill-switch drill.
- Agents must expect `DECISION_SPENT` and re-propose; the message says so. Tests:
  `tests/test_rollback_and_spent.py`.
