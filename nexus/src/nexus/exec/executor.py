"""Executor.run: claim, re-check, execute, verify, compensate, open incidents (P3.md §4, ADR-0012)."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from typing import Any

from celpy import celtypes

from ..cel import CelError, StateView, compile_expr, from_cel, params_map, to_cel
from ..gate.evaluate import ALLOW, DENY, NEEDS_APPROVAL, Snapshot, rollback_limits, visible_state
from ..gate.gate import Gate, proposal_hash
from ..gate.packs import LoadedAction, LoadedPack
from ..store import EventStore
from ..store.errors import CasConflict
from ..store.events import new_trace_id, utc_timestamp
from .approvals import approval_state, decision_lock, find_decision
from .binding import Binding, ExecRequest

EXECUTOR_ACTOR = {"kind": "system", "id": "executor"}
UNKNOWN_STREAM = "exec/unknown"
DEFAULT_TIMEOUT_S = 30
_MAX_ERROR = 500

EXECUTION_REFUSED = "execution.refused"
EXECUTION_STARTED = "execution.started"
EXECUTION_SHADOWED = "execution.shadowed"
EXECUTION_CALLED = "execution.called"
EXECUTION_VERIFIED = "execution.verified"
EXECUTION_FINISHED = "execution.finished"
INCIDENT_OPENED = "incident.opened"
SHADOW_COMPARED = "shadow.compared"


@dataclass(frozen=True)
class ExecutionRecord:
    decision_id: str
    status: str  # refused | running | shadowed | succeeded | failed | compensated | compensation_failed
    idempotency_key: str | None = None
    stream: str | None = None
    verification: str = "not_run"  # not_run | passed | failed | timed_out
    incident_ids: tuple[str, ...] = ()
    error: str | None = None
    reasons: tuple[Mapping[str, str], ...] = ()
    started_at: str | None = None
    finished_at: str | None = None
    trace_id: str | None = None
    duplicate: bool = False

    @property
    def codes(self) -> list[str]:
        return [r["code"] for r in self.reasons]


@dataclass
class _Run:
    """One claimed execution while it runs."""

    ref_stream: str
    decision_id: str
    key: str
    trace_id: str
    started_at: str
    proposal: Mapping[str, Any]
    incidents: list[str] = field(default_factory=list)


def _short(error: BaseException | str) -> str:
    if isinstance(error, BaseException):
        error = f"{type(error).__name__}: {error}" if str(error) else type(error).__name__
    text = error
    return text if len(text) <= _MAX_ERROR else text[: _MAX_ERROR - 1] + "…"


def _row_record(row: Any, duplicate: bool) -> ExecutionRecord:
    return ExecutionRecord(
        decision_id=row["decision_id"],
        status=row["status"],
        idempotency_key=row["idempotency_key"],
        stream=row["stream"],
        verification=row["verification"] or "not_run",
        incident_ids=tuple(json.loads(row["incident_ids"])),
        error=row["error"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        duplicate=duplicate,
    )


class Executor:
    """Turns decisions into at most one execution each. `bindings` maps a pack id to its binding.
    In shadow mode every step up to the binding call runs and is recorded; nothing executes."""

    def __init__(
        self,
        store: EventStore,
        gate: Gate,
        bindings: Mapping[str, Binding],
        shadow: bool = False,
        poll_s: float = 0.05,
    ) -> None:
        self._store = store
        self.gate = gate
        self.bindings = dict(bindings)
        self.shadow = shadow
        self._poll_s = poll_s

    # ── step 1-2: authorise and claim ─────────────────────────────────────────

    async def run(self, decision_id: str) -> ExecutionRecord:
        trace_id = new_trace_id()
        async with self._store.transaction() as conn:
            await decision_lock(conn, decision_id)
            ref = await find_decision(conn, decision_id)
            if ref is None:
                return await self._refuse(conn, UNKNOWN_STREAM, decision_id, trace_id, "UNKNOWN_DECISION")
            proposal, decision = ref.proposal, ref.decision
            refusal: tuple[str, list[Mapping[str, str]]] | None = None
            approved = 0
            if decision["proposal_hash"] != proposal_hash(proposal):
                refusal = ("UNKNOWN_DECISION", [])
            elif decision["outcome"] == DENY:
                refusal = ("DENIED", list(decision["reasons"]))
            elif decision["outcome"] == NEEDS_APPROVAL:
                state = await approval_state(conn, ref)
                approved = len(state.approvals)
                if state.rejection is not None:
                    refusal = ("REJECTED", [])
                elif approved < decision["approvals_required"]:
                    refusal = ("NOT_APPROVED", [])
            elif decision["outcome"] != ALLOW:
                refusal = ("UNKNOWN_DECISION", [])
            pack_id = str(proposal.get("action", "")).partition(":")[0]
            if refusal is None and not self.shadow and pack_id not in self.bindings:
                refusal = ("NO_BINDING", [])
            if refusal is None and proposal.get("depends_on"):
                pending = await self._pending(conn, proposal["depends_on"])
                if pending:
                    refusal = (
                        "DEPENDENCY_PENDING",
                        [
                            {
                                "code": "DEPENDENCY_NOT_SUCCEEDED",
                                "message": f"proposal {p} has not succeeded yet",
                            }
                            for p in pending
                        ],
                    )
            if refusal is not None:
                return await self._refuse(conn, ref.stream, decision_id, trace_id, *refusal)

            key = proposal.get("idempotency_key") or proposal["proposal_id"]
            started_at = utc_timestamp(self._store.clock())
            claimed = await conn.fetchval(
                "INSERT INTO executions (idempotency_key, decision_id, proposal_id, stream, action, status, "
                "started_at) VALUES ($1, $2, $3, $4, $5, 'running', $6) ON CONFLICT DO NOTHING "
                "RETURNING idempotency_key",
                key,
                decision_id,
                proposal["proposal_id"],
                ref.stream,
                proposal["action"],
                started_at,
            )
            if claimed is None:
                row = await conn.fetchrow("SELECT * FROM executions WHERE idempotency_key = $1", key)
                if row["status"] == "refused":
                    return await self._spent(conn, ref.stream, decision_id, trace_id, row)
                return _row_record(row, duplicate=True)
            await self._store.append_in(
                conn,
                ref.stream,
                EXECUTION_STARTED,
                {
                    "decision_id": decision_id,
                    "idempotency_key": key,
                    "action": proposal["action"],
                    "params": proposal["params"],
                    "approvals": approved,
                    "shadow": self.shadow,
                },
                EXECUTOR_ACTOR,
                trace_id,
            )
        run = _Run(ref.stream, decision_id, key, trace_id, started_at, proposal)
        return await self._execute(run, approved)

    async def _pending(self, conn: Any, depends_on: list[str]) -> list[str]:
        """The proposals in `depends_on` with no successful execution yet (ADR-0022). In shadow
        mode a shadowed run counts, since nothing ever succeeds there."""
        done = ["succeeded", "shadowed"] if self.shadow else ["succeeded"]
        rows = await conn.fetch(
            "SELECT DISTINCT proposal_id FROM executions WHERE proposal_id = ANY($1::text[]) "
            "AND status = ANY($2::text[])",
            depends_on,
            done,
        )
        succeeded = {r["proposal_id"] for r in rows}
        return [p for p in depends_on if p not in succeeded]

    async def _refuse(
        self,
        conn: Any,
        stream: str,
        decision_id: str,
        trace_id: str,
        code: str,
        reasons: list[Mapping[str, str]] | None = None,
    ) -> ExecutionRecord:
        """Refused before any claim: the key stays free (approvals may still arrive)."""
        reasons = list(reasons or [])
        payload = {"decision_id": decision_id, "code": code, "reasons": reasons}
        await self._store.append_in(conn, stream, EXECUTION_REFUSED, payload, EXECUTOR_ACTOR, trace_id)
        reasons.insert(0, {"code": code, "message": f"execution refused: {code}"})
        return ExecutionRecord(
            decision_id, "refused", stream=stream, reasons=tuple(reasons), trace_id=trace_id
        )

    async def _spent(
        self, conn: Any, stream: str, decision_id: str, trace_id: str, row: Any
    ) -> ExecutionRecord:
        """A claim refused at its re-check is spent (ADR-0017): the decision never runs, and its
        idempotency key stays taken. Retrying means a fresh proposal, with a new key, through the
        gate."""
        message = (
            f"idempotency key {row['idempotency_key']} was refused at re-check ({row['error']}) for "
            f"decision {row['decision_id']}; it is spent, so propose again with a new key"
        )
        reason = {"code": "DECISION_SPENT", "message": message}
        payload = {"decision_id": decision_id, "code": "DECISION_SPENT", "reasons": [reason]}
        await self._store.append_in(conn, stream, EXECUTION_REFUSED, payload, EXECUTOR_ACTOR, trace_id)
        record = _row_record(row, duplicate=True)
        return replace(record, decision_id=decision_id, reasons=(reason,), trace_id=trace_id)

    # ── steps 3-8 ─────────────────────────────────────────────────────────────

    async def _execute(self, run: _Run, approved: int) -> ExecutionRecord:
        verdict, snapshot = await self.gate.recheck(run.proposal)
        if verdict.outcome == DENY:
            reasons = tuple(r.as_dict() for r in verdict.reasons)
            return await self._finish(run, "refused", reasons=reasons, code="RECHECK_DENIED")
        if verdict.outcome == NEEDS_APPROVAL and approved < verdict.approvals_required:
            reasons = tuple(r.as_dict() for r in verdict.reasons)
            return await self._finish(run, "refused", reasons=reasons, code="NOT_APPROVED")
        pack, action = verdict.pack, verdict.action
        params = run.proposal["params"]
        if self.shadow:
            return await self._finish(run, "shadowed", event=EXECUTION_SHADOWED)

        binding = self.bindings[pack.id]
        prev = visible_state(pack, snapshot)[0]
        error = await self._call(run, binding, action, params, compensation=False)
        verification = "not_run"
        if error is None:
            verification = await self._verify(run, binding, pack, action, params, prev, compensation=False)
            if verification in ("failed", "timed_out"):
                error = f"effects did not hold within {action.spec.get('verify_within_s')} s ({verification})"
        if error is None:
            return await self._finish(run, "succeeded", verification=verification)

        await self._incident(run, "execution_failed", error)
        status = await self._compensate(run, binding, pack, action, params, prev)
        return await self._finish(run, status, verification=verification, error=error)

    async def _call(
        self, run: _Run, binding: Binding, action: LoadedAction, params: Mapping[str, Any], compensation: bool
    ) -> str | None:
        """Call the binding with the action's timeout. Returns the error, or None on success."""
        timeout = action.spec.get("timeout_s") or DEFAULT_TIMEOUT_S
        request = ExecRequest(action.id, dict(params), run.key, compensation, run.trace_id)
        started = time.perf_counter()
        error: str | None = None
        try:
            await asyncio.wait_for(binding.execute(request), timeout)
        except TimeoutError:
            error = f"timed out after {timeout} s"
        except Exception as exc:  # any binding failure is a failed execution
            error = _short(exc)
        await self._store.append(
            run.ref_stream,
            EXECUTION_CALLED,
            {
                "decision_id": run.decision_id,
                "idempotency_key": run.key,
                "action": action.qualified,
                "params": dict(params),
                "compensation": compensation,
                "ok": error is None,
                "error": error,
                "duration_ms": round((time.perf_counter() - started) * 1000, 3),
            },
            EXECUTOR_ACTOR,
            run.trace_id,
        )
        return error

    # ── step 6: verification ──────────────────────────────────────────────────

    async def _verify(
        self,
        run: _Run,
        binding: Binding,
        pack: LoadedPack,
        action: LoadedAction,
        params: Mapping[str, Any],
        prev: StateView,
        compensation: bool,
    ) -> str:
        """Observe, record and evaluate the effects until they hold or `verify_within_s` passes."""
        effects = [compile_expr(src) for src in action.spec.get("effects", [])]
        if not effects:
            await self._verified(run, action, "not_run", {}, 0, compensation, None)
            return "not_run"
        loop = asyncio.get_running_loop()
        deadline = loop.time() + action.spec.get("verify_within_s", DEFAULT_TIMEOUT_S)
        cel_params = params_map(params, action.param_types)
        attempts, delay = 0, self._poll_s
        observed: dict[str, Any] = {}
        status, detail = "timed_out", "no observation yet"
        while True:
            attempts += 1
            try:
                values = await asyncio.wait_for(binding.observe(), max(deadline - loop.time(), 0.01))
            except Exception as exc:  # an unreadable device is an unverified effect
                detail = f"observe failed: {_short(exc)}"
            else:
                observed = await self._record(run, pack, values)
                state = visible_state(pack, await self._pack_state(pack))[0]
                status, detail = self._effects_hold(effects, state, cel_params, prev)
                if status == "passed":
                    break
            if loop.time() >= deadline:
                break
            await asyncio.sleep(min(delay, max(deadline - loop.time(), 0)))
            delay = min(delay * 2, 0.5)
        await self._verified(run, action, status, observed, attempts, compensation, detail)
        return status

    @staticmethod
    def _effects_hold(
        effects: list[Any], state: StateView, params: Any, prev: StateView
    ) -> tuple[str, str | None]:
        """passed; failed (an effect is false); timed_out (one cannot be evaluated yet)."""
        activation = {"state": state.root, "params": params, "prev": prev.root}
        for expr in effects:
            try:
                result = expr.evaluate(activation)
            except CelError as exc:
                return "timed_out", f"{expr.source}: {exc}"
            if not (isinstance(result, celtypes.BoolType) and result):
                return "failed", f"{expr.source} is {result!r}"
        return "passed", None

    async def _pack_state(self, pack: LoadedPack) -> Snapshot:
        now = self._store.clock()
        async with self._store.pool.acquire() as conn:
            return await self.gate.snapshot(
                conn, {"action": f"{pack.id}:"}, UNKNOWN_STREAM, now, rate_limit=False
            )

    async def _record(self, run: _Run, pack: LoadedPack, values: Mapping[str, Any]) -> dict[str, Any]:
        """Write every declared, well-typed observable that changed into world state, as the pack."""
        actor = {"kind": "pack", "id": pack.id}
        kept: dict[str, Any] = {}
        for key, value in sorted(values.items()) if isinstance(values, Mapping) else ():
            observable = pack.observable_for(key) if isinstance(key, str) else None
            if observable is None:
                continue
            try:
                to_cel(value, observable.type)
            except TypeError:
                continue
            kept[key] = value
            for _ in range(5):
                row = await self._store.state.get(pack.id, key)
                if row is not None and row.value == value and type(row.value) is type(value):
                    break
                try:
                    await self._store.state.set(
                        pack.id, key, value, row.version if row else 0, actor, f"pack/{pack.id}", run.trace_id
                    )
                    break
                except CasConflict:
                    continue
        return kept

    async def _verified(
        self,
        run: _Run,
        action: LoadedAction,
        status: str,
        observed: Mapping[str, Any],
        attempts: int,
        compensation: bool,
        detail: str | None,
    ) -> None:
        await self._store.append(
            run.ref_stream,
            EXECUTION_VERIFIED,
            {
                "decision_id": run.decision_id,
                "idempotency_key": run.key,
                "action": action.qualified,
                "compensation": compensation,
                "status": status,
                "observed": dict(observed),
                "attempts": attempts,
                "detail": detail,
            },
            EXECUTOR_ACTOR,
            run.trace_id,
        )

    # ── step 7: compensation ──────────────────────────────────────────────────

    async def _compensate(
        self,
        run: _Run,
        binding: Binding,
        pack: LoadedPack,
        action: LoadedAction,
        params: Mapping[str, Any],
        prev: StateView,
    ) -> str:
        """Run the declared compensation once. It is never gated and never compensated."""
        spec = action.spec.get("compensation")
        if not spec:
            return "failed"
        if await self.gate.kill_switch():
            await self._incident(run, "compensation_blocked", f"kill switch on: {spec['action']} was not run")
            return "compensation_failed"
        undo = pack.actions.get(spec["action"])
        if undo is None:
            await self._incident(run, "compensation_failed", f"{spec['action']} is not in pack {pack.id}")
            return "compensation_failed"
        activation = {"params": params_map(params, action.param_types), "prev": prev.root}
        undo_params: dict[str, Any] = {}
        try:
            for name, source in sorted(spec["params"].items()):
                undo_params[name] = from_cel(compile_expr(source).evaluate(activation))
        except (CelError, TypeError) as exc:
            await self._incident(run, "compensation_failed", f"compensation params: {_short(exc)}")
            return "compensation_failed"
        errors = sorted(undo.params_validator.iter_errors(undo_params), key=lambda e: list(e.path))
        if errors:
            await self._incident(run, "compensation_failed", f"compensation params: {errors[0].message}")
            return "compensation_failed"
        snapshot = await self._pack_state(pack)
        refused = rollback_limits(undo, action, pack, undo_params, snapshot, self._store.clock())
        if refused:
            detail = "; ".join(f"{r.code}: {r.message}" for r in refused)
            await self._incident(
                run,
                "compensation_refused",
                f"{undo.qualified} {json.dumps(undo_params, sort_keys=True)} was not run, a human must "
                f"decide: {detail}",
                reasons=[r.as_dict() for r in refused],
            )
            return "compensation_failed"
        before = visible_state(pack, snapshot)[0]
        error = await self._call(run, binding, undo, undo_params, compensation=True)
        if error is None:
            verification = await self._verify(
                run, binding, pack, undo, undo_params, before, compensation=True
            )
            if verification in ("failed", "timed_out"):
                error = f"compensation effects did not hold ({verification})"
        if error is not None:
            await self._incident(run, "compensation_failed", error)
            return "compensation_failed"
        return "compensated"

    # ── step 8: incidents and the final record ────────────────────────────────

    async def _incident(
        self, run: _Run, kind: str, detail: str, reasons: list[Mapping[str, str]] | None = None
    ) -> str:
        incident_id = str(uuid.uuid4())
        payload: dict[str, Any] = {
            "incident_id": incident_id,
            "kind": kind,
            "decision_id": run.decision_id,
            "idempotency_key": run.key,
            "action": run.proposal["action"],
            "detail": _short(detail),
        }
        if reasons:
            payload["reasons"] = reasons
        await self._store.append(
            run.ref_stream,
            INCIDENT_OPENED,
            payload,
            EXECUTOR_ACTOR,
            run.trace_id,
        )
        run.incidents.append(incident_id)
        return incident_id

    async def _finish(
        self,
        run: _Run,
        status: str,
        verification: str = "not_run",
        error: str | None = None,
        reasons: tuple[Mapping[str, str], ...] = (),
        code: str | None = None,
        event: str = EXECUTION_FINISHED,
    ) -> ExecutionRecord:
        """Update the executions row and append the event that changes it, in one transaction."""
        finished_at = utc_timestamp(self._store.clock())
        if status == "refused":
            event, error = EXECUTION_REFUSED, code
            payload: dict[str, Any] = {"decision_id": run.decision_id, "code": code, "reasons": list(reasons)}
            reasons = ({"code": code, "message": f"execution refused at re-check: {code}"}, *reasons)
        else:
            payload = {
                "decision_id": run.decision_id,
                "idempotency_key": run.key,
                "status": status,
                "verification": verification,
                "incident_ids": list(run.incidents),
                "error": error,
            }
        async with self._store.transaction() as conn:
            await conn.execute(
                "UPDATE executions SET status = $2, verification = $3, incident_ids = $4::jsonb, error = $5, "
                "finished_at = $6 WHERE idempotency_key = $1",
                run.key,
                status,
                verification,
                json.dumps(run.incidents),
                error,
                finished_at,
            )
            await self._store.append_in(conn, run.ref_stream, event, payload, EXECUTOR_ACTOR, run.trace_id)
        return ExecutionRecord(
            run.decision_id,
            status,
            run.key,
            run.ref_stream,
            verification,
            tuple(run.incidents),
            error,
            reasons,
            run.started_at,
            finished_at,
            run.trace_id,
        )

    # ── shadow comparison ─────────────────────────────────────────────────────

    async def record_human(self, decision_id: str, outcome: str, actor: Mapping[str, Any]) -> dict[str, Any]:
        """Record what a human would have decided, next to the gate's verdict."""
        if outcome not in (ALLOW, DENY, NEEDS_APPROVAL):
            raise ValueError(f"outcome must be ALLOW, DENY or NEEDS_APPROVAL, not {outcome!r}")
        async with self._store.pool.acquire() as conn:
            ref = await find_decision(conn, decision_id)
        if ref is None:
            raise ValueError(f"no decision {decision_id}")
        payload = {
            "decision_id": decision_id,
            "gate_outcome": ref.decision["outcome"],
            "human_outcome": outcome,
            "agree": ref.decision["outcome"] == outcome,
        }
        return await self._store.append(ref.stream, SHADOW_COMPARED, payload, actor)
