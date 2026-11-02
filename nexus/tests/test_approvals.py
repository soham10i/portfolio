"""P3 A6, A9: approvals bind a human to the exact proposal hash (ADR-0013), and the CLI."""

from __future__ import annotations

import asyncio

import pytest

from nexus.cli import main
from nexus.exec import ApprovalError, approve, reject

from .exec_support import ALICE, BOB, SESSION, proposal, setup

pytestmark = pytest.mark.integration

CAROL = {"kind": "human", "id": "carol"}


async def refused(coro) -> str:
    with pytest.raises(ApprovalError) as info:
        await coro
    return info.value.code


def test_approval_rules(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            heat = await gate.decide(proposal("lab:tank.heat"))
            did, h = heat["decision_id"], heat["proposal_hash"]
            missing = await executor.run(did)
            codes = [
                await refused(approve(store, did, "0" * 64, ALICE)),
                await refused(approve(store, did, h, {"kind": "agent", "id": "planner"})),
                await refused(approve(store, did, h, {"kind": "system", "id": "gate"})),
                await refused(approve(store, "00000000-0000-4000-8000-000000000000", h, ALICE)),
            ]
            still_missing = await executor.run(did)
            await approve(store, did, h, ALICE)
            duplicate = await refused(approve(store, did, h, ALICE))
            done = await executor.run(did)
            after = await refused(approve(store, did, h, BOB))
            allowed = await gate.decide(proposal())
            not_needed = await refused(
                approve(store, allowed["decision_id"], allowed["proposal_hash"], ALICE)
            )
        finally:
            await store.close()
        assert heat["outcome"] == "NEEDS_APPROVAL" and heat["approvals_required"] == 1
        assert missing.codes == ["NOT_APPROVED"] and still_missing.codes == ["NOT_APPROVED"]
        assert codes == ["HASH_MISMATCH", "NOT_HUMAN", "NOT_HUMAN", "UNKNOWN_DECISION"]
        assert duplicate == "DUPLICATE"
        assert done.status == "succeeded" and [c.action for c in binding.calls] == ["tank.heat"]
        assert after == "ALREADY_EXECUTED" and not_needed == "NOT_NEEDED"

    asyncio.run(body())


def test_the_proposer_cannot_approve_their_own_proposal(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            heat = await gate.decide(proposal("lab:tank.heat", proposer=ALICE))
            code = await refused(approve(store, heat["decision_id"], heat["proposal_hash"], ALICE))
            record = await executor.run(heat["decision_id"])
        finally:
            await store.close()
        assert code == "PROPOSER" and record.codes == ["NOT_APPROVED"] and binding.calls == []

    asyncio.run(body())


def test_an_approval_does_not_carry_over_to_an_edited_proposal(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            first = await gate.decide(proposal("lab:tank.heat", amount=10))
            edited = await gate.decide(proposal("lab:tank.heat", amount=11))
            await approve(store, first["decision_id"], first["proposal_hash"], ALICE)
            code = await refused(approve(store, edited["decision_id"], first["proposal_hash"], BOB))
            record = await executor.run(edited["decision_id"])
        finally:
            await store.close()
        assert first["proposal_hash"] != edited["proposal_hash"]
        assert code == "HASH_MISMATCH" and record.codes == ["NOT_APPROVED"] and binding.calls == []

    asyncio.run(body())


def test_a_rejection_closes_the_decision(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            heat = await gate.decide(proposal("lab:tank.heat"))
            did, h = heat["decision_id"], heat["proposal_hash"]
            empty = await refused(reject(store, did, "  ", CAROL))
            await reject(store, did, "not during the shift change", CAROL)
            codes = [
                await refused(approve(store, did, h, ALICE)),
                await refused(reject(store, did, "twice", BOB)),
            ]
            record = await executor.run(did)
        finally:
            await store.close()
        assert empty == "NO_REASON"
        assert codes == ["REJECTED", "REJECTED"]
        assert record.codes == ["REJECTED"] and binding.calls == []

    asyncio.run(body())


def test_a_rejection_after_an_approval_still_blocks(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            purge = await gate.decide(proposal("lab:tank.purge"))
            await approve(store, purge["decision_id"], purge["proposal_hash"], ALICE)
            await reject(store, purge["decision_id"], "wrong batch", BOB)
            record = await executor.run(purge["decision_id"])
        finally:
            await store.close()
        assert record.codes == ["REJECTED"] and binding.calls == []

    asyncio.run(body())


def test_critical_needs_two_distinct_humans(db_schema):
    async def body() -> None:
        store, gate, executor, binding = await setup(db_schema)
        try:
            purge = await gate.decide(proposal("lab:tank.purge"))
            did, h = purge["decision_id"], purge["proposal_hash"]
            await approve(store, did, h, ALICE)
            one = await executor.run(did)
            twice = await refused(approve(store, did, h, ALICE))
            await approve(store, did, h, BOB)
            two = await executor.run(did)
            events = await store.read(f"session/{SESSION}")
        finally:
            await store.close()
        assert purge["approvals_required"] == 2
        assert one.codes == ["NOT_APPROVED"] and twice == "DUPLICATE"
        assert two.status == "succeeded" and len(binding.calls) == 1
        granted = [e for e in events if e["type"] == "approval.granted"]
        assert [e["payload"]["approver"] for e in granted] == [ALICE, BOB]
        assert all(e["payload"]["proposal_hash"] == h for e in granted)
        started = next(e for e in events if e["type"] == "execution.started")
        assert started["payload"]["approvals"] == 2

    asyncio.run(body())


def test_concurrent_approvals_by_one_person_count_once(db_schema):
    async def body() -> None:
        store, gate, _, _ = await setup(db_schema)
        try:
            purge = await gate.decide(proposal("lab:tank.purge"))
            results = await asyncio.gather(
                *(approve(store, purge["decision_id"], purge["proposal_hash"], ALICE) for _ in range(10)),
                return_exceptions=True,
            )
        finally:
            await store.close()
        assert sum(isinstance(r, dict) for r in results) == 1
        assert {r.code for r in results if isinstance(r, ApprovalError)} == {"DUPLICATE"}

    asyncio.run(body())


# ── A9: CLI ────────────────────────────────────────────────────────────────────


def test_cli_approve_and_reject(db_schema, capsys, monkeypatch):
    async def decide() -> tuple[dict, dict]:
        store, gate, _, _ = await setup(db_schema)
        try:
            return await gate.decide(proposal("lab:tank.heat")), await gate.decide(proposal("lab:tank.heat"))
        finally:
            await store.close()

    one, two = asyncio.run(decide())
    monkeypatch.setenv("NEXUS_ACTOR", "alice")
    assert main(["approve", one["decision_id"], "--proposal-hash", "f" * 64]) == 1
    assert "HASH_MISMATCH" in capsys.readouterr().err
    assert main(["approve", one["decision_id"], "--proposal-hash", one["proposal_hash"]]) == 0
    out = capsys.readouterr().out
    assert out.startswith(f"approved {one['decision_id']} as alice (session/{SESSION} seq")
    assert main(["approve", one["decision_id"], "--proposal-hash", one["proposal_hash"]]) == 1
    assert "DUPLICATE" in capsys.readouterr().err
    assert main(["reject", two["decision_id"], "--reason", "not now"]) == 0
    assert capsys.readouterr().out.startswith(f"rejected {two['decision_id']} as alice")
    assert main(["reject", two["decision_id"], "--reason", "again"]) == 1
    assert main(["approve", one["decision_id"]]) == 2  # --proposal-hash is required
    assert main(["reject", two["decision_id"]]) == 2  # --reason is required
