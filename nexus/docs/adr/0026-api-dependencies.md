# 0026. The API's dependencies: FastAPI, uvicorn, websockets and cryptography

Date: 2026-10-31

## Status

Accepted (P8).

## Context

P8 serves the runtime over HTTP and a WebSocket, and verifies Ed25519 signatures on approvals.
The standard library has neither an ASGI server nor Ed25519. Every dependency must be MIT, BSD,
Apache, ISC, PSF or MPL (no GPL family), and `nexus/` must stay standalone.

## Decision

- **Runtime:**
  - `fastapi` (MIT), with `starlette` (BSD-3-Clause) and `pydantic` (MIT), for routes and
    request bodies;
  - `uvicorn` (BSD-3-Clause), with `h11` (MIT), as the server;
  - `websockets` (BSD-3-Clause) for uvicorn's WebSocket protocol;
  - `cryptography` (Apache-2.0 OR BSD-3-Clause), with `cffi` (MIT-0), for Ed25519.
- **Dev only:** `httpx` (BSD-3-Clause), which Starlette's test client needs.
- **The SDKs add nothing.** The Python SDK uses `urllib`; the TypeScript SDK and the inbox use
  `fetch` and WebCrypto. JCS is written out in each (about 40 lines), checked against shared
  vectors.
- `make licenses` (part of `make check`) still fails on any GPL, AGPL or LGPL licence.

## Alternatives

- **Starlette alone.** Fewer layers, but request validation would be hand-written; FastAPI's
  pydantic models give 422s with field names for free.
- **PyNaCl for Ed25519.** Also Apache-licensed, but it bundles libsodium; `cryptography` is
  already the common choice and has wheels everywhere.
- **The standard library `http.server`.** No WebSocket, no async, and the store is async.

## Consequences

- The installed footprint grows by about a dozen packages, all permissive (P8.report §1).
- Starlette warns that its test client will move off `httpx`; the warning is filtered in
  `pyproject.toml` until the replacement is released under a compatible licence.
