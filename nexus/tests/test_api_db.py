"""P8 against Postgres: auth (A2), the Host guard (A3), two-session isolation (A4), the gate on
every path (A5), signed approvals (A6), the entry point (A7), the WebSocket (A8), the TypeScript
SDK end to end (A9) and the CLI for principals and keys."""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import pytest
import uvicorn
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from nexus.api import create_app
from nexus.api.auth import add_principal, hash_token, revoke_principal
from nexus.cli import main
from nexus.exec.approvals import APPROVAL_GRANTED, find_decision
from nexus.knowledge import MemoryStore
from nexus.packs import load_pack
from nexus.sdk import proposal_hash
from nexus.signing import Signer, approval_message
from nexus.store import EventStore

from .db import URL, open_store
from .plan_support import SAY, ScriptedModel, accept, plan, step
from .support import ROOT

pytestmark = pytest.mark.integration

PRINCIPALS = {
    "operator": ("human", ["requester"]),
    "bob": ("human", ["requester"]),
    "bot": ("agent", ["requester"]),
    "alice": ("human", ["approver"]),
    "carol": ("human", ["approver"]),
    "gone": ("human", ["requester", "approver"]),
}


@dataclass
class Model:
    """The model every request gets; a test swaps `current` to script it."""

    current: Any = field(default_factory=lambda: ScriptedModel(RuntimeError("no model call expected")))


@dataclass
class Api:
    client: TestClient
    schema: str
    tokens: dict[str, str]
    model: Model

    def h(self, who: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.tokens[who]}"}

    def call(self, who: str, method: str, path: str, body: Any = None) -> Any:
        return self.client.request(method, path, headers=self.h(who), json=body)

    def session(self, who: str = "operator") -> str:
        resp = self.call(who, "POST", "/v1/sessions")
        assert resp.status_code == 201, resp.text
        return resp.json()["session_id"]

    def propose(self, sid: str, who: str = "operator", **kw: Any) -> Any:
        return self.call(who, "POST", f"/v1/sessions/{sid}/proposals", echo(**kw))

    def held(self, sid: str, who: str = "operator", text: str = "reorder the parts list") -> dict[str, Any]:
        resp = self.propose(sid, who, text=text, source="doc", ref="corpus/notes.md#L4")
        assert resp.status_code == 201, resp.text
        decision = resp.json()["decision"]
        assert decision["outcome"] == "NEEDS_APPROVAL"
        return resp.json()

    def register(self, who: str, signer: Signer) -> str:
        resp = self.call(who, "POST", "/v1/keys", {"public_key": signer.public_key})
        assert resp.status_code == 201, resp.text
        return resp.json()["key_id"]

    def approve(self, who: str, decision_id: str, digest: str, signer: Signer, kid: str | None = None) -> Any:
        message = approval_message(decision_id, digest, {"kind": "human", "id": who})
        body = {"proposal_hash": digest, "key_id": kid or signer.key_id, "signature": signer.sign(message)}
        return self.call(who, "POST", f"/v1/decisions/{decision_id}/approve", body)

    def run(self, fn: Any) -> Any:
        async def body() -> Any:
            async with open_store(self.schema, pool_size=2) as store:
                return await fn(store)

        return asyncio.run(body())

    def events(self, stream_prefix: str = "") -> list[dict[str, Any]]:
        async def fetch(store: EventStore) -> list[dict[str, Any]]:
            rows = await store.pool.fetch(
                "SELECT stream, seq, type, payload::text AS payload, actor::text AS actor FROM events "
                "WHERE stream LIKE $1 ORDER BY pos",
                stream_prefix + "%",
            )
            return [dict(r) for r in rows]

        return self.run(fetch)


def echo(text: str = "hello", source: str = "user", ref: str = "msg/1", **extra: Any) -> dict[str, Any]:
    return {
        "action": SAY,
        "params": {"text": text},
        "rationale": f"say {text!r}",
        "context": [{"source": source, "ref": ref, "triggered": True}],
        **extra,
    }


