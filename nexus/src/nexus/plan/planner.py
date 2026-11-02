"""Planner.plan: request → typed plan → critic → gate, or abstain (P6.md §2, ADR-0020).

The model only ever writes a candidate plan. Everything that decides what happens to it is code:
the deterministic checks, the taint mapping, the dependency order and, above all, the gate. The
planner has no executor and no binding; it stops at `gate.decide`."""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..gate import DENY, Gate
from ..llm import Budget, ModelError
from ..store import EventStore
from ..store.events import new_trace_id, utc_timestamp
from .catalog import Catalog
from .schema import CRITIC_SCHEMA, CRITIC_SYSTEM, PLANNER_SYSTEM, critic_prompt, plan_prompt, plan_schema

PLANNER = {"kind": "agent", "id": "planner"}
PLAN_PROPOSED, PLAN_ABSTAINED, PLAN_GAVE_UP = "plan.proposed", "plan.abstained", "plan.gave_up"
UNTRUSTED_SOURCES = ("tool", "doc", "external")
USER = "user"
MAX_REQUEST = 4000
_ITEM_ID = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


class Model(Protocol):
    """What the planner needs from the router. `Router` satisfies it; tests pass fakes."""

    async def generate(
        self,
        task: str,
        prompt: str,
        schema: Mapping[str, Any],
        *,
        system: str = "",
        budget: Budget | None = None,
        private: bool = False,
        session_id: str | None = None,
        actor: Mapping[str, Any] = ...,
        trace_id: str | None = None,
    ) -> Any: ...


@dataclass(frozen=True)
class ContextItem:
    """Something the planner is shown besides the request: a document chunk, a tool output.
    It keeps its own source; it can never be `user` or `system` (blueprint §4.5)."""

    id: str
    source: str
    ref: str
    text: str

    def __post_init__(self) -> None:
        if not _ITEM_ID.fullmatch(self.id) or self.id == USER:
            raise ValueError(f"context item id {self.id!r} must match {_ITEM_ID.pattern} and not be 'user'")
        if self.source not in UNTRUSTED_SOURCES:
            raise ValueError(f"context item {self.id}: source must be one of {UNTRUSTED_SOURCES}")
        if not 1 <= len(self.ref) <= 256:
            raise ValueError(f"context item {self.id}: ref must be 1 to 256 characters")


@dataclass
class Step:
    id: str
    action: str
    params: dict[str, Any]
    rationale: str
    depends_on: tuple[str, ...]
    trigger: str
    uses: tuple[str, ...]
    status: str = "planned"  # planned → proposed | blocked | dropped
    note: str = ""
    proposal: dict[str, Any] | None = None
    decision: dict[str, Any] | None = None

    @property
    def outcome(self) -> str | None:
        return self.decision["outcome"] if self.decision else None

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "action": self.action,
            "params": self.params,
            "depends_on": list(self.depends_on),
            "trigger": self.trigger,
            "status": self.status,
            "note": self.note,
            "proposal_id": self.proposal["proposal_id"] if self.proposal else None,
            "decision_id": self.decision["decision_id"] if self.decision else None,
            "outcome": self.outcome,
        }


@dataclass
class PlanResult:
    plan_id: str
    session_id: str
    status: str  # proposed | abstained | gave_up
    reason: str
    steps: list[Step] = field(default_factory=list)
    rounds: int = 0
    model_calls: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    by: str = "planner"  # who abstained: planner | critic

    @property
    def proposed(self) -> list[Step]:
        return [s for s in self.steps if s.status == "proposed"]


