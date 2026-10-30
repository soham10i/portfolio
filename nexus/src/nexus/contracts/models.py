"""Pydantic v2 models mirroring contracts/v1. The JSON Schemas are canonical; these follow them.

tests/test_parity.py runs every example through both and fails if they disagree, so drift
between the two shows up as a failing test, not as a runtime surprise.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints, model_validator

# ── scalar types (same patterns as common.schema.json) ─────────────────────────


def _unique(items: list[Any]) -> list[Any]:
    seen: list[Any] = []
    for item in items:
        if item in seen:
            raise ValueError("items must be unique")
        seen.append(item)
    return items


def _is_uuid(value: str) -> str:
    uuid.UUID(value)
    return value


def _is_utc_timestamp(value: str) -> str:
    datetime.fromisoformat(value)  # ranges (month 13, hour 25) are rejected here
    return value


IdSegment = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,47}$")]
ActionId = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,47}(\.[a-z][a-z0-9_]{0,47}){1,3}$")]
QualifiedActionId = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,47}:[a-z][a-z0-9_]{0,47}(\.[a-z][a-z0-9_]{0,47}){1,3}$"),
]
EnvName = Annotated[str, StringConstraints(pattern=r"^[A-Z][A-Z0-9_]{0,63}$")]
SemVer = Annotated[
    str, StringConstraints(pattern=r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$")
]
Uuid = Annotated[
    str,
    StringConstraints(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"),
    AfterValidator(_is_uuid),
]
Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
TraceId = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{32}$")]
Timestamp = Annotated[
    str,
    StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?Z$"),
    AfterValidator(_is_utc_timestamp),
]
Risk = Literal["low", "medium", "high", "critical"]
Autonomy = Literal["L0", "L1", "L2", "L3", "L4"]
TaintSource = Literal["user", "system", "tool", "doc", "external"]
CelExpr = Annotated[str, StringConstraints(min_length=1, max_length=500)]
Text = Annotated[str, StringConstraints(min_length=1, max_length=128)]
ParamName = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,47}$")]
EnvelopeKey = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,63}$")]
ObservableId = Annotated[
    str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*|\[\*\]|\[\d+\])*$")
]
RelPath = Annotated[str, StringConstraints(min_length=1, max_length=256)]


class Contract(BaseModel):
    """Base: unknown fields are errors, and no type coercion (strings stay strings)."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Actor(Contract):
    kind: Literal["human", "agent", "pack", "system"]
    id: Text


class Reason(Contract):
    code: Annotated[str, StringConstraints(pattern=r"^[A-Z][A-Z0-9_]{2,47}$")]
    message: Annotated[str, StringConstraints(min_length=1, max_length=500)]


# ── action ─────────────────────────────────────────────────────────────────────


class Param(Contract):
    type: Literal["number", "integer", "boolean", "string"]
    description: Annotated[str, StringConstraints(max_length=500)] | None = None
    unit: Annotated[str, StringConstraints(max_length=32)] | None = None
    minimum: float | None = None
    maximum: float | None = None
    exclusiveMinimum: float | None = None
    exclusiveMaximum: float | None = None
    enum: Annotated[list[Any], Field(min_length=1), AfterValidator(_unique)] | None = None
    minLength: Annotated[int, Field(ge=0)] | None = None
    maxLength: Annotated[int, Field(ge=0)] | None = None
    pattern: str | None = None
    default: Any = None


class ParamsSchema(Contract):
    type: Literal["object"]
    properties: dict[ParamName, Param]
    required: Annotated[list[str], AfterValidator(_unique)]
    additionalProperties: Literal[False]


class Compensation(Contract):
    action: ActionId
    params: dict[str, CelExpr]


class RateLimit(Contract):
    max: Annotated[int, Field(ge=1)]
    per_s: Annotated[int, Field(ge=1)]


class Action(Contract):
    id: ActionId
    title: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    description: Annotated[str, StringConstraints(max_length=2000)] | None = None
    risk: Risk
    autonomy: Autonomy
    params: ParamsSchema
    preconditions: Annotated[list[CelExpr], Field(max_length=32)]
    effects: Annotated[list[CelExpr], Field(max_length=32)]
    envelope: dict[EnvelopeKey, float] | None = None
    verify_within_s: Annotated[int, Field(ge=1, le=3600)] | None = None
    compensation: Compensation | None = None
    sandbox: IdSegment | None = None
    approvers: Annotated[int, Field(ge=1, le=2)] | None = None
    rate_limit: RateLimit | None = None
    idempotent: bool = False

    @model_validator(mode="after")
    def _risk_rules(self) -> Action:
        if self.risk in ("high", "critical") and self.autonomy not in ("L0", "L1", "L2"):
            raise ValueError("high/critical actions are capped at autonomy L2")
        if self.risk == "critical" and self.approvers != 2:
            raise ValueError("critical actions need approvers: 2")
        if self.autonomy in ("L3", "L4") and (self.verify_within_s is None or self.compensation is None):
            raise ValueError("L3/L4 actions need verify_within_s and compensation")
        return self


# ── pack manifest ──────────────────────────────────────────────────────────────


class Observable(Contract):
    id: ObservableId
    type: Literal["number", "integer", "boolean", "string", "enum"]
    unit: Annotated[str, StringConstraints(max_length=32)] | None = None
    enum_values: Annotated[list[str], Field(min_length=1), AfterValidator(_unique)] | None = None
    max_age_s: Annotated[int, Field(ge=1, le=86400)]
    description: Annotated[str, StringConstraints(max_length=1000)] | None = None

    @model_validator(mode="after")
    def _enum_values(self) -> Observable:
        if (self.type == "enum") != (self.enum_values is not None):
            raise ValueError("enum_values is required iff type is 'enum'")
        return self