def answer(*sentences: tuple[str, list[str]]) -> dict[str, Any]:
    return {
        "decision": "answer",
        "reason": "the sources say so",
        "points": ["what the question asks"],
        "sentences": [{"text": t, "cites": list(c), "point": 1} for t, c in sentences],
        "questions": [],
    }


def review(*supported: tuple[int, bool]) -> dict[str, Any]:
    marks = [{"index": i, "supported": ok, "problem": ""} for i, ok in supported]
    return {"verdict": "accept", "reason": "checked", "sentences": marks, "missed_points": []}


def _app(schema: str, model: Model) -> Any:
    return create_app(
        lambda: EventStore.connect(URL, schema=schema, pool_size=4),
        [load_pack("echo")],
        model_for=lambda _store: model.current,
        poll_s=0.05,
    )


@pytest.fixture
def api(db_schema: str) -> Iterator[Api]:
    async def setup() -> dict[str, str]:
        async with open_store(db_schema, pool_size=1) as store:
            return {pid: await add_principal(store, pid, k, r) for pid, (k, r) in PRINCIPALS.items()}

    tokens = asyncio.run(setup())
    model = Model()
    with TestClient(_app(db_schema, model), base_url="http://localhost") as client:
        yield Api(client, db_schema, tokens, model)


# ── A2: authentication and roles ─────────────────────────────────────────────

SID = "00000000-0000-4000-8000-000000000000"
ROUTES = [
    ("GET", "/v1/me"),
    ("POST", "/v1/keys"),
    ("DELETE", "/v1/keys/" + "0" * 32),
    ("POST", "/v1/sessions"),
    ("GET", "/v1/sessions"),
    ("GET", f"/v1/sessions/{SID}/events"),
    ("POST", f"/v1/sessions/{SID}/messages"),
    ("POST", f"/v1/sessions/{SID}/proposals"),
    ("GET", f"/v1/decisions/{SID}"),
    ("POST", f"/v1/decisions/{SID}/execute"),
    ("GET", "/v1/inbox"),
    ("POST", f"/v1/decisions/{SID}/approve"),
    ("POST", f"/v1/decisions/{SID}/reject"),
    ("POST", f"/v1/answers/{SID}/rating"),
]


def test_every_route_but_health_needs_a_valid_token(api):
    api.run(lambda store: revoke_principal(store, "gone", "left"))
    assert api.client.get("/v1/health").status_code == 200
    bad = {
        "none": {},
        "garbage": {"Authorization": "Bearer nx_not-a-token"},
        "scheme": {"Authorization": f"Basic {api.tokens['operator']}"},
        "revoked": api.h("gone"),
    }
    for method, path in ROUTES:
        for name, headers in bad.items():
            resp = api.client.request(method, path, headers=headers)
            assert resp.status_code == 401, (method, path, name, resp.text)
            assert resp.json()["error"]["code"] == "UNAUTHENTICATED"
            assert resp.headers["www-authenticate"] == "Bearer"


def test_roles(api):
    assert api.call("operator", "GET", "/v1/inbox").status_code == 403
    assert api.call("alice", "POST", "/v1/sessions").status_code == 403
    assert api.call("alice", "POST", f"/v1/sessions/{SID}/proposals", echo()).status_code == 403
    sid = api.session()
    held = api.held(sid)["decision"]
    body = {"proposal_hash": held["proposal_hash"], "key_id": "0" * 32, "signature": "0" * 128}
    assert (
        api.call("operator", "POST", f"/v1/decisions/{held['decision_id']}/approve", body).status_code == 403
    )
    me = api.call("alice", "GET", "/v1/me").json()
    assert (me["id"], me["kind"], me["roles"]) == ("alice", "human", ["approver"])


def test_an_agent_cannot_hold_the_approver_role_or_register_a_key(api):
    async def bad(store: EventStore) -> None:
        await add_principal(store, "robot", "agent", ["approver"])

    with pytest.raises(ValueError, match="BAD_ROLE"):
        api.run(bad)
    resp = api.call("bot", "POST", "/v1/keys", {"public_key": Signer.generate().public_key})
    assert resp.status_code == 403, "only an approver registers a key, and only a human is one"


