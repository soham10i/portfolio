"""P4 A3-A6: evidence packs rebuilt from the log validate, explain every reason, and `nexus trace`."""

from __future__ import annotations

import asyncio
import json

import pytest

from nexus.cli import main
from nexus.contracts import Kind, validate
from nexus.evidence import GATE_CHECKS, Evidence, build_evidence
from nexus.exec import Fault, approve, reject
from nexus.gate import set_kill_switch

from .db import raw
from .exec_support import ALICE, BOB, SESSION, proposal, setup

pytestmark = pytest.mark.integration

STREAM = f"session/{SESSION}"


def _build(schema: str, scenario) -> tuple[Evidence, dict]:
    """Run `scenario(store, gate, executor, binding) -> decision` and build its evidence pack."""

    async def body() -> tuple[Evidence, dict]:
        store, gate, executor, binding = await setup(schema)
        try:
            decision = await scenario(store, gate, executor, binding)
            evidence = await build_evidence(store, decision["decision_id"])
        finally:
            await store.close()
        assert evidence is not None
        return evidence, decision

    return asyncio.run(body())


def _failed(evidence: Evidence) -> dict[str, str]:
    return {c["name"]: c.get("detail", "") for c in evidence.pack["checks"] if not c["passed"]}


def _names(evidence: Evidence) -> list[str]:
    return [c["name"] for c in evidence.pack["checks"]]


def _assert_explains_every_reason(evidence: Evidence) -> None:
    """A4: each reason code of the decision belongs to exactly one failed gate check."""
    failed = set(_failed(evidence))
    owners = {code: name for name, codes in GATE_CHECKS for code in codes}
    for reason in evidence.pack["decision"]["reasons"]:
        assert owners[reason["code"]] in failed, reason
    gate_failed = failed & {name for name, _ in GATE_CHECKS}
    assert gate_failed == {owners[r["code"]] for r in evidence.pack["decision"]["reasons"]}


def _assert_sound(evidence: Evidence) -> None:
    assert evidence.issues == [], evidence.issues
    assert validate(Kind.EVIDENCE, evidence.pack) == []
    assert evidence.intact
    _assert_explains_every_reason(evidence)


# ── A3 / A4: every outcome gives a valid pack whose checks match the decision ──────────────────


def test_allow_executed_and_verified(db_schema):
    async def scenario(store, gate, executor, binding):
        decision = await gate.decide(proposal())
        await executor.run(decision["decision_id"])
        return decision

    evidence, decision = _build(db_schema, scenario)
    _assert_sound(evidence)
    pack = evidence.pack
    assert _names(evidence) == [name for name, _ in GATE_CHECKS] + ["recheck"]
    assert _failed(evidence) == {}
    assert pack["execution"]["status"] == "succeeded" and "error" not in pack["execution"]
    assert pack["verification"] == {"status": "passed", "observed": {"tank.level": 30.0, "tank.mode": "idle"}}
    types = [e["type"] for e in evidence.events]
    assert types == [
        "decision.made",
        "execution.started",
        "execution.called",
        "state.set",
        "execution.verified",
        "execution.finished",
    ]
    assert {r["stream"] for r in pack["event_refs"]} == {STREAM, "pack/lab"}
    assert pack["decision"] == decision and pack["approvals"] == []


@pytest.mark.parametrize(
    ("amount", "names", "failed"),
    [
        (200, ["kill_switch", "schema", "action_known", "params"], "params"),
        (90, [name for name, _ in GATE_CHECKS[:8]], "preconditions"),
    ],
    ids=["params-stop-early", "preconditions-skip-taint"],
)
def test_deny_lists_only_the_checks_that_ran(db_schema, amount, names, failed):
    async def scenario(store, gate, executor, binding):
        decision = await gate.decide(proposal(amount=amount))
        await executor.run(decision["decision_id"])
        return decision

    evidence, decision = _build(db_schema, scenario)
    _assert_sound(evidence)
    assert decision["outcome"] == "DENY"
    assert _names(evidence) == names and list(_failed(evidence)) == [failed]
    assert evidence.pack["execution"] == {
        "status": "not_run",
        "error": {"code": "DENIED", "message": "execution refused: DENIED"},
    }
    assert evidence.pack["verification"] == {"status": "not_run"}


