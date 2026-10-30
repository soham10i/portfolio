# 0010. An action may compensate with itself

Date: 2026-10-30

## Status

Accepted (owner decision on open question Q1, before P3).

## Context

A compensation undoes an action whose effects could not be verified. The natural way to restore
a setpoint is the same action with the previous value
(`oven.set_zone_temp(zone, prev.setpoint)`), and the blueprint's examples do that. The P0 brief
named the rule `SELF_COMPENSATION_LOOP` but defined it as "compensation chains must not cycle
(A→B→A)", which left self-compensation (A→A) open.

## Decision

A→A is allowed. A compensation is never itself compensated: if a compensation fails, the
executor raises an incident and stops (P3). Only cycles through at least one other action
(A→B→A, A→B→C→A) are rejected by `SELF_COMPENSATION_LOOP`, which is what P0 already implements.

## Consequences

- Packs do not need a separate "restore" action per setter.
- P3 must enforce "a compensation is not compensated" in the executor, and test it.
- Open question Q1 is resolved.