def test_tokens_are_stored_only_as_hashes_and_never_in_events(api):
    api.session()
    rows = api.run(lambda store: store.pool.fetch("SELECT principal_id, token_sha256 FROM principals"))
    stored = {r["principal_id"]: r["token_sha256"] for r in rows}
    assert stored == {pid: hash_token(tok) for pid, tok in api.tokens.items()}
    everything = json.dumps(api.events())
    for token in api.tokens.values():
        assert token not in everything and hash_token(token) not in everything
    assert all(t.startswith("nx_") and len(t) >= 40 for t in api.tokens.values())


# ── A3: the Host header ──────────────────────────────────────────────────────


def test_a_foreign_host_header_is_refused(api):
    resp = api.client.get("/v1/me", headers=api.h("operator") | {"host": "attacker.example"})
    assert resp.status_code == 400 and resp.json()["error"]["code"] == "BAD_HOST"
    assert api.client.get("/v1/me", headers=api.h("operator") | {"host": "127.0.0.1:8765"}).status_code == 200


# ── A4: two-session isolation ────────────────────────────────────────────────


def test_another_principal_cannot_see_or_touch_a_session(api):
    sid = api.session("operator")
    allowed = api.propose(sid, text="mine").json()["decision"]
    did = allowed["decision_id"]
    attempts = {
        "read": api.call("bob", "GET", f"/v1/sessions/{sid}/events"),
        "message": api.call(
            "bob", "POST", f"/v1/sessions/{sid}/messages", {"text": "Open it", "mode": "act"}
        ),
        "propose": api.call("bob", "POST", f"/v1/sessions/{sid}/proposals", echo()),
        "evidence": api.call("bob", "GET", f"/v1/decisions/{did}"),
        "execute": api.call("bob", "POST", f"/v1/decisions/{did}/execute"),
        "approver reads": api.call("alice", "GET", f"/v1/sessions/{sid}/events"),
        "approver evidence of an ALLOW": api.call("alice", "GET", f"/v1/decisions/{did}"),
    }
    for name, resp in attempts.items():
        assert resp.status_code == 404, (name, resp.text)
        assert resp.json()["error"]["code"] == "NOT_FOUND"
    assert api.call("bob", "GET", "/v1/sessions").json()["sessions"] == []
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        api.client.websocket_connect(f"ws://localhost/v1/sessions/{sid}/events") as ws,
    ):
        ws.send_text(json.dumps({"token": api.tokens["bob"], "after": 0}))
        ws.receive_text()
    assert exc.value.code == 4404
    # nothing bob tried reached the store
    assert [e["type"] for e in api.events(f"session/{sid}")] == ["session.opened", "decision.made"]
    assert api.call("operator", "POST", f"/v1/decisions/{did}/execute").status_code == 200


def test_an_answer_never_retrieves_another_sessions_memory(api):
    a, b = api.session("operator"), api.session("bob")

    async def remember(store: EventStore) -> None:
        memories = MemoryStore(store)
        actor = {"kind": "human", "id": "operator"}
        await memories.add("The vault code word is heliotrope.", "session", a, "msg/1", actor)
        await memories.add(
            "Operator's vault code word is heliotrope too.", "profile", "operator", "msg/2", actor
        )

    api.run(remember)
    question = {"text": "What is the vault code word?", "mode": "ask"}

    api.model.current = ScriptedModel(answer(("It is heliotrope.", ["m1"])), review((0, True)))
    resp = api.call("bob", "POST", f"/v1/sessions/{b}/messages", question).json()
    assert resp["route"] == "ask" and resp["answer"]["status"] == "abstained"
    assert all("heliotrope" not in json.dumps(c) for c in api.model.current.seen)

    api.model.current = model = ScriptedModel(answer(("It is heliotrope.", ["m1"])), review((0, True)))
    api.call("operator", "POST", f"/v1/sessions/{a}/messages", question)
    assert model.seen and "heliotrope" in model.seen[0]["prompt"], "the control: the owner does see it"


