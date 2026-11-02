"""P4.1 (Q-P4-2, ADR-0019): signed stream-head checkpoints in an anchor file outside Postgres catch
a full rewrite of the history, which the hash chain alone cannot."""

from __future__ import annotations

import asyncio
import json
import secrets

import pytest

from nexus.cli import main
from nexus.store import Anchor, AnchorError
from nexus.store.anchor import parse_keys

from .db import open_store, raw, rewrite_history

db = pytest.mark.integration
STREAM = "session/0b7e9c1d-2f3a-4b5c-8d6e-7f8091a2b3c4"
ME = {"kind": "human", "id": "soham"}


def _key() -> bytes:
    return secrets.token_bytes(32)


@pytest.fixture
def anchor(tmp_path, monkeypatch) -> Anchor:
    """An anchor for the store in the test, and the same keys and directory for the CLI."""
    key = _key()
    monkeypatch.setenv("NEXUS_ANCHOR_KEYS", f"t1:{key.hex()}")
    monkeypatch.setenv("NEXUS_ANCHOR_DIR", str(tmp_path))
    return Anchor({"t1": key}, tmp_path)


async def _append(schema: str, anchor: Anchor | None, n: int, stream: str = STREAM) -> None:
    async with open_store(schema, anchor=anchor) as store:
        for i in range(n):
            await store.append(stream, "note.added", {"n": i, "text": "pay alice 10"}, ME)


async def _verify(schema: str, anchor: Anchor | None, anchored: bool = True):
    async with open_store(schema, anchor=anchor) as store:
        return await store.verify_chain(anchored=anchored)


def _codes(report) -> list[tuple[str, int, str]]:
    return [(p.stream, p.seq, p.code) for p in report.problems]


# ── keys and configuration (no database) ────────────────────────────────────────


def test_keys_parse_in_order_and_bad_ones_are_refused():
    a, b = _key(), _key()
    assert list(parse_keys(f"k2:{b.hex()}, k1:{a.hex()}")) == ["k2", "k1"]
    for bad in ("k1", f"K1:{a.hex()}", "k1:zz", f"k1:{a.hex()[:62]}", f"k1:{a.hex()},k1:{b.hex()}"):
        with pytest.raises(AnchorError):
            parse_keys(bad)


def test_from_env_needs_both_variables_or_neither(tmp_path):
    assert Anchor.from_env({}) is None
    with pytest.raises(AnchorError, match="NEXUS_ANCHOR_DIR is not set"):
        Anchor.from_env({"NEXUS_ANCHOR_KEYS": f"k1:{_key().hex()}"})
    with pytest.raises(AnchorError, match="NEXUS_ANCHOR_KEYS is not set"):
        Anchor.from_env({"NEXUS_ANCHOR_DIR": str(tmp_path)})


def test_a_signed_line_carries_no_key_and_verifies(tmp_path):
    key = _key()
    anchor = Anchor({"k1": key}, tmp_path).bind("nexus", "s1")
    anchor.sign({STREAM: (3, "ab" * 32)}, "2026-10-31T10:00:00.000Z")
    text = anchor.path.read_text()
    assert key.hex() not in text and json.loads(text)["kid"] == "k1"
    assert [(c.stream, c.seq) for c in anchor.read().checkpoints] == [(STREAM, 3)]
    # The same line read for another database or schema is refused: no replay across scopes.
    other = Anchor({"k1": key}, tmp_path).bind("nexus", "s2")
    other.path.write_text(text)
    assert [code for _, code, _ in other.read().invalid] == ["CHECKPOINT_INVALID"]


# ── the attack ──────────────────────────────────────────────────────────────────


@db
def test_a_full_rewrite_passes_the_hash_chain_but_not_the_checkpoints(db_schema, anchor, capsys):
    asyncio.run(_append(db_schema, anchor, 4))
    assert asyncio.run(_verify(db_schema, anchor)).ok
    rewritten = asyncio.run(rewrite_history(db_schema, STREAM, 2, "pay alice 10", "pay mallory 9000"))
    assert rewritten == 3

    chain_only = asyncio.run(_verify(db_schema, anchor, anchored=False))
    assert chain_only.ok  # the gap this closes: every hash, link and the head are consistent
    report = asyncio.run(_verify(db_schema, anchor))
    assert _codes(report) == [(STREAM, seq, "CHECKPOINT_MISMATCH") for seq in (2, 3, 4)]

    assert main(["chain", "verify", "--no-anchor"]) == 0
    assert main(["chain", "verify"]) == 1
    out = capsys.readouterr().out
    assert f"{STREAM} 2 CHECKPOINT_MISMATCH not the hash signed with key t1" in out
    assert "4 signed checkpoints: 3 problems" in out
    assert main(["chain", "checkpoint"]) == 1  # it will not sign over a mismatch
    assert "refused" in capsys.readouterr().out


