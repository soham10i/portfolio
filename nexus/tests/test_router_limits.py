"""P8.1 A3: the router's per-minute windows, waits, AIMD, and a used-up day that is stored."""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta

import pytest

from nexus.llm import HttpResponse, ModelError, Router, parse_config, usage_today
from nexus.llm.limits import Limits

from .llm_support import (
    ANSWER_SCHEMA,
    KEYS,
    FakeTransport,
    answer,
    gemini_ok,
    make_router,
    model_events,
    openai_ok,
)

pytestmark = pytest.mark.integration

LIMITED = """
providers:
  - {name: alpha, kind: gemini, model: alpha-flash, api_key_env: ALPHA_KEY, free: true,
     requests_per_minute: RPM, max_wait_s: WAIT, quota_timezone: America/Los_Angeles}
  - {name: beta, kind: openai, model: beta-oss, base_url: "https://beta.example/openai/v1",
     api_key_env: BETA_KEY, free: true}
"""


def limited(rpm: int = 2, wait: float = 5) -> str:
    return LIMITED.replace("RPM", str(rpm)).replace("WAIT", str(wait))


def google_429(*quota_ids: str, retry: str | None = "37s") -> HttpResponse:
    details = []
    if retry:
        details.append({"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": retry})
    if quota_ids:
        details.append(
            {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                "violations": [{"quotaId": q} for q in quota_ids],
            }
        )
    body = {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota", "details": details}}
    return HttpResponse(429, json.dumps(body).encode())


def run(coro):
    return asyncio.run(coro)


def reasons(events):
    return [(e["payload"]["provider"], e["payload"].get("reason") or e["payload"]["outcome"]) for e in events]


def test_a_full_window_moves_on_when_the_wait_is_long(db_schema):
    transport = FakeTransport({"alpha": [gemini_ok(answer("a"))], "beta": [openai_ok(answer("b"))]})

    async def body():
        store, router, clock = await make_router(db_schema, transport, limited(rpm=2, wait=5))
        try:
            out = [await router.generate("t", "q", ANSWER_SCHEMA) for _ in range(3)]
            return out, router.limits("alpha"), clock.slept, await model_events(store)
        finally:
            await store.close()

    out, limits, slept, events = run(body())
    assert [g.provider for g in out] == ["alpha", "alpha", "beta"]
    assert out[2].notes[0] == "alpha: skipped, its per-minute window frees in 60 s"
    assert ("alpha", "RATE_LIMITED") in reasons(events)
    assert (
        slept == [] and limits["requests_last_minute"] == 2 and limits["effective_requests_per_minute"] == 2
    )


def test_a_short_wait_is_waited_for(db_schema):
    transport = FakeTransport({"alpha": [gemini_ok(answer("a"))]})

    async def body():
        store, router, clock = await make_router(db_schema, transport, limited(rpm=1, wait=60))
        try:
            first = await router.generate("t", "q", ANSWER_SCHEMA)
            clock.mono += 30
            second = await router.generate("t", "q", ANSWER_SCHEMA)
            return first, second, clock.slept
        finally:
            await store.close()

    first, second, slept = run(body())
    assert first.provider == second.provider == "alpha"
    assert slept == [pytest.approx(30)]
    assert second.notes == ["alpha: waited 30.0 s for its per-minute limit", "answered by alpha"]


def test_a_429_halves_the_limit_and_success_grows_it_back(db_schema):
    transport = FakeTransport(
        {"alpha": [google_429(retry="1s"), gemini_ok(answer())], "beta": [openai_ok(answer("b"))]}
    )

    async def body():
        store, router, clock = await make_router(db_schema, transport, limited(rpm=8, wait=0))
        try:
            first = await router.generate("t", "q", ANSWER_SCHEMA)
            after_429 = router.limits("alpha")["effective_requests_per_minute"]
            clock.mono += 2
            await router.generate("t", "q", ANSWER_SCHEMA)
            return first, after_429, router.limits("alpha")["effective_requests_per_minute"]
        finally:
            await store.close()

    first, after_429, after_ok = run(body())
    assert first.provider == "beta"
    assert first.notes[0] == "alpha: rate limited (HTTP 429), cooling down 1 s"  # RetryInfo, not cooldown_s
    assert after_429 == 4 and after_ok == 5


def test_a_used_up_day_is_stored_and_ends_at_the_providers_midnight(db_schema):
    transport = FakeTransport(
        {
            "alpha": [google_429("GenerateRequestsPerDayPerProjectPerModel-FreeTier", retry="20s")],
            "beta": [openai_ok(answer("b"))],
        }
    )

    async def body():
        store, router, clock = await make_router(db_schema, transport, limited(rpm=10))
        try:
            first = await router.generate("t", "q", ANSWER_SCHEMA)
            clock.mono += 3600  # long past the cooldown
            # another process: its own router, no per-minute history
            other = Router(
                store, parse_config(limited(rpm=10)), transport, KEYS, clock.monotonic, limits=Limits()
            )
            second = await other.generate("t", "q", ANSWER_SCHEMA)
            usage = await usage_today(store, router.config)
            # 09:00 UTC is 02:00 in Los Angeles; its next midnight is 22 hours on
            clock.now += timedelta(hours=22)
            transport.replies["alpha"] = [gemini_ok(answer("a"))]
            third = await other.generate("t", "q", ANSWER_SCHEMA)
            return first, second, usage, third, await model_events(store)
        finally:
            await store.close()

    first, second, usage, third, events = run(body())
    assert first.provider == "beta"
    assert "alpha: says its quota for 2026-10-31 is used up" in first.notes
    assert second.provider == "beta"
    assert second.notes[0] == "alpha: skipped, the provider said its quota for 2026-10-31 is used up"
    assert usage["alpha"]["exhausted"] and usage["alpha"]["day"] == "2026-10-31"
    assert third.provider == "alpha"
    assert ("alpha", "QUOTA_EXHAUSTED") in reasons(events)


def test_groq_headers_say_the_day_is_used_up_and_tokens_must_wait(db_schema):
    last = HttpResponse(
        200,
        openai_ok(answer("b")).body,
        {
            "x-ratelimit-remaining-requests": "0",
            "x-ratelimit-remaining-tokens": "5000",
            "x-ratelimit-reset-tokens": "1s",
        },
    )
    transport = FakeTransport({"beta": [last]})
    config = """
providers:
  - {name: beta, kind: openai, model: beta-oss, base_url: "https://beta.example/openai/v1",
     api_key_env: BETA_KEY, free: true}
"""

    async def body():
        store, router, _ = await make_router(db_schema, transport, config)
        try:
            first = await router.generate("t", "q", ANSWER_SCHEMA)
            try:
                await router.generate("t", "q", ANSWER_SCHEMA)
            except ModelError as exc:
                return first, exc
            return first, None
        finally:
            await store.close()

    first, error = run(body())
    assert first.provider == "beta" and "beta: says its quota for 2026-10-31 is used up" in first.notes
    assert error is not None and error.code == "NO_PROVIDER"
    assert error.notes == ["beta: skipped, the provider said its quota for 2026-10-31 is used up"]
