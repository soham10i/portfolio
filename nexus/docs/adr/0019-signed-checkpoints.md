# 0019. Signed stream-head checkpoints in an anchor file outside Postgres

Date: 2026-10-31

## Status

Accepted (P4.1, answers Q-P4-2: "check for that and fix that integrity issue").

## Context

ADR-0008's hash chain catches an edited event, because its stored hash no longer matches. It does
not catch someone with database access who edits an event and then recomputes every later hash,
every `prev_hash` link and the stream head: the result is a consistent chain. P4 recorded this
as a gap to close in P8. The owner asked for it to be closed now, locally and at no cost.

## Decision

- **Key.** `NEXUS_ANCHOR_KEYS="kid:hex[,kid:hex…]"`, at least 32 bytes each, from the
  environment only, never stored in the database or printed. The first key signs; every listed
  key verifies, so a key is rotated by putting a new one first and dropping the old one once its
  checkpoints are no longer needed.
- **Anchor file.** `NEXUS_ANCHOR_DIR/<database>.<schema>.jsonl`, opened `O_APPEND`, mode 0600,
  one `write` and an `fsync` per transaction. Each line is
  `{v, kid, db, stream, seq, hash, ts, mac}` with `mac = HMAC-SHA256(key, canonical JSON of the
  other fields)`. `db` binds a line to its database and schema, so lines cannot be replayed
  into another one.
- **When.** Every write goes through `EventStore.transaction()`. `_append_in` notes the heads it
  moved on that connection; after the transaction commits, they are signed into the file. A
  rollback signs nothing. A failed file write is logged, not raised (the events are committed)
  and shows up in `chain verify` as `CHECKPOINT_BEHIND`.
- **Verification.** With an anchor, `verify_chain` reads the anchor file first, then the
  database snapshot, and reports:
  - `CHECKPOINT_INVALID` (bad line, bad MAC, other database) and `CHECKPOINT_UNKNOWN_KEY`;
  - `CHECKPOINT_MISMATCH`: the event at a signed seq has another hash. Every checkpoint is
    checked, not only the latest, so rewriting any signed part of the history is caught;
  - `CHECKPOINT_AHEAD`: a signed seq past the end of the stream (the tail was cut off);
  - `CHECKPOINT_MISSING` / `CHECKPOINT_BEHIND`: the head has no checkpoint, or is past the
    latest one (written without the key, or a lost file write).
- **CLI.** `nexus chain verify` exits 2 when anchoring is not configured, unless `--no-anchor`
  asks for the hash chain alone. `nexus chain checkpoint` signs heads that are missing or behind,
  and only when nothing else is wrong: this is how an existing database is adopted, and how a
  lost checkpoint is recovered, by someone holding the key.
- **Demo.** `make demo` step 7 performs the full rewrite: `chain verify --no-anchor` passes,
  `chain verify` fails with `CHECKPOINT_MISMATCH`, and `nexus trace` refuses to vouch.

## What this still does not prove

- Someone who holds **both** the signing key and write access to the anchor file can rewrite
  the database and re-sign a matching anchor file. Keep the key and the anchor directory away
  from the database's owners (another host, another account, write-once storage); this ADR does
  not do that for you.
- Someone with the key alone can sign forged heads; `chain checkpoint` only refuses to sign over
  a mismatch, it cannot tell a legitimate adoption from a forged one.
- Deleting or truncating the anchor file is detected (`CHECKPOINT_MISSING` / `BEHIND`), but
  what was in it cannot be recovered from the file itself.
- Events committed after the last good checkpoint (a crash between commit and file write, or a
  writer without the key) are reported, not authenticated.
- A write that commits between reading the file and reading the database reads as
  `CHECKPOINT_BEHIND`; run `chain verify` again, or when writers are idle.
- The anchor protects history; it says nothing about whether the events were true when written.

## Alternatives

- Public-key signatures (Ed25519): verifiers would not need the secret, but it adds a crypto
  dependency; HMAC is in the standard library and the verifier is the operator. Revisit in P8.
- An external timestamping or transparency service: not free, not local.
- Checkpoints in a second Postgres table: the same owner could rewrite those too.
- Only the latest checkpoint per stream: misses a rewrite of the middle of a stream whose new
  head is then re-signed by a legitimate append; every checkpoint is checked instead.

## Consequences

- Library callers and tests that open a store without an anchor behave as before; only the CLI
  insists on anchoring.
- One small file write and fsync per write transaction.
- Tests: `tests/test_anchor.py`, `tests/test_demo.py`.
