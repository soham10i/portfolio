"""The gate's decision function (P2.md §3). Pure: no I/O, no clock, no randomness.

The same proposal, packs, policy, snapshot and `now` always give the same Verdict."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from celpy import celtypes

from ..cel import CelError, StateView, params_map, to_cel
from ..contracts import Kind, validate
from .packs import LoadedAction, LoadedPack
from .policy import Policy

ALLOW, DENY, NEEDS_APPROVAL = "ALLOW", "DENY", "NEEDS_APPROVAL"
TRUSTED_SOURCES = ("user", "system")
_MAX_MESSAGE = 500


@dataclass(frozen=True)
class StateValue:
    value: Any
    version: int
    updated_at: datetime


@dataclass(frozen=True)
class Snapshot:
    """What the gate read before deciding.

    `state` maps (entity, key) to its value; `recent_decisions` maps a qualified action id to
    the times of this session's earlier non-DENY decisions for it."""

    state: Mapping[tuple[str, str], StateValue] = field(default_factory=dict)
    kill_switch: bool = False
    recent_decisions: Mapping[str, Sequence[datetime]] = field(default_factory=dict)


@dataclass(frozen=True)
class Reason:
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


@dataclass(frozen=True)
class Verdict:
    outcome: str
    reasons: tuple[Reason, ...]
    approvals_required: int
    autonomy: str
    state_versions: Mapping[str, int] = field(default_factory=dict)
    pack: LoadedPack | None = None
    action: LoadedAction | None = None

    @property
    def codes(self) -> list[str]:
        return [r.code for r in self.reasons]


def _reason(code: str, message: str) -> Reason:
    if len(message) > _MAX_MESSAGE:
        message = message[: _MAX_MESSAGE - 1] + "…"
    return Reason(code, message)


def _stop(code: str, message: str, autonomy: str = "L0", **found: Any) -> Verdict:
    return Verdict(DENY, (_reason(code, message),), 0, autonomy, **found)


def _resolve(qualified: str, packs: Mapping[str, LoadedPack]) -> tuple[LoadedPack, LoadedAction] | None:
    pack_id, _, action_id = qualified.partition(":")
    pack = packs.get(pack_id)
    action = pack.actions.get(action_id) if pack else None
    return (pack, action) if pack and action else None


def evaluate(
    proposal: Mapping[str, Any],
    packs: Mapping[str, LoadedPack],
    policy: Policy,
    snapshot: Snapshot,
    now: datetime,
) -> Verdict:
    # Steps 1-4 stop at the first failure.
    if snapshot.kill_switch:
        return _stop("KILL_SWITCH", "the kill switch is on; nothing executes")
    issues = validate(Kind.PROPOSAL, proposal) if isinstance(proposal, Mapping) else None
    if issues or issues is None:
        detail = str(issues[0]) if issues else "a proposal must be a JSON object"
        return _stop("PROPOSAL_INVALID", detail)
    resolved = _resolve(proposal["action"], packs)
    if resolved is None:
        return _stop("UNKNOWN_ACTION", f"no loaded pack declares {proposal['action']}")
    pack, action = resolved
    found = {"pack": pack, "action": action}
    errors = sorted(action.params_validator.iter_errors(proposal["params"]), key=lambda e: list(e.path))
    if errors:
        where = "/".join(str(p) for p in errors[0].path) or "params"
        return _stop("PARAMS_INVALID", f"{where}: {errors[0].message}", **found)

    # Steps 5-8 collect every reason.
    params = proposal["params"]
    autonomy = policy.effective_autonomy(pack.id, action.spec["autonomy"])
    denials: list[Reason] = []
    if autonomy == "L0":
        denials.append(_reason("AUTONOMY_OBSERVE_ONLY", f"{action.qualified} is at L0 (observe only)"))
    elif autonomy == "L1":
        denials.append(_reason("AUTONOMY_ADVISE_ONLY", f"{action.qualified} is at L1 (advise only)"))
    denials += _envelope(action, params)
    denials += _rate_limit(action, snapshot, now)
    precondition_denials, versions = _preconditions(action, pack, params, snapshot, now)
    denials += precondition_denials
    if denials:
        return Verdict(DENY, tuple(denials), 0, autonomy, versions, **found)

    # Steps 9-10 can only tighten an ALLOW into NEEDS_APPROVAL.
    holds = _taint(proposal["context"])
    if autonomy == "L2":
        holds.append(_reason("AUTONOMY_L2", f"{action.qualified} is at L2: a human approves each execution"))
    if action.spec["risk"] in ("high", "critical"):
        holds.append(_reason("RISK_HIGH", f"{action.spec['risk']}-risk actions always need human approval"))
    if holds:
        return Verdict(
            NEEDS_APPROVAL, tuple(holds), action.spec.get("approvers", 1), autonomy, versions, **found
        )
    return Verdict(ALLOW, (), 0, autonomy, versions, **found)


