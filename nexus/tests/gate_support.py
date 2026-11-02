"""A small pack and proposal builder for the gate tests: one action per row of P2.md §3."""

from __future__ import annotations

import copy
from datetime import UTC, datetime, timedelta
from typing import Any

from nexus.gate import LoadedPack, Snapshot, StateValue

NOW = datetime(2026, 10, 30, 10, 0, 0, tzinfo=UTC)
SESSION = "0b7e9c1d-2f3a-4b5c-8d6e-7f8091a2b3c4"
PROPOSAL_ID = "6f1c2a3e-8b4d-4e5f-9a1b-2c3d4e5f6a7b"


def _action(id: str, risk: str, autonomy: str, preconditions: list[str], **extra: Any) -> dict[str, Any]:
    if autonomy == "L3":  # L3 must be verifiable and undoable
        extra |= {"verify_within_s": 10, "compensation": {"action": id, "params": {"amount": "0.0"}}}
    return {
        "id": id,
        "title": id,
        "risk": risk,
        "autonomy": autonomy,
        "params": {
            "type": "object",
            "properties": {"amount": {"type": "number", "minimum": 0, "maximum": 100}},
            "required": ["amount"],
            "additionalProperties": False,
        },
        "preconditions": preconditions,
        "effects": [],
        **extra,
    }


LAB = {
    "schema_version": "1",
    "pack": "lab",
    "version": "0.1.0",
    "owner": "test",
    "title": "Lab",
    "description": "A tank with valves, for the gate tests.",
    "observables": [
        {"id": "tank.level", "type": "number", "max_age_s": 10},
        {"id": "tank.mode", "type": "enum", "enum_values": ["idle", "busy"], "max_age_s": 10},
        {"id": "valve[*].open", "type": "boolean", "max_age_s": 10},
    ],
    "actions": [
        _action(
            "tank.fill",
            "low",
            "L3",
            ["state.tank.mode == 'idle'", "state.tank.level + params.amount <= 100.0"],
            envelope={"params": {"amount": {"max": 50}}},
            rate_limit={"max": 2, "per_s": 60},
        ),
        _action("tank.watch", "low", "L0", []),
        _action("tank.drain", "medium", "L1", []),
        _action("tank.heat", "high", "L2", [], approvers=1),
        _action("tank.purge", "critical", "L2", [], approvers=2),
        _action("tank.broken", "low", "L3", ["params.amount > 'x'"]),
        _action("tank.level_only", "low", "L3", ["state.tank.level"]),
        _action("tank.valve", "low", "L3", ["state.valve[1].open"]),
    ],
    "connector": {"kind": "python", "module": "lab.binding"},
}


def lab_pack(**changes: Any) -> LoadedPack:
    doc = copy.deepcopy(LAB)
    doc.update(changes)
    return LoadedPack.from_document(doc, "lab")


def proposal(action: str = "lab:tank.fill", amount: Any = 10, **changes: Any) -> dict[str, Any]:
    doc = {
        "proposal_id": PROPOSAL_ID,
        "session_id": SESSION,
        "action": action,
        "params": {"amount": amount},
        "rationale": "test",
        "context": [{"source": "user", "ref": "msg/1", "triggered": True}],
        "proposer": {"kind": "agent", "id": "planner"},
        "created_at": "2026-10-30T10:00:00Z",
    }
    doc.update(changes)
    return doc


def fresh(age_s: float = 1) -> datetime:
    return NOW - timedelta(seconds=age_s)


def snapshot(level: Any = 20.0, mode: Any = "idle", age_s: float = 1, **kw: Any) -> Snapshot:
    state = {
        ("lab", "tank.level"): StateValue(level, 3, fresh(age_s)),
        ("lab", "tank.mode"): StateValue(mode, 5, fresh(1)),
    }
    state.update(kw.pop("extra", {}))
    return Snapshot(state, **kw)