def test_needs_approval_pending(db_schema):
    async def pending(store, gate, executor, binding):
        decision = await gate.decide(proposal("lab:tank.heat"))
        await executor.run(decision["decision_id"])
        return decision

    evidence, _ = _build(db_schema, pending)
    _assert_sound(evidence)
    assert _failed(evidence) == {
        "risk_routing": "lab:tank.heat is at L2: a human approves each execution; "
        "high-risk actions always need human approval",
        "approvals": "0 of 1 distinct human approval",
    }
    assert evidence.pack["execution"]["error"]["code"] == "NOT_APPROVED"


def test_needs_approval_approved(db_schema):
    async def approved(store, gate, executor, binding):
        decision = await gate.decide(proposal("lab:tank.heat"))
        await approve(store, decision["decision_id"], decision["proposal_hash"], ALICE)
        await executor.run(decision["decision_id"])
        return decision

    evidence, decision = _build(db_schema, approved)
    _assert_sound(evidence)
    assert list(_failed(evidence)) == ["risk_routing"]
    assert evidence.pack["approvals"][0]["approver"] == ALICE
    assert evidence.pack["approvals"][0]["proposal_hash"] == decision["proposal_hash"]
    assert evidence.pack["execution"]["status"] == "succeeded"
    assert evidence.pack["verification"]["status"] == "not_run"  # tank.heat declares no effects


def test_needs_approval_rejected(db_schema):
    async def scenario(store, gate, executor, binding):
        decision = await gate.decide(proposal("lab:tank.purge"))
        await approve(store, decision["decision_id"], decision["proposal_hash"], ALICE)
        await reject(store, decision["decision_id"], "wrong batch", BOB)
        await executor.run(decision["decision_id"])
        return decision

    evidence, _ = _build(db_schema, scenario)
    _assert_sound(evidence)
    assert _failed(evidence)["approvals"] == "rejected by bob: wrong batch"
    assert evidence.pack["execution"]["error"]["code"] == "REJECTED"
    assert [e["type"] for e in evidence.events].count("approval.rejected") == 1


def test_compensated_failure(db_schema):
    async def scenario(store, gate, executor, binding):
        binding.faults.append(Fault("error", on="action"))
        decision = await gate.decide(proposal())
        await executor.run(decision["decision_id"])
        return decision

    evidence, _ = _build(db_schema, scenario)
    _assert_sound(evidence)
    execution = evidence.pack["execution"]
    assert execution["status"] == "compensated"
    assert execution["error"] == {
        "code": "EXECUTION_FAILED",
        "message": "BindingError: injected failure on tank.fill",
    }
    # The compensation verified, but the pack's verification is the action's own: it never ran.
    assert evidence.pack["verification"] == {"status": "not_run"}
    assert "incident.opened" in [e["type"] for e in evidence.events]
    (incident,) = evidence.pack["incidents"]  # Q-P4-1: explicit, not only in the timeline
    opened = next(e for e in evidence.events if e["type"] == "incident.opened")
    assert incident == {
        "incident_id": opened["payload"]["incident_id"],
        "kind": "execution_failed",
        "detail": "BindingError: injected failure on tank.fill",
        "opened_at": opened["ts"],
    }
    assert evidence.pack["shadow"] == {"active": False, "comparisons": []}


def test_shadow_run_with_a_human_comparison(db_schema):
    """Q-P4-1: a shadowed run says so explicitly, with the human's verdict next to the gate's."""

    async def body() -> Evidence:
        store, gate, executor, binding = await setup(db_schema, shadow=True)
        try:
            decision = await gate.decide(proposal())
            await executor.run(decision["decision_id"])
            await executor.record_human(decision["decision_id"], "DENY", ALICE)
            evidence = await build_evidence(store, decision["decision_id"])
        finally:
            await store.close()
        assert binding.calls == []
        return evidence

    evidence = asyncio.run(body())
    _assert_sound(evidence)
    shadow = evidence.pack["shadow"]
    assert shadow["active"] is True and evidence.pack["incidents"] == []
    (comparison,) = shadow["comparisons"]
    assert (comparison["human"], comparison["human_outcome"], comparison["agree"]) == (ALICE, "DENY", False)


