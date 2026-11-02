"""Per-minute limits that adapt (P8.1.md §2, ADR-0031).

One `Limits` holds, per provider, a sliding one-minute window of requests and tokens, the
effective requests-per-minute limit, the cooldown after a 429 or 5xx, and what the provider's own
rate-limit headers last said. It lives in memory and is shared by every router in the process
(`SHARED`), so the API's per-request routers see each other's calls. A used-up *day* is not kept
here: it is stored in `model_usage`, so other processes see it too.

The effective limit starts at the configured `requests_per_minute`, halves on every 429, and grows
back by one on every success (additive increase, multiplicative decrease). A provider without a
configured limit only cools down after a 429.

Pure: the caller passes the monotonic time in.
"""

from __future__ import annotations

import json
import math
import re
from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

WINDOW_S = 60.0
_DURATION = re.compile(r"(\d+(?:\.\d+)?)(ms|h|m|s)")
_UNITS = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}


def parse_duration(text: str) -> float | None:
    """'2m59.56s', '7.66s', '250ms', '1h2m' or a bare number of seconds; None if unreadable."""
    text = (text or "").strip()
    try:
        return max(float(text), 0.0)
    except ValueError:
        pass
    parts = _DURATION.findall(text)
    if not parts or "".join(n + u for n, u in parts) != text:
        return None
    return sum(float(n) * _UNITS[u] for n, u in parts)


@dataclass(frozen=True)
class QuotaHint:
    """What a 429's body says: how long to wait, and whether the daily quota is what ran out."""

    retry_after: float | None = None
    per_day: bool = False


def quota_hint(body: bytes) -> QuotaHint:
    """Read Google's error details: `RetryInfo.retryDelay` and `QuotaFailure` quota ids
    (`...PerDay...` means the day is used up). Anything else gives an empty hint."""
    try:
        details = json.loads(body).get("error", {}).get("details", [])
    except (ValueError, AttributeError):
        return QuotaHint()
    if not isinstance(details, list):
        return QuotaHint()
    retry, per_day = None, False
    for d in details:
        if not isinstance(d, dict):
            continue
        kind = str(d.get("@type", ""))
        if kind.endswith("RetryInfo"):
            retry = parse_duration(str(d.get("retryDelay", "")))
        elif kind.endswith("QuotaFailure"):
            ids = [str(v.get("quotaId", "")) for v in d.get("violations", []) if isinstance(v, dict)]
            per_day = per_day or any("PerDay" in i for i in ids)
    return QuotaHint(retry, per_day)


@dataclass
class _Use:
    at: float
    tokens: int


@dataclass
class ProviderLimits:
    requests_per_minute: int | None
    tokens_per_minute: int | None
    effective_rpm: float | None = None
    window: deque[_Use] = field(default_factory=deque)
    cool_until: float = 0.0
    header_tokens_left: int | None = None
    header_tokens_reset_at: float = 0.0

    def __post_init__(self) -> None:
        if self.requests_per_minute is not None:
            self.effective_rpm = float(self.requests_per_minute)

    def _prune(self, now: float) -> None:
        while self.window and self.window[0].at <= now - WINDOW_S:
            self.window.popleft()

    def wait_for(self, now: float, tokens: int) -> float:
        """Seconds until a request of about `tokens` fits every per-minute limit; inf if it
        never can (it is larger than the whole token limit)."""
        self._prune(now)
        waits = [0.0]
        if self.effective_rpm is not None:
            allowed = max(1, math.floor(self.effective_rpm))
            if len(self.window) >= allowed:
                waits.append(self.window[len(self.window) - allowed].at + WINDOW_S - now)
        if self.tokens_per_minute is not None:
            if tokens > self.tokens_per_minute:
                return math.inf
            used = sum(u.tokens for u in self.window)
            for u in self.window:
                if used + tokens <= self.tokens_per_minute:
                    break
                used -= u.tokens
                waits.append(u.at + WINDOW_S - now)
        left = self.header_tokens_left
        if left is not None and self.header_tokens_reset_at > now and tokens > left:
            waits.append(self.header_tokens_reset_at - now)
        return max(max(waits), 0.0)

    def record(self, now: float, tokens: int) -> _Use:
        self._prune(now)
        use = _Use(now, tokens)
        self.window.append(use)
        return use

    def succeeded(self) -> None:
        if self.effective_rpm is not None and self.requests_per_minute is not None:
            self.effective_rpm = min(float(self.requests_per_minute), self.effective_rpm + 1)

    def rate_limited(self) -> None:
        """Without a configured limit there is nothing to halve: the 429's cooldown is all."""
        if self.effective_rpm is not None:
            self.effective_rpm = max(1.0, self.effective_rpm / 2)

    def observe_headers(self, now: float, headers: Mapping[str, str]) -> bool:
        """Read OpenAI-style `x-ratelimit-*` headers (Groq). True when they say no requests are
        left today."""
        left = headers.get("x-ratelimit-remaining-tokens")
        reset = parse_duration(headers.get("x-ratelimit-reset-tokens", ""))
        if left is not None and left.strip().isdigit() and reset is not None:
            self.header_tokens_left, self.header_tokens_reset_at = int(left), now + reset
        requests_left = headers.get("x-ratelimit-remaining-requests", "").strip()
        return requests_left == "0"

    def snapshot(self, now: float) -> dict[str, Any]:
        self._prune(now)
        return {
            "requests_per_minute": self.requests_per_minute,
            "effective_requests_per_minute": self.effective_rpm,
            "tokens_per_minute": self.tokens_per_minute,
            "requests_last_minute": len(self.window),
            "tokens_last_minute": sum(u.tokens for u in self.window),
            "cooling_down_s": round(max(0.0, self.cool_until - now), 3),
        }


class Limits:
    def __init__(self) -> None:
        self._by_name: dict[str, ProviderLimits] = {}

    def of(self, name: str, requests_per_minute: int | None, tokens_per_minute: int | None) -> ProviderLimits:
        state = self._by_name.get(name)
        if state is None or (state.requests_per_minute, state.tokens_per_minute) != (
            requests_per_minute,
            tokens_per_minute,
        ):
            state = self._by_name[name] = ProviderLimits(requests_per_minute, tokens_per_minute)
        return state


SHARED = Limits()
