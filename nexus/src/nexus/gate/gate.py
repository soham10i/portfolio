"""Gate.decide: read a snapshot, evaluate, record the decision as an event (P2.md §3-4)."""

from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta
from typing import Any

from ..contracts import Kind, validate
from ..store import EventStore
from ..store.canonical import canonical_json
from ..store.errors import CasConflict, StoreError
from ..store.events import utc_timestamp
from .evaluate import DENY, Snapshot, StateValue, Verdict, evaluate
from .packs import LoadedPack
from .policy import Policy

DECISION_MADE = "decision.made"
GATE_ACTOR = {"kind": "system", "id": "gate"}
KILL_SWITCH = ("system", "kill_switch")
KILL_SWITCH_STREAM = "system/kill_switch"
INVALID_STREAM = "gate/invalid"
NIL_UUID = "00000000-0000-0000-0000-000000000000"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class GateError(RuntimeError):
    """The gate built a decision that does not validate: a bug, never a verdict."""


def parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def proposal_hash(proposal: Any) -> str:
    """sha256 of the canonical proposal; approvals will sign this. A proposal that cannot be
    canonicalised (it is invalid anyway) is hashed from a sorted JSON dump instead."""
    try:
        data = canonical_json(proposal)
    except (ValueError, TypeError):
        data = json.dumps(proposal, sort_keys=True, default=repr).encode()
    return hashlib.sha256(data).hexdigest()


def _uuid_field(proposal: Any, name: str) -> str | None:
    value = proposal.get(name) if isinstance(proposal, Mapping) else None
    return value if isinstance(value, str) and _UUID.fullmatch(value) else None


def kill_switch_on(value: Any) -> bool:
    """Fail closed: only an explicit {"on": false} is off."""
    return not (isinstance(value, Mapping) and value.get("on") is False)


