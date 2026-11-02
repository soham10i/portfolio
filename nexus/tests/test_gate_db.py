"""P2 A8-A10: decisions as events, the kill switch, and the rate limit against Postgres."""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest

from nexus.cli import main
from nexus.contracts import Kind, validate
from nexus.gate import DECISION_MADE, Gate, Policy, proposal_hash, set_kill_switch
from nexus.store import EventStore

from .db import URL
from .gate_support import NOW, SESSION, lab_pack, proposal

pytestmark = pytest.mark.integration

SENSOR = {"kind": "pack", "id": "lab"}
OPERATOR = {"kind": "human", "id": "operator"}
OTHER_SESSION = "11111111-2222-4333-8444-555555555555"


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self):
        return self.now


async def setup(schema: str, clock: Clock | None = None) -> tuple[EventStore, Gate]:
    store = await EventStore.connect(URL, schema=schema, clock=clock)
    await store.state.set("lab", "tank.level", 20.0, 0, SENSOR, "pack/lab")
    await store.state.set("lab", "tank.mode", "idle", 0, SENSOR, "pack/lab")
    return store, Gate(store, [lab_pack()], Policy(name="test", version="1.0.0"))


def test_decide_appends_one_valid_decision_event(db_schema):
    async def body() -> None:
        store, gate = await setup(db_schema)
        try:
            p = proposal()
            decision = await gate.decide(p)
            events = await store.read(f"session/{SESSION}")
            report = await store.verify_chain()
        finally:
            await store.close()
        assert decision["outcome"] == "ALLOW"
        assert validate(Kind.DECISION, decision) == []
        assert decision["proposal_hash"] == proposal_hash(p)
        assert decision["policy_version"] == "test@1.0.0"
        assert decision["state_versions"] == {"tank.mode": 1, "tank.level": 1}
        assert decision["autonomy"] == "L3"
        (event,) = events
        assert event["type"] == DECISION_MADE and event["actor"] == {"kind": "system", "id": "gate"}
        assert event["payload"] == {"proposal": p, "decision": decision, "pack": "lab@0.1.0"}
        assert report.ok, report.problems

    asyncio.run(body())


def test_every_outcome_is_recorded(db_schema):
    async def body() -> None:
        store, gate = await setup(db_schema)
        try:
            outcomes = [
                (await gate.decide(p))["outcome"]
                for p in (
                    proposal(),
                    proposal(amount=60),
                    proposal("lab:tank.heat"),
                )
            ]
            events = await store.read(f"session/{SESSION}")
        finally:
            await store.close()
        assert outcomes == ["ALLOW", "DENY", "NEEDS_APPROVAL"]
        assert [e["payload"]["decision"]["outcome"] for e in events] == outcomes
        assert all(validate(Kind.DECISION, e["payload"]["decision"]) == [] for e in events)
        assert events[2]["payload"]["decision"]["approvals_required"] == 1

    asyncio.run(body())


@pytest.mark.parametrize("bad", [{"rationale": "no ids"}, {"session_id": "nope", "proposal_id": 3}])
def test_invalid_proposals_are_recorded_on_the_invalid_stream(db_schema, bad):
    async def body() -> None:
        store, gate = await setup(db_schema)
        try:
            decision = await gate.decide(bad)
            (event,) = await store.read("gate/invalid")
        finally:
            await store.close()
        assert decision["outcome"] == "DENY"
        assert [r["code"] for r in decision["reasons"]] == ["PROPOSAL_INVALID"]
        assert decision["proposal_id"] == "00000000-0000-0000-0000-000000000000"
        assert event["payload"]["proposal"] == bad and event["payload"]["pack"] is None

    asyncio.run(body())


def test_stale_state_by_the_store_clock(db_schema):
    async def body() -> None:
        clock = Clock()
        store, gate = await setup(db_schema, clock)
        try:
            clock.now = NOW + timedelta(seconds=10)
            fresh = await gate.decide(proposal())
            clock.now = NOW + timedelta(seconds=11)
            stale = await gate.decide(proposal())
        finally:
            await store.close()
        assert fresh["outcome"] == "ALLOW"
        assert (stale["outcome"], [r["code"] for r in stale["reasons"]]) == (
            "DENY",
            ["STATE_STALE", "STATE_STALE"],
        )

    asyncio.run(body())


# ── A9: kill switch ────────────────────────────────────────────────────────────


