"""Opt-in only: one real plan through the configured free providers (`make test-live`).

Skipped unless NEXUS_LLM_LIVE=1, which CI never sets. The request is synthetic and public, so it
is sent with private=False; nothing is executed, the plan stops at the gate."""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest

from nexus.gate import Gate, Policy
from nexus.llm import Router, load_config
from nexus.packs import load_pack
from nexus.plan import Planner
from nexus.store import EventStore

from .db import URL

pytestmark = pytest.mark.live


def test_one_real_plan(db_schema):
    if os.environ.get("NEXUS_LLM_LIVE") != "1":
        pytest.skip("live provider tests need NEXUS_LLM_LIVE=1 (make test-live)")

    async def body():
        store = await EventStore.connect(URL, schema=db_schema, pool_size=4)
        try:
            gate = Gate(store, [load_pack("greenhouse")], Policy(name="live", version="1.0.0"))
            planner = Planner(store, gate, Router(store, load_config()), private=False)
            result = await planner.plan("Turn on the grow lights in zone 2.", str(uuid.uuid4()))
            executed = await store.pool.fetchval("SELECT count(*) FROM executions")
            return result, executed
        finally:
            await store.close()

    result, executed = asyncio.run(body())
    if result.status == "gave_up" and result.reason == "no model provider gave an answer":
        pytest.skip(f"no configured provider answered: {result.problems}")
    assert executed == 0
    assert result.status == "proposed", (result.reason, result.problems)
    assert [(s.action, s.params, s.outcome) for s in result.proposed] == [
        ("greenhouse:greenhouse.set_lights", {"zone": 2, "on": True}, "ALLOW")
    ]
