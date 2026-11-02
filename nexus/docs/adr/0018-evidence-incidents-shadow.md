# 0018. Evidence packs carry explicit incidents and shadow fields

Date: 2026-10-31

## Status

Accepted (P4.1, answers Q-P4-1 "yes").

## Context

Incidents and shadow-mode comparisons were only visible in an evidence pack's event list and
summary lines. A reviewer, or a tool reading the pack, had to know which event types to look for.

## Decision

- `evidence-pack.schema.json` gains two optional properties, with pydantic parity in
  `contracts/models.py`:
  - `incidents`: `[{incident_id, kind, detail, opened_at}]`, one per `incident.opened` event;
  - `shadow`: `{active, comparisons: [{human, human_outcome, agree, recorded_at}]}`, where
    `active` says the execution ran in shadow mode and each comparison is a
    `shadow.compared` event.
- The evidence builder always fills both (an empty list and `active: false` when there is
  nothing), and `nexus trace` prints them.
- Valid examples: `set-zone-temp.evidence.json`, `compensated.evidence.json`. Invalid:
  `incident-kind` (a kind that is not an id), `shadow-no-active`.

## Alternatives

- Keep them only in `events`: no contract change, but every consumer re-derives them.
- Make them required: would invalidate every pack built before P4.1.

## Consequences

- Packs written before P4.1 stay valid: both fields are optional.
