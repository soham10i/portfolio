"""Principals, bearer tokens, public keys and sessions (ADR-0028, P8.md §2.1-2.2).

A token is shown once, when it is made, and stored only as its sha256. No event carries a token
or its hash: the `principal.*` events say who, what kind and which roles, nothing more."""

from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from ..signing import key_id as derive_key_id
from ..signing import valid_public_key
from ..store import EventStore

PRINCIPALS_STREAM = "auth/principals"
PRINCIPAL_ADDED = "principal.added"
PRINCIPAL_TOKEN_ROTATED = "principal.token_rotated"  # noqa: S105 (an event type)
PRINCIPAL_REVOKED = "principal.revoked"
KEY_REGISTERED = "key.registered"
KEY_REVOKED = "key.revoked"
SESSION_OPENED = "session.opened"

REQUESTER, APPROVER = "requester", "approver"
ROLES = frozenset({REQUESTER, APPROVER})
KINDS = frozenset({"human", "agent"})
TOKEN_PREFIX = "nx_"  # noqa: S105 (a prefix, not a secret)
_ID = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")
_SYSTEM = {"kind": "system", "id": "nexus-admin"}


class AuthError(ValueError):
    """A principal, key or session request that was refused; nothing was written."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


@dataclass(frozen=True)
class Principal:
    id: str
    kind: str  # human | agent
    roles: frozenset[str]

    @property
    def actor(self) -> dict[str, str]:
        return {"kind": self.kind, "id": self.id}

    def has(self, role: str) -> bool:
        return role in self.roles


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)  # 256 bits


def _check(principal_id: str, kind: str, roles: Iterable[str]) -> list[str]:
    if not isinstance(principal_id, str) or not _ID.match(principal_id):
        raise AuthError("BAD_ID", "a principal id is 1-64 of a-z 0-9 _ . - and starts with a letter")
    if kind not in KINDS:
        raise AuthError("BAD_KIND", f"kind must be one of {sorted(KINDS)}")
    out = sorted(set(roles))
    if not out or not set(out) <= ROLES:
        raise AuthError("BAD_ROLE", f"roles must be a non-empty subset of {sorted(ROLES)}")
    if APPROVER in out and kind != "human":
        raise AuthError("BAD_ROLE", "only a human may hold the approver role")
    return out


async def add_principal(
    store: EventStore,
    principal_id: str,
    kind: str,
    roles: Iterable[str],
    actor: Mapping[str, Any] = _SYSTEM,
) -> str:
    """Create a principal and return its token. The token is not stored and not shown again."""
    role_list = _check(principal_id, kind, roles)
    token = new_token()
    async with store.transaction() as conn:
        if await conn.fetchval("SELECT 1 FROM principals WHERE principal_id = $1", principal_id):
            raise AuthError("EXISTS", f"principal {principal_id} exists")
        await conn.execute(
            "INSERT INTO principals (principal_id, kind, roles, token_sha256, created_at) "
            "VALUES ($1, $2, $3, $4, $5)",
            principal_id,
            kind,
            role_list,
            hash_token(token),
            store.clock(),
        )
        payload = {"principal": {"kind": kind, "id": principal_id}, "roles": role_list}
        await store.append_in(conn, PRINCIPALS_STREAM, PRINCIPAL_ADDED, payload, actor)
    return token


async def rotate_token(store: EventStore, principal_id: str, actor: Mapping[str, Any] = _SYSTEM) -> str:
    """A new token for the principal; the old one stops working at once."""
    token = new_token()
    async with store.transaction() as conn:
        row = await conn.fetchrow(
            "UPDATE principals SET token_sha256 = $2 WHERE principal_id = $1 AND revoked_at IS NULL "
            "RETURNING kind",
            principal_id,
            hash_token(token),
        )
        if row is None:
            raise AuthError("UNKNOWN_PRINCIPAL", f"no active principal {principal_id}")
        payload = {"principal": {"kind": row["kind"], "id": principal_id}}
        await store.append_in(conn, PRINCIPALS_STREAM, PRINCIPAL_TOKEN_ROTATED, payload, actor)
    return token


async def revoke_principal(
    store: EventStore, principal_id: str, reason: str, actor: Mapping[str, Any] = _SYSTEM
) -> None:
    async with store.transaction() as conn:
        row = await conn.fetchrow(
            "UPDATE principals SET revoked_at = $2 WHERE principal_id = $1 AND revoked_at IS NULL "
            "RETURNING kind",
            principal_id,
            store.clock(),
        )
        if row is None:
            raise AuthError("UNKNOWN_PRINCIPAL", f"no active principal {principal_id}")
        payload = {"principal": {"kind": row["kind"], "id": principal_id}, "reason": reason[:500]}
        await store.append_in(conn, PRINCIPALS_STREAM, PRINCIPAL_REVOKED, payload, actor)


async def list_principals(store: EventStore) -> list[dict[str, Any]]:
    rows = await store.pool.fetch(
        "SELECT principal_id, kind, roles, created_at, revoked_at FROM principals ORDER BY principal_id"
    )
    return [
        {
            "id": r["principal_id"],
            "kind": r["kind"],
            "roles": list(r["roles"]),
            "created_at": r["created_at"].isoformat(),
            "revoked": r["revoked_at"] is not None,
        }
        for r in rows
    ]


async def get_principal(store: EventStore, principal_id: str) -> Principal | None:
    row = await store.pool.fetchrow(
        "SELECT principal_id, kind, roles FROM principals WHERE principal_id = $1 AND revoked_at IS NULL",
        principal_id,
    )
    return None if row is None else Principal(row["principal_id"], row["kind"], frozenset(row["roles"]))


async def authenticate(store: EventStore, token: str | None) -> Principal | None:
    """The active principal a bearer token belongs to, or None. The lookup is by the token's
    hash, so nothing compares the secret itself."""
    if not token or not token.startswith(TOKEN_PREFIX) or len(token) > 128:
        return None
    row = await store.pool.fetchrow(
        "SELECT principal_id, kind, roles FROM principals WHERE token_sha256 = $1 AND revoked_at IS NULL",
        hash_token(token),
    )
    if row is None:
        return None
    return Principal(row["principal_id"], row["kind"], frozenset(row["roles"]))


# ── keys ──────────────────────────────────────────────────────────────────────


async def register_key(store: EventStore, principal: Principal, public_key: str) -> str:
    """Register an Ed25519 public key (64 hex characters) to a human; returns its key id."""
    if principal.kind != "human":
        raise AuthError("NOT_HUMAN", "only a human registers an approval key")
    if not valid_public_key(public_key):
        raise AuthError("BAD_KEY", "public_key must be a 32-byte Ed25519 public key, hex encoded")
    kid = derive_key_id(public_key)
    async with store.transaction() as conn:
        owner = await conn.fetchval("SELECT principal_id FROM principal_keys WHERE key_id = $1", kid)
        if owner is not None:
            raise AuthError("KEY_EXISTS", f"key {kid} is already registered")
        await conn.execute(
            "INSERT INTO principal_keys (key_id, principal_id, public_key, created_at) "
            "VALUES ($1, $2, $3, $4)",
            kid,
            principal.id,
            public_key,
            store.clock(),
        )
        payload = {"principal": principal.actor, "key_id": kid, "public_key": public_key}
        await store.append_in(conn, PRINCIPALS_STREAM, KEY_REGISTERED, payload, principal.actor)
    return kid


async def revoke_key(store: EventStore, principal: Principal, kid: str) -> None:
    async with store.transaction() as conn:
        done = await conn.fetchval(
            "UPDATE principal_keys SET revoked_at = $3 WHERE key_id = $1 AND principal_id = $2 "
            "AND revoked_at IS NULL RETURNING key_id",
            kid,
            principal.id,
            store.clock(),
        )
        if done is None:
            raise AuthError("UNKNOWN_KEY", f"no active key {kid} of {principal.id}")
        payload = {"principal": principal.actor, "key_id": kid}
        await store.append_in(conn, PRINCIPALS_STREAM, KEY_REVOKED, payload, principal.actor)


async def keys_of(store: EventStore, principal_id: str) -> list[dict[str, Any]]:
    rows = await store.pool.fetch(
        "SELECT key_id, public_key, revoked_at FROM principal_keys WHERE principal_id = $1 "
        "ORDER BY created_at",
        principal_id,
    )
    return [
        {"key_id": r["key_id"], "public_key": r["public_key"], "revoked": r["revoked_at"] is not None}
        for r in rows
    ]


# ── sessions ──────────────────────────────────────────────────────────────────


async def open_session(store: EventStore, principal: Principal) -> str:
    session_id = str(uuid.uuid4())
    async with store.transaction() as conn:
        await conn.execute(
            "INSERT INTO sessions (session_id, owner_id, created_at) VALUES ($1, $2, $3)",
            uuid.UUID(session_id),
            principal.id,
            store.clock(),
        )
        payload = {"session_id": session_id, "owner": principal.actor}
        await store.append_in(conn, f"session/{session_id}", SESSION_OPENED, payload, principal.actor)
    return session_id


async def session_owner(store: EventStore, session_id: str) -> str | None:
    try:
        sid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        return None
    return await store.pool.fetchval("SELECT owner_id FROM sessions WHERE session_id = $1", sid)


async def sessions_of(store: EventStore, principal: Principal) -> list[dict[str, Any]]:
    rows = await store.pool.fetch(
        "SELECT session_id, created_at FROM sessions WHERE owner_id = $1 ORDER BY created_at, session_id",
        principal.id,
    )
    return [{"session_id": str(r["session_id"]), "created_at": r["created_at"].isoformat()} for r in rows]