# ── A5: every action goes through the gate ───────────────────────────────────


def test_the_proposer_and_session_come_from_the_token_and_path(api):
    sid, other = api.session(), api.session("bob")
    cases = {
        "SESSION_MISMATCH": api.propose(sid, session_id=other),
        "PROPOSER_MISMATCH": api.propose(sid, proposer={"kind": "agent", "id": "planner"}),
        "INVALID": api.propose(sid, approvals=["alice"]),
    }
    for code, resp in cases.items():
        assert resp.status_code == 422 and resp.json()["error"]["code"] == code, resp.text
    ok = api.propose(sid, proposer={"kind": "human", "id": "operator"}, session_id=sid).json()
    assert ok["proposal"]["proposer"] == {"kind": "human", "id": "operator"}
    assert ok["proposal"]["session_id"] == sid and ok["decision"]["outcome"] == "ALLOW"
    assert ok["decision"]["proposal_hash"] == proposal_hash(ok["proposal"])


def test_an_agent_is_not_the_user(api):
    sid = api.session("bot")
    resp = api.propose(sid, "bot")
    assert resp.status_code == 422 and resp.json()["error"]["code"] == "NOT_USER"
    resp = api.call("bot", "POST", f"/v1/sessions/{sid}/messages", {"text": "Open the vent", "mode": "act"})
    assert resp.status_code == 403 and resp.json()["error"]["code"] == "NOT_USER"
    held = api.propose(sid, "bot", source="tool", ref="sensor/1").json()["decision"]
    assert held["outcome"] == "NEEDS_APPROVAL", "a tool-triggered agent proposal waits for a human"


def test_execute_runs_only_what_the_executor_allows(api):
    sid = api.session()
    denied = api.propose(sid, text="").json()["decision"]
    resp = api.call("operator", "POST", f"/v1/decisions/{denied['decision_id']}/execute")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "DENIED"
    assert resp.json()["execution"]["status"] == "refused"
    held = api.held(sid)["decision"]
    resp = api.call("operator", "POST", f"/v1/decisions/{held['decision_id']}/execute")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "NOT_APPROVED"
    allowed = api.propose(sid).json()["decision"]
    first = api.call("operator", "POST", f"/v1/decisions/{allowed['decision_id']}/execute").json()[
        "execution"
    ]
    again = api.call("operator", "POST", f"/v1/decisions/{allowed['decision_id']}/execute").json()[
        "execution"
    ]
    assert (first["status"], first["verification"], first["duplicate"]) == ("succeeded", "passed", False)
    assert again["duplicate"] and again["idempotency_key"] == first["idempotency_key"]


# ── A6: signed approvals ─────────────────────────────────────────────────────


def test_a_signed_approval_of_what_was_shown_approves(api):
    sid = api.session()
    held = api.held(sid)
    did, digest = held["decision"]["decision_id"], held["decision"]["proposal_hash"]
    signer = Signer.generate()
    api.register("alice", signer)

    [item] = api.call("alice", "GET", "/v1/inbox").json()["items"]
    assert item["decision_id"] == did and item["intact"] and not item["approved_by_you"]
    assert proposal_hash(item["evidence"]["proposal"]) == digest

    resp = api.approve("alice", did, digest, signer)
    assert resp.status_code == 201, resp.text
    assert resp.json()["approval"]["signature"]["key_id"] == signer.key_id
    execution = api.call("operator", "POST", f"/v1/decisions/{did}/execute").json()["execution"]
    assert execution["status"] == "succeeded"

    doc = api.call("operator", "GET", f"/v1/decisions/{did}").json()
    assert doc["intact"]
    [approval] = doc["evidence"]["approvals"]
    assert approval["signature"] == {
        "alg": "ed25519",
        "key_id": signer.key_id,
        "public_key": signer.public_key,
        "value": approval["signature"]["value"],
        "verified": True,
    }
    assert api.call("alice", "GET", "/v1/inbox").json()["items"] == []


