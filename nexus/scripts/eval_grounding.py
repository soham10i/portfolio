"""Measure retrieval and grounded answering on the P7 suites (P7.md §4).

    uv run python scripts/eval_grounding.py                     # replay evals/grounding/recordings.json
    NEXUS_LLM_LIVE=1 uv run python scripts/eval_grounding.py --live --record   # re-record, by hand

Entity resolution needs no model and always runs, with the packs loaded in both orders. Replay
talks to no provider: every reply comes from the recording, and a request that no longer hashes
the same as the recorded one fails. --live sends the suites to the configured free providers in
order, with private=False because every question, document and memory is synthetic, paced so the
free tier does not rate-limit. Keys come only from the environment and are never printed.

Needs the local Postgres (NEXUS_DB_URL). Each run uses its own schema, dropped afterwards, and a
fixed clock, so the live reads (and so the prompts) are the same on every run.
Exit 0 when every suite meets its threshold, 1 when one does not, 2 on a usage error.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import asyncpg

from nexus.knowledge.assets import AssetGraph
from nexus.knowledge.evaluation import (
    RESOLUTION_THRESHOLD,
    SUITES,
    THRESHOLDS,
    FixedClock,
    answerer_factory,
    load_resolution,
    load_suite,
    prepare,
    run_suite,
    score_resolution,
    session_for,
)
from nexus.llm import Router, load_config
from nexus.packs import load_pack, pack_root
from nexus.plan import Recorder, Replayer, load_recordings, save_recordings
from nexus.store import EventStore

ROOT = Path(__file__).resolve().parent.parent
GROUNDING = ROOT / "evals" / "grounding"
RESOLUTION = ROOT / "evals" / "assets" / "resolution.yaml"
RECORDINGS = GROUNDING / "recordings.json"
PACK = "greenhouse"


class Paced:
    """At most one call every `pace_s` seconds."""

    def __init__(self, model: Any, pace_s: float) -> None:
        self._model, self._pace, self._last = model, pace_s, 0.0

    async def generate(self, *args: Any, **kw: Any) -> Any:
        wait = self._last + self._pace - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            return await self._model.generate(*args, **kw)
        finally:
            self._last = time.monotonic()


def resolution() -> bool:
    extra, cases = load_resolution(RESOLUTION)
    manifest = load_pack(PACK).manifest
    ok = True
    for label, manifests in (("", [manifest, *extra]), (", packs reversed", [*reversed(extra), manifest])):
        scored = score_resolution(AssetGraph.from_manifests(manifests), cases)
        for case, passed, got in scored:
            if not passed:
                print(f"  {case} FAIL got {got}")
        passed = sum(p for _, p, _ in scored)
        ok &= passed >= RESOLUTION_THRESHOLD
        print(f"resolution{label}: {passed}/{len(scored)}, need {RESOLUTION_THRESHOLD}")
    return ok


async def evaluate(args: argparse.Namespace, url: str) -> int:
    failed = not resolution()
    recordings = load_recordings(args.recordings) if Path(args.recordings).exists() else None
    if not args.live and recordings is None:
        print(f"no recording at {args.recordings}; record one with --live --record", file=sys.stderr)
        return 2
    schema = f"eval_grounding_{uuid.uuid4().hex[:10]}"
    conn = await asyncpg.connect(url, timeout=10)
    await conn.execute(f'CREATE SCHEMA "{schema}"')
    await conn.close()
    clock = FixedClock()
    store = await EventStore.connect(url, schema=schema, pool_size=4, clock=clock)
    try:
        await store.migrate()
        world = await prepare(store, clock, GROUNDING, load_pack(PACK), pack_root(PACK))
        recorder = Recorder(Paced(Router(store, load_config()), args.pace)) if args.live else None
        recorded: dict[str, list[dict[str, Any]]] = {}

        def model_for(case: str) -> Any:
            if recorder is None:
                return Replayer(recordings["cases"].get(case, []), case)
            if recorder.calls:
                raise RuntimeError("calls left over from the previous case")
            return recorder

        answerer_for = answerer_factory(store, world, private=False)
        for name in args.suite:
            suite, cases = load_suite(GROUNDING / f"{name}.yaml")
            scored = []
            for case in cases:
                scored += await run_suite(answerer_for, model_for, suite, [case], session_for)
                if recorder is not None:
                    recorded[case.id] = recorder.take()
                s = scored[-1]
                print(f"  {s.case} {'ok  ' if s.passed else 'FAIL'} {s.status:<10} {s.detail}")
            passed = sum(s.passed for s in scored)
            need = THRESHOLDS[suite]
            failed |= passed < need
            print(f"{suite}: {passed}/{len(scored)} ({100 * passed / len(scored):.1f} %), need {need}")
        if args.record:
            data = recordings or {"version": 1, "cases": {}}
            data["cases"] = {**data["cases"], **recorded}
            data["recorded_at"] = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
            data["note"] = "Replies from one opt-in live run (scripts/eval_grounding.py --live --record)."
            save_recordings(args.recordings, data)
            providers = sorted(
                {f"{c.get('provider')}:{c.get('model')}" for v in recorded.values() for c in v}
            )
            print(f"recorded {sum(len(v) for v in recorded.values())} call(s) from {', '.join(providers)}")
        return 1 if failed else 0
    finally:
        await store.close()
        conn = await asyncpg.connect(url, timeout=10)
        await conn.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--suite", choices=list(SUITES), action="append")
    parser.add_argument("--live", action="store_true", help="call the configured free providers")
    parser.add_argument("--record", action="store_true", help="save the live replies (needs --live)")
    parser.add_argument("--recordings", default=str(RECORDINGS))
    parser.add_argument("--pace", type=float, default=5.0, help="seconds between live calls")
    args = parser.parse_args(argv)
    args.suite = args.suite or list(SUITES)
    if args.record and not args.live:
        parser.error("--record needs --live")
    if args.live and os.environ.get("NEXUS_LLM_LIVE") != "1":
        parser.error("--live also needs NEXUS_LLM_LIVE=1 in the environment")
    url = os.environ.get("NEXUS_DB_URL", "postgresql://nexus:nexus@localhost:5433/nexus")
    return asyncio.run(evaluate(args, url))


if __name__ == "__main__":
    sys.exit(main())
