"""The policy engine and gate (P2): deterministic ALLOW / DENY / NEEDS_APPROVAL, recorded as events."""

from .evaluate import ALLOW, DENY, NEEDS_APPROVAL, Reason, Snapshot, StateValue, Verdict, evaluate
from .gate import DECISION_MADE, Gate, GateError, proposal_hash, set_kill_switch
from .packs import LoadedAction, LoadedPack, Observable, PackError
from .policy import AUTONOMY_LEVELS, Policy

__all__ = [
    "ALLOW",
    "AUTONOMY_LEVELS",
    "DECISION_MADE",
    "DENY",
    "NEEDS_APPROVAL",
    "Gate",
    "GateError",
    "LoadedAction",
    "LoadedPack",
    "Observable",
    "PackError",
    "Policy",
    "Reason",
    "Snapshot",
    "StateValue",
    "Verdict",
    "evaluate",
    "proposal_hash",
    "set_kill_switch",
]