def test_a_modified_proposal_is_refused_and_nothing_is_written(api):
    sid = api.session()
    held = api.held(sid)
    did = held["decision"]["decision_id"]
    signer = Signer.generate()
    api.register("alice", signer)
    before = api.events(f"session/{sid}")
    modified = dict(held["proposal"], params={"text": "cancel every order"})
    resp = api.approve("alice", did, proposal_hash(modified), signer)
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "HASH_MISMATCH"
    assert api.events(f"session/{sid}") == before


def test_bad_foreign_and_revoked_keys_are_refused(api):
    sid = api.session()
    held = api.held(sid)["decision"]
    did, digest = held["decision_id"], held["proposal_hash"]
    mine, carols, old = Signer.generate(), Signer.generate(), Signer.generate()
    api.register("alice", mine)
    api.register("carol", carols)
    old_kid = api.register("alice", old)
    assert api.call("alice", "DELETE", f"/v1/keys/{old_kid}").status_code == 204
    other = api.register("alice", Signer.generate())
    assert api.call("bob", "DELETE", f"/v1/keys/{other}").status_code == 404, "someone else's key"

    before = api.events(f"session/{sid}")
    wrong_message = mine.sign(approval_message(did, digest, {"kind": "human", "id": "carol"}))
    body = {"proposal_hash": digest, "key_id": mine.key_id, "signature": wrong_message}
    cases = {
        "BAD_SIGNATURE": api.call("alice", "POST", f"/v1/decisions/{did}/approve", body),
        "UNKNOWN_KEY (carol's)": api.approve("alice", did, digest, carols),
        "UNKNOWN_KEY (revoked)": api.approve("alice", did, digest, old),
        "UNKNOWN_KEY (never registered)": api.approve("alice", did, digest, Signer.generate()),
        "BAD_SIGNATURE (key id of mine, signed by another)": api.approve(
            "alice", did, digest, Signer.generate(), kid=mine.key_id
        ),
    }
    for name, resp in cases.items():
        assert resp.status_code == 409, (name, resp.text)
        assert resp.json()["error"]["code"] == name.split(" ")[0], name
    assert api.events(f"session/{sid}") == before
    assert api.approve("alice", did, digest, mine).status_code == 201


def test_a_stored_signature_that_does_not_verify_does_not_count(api):
    sid = api.session()
    held = api.held(sid)["decision"]
    did, digest = held["decision_id"], held["proposal_hash"]
    signer = Signer.generate()
    api.register("alice", signer)
    forged = signer.sign_approval(did, "b" * 64, {"kind": "human", "id": "alice"})

    async def write(store: EventStore) -> None:
        async with store.transaction() as conn:
            ref = await find_decision(conn, did)
            payload = {
                "decision_id": did,
                "proposal_hash": digest,
                "approver": {"kind": "human", "id": "alice"},
                "approved_at": "2026-10-31T10:00:00Z",
                "signature": forged,
            }
            await store.append_in(conn, ref.stream, APPROVAL_GRANTED, payload, payload["approver"])

    api.run(write)
    resp = api.call("operator", "POST", f"/v1/decisions/{did}/execute")
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "NOT_APPROVED"


def test_the_proposer_cannot_approve_their_own_proposal(api):
    sid = api.session("gone")  # a principal with both roles
    held = api.held(sid, "gone")
    did, digest = held["decision"]["decision_id"], held["decision"]["proposal_hash"]
    signer = Signer.generate()
    api.register("gone", signer)
    [item] = api.call("gone", "GET", "/v1/inbox").json()["items"]
    assert item["proposed_by_you"]
    resp = api.approve("gone", did, digest, signer)
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "PROPOSER"


# ── A7: one entry point ──────────────────────────────────────────────────────


