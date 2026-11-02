"""P6 A10: the planner, replayed from evals/planner/recordings.json, meets both thresholds.

Every reply comes from the recording of one opt-in live run; a prompt that no longer hashes the
same as the recorded one fails the case, so a prompt change means recording again by hand."""

from __future__ import annotations

import asyncio

import pytest

from nexus.gate import Gate, Policy
from nexus.packs import load_pack
from nexus.plan import Planner, Replayer, load_recordings
from nexus.plan.evaluation import THRESHOLDS, load_suite, run_suite
from nexus.store import EventStore

from .db import URL
from .support import ROOT

pytestmark = pytest.mark.integration
SUITES = ROOT / "evals" / "planner"
RECORDINGS = load_recordings(SUITES / "recordings.json")


def test_every_case_is_recorded_from_a_free_provider():
    cases = {c.id for name in THRESHOLDS for c in load_suite(SUITES / f"{name}.yaml")[1]}
    assert set(RECORDINGS["cases"]) == cases
    calls = [c for v in RECORDINGS["cases"].values() for c in v]
    assert calls and all(c["request_sha256"] for c in calls)
    assert {c.get("provider") for c in calls if "error" not in c} <= {"gemini", "groq", "ollama"}


@pytest.mark.parametrize("name", list(THRESHOLDS))
def test_the_replayed_suite_meets_its_threshold(db_schema, name):
    suite, cases = load_suite(SUITES / f"{name}.yaml")
    replayers: dict[str, Replayer] = {}

    def model_for(case: str) -> Replayer:
        replayers[case] = Replayer(RECORDINGS["cases"][case], case)
        return replayers[case]

    async def body():
        store = await EventStore.connect(URL, schema=db_schema, pool_size=4)
        try:
            gate = Gate(
                store, [load_pack("echo"), load_pack("greenhouse")], Policy(name="eval", version="1.0.0")
            )
            return await run_suite(lambda m: Planner(store, gate, m, private=False), model_for, suite, cases)
        finally:
            await store.close()

    scored = asyncio.run(body())
    failed = [f"{s.case}: {s.detail}" for s in scored if not s.passed]
    assert len(scored) - len(failed) >= THRESHOLDS[suite], failed
    assert {c: r.remaining for c, r in replayers.items() if r.remaining} == {}
    assert {c["private"] for r in replayers.values() for c in r.seen} == {False}
