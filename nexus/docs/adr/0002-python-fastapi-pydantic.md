# 0002. Python 3.12, FastAPI and pydantic v2; no agent frameworks

Date: 2026-10-30

## Status

Accepted

## Context

NEXUS validates contracts, gates actions against policy, executes them through connectors and
keeps an audit trail. It needs strong typing at the edges, a mature HTTP stack (P8), good
libraries for OPC UA, MQTT and Postgres, and a codebase a single engineer can read end to end.

## Decision

- **Python 3.12** (`requires-python >=3.12`), managed with **uv** and a committed `uv.lock`.
- **pydantic v2** models mirror the JSON Schemas (which stay canonical, see ADR-0004), in strict
  mode with `extra="forbid"`.
- **FastAPI** for the HTTP API from P8. Not a dependency in P0.
- **No agent frameworks** (LangChain, LlamaIndex, CrewAI, AutoGen and similar). The planner loop,
  tool definitions and model calls (P5) are written directly against provider SDKs.
- Lint and format with **ruff**, tests with **pytest**, packaging with **hatchling**.

## Alternatives considered

- **TypeScript/Node.** Matches the portfolio, but the industrial libraries (asyncua, paho-mqtt,
  psycopg, scientific stack for P6 simulation) are stronger in Python.
- **Go or Rust.** Better runtime properties, but slower to iterate on and weaker for the
  model and simulation work; revisit for a hardened executor if profiling demands it.
- **Agent frameworks.** They hide the control flow that the gate and the audit trail must see,
  churn quickly, and add large dependency trees. The safety case needs every step explicit.
- **Python 3.11/3.13.** 3.12 is the one version we build, lock and test against (CPython
  3.12.15 locally, `.python-version` in CI). Moving to 3.13 is a later change with its own test run.

## Consequences

- One language for runtime, tooling and tests.
- Writing our own planner loop costs some code, but it is code we can test and audit.
- A new runtime dependency needs a new ADR (P0 brief, section 4).
