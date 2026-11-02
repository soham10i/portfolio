"""The HTTP API (P8.md §2.5): sessions, one entry point, the gate, execution, the approvals inbox.

Identity comes from the bearer token, never from the body. Every action reaches a binding only
through `Executor.run(decision_id)`, which runs only what the gate decided (and, for
NEEDS_APPROVAL, what was approved). The server is meant for loopback: it refuses any `Host` header
but localhost, sets no CORS headers and uses no cookies."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping, Sequence
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from importlib import resources
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from .. import __version__
from ..evidence import build_evidence
from ..exec import ApprovalError, Executor, approve, reject
from ..exec.approvals import find_decision
from ..gate import Gate, Policy
from ..gate.evaluate import NEEDS_APPROVAL
from ..gate.packs import LoadedPack
from ..knowledge import Answerer, AssetGraph, KnowledgeIndex, MemoryStore, RatingError, Ratings
from ..plan import Planner
from ..plan.planner import Model
from ..store import EventStore, utc_timestamp
from . import auth
from .auth import APPROVER, REQUESTER, Principal
from .routing import ACT, MODES, route

LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]"})
_HOST = re.compile(r"^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$")
_COMMON_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"cache-control", b"no-store"),
    (b"x-frame-options", b"DENY"),
]
INBOX_CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
API_CSP = "default-src 'none'; frame-ancestors 'none'"
INBOX_LIMIT = 50
WS_AUTH_TIMEOUT_S = 5.0


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.status, self.code, self.message, self.extra = status, code, message, extra


def _error(status: int, code: str, message: str, **extra: Any) -> JSONResponse:
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return JSONResponse({"error": {"code": code, "message": message}} | extra, status, headers=headers)


class LoopbackGuard:
    """Refuse a foreign Host header (DNS rebinding) and set the security headers on every
    response. Pure ASGI, so it covers WebSocket handshakes too."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        host = dict(scope.get("headers") or ()).get(b"host", b"").decode("latin-1")
        if not _HOST.match(host):
            if scope["type"] == "websocket":
                return await send({"type": "websocket.close", "code": 4400})
            response = _error(400, "BAD_HOST", "this server only answers to localhost")
            return await response(scope, receive, send)
        csp = (INBOX_CSP if scope["path"].startswith("/inbox") else API_CSP).encode()

        async def send_with_headers(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), *_COMMON_HEADERS]
                message["headers"].append((b"content-security-policy", csp))
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ── request bodies ───────────────────────────────────────────────────────────


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class KeyIn(Body):
    public_key: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class MessageIn(Body):
    text: Annotated[str, Field(min_length=1, max_length=4000)]
    mode: Literal["auto", "ask", "act"] = "auto"
    cloud: bool = False
    # The answer id of a clarifying question in this session; the text is the reply to it.
    clarifies: Annotated[
        str | None, Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    ] = None


class ContextIn(Body):
    source: str
    ref: Annotated[str, Field(max_length=512)]
    triggered: bool = False


class ProposalIn(Body):
    action: Annotated[str, Field(max_length=200)]
    params: dict[str, Any]
    rationale: Annotated[str, Field(max_length=4000)] = ""
    context: Annotated[list[ContextIn], Field(max_length=32)] = []
    proposal_id: str | None = None
    created_at: str | None = None
    # Accepted only to refuse a mismatch: the server sets both.
    proposer: dict[str, Any] | None = None
    session_id: str | None = None


class ApproveIn(Body):
    proposal_hash: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    key_id: Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
    signature: Annotated[str, Field(pattern=r"^[0-9a-f]{128}$")]


class RejectIn(Body):
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class RatingIn(Body):
    rating: Literal["up", "down"]
    note: Annotated[str, Field(max_length=500)] = ""


# ── the kernel the routes share ──────────────────────────────────────────────


@dataclass
class Kernel:
    store: EventStore
    packs: list[LoadedPack]
    gate: Gate
    executor: Executor
    model_for: Callable[[EventStore], Model]
    poll_s: float

    def answerer(self, principal: Principal, cloud: bool) -> Answerer:
        return Answerer(
            self.store,
            self.model_for(self.store),
            KnowledgeIndex(self.store),
            MemoryStore(self.store),
            AssetGraph.from_packs(self.packs),
            {p.id: p for p in self.packs},
            private=not cloud,
            corpora=[p.id for p in self.packs],
            user=principal.id,
        )

    def planner(self, cloud: bool) -> Planner:
        return Planner(self.store, self.gate, self.model_for(self.store), private=not cloud)


def _default_model(store: EventStore) -> Model:
    from ..llm import Router, load_config

    return Router(store, load_config())


def kernel(request: Request) -> Kernel:
    return request.app.state.kernel


