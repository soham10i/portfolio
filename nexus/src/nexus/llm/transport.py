"""HTTP for the model router: one small protocol, a standard-library implementation, nothing else.

Tests replace the transport with a fake (tests/llm_support.py), and the test suite's guard makes
`UrllibTransport` refuse to run unless NEXUS_LLM_LIVE=1, so no test reaches a real provider.
"""

from __future__ import annotations

import asyncio
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol

_MAX_BODY = 4 * 1024 * 1024
_urlopen = urllib.request.urlopen  # the test guard replaces this


@dataclass(frozen=True)
class HttpRequest:
    url: str
    body: bytes
    headers: Mapping[str, str] = field(default_factory=dict)
    timeout_s: float = 20.0

    def __repr__(self) -> str:  # headers carry keys: never print them
        return f"HttpRequest(url={self.url!r}, {len(self.body)} bytes)"


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: bytes
    headers: Mapping[str, str] = field(default_factory=dict)


class TransportError(Exception):
    """The request did not get an HTTP response: connection refused, DNS, timeout."""


class Transport(Protocol):
    async def __call__(self, request: HttpRequest) -> HttpResponse: ...


class UrllibTransport:
    """POST with urllib in a worker thread. Non-2xx responses are returned, not raised."""

    async def __call__(self, request: HttpRequest) -> HttpResponse:
        return await asyncio.to_thread(self._post, request)

    @staticmethod
    def _post(request: HttpRequest) -> HttpResponse:
        req = urllib.request.Request(  # noqa: S310  (config only allows https, or http to localhost)
            request.url, data=request.body, headers=dict(request.headers), method="POST"
        )
        try:
            with _urlopen(req, timeout=request.timeout_s) as resp:
                return HttpResponse(
                    resp.status, resp.read(_MAX_BODY), {k.lower(): v for k, v in resp.headers.items()}
                )
        except urllib.error.HTTPError as exc:
            body = exc.read(_MAX_BODY) if exc.fp else b""
            return HttpResponse(exc.code, body, {k.lower(): v for k, v in (exc.headers or {}).items()})
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            reason = getattr(exc, "reason", exc)
            raise TransportError(f"{type(reason).__name__}: {reason}") from None
