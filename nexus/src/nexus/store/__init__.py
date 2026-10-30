"""The event store (P1): append-only hash-chained events and the world-state projection."""

from .canonical import canonical_json, event_hash
from .errors import CasConflict, StoreError
from .events import ChainProblem, ChainReport, EventStore, new_trace_id, utc_timestamp
from .state import StateDiff, StateRow, WorldState

__all__ = [
    "CasConflict",
    "ChainProblem",
    "ChainReport",
    "EventStore",
    "StateDiff",
    "StateRow",
    "StoreError",
    "WorldState",
    "canonical_json",
    "event_hash",
    "new_trace_id",
    "utc_timestamp",
]
