"""P1 A4, A5, A6, A9, A10: append, read, verify, tamper, append-only, concurrency, CLI."""

from __future__ import annotations

import asyncio
import itertools

import asyncpg
import pytest

from nexus.cli import main
from nexus.contracts import validate
from nexus.store import StoreError

from .db import open_store, raw

pytestmark = pytest.mark.integration

STREAM = "session/0b7e9c1d-2f3a-4b5c-8d6e-7f8091a2b3c4"
ME = {"kind": "human", "id": "soham"}


async def _append_n(schema: str, n: int, stream: str = STREAM) -> list[dict]:
    async with open_store(schema) as store:
        return [await store.append(stream, "note.added", {"n": i, "text": "hello"}, ME) for i in range(n)]


def test_append_builds_valid_chained_events(db_schema):
    events = asyncio.run(_append_n(db_schema, 5))
    assert [e["seq"] for e in events] == [1, 2, 3, 4, 5]
    assert events[0]["prev_hash"] is None
    for prev, cur in itertools.pairwise(events):
        assert cur["prev_hash"] == prev["hash"]
    for event in events:
        assert validate("event", event) == []
        assert event["ts"].endswith("Z")


def test_read_returns_what_was_appended(db_schema):
    async def body() -> None:
        written = await _append_n(db_schema, 4)
        async with open_store(db_schema) as store:
            assert await store.read(STREAM) == written
            assert await store.read(STREAM, after_seq=2) == written[2:]
            assert await store.read("pack/other") == []

    asyncio.run(body())


def test_streams_are_chained_independently(db_schema):
    async def body() -> None:
        async with open_store(db_schema) as store:
            a = await store.append("pack/a", "note.added", {}, ME)
            b = await store.append("pack/b", "note.added", {}, ME)
            assert (a["seq"], b["seq"]) == (1, 1)
            assert a["prev_hash"] is b["prev_hash"] is None
            report = await store.verify_chain()
            assert report.ok and report.streams_checked == 2

    asyncio.run(body())


@pytest.mark.parametrize(
    ("stream", "etype", "payload"),
    [
        ("Bad Stream", "note.added", {}),  # stream name fails the event schema
        (STREAM, "notdotted", {}),  # type fails the event schema
        (STREAM, "note.added", {"x": float("nan")}),  # JCS cannot represent it
        (STREAM, "note.added", {"x": 2**60}),  # beyond the exact integer range
    ],
)
def test_invalid_append_raises_and_writes_nothing(db_schema, stream, etype, payload):
    async def body() -> None:
        async with open_store(db_schema) as store:
            with pytest.raises(StoreError):
                await store.append(stream, etype, payload, ME)
            async with raw(db_schema) as conn:
                assert await conn.fetchval("SELECT count(*) FROM events") == 0
                assert await conn.fetchval("SELECT count(*) FROM streams") == 0

    asyncio.run(body())


def test_verify_passes_on_an_untouched_chain(db_schema):
    async def body() -> None:
        await _append_n(db_schema, 10)
        async with open_store(db_schema) as store:
            report = await store.verify_chain()
        assert report.ok and report.problems == [] and report.events_checked == 10

    asyncio.run(body())


async def _owner_edit(schema: str, sql: str) -> None:
    """Change events the way someone with owner rights could: switch the guard off first."""
    async with raw(schema) as conn:
        await conn.execute("ALTER TABLE events DISABLE TRIGGER events_append_only")
        await conn.execute(sql)
        await conn.execute("ALTER TABLE events ENABLE TRIGGER events_append_only")


def test_flipping_one_byte_breaks_verification_at_that_event(db_schema):
    async def body() -> None:
        await _append_n(db_schema, 5)
        await _owner_edit(
            db_schema,
            f"UPDATE events SET payload = replace(payload::text, 'hello', 'hellp')::json "
            f"WHERE stream = '{STREAM}' AND seq = 3",
        )
        async with open_store(db_schema) as store:
            report = await store.verify_chain()
        assert not report.ok
        assert [(p.stream, p.seq, p.code) for p in report.problems] == [(STREAM, 3, "HASH_MISMATCH")]

    asyncio.run(body())


def test_deleting_the_tail_is_detected(db_schema):
    async def body() -> None:
        await _append_n(db_schema, 5)
        await _owner_edit(db_schema, f"DELETE FROM events WHERE stream = '{STREAM}' AND seq = 5")
        async with open_store(db_schema) as store:
            report = await store.verify_chain()
        assert [(p.stream, p.seq, p.code) for p in report.problems] == [(STREAM, 5, "HEAD_MISMATCH")]

    asyncio.run(body())


def test_deleting_from_the_middle_is_detected(db_schema):
    async def body() -> None:
        await _append_n(db_schema, 5)
        await _owner_edit(db_schema, f"DELETE FROM events WHERE stream = '{STREAM}' AND seq = 2")
        async with open_store(db_schema) as store:
            report = await store.verify_chain()
        codes = {(p.seq, p.code) for p in report.problems}
        assert (3, "SEQ_GAP") in codes and (3, "PREV_HASH_MISMATCH") in codes

    asyncio.run(body())


@pytest.mark.parametrize(
    "sql",
    ["UPDATE events SET type = 'note.changed'", "DELETE FROM events", "TRUNCATE events CASCADE"],
)
def test_events_table_is_append_only(db_schema, sql):
    async def body() -> None:
        await _append_n(db_schema, 2)
        async with raw(db_schema) as conn:
            with pytest.raises(asyncpg.RaiseError, match="append-only"):
                await conn.execute(sql)
            assert await conn.fetchval("SELECT count(*) FROM events") == 2

    asyncio.run(body())


def test_100_concurrent_appends_to_one_stream_have_no_gaps(db_schema):
    async def body() -> None:
        async with open_store(db_schema, pool_size=20) as store:
            events = await asyncio.gather(
                *(store.append(STREAM, "note.added", {"n": i}, ME) for i in range(100))
            )
            assert sorted(e["seq"] for e in events) == list(range(1, 101))
            report = await store.verify_chain()
        assert report.ok and report.events_checked == 100

    asyncio.run(body())


def test_cli_chain_verify_exit_codes(db_schema, capsys):
    asyncio.run(_append_n(db_schema, 3))
    assert main(["chain", "verify"]) == 0
    assert "3 events in 1 stream" in capsys.readouterr().out
    asyncio.run(
        _owner_edit(db_schema, "UPDATE events SET payload = replace(payload::text, 'hello', 'HELLO')::json")
    )
    assert main(["chain", "verify"]) == 1
    lines = capsys.readouterr().out.splitlines()
    assert sum(" HASH_MISMATCH " in line for line in lines) == 3


def test_cli_without_a_database_url_exits_2(monkeypatch, capsys):
    monkeypatch.delenv("NEXUS_DB_URL", raising=False)
    assert main(["chain", "verify"]) == 2
    assert "NEXUS_DB_URL" in capsys.readouterr().err
