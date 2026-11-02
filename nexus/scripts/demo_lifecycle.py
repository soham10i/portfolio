"""The M1 lifecycle demo (P4.md §5): ALLOW, DENY, NEEDS_APPROVAL → approve → execute → verify,
then `nexus trace`, `nexus chain verify`, a tampered event being caught, and a full rewrite of the
history (every later hash and the head recomputed) caught by the signed checkpoints (ADR-0019).

    make db-up
    uv run python scripts/demo_lifecycle.py [--no-tamper] [--schema nexus_demo]

Needs only the local compose Postgres. Everything lives in its own schema, dropped and recreated
on every run; no other schema is touched. The anchor key and directory are made for each run
and never written anywhere but the environment of this process. Exit 0 when every step behaved
as described.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import secrets
import sys
import tempfile
import uuid
from typing import Any

import asyncpg

from nexus.cli import main as nexus
from nexus.exec import Executor
from nexus.gate import Gate, Policy
from nexus.packs import load_binding, load_pack
from nexus.store import Anchor, EventStore, canonical_json, event_hash
from nexus.store.events import _row_to_event

DEFAULT_URL = "postgresql://nexus:nexus@localhost:5433/nexus"
PLANNER = {"kind": "agent", "id": "planner"}
SESSION = str(uuid.uuid4())
failures: list[str] = []


def heading(text: str) -> None:
    print(f"\n── {text} " + "─" * max(0, 72 - len(text)), flush=True)


def expect(ok: bool, what: str) -> None:
    print(f"   {'ok  ' if ok else 'FAIL'} {what}", flush=True)
    if not ok:
        failures.append(what)


def shell(*argv: str, env: dict[str, str] | None = None) -> int:
    """Run a `nexus` command in-process, printing it the way you would type it."""
    prefix = "".join(f"{k}={v} " for k, v in (env or {}).items())
    print(f"\n$ {prefix}nexus {' '.join(argv)}", flush=True)
    saved = {k: os.environ.get(k) for k in env or {}}
    os.environ.update(env or {})
    try:
        code = nexus(list(argv))
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    sys.stdout.flush()
    print(f"(exit {code})", flush=True)
    return code


def proposal(text: str, source: str = "user", ref: str = "msg/1", rationale: str = "") -> dict[str, Any]:
    return {
        "proposal_id": str(uuid.uuid4()),
        "session_id": SESSION,
        "action": "echo:echo.say",
        "params": {"text": text},
        "rationale": rationale or f"say {text!r}",
        "context": [{"source": source, "ref": ref, "triggered": True}],
        "proposer": PLANNER,
        "created_at": "2026-10-30T10:00:00Z",
    }


async def kernel(url: str, schema: str) -> tuple[EventStore, Gate, Executor]:
    store = await EventStore.connect(url, schema=schema, pool_size=4, anchor=Anchor.from_env())
    pack = load_pack("echo")
    gate = Gate(store, [pack], Policy(name="demo", version="0.1.0"))
    return store, gate, Executor(store, gate, {pack.id: load_binding(pack)})


async def reset(url: str, schema: str) -> None:
    conn = await asyncpg.connect(url, timeout=10)
    try:
        await conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await conn.execute(f'CREATE SCHEMA "{schema}"')
    finally:
        await conn.close()
    store = await EventStore.connect(url, schema=schema, pool_size=1)
    try:
        print(f"   schema {schema}: migrations {', '.join(await store.migrate())}")
    finally:
        await store.close()


async def decide_and_run(url: str, schema: str) -> dict[str, Any]:
    store, gate, executor = await kernel(url, schema)
    try:
        heading("1. ALLOW: a user asks; the gate allows; it executes and is verified")
        allowed = await gate.decide(proposal("hello from the governed kernel", rationale="the user asked"))
        print(f"   gate: {allowed['outcome']} (policy {allowed['policy_version']})")
        record = await executor.run(allowed["decision_id"])
        print(f"   executor: {record.status}, verification {record.verification}")
        expect(allowed["outcome"] == "ALLOW" and record.status == "succeeded", "ALLOW executed")
        expect(record.verification == "passed", "its effect was observed in world state")

        heading("2. DENY: empty text breaks the action's parameter schema")
        denied = await gate.decide(proposal(""))
        codes = [r["code"] for r in denied["reasons"]]
        print(f"   gate: {denied['outcome']} {codes}: {denied['reasons'][0]['message']}")
        record = await executor.run(denied["decision_id"])
        print(f"   executor: {record.status} {record.codes}")
        expect(denied["outcome"] == "DENY" and codes == ["PARAMS_INVALID"], "DENY with PARAMS_INVALID")
        expect(record.codes == ["DENIED", "PARAMS_INVALID"], "the executor refuses it too; nothing printed")

        heading("3. NEEDS_APPROVAL: the request came from a document, not a person")
        held = await gate.decide(
            proposal(
                "reorder the parts list", source="doc", ref="corpus/notes.md#L4", rationale="notes say so"
            )
        )
        codes = [r["code"] for r in held["reasons"]]
        print(f"   gate: {held['outcome']} {codes}, approvals required {held['approvals_required']}")
        print(f"   proposal hash {held['proposal_hash']}")
        record = await executor.run(held["decision_id"])
        print(f"   executor before approval: {record.status} {record.codes}")
        expect(held["outcome"] == "NEEDS_APPROVAL" and codes == ["TAINTED_TRIGGER"], "held for a human")
        expect(record.codes == ["NOT_APPROVED"], "nothing runs without the approval")
        return {"allowed": allowed, "denied": denied, "held": held}
    finally:
        await store.close()


async def run_again(url: str, schema: str, decision_id: str) -> None:
    store, _, executor = await kernel(url, schema)
    try:
        record = await executor.run(decision_id)
        print(f"   executor after approval: {record.status}, verification {record.verification}")
        expect(
            record.status == "succeeded" and record.verification == "passed", "approved, executed, verified"
        )
        again = await executor.run(decision_id)
        expect(
            again.duplicate and again.status == "succeeded", "running it again executes nothing (same key)"
        )
    finally:
        await store.close()


async def tamper(url: str, schema: str, decision_id: str) -> None:
    """What an owner of the database could do: switch the append-only trigger off, edit history."""
    conn = await asyncpg.connect(url, timeout=10, server_settings={"search_path": schema})
    try:
        async with conn.transaction():
            await conn.execute("ALTER TABLE events DISABLE TRIGGER events_append_only")
            changed = await conn.execute(
                "UPDATE events SET payload = replace(payload::text, 'reorder the parts list', "
                "'cancel every order')::json WHERE type = 'decision.made' "
                "AND payload->'decision'->>'decision_id' = $1",
                decision_id,
            )
            await conn.execute("ALTER TABLE events ENABLE TRIGGER events_append_only")
        print(f"   {changed}: the approved proposal now reads 'cancel every order'")
    finally:
        await conn.close()


async def rewrite(url: str, schema: str, decision_id: str) -> None:
    """What a careful owner of the database could do: edit the approved proposal, then recompute
    every later hash, every link and the stream head, so the hash chain verifies again."""
    conn = await asyncpg.connect(url, timeout=10, server_settings={"search_path": schema})
    try:
        async with conn.transaction():
            await conn.execute("ALTER TABLE events DISABLE TRIGGER events_append_only")
            first = await conn.fetchrow(
                "SELECT stream, seq FROM events WHERE type = 'decision.made' "
                "AND payload->'decision'->>'decision_id' = $1",
                decision_id,
            )
            rows = await conn.fetch(
                "SELECT pos, stream, seq, type, payload, actor, ts, trace_id, prev_hash, hash FROM events "
                "WHERE stream = $1 AND seq >= $2 ORDER BY seq",
                first["stream"],
                first["seq"],
            )
            prev_hash = rows[0]["prev_hash"]
            for row in rows:
                event = _row_to_event(row)
                text = json.dumps(event["payload"]).replace("cancel every order", "wire the budget away")
                event["payload"], event["prev_hash"] = json.loads(text), prev_hash
                event["hash"] = prev_hash = event_hash(event)
                await conn.execute(
                    "UPDATE events SET payload = $2::json, prev_hash = $3, hash = $4 WHERE pos = $1",
                    row["pos"],
                    canonical_json(event["payload"]).decode(),
                    event["prev_hash"],
                    event["hash"],
                )
            await conn.execute(
                "UPDATE streams SET head_hash = $2 WHERE stream = $1", first["stream"], prev_hash
            )
            await conn.execute("ALTER TABLE events ENABLE TRIGGER events_append_only")
        print(f"   rewrote {len(rows)} events of {first['stream']} from seq {first['seq']}, and its head")
    finally:
        await conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--schema", default="nexus_demo", help="dropped and recreated (default nexus_demo)")
    parser.add_argument("--no-tamper", action="store_true", help="skip the tampering step")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", args.schema):
        parser.error("--schema must be a lowercase identifier")
    url = os.environ.get("NEXUS_DB_URL") or DEFAULT_URL
    os.environ.update({"NEXUS_DB_URL": url, "NEXUS_DB_SCHEMA": args.schema})  # for the nexus commands
    # A fresh signing key and anchor directory for this run only, never printed (ADR-0019).
    anchor_dir = tempfile.mkdtemp(prefix="nexus-demo-anchor-")
    os.environ.update({"NEXUS_ANCHOR_KEYS": f"demo:{secrets.token_hex(32)}", "NEXUS_ANCHOR_DIR": anchor_dir})
    try:
        heading("0. A fresh schema, the echo pack, the gate and the executor")
        asyncio.run(reset(url, args.schema))
        ids = asyncio.run(decide_and_run(url, args.schema))
    except (OSError, asyncpg.PostgresError) as exc:
        print(f"cannot reach Postgres at {url}: {exc}\nstart it with `make db-up`", file=sys.stderr)
        return 2
    held = ids["held"]

    heading("4. A human approves the exact proposal hash")
    code = shell(
        "approve", held["decision_id"], "--proposal-hash", held["proposal_hash"], env={"NEXUS_ACTOR": "alice"}
    )
    expect(code == 0, "alice's approval is recorded")
    asyncio.run(run_again(url, args.schema, held["decision_id"]))

    heading("5. Explain it afterwards, from the log alone")
    expect(shell("trace", held["decision_id"]) == 0, "nexus trace explains the approved action")
    expect(shell("chain", "verify") == 0, "every hash, link and signed checkpoint in the log verifies")

    if not args.no_tamper:
        heading("6. Someone with database access rewrites what was approved")
        asyncio.run(tamper(url, args.schema, held["decision_id"]))
        expect(shell("chain", "verify") == 1, "nexus chain verify reports the edit")
        expect(shell("trace", held["decision_id"]) == 1, "nexus trace refuses to vouch for it")

        heading("7. A careful attacker also recomputes every later hash and the stream head")
        asyncio.run(rewrite(url, args.schema, held["decision_id"]))
        expect(shell("chain", "verify", "--no-anchor") == 0, "the hash chain alone is fooled by this")
        expect(shell("chain", "verify") == 1, "the signed checkpoints outside Postgres are not")
        expect(shell("trace", held["decision_id"]) == 1, "nexus trace refuses to vouch for it")

    heading("Done" if not failures else f"{len(failures)} step(s) did not behave as described")
    for what in failures:
        print(f"   FAIL {what}")
    print(f"   explore: export NEXUS_DB_URL={url} NEXUS_DB_SCHEMA={args.schema}")
    print(f"            uv run nexus trace {ids['allowed']['decision_id']}")
    print(f"            uv run nexus trace {ids['denied']['decision_id']} --json")
    if not args.no_tamper:
        print("   (steps 6-7 broke this session's chain, traces in it say so; --no-tamper keeps it intact)")
    print(f"   the signed checkpoints are in {anchor_dir}; this run's key is gone when it exits")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
