"""GreenhouseBinding: a simulation that remembers what each action set; nothing real is connected."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from nexus.exec import BindingError, ExecRequest
from nexus.gate import LoadedPack


class GreenhouseBinding:
    def __init__(self) -> None:
        self.state: dict[str, Any] = {}
        self.calls: list[ExecRequest] = []

    async def execute(self, request: ExecRequest) -> None:
        p = request.params
        if request.action == "greenhouse.set_temperature":
            self.state[f"greenhouse.zone[{p['zone']}].setpoint_c"] = p["celsius"]
        elif request.action == "greenhouse.set_lights":
            self.state[f"greenhouse.zone[{p['zone']}].lights"] = p["on"]
        elif request.action == "greenhouse.set_vent":
            self.state["greenhouse.vent_pct"] = p["percent"]
        elif request.action == "greenhouse.water":
            self.state["greenhouse.water_l"] = self.state.get("greenhouse.water_l", 0) + p["litres"]
        elif request.action != "greenhouse.heater_boost":
            raise BindingError(f"greenhouse cannot {request.action}")
        self.calls.append(request)

    async def observe(self) -> Mapping[str, Any]:
        return dict(self.state)


def create_binding(pack: LoadedPack) -> GreenhouseBinding:
    return GreenhouseBinding()
