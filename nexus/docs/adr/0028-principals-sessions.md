# 0028. Principals, bearer tokens and session isolation

Date: 2026-10-31

## Status

Accepted (P8).

## Context

Until P8 the CLI acted for whoever set `NEXUS_ACTOR`. Over HTTP several principals share one
runtime, and identity must come from something the caller cannot simply claim. P2's taint rule
depends on knowing whether "the user asked" is true.

## Decision

- **Principals** (`principals` table) have a kind (`human` / `agent`) and roles (`requester`,
  `approver`). They are managed only from the CLI, which needs database access; the token is
  printed once.
- **Tokens** are 256 random bits, sent as `Authorization: Bearer`, stored only as sha256, and
  never written to an event or a log. There are no cookies, so another origin cannot act as the
  user; there is no CORS. The WebSocket takes the token in its first message, not the URL.
- **Identity comes from the token, never the body.** A proposal's `proposer` and `session_id`
  come from the principal and the path; a body naming another is refused (422). Only a human may
  put a `user` item in a proposal's context or use `act` (`NOT_USER`).
- **Sessions belong to their opener.** Anyone else gets 404 (not 403) on reading, streaming,
  messaging, proposing or executing, so existence does not leak. Session memories are scoped by
  the server-made session UUID (ADR-0025).
- **Approvers see only the inbox:** NEEDS_APPROVAL decisions and their evidence packs.
- **Loopback only.** `nexus serve` refuses a non-loopback bind, and the server refuses any `Host`
  header but `localhost`, `127.0.0.1` and `[::1]`, which stops DNS rebinding.

## Alternatives

- **OIDC now.** Right for a deployment, but needs an identity provider and TLS: P13.
- **Signed session cookies.** Ambient credentials make CSRF possible; a bearer header does not.
- **403 for another's session.** Tells the caller the session exists.

## Consequences

- A session owner who also has the approver role can approve planner proposals in their own
  session; only the proposer itself is blocked (ADR-0013). Separating the two needs a policy
  choice that P8 does not make.
- An approved item stays in the inbox, marked "approved by you", until it is executed.
- Token rotation and revocation take effect on the next request.
