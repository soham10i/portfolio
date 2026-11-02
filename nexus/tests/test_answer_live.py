"""Opt-in only: one real grounded answer through the configured free providers (`make test-live`).

Skipped unless NEXUS_LLM_LIVE=1, which CI never sets. The question and the corpus are synthetic
and public, so they are sent with private=False; the answerer acts on nothing."""

from __future__ import annotations

import asyncio
import os

import pytest

from nexus.knowledge import Answerer, AssetGraph, KnowledgeIndex, MemoryStore
from nexus.llm import Router, load_config
from nexus.packs import load_pack, pack_root
from nexus.store import EventStore

from .db import URL

pytestmark = pytest.mark.live


def test_one_real_answer(db_schema):
    if os.environ.get("NEXUS_LLM_LIVE") != "1":
        pytest.skip("live provider tests need NEXUS_LLM_LIVE=1 (make test-live)")
    pack = load_pack("greenhouse")

    async def body():
        store = await EventStore.connect(URL, schema=db_schema, pool_size=4)
        try:
            index = KnowledgeIndex(store)
            await index.index_pack(pack, pack_root("greenhouse"))
            answerer = Answerer(
                store,
                Router(store, load_config()),
                index,
                MemoryStore(store),
                AssetGraph.from_packs([pack]),
                {"greenhouse": pack},
                private=False,
                corpora=["greenhouse"],
            )
            return await answerer.answer("At what wind speed must the roof vent be closed?", "live-1")
        finally:
            await store.close()

    result = asyncio.run(body())
    if result.status == "abstained" and result.by == "model":
        pytest.skip(f"no configured provider answered: {result.reason}")
    assert result.status == "answered", (result.by, result.reason, result.dropped)
    assert any("50" in s.text for s in result.sentences)
    assert all(s.cites for s in result.sentences)
