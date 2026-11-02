"""Explicit memory in three tiers (P7.md §2.5, ADR-0025, ADR-0030).

A memory is written only by an explicit add, never from a model's output. Its content lives only
in the `memories` table: the events that record an add, a delete or a purge carry its id, hash and
length, never the text. A delete marks the memory deleted and keeps it, so nothing retrieves it
but `show` and `find(include_deleted=True)` still can; a purge removes the row, so the content is
really gone while the hash chain still verifies."""

from __future__ import annotations

import hashlib
import re
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from ..store import EventStore
from ..store.events import utc_timestamp

MEMORY_ADDED = "memory.added"
MEMORY_DELETED = "memory.deleted"
MEMORY_PURGED = "memory.purged"
TIERS = ("session", "project", "profile")
MAX_CONTENT = 2000
_SCOPE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$")

_SELECT = (
    "SELECT memory_id, tier, scope, content, source, content_sha256, created_at, deleted_at, deleted_reason "
    "FROM memories "
)

_SEARCH = """
WITH q AS (SELECT nullif(replace(plainto_tsquery('english', $1)::text, '&', '|'), '')::tsquery AS q)
SELECT memory_id, tier, scope, content, source, content_sha256, created_at, deleted_at, deleted_reason,
       ts_rank_cd(m.tsv, q.q) AS rank
FROM memories m, q
WHERE q.q IS NOT NULL AND m.tsv @@ q.q AND m.deleted_at IS NULL
  AND (m.tier, m.scope) IN (SELECT * FROM unnest($2::text[], $3::text[]))
ORDER BY rank DESC, m.created_at, m.memory_id
LIMIT $4
"""


class MemoryStoreError(ValueError):
    """A memory request that cannot be carried out: bad tier or scope, or no such memory."""


@dataclass(frozen=True)
class Memory:
    memory_id: str
    tier: str
    scope: str
    content: str
    source: str
    content_sha256: str
    created_at: str
    deleted_at: str | None = None
    deleted_reason: str | None = None

    @property
    def status(self) -> str:
        return "deleted" if self.deleted_at else "current"

    @property
    def ref(self) -> str:
        return f"memory/{self.tier}/{self.memory_id}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "tier": self.tier,
            "scope": self.scope,
            "content": self.content,
            "source": self.source,
            "content_sha256": self.content_sha256,
            "created_at": self.created_at,
            "status": self.status,
            "deleted_at": self.deleted_at,
            "deleted_reason": self.deleted_reason,
        }


def _memory(row: Mapping[str, Any]) -> Memory:
    return Memory(
        str(row["memory_id"]),
        row["tier"],
        row["scope"],
        row["content"],
        row["source"],
        row["content_sha256"],
        row["created_at"],
        row["deleted_at"],
        row["deleted_reason"],
    )


def _check(tier: str, scope: str) -> None:
    if tier not in TIERS:
        raise MemoryStoreError(f"tier must be one of {', '.join(TIERS)}")
    if not _SCOPE.fullmatch(scope):
        raise MemoryStoreError(f"scope {scope!r} must match {_SCOPE.pattern}")


def _reason(reason: str) -> None:
    if not 1 <= len(reason) <= 500:
        raise MemoryStoreError("reason must be 1 to 500 characters")


