# 0027. Approvals over HTTP are Ed25519 signatures over the hash the client computed

Date: 2026-10-31

## Status

Accepted (P8). Completes ADR-0013.

## Context

ADR-0013 binds an approval to a human and to the exact proposal hash, but the identity is only
what the event says. Over HTTP, the threat is that an approver is shown one proposal and
approves another: a compromised or buggy server, a modified response, or a confused client. The
blueprint's acceptance: approving a modified proposal is rejected.

## Decision

- **The message** is JCS of
  `{"v": "nexus.approval/1", "decision_id", "proposal_hash", "approver": {"kind", "id"}}`, signed
  with Ed25519. The version string keeps the message from being reused for anything else.
- **The client computes the hash itself**, from the proposal it displays (JCS + sha256, as
  `gate.proposal_hash`). The SDKs and the inbox never copy the server's hash. If what was shown
  is not what was decided, the hash differs and the approval is refused with `HASH_MISMATCH`.
  The inbox also compares the two before signing and will not sign on a mismatch.
- **Keys.** A human approver registers a public key (`POST /v1/keys`, `nexus key register`).
  `key_id` is the first 16 bytes of sha256(raw public key), in hex. Private keys stay with the
  client: the inbox's is a non-extractable WebCrypto key in IndexedDB, the CLI's a 0600 PEM file.
- **Checks, in order, in the decision's lock, nothing written on a refusal:** the decision is
  open; the key is the approver's and active (`UNKNOWN_KEY`); the signature verifies over the
  hash sent (`BAD_SIGNATURE`); then ADR-0013's `HASH_MISMATCH`, `PROPOSER`, `DUPLICATE`.
- **The log can re-verify alone.** `approval.granted` stores alg, key id, public key and value.
  When approvals are counted, a signature that is present must verify or the approval does not
  count, and the evidence pack shows `verified`.
- **HTTP approvals are always signed.** CLI approvals may stay unsigned, as in P3, and the
  evidence pack says so (Q-P8-1). `nexus approve --key PATH` signs.

## Alternatives

- **Trust the bearer token alone.** It proves who called, not what they saw.
- **HMAC with a server secret.** The server could then forge approvals.
- **WebAuthn.** Stronger (hardware-bound, user presence), but needs a relying-party origin and
  TLS; P13 can add it as a second `alg`.

## Consequences

- Revoking a key stops future approvals with it. Past approvals keep verifying from the public
  key stored in their event; whether they still count after a revocation is not decided here.
- A stolen approver token alone cannot approve: it also needs the private key.
