"""RFC 8785 canonical JSON and the event hash defined in event.schema.json (ADR-0008)."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Any

import rfc8785


def canonical_json(value: Any) -> bytes:
    """JCS bytes of a JSON value. Raises ValueError for anything JCS cannot represent exactly
    (NaN, infinities, integers outside ±(2^53 - 1), non-string keys, non-JSON types)."""
    try:
        return rfc8785.dumps(value)
    except (rfc8785.CanonicalizationError, TypeError, OverflowError) as exc:
        raise ValueError(f"not representable as canonical JSON: {exc}") from exc


def event_hash(event: Mapping[str, Any]) -> str:
    """sha256(JCS(event without "hash")), as lowercase hex."""
    body = {k: v for k, v in event.items() if k != "hash"}
    return hashlib.sha256(canonical_json(body)).hexdigest()
