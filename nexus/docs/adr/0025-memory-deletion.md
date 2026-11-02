# 0025. Explicit memory, and deletion that really removes the content

Date: 2026-10-31

## Status

Accepted (P7). Deletion is changed by ADR-0030: a delete now keeps the text, a purge erases it.

## Context

Memory lets an operator tell NEXUS a fact once ("the zone 3 tomatoes are Crimson Shield") and
have later answers use it. Two risks: a model writing memories from its own output (so a
prompt injection becomes permanent), and a memory that cannot be removed because the
append-only, hash-chained event log (ADR-0008) copied it.

## Decision

- **Only an explicit add writes a memory** (`nexus memory add`, or `MemoryStore.add`), with a
  tier (`session`, `project`, `profile`), a scope (the session id, pack id or user), a source and
  an actor. Nothing the answerer produces is stored as a memory.
- **The content lives only in the `memories` table.** `memory.added` records the id, tier,
  scope, source, sha256 and length; `memory.deleted` records the id, sha256 and reason. Neither
  event contains the text, so `DELETE` removes it and the hash chain still verifies.
- **Scopes are enforced in the query.** A search only sees `(tier, scope)` pairs for the current
  session, the packs in play and the current user.
- **An answer cites a memory by id and hash.** `answer.given` records the memory's id, tier and
  sha256 as provenance, not its text.

## Alternatives

- **Memory as events** (the content in `memory.added`). Simplest and fully audited, but a
  deletion could only be a tombstone; the text would stay in the log forever.
- **Encrypt the content in the event and delete the key** (crypto-shredding). Keeps the audit
  trail complete, but needs key management NEXUS does not have yet.
- **Memories the model proposes and a human confirms.** Useful later; it is the same explicit
  add with a different source, so it can come without changing this decision.

## Consequences

- Known limit (Q-P7-1): an `answer.given` event stores the answer's sentences and any dropped
  sentences. If a sentence quoted a memory, that quote stays in the log after the memory is
  deleted. Postgres also keeps the deleted row's bytes in dead tuples until `VACUUM`.
- Deleting a memory does not rewrite past answers; their provenance keeps the hash, which no
  longer resolves.