def test_ask_acts_on_nothing(api):
    sid = api.session()
    resp = api.call("operator", "POST", f"/v1/sessions/{sid}/messages", {"text": "Can you tell me the time?"})
    body = resp.json()
    assert resp.status_code == 200 and body["route"] == "ask" and body["executed"] is False
    assert "answer" in body and "plan" not in body
    assert {e["type"] for e in api.events(f"session/{sid}")} <= {
        "session.opened",
        "answer.abstained",
        "answer.given",
    }
    assert api.run(lambda store: store.pool.fetchval("SELECT count(*) FROM executions")) == 0


def test_act_proposes_through_the_gate_and_executes_nothing(api):
    sid = api.session()
    api.model.current = model = ScriptedModel(
        plan(step("s1", SAY, {"text": "from the planner"})), accept("s1")
    )
    resp = api.call(
        "operator", "POST", f"/v1/sessions/{sid}/messages", {"text": "Say hello from the planner"}
    )
    body = resp.json()
    assert resp.status_code == 200 and body["route"] == "act" and body["executed"] is False, body
    [only] = body["plan"]["steps"]
    assert only["outcome"] == "ALLOW" and re.fullmatch(r"[0-9a-f]{64}", only["proposal_hash"])
    assert all(c.get("max_cost_usd", 0) == 0 for c in model.seen) and all(
        c.get("private") for c in model.seen
    )
    assert api.run(lambda store: store.pool.fetchval("SELECT count(*) FROM executions")) == 0
    did = only["decision_id"]
    assert (
        api.call("operator", "POST", f"/v1/decisions/{did}/execute").json()["execution"]["status"]
        == "succeeded"
    )


def test_cloud_is_opt_in(api):
    sid = api.session()
    api.model.current = model = ScriptedModel(plan(step("s1", SAY, {"text": "x"})), accept("s1"))
    api.call("operator", "POST", f"/v1/sessions/{sid}/messages", {"text": "Say x", "cloud": True})
    assert model.seen and not model.seen[0]["private"]


# ── A8: the WebSocket ────────────────────────────────────────────────────────


def test_the_owner_streams_events_in_order_then_live(api):
    sid = api.session()
    api.propose(sid, text="one")
    url = f"ws://localhost/v1/sessions/{sid}/events"
    with api.client.websocket_connect(url) as ws:
        ws.send_text(json.dumps({"token": api.tokens["operator"], "after": 0}))
        first = [json.loads(ws.receive_text()) for _ in range(2)]
        assert [(e["seq"], e["type"]) for e in first] == [(1, "session.opened"), (2, "decision.made")]
        api.propose(sid, text="two")
        live = json.loads(ws.receive_text())
        assert (live["seq"], live["type"]) == (3, "decision.made")
        assert live["payload"]["proposal"]["params"] == {"text": "two"}
        hang_up(ws)
    with api.client.websocket_connect(url) as ws:
        ws.send_text(json.dumps({"token": api.tokens["operator"], "after": 2}))
        assert json.loads(ws.receive_text())["seq"] == 3
        hang_up(ws)


def hang_up(ws: Any) -> None:
    """Close from the client and let the handler see it: on leaving the `with`, the test client
    cancels a handler that is still running, which it reports as an error."""
    ws.close(1000)
    time.sleep(0.3)


@pytest.mark.parametrize("first", [{"after": 0}, {"token": "nx_wrong", "after": 0}, "not json", "[1]"])
def test_the_websocket_needs_a_token_first(api, first):
    sid = api.session()
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        api.client.websocket_connect(f"ws://localhost/v1/sessions/{sid}/events") as ws,
    ):
        ws.send_text(first if isinstance(first, str) else json.dumps(first))
        ws.receive_text()
    assert exc.value.code == 4401


# ── the inbox page is served ─────────────────────────────────────────────────


def test_the_inbox_is_served_with_its_csp(api):
    page = api.client.get("/inbox/")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    assert "script-src 'self'" in page.headers["content-security-policy"]
    for name in ("inbox.js", "jcs.js", "inbox.css"):
        assert api.client.get(f"/inbox/{name}").status_code == 200
    assert api.client.get("/inbox/../app.py").status_code == 404
    assert api.client.get("/inbox/secrets.txt").status_code == 404


