"""`nexus` command line. Exit codes: 0 valid / intact, 1 issues found, 2 usage, IO or database error.

Database commands read NEXUS_DB_URL, and NEXUS_DB_SCHEMA when the tables live in another schema.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path

import asyncpg

from .contracts import Kind, kind_from_name, load_schemas, schema_for, validate_file
from .contracts.registry import SCHEMA_FILE
from .store import EventStore

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
            store = await EventStore.connect(url, schema=os.environ.get("NEXUS_DB_SCHEMA"), pool_size=2)
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


def _cmd_chain_verify(args: argparse.Namespace) -> int:
    report = _with_store(lambda store: store.verify_chain(args.stream))
    for problem in report.problems:
        print(problem)
    streams = f"{report.streams_checked} stream{'s' if report.streams_checked != 1 else ''}"
    n = len(report.problems)
    verdict = "intact" if report.ok else f"{n} problem{'s' if n != 1 else ''}"
    print(f"{report.events_checked} events in {streams}: {verdict}")
    return EXIT_OK if report.ok else EXIT_INVALID


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
    verify = chain.add_subparsers(dest="chain_command", required=True).add_parser(
        "verify", help="recompute every hash and check links and stream heads"
    )
    verify.add_argument("--stream", help="only this stream")
    verify.set_defaults(func=_cmd_chain_verify)

    state = sub.add_parser("state", help="the world-state projection")
    state.add_subparsers(dest="state_command", required=True).add_parser(
        "check", help="rebuild state from events and compare it with the live table"
    ).set_defaults(func=_cmd_state_check)
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
