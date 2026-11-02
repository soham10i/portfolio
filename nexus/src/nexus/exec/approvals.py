"""Approvals: a human identity bound to the exact proposal hash (ADR-0013, P3.md §3), optionally
signed with the approver's registered Ed25519 key (ADR-0027)."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..gate.evaluate import NEEDS_APPROVAL
from ..gate.gate import DECISION_MADE
from ..signing import signature_ok
from ..store import EventStore
from ..store.events import utc_timestamp

APPROVAL_GRANTED = "approval.granted"
APPROVAL_REJECTED = "approval.rejected"


class ApprovalError(ValueError):
    """The approval or rejection was not accepted; nothing was written."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


@dataclass(frozen=True)
class DecisionRef:
    """A `decision.made` event, found by decision id."""

    stream: str
    seq: int
    proposal: Mapping[str, Any]
    decision: Mapping[str, Any]

    @property
    def decision_id(self) -> str:
        return self.decision["decision_id"]


@dataclass(frozen=True)
class ApprovalState:
    approvals: tuple[Mapping[str, Any], ...]  # approval.granted payloads that count, in order
    rejection: Mapping[str, Any] | None

    def approvers(self) -> set[tuple[str, str]]:
        return {(a["approver"]["kind"], a["approver"]["id"]) for a in self.approvals}


async def decision_lock(conn: Any, decision_id: str) -> None:
    """Serialise approvals, rejections and the execution claim of one decision."""
    await conn.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array("
        "current_schema(), 'decision', $1::text)::text, 0))",
        decision_id,
    )


async def find_decision(conn: Any, decision_id: str) -> DecisionRef | None:
    row = await conn.fetchrow(
        "SELECT stream, seq, payload::text FROM events "
        "WHERE type = $1 AND payload->'decision'->>'decision_id' = $2",
        DECISION_MADE,
        decision_id,
    )
    if row is None:
        return None
    payload = json.loads(row["payload"])
    return DecisionRef(row["stream"], row["seq"], payload["proposal"], payload["decision"])


def _same_actor(a: Any, b: Any) -> bool:
    return (
        isinstance(a, Mapping)
        and isinstance(b, Mapping)
        and (a.get("kind"), a.get("id"))
        == (
            b.get("kind"),
            b.get("id"),
        )
    )


