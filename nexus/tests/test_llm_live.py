"""Opt-in only: one real call per configured provider (`make test-live`, P5.md §0.2).

Skipped unless NEXUS_LLM_LIVE=1. CI never sets it. Each provider is skipped when its key is not
set (or, for Ollama, when nothing listens on its port). Sends one public, harmless question.
"""

from __future__ import annotations

import asyncio
import os

import pytest

from nexus.llm import ModelError, Router, load_config
from nexus.store import EventStore

from .db import URL
from .llm_support import ANSWER_SCHEMA

pytestmark = pytest.mark.live
CONFIG = load_config()


@pytest.mark.parametrize("name", [p.name for p in CONFIG.providers])
def test_one_real_call(db_schema, name):
    if os.environ.get("NEXUS_LLM_LIVE") != "1":
        pytest.skip("live provider tests need NEXUS_LLM_LIVE=1 (make test-live)")
    provider = CONFIG.provider(name)
    if provider.api_key_env and not provider.api_key(os.environ):
        pytest.skip(f"${provider.api_key_env} is not set")

    async def body():
        store = await EventStore.connect(URL, schema=db_schema, pool_size=2)
        try:
            return await Router(store, CONFIG).generate(
                "live.smoke", "What is the capital of France? One word.", ANSWER_SCHEMA, providers=[name]
            )
        finally:
            await store.close()

    try:
        result = asyncio.run(body())
    except ModelError as exc:
        if provider.kind == "ollama" and any("unavailable" in n for n in exc.notes):
            pytest.skip("Ollama is not running")
        raise
    assert result.provider == name and "paris" in result.output["answer"].lower()
    assert result.cost_usd == 0
