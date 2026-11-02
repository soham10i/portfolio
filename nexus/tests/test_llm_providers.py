"""P5 A3: request builders and parsers per provider kind; keys go in headers, never URLs."""

from __future__ import annotations

import json

import pytest

from nexus.llm import UrllibTransport, parse_config
from nexus.llm.providers import ParseError, build_request, error_text, parse_reply

from .llm_support import ANSWER_SCHEMA, CONFIG, KEYS, gemini_ok, ollama_ok, openai_ok

PROVIDERS = {p.name: p for p in parse_config(CONFIG).providers}
MESSAGES = [
    {"role": "user", "content": "q"},
    {"role": "assistant", "content": "bad"},
    {"role": "user", "content": "again"},
]


def build(name: str, key: str | None):
    return build_request(PROVIDERS[name], key, "be brief", MESSAGES, ANSWER_SCHEMA, 64, 0.1)


def test_gemini_request():
    req = build("alpha", KEYS["ALPHA_KEY"])
    assert req.url == "https://generativelanguage.googleapis.com/v1beta/models/alpha-flash:generateContent"
    assert req.headers["x-goog-api-key"] == KEYS["ALPHA_KEY"]
    body = json.loads(req.body)
    assert [c["role"] for c in body["contents"]] == ["user", "model", "user"]
    assert body["systemInstruction"] == {"parts": [{"text": "be brief"}]}
    assert body["generationConfig"] == {
        "responseMimeType": "application/json",
        "maxOutputTokens": 64,
        "temperature": 0.1,
    }


def test_openai_compatible_request():
    req = build("beta", KEYS["BETA_KEY"])
    assert req.url == "https://beta.example/openai/v1/chat/completions"
    assert req.headers["Authorization"] == f"Bearer {KEYS['BETA_KEY']}"
    body = json.loads(req.body)
    assert body["model"] == "beta-70b" and body["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in body["messages"]] == ["system", "user", "assistant", "user"]


def test_ollama_request_sends_the_schema_and_no_key():
    req = build("local", None)
    assert req.url == "http://localhost:11434/api/chat"
    assert "Authorization" not in req.headers and "x-goog-api-key" not in req.headers
    body = json.loads(req.body)
    assert body["format"] == ANSWER_SCHEMA and body["stream"] is False
    assert body["options"] == {"temperature": 0.1, "num_predict": 64}


@pytest.mark.parametrize("name", ["alpha", "beta"])
def test_keys_never_appear_in_urls_bodies_or_reprs(name):
    key = KEYS["ALPHA_KEY" if name == "alpha" else "BETA_KEY"]
    req = build(name, key)
    assert key not in req.url and key.encode() not in req.body and key not in repr(req)


@pytest.mark.parametrize(
    ("name", "response", "expected"),
    [
        ("alpha", gemini_ok('{"answer": "x"}', 3, 4), ('{"answer": "x"}', 3, 4)),
        ("beta", openai_ok('{"answer": "y"}', 5, 6), ('{"answer": "y"}', 5, 6)),
        ("local", ollama_ok('{"answer": "z"}', 7, 8), ('{"answer": "z"}', 7, 8)),
    ],
)
def test_parse_reply(name, response, expected):
    reply = parse_reply(PROVIDERS[name], response.body)
    assert (reply.text, reply.tokens_in, reply.tokens_out) == expected


@pytest.mark.parametrize("name", ["alpha", "beta", "local"])
@pytest.mark.parametrize("body", [b"not json", b"{}", b'{"candidates": []}', b"[]"])
def test_unexpected_shapes_are_a_parse_error(name, body):
    with pytest.raises(ParseError, match=f"unexpected {PROVIDERS[name].kind} response"):
        parse_reply(PROVIDERS[name], body)


def test_error_text_is_short_and_single_line():
    assert error_text(b'{"error": {"message": "quota\\n exceeded"}}') == "quota exceeded"
    assert len(error_text(b"x" * 1000)) == 200


def test_the_real_transport_is_blocked_in_tests():
    import asyncio

    req = build("beta", KEYS["BETA_KEY"])
    with pytest.raises(AssertionError, match="tried to call a real model provider"):
        asyncio.run(UrllibTransport()(req))
