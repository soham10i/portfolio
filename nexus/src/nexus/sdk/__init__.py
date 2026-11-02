"""A Python client for the NEXUS API (P8.md §2.6): the standard library's urllib plus the signer.

    from nexus.sdk import Client, Signer, proposal_hash
    alice = Client("http://127.0.0.1:8765", token)
    for item in alice.inbox():
        proposal = item["evidence"]["proposal"]
        alice.approve(item["decision_id"], proposal, signer)  # hashes what it was shown

`approve` never sends the server's hash back: it hashes the proposal it was given, so approving a
proposal other than the one decided fails with HASH_MISMATCH."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Mapping
from typing import Any

from ..gate.gate import proposal_hash
from ..signing import Signer, approval_message


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, body: Mapping[str, Any]) -> None:
        super().__init__(f"{status} {code}: {message}")
        self.status, self.code, self.message, self.body = status, code, message, dict(body)


class Client:
    def __init__(self, base_url: str, token: str, *, timeout: float = 60.0) -> None:
        parsed = urllib.parse.urlsplit(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("base_url must be an http(s) URL")
        self.base_url = base_url.rstrip("/")
        self._token = token
        self.timeout = timeout

    def request(self, method: str, path: str, body: Any = None) -> Any:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(  # noqa: S310 (scheme checked in __init__)
            self.base_url + path, data=data, method=method
        )
        req.add_header("Authorization", f"Bearer {self._token}")
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                doc = json.loads(raw)
            except ValueError:
                doc = {}
            err = doc.get("error") or {}
            raise ApiError(exc.code, err.get("code", "HTTP_ERROR"), err.get("message", ""), doc) from None
        return json.loads(raw) if raw else None

    # identity and keys
    def me(self) -> dict[str, Any]:
        return self.request("GET", "/v1/me")

    def register_key(self, signer: Signer) -> str:
        return self.request("POST", "/v1/keys", {"public_key": signer.public_key})["key_id"]

    def revoke_key(self, key_id: str) -> None:
        self.request("DELETE", f"/v1/keys/{_seg(key_id)}")

    # sessions and the entry point
    def open_session(self) -> str:
        return self.request("POST", "/v1/sessions")["session_id"]

    def sessions(self) -> list[dict[str, Any]]:
        return self.request("GET", "/v1/sessions")["sessions"]

    def send(
        self,
        session_id: str,
        text: str,
        mode: str = "auto",
        *,
        cloud: bool = False,
        clarifies: str | None = None,
    ) -> dict[str, Any]:
        """`clarifies`: the answer id of a clarifying question; `text` is the reply to it."""
        body: dict[str, Any] = {"text": text, "mode": mode, "cloud": cloud}
        if clarifies is not None:
            body["clarifies"] = clarifies
        return self.request("POST", f"/v1/sessions/{_seg(session_id)}/messages", body)

    def propose(self, session_id: str, proposal: Mapping[str, Any]) -> dict[str, Any]:
        return self.request("POST", f"/v1/sessions/{_seg(session_id)}/proposals", dict(proposal))

    def events(self, session_id: str, after: int = 0) -> list[dict[str, Any]]:
        return self.request("GET", f"/v1/sessions/{_seg(session_id)}/events?after={int(after)}")["events"]

    # decisions
    def evidence(self, decision_id: str) -> dict[str, Any]:
        return self.request("GET", f"/v1/decisions/{_seg(decision_id)}")

    def execute(self, decision_id: str) -> dict[str, Any]:
        return self.request("POST", f"/v1/decisions/{_seg(decision_id)}/execute")["execution"]

    def inbox(self) -> list[dict[str, Any]]:
        return self.request("GET", "/v1/inbox")["items"]

    def approve(
        self, decision_id: str, proposal: Mapping[str, Any], signer: Signer, *, approver: str | None = None
    ) -> dict[str, Any]:
        """Hash the proposal shown, sign that hash, send it. The approver id defaults to /v1/me."""
        digest = proposal_hash(proposal)
        who = {"kind": "human", "id": approver or self.me()["id"]}
        value = signer.sign(approval_message(decision_id, digest, who))
        body = {"proposal_hash": digest, "key_id": signer.key_id, "signature": value}
        return self.request("POST", f"/v1/decisions/{_seg(decision_id)}/approve", body)

    def reject(self, decision_id: str, reason: str) -> dict[str, Any]:
        return self.request("POST", f"/v1/decisions/{_seg(decision_id)}/reject", {"reason": reason})

    def rate(self, answer_id: str, rating: str, note: str = "") -> dict[str, Any]:
        """Rate a given answer `up` or `down`; answers rated up become style examples."""
        body = {"rating": rating, "note": note}
        return self.request("POST", f"/v1/answers/{_seg(answer_id)}/rating", body)


def _seg(value: str) -> str:
    return urllib.parse.quote(str(value), safe="")


__all__ = ["ApiError", "Client", "Signer", "approval_message", "proposal_hash"]
