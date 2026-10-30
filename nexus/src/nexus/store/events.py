"""The event store: one append path, a hash chain per stream, and chain verification (ADR-0008)."""

from __future__ import annotations

import json
import re
import secrets
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib import resources
from typing import Any

import asyncpg

from ..contracts import Kind, validate
from .canonical import canonical_json, event_hash
from .errors import StoreError

Clock = Callable[[], datetime]
_SCHEMA_NAME = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
_EVENT_COLUMNS = "pos, stream, seq, type, payload, actor, ts, trace_id, prev_hash, hash"


def utc_timestamp(moment: datetime) -> str:
    """'2026-10-30T10:00:00.123Z': UTC, millisecond precision, the form event.schema.json requires."""
    moment = moment.astimezone(UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def new_trace_id() -> str:
    return secrets.token_hex(16)


def _row_to_event(row: asyncpg.Record) -> dict[str, Any]:
    return {
        "schema_version": "1",
        "stream": row["stream"],
        "seq": row["seq"],
        "type": row["type"],
        "payload": json.loads(row["payload"]),
        "actor": json.loads(row["actor"]),
        "ts": row["ts"],
        "trace_id": row["trace_id"],
        "prev_hash": row["prev_hash"],
        "hash": row["hash"],
    }


@dataclass(frozen=True)
class ChainProblem:
    stream: str
    seq: int
    code: str  # HASH_MISMATCH | PREV_HASH_MISMATCH | SEQ_GAP | HEAD_MISMATCH
    message: str

    def __str__(self) -> str:
        return f"{self.stream} {self.seq} {self.code} {self.message}"


@dataclass
class ChainReport:
    events_checked: int = 0
    streams_checked: int = 0
    problems: list[ChainProblem] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


class EventStore:
    """Append-only, hash-chained events in Postgres. Build with `await EventStore.connect(url)`."""

    def __init__(self, pool: asyncpg.Pool, clock: Clock) -> None:
        from .state import WorldState  # state builds on the append path defined here

        self._pool = pool
        self._clock = clock
        self.state = WorldState(self)

    @classmethod
    async def connect(
        cls, url: str, schema: str | None = None, pool_size: int = 10, clock: Clock | None = None
    ) -> EventStore:
        """Open a pool. `schema` puts every table in that Postgres schema (tests use one each)."""
        settings = {}
        if schema is not None:
            if not _SCHEMA_NAME.fullmatch(schema):
                raise StoreError(f"invalid schema name {schema!r}")
            settings["search_path"] = schema
        pool = await asyncpg.create_pool(
            url, min_size=1, max_size=pool_size, server_settings=settings, timeout=10
        )
        return cls(pool, clock or (lambda: datetime.now(UTC)))

    async def close(self) -> None:
        await self._pool.close()

    async def migrate(self) -> list[str]:
        """Apply the SQL files in migrations/ that have not run yet. Returns what was applied."""
        files = sorted(
            (f for f in resources.files("nexus.store").joinpath("migrations").iterdir()),
            key=lambda f: f.name,
        )
        applied: list[str] = []
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':migrate'))")
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS nexus_migrations "
                "(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
            done = {r["version"] for r in await conn.fetch("SELECT version FROM nexus_migrations")}
            for file in files:
                if file.name.endswith(".sql") and file.name not in done:
                    await conn.execute(file.read_text(encoding="utf-8"))
                    await conn.execute("INSERT INTO nexus_migrations (version) VALUES ($1)", file.name)
                    applied.append(file.name)
        return applied

    # ── the one write path ────────────────────────────────────────────────────

    async def append(
        self,
        stream: str,
        type: str,
        payload: Mapping[str, Any],
        actor: Mapping[str, Any],
        trace_id: str | None = None,
    ) -> dict[str, Any]:
        """Append one event to `stream` and return it. Raises StoreError and writes nothing if
        the event would not be valid against event.schema.json or not canonicalisable."""
        async with self._pool.acquire() as conn, conn.transaction():
            event, _ = await self._append_in(conn, stream, type, payload, actor, trace_id)
        return event

    async def _append_in(
        self,
        conn: asyncpg.Connection,
        stream: str,
        type: str,
        payload: Mapping[str, Any],
        actor: Mapping[str, Any],
        trace_id: str | None,
    ) -> tuple[dict[str, Any], int]:
        """Append inside the caller's transaction. Returns the event and its global position.
        This is the only place in NEXUS that inserts into `events`."""
        # Create the head row if needed, then lock it: concurrent appends to this stream wait here.
        await conn.execute(
            "INSERT INTO streams (stream, head_seq, head_hash) VALUES ($1, 0, '') ON CONFLICT DO NOTHING",
            stream,
        )
        head = await conn.fetchrow(
            "SELECT head_seq, head_hash FROM streams WHERE stream = $1 FOR UPDATE", stream
        )
        seq = head["head_seq"] + 1
        event: dict[str, Any] = {
            "schema_version": "1",
            "stream": stream,
            "seq": seq,
            "type": type,
            "payload": dict(payload),
            "actor": dict(actor),
            "ts": utc_timestamp(self._clock()),
            "trace_id": trace_id or new_trace_id(),
            "prev_hash": head["head_hash"] if seq > 1 else None,
        }
        try:
            payload_text = canonical_json(event["payload"]).decode()
            actor_text = canonical_json(event["actor"]).decode()
            event["hash"] = event_hash(event)
        except ValueError as exc:
            raise StoreError(str(exc)) from exc
        issues = validate(Kind.EVENT, event)
        if issues:
            raise StoreError("; ".join(f"{i.code} {i.pointer or '/'}: {i.message}" for i in issues))
        pos = await conn.fetchval(
            "INSERT INTO events (stream, seq, type, payload, actor, ts, trace_id, prev_hash, hash) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING pos",
            stream,
            seq,
            type,
            payload_text,
            actor_text,
            event["ts"],
            event["trace_id"],
            event["prev_hash"],
            event["hash"],
        )
        await conn.execute(
            "UPDATE streams SET head_seq = $2, head_hash = $3 WHERE stream = $1", stream, seq, event["hash"]
        )
        return event, pos

    # ── reading and verification ──────────────────────────────────────────────

    async def read(self, stream: str, after_seq: int = 0) -> list[dict[str, Any]]:
        """Events of one stream with seq > after_seq, in order."""
        rows = await self._pool.fetch(
            f"SELECT {_EVENT_COLUMNS} FROM events WHERE stream = $1 AND seq > $2 ORDER BY seq",  # noqa: S608
            stream,
            after_seq,
        )
        return [_row_to_event(r) for r in rows]

    async def verify_chain(self, stream: str | None = None) -> ChainReport:
        """Recompute every hash and check links, sequence numbers and stream heads."""
        report = ChainReport()
        where, args = ("WHERE stream = $1", [stream]) if stream else ("", [])
        async with self._pool.acquire() as conn, conn.transaction(isolation="repeatable_read"):
            heads = {
                r["stream"]: (r["head_seq"], r["head_hash"])
                for r in await conn.fetch(f"SELECT stream, head_seq, head_hash FROM streams {where}", *args)  # noqa: S608
            }
            current: str | None = None
            expected_seq, prev_hash = 1, None
            last: tuple[int, str] | None = None

            def close_stream() -> None:
                if current is None:
                    return
                report.streams_checked += 1
                head = heads.pop(current, None)
                if head is None or head != last:
                    seq = head[0] if head else (last[0] if last else 0)
                    report.problems.append(
                        ChainProblem(current, seq, "HEAD_MISMATCH", f"head {head} != last event {last}")
                    )

            async for row in conn.cursor(
                f"SELECT {_EVENT_COLUMNS} FROM events {where} ORDER BY stream, seq",  # noqa: S608
                *args,
            ):
                if row["stream"] != current:
                    close_stream()
                    current, expected_seq, prev_hash, last = row["stream"], 1, None, None
                report.events_checked += 1
                seq = row["seq"]
                if event_hash(_row_to_event(row)) != row["hash"]:
                    report.problems.append(
                        ChainProblem(current, seq, "HASH_MISMATCH", "stored event does not match its hash")
                    )
                if seq != expected_seq:
                    report.problems.append(
                        ChainProblem(current, seq, "SEQ_GAP", f"expected seq {expected_seq}")
                    )
                if row["prev_hash"] != prev_hash:
                    report.problems.append(
                        ChainProblem(current, seq, "PREV_HASH_MISMATCH", "prev_hash is not the previous hash")
                    )
                expected_seq, prev_hash, last = seq + 1, row["hash"], (seq, row["hash"])
            close_stream()
            for orphan, head in sorted(heads.items()):  # a head row whose events are all gone
                report.streams_checked += 1
                report.problems.append(ChainProblem(orphan, head[0], "HEAD_MISMATCH", "stream has no events"))
        return report
