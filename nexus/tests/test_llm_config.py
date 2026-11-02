"""P5 A2: the config rules that keep the router from spending money or holding keys."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from nexus.llm import load_config, parse_config


def one(**fields: object) -> str:
    base = {"name": "p", "kind": "openai", "model": "m", "api_key_env": "P_KEY", "free": True}
    base.update(fields)
    return "providers:\n  - " + json.dumps(base) + "\n"  # JSON is YAML


def test_the_packaged_config_lists_only_free_providers():
    config = load_config()
    assert [p.name for p in config.providers] == ["gemini", "groq", "ollama"]
    assert all(p.free for p in config.providers)
    assert [p.name for p in config.providers if p.private_ok] == ["ollama"]
    assert {p.api_key_env for p in config.providers} == {"GEMINI_API_KEY", "GROQ_API_KEY", None}


def test_a_paid_provider_defaults_to_a_budget_of_zero():
    p = parse_config(one(free=False, price_in_per_mtok=1.0, price_out_per_mtok=2.0)).providers[0]
    assert p.daily_budget_usd == 0
    assert p.cost_usd(1_000_000, 500_000) == pytest.approx(2.0)


def test_a_free_provider_costs_nothing():
    p = parse_config(one()).providers[0]
    assert p.cost_usd(10**9, 10**9) == 0


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"price_in_per_mtok": 0.5}, "is free: prices and daily_budget_usd must be 0"),
        ({"daily_budget_usd": 5.0}, "is free: prices and daily_budget_usd must be 0"),
        ({"api_key_env": "sk-live-1234567890"}, "must name an environment variable"),
        ({"api_key_env": None}, "needs api_key_env"),
        ({"base_url": "http://api.example.com/v1"}, "plain http is only allowed to localhost"),
        ({"base_url": "ftp://example.com"}, "must be an http(s) URL"),
        ({"base_url": "https://user:pw@example.com"}, "must not carry credentials"),
        ({"base_url": "https://example.com/v1?key=abc"}, "must not carry credentials or a query"),
        ({"api_key": "inline"}, "Extra inputs are not permitted"),
        ({"daily_budget_usd": -1}, "greater than or equal to 0"),
    ],
)
def test_config_rules(fields, message):
    with pytest.raises(ValidationError, match=message.replace("(", r"\(").replace(")", r"\)")):
        parse_config(one(**fields))


def test_http_is_fine_to_localhost_and_names_are_unique():
    assert parse_config(one(kind="ollama", api_key_env=None, base_url="http://127.0.0.1:11434")).providers
    with pytest.raises(ValidationError, match="unique"):
        parse_config("providers:\n" + one()[len("providers:\n") :] * 2)


def test_unknown_provider_names_are_a_clean_error():
    with pytest.raises(ValueError, match="no provider named 'nope'"):
        load_config().provider("nope")


def test_the_config_file_comes_from_the_environment(tmp_path, monkeypatch):
    path = tmp_path / "models.yaml"
    path.write_text(one(name="mine"), encoding="utf-8")
    monkeypatch.setenv("NEXUS_MODELS_CONFIG", str(path))
    assert [p.name for p in load_config().providers] == ["mine"]


def test_api_keys_come_only_from_the_environment():
    p = load_config().provider("gemini")
    assert p.api_key({}) is None and p.api_key({"GEMINI_API_KEY": ""}) is None
    assert p.api_key({"GEMINI_API_KEY": "k"}) == "k"


def test_no_key_is_written_into_the_repository():
    from .support import ROOT

    text = (ROOT / ".env.example").read_text(encoding="utf-8")
    for line in text.splitlines():
        if (
            line.endswith(("_API_KEY=", "_ANCHOR_KEYS=", "_ANCHOR_DIR="))
            or line.startswith(("#", "NEXUS_DB_URL"))
            or not line
        ):
            continue
        raise AssertionError(f".env.example must leave keys empty: {line!r}")
