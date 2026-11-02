"""An in-memory device for tests and the demo: counts calls, applies effects, injects faults."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from .binding import BindingError, ExecRequest

Effect = Callable[[dict[str, Any], Mapping[str, Any]], None]


@dataclass
class Fault:
    """What goes wrong on the next matching call. `on` limits it to normal or compensation calls."""

    kind: str  # 'error' | 'delay' | 'no_effect'
    on: str = "any"  # 'any' | 'action' | 'compensation'
    seconds: float = 0.0
    times: int = 1  # how many calls it affects; -1: every call

    def matches(self, request: ExecRequest) -> bool:
        if self.times == 0:
            return False
        return self.on == "any" or (self.on == "compensation") == request.compensation


@dataclass
class MockBinding:
    """`effects` maps an action id to a function that changes `observed` from the params."""

    effects: Mapping[str, Effect]
    observed: dict[str, Any] = field(default_factory=dict)
    faults: list[Fault] = field(default_factory=list)
    calls: list[ExecRequest] = field(default_factory=list)

    async def execute(self, request: ExecRequest) -> None:
        self.calls.append(request)
        for fault in self.faults:
            if not fault.matches(request):
                continue
            if fault.times > 0:
                fault.times -= 1
            if fault.kind == "error":
                raise BindingError(f"injected failure on {request.action}")
            if fault.kind == "delay":
                await asyncio.sleep(fault.seconds)
            if fault.kind == "no_effect":
                return
        effect = self.effects.get(request.action)
        if effect is None:
            raise BindingError(f"the mock has no effect for {request.action}")
        effect(self.observed, request.params)

    async def observe(self) -> Mapping[str, Any]:
        return dict(self.observed)

    def calls_for(self, compensation: bool | None = None) -> list[ExecRequest]:
        return [c for c in self.calls if compensation is None or c.compensation == compensation]