async def principal(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    found = None
    if scheme.lower() == "bearer":
        found = await auth.authenticate(kernel(request).store, token.strip())
    if found is None:
        raise ApiError(401, "UNAUTHENTICATED", "a valid bearer token is required")
    return found


# Module level: with postponed annotations FastAPI resolves these names from the globals.
Who = Annotated[Principal, Depends(principal)]
K = Annotated[Kernel, Depends(kernel)]


def create_app(
    connect: Callable[[], Awaitable[EventStore]],
    packs: Sequence[LoadedPack],
    *,
    bindings: Mapping[str, Any] | None = None,
    policy: Policy | None = None,
    model_for: Callable[[EventStore], Model] | None = None,
    poll_s: float = 0.25,
) -> FastAPI:
    """The app. `connect` opens the store inside the server's event loop; `model_for` builds the
    model for a request (the router by default; tests pass fakes)."""
    from ..packs import load_binding

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        store = await connect()
        gate = Gate(store, list(packs), policy or Policy())
        binds = dict(bindings) if bindings is not None else {p.id: load_binding(p) for p in packs}
        app.state.kernel = Kernel(
            store, list(packs), gate, Executor(store, gate, binds), model_for or _default_model, poll_s
        )
        try:
            yield
        finally:
            await store.close()

    app = FastAPI(
        title="NEXUS", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
    )
    app.add_middleware(LoopbackGuard)

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _error(exc.status, exc.code, exc.message, **exc.extra)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", ()))
        return _error(422, "INVALID", f"{where}: {first.get('msg', 'invalid request')}"[:500])

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return _error(exc.status_code, code, str(exc.detail))

    def need(p: Principal, role: str) -> None:
        if not p.has(role):
            raise ApiError(403, "FORBIDDEN", f"this needs the {role} role")

    async def own_session(k: Kernel, p: Principal, session_id: str) -> str:
        if await auth.session_owner(k.store, session_id) != p.id:
            raise ApiError(404, "NOT_FOUND", "no such session")  # someone else's looks the same
        return str(uuid.UUID(session_id))

    async def decision_for(k: Kernel, p: Principal, decision_id: str, *, owner_only: bool) -> Any:
        """The decision, if the caller owns its session, or (for reading and approving) holds the
        approver role and the decision needs approval. Anything else is 404."""
        async with k.store.pool.acquire() as conn:
            ref = await find_decision(conn, decision_id)
        if ref is not None:
            owner = await auth.session_owner(k.store, str(ref.proposal.get("session_id")))
            if owner == p.id:
                return ref
            if not owner_only and p.has(APPROVER) and ref.decision["outcome"] == NEEDS_APPROVAL:
                return ref
        raise ApiError(404, "NOT_FOUND", "no such decision")

    # ── identity ──

    @app.get("/v1/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "version": __version__}

    @app.get("/v1/me")
    async def me(p: Who, k: K) -> dict[str, Any]:
        keys = await auth.keys_of(k.store, p.id)
        return {"id": p.id, "kind": p.kind, "roles": sorted(p.roles), "keys": keys}

    @app.post("/v1/keys", status_code=201)
    async def add_key(body: KeyIn, p: Who, k: K) -> dict[str, Any]:
        try:
            kid = await auth.register_key(k.store, p, body.public_key)
        except auth.AuthError as exc:
            status = {"NOT_HUMAN": 403, "KEY_EXISTS": 409}.get(exc.code, 422)
            raise ApiError(status, exc.code, str(exc)) from exc
        return {"key_id": kid}

    @app.delete("/v1/keys/{key_id}", status_code=204)
    async def drop_key(key_id: str, p: Who, k: K) -> Response:
        try:
            await auth.revoke_key(k.store, p, key_id)
        except auth.AuthError as exc:
            raise ApiError(404, "NOT_FOUND", "no such key") from exc
        return Response(status_code=204)

    # ── sessions ──

    @app.post("/v1/sessions", status_code=201)
    async def new_session(p: Who, k: K) -> dict[str, Any]:
        need(p, REQUESTER)
        return {"session_id": await auth.open_session(k.store, p)}

    @app.get("/v1/sessions")
    async def my_sessions(p: Who, k: K) -> dict[str, Any]:
        return {"sessions": await auth.sessions_of(k.store, p)}

    @app.get("/v1/sessions/{session_id}/events")
    async def events(session_id: str, p: Who, k: K, after: int = 0) -> dict[str, Any]:
        sid = await own_session(k, p, session_id)
        return {"events": await k.store.read(f"session/{sid}", max(after, 0))}

    @app.post("/v1/sessions/{session_id}/messages")
    async def message(session_id: str, body: MessageIn, p: Who, k: K) -> dict[str, Any]:
        """The one entry point: answer a question, or plan a request through the gate."""
        need(p, REQUESTER)
        sid = await own_session(k, p, session_id)
        chosen = "ask" if body.clarifies else route(body.text, body.mode)
        if chosen == ACT:
            if p.kind != "human":
                # The planner records the request as the user's words; an agent is not the user.
                raise ApiError(403, "NOT_USER", "only a human can make a request; agents send proposals")
            result = await k.planner(body.cloud).plan(body.text, sid)
            return {
                "route": chosen,
                "requested_mode": body.mode,
                "plan": {
                    "plan_id": result.plan_id,
                    "status": result.status,
                    "reason": result.reason,
                    "steps": [_step(s) for s in result.steps],
                },
                "executed": False,
            }
        try:
            answer = await k.answerer(p, body.cloud).answer(body.text, sid, clarifies=body.clarifies)
        except ValueError as exc:
            if body.clarifies:
                raise ApiError(404, "NOT_FOUND", str(exc)) from exc
            raise ApiError(422, "INVALID", str(exc)) from exc
        return {"route": chosen, "requested_mode": body.mode, "answer": answer.summary(), "executed": False}

    @app.post("/v1/answers/{answer_id}/rating", status_code=201)
    async def rate(answer_id: str, body: RatingIn, p: Who, k: K) -> dict[str, Any]:
        """Rate a given answer. Up makes it a style example for you; down retires it."""
        need(p, REQUESTER)
        if p.kind != "human":
            raise ApiError(403, "NOT_USER", "only a human rates answers")
        ratings = Ratings(k.store)
        try:
            given = await ratings.find(answer_id)
        except RatingError:
            given = None
        if given is None:
            raise ApiError(404, "NOT_FOUND", "no such answer")
        await own_session(k, p, given.session_id)
        try:
            effect = await ratings.rate(given, body.rating, body.note, p.actor)
        except RatingError as exc:
            raise ApiError(422, "INVALID", str(exc)) from exc
        return {"answer_id": given.answer_id, "rating": body.rating, "example": effect}

    @app.post("/v1/sessions/{session_id}/proposals", status_code=201)
    async def propose(session_id: str, body: ProposalIn, p: Who, k: K) -> dict[str, Any]:
        """A typed proposal, straight to the gate. Proposer and session come from the token and
        the path; a body that names others is refused."""
        need(p, REQUESTER)
        sid = await own_session(k, p, session_id)
        if body.session_id is not None and body.session_id != sid:
            raise ApiError(422, "SESSION_MISMATCH", "session_id must be the session in the path")
        if body.proposer is not None and body.proposer != p.actor:
            raise ApiError(422, "PROPOSER_MISMATCH", "the proposer is the authenticated principal")
        if p.kind != "human" and any(c.source == "user" for c in body.context):
            raise ApiError(422, "NOT_USER", "only a human principal may cite the user as a source")
        proposal = {
            "proposal_id": body.proposal_id or str(uuid.uuid4()),
            "session_id": sid,
            "action": body.action,
            "params": body.params,
            "rationale": body.rationale,
            "context": [c.model_dump() for c in body.context],
            "proposer": p.actor,
            "created_at": body.created_at or utc_timestamp(k.store.clock()),
        }
        decision = await k.gate.decide(proposal)
        return {"proposal": proposal, "decision": decision}

    # ── decisions ──

    @app.get("/v1/decisions/{decision_id}")
    async def evidence(decision_id: str, p: Who, k: K) -> dict[str, Any]:
        ref = await decision_for(k, p, decision_id, owner_only=False)
        found = await build_evidence(k.store, ref.decision_id)
        if found is None:
            raise ApiError(404, "NOT_FOUND", "no such decision")
        return {"evidence": found.pack, "intact": found.intact}

    @app.post("/v1/decisions/{decision_id}/execute")
    async def execute(decision_id: str, p: Who, k: K) -> JSONResponse:
        need(p, REQUESTER)
        ref = await decision_for(k, p, decision_id, owner_only=True)
        record = await k.executor.run(ref.decision_id)
        body = asdict(record) | {"codes": record.codes}
        if record.status == "refused":
            first = record.reasons[0] if record.reasons else {"code": "REFUSED", "message": "refused"}
            return _error(409, first["code"], first.get("message", ""), execution=body)
        return JSONResponse({"execution": body})

    @app.get("/v1/inbox")
    async def inbox(p: Who, k: K) -> dict[str, Any]:
        """Open NEEDS_APPROVAL decisions, newest first, each with its evidence pack."""
        need(p, APPROVER)
        rows = await k.store.pool.fetch(
            "SELECT d.id FROM (SELECT e.pos, e.stream, e.payload->'decision'->>'decision_id' AS id "
            "FROM events e WHERE e.type = 'decision.made' AND e.payload->'decision'->>'outcome' = $1) d "
            "WHERE NOT EXISTS (SELECT 1 FROM executions x WHERE x.decision_id = d.id) "
            "AND NOT EXISTS (SELECT 1 FROM events r WHERE r.stream = d.stream "
            "AND r.type = 'approval.rejected' AND r.payload->>'decision_id' = d.id) "
            "ORDER BY d.pos DESC LIMIT $2",
            NEEDS_APPROVAL,
            INBOX_LIMIT,
        )
        items = []
        for r in rows:
            found = await build_evidence(k.store, r["id"])
            if found is None:
                continue
            pack = found.pack
            approved = any(a["approver"]["id"] == p.id for a in pack["approvals"])
            items.append(
                {
                    "decision_id": r["id"],
                    "evidence": pack,
                    "intact": found.intact,
                    "approved_by_you": approved,
                    "proposed_by_you": pack["proposal"].get("proposer") == p.actor,
                }
            )
        return {"items": items}

    @app.post("/v1/decisions/{decision_id}/approve", status_code=201)
    async def approve_route(decision_id: str, body: ApproveIn, p: Who, k: K) -> dict[str, Any]:
        need(p, APPROVER)
        ref = await decision_for(k, p, decision_id, owner_only=False)
        signature = {"alg": "ed25519", "key_id": body.key_id, "value": body.signature}
        try:
            event = await approve(k.store, ref.decision_id, body.proposal_hash, p.actor, signature)
        except ApprovalError as exc:
            raise ApiError(409, exc.code, str(exc)) from exc
        return {"approval": event["payload"], "stream": event["stream"], "seq": event["seq"]}

    @app.post("/v1/decisions/{decision_id}/reject", status_code=201)
    async def reject_route(decision_id: str, body: RejectIn, p: Who, k: K) -> dict[str, Any]:
        need(p, APPROVER)
        ref = await decision_for(k, p, decision_id, owner_only=False)
        try:
            event = await reject(k.store, ref.decision_id, body.reason, p.actor)
        except ApprovalError as exc:
            raise ApiError(409, exc.code, str(exc)) from exc
        return {"rejection": event["payload"], "stream": event["stream"], "seq": event["seq"]}

    # ── live events ──

    @app.websocket("/v1/sessions/{session_id}/events")
    async def live(ws: WebSocket, session_id: str) -> None:
        """The session's events, then new ones as they are appended. The token comes in the
        first message, `{"token": ..., "after": 0}`, so it never appears in a URL."""
        await ws.accept()
        k: Kernel = ws.app.state.kernel
        try:
            first = json.loads(await asyncio.wait_for(ws.receive_text(), WS_AUTH_TIMEOUT_S))
        except (TimeoutError, ValueError, WebSocketDisconnect):
            return await ws.close(4401)
        who = await auth.authenticate(k.store, first.get("token") if isinstance(first, dict) else None)
        if who is None:
            return await ws.close(4401)
        if await auth.session_owner(k.store, session_id) != who.id:
            return await ws.close(4404)
        stream = f"session/{uuid.UUID(session_id)}"
        after = first.get("after", 0)
        after = after if isinstance(after, int) and after >= 0 else 0

        async def pump() -> None:
            nonlocal after
            while True:
                for event in await k.store.read(stream, after):
                    await ws.send_text(json.dumps(event, ensure_ascii=False, default=str))
                    after = event["seq"]
                await asyncio.sleep(k.poll_s)

        sender = asyncio.create_task(pump())
        listener = asyncio.create_task(ws.receive())  # returns when the client goes away
        try:
            await asyncio.wait({sender, listener}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in (sender, listener):
                task.cancel()
            await asyncio.gather(sender, listener, return_exceptions=True)

    # ── the inbox page ──

    static = resources.files("nexus.api").joinpath("static")

    @app.get("/inbox")
    async def inbox_root() -> RedirectResponse:
        return RedirectResponse("/inbox/", status_code=307)

    @app.get("/inbox/")
    async def inbox_page() -> FileResponse:
        return FileResponse(str(static.joinpath("inbox.html")), media_type="text/html")

    @app.get("/inbox/{name}")
    async def inbox_asset(name: str) -> FileResponse:
        types = {"inbox.js": "text/javascript", "inbox.css": "text/css", "jcs.js": "text/javascript"}
        if name not in types:
            raise ApiError(404, "NOT_FOUND", "not found")
        return FileResponse(str(static.joinpath(name)), media_type=types[name])

    return app


def _step(step: Any) -> dict[str, Any]:
    out = step.summary()
    if step.decision:
        out["proposal_hash"] = step.decision["proposal_hash"]
        out["reasons"] = step.decision["reasons"]
    return out


__all__ = ["LOOPBACK_HOSTS", "MODES", "ApiError", "create_app"]
