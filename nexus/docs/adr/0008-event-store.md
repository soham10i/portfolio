# 0008. Event store: storage layout and canonical JSON

Date: 2026-10-30

## Status

Accepted. Implements the hashing rule that `event.schema.json` documents (P0) and the event
store of blueprint §4.1 (P1).

## Context

The event schema fixes `hash = sha256(JCS(event without "hash"))`, where JCS is RFC 8785. P1
has to produce exactly that hash, store events so they can be verified later, and build world
state from them with compare-and-set. Three choices are not settled by earlier decisions: how to
get RFC 8785 serialisation, how to store the hashed fields so verification reads back the same
bytes, and how to serialise concurrent appends to one stream.

## Decision

1. **`rfc8785` (Trail of Bits, Apache-2.0, no dependencies) produces canonical JSON.** It
   implements the RFC's ECMAScript number serialisation and UTF-16 key ordering, and rejects
   NaN, infinities and integers outside ±(2^53 − 1), which JCS cannot represent exactly.
2. **Hashed fields are stored as text.** `payload` and `actor` are written as their JCS text in
   `json` columns (which keep the input text verbatim, unlike `jsonb`), and `ts` is a `text`
   column. Verification parses what was stored and re-canonicalises it, so a changed byte changes
   the hash, and Postgres's own number and key normalisation can never change a hash on its own.
   The `state` projection uses `jsonb`, because it is not hashed and is queried.
3. **One `streams` row per stream, locked `FOR UPDATE` on append.** This serialises appends
   within a stream (so `seq` has no gaps and `prev_hash` is always the head) while appends to
   different streams run in parallel. The head row also lets verification detect a deleted tail.
4. **A trigger makes `events` append-only** (`UPDATE`, `DELETE`, `TRUNCATE` raise). It stops
   mistakes and casual edits; the hash chain is what detects deliberate tampering by someone who
   can disable the trigger.
5. **World state is versioned per `(entity, key)`.** Each successful compare-and-set appends one
   `state.set` event carrying the new version. Rebuild takes the highest version per key, so it
   does not depend on the global order of events across streams.
   A write takes a transaction advisory lock on `(schema, entity, key)` first and the stream head
   second, always in that order. A row lock on `state` cannot be the key lock, because a key's
   first write has no row yet: two first writes then raced into a lock cycle (found by the
   100-writer test, see the P1 report). A hash collision between two keys only serialises them.

## Alternatives considered

- **Hand-written JCS.** Small for strings and keys, but the number serialisation (shortest
  round-trip, exponent rules) is where implementations go wrong; a maintained library that is
  tested against the RFC's vectors is less code to trust.
- **`jsonb` for the payload.** Postgres rewrites numbers (`1e300` comes back as 301 digits,
  which Python reads as an integer), so a valid event could fail verification without anyone
  touching it.
- **Storing the canonical bytes in a separate column.** Verification would then have to check
  the bytes against the columns as well; storing the canonical text in the columns themselves
  needs one check.
- **Advisory locks or `SERIALIZABLE` for appends.** Both work. A row lock on the stream head is
  visible in `pg_locks`, needs no retry loop, and doubles as the record of the head.

## Consequences

- A payload cannot contain integers beyond ±(2^53 − 1) or non-finite floats; `append` raises
  before writing. Large identifiers belong in strings.
- Every append takes the stream's head row lock. One hot stream is limited by Postgres
  row-lock throughput, measured in the P1 report rather than assumed.
- The tamper test has to disable the trigger first, as an owner-level attacker would.
