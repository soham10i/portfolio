# 0003. Postgres 16 + pgvector as the single datastore

Date: 2026-10-30

## Status

Accepted

## Context

NEXUS needs an append-only, hash-chained event log (P1), current state and projections, a job
queue for executions, and vector search over pack knowledge (P7). Each extra datastore adds
operations work, another failure mode and another place where the audit trail can diverge.

## Decision

Use **one Postgres 16 database with the pgvector extension** for events, state, vectors and jobs
(jobs via `SELECT … FOR UPDATE SKIP LOCKED`).

The local and CI image is pinned to **`pgvector/pgvector:0.8.7-pg16-bookworm`** (pgvector 0.8.7,
Postgres 16, Debian bookworm), the newest `pg16` tag on Docker Hub when P0 was built. It runs on
host port **5433**, so a Postgres the portfolio may run on 5432 is left alone
(`deploy/compose.yml`). Upgrades change the tag in both `deploy/compose.yml` and
`.github/workflows/nexus-ci.yml` together.

P0 only proves the extension works (`tests/test_db.py`). Tables and migrations arrive in P1.

## Alternatives considered

- **Kafka / EventStoreDB for events.** Strong for streams, but a second system to run, and
  transactional writes of event + state would need an outbox anyway.
- **A dedicated vector DB (Qdrant, Weaviate, Pinecone).** Better at very large corpora; pack
  knowledge is small, and joining vectors with state in SQL is worth more.
- **Redis/RabbitMQ for jobs.** Another system for a modest job rate that Postgres handles.
- **SQLite.** Fine for a demo, but no pgvector-equivalent maturity and weak concurrent writers.

## Consequences

- One backup, one connection pool, one place to look during an incident.
- Transactions span event, state and job, which keeps the audit trail consistent.
- If vector or event volume outgrows Postgres, that is a measured decision for a later ADR.
