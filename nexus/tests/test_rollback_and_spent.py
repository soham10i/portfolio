"""P4.1: a rollback passes the same limits as the action (ADR-0016), and a decision refused at its
re-check is spent (ADR-0017)."""

from __future__ import annotations

import asyncio
import copy

import pytest

from nexus.exec import Executor, Fault
from nexus.gate import Gate, LoadedPack, Policy, set_kill_switch
from nexus.store import EventStore

from .db import URL
from .exec_support import SENSOR, SESSION, TANK, incidents, mock, proposal, setup

pytestmark = pytest.mark.integration

OPERATOR = {"kind": "human", "id": "operator"}
STREAM = f"session/{SESSION}"

# tank.set, the compensation of tank.fill, may only set 10..90, and never above the safety limit.
LIMITED = copy.deepcopy(TANK)
_set = next(a for a in LIMITED["actions"] if a["id"] == "tank.set")
_set["envelope"] = {"params": {"level": {"min": 10, "max": 90}}, "limits": {"level_max": 80}}
_set["preconditions"] = ["params.level <= envelope.limits.level_max"]


async def limited(schema: str, start: float):
    store = await EventStore.connect(URL, schema=schema)
    await store.state.set("lab", "tank.level", start, 0, SENSOR, "pack/lab")
    await store.state.set("lab", "tank.mode", "idle", 0, SENSOR, "pack/lab")
    gate = Gate(store, [LoadedPack.from_document(LIMITED, "tank")], Policy(name="test", version="1.0.0"))
    binding = mock()
    binding.observed["tank.level"] = start
    binding.faults.append(Fault("error", on="action"))  # the fill fails, so the rollback is needed
    return store, gate, Executor(store, gate, {"lab": binding}), binding


async def incident_payloads(store: EventStore) -> list[dict]:
    return [e["payload"] for e in await store.read(STREAM) if e["type"] == "incident.opened"]


# ── Q-P3-1: rollbacks are checked against the envelope and the safety limits ─────


@pytest.mark.parametrize(
    ("start", "code", "words"),
    [
        (5.0, "ENVELOPE_EXCEEDED", "level=5.0 is outside the envelope (min 10 and max 90)"),
        (85.0, "PRECONDITION_FAILED", "params.level <= envelope.limits.level_max"),
    ],
    ids=["envelope", "safety-limit"],
)
def test_a_rollback_that_breaches_the_limits_is_refused_with_an_incident(db_schema, start, code, words):
    async def body():
        store, gate, executor, binding = await limited(db_schema, start)
        try:
            decision = await gate.decide(proposal(amount=10))
            record = await executor.run(decision["decision_id"])
            opened = await incident_payloads(store)
            level = (await store.state.get("lab", "tank.level")).value
            report = await store.verify_chain()
        finally:
            await store.close()
        return decision, record, opened, level, binding, report

    decision, record, opened, level, binding, report = asyncio.run(body())
    assert decision["outcome"] == "ALLOW"
    assert record.status == "compensation_failed"
    # Only the failed fill reached the device: the rollback never executed.
    assert [(c.action, c.compensation) for c in binding.calls] == [("tank.fill", False)]
    assert [p["kind"] for p in opened] == ["execution_failed", "compensation_refused"]
    refused = opened[1]
    assert [r["code"] for r in refused["reasons"]] == [code]
    assert words in refused["detail"] and "a human must decide" in refused["detail"]
    assert level == start  # nothing changed it
    assert report.ok


def test_a_rollback_within_the_limits_still_runs(db_schema):
    async def body():
        store, gate, executor, binding = await limited(db_schema, 20.0)
        try:
            record = await executor.run((await gate.decide(proposal(amount=10)))["decision_id"])
            kinds = await incidents(store)
        finally:
            await store.close()
        return record, kinds, binding

    record, kinds, binding = asyncio.run(body())
    assert record.status == "compensated" and kinds == ["execution_failed"]
    assert [(c.action, c.compensation) for c in binding.calls] == [("tank.fill", False), ("tank.set", True)]


# ── Q-P3-2: a decision refused at its final re-check is spent ────────────────────


def test_rerunning_a_refused_decision_is_rejected_even_after_the_cause_is_gone(db_schema):
    async def body():
        store, gate, executor, binding = await setup(db_schema)
        try:
            decision = await gate.decide(proposal())
            await set_kill_switch(store, True, OPERATOR, "drill")
            first = await executor.run(decision["decision_id"])
            await set_kill_switch(store, False, OPERATOR, "drill over")
            again = await executor.run(decision["decision_id"])
            events = [e for e in await store.read(STREAM) if e["type"] == "execution.refused"]
            report = await store.verify_chain()
        finally:
            await store.close()
        return first, again, events, binding, report

    first, again, events, binding, report = asyncio.run(body())
    assert first.codes == ["RECHECK_DENIED", "KILL_SWITCH"]
    assert again.status == "refused" and again.duplicate and again.codes == ["DECISION_SPENT"]
    assert "is spent, so propose again with a new key" in again.reasons[0]["message"]
    assert [e["payload"]["code"] for e in events] == ["RECHECK_DENIED", "DECISION_SPENT"]
    assert binding.calls == []
    assert report.ok


def test_a_spent_key_stays_spent_and_a_fresh_proposal_runs(db_schema):
    async def body():
        store, gate, executor, binding = await setup(db_schema)
        try:
            first = await gate.decide(proposal(idempotency_key="fill-once-key"))
            await set_kill_switch(store, True, OPERATOR, "drill")
            spent = await executor.run(first["decision_id"])
            await set_kill_switch(store, False, OPERATOR, "drill over")
            # A new proposal through the gate, but reusing the spent key: still refused.
            same_key = await gate.decide(proposal(idempotency_key="fill-once-key"))
            reused = await executor.run(same_key["decision_id"])
            # A fresh proposal with its own key runs.
            fresh = await executor.run((await gate.decide(proposal()))["decision_id"])
        finally:
            await store.close()
        return spent, same_key, reused, fresh, binding

    spent, same_key, reused, fresh, binding = asyncio.run(body())
    assert spent.codes[0] == "RECHECK_DENIED"
    assert same_key["outcome"] == "ALLOW" and reused.codes == ["DECISION_SPENT"]
    assert fresh.status == "succeeded"
    assert len(binding.calls) == 1
