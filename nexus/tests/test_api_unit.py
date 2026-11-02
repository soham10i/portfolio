"""P8 checks that need no database: routing (A7), loopback (A3), signing (A6), the SDK vectors
(A9) and the inbox's static files (A10)."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route, WebSocketRoute
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from nexus.api import check_loopback, route
from nexus.api.app import API_CSP, INBOX_CSP, LoopbackGuard
from nexus.signing import Signer, approval_message, key_id, signature_ok, valid_public_key, verify

from .support import ROOT

STATIC = ROOT / "src" / "nexus" / "api" / "static"

# ── A7: the one entry point ──────────────────────────────────────────────────

ROUTES = [
    # questions
    ("What is the greenhouse temperature?", "ask"),
    ("what is the safe range for zone 1", "ask"),
    ("Which vent is open?", "ask"),
    ("Who approved the last change?", "ask"),
    ("When did the heater last run?", "ask"),
    ("Where is the humidity sensor", "ask"),
    ("Why was my request held?", "ask"),
    ("How warm is zone 2", "ask"),
    ("Is the vent open", "ask"),
    ("Are the lights on?", "ask"),
    ("Did the watering run today", "ask"),
    ("Should I open the vent?", "ask"),
    ("the lights are on?", "ask"),
    ("Can you tell me the temperature?", "ask"),
    ("Could you show me the last plan", "ask"),
    ("please explain the safe range", "ask"),
    ("Explain the safe range", "ask"),
    ("Summarize today's events", "ask"),
    ("Would you let me know when zone 1 was watered?", "ask"),
    ("", "ask"),
    ("   ", "ask"),
    # requests
    ("Open the vent to 30%", "act"),
    ("set zone 1 to 22 degrees", "act"),
    ("Turn the lights off.", "act"),
    ("water zone 2 for five minutes", "act"),
    ("Please open the vent", "act"),
    ("Could you open the vent?", "act"),
    ("Can you set the lights to 40%?", "act"),
    ("Would you mind watering zone 2?", "act"),
    ("I'd like you to boost the heater", "act"),
]


def test_the_route_table_has_thirty_cases():
    assert len(ROUTES) == 30


@pytest.mark.parametrize(("text", "expected"), ROUTES)
def test_route(text, expected):
    assert route(text) == expected


def test_an_explicit_mode_wins_and_an_unknown_one_is_refused():
    assert route("What is the temperature?", "act") == "act"
    assert route("Open the vent", "ask") == "ask"
    with pytest.raises(ValueError, match="mode"):
        route("Open the vent", "run")


# ── A3: loopback only ────────────────────────────────────────────────────────


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost", "::1", "127.0.0.2"])
def test_loopback_hosts_are_accepted(host):
    assert check_loopback(host)


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "192.168.1.10", "10.0.0.1", "example.com", ""])  # noqa: S104
def test_other_hosts_are_refused(host):
    with pytest.raises(ValueError):
        check_loopback(host)


def _guarded() -> TestClient:
    async def page(_):
        return PlainTextResponse("ok")

    async def ws(socket):
        await socket.accept()
        await socket.send_text("hi")
        await socket.close()

    app = Starlette(routes=[Route("/v1/x", page), Route("/inbox/", page), WebSocketRoute("/ws", ws)])
    return TestClient(LoopbackGuard(app), base_url="http://localhost")


@pytest.mark.parametrize("host", ["localhost", "localhost:8765", "127.0.0.1:1", "[::1]:8765"])
def test_the_guard_answers_loopback_host_headers(host):
    resp = _guarded().get("/v1/x", headers={"host": host})
    assert resp.status_code == 200


@pytest.mark.parametrize("host", ["evil.example", "localhost.evil.example", "127.0.0.1.nip.io", "10.0.0.1"])
def test_the_guard_refuses_a_foreign_host_header(host):
    resp = _guarded().get("/v1/x", headers={"host": host})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BAD_HOST"


def test_the_guard_refuses_a_foreign_websocket_handshake():
    client = _guarded()
    with client.websocket_connect("ws://localhost/ws") as socket:
        assert socket.receive_text() == "hi"
    with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect("ws://evil.example/ws"):
        pass
    assert exc.value.code == 4400


def test_security_headers_and_the_inbox_csp():
    client = _guarded()
    api, page = client.get("/v1/x"), client.get("/inbox/")
    for resp in (api, page):
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["referrer-policy"] == "no-referrer"
        assert resp.headers["cache-control"] == "no-store"
        assert "access-control-allow-origin" not in resp.headers
    assert api.headers["content-security-policy"] == API_CSP
    assert page.headers["content-security-policy"] == INBOX_CSP
    assert "'unsafe-inline'" not in INBOX_CSP and "'unsafe-eval'" not in INBOX_CSP
    assert "script-src 'self'" in INBOX_CSP and "frame-ancestors 'none'" in INBOX_CSP


# ── A6: signatures ───────────────────────────────────────────────────────────

APPROVER = {"kind": "human", "id": "alice"}
DECISION = "9f0e2d4c-0000-4000-8000-000000000001"
HASH = "a" * 64


def test_a_signature_round_trips_and_a_tampered_message_fails():
    signer = Signer.from_seed(hashlib.sha256(b"unit").digest())
    message = approval_message(DECISION, HASH, APPROVER)
    sig = signer.sign(message)
    assert verify(signer.public_key, sig, message)
    assert not verify(signer.public_key, sig, approval_message(DECISION, "b" * 64, APPROVER))
    bob = {"kind": "human", "id": "bob"}
    assert not verify(signer.public_key, sig, approval_message(DECISION, HASH, bob))
    flipped = ("0" if sig[0] != "0" else "1") + sig[1:]
    assert not verify(signer.public_key, flipped, message)
    assert not verify(signer.public_key, "zz", message)


def test_the_approval_message_is_canonical_json_with_a_version():
    message = approval_message(DECISION, HASH, APPROVER)
    doc = json.loads(message)
    assert doc == {
        "v": "nexus.approval/1",
        "decision_id": DECISION,
        "proposal_hash": HASH,
        "approver": APPROVER,
    }
    assert message == json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()


def test_signature_ok_checks_alg_key_id_and_value():
    signer = Signer.from_seed(hashlib.sha256(b"unit").digest())
    block = signer.sign_approval(DECISION, HASH, APPROVER)
    assert block["key_id"] == key_id(signer.public_key) == signer.key_id
    assert signature_ok(block, DECISION, HASH, APPROVER)
    assert not signature_ok(block | {"alg": "rsa"}, DECISION, HASH, APPROVER)
    assert not signature_ok(block | {"key_id": "0" * 32}, DECISION, HASH, APPROVER)
    other = Signer.generate()
    assert not signature_ok(block | {"public_key": other.public_key}, DECISION, HASH, APPROVER)
    assert not signature_ok(block, DECISION, "b" * 64, APPROVER)
    assert not signature_ok(block, DECISION, HASH, {"kind": "human", "id": "bob"})


def test_public_keys_are_checked():
    assert valid_public_key(Signer.generate().public_key)
    for bad in ["", "ab", "A" * 64, "g" * 64, "0" * 62, 12]:
        assert not valid_public_key(bad)


def test_a_key_survives_pem(tmp_path: Path):
    signer = Signer.generate()
    again = Signer.from_pem(signer.to_pem())
    assert again.public_key == signer.public_key
    assert verify(signer.public_key, again.sign(b"x"), b"x")


# ── A9: the vectors the TypeScript SDK and the inbox are tested against ─────


def test_the_vectors_file_is_what_python_generates():
    script = ROOT / "scripts" / "make_sdk_vectors.py"
    spec = importlib.util.spec_from_file_location("make_sdk_vectors", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (ROOT / "sdk" / "vectors.json").read_text() == module.render(), "run `make vectors`"


def test_the_vector_signature_verifies_in_python():
    a = json.loads((ROOT / "sdk" / "vectors.json").read_text())["approval"]
    assert approval_message(a["decision_id"], a["proposal_hash"], a["approver"]).decode() == a["message"]
    assert verify(a["key"]["public_key"], a["signature"], a["message"].encode())


# ── A10: the inbox's static files ────────────────────────────────────────────

UNSAFE_DOM = re.compile(r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function")


@pytest.mark.parametrize("name", ["inbox.js", "jcs.js", "inbox.html"])
def test_the_inbox_never_parses_server_text_as_html(name):
    text = (STATIC / name).read_text()
    assert not UNSAFE_DOM.search(text)


def test_the_inbox_page_has_no_inline_script_or_style():
    html = (STATIC / "inbox.html").read_text()
    assert not re.search(r"<script(?![^>]*\bsrc=)", html)
    assert "<style" not in html and " style=" not in html and re.search(r"\son\w+=", html) is None


def test_the_inbox_key_is_non_extractable():
    js = (STATIC / "inbox.js").read_text()
    assert 'generateKey({ name: "Ed25519" }, false' in js