async def approval_state(conn: Any, ref: DecisionRef) -> ApprovalState:
    """Approvals that count: matching hash, from a human who is not the proposer, one per
    approver, and a signature that verifies if there is one. They were checked when written; they
    are checked again here."""
    rows = await conn.fetch(
        "SELECT type, payload::text FROM events WHERE stream = $1 AND type IN ($2, $3) "
        "AND payload->>'decision_id' = $4 ORDER BY seq",
        ref.stream,
        APPROVAL_GRANTED,
        APPROVAL_REJECTED,
        ref.decision_id,
    )
    approvals: list[Mapping[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    rejection = None
    for r in rows:
        payload = json.loads(r["payload"])
        if r["type"] == APPROVAL_REJECTED:
            rejection = rejection or payload
            continue
        approver = payload.get("approver") or {}
        who = (approver.get("kind"), approver.get("id"))
        if (
            payload.get("proposal_hash") == ref.decision["proposal_hash"]
            and approver.get("kind") == "human"
            and not _same_actor(approver, ref.proposal.get("proposer"))
            and who not in seen
            and (
                "signature" not in payload
                or signature_ok(payload["signature"], ref.decision_id, payload["proposal_hash"], approver)
            )
        ):
            seen.add(who)
            approvals.append(payload)
    return ApprovalState(tuple(approvals), rejection)


async def _check_open(
    conn: Any, decision_id: str, actor: Mapping[str, Any]
) -> tuple[DecisionRef, ApprovalState]:
    ref = await find_decision(conn, decision_id)
    if ref is None:
        raise ApprovalError("UNKNOWN_DECISION", f"no decision {decision_id}")
    if ref.decision["outcome"] != NEEDS_APPROVAL:
        raise ApprovalError("NOT_NEEDED", f"decision {decision_id} is {ref.decision['outcome']}")
    if actor.get("kind") != "human":
        raise ApprovalError("NOT_HUMAN", f"only a human may approve or reject, not {actor.get('kind')}")
    state = await approval_state(conn, ref)
    if state.rejection is not None:
        raise ApprovalError("REJECTED", f"decision {decision_id} was rejected")
    executed = await conn.fetchval("SELECT 1 FROM executions WHERE decision_id = $1", decision_id)
    if executed:
        raise ApprovalError("ALREADY_EXECUTED", f"decision {decision_id} has an execution")
    return ref, state


async def _check_signature(
    conn: Any, signature: Mapping[str, Any], decision_id: str, proposal_hash: str, approver: Mapping[str, Any]
) -> dict[str, str]:
    """The key must be registered to this approver and not revoked; the signature must verify over
    the hash the approver sent."""
    key = signature.get("key_id") if isinstance(signature, Mapping) else None
    row = await conn.fetchrow(
        "SELECT k.public_key FROM principal_keys k JOIN principals p USING (principal_id) "
        "WHERE k.key_id = $1 AND k.principal_id = $2 AND p.kind = 'human' "
        "AND k.revoked_at IS NULL AND p.revoked_at IS NULL",
        key,
        approver["id"],
    )
    if row is None:
        raise ApprovalError("UNKNOWN_KEY", f"key {key} is not a registered key of {approver['id']}")
    block = {"alg": signature.get("alg"), "key_id": key, "public_key": row["public_key"]}
    block["value"] = signature.get("value")
    if not signature_ok(block, decision_id, proposal_hash, approver):
        raise ApprovalError("BAD_SIGNATURE", "the signature does not verify over this decision and hash")
    return block


async def approve(
    store: EventStore,
    decision_id: str,
    proposal_hash: str,
    approver: Mapping[str, Any],
    signature: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Append `approval.granted` and return the event, or raise ApprovalError."""
    async with store.transaction() as conn:
        await decision_lock(conn, decision_id)
        ref, state = await _check_open(conn, decision_id, approver)
        block = None
        if signature is not None:
            block = await _check_signature(conn, signature, decision_id, proposal_hash, approver)
        if proposal_hash != ref.decision["proposal_hash"]:
            raise ApprovalError("HASH_MISMATCH", "the hash approved is not the hash of this proposal")
        if _same_actor(approver, ref.proposal.get("proposer")):
            raise ApprovalError("PROPOSER", "the proposer cannot approve their own proposal")
        if (approver["kind"], approver["id"]) in state.approvers():
            raise ApprovalError("DUPLICATE", f"{approver['id']} has already approved this decision")
        payload = {
            "decision_id": decision_id,
            "proposal_hash": proposal_hash,
            "approver": dict(approver),
            "approved_at": utc_timestamp(store.clock()),
        }
        if block is not None:
            payload["signature"] = block
        return await store.append_in(conn, ref.stream, APPROVAL_GRANTED, payload, approver)


async def reject(
    store: EventStore, decision_id: str, reason: str, rejector: Mapping[str, Any]
) -> dict[str, Any]:
    """Append `approval.rejected`; the decision can no longer execute."""
    if not isinstance(reason, str) or not reason.strip():
        raise ApprovalError("NO_REASON", "a rejection needs a reason")
    async with store.transaction() as conn:
        await decision_lock(conn, decision_id)
        ref, _ = await _check_open(conn, decision_id, rejector)
        payload = {
            "decision_id": decision_id,
            "proposal_hash": ref.decision["proposal_hash"],
            "rejector": dict(rejector),
            "reason": reason[:500],
            "rejected_at": utc_timestamp(store.clock()),
        }
        return await store.append_in(conn, ref.stream, APPROVAL_REJECTED, payload, rejector)
