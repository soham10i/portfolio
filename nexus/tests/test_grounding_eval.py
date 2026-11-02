"""P7 A8: the answerer, replayed from evals/grounding/recordings.json, meets every threshold.

Every reply comes from the recording of one opt-in live run, made against a fixed clock; a prompt
that no longer hashes the same as the recorded one fails the case, so a prompt change means
recording again by hand."""

from __future__ import annotations

import asyncio

import pytest

from nexus.knowledge.evaluation import (
    SUITES,
    THRESHOLDS,
    FixedClock,
    answerer_factory,
    load_suite,
    prepare,
    run_suite,
    session_for,
)
from nexus.packs import load_pack, pack_root
from nexus.plan import Replayer, load_recordings
from nexus.store import EventStore

from .db import URL
from .support import ROOT

pytestmark = pytest.mark.integration
GROUNDING = ROOT / "evals" / "grounding"
RECORDINGS = load_recordings(GROUNDING / "recordings.json")


def test_every_case_is_recorded_from_a_free_provider():
    cases = {c.id for name in SUITES for c in load_suite(GROUNDING / f"{name}.yaml")[1]}
    assert set(RECORDINGS["cases"]) == cases
    calls = [c for v in RECORDINGS["cases"].values() for c in v]
    assert calls and all(c["request_sha256"] for c in calls)
    assert {c.get("provider") for c in calls if "error" not in c} <= {"gemini", "groq", "ollama"}


@pytest.mark.parametrize("name", list(SUITES))
def test_the_replayed_suite_meets_its_threshold(db_schema, name):
    suite, cases = load_suite(GROUNDING / f"{name}.yaml")
    replayers: dict[str, Replayer] = {}

    def model_for(case: str) -> Replayer:
        replayers[case] = Replayer(RECORDINGS["cases"][case], case)
        return replayers[case]

    async def body():
        clock = FixedClock()
        store = await EventStore.connect(URL, schema=db_schema, pool_size=4, clock=clock)
        try:
            world = await prepare(store, clock, GROUNDING, load_pack("greenhouse"), pack_root("greenhouse"))
            return await run_suite(answerer_factory(store, world), model_for, suite, cases, session_for)
        finally:
            await store.close()

    scored = asyncio.run(body())
    failed = [f"{s.case}: {s.detail}" for s in scored if not s.passed]
    assert len(scored) - len(failed) >= THRESHOLDS[suite], failed
    assert {c: r.remaining for c, r in replayers.items() if r.remaining} == {}
    assert {c["private"] for r in replayers.values() for c in r.seen} <= {False}
