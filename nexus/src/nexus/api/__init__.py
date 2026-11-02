"""The HTTP API, the approvals inbox and `nexus serve` (P8)."""

from __future__ import annotations

import ipaddress

from .app import LOOPBACK_HOSTS, ApiError, create_app
from .routing import route


def check_loopback(host: str) -> str:
    """The host to bind, if it is a loopback address; P8 serves nothing beyond this machine."""
    if host == "localhost":
        return "127.0.0.1"
    try:
        if ipaddress.ip_address(host.strip("[]")).is_loopback:
            return host.strip("[]")
    except ValueError:
        pass
    raise ValueError(f"refusing to listen on {host}: nexus serve binds loopback only (127.0.0.1 or ::1)")


__all__ = ["LOOPBACK_HOSTS", "ApiError", "check_loopback", "create_app", "route"]
