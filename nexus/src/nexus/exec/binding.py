"""What a pack's connector implements so the executor can drive it (P3.md §2)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol


class BindingError(RuntimeError):
    """The device refused or failed the request. Its effect is unknown, so it is compensated."""


@dataclass(frozen=True)
class ExecRequest:
    action: str  # the action id inside the pack, e.g. 'tank.fill'
    params: Mapping[str, Any]
    idempotency_key: str
    compensation: bool = False
    trace_id: str | None = field(default=None, compare=False)


class Binding(Protocol):
    async def execute(self, request: ExecRequest) -> None:
        """Ask the device to act. Raise BindingError on failure; returning means accepted."""

    async def observe(self) -> Mapping[str, Any]:
        """The current value of each observable the binding can see, keyed by state key."""
