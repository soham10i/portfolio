"""`nexus` command line. Exit codes: 0 valid / intact / accepted, 1 issues found or refused, 2 usage,
IO or database error.

Database commands read NEXUS_DB_URL, and NEXUS_DB_SCHEMA when the tables live in another schema.
With NEXUS_ANCHOR_KEYS and NEXUS_ANCHOR_DIR set, every write signs its stream heads (ADR-0019).
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import sys
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Any

import asyncpg

from .contracts import Kind, kind_from_name, load_schemas, schema_for, validate_file
from .contracts.registry import SCHEMA_FILE
from .store import Anchor, ChainReport, EventStore

EXIT_OK, EXIT_INVALID, EXIT_ERROR = 0, 1, 2


def _collect(paths: Sequence[str], explicit_kind: bool) -> list[Path]:
    """Files to validate. Directories are walked; inside them only <name>.<kind>.* files count."""
    files: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if path.is_dir():
            files.extend(sorted(p for p in path.rglob("*") if p.is_file() and kind_from_name(p)))
        elif path.is_file():
            files.append(path)
        else:
            raise FileNotFoundError(f"{raw}: no such file or directory")
    if not files and not explicit_kind:
        raise FileNotFoundError("no <name>.<kind>.yaml|json files found")
    return files


def _cmd_validate(args: argparse.Namespace) -> int:
    files = _collect(args.paths, args.kind is not None)
    report: dict[str, list[dict[str, str]]] = {}
    for path in files:
        report[str(path)] = [
            {"code": i.code, "pointer": i.pointer, "message": i.message}
            for i in validate_file(path, args.kind)
        ]
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        for path, issues in report.items():
            for issue in issues:
                print(f"{path}: {issue['code']} {issue['pointer'] or '/'}: {issue['message']}")
        bad = sum(1 for issues in report.values() if issues)
        print(f"{len(report) - bad} valid, {bad} invalid", file=sys.stderr)
    return EXIT_INVALID if any(report.values()) else EXIT_OK


def _cmd_schema_list(_: argparse.Namespace) -> int:
    for kind, name in SCHEMA_FILE.items():
        print(f"{kind.value:<9} {name}  {load_schemas()[name].get('title', '')}")
    return EXIT_OK


def _cmd_schema_show(args: argparse.Namespace) -> int:
    print(json.dumps(schema_for(Kind(args.kind)), indent=2))
    return EXIT_OK


class DatabaseError(Exception):
    """No database configured, or it could not be reached."""


def _with_store[T](work: Callable[[EventStore], Awaitable[T]]) -> T:
    url = os.environ.get("NEXUS_DB_URL")
    if not url:
        raise DatabaseError("NEXUS_DB_URL is not set (see .env.example)")

    async def run() -> T:
        try:
            store = await EventStore.connect(
                url, schema=os.environ.get("NEXUS_DB_SCHEMA"), pool_size=2, anchor=Anchor.from_env()
            )
        except (OSError, asyncpg.PostgresError) as exc:
            raise DatabaseError(f"cannot connect: {exc}") from exc
        try:
            return await work(store)
        finally:
            await store.close()

    return asyncio.run(run())


def _cmd_db_migrate(_: argparse.Namespace) -> int:
    applied = _with_store(lambda store: store.migrate())
    print(f"applied: {', '.join(applied)}" if applied else "up to date")
    return EXIT_OK


_NOT_ANCHORED = (
    "anchoring is not configured: set NEXUS_ANCHOR_KEYS and NEXUS_ANCHOR_DIR (see .env.example), or pass"
    " --no-anchor to check the hash chain alone, which a full rewrite of the history passes"
)


def _print_report(report: ChainReport) -> None:
    for problem in report.problems:
        print(problem)
    streams = f"{report.streams_checked} stream{'s' if report.streams_checked != 1 else ''}"
    signed = f", {report.checkpoints_checked} signed checkpoints" if report.anchored else ""
    n = len(report.problems)
    verdict = "intact" if report.ok else f"{n} problem{'s' if n != 1 else ''}"
    print(f"{report.events_checked} events in {streams}{signed}: {verdict}")


def _cmd_chain_verify(args: argparse.Namespace) -> int:
    async def work(store: EventStore) -> ChainReport | None:
        if store.anchor is None and not args.no_anchor:
            return None
        return await store.verify_chain(args.stream, anchored=not args.no_anchor)

    report = _with_store(work)
    if report is None:
        print(f"error: {_NOT_ANCHORED}", file=sys.stderr)
        return EXIT_ERROR
    _print_report(report)
    return EXIT_OK if report.ok else EXIT_INVALID


def _cmd_chain_checkpoint(_: argparse.Namespace) -> int:
    async def work(store: EventStore) -> tuple[ChainReport, dict[str, tuple[int, str]]] | None:
        return await store.checkpoint() if store.anchor is not None else None

    result = _with_store(work)
    if result is None:
        print(f"error: {_NOT_ANCHORED.split(', or pass')[0]}", file=sys.stderr)
        return EXIT_ERROR
    report, signed = result
    if not report.ok and not signed:
        _print_report(report)
        print("refused: only a missing or behind checkpoint can be signed, and only on a chain that verifies")
        return EXIT_INVALID
    for stream, (seq, hash_) in sorted(signed.items()):
        print(f"signed {stream} {seq} {hash_}")
    print(f"{len(signed)} stream head{'s' if len(signed) != 1 else ''} signed")
    return EXIT_OK


def _cmd_state_check(_: argparse.Namespace) -> int:
    async def work(store: EventStore) -> tuple[int, list]:
        return await store.state.count(), await store.state.check()

    keys, diffs = _with_store(work)
    for d in diffs:
        print(f"{d.entity} {d.key} {d.problem} live={d.live} rebuilt={d.rebuilt}")
    noun = "key" if keys == 1 else "keys"
    found = f"{len(diffs)} difference{'s' if len(diffs) != 1 else ''}"
    print(f"{keys} {noun}: {'projection equals the rebuild' if not diffs else found}")
    return EXIT_OK if not diffs else EXIT_INVALID


def _cmd_kill_switch(args: argparse.Namespace) -> int:
    from .gate.gate import KILL_SWITCH, kill_switch_on, set_kill_switch

    async def work(store: EventStore) -> str:
        if args.switch != "status":
            await set_kill_switch(store, args.switch == "on", _human(), args.reason)
        row = await store.state.get(*KILL_SWITCH)
        if row is None:
            return "off (never set)"
        reason = row.value.get("reason") if isinstance(row.value, dict) else None
        return f"{'on' if kill_switch_on(row.value) else 'off'} (version {row.version}: {reason})"

    print(f"kill switch {_with_store(work)}")
    return EXIT_OK


def _human() -> dict[str, str]:
    return {"kind": "human", "id": os.environ.get("NEXUS_ACTOR") or getpass.getuser()}


def _cmd_approve(args: argparse.Namespace) -> int:
    from .exec import ApprovalError, approve, reject

    actor = _human()
    signature = None
    if args.command == "approve" and args.key:
        from .signing import Signer

        signer = Signer.from_pem(Path(args.key).read_bytes())
        signature = signer.sign_approval(args.decision_id, args.proposal_hash, actor)
    try:
        if args.command == "approve":
            event = _with_store(
                lambda store: approve(store, args.decision_id, args.proposal_hash, actor, signature)
            )
        else:
            event = _with_store(lambda store: reject(store, args.decision_id, args.reason, actor))
    except ApprovalError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return EXIT_INVALID
    verb = "approved" if args.command == "approve" else "rejected"
    signed = f", signed with key {signature['key_id']}" if signature else ""
    print(f"{verb} {args.decision_id} as {actor['id']}{signed} ({event['stream']} seq {event['seq']})")
    return EXIT_OK


def _cmd_trace(args: argparse.Namespace) -> int:
    from .evidence import build_evidence, render

    evidence = _with_store(lambda store: build_evidence(store, args.id))
    if evidence is None:
        print(f"no decision, proposal or idempotency key {args.id}", file=sys.stderr)
        return EXIT_INVALID
    if args.json:
        print(json.dumps(evidence.pack, indent=2, ensure_ascii=False))
    else:
        print("\n".join(render(evidence)))
    if not evidence.intact:
        sys.stdout.flush()
        print("the event chain does not verify: this trace cannot be trusted", file=sys.stderr)
        return EXIT_INVALID
    return EXIT_OK


def _cmd_models(args: argparse.Namespace) -> int:
    from .llm import load_config, usage_today

    config = load_config()

    async def usage(store: EventStore) -> dict[str, dict[str, Any]]:
        return await usage_today(store, config)

    used = _with_store(usage) if os.environ.get("NEXUS_DB_URL") else None
    for p in config.providers:
        key = (
            "no key needed"
            if p.api_key_env is None
            else (f"${p.api_key_env} {'set' if p.api_key(os.environ) else 'not set'}")
        )
        cost = "free" if p.free else f"paid, budget ${p.daily_budget_usd:g}/day"
        caps = [f"{p.max_requests_per_day}/day"] if p.max_requests_per_day is not None else []
        caps += [f"{p.requests_per_minute}/min"] if p.requests_per_minute is not None else []
        caps += [f"{p.tokens_per_minute} tokens/min"] if p.tokens_per_minute is not None else []
        cap = f", caps {', '.join(caps)}, day resets 00:00 {p.quota_timezone}" if caps else ""
        line = f"{p.name:<10} {p.kind}:{p.model}  {cost}{cap}  {key}  private_ok={p.private_ok}"
        if used is not None:
            u = used[p.name]
            line += f"  {u['day']}: {u['requests']} request(s), ${u['spent_usd']:g}"
            line += ", used up (the provider said so)" if u["exhausted"] else ""
        print(line)
    return EXIT_OK


def _cmd_models_try(args: argparse.Namespace) -> int:
    """One real call, run by hand: the only command that talks to a provider."""
    from .llm import ModelError, Router, load_config

    schema = {
        "type": "object",
        "required": ["answer"],
        "properties": {"answer": {"type": "string", "maxLength": 2000}},
        "additionalProperties": False,
    }

    async def work(store: EventStore) -> int:
        router = Router(store, load_config())
        try:
            result = await router.generate(
                "models.try",
                args.text,
                schema,
                private=args.private,
                providers=[args.provider] if args.provider else None,
                actor=_human(),
            )
        except ModelError as exc:
            for note in exc.notes:
                print(f"  {note}", file=sys.stderr)
            print(f"no answer: {exc}", file=sys.stderr)
            return EXIT_INVALID
        for note in result.notes:
            print(f"  {note}")
        print(result.output["answer"])
        print(
            f"({result.provider}:{result.model}, {result.attempts} attempt(s), "
            f"{result.tokens_in}+{result.tokens_out} tokens, ${result.cost_usd:g}, "
            f"{result.latency_ms:.0f} ms)"
        )
        return EXIT_OK

    return _with_store(work)


def _router(store: EventStore) -> Any:  # the tests replace this to use a fake transport
    from .llm import Router, load_config

    return Router(store, load_config())


def _cmd_ask(args: argparse.Namespace) -> int:
    """Plan a request and send every step to the gate. Nothing is executed (P6.md §1)."""
    import uuid

    from .gate import Gate, Policy
    from .packs import load_pack
    from .plan import Planner

    packs = [load_pack(p) for p in args.pack or ["echo", "greenhouse"]]
    session_id = args.session or str(uuid.uuid4())

    async def work(store: EventStore) -> Any:
        gate = Gate(store, packs, Policy())
        planner = Planner(store, gate, _router(store), private=not args.cloud)
        return await planner.plan(args.text, session_id)

    result = _with_store(work)
    if args.json:
        doc = {
            "plan_id": result.plan_id,
            "session_id": result.session_id,
            "status": result.status,
            "reason": result.reason,
            "rounds": result.rounds,
            "steps": [s.summary() for s in result.steps],
        }
        print(json.dumps(doc, indent=2, ensure_ascii=False))
        return EXIT_OK if result.status == "proposed" else EXIT_INVALID
    print(f"plan {result.plan_id} in session {result.session_id}: {result.status} ({result.reason})")
    for problem in result.problems if result.status != "proposed" else []:
        print(f"  {problem}")
    for step in result.steps:
        params = json.dumps(step.params, sort_keys=True, ensure_ascii=False)
        line = f"  {step.id} {step.action} {params}"
        if step.status != "proposed":
            print(f"{line}  {step.status}: {step.note}")
            continue
        decision = step.decision
        print(f"{line}  {decision['outcome']}  decision {decision['decision_id']}")
        for reason in decision["reasons"]:
            print(f"      {reason['code']}: {reason['message']}")
        if decision["outcome"] == "NEEDS_APPROVAL":
            approve = f"nexus approve {decision['decision_id']} --proposal-hash {decision['proposal_hash']}"
            print(f"      approve: {approve}")
    print("nothing was executed")
    return EXIT_OK if result.status == "proposed" else EXIT_INVALID


# ── knowledge and memory (P7) ─────────────────────────────────────────────────


def _packs(names: Sequence[str] | None) -> list[Any]:
    from .packs import load_pack

    return [load_pack(p) for p in names or ["greenhouse"]]


def _cmd_knowledge_index(args: argparse.Namespace) -> int:
    from .knowledge import KnowledgeIndex
    from .packs import pack_root

    if bool(args.dir) != bool(args.corpus):
        raise ValueError("--dir and --corpus go together")

    async def work(store: EventStore) -> list[Any]:
        index = KnowledgeIndex(store)
        if args.dir:
            return [await index.index(args.corpus, args.dir)]
        reports = [await index.index_pack(p, pack_root(p.id)) for p in _packs(args.pack)]
        return [r for r in reports if r is not None]

    for report in _with_store(work):
        print(f"{report.corpus}: {report.chunks} chunks from {len(report.files)} files ({report.embedder})")
        for f in report.files:
            commit = f["commit"][:12] if f["commit"] else "none (untracked or modified)"
            print(f"  {f['path']}  sha256 {f['sha256'][:12]}  commit {commit}")
    return EXIT_OK


def _cmd_knowledge_search(args: argparse.Namespace) -> int:
    from .knowledge import KnowledgeIndex

    hits = _with_store(lambda store: KnowledgeIndex(store).search(args.text, args.corpus, k=args.k))
    if args.json:
        doc = [
            {
                "ref": f"{h.chunk.corpus}:{h.chunk.ref}",
                "chunk_id": h.chunk.chunk_id,
                "score": round(h.score, 6),
                "lexical_rank": h.lexical_rank,
                "vector_rank": h.vector_rank,
                "similarity": round(h.similarity, 4),
                "heading": h.chunk.heading,
                "body": h.chunk.body,
            }
            for h in hits
        ]
        print(json.dumps(doc, indent=2, ensure_ascii=False))
        return EXIT_OK if hits else EXIT_INVALID
    if not hits:
        print("nothing relevant found")
        return EXIT_INVALID
    for h in hits:
        ranks = f"lexical {h.lexical_rank or '-'}, vector {h.vector_rank or '-'}"
        print(f"{h.chunk.corpus}:{h.chunk.ref}  {h.score:.4f} ({ranks})  {h.chunk.heading}")
        print(f"  {' '.join(h.chunk.body.split())[:160]}")
    return EXIT_OK


def _cmd_resolve(args: argparse.Namespace) -> int:
    from .knowledge import AssetGraph

    mentions = AssetGraph.from_packs(_packs(args.pack)).resolve(args.text)
    if args.json:
        print(json.dumps([m.as_dict() for m in mentions], indent=2, ensure_ascii=False))
    else:
        for m in mentions:
            found = ", ".join(m.entities or m.candidates)
            print(
                f"{m.text!r} [{m.start}:{m.end}] {m.status}: {found}" + (f" ({m.reason})" if m.reason else "")
            )
        if not mentions:
            print("no assets mentioned")
    return EXIT_OK if mentions and all(m.status == "resolved" for m in mentions) else EXIT_INVALID


def _cmd_memory(args: argparse.Namespace) -> int:
    from .knowledge import MemoryStore

    async def work(store: EventStore) -> Any:
        memories = MemoryStore(store)
        if args.memory_command == "add":
            return await memories.add(args.content, args.tier, args.scope, args.source or "cli", _human())
        if args.memory_command == "list":
            return await memories.find(args.tier, args.scope, include_deleted=args.all)
        if args.memory_command == "show":
            return await memories.show(args.id)
        if args.memory_command == "purge":
            return await memories.purge(args.id, args.reason, _human())
        return await memories.delete(args.id, args.reason, _human())

    result = _with_store(work)
    if args.memory_command == "list":
        for m in result:
            print(f"{m.memory_id}  {m.status:<7}  {m.tier}/{m.scope}  {m.created_at}  {m.content[:80]}")
        return EXIT_OK
    if result is None:
        print(f"no memory {args.id}")
        return EXIT_INVALID
    if args.memory_command == "delete":
        print(
            f"deleted {result.memory_id}: kept and marked deleted, never retrieved; `memory purge` erases it"
        )
        return EXIT_OK
    if args.memory_command == "purge":
        print(f"purged {result.memory_id}; its content is gone, the events keep its sha256 only")
        return EXIT_OK
    print(json.dumps(result.as_dict(), indent=2, ensure_ascii=False))
    return EXIT_OK


def _cmd_answer(args: argparse.Namespace) -> int:
    """Answer a question from the packs' documents, memories and live reads. Acts on nothing."""
    import uuid

    from .knowledge import Answerer, AssetGraph, KnowledgeIndex, MemoryStore

    packs = _packs(args.pack)
    if args.clarifies and not args.session:
        print("--clarifies needs --session: the clarifying question is in that session", file=sys.stderr)
        return EXIT_INVALID
    session_id = args.session or str(uuid.uuid4())

    async def work(store: EventStore) -> Any:
        answerer = Answerer(
            store,
            _router(store),
            KnowledgeIndex(store),
            MemoryStore(store),
            AssetGraph.from_packs(packs),
            {p.id: p for p in packs},
            private=not args.cloud,
            corpora=[p.id for p in packs],
            user=_human()["id"],
        )
        return await answerer.answer(args.text, session_id, clarifies=args.clarifies)

    try:
        result = _with_store(work)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_INVALID
    if args.json:
        print(json.dumps(result.summary() | {"session_id": session_id}, indent=2, ensure_ascii=False))
        return EXIT_OK if result.status == "answered" else EXIT_INVALID
    if result.status == "clarify":
        print(f"to answer this, Nexus needs to know ({result.reason}):")
        for q in result.questions:
            print(f"  - {q}")
        print(f"reply with: nexus answer '...' --session {session_id} --clarifies {result.answer_id}")
        return EXIT_INVALID
    if result.status != "answered":
        print(f"abstained ({result.by}): {result.reason}")
        return EXIT_INVALID
    for s in result.sentences:
        refs = ", ".join(result.source(c).ref for c in s.cites)
        print(f"{s.text}  [{refs}]")
    for point in result.uncovered:
        print(f"{point}: not found in the sources")
    print(f"answer {result.answer_id} in session {session_id}; nothing was executed")
    print(f"rate it with: nexus rate {result.answer_id} up|down")
    return EXIT_OK


