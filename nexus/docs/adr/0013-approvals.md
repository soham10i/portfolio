# 0013. Approvals bind a human identity to the exact proposal hash

Date: 2026-10-30

## Status

Accepted (P3).

## Context

The blueprint (§4.5) says approvals are "signed (user id + hash of the exact proposal)", that
approving one proposal never approves another, and that critical actions need two people. There
is no authentication yet (that arrives with HTTP in P8), so there are no keys to sign with.

## Decision

- An approval is an `approval.granted` event on the decision's session stream with
  `{decision_id, proposal_hash, approver, approved_at}`. The event chain is what makes it
  tamper-evident; the approver must state the hash they were shown, and it must equal the
  decision's `proposal_hash`.
- It is accepted only for a NEEDS_APPROVAL decision, from a `human` actor who is not the
  proposer, once per approver, and not after a rejection or an execution.
- Distinct approvers are counted against the decision's `approvals_required` (2 for critical).
- `approval.rejected` closes the decision: it can no longer execute.
- Cryptographic signatures (a per-user key signing the hash) replace "identity in the event" when
  P8 adds authentication; the payload already carries the hash they will sign.

## Consequences

- Until P8, anyone who can write events can claim to be any human; the chain still records who
  claimed what and when.
- Changing a single parameter changes the hash, so an approval cannot be carried over to an
  edited proposal.
