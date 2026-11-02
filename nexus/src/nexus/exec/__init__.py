"""The executor (P3): approvals, at-most-once execution, verification, compensation, incidents."""

from .approvals import APPROVAL_GRANTED, APPROVAL_REJECTED, ApprovalError, approve, reject
from .binding import Binding, BindingError, ExecRequest
from .executor import (
    EXECUTION_FINISHED,
    EXECUTION_REFUSED,
    EXECUTION_SHADOWED,
    EXECUTION_STARTED,
    INCIDENT_OPENED,
    SHADOW_COMPARED,
    ExecutionRecord,
    Executor,
)
from .mock import Fault, MockBinding

__all__ = [
    "APPROVAL_GRANTED",
    "APPROVAL_REJECTED",
    "EXECUTION_FINISHED",
    "EXECUTION_REFUSED",
    "EXECUTION_SHADOWED",
    "EXECUTION_STARTED",
    "INCIDENT_OPENED",
    "SHADOW_COMPARED",
    "ApprovalError",
    "Binding",
    "BindingError",
    "ExecRequest",
    "ExecutionRecord",
    "Executor",
    "Fault",
    "MockBinding",
    "approve",
    "reject",
]