def check_plan(
    output: Mapping[str, Any], catalog: Catalog, item_ids: Sequence[str], max_steps: int
) -> tuple[list[Step], list[str]]:
    """The deterministic checks (P6.md §2). Returns the steps and every problem found; nothing
    with a problem is ever proposed."""
    raw = list(output.get("steps") or [])
    problems: list[str] = []
    if not raw:
        return [], ["NO_STEPS: a plan needs at least one step; abstain when nothing in the catalog applies"]
    if len(raw) > max_steps:
        problems.append(f"STEP_BUDGET: the plan has {len(raw)} steps; at most {max_steps} are allowed")
    refs = {USER, *item_ids}
    steps: list[Step] = []
    seen: set[str] = set()
    for s in raw:
        sid = str(s.get("id", ""))
        if sid in seen:
            problems.append(f"DUPLICATE_STEP: step id {sid} is used twice")
        seen.add(sid)
        action = s.get("action")
        params = s.get("params")
        if action not in catalog:
            problems.append(f"UNKNOWN_ACTION: {sid}: {action!r} is not in the catalog")
        elif not isinstance(params, Mapping):
            problems.append(f"PARAMS_INVALID: {sid}: params must be an object")
        else:
            why = catalog.params_problem(action, params)
            if why:
                problems.append(f"PARAMS_INVALID: {sid}: {action} {why}")
        trigger, uses = s.get("trigger"), tuple(s.get("uses") or ())
        for ref in (trigger, *uses):
            if ref not in refs:
                problems.append(f"UNKNOWN_ITEM: {sid}: {ref!r} is not the request or a context item")
        steps.append(
            Step(
                id=sid,
                action=str(action),
                params=dict(params) if isinstance(params, Mapping) else {},
                rationale=str(s.get("rationale") or ""),
                depends_on=tuple(dict.fromkeys(str(d) for d in s.get("depends_on") or ())),
                trigger=str(trigger),
                uses=uses,
            )
        )
    for step in steps:
        for dep in step.depends_on:
            if dep == step.id:
                problems.append(f"BAD_DEPENDENCY: {step.id} depends on itself")
            elif dep not in seen:
                problems.append(f"BAD_DEPENDENCY: {step.id} depends on {dep}, which is not in the plan")
    structural = any(p.startswith(("BAD_DEPENDENCY", "DUPLICATE_STEP")) for p in problems)
    if not structural and topological(steps) is None:
        problems.append("BAD_DEPENDENCY: the dependencies form a cycle")
    return steps, problems


def topological(steps: Sequence[Step]) -> list[Step] | None:
    """Dependencies first, otherwise in plan order; None when there is a cycle."""
    by_id = {s.id: s for s in steps}
    done: set[str] = set()
    order: list[Step] = []
    while len(order) < len(steps):
        ready = next(
            (s for s in steps if s.id not in done and all(d in done for d in s.depends_on if d in by_id)),
            None,
        )
        if ready is None:
            return None
        done.add(ready.id)
        order.append(ready)
    return order