def _cmd_rate(args: argparse.Namespace) -> int:
    """Rate a given answer as $NEXUS_ACTOR. Up makes it a style example; down retires it."""
    from .knowledge import RatingError, Ratings

    async def work(store: EventStore) -> Any:
        ratings = Ratings(store)
        given = await ratings.find(args.id)
        if given is None:
            raise RatingError(f"no given answer {args.id}")
        return await ratings.rate(given, args.rating, args.note, _human())

    try:
        effect = _with_store(work)
    except RatingError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_INVALID
    said = {"added": "it is now a style example", "retired": "it is no longer a style example", "none": ""}
    print(
        f"rated {args.id} {args.rating} as {_human()['id']}" + (f"; {said[effect]}" if said[effect] else "")
    )
    return EXIT_OK


# ── the API (P8) ──────────────────────────────────────────────────────────────


def _cmd_serve(args: argparse.Namespace) -> int:
    """Serve the API and the inbox on loopback until interrupted."""
    import uvicorn

    from .api import check_loopback, create_app
    from .packs import load_pack

    host = check_loopback(args.host)
    url = os.environ.get("NEXUS_DB_URL")
    if not url:
        raise DatabaseError("NEXUS_DB_URL is not set (see .env.example)")
    packs = [load_pack(p) for p in args.pack or ["echo", "greenhouse"]]

    async def connect() -> EventStore:
        return await EventStore.connect(
            url, schema=os.environ.get("NEXUS_DB_SCHEMA"), pool_size=8, anchor=Anchor.from_env()
        )

    shown = f"[{host}]" if ":" in host else host
    print(f"serving http://{shown}:{args.port}/ (inbox at /inbox/); loopback only", file=sys.stderr)
    uvicorn.run(create_app(connect, packs), host=host, port=args.port, log_level="warning")
    return EXIT_OK