@db
def test_cutting_the_tail_off_is_caught(db_schema, anchor):
    asyncio.run(_append(db_schema, anchor, 3))

    async def cut() -> None:
        async with raw(db_schema) as conn, conn.transaction():
            await conn.execute("ALTER TABLE events DISABLE TRIGGER events_append_only")
            row = await conn.fetchrow("SELECT hash FROM events WHERE stream = $1 AND seq = 2", STREAM)
            await conn.execute("DELETE FROM events WHERE stream = $1 AND seq = 3", STREAM)
            await conn.execute(
                "UPDATE streams SET head_seq = 2, head_hash = $2 WHERE stream = $1", STREAM, row["hash"]
            )
            await conn.execute("ALTER TABLE events ENABLE TRIGGER events_append_only")

    asyncio.run(cut())
    assert asyncio.run(_verify(db_schema, anchor, anchored=False)).ok
    assert _codes(asyncio.run(_verify(db_schema, anchor))) == [(STREAM, 3, "CHECKPOINT_AHEAD")]


@db
def test_appends_made_without_the_key_are_behind_until_checkpointed(db_schema, anchor, capsys):
    asyncio.run(_append(db_schema, anchor, 2))
    asyncio.run(_append(db_schema, None, 1))  # someone writing straight to the database
    assert _codes(asyncio.run(_verify(db_schema, anchor))) == [(STREAM, 3, "CHECKPOINT_BEHIND")]
    asyncio.run(_append(db_schema, None, 1, stream="pack/new"))
    assert (("pack/new", 1, "CHECKPOINT_MISSING")) in _codes(asyncio.run(_verify(db_schema, anchor)))

    # An operator with the key reviews and adopts the current heads (also how an existing
    # database starts being anchored, and how a checkpoint lost in a crash is recovered).
    assert main(["chain", "checkpoint"]) == 0
    assert "2 stream heads signed" in capsys.readouterr().out
    assert asyncio.run(_verify(db_schema, anchor)).ok


@db
def test_a_deleted_or_edited_anchor_file_is_caught(db_schema, anchor):
    asyncio.run(_append(db_schema, anchor, 2))
    path = anchor.bind(*asyncio.run(_scope(db_schema))).path
    lines = path.read_text().splitlines()
    edited = json.loads(lines[1]) | {"hash": "00" * 32}
    path.write_text(lines[0] + "\n" + json.dumps(edited) + "\n")
    report = asyncio.run(_verify(db_schema, anchor))
    assert _codes(report) == [("(anchor)", 2, "CHECKPOINT_INVALID"), (STREAM, 2, "CHECKPOINT_BEHIND")]
    path.unlink()
    assert _codes(asyncio.run(_verify(db_schema, anchor))) == [(STREAM, 2, "CHECKPOINT_MISSING")]


@db
def test_keys_rotate_by_key_id(db_schema, anchor, tmp_path):
    asyncio.run(_append(db_schema, anchor, 1))
    new = _key()
    rotated = Anchor({"t2": new, "t1": anchor._keys["t1"]}, tmp_path)  # t2 signs, t1 still verifies
    asyncio.run(_append(db_schema, rotated, 1))
    assert asyncio.run(_verify(db_schema, rotated)).ok
    retired = Anchor({"t2": new}, tmp_path)  # t1 dropped: its checkpoints can no longer be trusted
    codes = [p.code for p in asyncio.run(_verify(db_schema, retired)).problems]
    assert codes == ["CHECKPOINT_UNKNOWN_KEY"]


@db
def test_a_rolled_back_append_signs_nothing_and_concurrent_appends_all_sign(db_schema, anchor):
    async def body():
        async with open_store(db_schema, pool_size=10, anchor=anchor) as store:
            with pytest.raises(RuntimeError):
                async with store.transaction() as conn:
                    await store.append_in(conn, STREAM, "note.added", {"n": 0}, ME)
                    raise RuntimeError("abort")
            await asyncio.gather(*(store.append(STREAM, "note.added", {"n": i}, ME) for i in range(50)))
            return await store.verify_chain()

    report = asyncio.run(body())
    assert report.ok and report.events_checked == 50 and report.checkpoints_checked == 50


@db
def test_chain_verify_refuses_to_run_without_anchoring(db_schema, monkeypatch, capsys):
    monkeypatch.delenv("NEXUS_ANCHOR_KEYS", raising=False)
    monkeypatch.delenv("NEXUS_ANCHOR_DIR", raising=False)
    assert main(["chain", "verify"]) == 2
    assert "anchoring is not configured" in capsys.readouterr().err
    assert main(["chain", "verify", "--no-anchor"]) == 0


async def _scope(schema: str) -> tuple[str, str]:
    async with raw(schema) as conn:
        row = await conn.fetchrow("SELECT current_database() AS db, current_schema() AS schema")
    return row["db"], row["schema"]
