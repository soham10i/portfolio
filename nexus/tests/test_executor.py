"""P3 A2-A5, A7-A8: once-only execution, failures, compensation, shadow mode and the re-check."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from nexus.cli import main
from nexus.exec import BindingError, Fault, approve
from nexus.gate import set_kill_switch
from nexus.store import EventStore

from .exec_support import ALICE, SESSION, incidents, mock, proposal, setup, types

pytestmark = pytest.mark.integration

OPERATOR = {"kind": "human", "id": "operator"}


async def level(store: EventStore) -> float:
    return (await store.state.get("lab", "tank.level")).value


# ── A8: happy path ─────────────────────────────────────────────────────────────


def test_allowed_fill_executes_verifies_and_records_every_step(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            decision = await gate.decide(proposal(amount=10))
            record = await executor.run(decision["decision_id"])
            events = await store.read(f"session/{SESSION}")
            report = await store.verify_chain()
            filled = await level(store)
            row = await store.pool.fetchrow("SELECT status, verification FROM executions")
        finally:
            await store.close()
        assert decision["outcome"] == "ALLOW"
        assert (record.status, record.verification, record.duplicate) == ("succeeded", "passed", False)
        assert [c.action for c in binding.calls] == ["tank.fill"]
        assert binding.calls[0].params == {"amount": 10} and not binding.calls[0].compensation
        assert filled == 30.0
        assert [e["type"] for e in events] == [
            "decision.made",
            "execution.started",
            "execution.called",
            "execution.verified",
            "execution.finished",
        ]
        assert {e["trace_id"] for e in events[1:]} == {record.trace_id}
        assert events[3]["payload"]["observed"] == {"tank.level": 30.0, "tank.mode": "idle"}
        assert (row["status"], row["verification"]) == ("succeeded", "passed")
        assert report.ok, report.problems

    asyncio.run(body())
    assert main(["state", "check"]) == 0
    assert main(["chain", "verify", "--no-anchor"]) == 0


# ── A2: at most once ───────────────────────────────────────────────────────────


def test_running_a_decision_twice_executes_once(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            decision = await gate.decide(proposal())
            first = await executor.run(decision["decision_id"])
            second = await executor.run(decision["decision_id"])
        finally:
            await store.close()
        assert (first.status, first.duplicate) == ("succeeded", False)
        assert (second.status, second.duplicate) == ("succeeded", True)
        assert second.idempotency_key == first.idempotency_key
        assert len(binding.calls) == 1

    asyncio.run(body())


def test_twenty_concurrent_runs_execute_once(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            decision = await gate.decide(proposal())
            records = await asyncio.gather(*(executor.run(decision["decision_id"]) for _ in range(20)))
            started = (await types(store)).count("execution.started")
        finally:
            await store.close()
        assert sum(not r.duplicate for r in records) == 1
        assert len(binding.calls) == 1 and started == 1

    asyncio.run(body())


def test_two_proposals_sharing_an_idempotency_key_execute_once(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            a = await gate.decide(proposal(idempotency_key="fill-batch-0042"))
            b = await gate.decide(proposal(idempotency_key="fill-batch-0042"))
            first = await executor.run(a["decision_id"])
            second = await executor.run(b["decision_id"])
        finally:
            await store.close()
        assert a["outcome"] == b["outcome"] == "ALLOW"
        assert (first.duplicate, second.duplicate) == (False, True)
        assert second.decision_id == a["decision_id"]  # the record of the execution that ran
        assert len(binding.calls) == 1

    asyncio.run(body())


# ── A3: failures are compensated, with params from `prev` ─────────────────────


@pytest.mark.parametrize(
    ("fault", "verification", "error"),
    [
        (Fault("error", on="action"), "not_run", "BindingError: injected failure on tank.fill"),
        (Fault("delay", on="action", seconds=3), "not_run", "timed out after 1 s"),
        (Fault("no_effect", on="action"), "failed", "effects did not hold within 1 s (failed)"),
    ],
    ids=["exception", "timeout", "effects-never-hold"],
)
def test_failed_execution_is_compensated_and_opens_an_incident(db_schema, fault, verification, error):
    async def body() -> None:
        binding = mock()
        binding.faults.append(fault)
        store, gate, executor, _ = await setup(db_schema, binding)
        try:
            decision = await gate.decide(proposal(amount=10))
            record = await executor.run(decision["decision_id"])
            kinds = await incidents(store)
            final = await level(store)
            report = await store.verify_chain()
        finally:
            await store.close()
        assert (record.status, record.verification, record.error) == ("compensated", verification, error)
        calls = [(c.action, c.compensation) for c in binding.calls]
        assert calls == [("tank.fill", False), ("tank.set", True)]
        assert binding.calls[1].params == {"level": 20.0}  # prev.tank.level
        assert final == 20.0
        assert kinds == ["execution_failed"] and len(record.incident_ids) == 1
        assert report.ok

    asyncio.run(body())


def test_a_partial_effect_is_undone_to_prev(db_schema):
    """The device moved, but not by the amount asked: compensation restores the level before."""

    async def body() -> None:
        binding = mock()
        binding.effects = {**binding.effects, "tank.fill": lambda o, p: o.update({"tank.level": 23.0})}
        store, gate, executor, _ = await setup(db_schema, binding)
        try:
            record = await executor.run((await gate.decide(proposal(amount=10)))["decision_id"])
            final = await level(store)
        finally:
            await store.close()
        assert record.status == "compensated" and final == 20.0

    asyncio.run(body())


# ── A4: a compensation is never compensated ────────────────────────────────────


def test_failing_compensation_opens_an_incident_and_stops(db_schema):
    async def body() -> None:
        binding = mock()
        binding.faults += [Fault("error", on="action"), Fault("error", on="compensation", times=-1)]
        store, gate, executor, _ = await setup(db_schema, binding)
        try:
            record = await executor.run((await gate.decide(proposal()))["decision_id"])
            kinds = await incidents(store)
        finally:
            await store.close()
        assert record.status == "compensation_failed"
        assert len(binding.calls) == 2  # the action and one compensation, nothing more
        assert kinds == ["execution_failed", "compensation_failed"]

    asyncio.run(body())


def test_compensation_whose_effects_never_hold_is_not_compensated_again(db_schema):
    async def body() -> None:
        binding = mock()
        binding.faults += [Fault("error", on="action"), Fault("no_effect", on="compensation", times=-1)]
        binding.observed["tank.level"] = 25.0  # the failed fill left the tank somewhere else
        store, gate, executor, _ = await setup(db_schema, binding)
        try:
            record = await executor.run((await gate.decide(proposal()))["decision_id"])
            kinds = await incidents(store)
        finally:
            await store.close()
        assert record.status == "compensation_failed" and len(binding.calls) == 2
        assert kinds == ["execution_failed", "compensation_failed"]

    asyncio.run(body())


# ── A5: shadow mode ────────────────────────────────────────────────────────────


def test_shadow_mode_records_and_executes_nothing(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema, shadow=True)
        try:
            allowed = await gate.decide(proposal())
            held = await gate.decide(proposal("lab:tank.heat"))
            await approve(store, held["decision_id"], held["proposal_hash"], ALICE)
            records = [await executor.run(d["decision_id"]) for d in (allowed, held)]
            agree = await executor.record_human(allowed["decision_id"], "ALLOW", ALICE)
            disagree = await executor.record_human(held["decision_id"], "DENY", ALICE)
            seen = await types(store)
            unchanged = await level(store)
        finally:
            await store.close()
        assert [r.status for r in records] == ["shadowed", "shadowed"]
        assert binding.calls == []
        assert seen.count("execution.shadowed") == 2 and "execution.called" not in seen
        assert unchanged == 20.0
        assert agree["type"] == "shadow.compared"
        assert agree["payload"] == {
            "decision_id": allowed["decision_id"],
            "gate_outcome": "ALLOW",
            "human_outcome": "ALLOW",
            "agree": True,
        }
        assert disagree["payload"]["agree"] is False
        assert disagree["payload"]["gate_outcome"] == "NEEDS_APPROVAL"

    asyncio.run(body())


# ── A7: re-check at execution time ─────────────────────────────────────────────


def test_kill_switch_between_decision_and_execution_refuses(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            decision = await gate.decide(proposal())
            await set_kill_switch(store, True, OPERATOR, "drill")
            record = await executor.run(decision["decision_id"])
            again = await executor.run(decision["decision_id"])
        finally:
            await store.close()
        assert decision["outcome"] == "ALLOW"
        assert record.status == "refused" and record.codes == ["RECHECK_DENIED", "KILL_SWITCH"]
        assert again.duplicate and again.status == "refused"  # a refused claim stays refused
        assert binding.calls == []

    asyncio.run(body())


class Clock:
    def __init__(self) -> None:
        self.now = datetime.now(UTC)

    def __call__(self) -> datetime:
        return self.now


def test_state_gone_stale_between_decision_and_execution_refuses(db_schema):
    async def body() -> None:
        clock = Clock()
        store, gate, executor, binding = await setup(db_schema, clock=clock)
        try:
            decision = await gate.decide(proposal())
            clock.now += timedelta(seconds=61)  # tank.* max_age_s is 60
            record = await executor.run(decision["decision_id"])
        finally:
            await store.close()
        assert decision["outcome"] == "ALLOW"
        assert record.status == "refused" and set(record.codes) == {"RECHECK_DENIED", "STATE_STALE"}
        assert binding.calls == []

    asyncio.run(body())


def test_state_changed_so_the_precondition_fails_refuses(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            decision = await gate.decide(proposal())
            await store.state.set("lab", "tank.mode", "busy", 1, {"kind": "pack", "id": "lab"}, "pack/lab")
            record = await executor.run(decision["decision_id"])
        finally:
            await store.close()
        assert record.codes == ["RECHECK_DENIED", "PRECONDITION_FAILED"] and binding.calls == []

    asyncio.run(body())


class PullsTheSwitch:
    """A device that fails, while an operator turns the kill switch on."""

    def __init__(self, store_box: list[EventStore]) -> None:
        self.calls: list = []
        self._box = store_box

    async def execute(self, request) -> None:
        self.calls.append(request)
        await set_kill_switch(self._box[0], True, OPERATOR, "operator pulled it mid-run")
        raise BindingError("device fault")

    async def observe(self):
        return {"tank.level": 27.0, "tank.mode": "idle"}


def test_kill_switch_during_a_failure_blocks_the_compensation(db_schema):
    async def body() -> None:
        box: list[EventStore] = []
        binding = PullsTheSwitch(box)
        store, gate, executor, _ = await setup(db_schema, binding)
        box.append(store)
        try:
            record = await executor.run((await gate.decide(proposal()))["decision_id"])
            kinds = await incidents(store)
        finally:
            await store.close()
        assert record.status == "compensation_failed"
        assert len(binding.calls) == 1  # the compensation never reached the device
        assert kinds == ["execution_failed", "compensation_blocked"]

    asyncio.run(body())


# ── step 1 refusals ────────────────────────────────────────────────────────────


def test_denied_and_unknown_decisions_are_refused_without_a_claim(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            denied = await gate.decide(proposal(amount=90))
            record = await executor.run(denied["decision_id"])
            unknown = await executor.run("00000000-0000-4000-8000-000000000000")
            claims = await store.pool.fetchval("SELECT count(*) FROM executions")
            unknown_events = await store.read("exec/unknown")
        finally:
            await store.close()
        assert denied["outcome"] == "DENY"
        assert record.codes == ["DENIED", "PRECONDITION_FAILED"]
        assert unknown.codes == ["UNKNOWN_DECISION"]
        assert [e["type"] for e in unknown_events] == ["execution.refused"]
        assert claims == 0 and binding.calls == []

    asyncio.run(body())


def test_a_pack_without_a_binding_is_refused(db_schema):
    async def body() -> None:
        store, gate, executor, _ = await setup(db_schema)
        executor.bindings.clear()
        try:
            record = await executor.run((await gate.decide(proposal()))["decision_id"])
        finally:
            await store.close()
        assert record.codes == ["NO_BINDING"]

    asyncio.run(body())