def _cmd_principal(args: argparse.Namespace) -> int:
    from .api import auth

    async def work(store: EventStore) -> Any:
        if args.principal_command == "add":
            return await auth.add_principal(store, args.id, args.kind, args.role)
        if args.principal_command == "token":
            return await auth.rotate_token(store, args.id)
        if args.principal_command == "revoke":
            return await auth.revoke_principal(store, args.id, args.reason)
        return await auth.list_principals(store)

    try:
        result = _with_store(work)
    except auth.AuthError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return EXIT_INVALID
    if args.principal_command in ("add", "token"):
        print(result)  # the token: shown once, stored only as its sha256
        print(f"(the token for {args.id}; it is not stored and will not be shown again)", file=sys.stderr)
    elif args.principal_command == "revoke":
        print(f"revoked {args.id}")
    else:
        for p in result:
            state = "revoked" if p["revoked"] else "active"
            print(f"{p['id']:<20} {p['kind']:<6} {','.join(p['roles']):<20} {state}")
    return EXIT_OK


def _cmd_key(args: argparse.Namespace) -> int:
    from .signing import Signer

    path = Path(args.path)
    if args.key_command == "generate":
        signer = Signer.generate()
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)  # never overwrite a key
        with os.fdopen(fd, "wb") as f:
            f.write(signer.to_pem())
        print(f"key {signer.key_id}  public {signer.public_key}  written to {path} (mode 0600)")
        return EXIT_OK
    from .api import auth

    signer = Signer.from_pem(path.read_bytes())
    actor = _human()

    async def work(store: EventStore) -> str:
        principal = await auth.get_principal(store, actor["id"])
        if principal is None:
            raise auth.AuthError("UNKNOWN_PRINCIPAL", f"no active principal {actor['id']} ($NEXUS_ACTOR)")
        return await auth.register_key(store, principal, signer.public_key)

    try:
        kid = _with_store(work)
    except auth.AuthError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        return EXIT_INVALID
    print(f"registered key {kid} to {actor['id']}")
    return EXIT_OK


