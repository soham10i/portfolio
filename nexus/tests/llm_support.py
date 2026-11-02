"""Fakes for the model router tests: no test talks to a real provider (P5.md §0.2).

The canned bodies follow each provider's documented response format. They were written by hand,
not recorded from a live call.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from nexus.llm import HttpRequest, HttpResponse, Router, TransportError, parse_config
from nexus.llm.limits import Limits
from nexus.store import EventStore

from .db import URL

KEYS = {"ALPHA_KEY": "sk-alpha-secret-0001", "BETA_KEY": "gsk-beta-secret-0002"}
ANSWER_SCHEMA = {
    "type": "object",
    "required": ["answer"],
    "properties": {"answer": {"type": "string", "minLength": 1}},
    "additionalProperties": False,
}

CONFIG = """
providers:
  - {name: alpha, kind: gemini, model: alpha-flash, api_key_env: ALPHA_KEY, free: true,
     max_requests_per_day: 50, cooldown_s: 30}
  - {name: beta, kind: openai, model: beta-70b, base_url: "https://beta.example/openai/v1",
     api_key_env: BETA_KEY, free: true}
  - {name: local, kind: ollama, model: tiny, free: true, private_ok: true}
"""


def gemini_ok(text: str, tokens_in: int = 12, tokens_out: int = 5) -> HttpResponse:
    body = {
        "candidates": [{"content": {"role": "model", "parts": [{"text": text}]}, "finishReason": "STOP"}],
        "usageMetadata": {"promptTokenCount": tokens_in, "candidatesTokenCount": tokens_out},
    }
    return HttpResponse(200, json.dumps(body).encode())


def openai_ok(text: str, tokens_in: int = 20, tokens_out: int = 7) -> HttpResponse:
    body = {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": tokens_in, "completion_tokens": tokens_out},
    }
    return HttpResponse(200, json.dumps(body).encode())


def ollama_ok(text: str, tokens_in: int = 30, tokens_out: int = 9) -> HttpResponse:
    body = {
        "model": "tiny",
        "message": {"role": "assistant", "content": text},
        "done": True,
        "prompt_eval_count": tokens_in,
        "eval_count": tokens_out,
    }
    return HttpResponse(200, json.dumps(body).encode())


def rate_limited(retry_after: str | None = None) -> HttpResponse:
    body = {
        "error": {
            "code": 429,
            "message": "Resource has been exhausted (e.g. check quota).",
            "status": "RESOURCE_EXHAUSTED",
        }
    }
    headers = {"retry-after": retry_after} if retry_after is not None else {}
    return HttpResponse(429, json.dumps(body).encode(), headers)


def answer(text: str = "forty-two") -> str:
    return json.dumps({"answer": text})


Reply = HttpResponse | Exception | Callable[[HttpRequest], HttpResponse]


@dataclass
class FakeTransport:
    """Replies per provider host, in order; the last reply repeats. Records every request."""

    replies: dict[str, list[Reply]] = field(default_factory=dict)
    sent: list[HttpRequest] = field(default_factory=list)

    def host(self, request: HttpRequest) -> str:
        if "generativelanguage" in request.url:
            return "alpha"
        if "beta.example" in request.url:
            return "beta"
        if "localhost:11434" in request.url:
            return "local"
        return request.url

    def calls(self, host: str) -> list[HttpRequest]:
        return [r for r in self.sent if self.host(r) == host]

    async def __call__(self, request: HttpRequest) -> HttpResponse:
        self.sent.append(request)
        queue = self.replies.get(self.host(request))
        if not queue:
            raise TransportError("ConnectionRefusedError: [Errno 61] Connection refused")
        reply = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(reply, Exception):
            raise reply
        return reply(request) if callable(reply) else reply


class Clock:
    """A settable wall clock (the store's) and monotonic clock (the router's cooldowns)."""

    def __init__(self) -> None:
        self.now = datetime(2026, 10, 31, 9, 0, tzinfo=UTC)
        self.mono = 1000.0
        self.slept: list[float] = []

    def __call__(self) -> datetime:
        return self.now

    def monotonic(self) -> float:
        return self.mono

    async def sleep(self, seconds: float) -> None:
        """The router's waits: no real time passes, both clocks move on."""
        self.slept.append(seconds)
        self.mono += seconds
        self.now += timedelta(seconds=seconds)


async def make_router(
    schema: str,
    transport: FakeTransport,
    config: str = CONFIG,
    env: dict[str, str] | None = None,
    clock: Clock | None = None,
) -> tuple[EventStore, Router, Clock]:
    clock = clock or Clock()
    store = await EventStore.connect(URL, schema=schema, pool_size=8, clock=clock)
    router = Router(
        store,
        parse_config(config),
        transport,
        KEYS if env is None else env,
        clock.monotonic,
        limits=Limits(),  # each test starts with no per-minute history
        sleep=clock.sleep,
    )
    return store, router, clock


async def model_events(store: EventStore, stream: str = "models") -> list[dict[str, Any]]:
    return [e for e in await store.read(stream) if e["type"].startswith("model.")]
