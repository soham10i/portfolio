"""Isolated Postgres schemas for the integration tests (one per test, see conftest.db_schema)."""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

from nexus.store import Anchor, EventStore, canonical_json, event_hash
from nexus.store.events import _row_to_event

URL = os.environ.get("NEXUS_DB_URL")


async def create_schema() -> str:
    schema = f"test_{uuid.uuid4().hex[:12]}"
    conn = await asyncpg.connect(URL, timeout=10)
    try:
        await conn.execute(f'CREATE SCHEMA "{schema}"')
    finally:
        await conn.close()
    async with open_store(schema) as store:
        await store.migrate()
    return schema


async def drop_schema(schema: str) -> None:
    conn = await asyncpg.connect(URL, timeout=10)
    try:
        await conn.execute(f'DROP SCHEMA "{schema}" CASCADE')
    finally:
        await conn.close()


@asynccontextmanager
async def open_store(
    schema: str, pool_size: int = 10, anchor: Anchor | None = None
) -> AsyncIterator[EventStore]:
    store = await EventStore.connect(URL, schema=schema, pool_size=pool_size, anchor=anchor)
    try:
        yield store
    finally:
        await store.close()


@asynccontextmanager
async def raw(schema: str) -> AsyncIterator[asyncpg.Connection]:
    """A plain connection in the test schema, for tampering the way an owner could."""
    conn = await asyncpg.connect(URL, timeout=10, server_settings={"search_path": schema})
    try:
        yield conn
    finally:
        await conn.close()


async def rewrite_history(schema: str, stream: str, seq: int, old: str, new: str) -> int:
    """The careful attack (ADR-0019): edit one event, then recompute every later hash and link and
    the stream head, so the hash chain verifies again. Returns how many events were rewritten."""
    async with raw(schema) as conn, conn.transaction():
        await conn.execute("ALTER TABLE events DISABLE TRIGGER events_append_only")
        rows = await conn.fetch(
            "SELECT pos, stream, seq, type, payload, actor, ts, trace_id, prev_hash, hash FROM events "
            "WHERE stream = $1 AND seq >= $2 ORDER BY seq",
            stream,
            seq,
        )
        prev_hash = rows[0]["prev_hash"]
        for row in rows:
            event = _row_to_event(row)
            if row["seq"] == seq:
                event["payload"] = json.loads(json.dumps(event["payload"]).replace(old, new))
            event["prev_hash"] = prev_hash
            event["hash"] = prev_hash = event_hash(event)
            await conn.execute(
                "UPDATE events SET payload = $2::json, prev_hash = $3, hash = $4 WHERE pos = $1",
                row["pos"],
                canonical_json(event["payload"]).decode(),
                event["prev_hash"],
                event["hash"],
            )
        await conn.execute("UPDATE streams SET head_hash = $2 WHERE stream = $1", stream, prev_hash)
        await conn.execute("ALTER TABLE events ENABLE TRIGGER events_append_only")
    return len(rows)
