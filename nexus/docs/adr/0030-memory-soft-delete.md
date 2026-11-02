# 0030. A deleted memory is kept and marked; a purge erases it

Date: 2026-10-31

## Status

Accepted (P8.1, the owner's answer to Q-P7-1). Supersedes the "`DELETE` removes it" part of
ADR-0025; the rest of ADR-0025 stands.

## Context

ADR-0025 deleted a memory's row, so the text was gone at once. The owner asked to keep both,
"marking which is current and which is deleted", and to keep the data. Some data must still be
erasable for real (a memory added by mistake, or private text).

## Decision

- `memories` gains `deleted_at` and `deleted_reason` (migration `0006_p8_1.sql`).
- `delete(id, reason)` marks the row and keeps the text. `memory.deleted` records the id,
  sha256, reason and `"kept": true`, never the text. Deleting an already-deleted memory is refused.
- Retrieval never sees a deleted memory (`deleted_at IS NULL` is in the search query). `list`
  skips them; `list --all` and `show` include them, each with `status: current | deleted`.
- `purge(id, reason)` removes the row, current or deleted, and records `memory.purged` (id,
  sha256, reason). Only the hash stays, so the chain still verifies.
- Neither event carries the text, so a purge leaves nothing behind in the log.

## Alternatives

- **Delete only (ADR-0025).** Loses what the owner asked to keep.
- **A separate history table.** Two places to keep in step for no gain over a flag.

## Consequences

- A deleted memory's text stays in the database until someone purges it; "delete" in the CLI
  says so.
- Answers given before a delete still cite the memory by id and hash; `show` still explains them.
