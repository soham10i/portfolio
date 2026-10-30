"""P1 A7, A8, A10: compare-and-set world state, rebuild from events, concurrent writers."""

from __future__ import annotations

import asyncio
import random

import pytest

from nexus.cli import main
from nexus.store import CasConflict

from .db import open_store, raw

pytestmark = pytest.mark.integration

ME = {"kind": "system", "id": "test"}
STREAM = "pack/test"


def test_set_creates_then_updates_with_versions(db_schema):
    async def body() -> None:
        async with open_store(db_schema) as store:
            assert await store.state.get("oven.zone[2]", "setpoint") is None
            first = await store.state.set("oven.zone[2]", "setpoint", 180, 0, ME, STREAM)
            second = await store.state.set("oven.zone[2]", "setpoint", 200, 1, ME, STREAM)
            row = await store.state.get("oven.zone[2]", "setpoint")
            events = await store.read(STREAM)
        assert (first.version, second.version) == (1, 2)
        assert (row.value, row.version, row.updated_at) == (200, 2, events[-1]["ts"])
        assert [e["type"] for e in events] == ["state.set", "state.set"]
        assert events[-1]["payload"] == {
            "entity": "oven.zone[2]",
            "key": "setpoint",
            "value": 200,
            "version": 2,
            "prev_version": 1,
        }

    asyncio.run(body())


@pytest.mark.parametrize("expected", [0, 2, 5])
def test_stale_expected_version_raises_and_writes_nothing(db_schema, expected):
    async def body() -> None:
        async with open_store(db_schema) as store:
            await store.state.set("k", "v", "a", 0, ME, STREAM)
            with pytest.raises(CasConflict) as info:
                await store.state.set("k", "v", "b", expected, ME, STREAM)
            assert (info.value.expected, info.value.actual) == (expected, 1)
            assert (await store.state.get("k", "v")).value == "a"
            assert len(await store.read(STREAM)) == 1

    asyncio.run(body())


def test_rebuild_equals_live_after_500_random_writes(db_schema):
    async def body() -> None:
        rng = random.Random(8785)
        keys = [(f"entity_{i % 5}", f"key_{i}") for i in range(20)]
        versions = dict.fromkeys(keys, 0)
        async with open_store(db_schema) as store:
            for n in range(500):
                key = rng.choice(keys)
                value = rng.choice([n, n / 7, f"s{n}", True, None, {"n": n, "nested": [1, 2]}])
                stream = rng.choice(["pack/a", "pack/b", "session/x"])
                await store.state.set(*key, value, versions[key], ME, stream)
                versions[key] += 1
            assert await store.state.check() == []
            assert (await store.verify_chain()).ok

    asyncio.run(body())


def test_check_reports_a_corrupted_projection_row(db_schema):
    async def body() -> None:
        async with open_store(db_schema) as store:
            await store.state.set("k", "a", 1, 0, ME, STREAM)
            await store.state.set("k", "b", 2, 0, ME, STREAM)
            async with raw(db_schema) as conn:
                await conn.execute("UPDATE state SET value = '99' WHERE key = 'a'")
                await conn.execute("DELETE FROM state WHERE key = 'b'")
            diff = await store.state.check()
        assert {(d.entity, d.key, d.problem) for d in diff} == {("k", "a", "VALUE"), ("k", "b", "MISSING")}

    asyncio.run(body())


async def _increment(store, retry: bool) -> bool:
    while True:
        row = await store.state.get("counter", "n")
        current, version = (row.value, row.version) if row else (0, 0)
        try:
            await store.state.set("counter", "n", current + 1, version, ME, STREAM)
            return True
        except CasConflict:
            if not retry:
                return False


def test_100_concurrent_writers_with_retry_lose_no_update(db_schema):
    async def body() -> None:
        async with open_store(db_schema, pool_size=20) as store:
            assert all(await asyncio.gather(*(_increment(store, retry=True) for _ in range(100))))
            row = await store.state.get("counter", "n")
            events = await store.read(STREAM)
            assert await store.state.check() == []
        assert (row.value, row.version) == (100, 100)
        assert [e["payload"]["version"] for e in events] == list(range(1, 101))

    asyncio.run(body())


def test_100_concurrent_writers_without_retry_account_for_every_attempt(db_schema):
    async def body() -> None:
        async with open_store(db_schema, pool_size=20) as store:
            results = await asyncio.gather(*(_increment(store, retry=False) for _ in range(100)))
            row = await store.state.get("counter", "n")
        wins = sum(results)
        assert wins + results.count(False) == 100
        assert row.version == row.value == wins

    asyncio.run(body())


def test_cli_state_check(db_schema, capsys):
    async def write() -> None:
        async with open_store(db_schema) as store:
            await store.state.set("k", "a", 1, 0, ME, STREAM)

    asyncio.run(write())
    assert main(["state", "check"]) == 0
    assert "1 key" in capsys.readouterr().out
