"""`nexus` command line. Exit codes: 0 valid, 1 validation issues, 2 usage or IO error."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from .contracts import Kind, kind_from_name, load_schemas, schema_for, validate_file
from .contracts.registry import SCHEMA_FILE

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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # argparse exits 2 on usage errors already; keep 0 for --help
        return int(exc.code or 0)
    try:
        return args.func(args)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
