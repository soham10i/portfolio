"""A10: the local Postgres has pgvector. Skipped unless NEXUS_DB_URL is set."""

from __future__ import annotations

import asyncio
import os

import pytest

pytestmark = pytest.mark.integration

URL = os.environ.get("NEXUS_DB_URL")


async def _vector_roundtrip(url: str) -> str:
    import asyncpg

    conn = await asyncpg.connect(url, timeout=10)
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        return await conn.fetchval("SELECT '[1,2,3]'::vector::text")
    finally:
        await conn.close()


@pytest.mark.skipif(not URL, reason="NEXUS_DB_URL is not set")
def test_pgvector_is_available():
    assert asyncio.run(_vector_roundtrip(URL)) == "[1,2,3]"