class Sandbox(Contract):
    id: IdSegment
    description: Annotated[str, StringConstraints(max_length=1000)] | None = None


class PythonConnector(Contract):
    kind: Literal["python"]
    module: Annotated[str, StringConstraints(pattern=r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")]


class OpenApiConnector(Contract):
    kind: Literal["openapi"]
    spec: Annotated[str, StringConstraints(min_length=1, max_length=512)]
    base_url_env: EnvName


class McpConnector(Contract):
    kind: Literal["mcp"]
    transport: Literal["stdio", "http"]
    command: Annotated[list[str], Field(min_length=1)] | None = None
    url_env: EnvName | None = None


class OpcUaConnector(Contract):
    kind: Literal["opcua"]
    endpoint_env: EnvName
    namespace: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class MqttConnector(Contract):
    kind: Literal["mqtt"]
    broker_env: EnvName
    sparkplug: bool


Connector = Annotated[
    PythonConnector | OpenApiConnector | McpConnector | OpcUaConnector | MqttConnector,
    Field(discriminator="kind"),
]


class PackManifest(Contract):
    schema_version: Literal["1"]
    pack: IdSegment
    version: SemVer
    owner: Text
    title: Annotated[str, StringConstraints(min_length=1, max_length=120)]
    description: Annotated[str, StringConstraints(max_length=4000)] | None = None
    tags: Annotated[list[IdSegment], AfterValidator(_unique)] | None = None
    observables: list[Observable]
    actions: list[Action]
    sandboxes: list[Sandbox] | None = None
    knowledge: list[RelPath] | None = None
    evals: list[RelPath] | None = None
    connector: Connector


# ── proposal, decision, evidence, event ────────────────────────────────────────


class ContextItem(Contract):
    source: TaintSource
    ref: Annotated[str, StringConstraints(min_length=1, max_length=256)]
    triggered: bool


class Proposal(Contract):
    proposal_id: Uuid
    session_id: Uuid
    plan_id: Uuid | None = None
    depends_on: Annotated[list[Uuid], AfterValidator(_unique)] | None = None
    action: QualifiedActionId
    params: dict[str, Any]
    rationale: Annotated[str, StringConstraints(min_length=1, max_length=2000)]
    context: Annotated[list[ContextItem], Field(min_length=1)]
    proposer: Actor
    idempotency_key: Annotated[str, StringConstraints(min_length=8, max_length=128)] | None = None
    created_at: Timestamp


class Decision(Contract):
    decision_id: Uuid
    proposal_id: Uuid
    outcome: Literal["ALLOW", "DENY", "NEEDS_APPROVAL"]
    reasons: list[Reason]
    approvals_required: Annotated[int, Field(ge=0, le=2)]
    policy_version: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    autonomy: Autonomy
    state_versions: dict[str, Annotated[int, Field(ge=0)]]
    proposal_hash: Sha256
    latency_ms: Annotated[float, Field(ge=0)]
    decided_at: Timestamp

    @model_validator(mode="after")
    def _reasons(self) -> Decision:
        if self.outcome != "ALLOW" and not self.reasons:
            raise ValueError("DENY and NEEDS_APPROVAL need at least one reason")
        return self


class Check(Contract):
    name: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    passed: bool
    detail: Annotated[str, StringConstraints(max_length=2000)] | None = None


class Simulation(Contract):
    ran: bool
    sandbox: IdSegment | None = None
    passed: bool | None = None
    summary: Annotated[str, StringConstraints(max_length=4000)] | None = None
    trace_ref: Annotated[str, StringConstraints(max_length=512)] | None = None


class Approval(Contract):
    approver: Actor
    proposal_hash: Sha256
    approved_at: Timestamp


class Execution(Contract):
    status: Literal["not_run", "succeeded", "failed", "compensated"]
    idempotency_key: Annotated[str, StringConstraints(min_length=8, max_length=128)] | None = None
    started_at: Timestamp | None = None
    finished_at: Timestamp | None = None
    error: Reason | None = None


class Verification(Contract):
    status: Literal["not_run", "passed", "failed", "timed_out"]
    observed: dict[str, Any] | None = None


class EventRef(Contract):
    stream: Annotated[str, StringConstraints(min_length=1, max_length=256)]
    seq: Annotated[int, Field(ge=1)]


class EvidencePack(Contract):
    proposal: Proposal
    decision: Decision
    checks: list[Check]
    simulation: Simulation | None = None
    approvals: list[Approval]
    execution: Execution
    verification: Verification
    event_refs: list[EventRef]
    chain_head: Sha256


class Event(Contract):
    schema_version: Literal["1"]
    stream: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*(/[a-z0-9_-]+)*$", max_length=256)]
    seq: Annotated[int, Field(ge=1)]
    type: Annotated[str, StringConstraints(pattern=r"^[a-z]+(\.[a-z_]+)+$", max_length=128)]
    payload: dict[str, Any]
    actor: Actor
    ts: Timestamp
    trace_id: TraceId
    prev_hash: Sha256 | None
    hash: Sha256


MODEL_FOR: dict[str, type[Contract]] = {
    "pack": PackManifest,
    "action": Action,
    "proposal": Proposal,
    "decision": Decision,
    "evidence": EvidencePack,
    "event": Event,
}