def test_kill_switch_denies_everything_until_turned_off(db_schema):
    async def body() -> None:
        store, gate = await setup(db_schema)
        try:
            before = await gate.decide(proposal())
            await set_kill_switch(store, True, OPERATOR, "maintenance")
            during = [await gate.decide(p) for p in (proposal(), proposal("lab:tank.heat"), {"x": 1})]
            await gate.set_kill_switch(False, OPERATOR, "done")
            after = await gate.decide(proposal())
            switch_events = await store.read("system/kill_switch")
            on = await gate.kill_switch()
        finally:
            await store.close()
        assert before["outcome"] == "ALLOW" and after["outcome"] == "ALLOW" and on is False
        assert all([r["code"] for r in d["reasons"]] == ["KILL_SWITCH"] for d in during)
        assert [e["payload"]["value"] for e in switch_events] == [
            {"on": True, "reason": "maintenance"},
            {"on": False, "reason": "done"},
        ]
        assert all(e["actor"] == OPERATOR for e in switch_events)

    asyncio.run(body())


def test_kill_switch_with_an_unreadable_value_counts_as_on(db_schema):
    async def body() -> None:
        store, gate = await setup(db_schema)
        try:
            await store.state.set("system", "kill_switch", "off", 0, OPERATOR, "system/kill_switch")
            decision = await gate.decide(proposal())
        finally:
            await store.close()
        assert [r["code"] for r in decision["reasons"]] == ["KILL_SWITCH"]

    asyncio.run(body())


def test_cli_kill_switch(db_schema, capsys, monkeypatch):
    monkeypatch.setenv("NEXUS_DB_URL", URL)
    monkeypatch.setenv("NEXUS_ACTOR", "cli-test")
    assert main(["kill-switch", "status"]) == 0
    assert capsys.readouterr().out == "kill switch off (never set)\n"
    assert main(["kill-switch", "on", "--reason", "drill"]) == 0
    assert capsys.readouterr().out == "kill switch on (version 1: drill)\n"

    async def decide() -> tuple[str, list]:
        store, gate = await setup(db_schema)
        try:
            decision = await gate.decide(proposal())
            events = await store.read("system/kill_switch")
        finally:
            await store.close()
        return [r["code"] for r in decision["reasons"]], events

    codes, events = asyncio.run(decide())
    assert codes == ["KILL_SWITCH"] and events[0]["actor"] == {"kind": "human", "id": "cli-test"}
    assert main(["kill-switch", "off"]) == 0
    assert capsys.readouterr().out == "kill switch off (version 2: set from the command line)\n"
    assert main(["kill-switch", "sideways"]) == 2


# ── A10: rate limit ────────────────────────────────────────────────────────────


def test_rate_limit_counts_non_deny_decisions_in_the_session_window(db_schema):
    async def body() -> None:
        clock = Clock()
        store, gate = await setup(db_schema, clock)
        try:
            outcomes = []
            for p in (
                proposal(),
                proposal(amount=60),
                proposal(),
                proposal(),
                proposal(session_id=OTHER_SESSION),
            ):
                clock.now += timedelta(seconds=1)
                outcomes.append(await gate.decide(p))
            clock.now = NOW + timedelta(
                seconds=62
            )  # both ALLOWs at +1 s and +3 s: only +3 s is in the window
            await store.state.set("lab", "tank.level", 20.0, 1, SENSOR, "pack/lab")
            await store.state.set("lab", "tank.mode", "idle", 1, SENSOR, "pack/lab")
            later = await gate.decide(proposal())
        finally:
            await store.close()
        codes = [[r["code"] for r in d["reasons"]] for d in outcomes]
        assert codes == [[], ["ENVELOPE_EXCEEDED"], [], ["RATE_LIMITED"], []]
        assert later["outcome"] == "ALLOW"

    asyncio.run(body())


def test_concurrent_decisions_cannot_race_the_rate_limit(db_schema):
    async def body() -> None:
        store, gate = await setup(db_schema)
        try:
            decisions = await asyncio.gather(*(gate.decide(proposal()) for _ in range(20)))
            report = await store.verify_chain()
        finally:
            await store.close()
        outcomes = sorted(d["outcome"] for d in decisions)
        assert outcomes == ["ALLOW"] * 2 + ["DENY"] * 18
        assert report.ok

    asyncio.run(body())
