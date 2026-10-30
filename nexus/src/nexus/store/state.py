"""World state: a versioned (entity, key) → value projection of `state.set` events (ADR-0008)."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from .canonical import canonical_json
from .errors import CasConflict, StoreError

if TYPE_CHECKING:
    from .events import EventStore

STATE_SET = "state.set"

_REBUILD_DIFF = """
WITH rebuilt AS (
    SELECT DISTINCT ON (payload->>'entity', payload->>'key')
           payload->>'entity'               AS entity,
           payload->>'key'                  AS key,
           (payload->'value')::jsonb        AS value,
           (payload->>'version')::bigint    AS version,
           ts                               AS updated_at,
           pos                              AS event_pos
    FROM events
    WHERE type = 'state.set'
    ORDER BY payload->>'entity', payload->>'key', (payload->>'version')::bigint DESC, pos DESC
)
SELECT coalesce(r.entity, s.entity) AS entity,
       coalesce(r.key, s.key)       AS key,
       CASE WHEN s.entity IS NULL THEN 'MISSING'
            WHEN r.entity IS NULL THEN 'EXTRA'
            WHEN s.value IS DISTINCT FROM r.value THEN 'VALUE'
            WHEN s.version <> r.version THEN 'VERSION'
            WHEN s.updated_at <> r.updated_at OR s.event_pos <> r.event_pos THEN 'SOURCE'
       END AS problem,
       s.value::text AS live,
       r.value::text AS rebuilt
FROM rebuilt r
FULL JOIN state s ON s.entity = r.entity AND s.key = r.key
ORDER BY 1, 2
"""


@dataclass(frozen=True)
class StateRow:
    entity: str
    key: str
    value: Any
    version: int
    updated_at: str  # ts of the event that wrote it


@dataclass(frozen=True)
class StateDiff:
    entity: str
    key: str
    problem: str  # MISSING (only in the rebuild) | EXTRA (only live) | VALUE | VERSION | SOURCE
    live: str | None
    rebuilt: str | None


def _check_name(what: str, value: str) -> None:
    if not isinstance(value, str) or not 1 <= len(value) <= 256:
        raise StoreError(f"{what} must be a string of 1 to 256 characters")


class WorldState:
    """Reads and compare-and-set writes over the `state` projection. Reached as `store.state`."""

    def __init__(self, store: EventStore) -> None:
        self._store = store

    async def get(self, entity: str, key: str) -> StateRow | None:
        row = await self._store._pool.fetchrow(
            "SELECT value::text, version, updated_at FROM state WHERE entity = $1 AND key = $2", entity, key
        )
        if row is None:
            return None
        return StateRow(entity, key, json.loads(row["value"]), row["version"], row["updated_at"])

    async def set(
        self,
        entity: str,
        key: str,
        value: Any,
        expected_version: int,
        actor: Mapping[str, Any],
        stream: str,
        trace_id: str | None = None,
    ) -> StateRow:
        """Write `value` if the key is at `expected_version` (0: must not exist yet).

        One transaction appends a `state.set` event and updates the projection; on a version
        mismatch it raises CasConflict and neither happens.
        """
        _check_name("entity", entity)
        _check_name("key", key)
        try:
            value_text = canonical_json(value).decode()
        except ValueError as exc:
            raise StoreError(str(exc)) from exc
        async with self._store._pool.acquire() as conn, conn.transaction():
            # Lock order is always key, then stream head (inside _append_in), so two writers can
            # never wait on each other in a cycle. The key lock is an advisory lock because a
            # first write has no state row to lock yet (ADR-0008).
            await conn.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended("
                "jsonb_build_array(current_schema(), $1::text, $2::text)::text, 0))",
                entity,
                key,
            )
            current = await conn.fetchval(
                "SELECT version FROM state WHERE entity = $1 AND key = $2 FOR UPDATE", entity, key
            )
            if (current or 0) != expected_version:
                raise CasConflict(entity, key, expected_version, current or 0)
            version = expected_version + 1
            payload = {
                "entity": entity,
                "key": key,
                "value": value,
                "version": version,
                "prev_version": expected_version,
            }
            event, pos = await self._store._append_in(conn, stream, STATE_SET, payload, actor, trace_id)
            # The WHERE also catches a first write that raced another first write of the same key.
            written = await conn.fetchval(
                "INSERT INTO state (entity, key, value, version, updated_at, event_pos) "
                "VALUES ($1, $2, $3::jsonb, $4, $5, $6) "
                "ON CONFLICT (entity, key) DO UPDATE SET value = EXCLUDED.value, version = EXCLUDED.version, "
                "updated_at = EXCLUDED.updated_at, event_pos = EXCLUDED.event_pos "
                "WHERE state.version = $7 RETURNING version",
                entity,
                key,
                value_text,
                version,
                event["ts"],
                pos,
                expected_version,
            )
            if written is None:
                actual = await conn.fetchval(
                    "SELECT version FROM state WHERE entity = $1 AND key = $2", entity, key
                )
                raise CasConflict(entity, key, expected_version, actual or 0)
        return StateRow(entity, key, value, version, event["ts"])

    async def count(self) -> int:
        return await self._store._pool.fetchval("SELECT count(*) FROM state")

    async def check(self) -> list[StateDiff]:
        """Rebuild the projection from `state.set` events (highest version per key wins) and
        return every difference from the live table. Empty means they agree. Writes nothing."""
        rows = await self._store._pool.fetch(_REBUILD_DIFF)
        return [
            StateDiff(r["entity"], r["key"], r["problem"], r["live"], r["rebuilt"])
            for r in rows
            if r["problem"]
        ]