# ── the CLI ──────────────────────────────────────────────────────────────────


def test_cli_principals_keys_and_a_signed_approval(api, tmp_path, monkeypatch, capsys):
    assert main(["principal", "add", "dave", "--kind", "human", "--role", "approver"]) == 0
    out, err = capsys.readouterr()
    token = out.strip()
    assert token.startswith("nx_") and "not be shown again" in err
    assert api.client.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).json()["id"] == "dave"
    assert main(["principal", "add", "dave", "--kind", "human", "--role", "approver"]) == 1
    assert main(["principal", "add", "r2", "--kind", "agent", "--role", "approver"]) == 1
    capsys.readouterr()

    key = tmp_path / "dave.pem"
    assert main(["key", "generate", str(key)]) == 0
    assert oct(key.stat().st_mode & 0o777) == "0o600"
    assert main(["key", "generate", str(key)]) != 0, "never overwrites"
    monkeypatch.setenv("NEXUS_ACTOR", "dave")
    assert main(["key", "register", str(key)]) == 0
    capsys.readouterr()

    held = api.held(api.session())["decision"]
    assert (
        main(["approve", held["decision_id"], "--proposal-hash", held["proposal_hash"], "--key", str(key)])
        == 0
    )
    assert "signed with key" in capsys.readouterr().out
    doc = api.call("operator", "GET", f"/v1/decisions/{held['decision_id']}").json()
    assert doc["evidence"]["approvals"][0]["signature"]["verified"] is True

    assert main(["principal", "list"]) == 0
    listing = capsys.readouterr().out
    assert "dave" in listing and token not in listing
    assert main(["principal", "revoke", "dave", "--reason", "test"]) == 0
    assert api.client.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# ── A9: the TypeScript SDK against a running server ──────────────────────────


def _node() -> str | None:
    node = shutil.which("node")
    if not node:
        return None
    version = subprocess.run([node, "--version"], capture_output=True, text=True, check=False).stdout
    major, minor = (int(x) for x in re.findall(r"\d+", version)[:2])
    return node if (major, minor) >= (22, 6) else None


