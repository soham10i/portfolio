"""Provider configuration for the model router (P5.md §2, ADR-0015).

The rules that keep the router from spending money live here, so a config that breaks them never
loads: a free provider has no prices, a paid one has a budget that defaults to 0, keys are named
by environment variable only, and plain http is allowed only to this machine.
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from datetime import date, datetime
from importlib import resources
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONFIG_ENV = "NEXUS_MODELS_CONFIG"
_ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]{0,63}$")
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

DEFAULT_BASE_URLS = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "openai": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434",
}


class ProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,31}$")
    kind: Literal["gemini", "openai", "ollama"]
    model: str = Field(min_length=1, max_length=128)
    base_url: str | None = None
    api_key_env: str | None = None
    free: bool
    price_in_per_mtok: float = Field(default=0.0, ge=0)
    price_out_per_mtok: float = Field(default=0.0, ge=0)
    daily_budget_usd: float = Field(default=0.0, ge=0)
    max_requests_per_day: int | None = Field(default=None, ge=0)
    private_ok: bool = False
    timeout_s: float = Field(default=20.0, gt=0, le=120)
    cooldown_s: float = Field(default=60.0, ge=0, le=3600)
    # Per-minute limits (ADR-0031): the router waits up to max_wait_s for a window to free,
    # otherwise it moves on. The daily quota resets at midnight in quota_timezone.
    requests_per_minute: int | None = Field(default=None, ge=1)
    tokens_per_minute: int | None = Field(default=None, ge=1)
    quota_timezone: str = "UTC"
    max_wait_s: float = Field(default=5.0, ge=0, le=60)
    # Reasoning models (gpt-oss) spend output tokens thinking; "low" keeps that small.
    reasoning_effort: Literal["low", "medium", "high"] | None = None

    @field_validator("quota_timezone")
    @classmethod
    def _zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"quota_timezone {value!r} is not an IANA time zone") from None
        return value

    @field_validator("api_key_env")
    @classmethod
    def _env_name(cls, value: str | None) -> str | None:
        if value is not None and not _ENV_NAME.fullmatch(value):
            raise ValueError("api_key_env must name an environment variable (A-Z, 0-9, _), not hold a key")
        return value

    @model_validator(mode="after")
    def _rules(self) -> ProviderConfig:
        url = urlsplit(self.url)
        if url.scheme not in ("https", "http") or not url.hostname:
            raise ValueError(f"base_url {self.url!r} must be an http(s) URL")
        if url.scheme == "http" and url.hostname not in _LOCAL_HOSTS:
            raise ValueError(f"base_url {self.url!r}: plain http is only allowed to localhost")
        if url.username or url.password or url.query:
            raise ValueError("base_url must not carry credentials or a query string")
        if self.free and (self.price_in_per_mtok or self.price_out_per_mtok or self.daily_budget_usd):
            raise ValueError(f"{self.name} is free: prices and daily_budget_usd must be 0")
        if self.kind != "ollama" and self.api_key_env is None:
            raise ValueError(f"{self.name}: a {self.kind} provider needs api_key_env")
        return self

    @property
    def url(self) -> str:
        return (self.base_url or DEFAULT_BASE_URLS[self.kind]).rstrip("/")

    @property
    def priced(self) -> bool:
        """A paid provider can only be budgeted when both prices are known."""
        return self.price_in_per_mtok > 0 and self.price_out_per_mtok > 0

    def cost_usd(self, tokens_in: int, tokens_out: int) -> float:
        if self.free:
            return 0.0
        return (tokens_in * self.price_in_per_mtok + tokens_out * self.price_out_per_mtok) / 1_000_000

    def quota_day(self, moment: datetime) -> date:
        """The provider's quota day for `moment`: its date where the quota resets at midnight."""
        return moment.astimezone(ZoneInfo(self.quota_timezone)).date()

    def api_key(self, env: Mapping[str, str]) -> str | None:
        if self.api_key_env is None:
            return None
        return env.get(self.api_key_env) or None


class RouterConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    providers: list[ProviderConfig] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique(self) -> RouterConfig:
        names = [p.name for p in self.providers]
        if len(names) != len(set(names)):
            raise ValueError("provider names must be unique")
        return self

    def provider(self, name: str) -> ProviderConfig:
        for p in self.providers:
            if p.name == name:
                return p
        raise ValueError(f"no provider named {name!r} in the models config")


def parse_config(text: str) -> RouterConfig:
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError("a models config is a mapping with a 'providers' list")
    return RouterConfig.model_validate(data)


def load_config(path: str | Path | None = None) -> RouterConfig:
    """`path`, else $NEXUS_MODELS_CONFIG, else the packaged models.yaml."""
    path = path or os.environ.get(CONFIG_ENV)
    if path:
        return parse_config(Path(path).read_text(encoding="utf-8"))
    return parse_config(resources.files("nexus.llm").joinpath("models.yaml").read_text(encoding="utf-8"))