def rollback_limits(
    undo: LoadedAction,
    original: LoadedAction,
    pack: LoadedPack,
    params: Mapping[str, Any],
    snapshot: Snapshot,
    now: datetime,
) -> tuple[Reason, ...]:
    """Why a compensation may not run (ADR-0016): its own envelope, the original action's bounds
    on any parameter they share, and its own preconditions (where the safety limits live), all on
    fresh state. Approvals, autonomy and the rate limit do not apply: the compensation is part of
    an execution that was already authorised. Empty means it may run."""
    reasons: list[Reason] = []
    for reason in _envelope(undo, params) + (_envelope(original, params) if original is not undo else []):
        if reason not in reasons:
            reasons.append(reason)
    reasons += _preconditions(undo, pack, params, snapshot, now)[0]
    return tuple(reasons)


def _envelope(action: LoadedAction, params: Mapping[str, Any]) -> list[Reason]:
    bounds = (action.spec.get("envelope") or {}).get("params", {})
    out = []
    for name, bound in sorted(bounds.items()):
        value = params.get(name)
        if value is None:
            continue
        low, high = bound.get("min"), bound.get("max")
        if (low is not None and value < low) or (high is not None and value > high):
            limits = " and ".join(f"{k} {bound[k]}" for k in ("min", "max") if k in bound)
            out.append(_reason("ENVELOPE_EXCEEDED", f"{name}={value} is outside the envelope ({limits})"))
    return out


def _rate_limit(action: LoadedAction, snapshot: Snapshot, now: datetime) -> list[Reason]:
    limit = action.spec.get("rate_limit")
    if not limit:
        return []
    window = timedelta(seconds=limit["per_s"])
    recent = [t for t in snapshot.recent_decisions.get(action.qualified, ()) if now - t < window]
    if len(recent) < limit["max"]:
        return []
    return [
        _reason(
            "RATE_LIMITED",
            f"{len(recent)} decisions for {action.qualified} in the last {limit['per_s']} s"
            f" (max {limit['max']})",
        )
    ]


def visible_state(pack: LoadedPack, snapshot: Snapshot) -> tuple[StateView, dict[str, StateValue]]:
    """The pack's declared observables, converted to their declared type. A value of the wrong
    type is left out, so a precondition that reads it gets STATE_UNKNOWN."""
    rows: dict[str, StateValue] = {}
    values = []
    for (entity, key), row in sorted(snapshot.state.items()):
        observable = pack.observable_for(key) if entity == pack.id else None
        if observable is None:
            continue
        try:
            values.append((key, to_cel(row.value, observable.type)))
        except TypeError:
            continue
        rows[key] = row
    return StateView(values), rows


def _preconditions(
    action: LoadedAction, pack: LoadedPack, params: Mapping[str, Any], snapshot: Snapshot, now: datetime
) -> tuple[list[Reason], dict[str, int]]:
    if not action.preconditions:
        return [], {}
    view, rows = visible_state(pack, snapshot)
    limits = (action.spec.get("envelope") or {}).get("limits", {})
    activation = {
        "state": view.root,
        "params": params_map(params, action.param_types),
        "envelope": celtypes.MapType(
            {
                celtypes.StringType("limits"): celtypes.MapType(
                    {celtypes.StringType(k): celtypes.DoubleType(float(v)) for k, v in limits.items()}
                )
            }
        ),
    }
    out: list[Reason] = []
    versions: dict[str, int] = {}
    for i, expr in enumerate(action.preconditions):
        view.reset()
        where = f"precondition {i} ({expr.source})"
        try:
            result: Any = expr.evaluate(activation)
        except CelError as exc:
            if view.misses:
                out.append(_reason("STATE_UNKNOWN", f"{where} reads {view.misses[0]}, which has no value"))
            else:
                out.append(_reason("PRECONDITION_ERROR", f"{where}: {exc}"))
            result = None
        for key in view.reads:
            versions[key] = rows[key].version
        stale = sorted({k for k in view.reads if _is_stale(rows[k], pack, k, now)})
        if stale:
            age = (now - rows[stale[0]].updated_at).total_seconds()
            max_age = pack.observable_for(stale[0]).max_age_s
            out.append(_reason("STATE_STALE", f"{where} reads {stale[0]}, {age:.1f} s old (max {max_age} s)"))
        if result is None:
            continue
        if not isinstance(result, celtypes.BoolType):
            out.append(_reason("PRECONDITION_ERROR", f"{where} is a {type(result).__name__}, not a bool"))
        elif not result:
            out.append(_reason("PRECONDITION_FAILED", f"{where} is false"))
    return out, versions


def _is_stale(row: StateValue, pack: LoadedPack, key: str, now: datetime) -> bool:
    observable = pack.observable_for(key)
    return observable is not None and (now - row.updated_at).total_seconds() > observable.max_age_s


def _taint(context: Sequence[Mapping[str, Any]]) -> list[Reason]:
    trigger = next((item for item in context if item["triggered"]), None)
    if trigger is None:
        out = [_reason("NO_TRIGGER", "no context item is marked as the trigger")]
        if not any(item["source"] in TRUSTED_SOURCES for item in context):
            out.append(_reason("TAINTED_CONTEXT", "no context item comes from the user or the system"))
        return out
    if trigger["source"] not in TRUSTED_SOURCES:
        return [
            _reason(
                "TAINTED_TRIGGER",
                f"triggered by {trigger['source']} item {trigger['ref']!r};"
                " only user or system items authorize",
            )
        ]
    return []
