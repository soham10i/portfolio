# 0007. asyncpg instead of psycopg as the Postgres driver

Date: 2026-10-30

## Status

Accepted (interim, see `docs/OPEN_QUESTIONS.md` Q8). Deviates from the P0 brief, section 4.

## Context

The P0 brief lists `psycopg[binary]` as a dev dependency for the database test. The same brief's
hard constraint allows only MIT, BSD, Apache-2.0, ISC, PSF or MPL-2.0 licences and forbids LGPL.
`pip-licenses` reports `psycopg` and `psycopg-binary` 3.3.6 as `LGPL-3.0-only`, so the licence
check (A9) fails with psycopg installed. The two instructions cannot both hold.

P1 needs a Postgres driver in the runtime itself, so the choice outlives the P0 test.

## Decision

Use **asyncpg** (Apache-2.0, no runtime dependencies) as the Postgres driver: as a dev
dependency in P0 for `tests/test_db.py`, and as the expected runtime driver from P1. The licence
rule wins over the dependency list because it is a hard constraint and the list is a detail.

## Alternatives considered

- **Keep psycopg and exempt it in the licence check.** LGPL with dynamic linking is often
  acceptable, but the rule says "no LGPL" without exceptions, and an exemption made for a test
  dependency would be inherited by the runtime in P1.
- **pg8000** (BSD-3-Clause, pure Python). Licence-clean and synchronous, but slower and less
  used in async services; FastAPI (ADR-0002) favours an async driver.
- **No driver: shell out to `psql`.** Works in CI and compose, but proves nothing about the
  stack the runtime will use.

## Consequences

- `make licenses` passes with the brief's deny list unchanged.
- The database code from P1 is async. Synchronous scripts wrap calls in `asyncio.run`.
- asyncpg has no codec for `vector`; P0 casts to text. P1 registers a codec or uses a
  licence-compatible pgvector helper (with an ADR).
