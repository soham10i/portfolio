# 0004. JSON Schema 2020-12 is canonical; versioning by folder

Date: 2026-10-30

## Status

Accepted

## Context

Packs, actions, proposals, decisions, evidence packs and events are exchanged between the
runtime, pack authors, the planner (as tool definitions), the UI and external auditors. They need
one definition that every language can read and that does not depend on our Python code.

## Decision

- The **JSON Schemas in `contracts/v1/`** (draft 2020-12, `$id` under
  `https://nexus.local/contracts/v1/`) are the source of truth. The pydantic models follow them,
  and `tests/test_parity.py` checks that both reach the same verdict on every example.
- `$ref`s are resolved from the local files through a `referencing.Registry`; validation never
  touches the network.
- Rules JSON Schema cannot express (unique ids, cross-references, compensation cycles, hash-chain
  genesis) live in `src/nexus/contracts/validate.py`, each with a stable code, one invalid
  example and one test.
- **Versioning.** An additive, backwards-compatible change (a new optional field, a new enum
  value that old readers may ignore) stays in `v1/`. A breaking change creates `contracts/v2/`
  next to `v1/`; both are served until every pack and stored event is migrated. Every contract
  document carries `schema_version`, and every contract change needs an ADR (ADR-0001).

## Alternatives considered

- **pydantic as the source, schemas generated.** Ties the contract to one library's output,
  which changes between releases and is not readable by pack authors.
- **Protobuf / Avro.** Good for wire formats, poor for hand-written YAML packs and for the
  planner's tool definitions, which are JSON Schema already.
- **OpenAPI only.** Describes the HTTP API, not the documents stored in the event log.

## Consequences

- Schemas and models are kept in sync by hand; the parity test catches drift.
- Semantic rules are Python-only for now. Other languages reading the contracts get structure
  but not those rules until they are ported or exposed through the API.
