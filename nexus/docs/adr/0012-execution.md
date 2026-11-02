# 0012. Execution: claim once, re-check, verify by observation, compensate once

Date: 2026-10-30

## Status

Accepted (P3).

## Context

The blueprint (§4.5, §4.7) asks for idempotent execution with timeouts, effect verification,
compensation on failure, incidents and a shadow mode. It leaves open how "once" is guaranteed,
what happens between an approval and the execution, how effects are observed, and whether a
compensation may run while the system is read-only.

## Decision

1. **Claim by row.** An execution starts by inserting its idempotency key
   (`proposal.idempotency_key`, else the proposal id) into an `executions` table, in the same
   transaction as the `execution.started` event. The primary key makes a second claim fail; the
   caller gets the existing record. The binding is called outside any transaction.
2. **Re-check before running.** A decision may be minutes old when it is approved. The executor
   runs the gate's pure `evaluate` again on a fresh snapshot (kill switch, params, envelope,
   preconditions, freshness; not the rate limit, which counted this decision already). A DENY
   refuses the execution.
3. **Verify by observation.** Bindings report the device's observables with `observe()`. The
   executor writes them into world state as the pack and evaluates every effect over `state`,
   `params` and `prev` until `verify_within_s` passes. So verification uses the same state, types
   and staleness rules as preconditions, and every observation is an event.
4. **Timeouts.** Actions declare `timeout_s` (default 30). A binding call that times out is
   treated as failed, because its effect is unknown, and goes to compensation.
5. **Compensation is not gated, and never compensated.** It is a rollback, not a new proposal,
   so it does not go through the gate or need approval. If it fails, an incident is opened and
   nothing further runs (ADR-0010).
6. **Read-only means read-only.** If the kill switch is on when a compensation would run, it does
   not run; an incident `compensation_blocked` records what was left undone for a human.
7. **Shadow mode** is an executor mode: every step up to the binding call runs and is recorded,
   ending in `execution.shadowed`. A human's actual verdict can be recorded as `shadow.compared`.

## Consequences

- At-most-once holds across processes, not only within one.
- A process that crashes between claim and completion leaves a `running` row; recovering it is
  P8 work.
- Compensation under the kill switch needs a human, which is slower but cannot surprise the
  operator who pulled the switch.
- `timeout_s` is an optional, additive contract field.