class Planner:
    """Plans one request at a time. Every model call is free-only (`max_cost_usd=0`) and, unless
    `private=False`, only goes to providers allowed private data (ADR-0021)."""

    def __init__(
        self,
        store: EventStore,
        gate: Gate,
        model: Model,
        *,
        max_steps: int = 6,
        max_rounds: int = 3,
        private: bool = True,
        critic: bool = True,
        max_output_tokens: int = 1024,
    ) -> None:
        if max_steps < 1 or max_rounds < 1:
            raise ValueError("max_steps and max_rounds must be at least 1")
        self._store = store
        self.gate = gate
        self.model = model
        self.catalog = Catalog(gate.packs.values(), gate.policy)
        self.max_steps = max_steps
        self.max_rounds = max_rounds
        self.private = private
        self.critic = critic
        self.budget = Budget(max_output_tokens=max_output_tokens, max_cost_usd=0.0, temperature=0.0)

    async def plan(
        self,
        request: str,
        session_id: str,
        *,
        context: Sequence[ContextItem] = (),
        request_ref: str = "request",
        trace_id: str | None = None,
    ) -> PlanResult:
        if not request.strip() or len(request) > MAX_REQUEST:
            raise ValueError(f"the request must be 1 to {MAX_REQUEST} characters")
        ids = [c.id for c in context]
        if len(set(ids)) != len(ids):
            raise ValueError("context item ids must be unique")
        items = {c.id: c for c in context}
        shown = [(c.id, c.source, c.text) for c in context]
        trace_id = trace_id or new_trace_id()
        result = PlanResult(str(uuid.uuid4()), session_id, "gave_up", "")
        catalog_text = self.catalog.text()
        schema = plan_schema(self.catalog.actions, ids, self.max_steps)
        system = PLANNER_SYSTEM.format(max_steps=self.max_steps)
        feedback: list[str] = []

        for round_ in range(1, self.max_rounds + 1):
            result.rounds = round_
            prompt = plan_prompt(catalog_text, request, shown, feedback)
            output = await self._call(result, "plan", prompt, schema, system, session_id, trace_id)
            if output is None:
                if result.status == "gave_up" and result.reason:
                    break  # no provider at all: another round cannot help
                feedback = ["your reply did not match the reply schema"]
                continue
            if output["decision"] == "abstain":
                return await self._abstain(result, request, "planner", output["reason"], trace_id)
            steps, problems = check_plan(output, self.catalog, ids, self.max_steps)
            if problems:
                result.problems = feedback = problems
                continue
            reviews: dict[str, Mapping[str, Any]] = {}
            if self.critic:
                plan_json = json.dumps({"steps": [_shown(s) for s in steps]}, sort_keys=True)
                review = await self._call(
                    result,
                    "critique",
                    critic_prompt(catalog_text, request, shown, plan_json),
                    CRITIC_SCHEMA,
                    CRITIC_SYSTEM,
                    session_id,
                    trace_id,
                )
                if review is None:
                    if result.status == "gave_up" and result.reason:
                        break
                    feedback = ["the review of your plan failed; plan again"]
                    continue
                if review["verdict"] == "abstain":
                    return await self._abstain(result, request, "critic", review["reason"], trace_id)
                if review["verdict"] == "revise":
                    found = [f"{r['id']}: {r['problem']}" for r in review["steps"] if r.get("problem")]
                    result.problems = feedback = [f"CRITIC: {p}" for p in (found or [review["reason"]])]
                    continue
                reviews = {r["id"]: r for r in review["steps"]}
            self._map_taint(steps, items, reviews if self.critic else None)
            result.steps = steps
            await self._submit(result, request, request_ref, items, trace_id)
            return result

        result.status = "gave_up"
        if not result.reason:
            result.reason = f"no acceptable plan in {self.max_rounds} round(s)"
        await self._store.append(
            f"session/{session_id}",
            PLAN_GAVE_UP,
            {
                "plan_id": result.plan_id,
                "request": request,
                "reason": result.reason,
                "problems": result.problems,
                "rounds": result.rounds,
                "model_calls": result.model_calls,
            },
            PLANNER,
            trace_id,
        )
        return result

    # ── steps ───────────────────────────────────────────────────────────────────

    async def _call(
        self,
        result: PlanResult,
        task: str,
        prompt: str,
        schema: Mapping[str, Any],
        system: str,
        session_id: str,
        trace_id: str,
    ) -> Mapping[str, Any] | None:
        """One model call. None when it gave no valid reply; with NO_PROVIDER the plan gives up."""
        try:
            generation = await self.model.generate(
                f"planner.{task}",
                prompt,
                schema,
                system=system,
                budget=self.budget,
                private=self.private,
                session_id=session_id,
                actor=PLANNER,
                trace_id=trace_id,
            )
        except ModelError as exc:
            result.model_calls.append(exc.call_id)
            result.problems = [f"MODEL_{exc.code}: {exc}"]
            if exc.code == "NO_PROVIDER":
                result.status, result.reason = "gave_up", "no model provider gave an answer"
            return None
        result.model_calls.append(generation.call_id)
        return generation.output

    def _map_taint(
        self,
        steps: list[Step],
        items: Mapping[str, ContextItem],
        reviews: Mapping[str, Mapping[str, Any]] | None,
    ) -> None:
        """Only the request authorizes (P6.md §0.5). A step keeps the `user` trigger only if it
        relied on the request and the critic (when there is one) found the request asked for it.
        Otherwise it is triggered by the context item it relied on, so the gate holds it for a
        human, or, with no such item, dropped as not asked for."""
        for step in steps:
            if step.trigger != USER:
                step.note = f"triggered by context item {step.trigger}"
                continue
            tainted = next((u for u in step.uses if u in items), None)
            review = reviews.get(step.id) if reviews is not None else None
            if USER not in step.uses and tainted:
                reason = "it relied only on context items"
            elif reviews is not None and (review is None or review.get("requested") is not True):
                reason = "the critic found the request did not ask for it"
            else:
                continue
            if tainted:
                step.trigger = tainted
                step.note = f"{reason}; triggered by context item {tainted}"
            else:
                step.status = "dropped"
                step.note = f"{reason}; dropped as not asked for"
        dropped = {s.id for s in steps if s.status == "dropped"}
        for step in topological(steps) or steps:
            gone = [d for d in step.depends_on if d in dropped]
            if step.status == "planned" and gone:
                step.status = "dropped"
                step.note = f"depends on {gone[0]}, which was dropped"
                dropped.add(step.id)

    async def _submit(
        self,
        result: PlanResult,
        request: str,
        request_ref: str,
        items: Mapping[str, ContextItem],
        trace_id: str,
    ) -> None:
        """Every surviving step through the gate, dependencies first (P6.md §2)."""
        steps = {s.id: s for s in result.steps}
        proposal_ids = {s.id: str(uuid.uuid4()) for s in result.steps}
        for step in topological(result.steps) or result.steps:
            if step.status != "planned":
                continue
            stopped = next(
                (
                    steps[d]
                    for d in step.depends_on
                    if steps[d].status != "proposed" or steps[d].outcome == DENY
                ),
                None,
            )
            if stopped is not None:
                why = "denied by the gate" if stopped.outcome == DENY else stopped.status
                step.status = "blocked"
                step.note = f"depends on {stopped.id}, which was {why}"
                continue
            step.proposal = self._proposal(result, step, proposal_ids, request_ref, items)
            step.decision = await self.gate.decide(step.proposal)
            step.status = "proposed"
        result.status = "proposed"
        result.reason = f"{len(result.proposed)} of {len(result.steps)} step(s) proposed"
        await self._store.append(
            f"session/{result.session_id}",
            PLAN_PROPOSED,
            {
                "plan_id": result.plan_id,
                "request": request,
                "rounds": result.rounds,
                "model_calls": result.model_calls,
                "steps": [s.summary() for s in result.steps],
            },
            PLANNER,
            trace_id,
        )

    def _proposal(
        self,
        result: PlanResult,
        step: Step,
        proposal_ids: Mapping[str, str],
        request_ref: str,
        items: Mapping[str, ContextItem],
    ) -> dict[str, Any]:
        """The planner, not the model, writes the context: the request is the only `user` item,
        every other item keeps its own source, and exactly one item is the trigger."""
        context = [{"source": USER, "ref": request_ref, "triggered": step.trigger == USER}]
        for ref in dict.fromkeys((*step.uses, step.trigger)):
            if ref in items:
                item = items[ref]
                context.append({"source": item.source, "ref": item.ref, "triggered": ref == step.trigger})
        proposal: dict[str, Any] = {
            "proposal_id": proposal_ids[step.id],
            "session_id": result.session_id,
            "plan_id": result.plan_id,
            "action": step.action,
            "params": step.params,
            "rationale": (step.rationale or step.action)[:2000],
            "context": context,
            "proposer": PLANNER,
            "idempotency_key": f"plan-{result.plan_id}-{step.id}",
            "created_at": utc_timestamp(self._store.clock()),
        }
        if step.depends_on:
            proposal["depends_on"] = [proposal_ids[d] for d in step.depends_on]
        return proposal

    async def _abstain(
        self, result: PlanResult, request: str, by: str, reason: str, trace_id: str
    ) -> PlanResult:
        result.status, result.by, result.reason = "abstained", by, reason or f"the {by} abstained"
        await self._store.append(
            f"session/{result.session_id}",
            PLAN_ABSTAINED,
            {
                "plan_id": result.plan_id,
                "request": request,
                "by": by,
                "reason": result.reason,
                "rounds": result.rounds,
                "model_calls": result.model_calls,
            },
            PLANNER,
            trace_id,
        )
        return result


def _shown(step: Step) -> dict[str, Any]:
    return {
        "id": step.id,
        "action": step.action,
        "params": step.params,
        "depends_on": list(step.depends_on),
        "trigger": step.trigger,
        "uses": list(step.uses),
        "rationale": step.rationale,
    }
