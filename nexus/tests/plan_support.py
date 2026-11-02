"""A scripted model and helpers for the planner tests: no test talks to a real provider."""

from __future__ import annotations

import io
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from nexus.exec import Executor
from nexus.gate import Gate, Policy
from nexus.llm import ModelError
from nexus.packs import load_pack
from nexus.plan import Planner
from nexus.store import EventStore
from nexus_packs.echo.binding import EchoBinding
from nexus_packs.greenhouse.binding import GreenhouseBinding

from .db import URL

SESSION = "6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8"
LIGHTS = "greenhouse:greenhouse.set_lights"
TEMP = "greenhouse:greenhouse.set_temperature"
VENT = "greenhouse:greenhouse.set_vent"
WATER = "greenhouse:greenhouse.water"
HEATER = "greenhouse:greenhouse.heater_boost"
SAY = "echo:echo.say"


@dataclass
class Gen:
    output: Any
    call_id: str
    provider: str = "fake"
    model: str = "fake"
    notes: list[str] = field(default_factory=list)


class ScriptedModel:
    """Replies in order (the last one repeats); an Exception reply is raised. Records every call.
    It does not check replies against the schema, so the planner's own checks are what is tested."""

    def __init__(self, *replies: Any) -> None:
        self.replies = list(replies)
        self.seen: list[dict[str, Any]] = []

    @property
    def tasks(self) -> list[str]:
        return [c["task"] for c in self.seen]

    async def generate(self, task: str, prompt: str, schema: Any, **kw: Any) -> Gen:
        self.seen.append({"task": task, "prompt": prompt, "schema": schema, **kw})
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return Gen(reply, f"call-{len(self.seen)}")


def step(
    sid: str,
    action: str,
    params: dict[str, Any],
    *,
    depends_on: Sequence[str] = (),
    trigger: str = "user",
    uses: Sequence[str] = ("user",),
) -> dict[str, Any]:
    return {
        "id": sid,
        "action": action,
        "params": params,
        "rationale": f"the request asks for {action}",
        "depends_on": list(depends_on),
        "trigger": trigger,
        "uses": list(uses),
    }


def plan(*steps: dict[str, Any]) -> dict[str, Any]:
    return {"decision": "plan", "reason": "the catalog covers it", "steps": list(steps)}


def abstain(reason: str = "no action in the catalog does that") -> dict[str, Any]:
    return {"decision": "abstain", "reason": reason, "steps": []}


def accept(*ids: str, not_requested: Sequence[str] = ()) -> dict[str, Any]:
    reviews = [{"id": i, "requested": i not in not_requested, "problem": ""} for i in (*ids, *not_requested)]
    return {"verdict": "accept", "reason": "matches the request", "steps": reviews}


def revise(sid: str, problem: str) -> dict[str, Any]:
    return {
        "verdict": "revise",
        "reason": problem,
        "steps": [{"id": sid, "requested": True, "problem": problem}],
    }


def critic_abstains(reason: str = "the request is a question") -> dict[str, Any]:
    return {"verdict": "abstain", "reason": reason, "steps": []}


def no_provider() -> ModelError:
    return ModelError("NO_PROVIDER", "no provider gave an answer", "call-x", ["ollama: unavailable"])


async def kernel(schema: str, model: Any, **planner_kw: Any) -> tuple[EventStore, Gate, Planner]:
    store = await EventStore.connect(URL, schema=schema, pool_size=4)
    gate = Gate(store, [load_pack("echo"), load_pack("greenhouse")], Policy(name="test", version="1.0.0"))
    return store, gate, Planner(store, gate, model, **planner_kw)


def executor(store: EventStore, gate: Gate) -> tuple[Executor, GreenhouseBinding]:
    greenhouse = GreenhouseBinding()
    return Executor(store, gate, {"greenhouse": greenhouse, "echo": EchoBinding(io.StringIO())}), greenhouse


async def events(store: EventStore, session: str = SESSION) -> list[dict[str, Any]]:
    return await store.read(f"session/{session}")