class Gate:
    """Decides proposals against loaded packs and one policy. Every decision is an event."""

    def __init__(self, store: EventStore, packs: Iterable[LoadedPack], policy: Policy) -> None:
        self._store = store
        self.packs = {p.id: p for p in packs}
        self.policy = policy

    async def decide(self, proposal: Mapping[str, Any]) -> dict[str, Any]:
        """Return the decision document after appending it as a `decision.made` event."""
        started = time.perf_counter()
        session_id = _uuid_field(proposal, "session_id")
        stream = f"session/{session_id}" if session_id else INVALID_STREAM
        async with self._store.transaction() as conn:
            # Decisions in one session are serialised, so the rate limit cannot be raced. Lock
            # order: this lock, then the stream head (inside append_in); state writers take a key
            # lock then a stream head, so no cycle is possible.
            await conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array("
                "current_schema(), 'gate', $1::text)::text, 0))",
                stream,
            )
            now = self._store.clock()
            snapshot = await self.snapshot(conn, proposal, stream, now)
            verdict = evaluate(proposal, self.packs, self.policy, snapshot, now)
            decision = self._document(proposal, verdict, now, started)
            issues = validate(Kind.DECISION, decision)
            if issues:
                raise GateError("; ".join(str(i) for i in issues))
            payload = {
                "proposal": proposal if _canonicalisable(proposal) else {"unparsable": repr(proposal)[:500]},
                "decision": decision,
                "pack": verdict.pack.label if verdict.pack else None,
            }
            await self._store.append_in(conn, stream, DECISION_MADE, payload, GATE_ACTOR)
        return decision

    async def recheck(self, proposal: Mapping[str, Any]) -> tuple[Verdict, Snapshot]:
        """Evaluate again on fresh state, recording nothing. The executor runs this just before
        executing; the rate limit is left out because it already counted this decision."""
        session_id = _uuid_field(proposal, "session_id")
        stream = f"session/{session_id}" if session_id else INVALID_STREAM
        now = self._store.clock()
        async with self._store.pool.acquire() as conn:
            snapshot = await self.snapshot(conn, proposal, stream, now, rate_limit=False)
        return evaluate(proposal, self.packs, self.policy, snapshot, now), snapshot

    async def snapshot(
        self, conn: Any, proposal: Any, stream: str, now: datetime, rate_limit: bool = True
    ) -> Snapshot:
        """What `evaluate` needs, read on `conn`: the kill switch, the pack's state and, with
        `rate_limit`, this session's recent non-DENY decisions for the action."""
        action = proposal.get("action") if isinstance(proposal, Mapping) else None
        pack_id = action.partition(":")[0] if isinstance(action, str) else None
        # One statement, so the kill switch and the pack's state come from one snapshot.
        rows = await conn.fetch(
            "SELECT entity, key, value::text, version, updated_at FROM state "
            "WHERE (entity = $1 AND key = $2) OR entity = $3",
            *KILL_SWITCH,
            pack_id if pack_id in self.packs else None,
        )
        state: dict[tuple[str, str], StateValue] = {}
        kill = False
        for r in rows:
            value = json.loads(r["value"])
            if (r["entity"], r["key"]) == KILL_SWITCH:
                kill = kill_switch_on(value)
            else:
                state[(r["entity"], r["key"])] = StateValue(value, r["version"], parse_ts(r["updated_at"]))
        recent: dict[str, list[datetime]] = {}
        resolved = (
            self.packs.get(pack_id).actions.get(action.partition(":")[2]) if pack_id in self.packs else None
        )
        limit = resolved.spec.get("rate_limit") if resolved else None
        if limit and rate_limit and stream != INVALID_STREAM:
            since = utc_timestamp(now - timedelta(seconds=limit["per_s"]))
            times = await conn.fetch(
                "SELECT ts FROM events WHERE stream = $1 AND type = $2 AND ts > $3 "
                "AND payload->'proposal'->>'action' = $4 AND payload->'decision'->>'outcome' <> $5",
                stream,
                DECISION_MADE,
                since,
                action,
                DENY,
            )
            recent[action] = [parse_ts(t["ts"]) for t in times]
        return Snapshot(state, kill, recent)

    def _document(self, proposal: Any, verdict: Verdict, now: datetime, started: float) -> dict[str, Any]:
        return {
            "decision_id": str(uuid.uuid4()),
            "proposal_id": _uuid_field(proposal, "proposal_id") or NIL_UUID,
            "outcome": verdict.outcome,
            "reasons": [r.as_dict() for r in verdict.reasons],
            "approvals_required": verdict.approvals_required,
            "policy_version": self.policy.label,
            "autonomy": verdict.autonomy,
            "state_versions": dict(verdict.state_versions),
            "proposal_hash": proposal_hash(proposal),
            "latency_ms": round((time.perf_counter() - started) * 1000, 3),
            "decided_at": utc_timestamp(now),
        }

    # ── kill switch ─────────────────────────────────────────────────────────────

    async def kill_switch(self) -> bool:
        row = await self._store.state.get(*KILL_SWITCH)
        return row is not None and kill_switch_on(row.value)

    async def set_kill_switch(self, on: bool, actor: Mapping[str, Any], reason: str) -> None:
        await set_kill_switch(self._store, on, actor, reason)


async def set_kill_switch(store: EventStore, on: bool, actor: Mapping[str, Any], reason: str) -> None:
    """Write the kill switch with CAS (retrying on a concurrent write); the write is an event."""
    for _ in range(5):
        row = await store.state.get(*KILL_SWITCH)
        try:
            await store.state.set(
                *KILL_SWITCH,
                {"on": on, "reason": reason},
                row.version if row else 0,
                actor,
                KILL_SWITCH_STREAM,
            )
            return
        except CasConflict:
            continue
    raise StoreError("kill switch: five concurrent writes in a row; try again")


def _canonicalisable(value: Any) -> bool:
    try:
        canonical_json(value)
    except (ValueError, TypeError):
        return False
    return True