def _parser() -> argparse.ArgumentParser:
    kinds = [k.value for k in Kind]
    parser = argparse.ArgumentParser(prog="nexus", description="NEXUS contract tools.")
    sub = parser.add_subparsers(dest="command", required=True)

    val = sub.add_parser("validate", help="validate contract documents (files or directories)")
    val.add_argument("paths", nargs="+")
    val.add_argument("--kind", choices=kinds, help="kind for every file (default: from the file name)")
    val.add_argument("--json", action="store_true", help="machine-readable output")
    val.set_defaults(func=_cmd_validate)

    schema = sub.add_parser("schema", help="inspect the v1 schemas")
    schema_sub = schema.add_subparsers(dest="schema_command", required=True)
    schema_sub.add_parser("list").set_defaults(func=_cmd_schema_list)
    show = schema_sub.add_parser("show")
    show.add_argument("kind", choices=kinds)
    show.set_defaults(func=_cmd_schema_show)

    db = sub.add_parser("db", help="database setup")
    db.add_subparsers(dest="db_command", required=True).add_parser(
        "migrate", help="create or update the event store tables"
    ).set_defaults(func=_cmd_db_migrate)

    chain = sub.add_parser("chain", help="the hash-chained event log")
    chain_sub = chain.add_subparsers(dest="chain_command", required=True)
    verify = chain_sub.add_parser("verify", help="recompute every hash and check links and stream heads")
    verify.add_argument("--stream", help="only this stream")
    verify.add_argument(
        "--no-anchor", action="store_true", help="skip the signed checkpoints (the hash chain alone)"
    )
    verify.set_defaults(func=_cmd_chain_verify)
    chain_sub.add_parser(
        "checkpoint", help="sign heads whose checkpoint is missing or behind, if everything else verifies"
    ).set_defaults(func=_cmd_chain_checkpoint)

    state = sub.add_parser("state", help="the world-state projection")
    state.add_subparsers(dest="state_command", required=True).add_parser(
        "check", help="rebuild state from events and compare it with the live table"
    ).set_defaults(func=_cmd_state_check)

    kill = sub.add_parser("kill-switch", help="stop every execution (on), resume (off), or show it")
    kill.add_argument("switch", choices=["on", "off", "status"])
    kill.add_argument("--reason", default="set from the command line", help="recorded in the event")
    kill.set_defaults(func=_cmd_kill_switch)

    approve = sub.add_parser("approve", help="approve a NEEDS_APPROVAL decision as $NEXUS_ACTOR")
    approve.add_argument("decision_id")
    approve.add_argument("--proposal-hash", required=True, help="the hash you were shown; must match")
    approve.add_argument("--key", help="sign with this Ed25519 key (PEM, from `nexus key generate`)")
    approve.set_defaults(func=_cmd_approve)
    reject = sub.add_parser("reject", help="reject a NEEDS_APPROVAL decision; it can no longer execute")
    reject.add_argument("decision_id")
    reject.add_argument("--reason", required=True)
    reject.set_defaults(func=_cmd_approve)

    trace = sub.add_parser("trace", help="explain one action from the event log (its evidence pack)")
    trace.add_argument("id", help="a decision id, a proposal id or an idempotency key")
    trace.add_argument("--json", action="store_true", help="print the evidence pack")
    trace.set_defaults(func=_cmd_trace)

    models = sub.add_parser("models", help="the model providers: configuration, keys, today's usage")
    models.set_defaults(func=_cmd_models)
    models_sub = models.add_subparsers(dest="models_command")
    try_ = models_sub.add_parser("try", help="send one real request (uses your free-tier key or Ollama)")
    try_.add_argument("text", help="the question")
    try_.add_argument("--provider", help="only this provider (default: config order)")
    try_.add_argument("--private", action="store_true", help="only providers allowed private data")
    try_.set_defaults(func=_cmd_models_try)

    ask = sub.add_parser("ask", help="plan a request and send each step to the gate; executes nothing")
    ask.add_argument("text", help="what you want done, in plain words")
    ask.add_argument("--session", help="session id (default: a new one)")
    ask.add_argument(
        "--pack", action="append", help="first-party pack to plan with (default: echo, greenhouse)"
    )
    ask.add_argument(
        "--cloud", action="store_true", help="the request may go to a cloud free tier (default: local only)"
    )
    ask.add_argument("--json", action="store_true", help="machine-readable output")
    ask.set_defaults(func=_cmd_ask)

    knowledge = sub.add_parser("knowledge", help="the document index (local embeddings; no model call)")
    knowledge_sub = knowledge.add_subparsers(dest="knowledge_command", required=True)
    kindex = knowledge_sub.add_parser("index", help="(re)index the packs' knowledge, or one folder")
    kindex.add_argument("--pack", action="append", help="first-party pack (default: greenhouse)")
    kindex.add_argument("--dir", help="a folder of markdown files to index instead")
    kindex.add_argument("--corpus", help="the corpus name for --dir")
    kindex.set_defaults(func=_cmd_knowledge_index)
    ksearch = knowledge_sub.add_parser("search", help="hybrid search: full text and vectors, fused")
    ksearch.add_argument("text")
    ksearch.add_argument("--corpus", action="append", help="limit to this corpus (repeatable)")
    ksearch.add_argument("-k", type=int, default=5, help="how many hits (default 5)")
    ksearch.add_argument("--json", action="store_true", help="machine-readable output")
    ksearch.set_defaults(func=_cmd_knowledge_search)

    resolve = sub.add_parser("resolve", help="find the assets a phrase names, e.g. 'zone two'")
    resolve.add_argument("text")
    resolve.add_argument("--pack", action="append", help="first-party pack (default: greenhouse)")
    resolve.add_argument("--json", action="store_true", help="machine-readable output")
    resolve.set_defaults(func=_cmd_resolve)

    memory = sub.add_parser("memory", help="explicit memory: nothing is remembered unless added here")
    memory_sub = memory.add_subparsers(dest="memory_command", required=True)
    madd = memory_sub.add_parser("add", help="remember something, as $NEXUS_ACTOR")
    madd.add_argument("content")
    madd.add_argument("--tier", required=True, choices=["session", "project", "profile"])
    madd.add_argument("--scope", required=True, help="the session id, pack id or user it belongs to")
    madd.add_argument("--source", help="who said it, where (default: cli)")
    mlist = memory_sub.add_parser("list")
    mlist.add_argument("--tier", choices=["session", "project", "profile"])
    mlist.add_argument("--scope")
    mlist.add_argument("--all", action="store_true", help="include deleted memories")
    memory_sub.add_parser("show").add_argument("id")
    mdel = memory_sub.add_parser("delete", help="mark a memory deleted; it is kept but never retrieved")
    mdel.add_argument("id")
    mdel.add_argument("--reason", required=True)
    mpurge = memory_sub.add_parser(
        "purge", help="erase a memory, current or deleted; the events keep its hash"
    )
    mpurge.add_argument("id")
    mpurge.add_argument("--reason", required=True)
    memory.set_defaults(func=_cmd_memory)

    answer = sub.add_parser("answer", help="answer a question with citations, or abstain; acts on nothing")
    answer.add_argument("text", help="the question")
    answer.add_argument("--pack", action="append", help="first-party pack (default: greenhouse)")
    answer.add_argument("--session", help="session id (default: a new one)")
    answer.add_argument(
        "--cloud", action="store_true", help="the question may go to a cloud free tier (default: local only)"
    )
    answer.add_argument("--clarifies", metavar="ID", help="the text replies to this clarifying question")
    answer.add_argument("--json", action="store_true", help="machine-readable output")
    answer.set_defaults(func=_cmd_answer)

    rate = sub.add_parser("rate", help="rate an answer; answers rated up teach Nexus the style you want")
    rate.add_argument("id", help="the answer id")
    rate.add_argument("rating", choices=["up", "down"])
    rate.add_argument("--note", default="", help="why (at most 500 characters)")
    rate.set_defaults(func=_cmd_rate)

    serve = sub.add_parser("serve", help="serve the HTTP API and the approvals inbox (loopback only)")
    serve.add_argument("--host", default="127.0.0.1", help="a loopback address (default 127.0.0.1)")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--pack", action="append", help="first-party pack (default: echo, greenhouse)")
    serve.set_defaults(func=_cmd_serve)

    principal = sub.add_parser("principal", help="who may use the API: tokens and roles")
    principal_sub = principal.add_subparsers(dest="principal_command", required=True)
    padd = principal_sub.add_parser("add", help="add a principal and print its token once")
    padd.add_argument("id")
    padd.add_argument("--kind", required=True, choices=["human", "agent"])
    padd.add_argument("--role", required=True, action="append", choices=["requester", "approver"])
    principal_sub.add_parser("list")
    principal_sub.add_parser("token", help="replace the token; the old one stops working").add_argument("id")
    prev = principal_sub.add_parser("revoke")
    prev.add_argument("id")
    prev.add_argument("--reason", required=True)
    principal.set_defaults(func=_cmd_principal)

    key = sub.add_parser("key", help="Ed25519 keys for signed approvals")
    key_sub = key.add_subparsers(dest="key_command", required=True)
    key_sub.add_parser("generate", help="write a new private key (0600; never overwrites)").add_argument(
        "path"
    )
    key_sub.add_parser("register", help="register its public half to $NEXUS_ACTOR").add_argument("path")
    key.set_defaults(func=_cmd_key)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # argparse exits 2 on usage errors already; keep 0 for --help
        return int(exc.code or 0)
    try:
        return args.func(args)
    except (OSError, ValueError, DatabaseError, asyncpg.PostgresError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