def test_the_typescript_sdk_approves_on_a_running_server(db_schema):
    node = _node()
    if node is None:
        pytest.skip("needs Node >= 22.6")

    async def setup() -> str:
        async with open_store(db_schema, pool_size=1) as store:
            return await add_principal(store, "tsalice", "human", ["approver"])

    alice = asyncio.run(setup())
    model = Model()
    server = uvicorn.Server(
        uvicorn.Config(_app(db_schema, model), host="127.0.0.1", port=0, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 15
        while not server.started:
            assert thread.is_alive() and time.monotonic() < deadline, "the server did not start"
            time.sleep(0.05)
        port = server.servers[0].sockets[0].getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        with TestClient(_app(db_schema, model), base_url="http://localhost") as client:
            h = {"Authorization": f"Bearer {asyncio.run(_operator(db_schema))}"}
            sid = client.post("/v1/sessions", headers=h).json()["session_id"]
            held = client.post(
                f"/v1/sessions/{sid}/proposals", headers=h, json=echo("from ts", "doc", "corpus/x.md")
            ).json()["decision"]
        env = os.environ | {
            "NEXUS_E2E_URL": base,
            "NEXUS_E2E_TOKEN": alice,
            "NEXUS_E2E_DECISION": held["decision_id"],
        }
        script = ROOT / "sdk" / "ts" / "test" / "e2e.ts"
        done = subprocess.run(
            [node, str(script)], capture_output=True, text=True, env=env, timeout=60, check=False
        )
        assert done.returncode == 0, done.stderr
        result = json.loads(done.stdout.strip().splitlines()[-1])
        assert result["approved"] == held["decision_id"]
    finally:
        server.should_exit = True
        thread.join(timeout=10)

    async def verified() -> list[dict[str, Any]]:
        from nexus.evidence import build_evidence

        async with open_store(db_schema, pool_size=1) as store:
            return (await build_evidence(store, held["decision_id"])).pack["approvals"]

    [approval] = asyncio.run(verified())
    assert approval["approver"]["id"] == "tsalice" and approval["signature"]["verified"] is True


async def _operator(schema: str) -> str:
    async with open_store(schema, pool_size=1) as store:
        return await add_principal(store, "tsoperator", "human", ["requester"])


# ── P8.1: ratings and clarifying questions ───────────────────────────────────


def test_only_the_human_who_owns_the_session_rates_an_answer(api):
    sid = api.session()

    async def remember(store: EventStore) -> None:
        actor = {"kind": "human", "id": "operator"}
        await MemoryStore(store).add("The vault code word is heliotrope.", "session", sid, "msg/1", actor)

    api.run(remember)
    api.model.current = ScriptedModel(answer(("It is heliotrope.", ["m1"])), review((1, True)))
    resp = api.call("operator", "POST", f"/v1/sessions/{sid}/messages", {"text": "What is the code word?"})
    given = resp.json()["answer"]
    assert given["status"] == "answered", given
    path = f"/v1/answers/{given['answer_id']}/rating"
    assert api.call("bot", "POST", path, {"rating": "up"}).status_code == 403
    assert api.call("alice", "POST", path, {"rating": "up"}).status_code == 403
    assert api.call("bob", "POST", path, {"rating": "up"}).status_code == 404  # not bob's session
    assert api.call("operator", "POST", f"/v1/answers/{SID}/rating", {"rating": "up"}).status_code == 404
    assert api.call("operator", "POST", "/v1/answers/nope/rating", {"rating": "up"}).status_code == 404
    assert api.call("operator", "POST", path, {"rating": "meh"}).status_code == 422
    assert api.call("operator", "POST", path, {"rating": "up", "note": "x" * 501}).status_code == 422
    ok = api.call("operator", "POST", path, {"rating": "up", "note": "short and right"})
    assert ok.status_code == 201 and ok.json() == {
        "answer_id": given["answer_id"],
        "rating": "up",
        "example": "added",
    }
    rated = [e for e in api.events(f"session/{sid}") if e["type"] == "answer.rated"]
    assert json.loads(rated[0]["actor"]) == {"kind": "human", "id": "operator"}
    assert api.call("operator", "POST", path, {"rating": "down"}).json()["example"] == "retired"


def test_a_clarifying_question_is_answered_by_the_next_message(api):
    sid, other = api.session(), api.session("bob")

    async def remember(store: EventStore) -> None:
        actor = {"kind": "human", "id": "operator"}
        await MemoryStore(store).add("Zone 2 lights stay dimmed at night.", "session", sid, "msg/1", actor)

    api.run(remember)
    ask = answer() | {"decision": "clarify", "reason": "which zone", "points": [], "sentences": []}
    ask["questions"] = ["Which zone do you mean?"]
    api.model.current = model = ScriptedModel(ask, answer(("They stay dimmed.", ["m1"])), review((1, True)))
    msgs = f"/v1/sessions/{sid}/messages"
    first = api.call("operator", "POST", msgs, {"text": "What happens to the zone lights at night?"}).json()
    assert first["answer"]["status"] == "clarify" and first["answer"]["questions"] == [
        "Which zone do you mean?"
    ]
    cid = first["answer"]["answer_id"]
    # A reply that reads like a command is still a reply: it is answered, never planned.
    second = api.call(
        "operator", "POST", msgs, {"text": "Set zone 2", "mode": "act", "clarifies": cid}
    ).json()
    assert second["route"] == "ask" and second["answer"]["status"] == "answered", second
    assert "Clarification: Set zone 2" in model.seen[1]["prompt"]
    assert api.call("operator", "POST", msgs, {"text": "2", "clarifies": SID}).status_code == 404
    assert api.call("operator", "POST", msgs, {"text": "2", "clarifies": "zone"}).status_code == 422
    elsewhere = api.call("bob", "POST", f"/v1/sessions/{other}/messages", {"text": "2", "clarifies": cid})
    assert elsewhere.status_code == 404
