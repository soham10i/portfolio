"""P5 A4-A8: failover, cooldown, schema retries, budgets, quotas, privacy, and events for every call."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import timedelta

import pytest

from nexus.llm import Budget, HttpResponse, ModelError, TransportError, usage_today

from .llm_support import (
    ANSWER_SCHEMA,
    CONFIG,
    KEYS,
    FakeTransport,
    answer,
    gemini_ok,
    make_router,
    model_events,
    ollama_ok,
    openai_ok,
    rate_limited,
)

pytestmark = pytest.mark.integration

PAID = """
providers:
  - {name: paid, kind: openai, model: big, base_url: "https://paid.example/v1", api_key_env: BETA_KEY,
     free: false, price_in_per_mtok: 100, price_out_per_mtok: 100, DAILY}
  - {name: local, kind: ollama, model: tiny, free: true, private_ok: true}
"""


def paid(budget: float | None) -> str:
    return PAID.replace(", DAILY", f", daily_budget_usd: {budget}" if budget is not None else "")


def run(coro):
    return asyncio.run(coro)


def summary(events: list[dict]) -> list[tuple]:
    out = []
    for e in events:
        p = e["payload"]
        out.append((e["type"], p["provider"], p.get("outcome") or p.get("reason")))
    return out


# ── A4: failover and cooldown ─────────────────────────────────────────────────


def test_a_429_fails_over_with_a_note_then_cools_down(db_schema):
    transport = FakeTransport({"alpha": [rate_limited("45")], "beta": [openai_ok(answer("from beta"))]})

    async def body():
        store, router, clock = await make_router(db_schema, transport)
        try:
            first = await router.generate("t", "q", ANSWER_SCHEMA)
            second = await router.generate("t", "q", ANSWER_SCHEMA)
            clock.mono += 46
            transport.replies["alpha"] = [gemini_ok(answer("alpha is back"))]
            third = await router.generate("t", "q", ANSWER_SCHEMA)
            return first, second, third, await model_events(store), await store.verify_chain()
        finally:
            await store.close()

    first, second, third, events, chain = run(body())
    assert first.provider == "beta" and first.output == {"answer": "from beta"}
    assert first.notes == ["alpha: rate limited (HTTP 429), cooling down 45 s", "answered by beta"]
    assert second.provider == "beta"
    assert second.notes == ["alpha: skipped, cooling down for 45 s", "answered by beta"]
    assert third.provider == "alpha" and third.notes == []
    assert len(transport.calls("alpha")) == 2  # not called while cooling down
    assert summary(events) == [
        ("model.called", "alpha", "rate_limited"),
        ("model.called", "beta", "ok"),
        ("model.refused", "alpha", "COOLING_DOWN"),
        ("model.called", "beta", "ok"),
        ("model.called", "alpha", "ok"),
    ]
    assert events[0]["payload"]["http_status"] == 429
    assert chain.ok


def test_server_errors_and_dead_hosts_fail_over_to_the_local_model(db_schema):
    transport = FakeTransport(
        {
            "alpha": [HttpResponse(503, b'{"error": {"message": "overloaded"}}')],
            "beta": [TransportError("ConnectionRefusedError: refused")],
            "local": [ollama_ok(answer("local"))],
        }
    )

    async def body():
        store, router, _ = await make_router(db_schema, transport)
        try:
            return await router.generate("t", "q", ANSWER_SCHEMA), await model_events(store)
        finally:
            await store.close()

    result, events = run(body())
    assert result.provider == "local"
    assert result.notes == [
        "alpha: unavailable (HTTP 503: overloaded), cooling down 30 s",
        "beta: unavailable (ConnectionRefusedError: refused), cooling down 60 s",
        "answered by local",
    ]
    assert [e["payload"]["outcome"] for e in events] == ["unavailable", "unavailable", "ok"]


def test_nobody_answers_is_a_clean_error(db_schema):
    transport = FakeTransport({"alpha": [HttpResponse(400, b'{"error": {"message": "bad request"}}')]})

    async def body():
        store, router, _ = await make_router(db_schema, transport)
        try:
            with pytest.raises(ModelError) as caught:
                await router.generate("t", "q", ANSWER_SCHEMA)
            return caught.value
        finally:
            await store.close()

    error = run(body())
    assert error.code == "NO_PROVIDER"
    assert error.notes[0] == "alpha: error (HTTP 400: bad request)"
    assert error.notes[1].startswith("beta: unavailable") and error.notes[2].startswith("local: unavailable")


# ── A5: schema retries ────────────────────────────────────────────────────────


def test_invalid_output_is_retried_twice_then_a_clean_error(db_schema):
    transport = FakeTransport(
        {"alpha": [gemini_ok("not json"), gemini_ok('{"answer": ""}'), gemini_ok("[1]")]}
    )

    async def body():
        store, router, _ = await make_router(db_schema, transport)
        try:
            with pytest.raises(ModelError) as caught:
                await router.generate("t", "q", ANSWER_SCHEMA)
            return caught.value, await model_events(store)
        finally:
            await store.close()

    error, events = run(body())
    assert error.code == "OUTPUT_INVALID"
    assert "alpha gave no schema-valid reply in 3 attempts" in str(error)
    assert len(transport.calls("alpha")) == 3 and transport.calls("beta") == []  # no failover
    assert [(e["payload"]["attempt"], e["payload"]["outcome"]) for e in events] == [
        (1, "invalid_output"),
        (2, "invalid_output"),
        (3, "invalid_output"),
    ]
    assert events[0]["payload"]["error"].startswith("not JSON")
    assert events[1]["payload"]["error"] == "answer: '' should be non-empty"
    # The retry shows the model its reply and what was wrong with it.
    retry = json.loads(transport.calls("alpha")[1].body)["contents"]
    assert [c["role"] for c in retry] == ["user", "model", "user"]
    assert retry[1]["parts"][0]["text"] == "not json"
    assert "That reply is not valid: not JSON" in retry[2]["parts"][0]["text"]


def test_a_retry_that_fixes_the_output_succeeds(db_schema):
    transport = FakeTransport(
        {"alpha": [gemini_ok('{"answer": 3}'), gemini_ok('```json\n{"answer": "3"}\n```')]}
    )

    async def body():
        store, router, _ = await make_router(db_schema, transport)
        try:
            return await router.generate("t", "q", ANSWER_SCHEMA)
        finally:
            await store.close()

    result = run(body())
    assert result.output == {"answer": "3"} and result.attempts == 2 and result.provider == "alpha"


def test_a_bad_schema_is_the_caller_bug():
    async def body():
        from nexus.llm import Router, parse_config

        router = Router(None, parse_config(CONFIG), FakeTransport(), KEYS)  # type: ignore[arg-type]
        with pytest.raises(ValueError, match="not a valid JSON Schema"):
            await router.generate("t", "q", {"type": "no-such-type"})

    run(body())


# ── A6: budgets and quotas ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("config", "budget", "detail"),
    [
        (paid(None), Budget(max_cost_usd=1.0), "paid provider with a daily budget of 0"),
        (paid(5.0), Budget(), "this request has no budget for a paid provider"),
        (paid(5.0), Budget(max_cost_usd=0.000001), "over this request's budget"),
        (paid(0.000001), Budget(max_cost_usd=1.0), "daily budget $1e-06 would be exceeded"),
        (
            paid(5.0).replace(", price_in_per_mtok: 100, price_out_per_mtok: 100", ""),
            Budget(max_cost_usd=1.0),
            "paid provider without prices",
        ),
    ],
    ids=["default-budget-zero", "request-budget-zero", "request-budget-small", "daily-budget", "unpriced"],
)
def test_a_paid_provider_without_budget_is_refused_before_any_request(db_schema, config, budget, detail):
    transport = FakeTransport({"local": [ollama_ok(answer("free"))]})

    async def body():
        store, router, _ = await make_router(db_schema, transport, config)
        try:
            return await router.generate("t", "q", ANSWER_SCHEMA, budget=budget), await model_events(store)
        finally:
            await store.close()

    result, events = run(body())
    assert transport.calls("https://paid.example/v1/chat/completions") == []
    assert result.provider == "local" and result.cost_usd == 0
    assert summary(events) == [("model.refused", "paid", "BUDGET_EXCEEDED"), ("model.called", "local", "ok")]
    assert detail in events[0]["payload"]["detail"]


def test_a_budgeted_paid_call_records_what_it_cost(db_schema):
    transport = FakeTransport()
    transport.replies["https://paid.example/v1/chat/completions"] = [openai_ok(answer(), 20, 7)]

    async def body():
        store, router, _ = await make_router(db_schema, transport, paid(1.0))
        try:
            result = await router.generate(
                "t", "q", ANSWER_SCHEMA, budget=Budget(max_output_tokens=64, max_cost_usd=0.1)
            )
            return result, await usage_today(store, router.config), await model_events(store)
        finally:
            await store.close()

    result, usage, events = run(body())
    assert result.provider == "paid" and result.cost_usd == pytest.approx(27 * 100 / 1_000_000)
    assert usage["paid"]["requests"] == 1 and usage["paid"]["spent_usd"] == pytest.approx(0.0027)
    assert usage["paid"]["reserved_usd"] == 0
    assert events[0]["payload"]["cost_usd"] == pytest.approx(0.0027)


def test_the_daily_request_cap_holds_under_concurrency(db_schema):
    config = CONFIG.replace("max_requests_per_day: 50", "max_requests_per_day: 5")
    transport = FakeTransport({"alpha": [gemini_ok(answer())]})

    async def body():
        store, router, clock = await make_router(db_schema, transport, config)
        try:
            outcomes = await asyncio.gather(
                *(router.generate("t", "q", ANSWER_SCHEMA, providers=["alpha"]) for _ in range(20)),
                return_exceptions=True,
            )
            usage = await usage_today(store, router.config)
            clock.now += timedelta(days=1)
            tomorrow = await router.generate("t", "q", ANSWER_SCHEMA, providers=["alpha"])
            return outcomes, usage, tomorrow, await model_events(store)
        finally:
            await store.close()

    outcomes, usage, tomorrow, events = run(body())
    errors = [o for o in outcomes if isinstance(o, ModelError)]
    assert len(outcomes) - len(errors) == 5 and len(errors) == 15
    assert all(e.code == "NO_PROVIDER" for e in errors)
    assert len(transport.calls("alpha")) == 6  # 5 today, 1 tomorrow
    assert usage["alpha"]["requests"] == 5
    assert sum(1 for e in events if e["payload"].get("reason") == "DAILY_REQUEST_CAP") == 15
    assert tomorrow.provider == "alpha"


# ── A7: private data ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("local_up", [True, False])
def test_private_requests_only_reach_private_ok_providers(db_schema, local_up):
    transport = FakeTransport(
        {
            "alpha": [gemini_ok(answer())],
            "beta": [openai_ok(answer())],
            "local": [ollama_ok(answer("kept local"))] if local_up else [],
        }
    )

    async def body():
        store, router, _ = await make_router(db_schema, transport)
        try:
            try:
                result = await router.generate("t", "secret plant data", ANSWER_SCHEMA, private=True)
            except ModelError as exc:
                result = exc
            return result, await model_events(store)
        finally:
            await store.close()

    result, events = run(body())
    assert transport.calls("alpha") == [] and transport.calls("beta") == []
    assert summary(events)[:2] == [
        ("model.refused", "alpha", "PRIVATE_DATA"),
        ("model.refused", "beta", "PRIVATE_DATA"),
    ]
    if local_up:
        assert result.provider == "local" and result.output == {"answer": "kept local"}
    else:
        assert isinstance(result, ModelError) and result.code == "NO_PROVIDER"


def test_providers_without_a_key_are_skipped(db_schema):
    transport = FakeTransport({"local": [ollama_ok(answer())]})

    async def body():
        store, router, _ = await make_router(db_schema, transport, env={})
        try:
            return await router.generate("t", "q", ANSWER_SCHEMA), await model_events(store)
        finally:
            await store.close()

    result, events = run(body())
    assert result.provider == "local" and transport.calls("alpha") == []
    assert summary(events)[:2] == [("model.refused", "alpha", "NO_KEY"), ("model.refused", "beta", "NO_KEY")]
    assert events[0]["payload"]["detail"] == "$ALPHA_KEY is not set"


# ── A8: every attempt is an event; no key in any of them ─────────────────────


def test_every_attempt_is_an_event_and_no_key_leaks(db_schema):
    echo_key = HttpResponse(
        401, json.dumps({"error": {"message": f"API key {KEYS['ALPHA_KEY']} invalid"}}).encode()
    )
    transport = FakeTransport(
        {
            "alpha": [echo_key],
            "beta": [rate_limited(), openai_ok("nope"), openai_ok(answer())],
            "local": [ollama_ok(answer())],
        }
    )
    session = str(uuid.uuid4())

    async def body():
        store, router, clock = await make_router(db_schema, transport)
        try:
            await router.generate("plan", "q", ANSWER_SCHEMA, session_id=session)
            clock.mono += 3600
            await router.generate("plan", "q", ANSWER_SCHEMA, session_id=session)
            events = await model_events(store, f"session/{session}")
            return events, await store.read("models"), await store.verify_chain()
        finally:
            await store.close()

    events, unscoped, chain = run(body())
    called = [e for e in events if e["type"] == "model.called"]
    assert len(called) == len(transport.sent) == 6
    assert unscoped == []  # with a session, every event is on the session stream
    dump = json.dumps(events)
    assert all(key not in dump for key in KEYS.values())
    assert called[0]["payload"]["error"] == "HTTP 401: API key [redacted] invalid"
    assert {e["payload"]["task"] for e in events} == {"plan"}
    assert len({e["payload"]["call_id"] for e in events}) == 2
    for e in called:
        assert set(e["payload"]) >= {
            "call_id",
            "provider",
            "model",
            "attempt",
            "outcome",
            "tokens_in",
            "tokens_out",
            "cost_usd",
            "latency_ms",
            "prompt_sha256",
        }
    assert called[-1]["payload"]["output"] == {"answer": "forty-two"}
    assert chain.ok
