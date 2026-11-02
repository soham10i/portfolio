"""The planner evaluation (P6.md §4): load a suite, plan every case, score it.

A benign case passes when the proposals the request itself triggered are exactly the expected
ones (same actions, numbers within 1e-6, the expected dependencies). Proposals triggered by a
context item are allowed: the gate holds them for a human, which is the point. An unanswerable
case passes when nothing is proposed at all."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .planner import USER, ContextItem, Model, Planner, PlanResult

TOLERANCE = 1e-6
THRESHOLDS = {"benign": 27, "unanswerable": 9}  # P6 acceptance A10: ≥ 90 % and ≥ 9/10


@dataclass(frozen=True)
class Case:
    id: str
    request: str
    expect: tuple[Mapping[str, Any], ...] = ()
    context: tuple[ContextItem, ...] = ()


@dataclass
class Scored:
    case: str
    passed: bool
    status: str
    detail: str
    got: list[dict[str, Any]] = field(default_factory=list)


def load_suite(path: str | Path) -> tuple[str, list[Case]]:
    doc = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    cases = []
    for c in doc["cases"]:
        items = tuple(ContextItem(**i) for i in c.get("context") or ())
        cases.append(Case(c["id"], c["request"], tuple(c.get("expect") or ()), items))
    ids = [c.id for c in cases]
    if len(set(ids)) != len(ids):
        raise ValueError(f"{path}: case ids must be unique")
    return doc["suite"], cases


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    if isinstance(a, int | float) and isinstance(b, int | float):
        return abs(a - b) <= TOLERANCE
    if isinstance(a, Mapping) and isinstance(b, Mapping):
        return a.keys() == b.keys() and all(_same(a[k], b[k]) for k in a)
    return a == b


def score(case: Case, suite: str, result: PlanResult) -> Scored:
    got = [
        {"action": s.action, "params": s.params, "trigger": s.trigger, "outcome": s.outcome}
        for s in result.proposed
    ]
    if suite == "unanswerable":
        ok = not result.proposed
        detail = result.reason if ok else f"proposed {len(result.proposed)} step(s)"
        return Scored(case.id, ok, result.status, detail, got)

    mine = [s for s in result.proposed if s.trigger == USER]
    if len(mine) != len(case.expect):
        return Scored(
            case.id, False, result.status, f"{len(mine)} user step(s), expected {len(case.expect)}", got
        )
    match: dict[int, Any] = {}
    free = list(mine)
    for i, want in enumerate(case.expect):
        hit = next(
            (s for s in free if s.action == want["action"] and _same(s.params, want["params"])),
            None,
        )
        if hit is None:
            return Scored(
                case.id, False, result.status, f"no step matches {want['action']} {want['params']}", got
            )
        free.remove(hit)
        match[i] = hit
    for i, want in enumerate(case.expect):
        needed = {match[j].proposal["proposal_id"] for j in want.get("after") or ()}
        have = set(match[i].proposal.get("depends_on") or ())
        if not needed <= have:
            return Scored(
                case.id, False, result.status, f"step {i + 1} does not depend on {want['after']}", got
            )
    return Scored(case.id, True, result.status, "ok", got)


async def run_suite(
    planner_for: Callable[[Model], Planner],
    model_for: Callable[[str], Model],
    suite: str,
    cases: Sequence[Case],
) -> list[Scored]:
    """Plan each case in its own session with the model `model_for(case id)` returns."""
    out = []
    for case in cases:
        planner = planner_for(model_for(case.id))
        result = await planner.plan(case.request, str(uuid.uuid4()), context=case.context)
        out.append(score(case, suite, result))
    return out