def test_refused_at_recheck(db_schema):
    async def scenario(store, gate, executor, binding):
        decision = await gate.decide(proposal())
        await set_kill_switch(store, True, ALICE, "drill")
        await executor.run(decision["decision_id"])
        return decision

    evidence, _ = _build(db_schema, scenario)
    _assert_sound(evidence)
    assert _failed(evidence) == {"recheck": "RECHECK_DENIED, KILL_SWITCH"}
    assert evidence.pack["execution"]["status"] == "not_run"
    assert evidence.pack["execution"]["error"]["code"] == "RECHECK_DENIED"


# ── A5: lookup ──────────────────────────────────────────────────────────────────


def test_lookup_by_decision_proposal_or_key(db_schema):
    async def body() -> list:
        store, gate, executor, _ = await setup(db_schema)
        try:
            doc = proposal(idempotency_key="fill-the-tank-once")
            decision = await gate.decide(doc)
            await executor.run(decision["decision_id"])
            idents = [decision["decision_id"], doc["proposal_id"], "fill-the-tank-once"]
            packs = [(await build_evidence(store, i)).pack for i in idents]
            missing = await build_evidence(store, "no-such-thing")
        finally:
            await store.close()
        return [*packs, missing]

    by_decision, by_proposal, by_key, missing = asyncio.run(body())
    assert by_decision == by_proposal == by_key and missing is None


def test_a_proposal_id_finds_its_latest_decision(db_schema):
    async def body() -> tuple:
        store, gate, _, _ = await setup(db_schema)
        try:
            doc = proposal()
            await gate.decide(doc)
            second = await gate.decide(doc)
            return second, await build_evidence(store, doc["proposal_id"])
        finally:
            await store.close()

    second, evidence = asyncio.run(body())
    assert evidence.decision_id == second["decision_id"]


# ── A6: nexus trace ─────────────────────────────────────────────────────────────


def _decide_and_run(schema: str) -> dict:
    async def body() -> dict:
        store, gate, executor, _ = await setup(schema)
        try:
            decision = await gate.decide(proposal())
            await executor.run(decision["decision_id"])
            return decision
        finally:
            await store.close()

    return asyncio.run(body())


def test_cli_trace(db_schema, capsys):
    decision = _decide_and_run(db_schema)
    did = decision["decision_id"]
    assert main(["trace", did]) == 0
    out = capsys.readouterr().out
    assert f"decision  {did}" in out
    assert 'action    lab:tank.fill {"amount": 10}' in out
    assert "execution succeeded" in out and "verified  passed" in out
    assert f"{STREAM}: " in out and "intact" in out

    assert main(["trace", did, "--json"]) == 0
    pack = json.loads(capsys.readouterr().out)
    assert validate(Kind.EVIDENCE, pack) == [] and pack["decision"]["decision_id"] == did

    assert main(["trace", "00000000-0000-4000-8000-000000000000"]) == 1
    assert "no decision, proposal or idempotency key" in capsys.readouterr().err
    assert main(["trace"]) == 2


def test_cli_trace_refuses_a_tampered_log(db_schema, capsys):
    decision = _decide_and_run(db_schema)

    async def tamper() -> None:
        async with raw(db_schema) as conn:
            await conn.execute("ALTER TABLE events DISABLE TRIGGER events_append_only")
            await conn.execute(
                "UPDATE events SET payload = replace(payload::text, '\"amount\":10', '\"amount\":99')::json "
                "WHERE type = 'execution.called'"
            )
            await conn.execute("ALTER TABLE events ENABLE TRIGGER events_append_only")

    asyncio.run(tamper())
    assert main(["trace", decision["decision_id"]]) == 1
    captured = capsys.readouterr()
    assert "HASH_MISMATCH" in captured.out
    assert "this trace cannot be trusted" in captured.err