def _uuid(memory_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(memory_id)
    except ValueError as exc:
        raise MemoryStoreError(f"{memory_id!r} is not a memory id") from exc


class MemoryStore:
    def __init__(self, store: EventStore) -> None:
        self._store = store

    async def add(self, content: str, tier: str, scope: str, source: str, actor: Mapping[str, Any]) -> Memory:
        _check(tier, scope)
        content = content.strip()
        if not 1 <= len(content) <= MAX_CONTENT:
            raise MemoryStoreError(f"content must be 1 to {MAX_CONTENT} characters")
        if not 1 <= len(source) <= 256:
            raise MemoryStoreError("source must be 1 to 256 characters")
        memory = Memory(
            str(uuid.uuid4()),
            tier,
            scope,
            content,
            source,
            hashlib.sha256(content.encode()).hexdigest(),
            utc_timestamp(self._store.clock()),
        )
        payload = {
            "memory_id": memory.memory_id,
            "tier": tier,
            "scope": scope,
            "source": source,
            "content_sha256": memory.content_sha256,
            "length": len(content),
        }
        async with self._store.transaction() as conn:
            await conn.execute(
                "INSERT INTO memories (memory_id, tier, scope, content, source, content_sha256, created_at) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7)",
                _uuid(memory.memory_id),
                tier,
                scope,
                content,
                source,
                memory.content_sha256,
                memory.created_at,
            )
            await self._store.append_in(conn, f"memory/{tier}", MEMORY_ADDED, payload, actor)
        return memory

    async def show(self, memory_id: str) -> Memory | None:
        row = await self._store.pool.fetchrow(_SELECT + "WHERE memory_id = $1", _uuid(memory_id))
        return _memory(row) if row else None

    async def find(
        self, tier: str | None = None, scope: str | None = None, *, include_deleted: bool = False
    ) -> list[Memory]:
        rows = await self._store.pool.fetch(
            _SELECT + "WHERE ($1::text IS NULL OR tier = $1) AND ($2::text IS NULL OR scope = $2) "
            "AND ($3 OR deleted_at IS NULL) ORDER BY created_at, memory_id",
            tier,
            scope,
            include_deleted,
        )
        return [_memory(r) for r in rows]

    async def delete(self, memory_id: str, reason: str, actor: Mapping[str, Any]) -> Memory:
        """Mark the memory deleted, keeping its text, and record `memory.deleted` (id, hash,
        reason) in one transaction. Nothing retrieves a deleted memory; `purge` erases it."""
        _reason(reason)
        async with self._store.transaction() as conn:
            row = await conn.fetchrow(
                "UPDATE memories SET deleted_at = $2, deleted_reason = $3 "
                "WHERE memory_id = $1 AND deleted_at IS NULL "
                "RETURNING memory_id, tier, scope, content, source, content_sha256, created_at, "
                "deleted_at, deleted_reason",
                _uuid(memory_id),
                utc_timestamp(self._store.clock()),
                reason,
            )
            if row is None:
                raise MemoryStoreError(f"no current memory {memory_id}")
            memory = _memory(row)
            payload = {
                "memory_id": memory.memory_id,
                "content_sha256": memory.content_sha256,
                "reason": reason,
                "kept": True,
            }
            await self._store.append_in(conn, f"memory/{memory.tier}", MEMORY_DELETED, payload, actor)
        return memory

    async def purge(self, memory_id: str, reason: str, actor: Mapping[str, Any]) -> Memory:
        """Remove the row, current or deleted, and record `memory.purged` (id, hash, reason) in
        one transaction. Only the hash is left."""
        _reason(reason)
        async with self._store.transaction() as conn:
            row = await conn.fetchrow(
                "DELETE FROM memories WHERE memory_id = $1 "
                "RETURNING memory_id, tier, scope, content, source, content_sha256, created_at, "
                "deleted_at, deleted_reason",
                _uuid(memory_id),
            )
            if row is None:
                raise MemoryStoreError(f"no memory {memory_id}")
            memory = _memory(row)
            payload = {
                "memory_id": memory.memory_id,
                "content_sha256": memory.content_sha256,
                "reason": reason,
            }
            await self._store.append_in(conn, f"memory/{memory.tier}", MEMORY_PURGED, payload, actor)
        return memory

    async def search(self, query: str, scopes: Sequence[tuple[str, str]], k: int = 3) -> list[Memory]:
        """Full-text over content, only within the given (tier, scope) pairs."""
        if not query.strip() or not scopes:
            return []
        tiers = [t for t, _ in scopes]
        names = [s for _, s in scopes]
        rows = await self._store.pool.fetch(_SEARCH, query, tiers, names, k)
        return [_memory(r) for r in rows]


def scopes_for(session_id: str | None, packs: Sequence[str], user: str | None) -> list[tuple[str, str]]:
    """Session memories only in their session, project memories for the packs in play, profile
    memories for the user."""
    out = [("project", p) for p in packs]
    if session_id:
        out.append(("session", session_id))
    if user:
        out.append(("profile", user))
    return out
