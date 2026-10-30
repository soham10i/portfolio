"""Isolated Postgres schemas for the integration tests (one per test, see conftest.db_schema)."""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg

from nexus.store import EventStore

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
async def open_store(schema: str, pool_size: int = 10) -> AsyncIterator[EventStore]:
    store = await EventStore.connect(URL, schema=schema, pool_size=pool_size)
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
