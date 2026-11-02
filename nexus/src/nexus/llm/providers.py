"""Request builders and response parsers, one pair per provider kind (P5.md §3).

Pure functions: no I/O, no clock. The key only ever goes into a header, so it cannot leak through
a URL in a log, an event or an error message.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from .config import ProviderConfig
from .transport import HttpRequest

Message = dict[str, str]  # {"role": "user" | "assistant", "content": "..."}


class ParseError(ValueError):
    """The provider answered 2xx but not in the shape its API documents."""


@dataclass(frozen=True)
class Reply:
    text: str
    tokens_in: int
    tokens_out: int


def build_request(
    provider: ProviderConfig,
    key: str | None,
    system: str,
    messages: list[Message],
    schema: dict[str, Any],
    max_output_tokens: int,
    temperature: float,
) -> HttpRequest:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if provider.kind == "gemini":
        url = f"{provider.url}/models/{quote(provider.model, safe='.-_')}:generateContent"
        headers["x-goog-api-key"] = key or ""
        body: dict[str, Any] = {
            "contents": [
                {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                for m in messages
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "maxOutputTokens": max_output_tokens,
                "temperature": temperature,
            },
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
    elif provider.kind == "openai":
        url = f"{provider.url}/chat/completions"
        headers["Authorization"] = f"Bearer {key or ''}"
        body = {
            "model": provider.model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "response_format": {"type": "json_object"},
            "max_tokens": max_output_tokens,
            "temperature": temperature,
        }
        if provider.reasoning_effort:
            body["reasoning_effort"] = provider.reasoning_effort
    else:  # ollama
        url = f"{provider.url}/api/chat"
        body = {
            "model": provider.model,
            "messages": ([{"role": "system", "content": system}] if system else []) + messages,
            "stream": False,
            "format": schema,
            "options": {"temperature": temperature, "num_predict": max_output_tokens},
        }
    return HttpRequest(url, json.dumps(body).encode(), headers, provider.timeout_s)


def parse_reply(provider: ProviderConfig, body: bytes) -> Reply:
    try:
        data = json.loads(body)
        if provider.kind == "gemini":
            parts = data["candidates"][0]["content"]["parts"]
            usage = data.get("usageMetadata", {})
            return Reply(
                "".join(p.get("text", "") for p in parts),
                int(usage.get("promptTokenCount", 0)),
                int(usage.get("candidatesTokenCount", 0)),
            )
        if provider.kind == "openai":
            usage = data.get("usage") or {}
            return Reply(
                data["choices"][0]["message"]["content"] or "",
                int(usage.get("prompt_tokens", 0)),
                int(usage.get("completion_tokens", 0)),
            )
        return Reply(
            data["message"]["content"], int(data.get("prompt_eval_count", 0)), int(data.get("eval_count", 0))
        )
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise ParseError(f"unexpected {provider.kind} response: {type(exc).__name__}: {exc}") from None


def error_text(body: bytes, limit: int = 200) -> str:
    """A short, single-line description of an error body, for events."""
    try:
        data = json.loads(body)
        err = data.get("error", data) if isinstance(data, dict) else data
        text = err.get("message", json.dumps(err)) if isinstance(err, dict) else str(err)
    except ValueError:
        text = body.decode("utf-8", "replace")
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
