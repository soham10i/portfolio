"""The model router: a JSON answer that matches a schema, from whichever provider can give one
(P5.md §3, ADR-0015).

Providers are tried in config order. Each is skipped, with a `model.refused` event, when it has
no key, may not see private data, is cooling down after a 429 or 5xx, has used its daily quota
(ours, or the provider says so), would wait too long for a per-minute window (ADR-0031), or would
cost money it has no budget for. Each request reserves its quota and estimated cost first, so
concurrent calls cannot overspend, and settles them in the same transaction as its `model.called`
event.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re
import time
import uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

from ..store import EventStore
from ..store.events import new_trace_id
from .config import ProviderConfig, RouterConfig
from .limits import SHARED, Limits, ProviderLimits, quota_hint
from .providers import Message, ParseError, build_request, error_text, parse_reply
from .transport import Transport, TransportError, UrllibTransport

ROUTER_ACTOR = {"kind": "system", "id": "router"}
DEFAULT_STREAM = "models"
MODEL_CALLED = "model.called"
MODEL_REFUSED = "model.refused"
MAX_SCHEMA_RETRIES = 2
MAX_COOLDOWN_S = 600.0
_MICRO = 1_000_000
_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S)


@dataclass(frozen=True)
class Budget:
    """Limits for one generate() call. A cost limit of 0 means free providers only."""

    max_output_tokens: int = 1024
    max_cost_usd: float = 0.0
    temperature: float = 0.2


@dataclass
class Generation:
    output: Any
    provider: str
    model: str
    call_id: str
    attempts: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    latency_ms: float
    notes: list[str] = field(default_factory=list)


class ModelError(Exception):
    """No valid answer. `code`: NO_PROVIDER or OUTPUT_INVALID."""

    def __init__(self, code: str, message: str, call_id: str, notes: Sequence[str]) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.call_id = call_id
        self.notes = list(notes)


@dataclass
class _Outcome:
    kind: str  # ok | rate_limited | unavailable | error | invalid_output
    text: str = ""
    output: Any = None
    status: int | None = None
    retry_after: float | None = None
    per_day: bool = False
    headers: Mapping[str, str] = field(default_factory=dict)
    error: str = ""
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    latency_ms: float = 0.0


def _estimate_tokens(system: str, messages: list[Message], max_output_tokens: int) -> tuple[int, int]:
    chars = len(system) + sum(len(m["content"]) for m in messages)
    return math.ceil(chars / 4), max_output_tokens


def _retry_after(headers: Mapping[str, str], default: float, hinted: float | None = None) -> float:
    try:
        value = float(headers.get("retry-after", ""))
    except ValueError:
        value = hinted if hinted is not None else default
    return min(max(value, 0.0), MAX_COOLDOWN_S)


def _scrub(text: str, key: str | None) -> str:
    return text.replace(key, "[redacted]") if key else text


def _instructions(system: str, schema: Mapping[str, Any]) -> str:
    rule = "Reply with JSON only, no prose and no code fences, matching this JSON Schema:\n" + json.dumps(
        schema, sort_keys=True
    )
    return f"{system}\n\n{rule}" if system else rule


class Router:
    def __init__(
        self,
        store: EventStore,
        config: RouterConfig,
        transport: Transport | None = None,
        env: Mapping[str, str] | None = None,
        monotonic: Callable[[], float] = time.monotonic,
        *,
        limits: Limits | None = None,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
    ) -> None:
        self._store = store
        self._config = config
        self._transport = transport or UrllibTransport()
        self._env = os.environ if env is None else env
        self._monotonic = monotonic
        self._limits = SHARED if limits is None else limits
        self._sleep = sleep

    @property
    def config(self) -> RouterConfig:
        return self._config

    def _state(self, provider: ProviderConfig) -> ProviderLimits:
        return self._limits.of(provider.name, provider.requests_per_minute, provider.tokens_per_minute)

    def cooling_down(self, name: str) -> float:
        """Seconds left before `name` is tried again; 0 when it is not cooling down."""
        return max(0.0, self._state(self._config.provider(name)).cool_until - self._monotonic())

    def limits(self, name: str) -> dict[str, Any]:
        """The per-minute limits as this process sees them now (`nexus models`, the API)."""
        return self._state(self._config.provider(name)).snapshot(self._monotonic())

    async def generate(
        self,
        task: str,
        prompt: str,
        schema: Mapping[str, Any],
        *,
        system: str = "",
        budget: Budget | None = None,
        private: bool = False,
        providers: Sequence[str] | None = None,
        session_id: str | None = None,
        actor: Mapping[str, Any] = ROUTER_ACTOR,
        trace_id: str | None = None,
    ) -> Generation:
        try:
            Draft202012Validator.check_schema(schema)
        except SchemaError as exc:
            raise ValueError(f"schema is not a valid JSON Schema: {exc.message}") from None
        budget = budget or Budget()
        validator = Draft202012Validator(schema)
        candidates = (
            [self._config.provider(n) for n in providers] if providers is not None else self._config.providers
        )
        call = _Call(
            call_id=str(uuid.uuid4()),
            task=task,
            stream=f"session/{session_id}" if session_id else DEFAULT_STREAM,
            actor=dict(actor),
            trace_id=trace_id or new_trace_id(),
            system=_instructions(system, schema),
            prompt_sha256=hashlib.sha256(f"{system}\n{prompt}".encode()).hexdigest(),
        )
        notes: list[str] = []
        attempts = 0
        for provider in candidates:
            key = provider.api_key(self._env)
            skip = self._precheck(provider, key, private, budget, call.spent_usd)
            if skip:
                await self._refuse(call, provider, *skip)
                notes.append(f"{provider.name}: skipped, {skip[1]}")
                continue
            messages: list[Message] = [{"role": "user", "content": prompt}]
            for attempt in range(1, MAX_SCHEMA_RETRIES + 2):
                tokens_in, tokens_out = _estimate_tokens(call.system, messages, budget.max_output_tokens)
                estimate = provider.cost_usd(tokens_in, tokens_out)
                if not provider.free and call.spent_usd + estimate > budget.max_cost_usd:
                    reason = ("BUDGET_EXCEEDED", f"estimated ${estimate:.6f} is over this request's budget")
                    await self._refuse(call, provider, *reason)
                    notes.append(f"{provider.name}: skipped, {reason[1]}")
                    break
                state = self._state(provider)
                wait = state.wait_for(self._monotonic(), tokens_in + tokens_out)
                if wait > provider.max_wait_s:
                    frees = (
                        "never fits its per-minute token limit"
                        if math.isinf(wait)
                        else f"frees in {wait:.0f} s"
                    )
                    reason = ("RATE_LIMITED", f"its per-minute window {frees}")
                    await self._refuse(call, provider, *reason)
                    notes.append(f"{provider.name}: skipped, {reason[1]}")
                    break
                if wait > 0:
                    await self._sleep(wait)
                    notes.append(f"{provider.name}: waited {wait:.1f} s for its per-minute limit")
                day = provider.quota_day(self._store.clock())
                refused = await self._reserve(provider, day, estimate)
                if refused:
                    await self._refuse(call, provider, *refused)
                    notes.append(f"{provider.name}: skipped, {refused[1]}")
                    break
                attempts += 1
                use = state.record(self._monotonic(), tokens_in + tokens_out)
                outcome = await self._attempt(
                    call, provider, key, messages, validator, budget, attempt, day, estimate
                )
                if outcome.tokens_in or outcome.tokens_out:
                    use.tokens = outcome.tokens_in + outcome.tokens_out
                call.spent_usd += outcome.cost_usd
                day_used_up = state.observe_headers(self._monotonic(), outcome.headers) or outcome.per_day
                if outcome.kind == "rate_limited":
                    state.rate_limited()
                elif outcome.status is not None and 200 <= outcome.status < 300:
                    state.succeeded()
                if day_used_up:
                    await self._mark_exhausted(provider, day)
                    notes.append(f"{provider.name}: says its quota for {day.isoformat()} is used up")
                if outcome.kind == "ok":
                    if notes:
                        notes.append(f"answered by {provider.name}")
                    return Generation(
                        output=outcome.output,
                        provider=provider.name,
                        model=provider.model,
                        call_id=call.call_id,
                        attempts=attempts,
                        tokens_in=outcome.tokens_in,
                        tokens_out=outcome.tokens_out,
                        cost_usd=call.spent_usd,
                        latency_ms=outcome.latency_ms,
                        notes=notes,
                    )
                if outcome.kind == "invalid_output":
                    if attempt <= MAX_SCHEMA_RETRIES:
                        messages = [
                            *messages,
                            {"role": "assistant", "content": outcome.text},
                            {
                                "role": "user",
                                "content": f"That reply is not valid: {outcome.error}. "
                                "Reply again with only JSON that matches the schema.",
                            },
                        ]
                        continue
                    notes.append(f"{provider.name}: {attempt} replies did not match the schema")
                    raise ModelError(
                        "OUTPUT_INVALID",
                        f"{provider.name} gave no schema-valid reply in {attempt} attempts: {outcome.error}",
                        call.call_id,
                        notes,
                    )
                if outcome.kind in ("rate_limited", "unavailable"):
                    pause = outcome.retry_after
                    if pause is None:
                        pause = min(provider.cooldown_s, MAX_COOLDOWN_S)
                    state.cool_until = self._monotonic() + pause
                    what = (
                        f"rate limited (HTTP {outcome.status})"
                        if outcome.kind == "rate_limited"
                        else (f"unavailable ({outcome.error})")
                    )
                    notes.append(f"{provider.name}: {what}, cooling down {pause:g} s")
                else:
                    notes.append(f"{provider.name}: error ({outcome.error})")
                break
        raise ModelError("NO_PROVIDER", "no provider gave an answer", call.call_id, notes)

    # ── steps ─────────────────────────────────────────────────────────────────

    def _precheck(
        self, provider: ProviderConfig, key: str | None, private: bool, budget: Budget, spent: float
    ) -> tuple[str, str] | None:
        if private and not provider.private_ok:
            return "PRIVATE_DATA", "may not receive private data"
        if provider.api_key_env and not key:
            return "NO_KEY", f"${provider.api_key_env} is not set"
        if not provider.free:
            if provider.daily_budget_usd <= 0:
                return "BUDGET_EXCEEDED", "paid provider with a daily budget of 0"
            if not provider.priced:
                return "BUDGET_EXCEEDED", "paid provider without prices: its cost cannot be bounded"
            if budget.max_cost_usd <= spent:
                return "BUDGET_EXCEEDED", "this request has no budget for a paid provider"
        left = self.cooling_down(provider.name)
        if left > 0:
            return "COOLING_DOWN", f"cooling down for {left:.0f} s"
        return None

    async def _reserve(
        self, provider: ProviderConfig, day: date, estimate_usd: float
    ) -> tuple[str, str] | None:
        estimate = math.ceil(estimate_usd * _MICRO)
        async with self._store.transaction() as conn:
            await conn.execute(
                "INSERT INTO model_usage (provider, day) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                provider.name,
                day,
            )
            row = await conn.fetchrow(
                "SELECT requests, spent_micro_usd, reserved_micro_usd, exhausted_at FROM model_usage "
                "WHERE provider = $1 AND day = $2 FOR UPDATE",
                provider.name,
                day,
            )
            if row["exhausted_at"] is not None:
                return "QUOTA_EXHAUSTED", f"the provider said its quota for {day.isoformat()} is used up"
            cap = provider.max_requests_per_day
            if cap is not None and row["requests"] >= cap:
                return "DAILY_REQUEST_CAP", f"used its {cap} requests for {day.isoformat()}"
            if not provider.free:
                committed = row["spent_micro_usd"] + row["reserved_micro_usd"] + estimate
                if committed > math.floor(provider.daily_budget_usd * _MICRO):
                    return "BUDGET_EXCEEDED", f"daily budget ${provider.daily_budget_usd:g} would be exceeded"
            await conn.execute(
                "UPDATE model_usage SET requests = requests + 1, "
                "reserved_micro_usd = reserved_micro_usd + $3 WHERE provider = $1 AND day = $2",
                provider.name,
                day,
                estimate,
            )
        return None

    async def _mark_exhausted(self, provider: ProviderConfig, day: date) -> None:
        await self._store.pool.execute(
            "UPDATE model_usage SET exhausted_at = coalesce(exhausted_at, $3) "
            "WHERE provider = $1 AND day = $2",
            provider.name,
            day,
            self._store.clock(),
        )

    async def _attempt(
        self,
        call: _Call,
        provider: ProviderConfig,
        key: str | None,
        messages: list[Message],
        validator: Draft202012Validator,
        budget: Budget,
        attempt: int,
        day: date,
        estimate_usd: float,
    ) -> _Outcome:
        request = build_request(
            provider,
            key,
            call.system,
            messages,
            validator.schema,
            budget.max_output_tokens,
            budget.temperature,
        )
        started = time.perf_counter()
        try:
            outcome = await self._send(provider, request, validator)
        except Exception as exc:  # never leave a reservation behind, whatever went wrong
            outcome = _Outcome("error", error=f"{type(exc).__name__}: {exc}")
        outcome.latency_ms = round((time.perf_counter() - started) * 1000, 3)
        outcome.error = _scrub(outcome.error, key)
        outcome.text = _scrub(outcome.text, key)
        outcome.cost_usd = provider.cost_usd(outcome.tokens_in, outcome.tokens_out)
        await self._settle(call, provider, attempt, day, estimate_usd, outcome)
        return outcome

    async def _send(
        self, provider: ProviderConfig, request: Any, validator: Draft202012Validator
    ) -> _Outcome:
        try:
            response = await self._transport(request)
        except (TransportError, TimeoutError) as exc:
            return _Outcome("unavailable", error=str(exc) or type(exc).__name__)
        if response.status == 429:
            hint = quota_hint(response.body)
            return _Outcome(
                "rate_limited",
                status=429,
                retry_after=_retry_after(response.headers, provider.cooldown_s, hint.retry_after),
                per_day=hint.per_day,
                headers=response.headers,
                error=error_text(response.body),
            )
        if response.status >= 500:
            return _Outcome(
                "unavailable",
                status=response.status,
                retry_after=_retry_after(response.headers, provider.cooldown_s),
                error=f"HTTP {response.status}: {error_text(response.body)}",
            )
        if not 200 <= response.status < 300:
            return _Outcome(
                "error", status=response.status, error=f"HTTP {response.status}: {error_text(response.body)}"
            )
        try:
            reply = parse_reply(provider, response.body)
        except ParseError as exc:
            return _Outcome("error", status=response.status, error=str(exc))
        outcome = _Outcome(
            "invalid_output",
            text=reply.text,
            status=response.status,
            headers=response.headers,
            tokens_in=reply.tokens_in,
            tokens_out=reply.tokens_out,
        )
        match = _FENCE.match(reply.text)
        try:
            value = json.loads(match.group(1) if match else reply.text)
        except ValueError as exc:
            outcome.error = f"not JSON ({exc})"
            return outcome
        errors = sorted(validator.iter_errors(value), key=lambda e: list(e.absolute_path))
        if errors:
            outcome.error = "; ".join(
                f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in errors[:5]
            )
            return outcome
        outcome.kind, outcome.output = "ok", value
        return outcome

    async def _settle(
        self,
        call: _Call,
        provider: ProviderConfig,
        attempt: int,
        day: date,
        estimate_usd: float,
        outcome: _Outcome,
    ) -> None:
        payload: dict[str, Any] = {
            "call_id": call.call_id,
            "task": call.task,
            "provider": provider.name,
            "model": provider.model,
            "attempt": attempt,
            "outcome": outcome.kind,
            "tokens_in": outcome.tokens_in,
            "tokens_out": outcome.tokens_out,
            "cost_usd": outcome.cost_usd,
            "latency_ms": outcome.latency_ms,
            "prompt_sha256": call.prompt_sha256,
        }
        if outcome.status is not None:
            payload["http_status"] = outcome.status
        if outcome.kind == "ok":
            payload["output"] = outcome.output
        if outcome.error:
            payload["error"] = outcome.error[:500]
        async with self._store.transaction() as conn:
            await conn.execute(
                "UPDATE model_usage SET reserved_micro_usd = greatest(reserved_micro_usd - $3, 0), "
                "spent_micro_usd = spent_micro_usd + $4, tokens_in = tokens_in + $5, "
                "tokens_out = tokens_out + $6 WHERE provider = $1 AND day = $2",
                provider.name,
                day,
                math.ceil(estimate_usd * _MICRO),
                math.ceil(outcome.cost_usd * _MICRO),
                outcome.tokens_in,
                outcome.tokens_out,
            )
            await self._store.append_in(conn, call.stream, MODEL_CALLED, payload, call.actor, call.trace_id)

    async def _refuse(self, call: _Call, provider: ProviderConfig, reason: str, detail: str) -> None:
        payload = {
            "call_id": call.call_id,
            "task": call.task,
            "provider": provider.name,
            "model": provider.model,
            "reason": reason,
            "detail": detail,
        }
        await self._store.append(call.stream, MODEL_REFUSED, payload, call.actor, call.trace_id)


@dataclass
class _Call:
    call_id: str
    task: str
    stream: str
    actor: dict[str, Any]
    trace_id: str
    system: str
    prompt_sha256: str
    spent_usd: float = 0.0


async def usage_today(store: EventStore, config: RouterConfig) -> dict[str, dict[str, Any]]:
    """Each provider's `model_usage` row for its own quota day (today where its quota resets)."""
    now = store.clock()
    out: dict[str, dict[str, Any]] = {}
    for p in config.providers:
        day = p.quota_day(now)
        r = await store.pool.fetchrow(
            "SELECT requests, tokens_in, tokens_out, spent_micro_usd, reserved_micro_usd, exhausted_at "
            "FROM model_usage WHERE provider = $1 AND day = $2",
            p.name,
            day,
        )
        out[p.name] = {
            "day": day.isoformat(),
            "requests": r["requests"] if r else 0,
            "tokens_in": r["tokens_in"] if r else 0,
            "tokens_out": r["tokens_out"] if r else 0,
            "spent_usd": r["spent_micro_usd"] / _MICRO if r else 0.0,
            "reserved_usd": r["reserved_micro_usd"] / _MICRO if r else 0.0,
            "exhausted": bool(r and r["exhausted_at"] is not None),
        }
    return out
