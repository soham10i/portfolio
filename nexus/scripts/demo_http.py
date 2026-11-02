"""The governed lifecycle over HTTP (P8.md §3): the same ALLOW, DENY and NEEDS_APPROVAL path as
`make demo`, but through `nexus serve` and the Python SDK, with a signed approval.

    make db-up
    uv run python scripts/demo_http.py [--schema nexus_demo_http]

The server runs in this process on a free loopback port. Everything lives in its own schema,
dropped and recreated on every run. Tokens and keys are made for this run, held in memory and
never printed. Exit 0 when every step behaved as described.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import secrets
import sys
import tempfile
import threading
import time
from typing import Any

import asyncpg
import uvicorn

from nexus.api import create_app
from nexus.api.auth import add_principal
from nexus.cli import main as nexus
from nexus.packs import load_pack
from nexus.sdk import ApiError, Client, Signer, proposal_hash
from nexus.store import Anchor, EventStore

DEFAULT_URL = "postgresql://nexus:nexus@localhost:5433/nexus"
failures: list[str] = []


def heading(text: str) -> None:
    print(f"\n── {text} " + "─" * max(0, 72 - len(text)), flush=True)


def expect(ok: bool, what: str) -> None:
    print(f"   {'ok  ' if ok else 'FAIL'} {what}", flush=True)
    if not ok:
        failures.append(what)


def refused(call: Any) -> ApiError | None:
    """The ApiError a call raised, or None when it succeeded."""
    try:
        call()
    except ApiError as exc:
        return exc
    return None


def echo(text: str, source: str = "user", ref: str = "msg/1", rationale: str = "") -> dict[str, Any]:
    return {
        "action": "echo:echo.say",
        "params": {"text": text},
        "rationale": rationale or f"say {text!r}",
        "context": [{"source": source, "ref": ref, "triggered": True}],
    }


async def reset(url: str, schema: str) -> dict[str, str]:
    conn = await asyncpg.connect(url, timeout=10)
    try:
        await conn.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await conn.execute(f'CREATE SCHEMA "{schema}"')
    finally:
        await conn.close()
    store = await EventStore.connect(url, schema=schema, pool_size=1)
    try:
        print(f"   schema {schema}: migrations {', '.join(await store.migrate())}")
        return {
            "operator": await add_principal(store, "operator", "human", ["requester"]),
            "alice": await add_principal(store, "alice", "human", ["approver"]),
        }
    finally:
        await store.close()


class Server:
    """uvicorn on 127.0.0.1, port chosen by the OS, in a thread of this process."""

    def __init__(self, url: str, schema: str) -> None:
        app = create_app(
            lambda: EventStore.connect(url, schema=schema, pool_size=4, anchor=Anchor.from_env()),
            [load_pack("echo")],
        )
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
        self.thread = threading.Thread(target=self.server.run, daemon=True)

    def __enter__(self) -> str:
        self.thread.start()
        deadline = time.monotonic() + 15
        while not self.server.started:
            if not self.thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError("the server did not start")
            time.sleep(0.05)
        port = self.server.servers[0].sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{port}"

    def __exit__(self, *_: object) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)


def run(base: str, tokens: dict[str, str]) -> None:
    operator = Client(base, tokens["operator"])
    alice = Client(base, tokens["alice"])
    signer = Signer.generate()
    kid = alice.register_key(signer)
    print(f"   server {base}; alice registered key {kid}")
    session = operator.open_session()
    print(f"   operator opened session {session}")

    heading("1. ALLOW: the operator asks; the gate allows; it executes and is verified")
    allowed = operator.propose(session, echo("hello over HTTP", rationale="the operator asked"))["decision"]
    record = operator.execute(allowed["decision_id"])
    print(f"   gate: {allowed['outcome']}; executor: {record['status']}, {record['verification']}")
    expect(allowed["outcome"] == "ALLOW" and record["status"] == "succeeded", "ALLOW executed")
    expect(record["verification"] == "passed", "its effect was observed in world state")

    heading("2. DENY: empty text breaks the action's parameter schema")
    denied = operator.propose(session, echo(""))["decision"]
    err = refused(lambda: operator.execute(denied["decision_id"]))
    print(f"   gate: {denied['outcome']}; execute: {err}")
    expect(denied["outcome"] == "DENY", "DENY")
    expect(err is not None and err.status == 409 and err.code == "DENIED", "execute refused with 409 DENIED")

    heading("3. NEEDS_APPROVAL: the request came from a document, not a person")
    held = operator.propose(
        session, echo("reorder the parts list", "doc", "corpus/notes.md#L4", "notes say so")
    )["decision"]
    did = held["decision_id"]
    err = refused(lambda: operator.execute(did))
    print(f"   gate: {held['outcome']} {[r['code'] for r in held['reasons']]}; execute: {err}")
    expect(held["outcome"] == "NEEDS_APPROVAL", "held for a human")
    expect(err is not None and err.code == "NOT_APPROVED", "execute refused with NOT_APPROVED")

    items = {i["decision_id"]: i for i in alice.inbox()}
    expect(did in items, "it is in alice's inbox, with its evidence")
    shown = items[did]["evidence"]["proposal"]
    expect(proposal_hash(shown) == held["proposal_hash"], "what alice is shown hashes to the decided hash")

    heading("4. alice signs the hash of a modified copy")
    modified = dict(shown, params={"text": "cancel every order"})
    err = refused(lambda: alice.approve(did, modified, signer, approver="alice"))
    print(f"   {err}")
    expect(err is not None and err.status == 409 and err.code == "HASH_MISMATCH", "409 HASH_MISMATCH")

    heading("5. alice signs with a key that is not registered to her")
    stranger = Signer.generate()
    err = refused(lambda: alice.approve(did, shown, stranger, approver="alice"))
    print(f"   {err}")
    expect(err is not None and err.status == 409 and err.code == "UNKNOWN_KEY", "409 UNKNOWN_KEY")

    heading("6. alice signs the hash of what she was shown")
    approval = alice.approve(did, shown, signer, approver="alice")["approval"]
    print(f"   approval recorded, signed with key {approval['signature']['key_id']}")
    record = operator.execute(did)
    print(f"   executor: {record['status']}, verification {record['verification']}")
    ok = record["status"] == "succeeded" and record["verification"] == "passed"
    expect(ok, "approved, executed, verified")

    heading("7. Sessions and roles hold across principals")
    err = refused(lambda: alice.events(session))
    print(f"   alice reads operator's session: {err}")
    expect(err is not None and err.status == 404, "alice cannot read operator's session (404)")
    err = refused(lambda: operator.approve(did, shown, signer, approver="operator"))
    print(f"   operator approves: {err}")
    expect(err is not None and err.status == 403, "operator cannot approve (403)")

    heading("8. The evidence pack over HTTP")
    doc = operator.evidence(did)
    approvals = doc["evidence"]["approvals"]
    signed = [(a["approver"]["id"], (a.get("signature") or {}).get("verified")) for a in approvals]
    print(f"   intact {doc['intact']}; approvals (approver, signature verified): {signed}")
    expect(doc["intact"], "its hash chain is intact")
    expect(
        len(approvals) == 1 and approvals[0]["signature"]["verified"] is True,
        "it shows alice's signed approval, verified",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--schema", default="nexus_demo_http", help="dropped and recreated")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", args.schema):
        parser.error("--schema must be a lowercase identifier")
    url = os.environ.get("NEXUS_DB_URL") or DEFAULT_URL
    os.environ.update({"NEXUS_DB_URL": url, "NEXUS_DB_SCHEMA": args.schema})
    # A fresh anchor key and directory for this run only, never printed (ADR-0019).
    anchor_dir = tempfile.mkdtemp(prefix="nexus-demo-anchor-")
    os.environ.update({"NEXUS_ANCHOR_KEYS": f"demo:{secrets.token_hex(32)}", "NEXUS_ANCHOR_DIR": anchor_dir})
    try:
        heading("0. A fresh schema and two principals: operator (requester), alice (approver)")
        tokens = asyncio.run(reset(url, args.schema))
    except (OSError, asyncpg.PostgresError) as exc:
        print(f"cannot reach Postgres at {url}: {exc}\nstart it with `make db-up`", file=sys.stderr)
        return 2
    with Server(url, args.schema) as base:
        run(base, tokens)

    heading("9. The log verifies")
    print("\n$ nexus chain verify", flush=True)
    code = nexus(["chain", "verify"])
    sys.stdout.flush()
    expect(code == 0, "every hash, link and signed checkpoint in the log verifies")

    print()
    if failures:
        print(f"{len(failures)} step(s) did not behave as described:", *failures, sep="\n  ")
        return 1
    print("every step behaved as described")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
