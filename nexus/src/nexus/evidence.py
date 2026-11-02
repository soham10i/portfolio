"""Evidence packs: one action explained from the event log alone (P4.md §3-4).

Nothing here writes. A pack is rebuilt from events and the `executions` projection every time."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from .contracts import Kind, ValidationIssue, validate
from .exec.approvals import (
    APPROVAL_GRANTED,
    APPROVAL_REJECTED,
    DecisionRef,
    approval_state,
    find_decision,
)
from .exec.executor import (
    EXECUTION_CALLED,
    EXECUTION_FINISHED,
    EXECUTION_REFUSED,
    EXECUTION_SHADOWED,
    EXECUTION_STARTED,
    EXECUTION_VERIFIED,
    INCIDENT_OPENED,
    SHADOW_COMPARED,
)
from .gate.evaluate import NEEDS_APPROVAL
from .gate.gate import DECISION_MADE
from .store import ChainReport, EventStore
from .store.events import _EVENT_COLUMNS, _row_to_event
from .store.state import STATE_SET

# The gate's checks in evaluation order, with the reason codes that fail each (P2.md §3).
# Checks 1-4 stop at the first failure; a failure in 5-8 is a DENY and 9-10 never run.
GATE_CHECKS: tuple[tuple[str, frozenset[str]], ...] = (
    ("kill_switch", frozenset({"KILL_SWITCH"})),
    ("schema", frozenset({"PROPOSAL_INVALID"})),
    ("action_known", frozenset({"UNKNOWN_ACTION"})),
    ("params", frozenset({"PARAMS_INVALID"})),
    ("autonomy", frozenset({"AUTONOMY_OBSERVE_ONLY", "AUTONOMY_ADVISE_ONLY"})),
    ("envelope", frozenset({"ENVELOPE_EXCEEDED"})),
    ("rate_limit", frozenset({"RATE_LIMITED"})),
    (
        "preconditions",
        frozenset({"STATE_UNKNOWN", "STATE_STALE", "PRECONDITION_FAILED", "PRECONDITION_ERROR"}),
    ),
    ("taint", frozenset({"NO_TRIGGER", "TAINTED_CONTEXT", "TAINTED_TRIGGER"})),
    ("risk_routing", frozenset({"AUTONOMY_L2", "RISK_HIGH"})),
)
_SHORT_CIRCUIT, _DENY_GROUP = 4, 8
_HOLDS = frozenset({"taint", "risk_routing"})  # failing these asks a human; it denies nothing
_MAX_DETAIL = 2000
_MAX_MESSAGE = 500


@dataclass
class Evidence:
    """An evidence pack, the events it was built from (in log order), and the chain verdicts of
    every stream it references."""

    pack: dict[str, Any]
    events: list[dict[str, Any]]
    chain: dict[str, ChainReport] = field(default_factory=dict)
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def decision_id(self) -> str:
        return self.pack["decision"]["decision_id"]

    @property
    def intact(self) -> bool:
        return all(report.ok for report in self.chain.values())


async def find_decision_id(conn: Any, ident: str) -> str | None:
    """A decision id, a proposal id (its latest decision) or an idempotency key → decision id."""
    if await find_decision(conn, ident) is not None:
        return ident
    by_proposal = await conn.fetchval(
        "SELECT payload->'decision'->>'decision_id' FROM events WHERE type = $1 "
        "AND payload->'proposal'->>'proposal_id' = $2 ORDER BY pos DESC LIMIT 1",
        DECISION_MADE,
        ident,
    )
    if by_proposal is not None:
        return by_proposal
    return await conn.fetchval("SELECT decision_id FROM executions WHERE idempotency_key = $1", ident)


async def build_evidence(store: EventStore, ident: str) -> Evidence | None:
    """The evidence pack for one decision, or None when nothing matches `ident`."""
    async with store.pool.acquire() as conn, conn.transaction(isolation="repeatable_read"):
        decision_id = await find_decision_id(conn, ident)
        ref = await find_decision(conn, decision_id) if decision_id else None
        if ref is None:
            return None
        rows = await conn.fetch(
            f"SELECT {_EVENT_COLUMNS} FROM events WHERE stream = $1 "  # noqa: S608
            "AND (seq = $2 OR payload->>'decision_id' = $3) ORDER BY pos",
            ref.stream,
            ref.seq,
            ref.decision_id,
        )
        traces = sorted({r["trace_id"] for r in rows if r["seq"] != ref.seq})
        rows += await conn.fetch(
            f"SELECT {_EVENT_COLUMNS} FROM events WHERE type = $1 AND trace_id = ANY($2::text[]) "  # noqa: S608
            "ORDER BY pos",
            STATE_SET,
            traces,
        )
        rows = sorted(rows, key=lambda r: r["pos"])
        approvals = await approval_state(conn, ref)
        execution = await conn.fetchrow(
            "SELECT * FROM executions WHERE decision_id = $1 ORDER BY started_at LIMIT 1", ref.decision_id
        )
        head = await conn.fetchval("SELECT head_hash FROM streams WHERE stream = $1", ref.stream)
    events = [_row_to_event(r) for r in rows]
    pack = {
        "proposal": ref.proposal,
        "decision": ref.decision,
        "checks": _checks(ref, events, approvals),
        "approvals": [_approval(a) for a in approvals.approvals],
        "execution": _execution(execution, events),
        "verification": _verification(events),
        "incidents": _incidents(events),
        "shadow": _shadow(execution, events),
        "event_refs": [{"stream": e["stream"], "seq": e["seq"]} for e in events],
        "chain_head": head,
    }
    chain = {s: await store.verify_chain(s) for s in sorted({e["stream"] for e in events})}
    return Evidence(pack, events, chain, validate(Kind.EVIDENCE, pack))


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def gate_checks(reasons: Sequence[Mapping[str, str]]) -> list[dict[str, Any]]:
    """The checks the gate ran for these reasons, in order, each passed or failed."""
    out: list[dict[str, Any]] = []
    known: set[str] = set()
    for i, (name, codes) in enumerate(GATE_CHECKS, start=1):
        known |= codes
        messages = [r["message"] for r in reasons if r["code"] in codes]  # in the gate's order
        check: dict[str, Any] = {"name": name, "passed": not messages}
        if messages:
            check["detail"] = _clip("; ".join(messages), _MAX_DETAIL)
        out.append(check)
        if (i <= _SHORT_CIRCUIT or i == _DENY_GROUP) and any(not c["passed"] for c in out):
            break
    unknown = [f"{r['code']}: {r['message']}" for r in reasons if r["code"] not in known]
    if unknown:  # a code this table does not know yet: shown, never hidden
        out.append({"name": "gate", "passed": False, "detail": _clip("; ".join(unknown), _MAX_DETAIL)})
    return out


def _approval(a: Mapping[str, Any]) -> dict[str, Any]:
    """An approval as the pack shows it. Only approvals that count reach here, so a signature on
    one has verified (approval_state re-checks it)."""
    out = {"approver": a["approver"], "proposal_hash": a["proposal_hash"], "approved_at": a["approved_at"]}
    if sig := a.get("signature"):
        out["signature"] = {k: sig[k] for k in ("alg", "key_id", "public_key", "value")} | {"verified": True}
    return out


def _checks(ref: DecisionRef, events: list[dict[str, Any]], approvals: Any) -> list[dict[str, Any]]:
    decision = ref.decision
    out = gate_checks(decision["reasons"])
    if decision["outcome"] == NEEDS_APPROVAL:
        got, needed = len(approvals.approvals), decision["approvals_required"]
        if approvals.rejection is not None:
            r = approvals.rejection
            detail = f"rejected by {r['rejector']['id']}: {r['reason']}"
        else:
            detail = f"{got} of {needed} distinct human approval{'s' if needed != 1 else ''}"
        passed = approvals.rejection is None and got >= needed
        out.append({"name": "approvals", "passed": passed, "detail": _clip(detail, _MAX_DETAIL)})
    started = next((e for e in events if e["type"] == EXECUTION_STARTED), None)
    if started is not None:
        refused = next(
            (e for e in events if e["type"] == EXECUTION_REFUSED and e["seq"] > started["seq"]), None
        )
        check: dict[str, Any] = {"name": "recheck", "passed": refused is None}
        if refused is not None:
            codes = [refused["payload"]["code"], *(r["code"] for r in refused["payload"]["reasons"])]
            check["detail"] = _clip(", ".join(codes), _MAX_DETAIL)
        out.append(check)
    return out


_EXECUTION_STATUS = {"succeeded": "succeeded", "failed": "failed", "compensated": "compensated"}


def _execution(row: Any, events: list[dict[str, Any]]) -> dict[str, Any]:
    if row is None:
        refusals = [e for e in events if e["type"] == EXECUTION_REFUSED]
        out: dict[str, Any] = {"status": "not_run"}
        if refusals:
            code = refusals[-1]["payload"]["code"]
            out["error"] = {"code": code, "message": f"execution refused: {code}"}
        return out
    status = row["status"]
    out = {"status": _EXECUTION_STATUS.get(status, "not_run"), "idempotency_key": row["idempotency_key"]}
    out["started_at"] = row["started_at"]
    if row["finished_at"]:
        out["finished_at"] = row["finished_at"]
    if status == "refused":
        out["error"] = {"code": row["error"], "message": f"execution refused at re-check: {row['error']}"}
    elif status in ("failed", "compensated"):
        out["error"] = {"code": "EXECUTION_FAILED", "message": _clip(row["error"] or "", _MAX_MESSAGE)}
    elif status == "compensation_failed":
        out["error"] = {"code": "COMPENSATION_FAILED", "message": _clip(row["error"] or "", _MAX_MESSAGE)}
    return out


def _verification(events: list[dict[str, Any]]) -> dict[str, Any]:
    primary = next(
        (e for e in events if e["type"] == EXECUTION_VERIFIED and not e["payload"]["compensation"]), None
    )
    if primary is None:
        return {"status": "not_run"}
    return {"status": primary["payload"]["status"], "observed": primary["payload"]["observed"]}


def _incidents(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "incident_id": e["payload"]["incident_id"],
            "kind": e["payload"]["kind"],
            "detail": _clip(e["payload"]["detail"], _MAX_DETAIL),
            "opened_at": e["ts"],
        }
        for e in events
        if e["type"] == INCIDENT_OPENED
    ]


def _shadow(row: Any, events: list[dict[str, Any]]) -> dict[str, Any]:
    started = next((e for e in events if e["type"] == EXECUTION_STARTED), None)
    active = (row is not None and row["status"] == "shadowed") or bool(
        started and started["payload"].get("shadow")
    )
    comparisons = [
        {
            "human": e["actor"],
            "human_outcome": e["payload"]["human_outcome"],
            "agree": e["payload"]["agree"],
            "recorded_at": e["ts"],
        }
        for e in events
        if e["type"] == SHADOW_COMPARED
    ]
    return {"active": active, "comparisons": comparisons}


# ── the human-readable trace (`nexus trace`) ──────────────────────────────────


def _actor(actor: Mapping[str, Any]) -> str:
    return f"{actor.get('kind')}:{actor.get('id')}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _summary(event: Mapping[str, Any]) -> str:
    p, kind = event["payload"], event["type"]
    if kind == DECISION_MADE:
        codes = ", ".join(r["code"] for r in p["decision"]["reasons"])
        return p["decision"]["outcome"] + (f" ({codes})" if codes else "")
    if kind == APPROVAL_GRANTED:
        return f"by {_actor(p['approver'])} for hash {p['proposal_hash'][:12]}…"
    if kind == APPROVAL_REJECTED:
        return f"by {_actor(p['rejector'])}: {p['reason']}"
    if kind == EXECUTION_REFUSED:
        return ", ".join([p["code"], *(r["code"] for r in p["reasons"])])
    if kind == EXECUTION_STARTED:
        return f"key {p['idempotency_key']}, {p['approvals']} approval(s){', shadow' if p['shadow'] else ''}"
    if kind == EXECUTION_CALLED:
        what = f"{'compensation ' if p['compensation'] else ''}{p['action']} {_json(p['params'])}"
        return f"{what} → {'ok' if p['ok'] else p['error']} in {p['duration_ms']} ms"
    if kind == EXECUTION_VERIFIED:
        what = "compensation " if p["compensation"] else ""
        return f"{what}{p['status']} after {p['attempts']} observation(s), observed {_json(p['observed'])}"
    if kind == EXECUTION_FINISHED:
        return p["status"] + (f": {p['error']}" if p["error"] else "")
    if kind == EXECUTION_SHADOWED:
        return "shadow mode: decided and recorded, nothing executed"
    if kind == INCIDENT_OPENED:
        return f"{p['kind']}: {p['detail']}"
    if kind == SHADOW_COMPARED:
        verdict = "agree" if p["agree"] else "DISAGREE"
        return f"human says {p['human_outcome']}, gate said {p['gate_outcome']} ({verdict})"
    if kind == STATE_SET:
        return f"{p['entity']} {p['key']} = {_json(p['value'])} (v{p['version']})"
    return _json(p)[:120]


def render(evidence: Evidence) -> list[str]:
    """`nexus trace` output: what was asked, what the gate decided and why, who approved, what
    ran, what was observed, and whether the log those facts come from is intact."""
    pack = evidence.pack
    decision = pack["decision"]
    proposal = pack["proposal"] if isinstance(pack["proposal"], Mapping) else {}
    trigger = next((c for c in proposal.get("context", []) if c.get("triggered")), None)
    lines = [
        f"decision  {decision['decision_id']}",
        f"action    {proposal.get('action')} {_json(proposal.get('params'))}",
        f"proposer  {_actor(proposal.get('proposer') or {})}"
        + (f"   trigger {trigger['source']}:{trigger['ref']}" if trigger else "   trigger none"),
        f"rationale {proposal.get('rationale')}",
        f"outcome   {decision['outcome']}   policy {decision['policy_version']}   autonomy "
        f"{decision['autonomy']}   approvals required {decision['approvals_required']}",
        f"hash      {decision['proposal_hash']}",
        "state     "
        + (", ".join(f"{k} v{v}" for k, v in sorted(decision["state_versions"].items())) or "none read"),
        "",
        "checks",
    ]
    for c in pack["checks"]:
        detail = f": {c['detail']}" if "detail" in c else ""
        mark = "pass" if c["passed"] else "HOLD" if c["name"] in _HOLDS else "FAIL"
        lines.append(f"  {mark}  {c['name']}{detail}")
    lines += ["", "approvals"]
    lines += [
        f"  {_actor(a['approver'])} at {a['approved_at']}, "
        + (f"signed with key {a['signature']['key_id']}" if "signature" in a else "unsigned")
        for a in pack["approvals"]
    ] or ["  none"]
    lines += ["", "events"]
    for e in evidence.events:
        lines.append(f"  {e['stream']} #{e['seq']:<3} {e['ts']}  {e['type']:<18} {_summary(e)}")
    ex, ver = pack["execution"], pack["verification"]
    error = ex.get("error")
    lines += [
        "",
        f"execution {ex['status']}" + (f" ({error['code']}: {error['message']})" if error else ""),
        f"verified  {ver['status']}" + (f" {_json(ver['observed'])}" if ver.get("observed") else ""),
        "incidents "
        + (", ".join(f"{i['kind']} {i['incident_id'][:8]}" for i in pack["incidents"]) or "none"),
        "shadow    "
        + ("on, nothing executed" if pack["shadow"]["active"] else "off")
        + "".join(
            f"; {c['human']['id']} said {c['human_outcome']} ({'agree' if c['agree'] else 'disagree'})"
            for c in pack["shadow"]["comparisons"]
        ),
        "",
        "chain",
    ]
    for stream, report in evidence.chain.items():
        verdict = "intact" if report.ok else f"{len(report.problems)} problem(s)"
        lines.append(f"  {stream}: {report.events_checked} events, {verdict}")
        lines += [f"    {problem}" for problem in report.problems]
    lines.append(f"  head {pack['chain_head']}")
    if evidence.issues:
        lines += ["", "evidence pack does not validate:"] + [f"  {i}" for i in evidence.issues]
    return lines
