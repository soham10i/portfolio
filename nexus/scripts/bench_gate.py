"""P2 A11: end-to-end gate latency (state read + evaluate + event write) against local Postgres.

    NEXUS_DB_URL=postgresql://nexus:nexus@localhost:5433/nexus uv run python scripts/bench_gate.py

Runs in a scratch schema that is dropped afterwards. Exits 1 if sequential p95 >= 50 ms."""

from __future__ import annotations

import asyncio
import os
import statistics
import sys
import time
import uuid
from collections import Counter
from pathlib import Path

import asyncpg

from nexus.gate import Gate, LoadedPack, Policy
from nexus.store import EventStore

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("NEXUS_DB_URL", "")
TOTAL = int(os.environ.get("BENCH_DECISIONS", "10000"))
SESSIONS = 100
SENSOR = {"kind": "pack", "id": "stf"}


def proposal(i: int) -> dict:
    action, params = [
        ("stf:oven.set_zone_temp", {"zone": 2, "temp": 200}),  # reads state; NEEDS_APPROVAL
        ("stf:order.place", {"colour": "red", "quantity": 1}),  # reads state; rate limited
        ("stf:vgr.sweep_home", {}),  # no preconditions; ALLOW
        ("stf:oven.set_zone_temp", {"zone": 2, "temp": 260}),  # params schema; DENY
    ][i % 4]
    return {
        "proposal_id": str(uuid.uuid4()),
        "session_id": str(uuid.UUID(int=i % SESSIONS + 1)),
        "action": action,
        "params": params,
        "rationale": "benchmark",
        "context": [{"source": "user", "ref": f"msg/{i}", "triggered": True}],
        "proposer": {"kind": "agent", "id": "bench"},
        "created_at": "2026-10-30T10:00:00Z",
    }


async def refresh(store: EventStore) -> None:
    for key, value in [("oven.zone[2].mode", "idle"), ("storage.raw_count", 50)]:
        row = await store.state.get("stf", key)
        await store.state.set("stf", key, value, row.version if row else 0, SENSOR, "pack/stf")


def summary(label: str, samples: list[float], wall: float) -> str:
    q = statistics.quantiles(samples, n=100)
    return (
        f"{label}: {len(samples)} decisions in {wall:.2f}s = {len(samples) / wall:.0f}/s, "
        f"p50 {q[49]:.2f} ms, p95 {q[94]:.2f} ms, p99 {q[98]:.2f} ms, max {max(samples):.2f} ms"
    )


async def main() -> int:
    if not URL:
        print("NEXUS_DB_URL is not set", file=sys.stderr)
        return 2
    schema = f"bench_{uuid.uuid4().hex[:8]}"
    conn = await asyncpg.connect(URL)
    await conn.execute(f'CREATE SCHEMA "{schema}"')
    store = await EventStore.connect(URL, schema=schema, pool_size=10)
    try:
        await store.migrate()
        gate = Gate(store, [LoadedPack.from_file(ROOT / "contracts/examples/valid/stf.pack.yaml")], Policy())
        await refresh(store)
        for i in range(50):  # warm-up: pools, caches, prepared statements
            await gate.decide(proposal(i))

        outcomes: Counter[str] = Counter()
        samples = []
        started = time.perf_counter()
        for i in range(TOTAL):
            if i % 500 == 0:
                await refresh(store)  # oven state has max_age_s 5
            t = time.perf_counter()
            decision = await gate.decide(proposal(i))
            samples.append((time.perf_counter() - t) * 1000)
            outcomes[decision["outcome"]] += 1
        print(summary("sequential", samples, time.perf_counter() - started))
        print("outcomes:", dict(sorted(outcomes.items())))

        await refresh(store)
        concurrent: list[float] = []

        async def timed(i: int) -> None:
            t = time.perf_counter()
            await gate.decide(proposal(i))
            concurrent.append((time.perf_counter() - t) * 1000)

        started = time.perf_counter()
        await asyncio.gather(*(timed(i) for i in range(2000)))
        print(summary("2000 concurrent, pool 10", concurrent, time.perf_counter() - started))

        report = await store.verify_chain()
        print(f"chain: {report.events_checked} events in {report.streams_checked} streams, ok={report.ok}")
        p95 = statistics.quantiles(samples, n=100)[94]
        print(f"A11 sequential p95 {p95:.2f} ms < 50 ms: {'PASS' if p95 < 50 else 'FAIL'}")
        return 0 if p95 < 50 and report.ok else 1
    finally:
        await store.close()
        await conn.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
