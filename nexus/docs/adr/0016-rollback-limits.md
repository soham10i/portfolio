# 0016. A rollback passes the same envelope and safety limits as the action

Date: 2026-10-31

## Status

Accepted (P4.1, answers Q-P3-1 "yes").

## Context

ADR-0010 lets an action name its own compensation (`compensation: {action, params}`), which the
executor runs when an execution fails after it reached the device. Until now the compensation's
parameters were only checked against its parameter schema. A rollback is a command to real
equipment like any other: "set the level back to 5" can be as unsafe as the action it undoes.

## Decision

- Before running a compensation, the executor reads fresh state and calls the pure
  `gate.evaluate.rollback_limits(undo, original, pack, params, snapshot, now)`:
  - the compensation action's own envelope;
  - the original action's envelope, for any parameter the two share;
  - the compensation's preconditions, which is where a pack states its safety limits
    (`envelope.limits`).
- Approvals, autonomy and the rate limit are not re-applied: the compensation belongs to an
  execution that was already authorised.
- If anything is refused, the compensation does not run. The executor opens an incident
  `compensation_refused` whose payload carries every reason, its detail says "a human must
  decide", and the execution ends `compensation_failed`.

## Alternatives

- Run the full gate on the compensation: it would demand a second approval in the middle of a
  failure, which a human cannot give in time; the safety checks are what matter.
- Clamp the parameters into the envelope: a different command from the one the pack declared,
  chosen by no one.

## Consequences

- A failed action whose rollback would be unsafe leaves the equipment where the failure left it,
  with an incident for a human, instead of a silent second unsafe command.
- Packs that want a compensation to be able to run must keep its parameters inside both
  envelopes. Tests: `tests/test_rollback_and_spent.py`.
