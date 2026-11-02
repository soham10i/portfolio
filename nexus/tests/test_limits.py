"""P8.1 A3, without a database: durations, Google's 429 details, the window and AIMD."""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime

import pytest

from nexus.llm import load_config, parse_config
from nexus.llm.limits import Limits, ProviderLimits, parse_duration, quota_hint


@pytest.mark.parametrize(
    ("text", "seconds"),
    [("7.66s", 7.66), ("2m59.56s", 179.56), ("250ms", 0.25), ("1h2m", 3720.0), ("12", 12.0), ("0", 0.0)],
)
def test_durations(text, seconds):
    assert parse_duration(text) == pytest.approx(seconds)


@pytest.mark.parametrize("text", ["", "soon", "5x", "2m junk", "-"])
def test_unreadable_durations(text):
    assert parse_duration(text) is None


def google_429(*details) -> bytes:
    return json.dumps(
        {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "details": list(details)}}
    ).encode()


RETRY = {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "37s"}
PER_DAY = {
    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
    "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}],
}
PER_MINUTE = {
    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
    "violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}],
}


def test_google_quota_details():
    assert quota_hint(google_429(RETRY, PER_MINUTE)).retry_after == 37.0
    assert not quota_hint(google_429(RETRY, PER_MINUTE)).per_day
    assert quota_hint(google_429(PER_DAY)).per_day
    for body in [b"", b"not json", b"[]", json.dumps({"error": {"details": "x"}}).encode()]:
        hint = quota_hint(body)
        assert hint.retry_after is None and not hint.per_day


def test_the_request_window_slides():
    s = ProviderLimits(requests_per_minute=2, tokens_per_minute=None)
    assert s.wait_for(0, 10) == 0
    s.record(0, 10)
    s.record(5, 10)
    assert s.wait_for(10, 10) == pytest.approx(50)  # the first request leaves the window at 60
    assert s.wait_for(60.001, 10) == 0


def test_the_token_window_and_a_request_larger_than_it():
    s = ProviderLimits(requests_per_minute=None, tokens_per_minute=1000)
    s.record(0, 600)
    s.record(10, 300)
    assert s.wait_for(20, 100) == 0
    assert s.wait_for(20, 200) == pytest.approx(40)  # 600 must leave first
    assert s.wait_for(20, 500) == pytest.approx(40)
    assert s.wait_for(20, 950) == pytest.approx(50)  # both must leave
    assert math.isinf(s.wait_for(20, 1001))


def test_aimd_halves_on_429_and_grows_back_to_the_configured_limit():
    s = ProviderLimits(requests_per_minute=10, tokens_per_minute=None)
    s.rate_limited()
    assert s.effective_rpm == 5
    s.rate_limited()
    s.rate_limited()
    s.rate_limited()
    assert s.effective_rpm == 1  # never below one a minute
    for _ in range(20):
        s.succeeded()
    assert s.effective_rpm == 10  # never above what is configured


def test_without_a_configured_limit_a_429_only_cools_down():
    s = ProviderLimits(requests_per_minute=None, tokens_per_minute=None)
    for t in range(8):
        s.record(t, 1)
    s.rate_limited()
    s.succeeded()
    assert s.effective_rpm is None and s.wait_for(8.5, 1) == 0


def test_groq_headers():
    s = ProviderLimits(requests_per_minute=None, tokens_per_minute=None)
    headers = {
        "x-ratelimit-remaining-requests": "14",
        "x-ratelimit-remaining-tokens": "120",
        "x-ratelimit-reset-tokens": "7.66s",
    }
    assert s.observe_headers(100, headers) is False
    assert s.wait_for(100, 100) == 0
    assert s.wait_for(100, 500) == pytest.approx(7.66)
    assert s.wait_for(108, 500) == 0  # reset passed
    assert s.observe_headers(200, {"x-ratelimit-remaining-requests": "0"}) is True


def test_limits_are_per_name_and_reset_when_the_config_changes():
    limits = Limits()
    a = limits.of("gemini", 10, None)
    assert limits.of("gemini", 10, None) is a
    assert limits.of("groq", 10, None) is not a
    assert limits.of("gemini", 20, None) is not a


def test_the_packaged_config_keeps_the_order_and_has_caps():
    config = load_config()
    assert [p.name for p in config.providers] == ["gemini", "groq", "ollama"]
    gemini, groq, ollama = config.providers
    assert gemini.quota_timezone == "America/Los_Angeles" and gemini.requests_per_minute == 10
    assert groq.model == "openai/gpt-oss-120b" and groq.tokens_per_minute == 6000
    assert not gemini.private_ok and not groq.private_ok and ollama.private_ok
    assert all(p.free for p in config.providers)


def test_the_quota_day_follows_the_providers_zone():
    config = parse_config(
        """
providers:
  - {name: pac, kind: ollama, model: m, free: true, quota_timezone: America/Los_Angeles}
  - {name: utc, kind: ollama, model: m, free: true}
"""
    )
    moment = datetime(2026, 10, 31, 3, 0, tzinfo=UTC)  # 20:00 on the 30th in Los Angeles
    assert config.provider("pac").quota_day(moment).isoformat() == "2026-10-30"
    assert config.provider("utc").quota_day(moment).isoformat() == "2026-10-31"
    with pytest.raises(ValueError, match="IANA"):
        parse_config(
            "providers:\n  - {name: x, kind: ollama, model: m, free: true, quota_timezone: Mars/Base}"
        )
