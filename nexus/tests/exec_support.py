"""A tank pack wired to a MockBinding for the executor tests: fill (L3, verified, compensated by
set), set (L3, compensates itself, ADR-0010), heat (high, one approver), purge (critical, two)."""

from __future__ import annotations

import uuid
from typing import Any

from nexus.exec import Executor, MockBinding
from nexus.gate import Gate, LoadedPack, Policy
from nexus.store import EventStore

from .db import URL

SESSION = "0b7e9c1d-2f3a-4b5c-8d6e-7f8091a2b3c4"
SENSOR = {"kind": "pack", "id": "lab"}
ALICE = {"kind": "human", "id": "alice"}
BOB = {"kind": "human", "id": "bob"}
PLANNER = {"kind": "agent", "id": "planner"}


def _params(name: str) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {name: {"type": "number", "minimum": 0, "maximum": 100}},
        "required": [name],
        "additionalProperties": False,
    }


TANK = {
    "schema_version": "1",
    "pack": "lab",
    "version": "0.2.0",
    "owner": "test",
    "title": "Lab tank",
    "description": "A tank the executor tests fill, set, heat and purge.",
    "observables": [
        {"id": "tank.level", "type": "number", "max_age_s": 60},
        {"id": "tank.mode", "type": "enum", "enum_values": ["idle", "busy"], "max_age_s": 60},
    ],
    "actions": [
        {
            "id": "tank.fill",
            "title": "Fill",
            "risk": "low",
            "autonomy": "L3",
            "params": _params("amount"),
            "preconditions": ["state.tank.mode == 'idle'", "state.tank.level + params.amount <= 100.0"],
            "effects": ["state.tank.level == prev.tank.level + params.amount"],
            "verify_within_s": 1,
            "timeout_s": 1,
            "compensation": {"action": "tank.set", "params": {"level": "prev.tank.level"}},
        },
        {
            "id": "tank.set",
            "title": "Set level",
            "risk": "low",
            "autonomy": "L3",
            "params": _params("level"),
            "preconditions": [],
            "effects": ["state.tank.level == params.level"],
            "verify_within_s": 1,
            "timeout_s": 1,
            "compensation": {"action": "tank.set", "params": {"level": "prev.tank.level"}},
        },
        {
            "id": "tank.heat",
            "title": "Heat",
            "risk": "high",
            "autonomy": "L2",
            "params": _params("amount"),
            "preconditions": [],
            "effects": [],
            "approvers": 1,
        },
        {
            "id": "tank.purge",
            "title": "Purge",
            "risk": "critical",
            "autonomy": "L2",
            "params": _params("amount"),
            "preconditions": [],
            "effects": [],
            "approvers": 2,
        },
    ],
    "connector": {"kind": "python", "module": "lab.binding"},
}


def _fill(observed: dict[str, Any], params: Any) -> None:
    observed["tank.level"] = observed["tank.level"] + params["amount"]


def _set(observed: dict[str, Any], params: Any) -> None:
    observed["tank.level"] = params["level"]


def mock() -> MockBinding:
    noop = lambda *_: None  # noqa: E731
    effects = {"tank.fill": _fill, "tank.set": _set, "tank.heat": noop, "tank.purge": noop}
    return MockBinding(effects, {"tank.level": 20.0, "tank.mode": "idle"})


def proposal(action: str = "lab:tank.fill", amount: float = 10, **changes: Any) -> dict[str, Any]:
    doc = {
        "proposal_id": str(uuid.uuid4()),
        "session_id": SESSION,
        "action": action,
        "params": {"amount": amount},
        "rationale": "test",
        "context": [{"source": "user", "ref": "msg/1", "triggered": True}],
        "proposer": PLANNER,
        "created_at": "2026-10-30T10:00:00Z",
    }
    doc.update(changes)
    return doc


async def setup(
    schema: str, binding: Any = None, shadow: bool = False, clock: Any = None
) -> tuple[EventStore, Gate, Executor, Any]:
    store = await EventStore.connect(URL, schema=schema, clock=clock)
    await store.state.set("lab", "tank.level", 20.0, 0, SENSOR, "pack/lab")
    await store.state.set("lab", "tank.mode", "idle", 0, SENSOR, "pack/lab")
    gate = Gate(store, [LoadedPack.from_document(TANK, "tank")], Policy(name="test", version="1.0.0"))
    binding = binding if binding is not None else mock()
    return store, gate, Executor(store, gate, {"lab": binding}, shadow=shadow), binding


async def types(store: EventStore) -> list[str]:
    return [e["type"] for e in await store.read(f"session/{SESSION}")]


async def incidents(store: EventStore) -> list[str]:
    events = await store.read(f"session/{SESSION}")
    return [e["payload"]["kind"] for e in events if e["type"] == "incident.opened"]
