"""Paths and example discovery shared by the tests."""

from __future__ import annotations

import json
from pathlib import Path

from nexus.contracts import kind_from_name

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "contracts" / "examples"
SCHEMAS = ROOT / "contracts" / "v1"


def valid_examples() -> list[Path]:
    return sorted(p for p in (EXAMPLES / "valid").iterdir() if kind_from_name(p))


def invalid_examples() -> list[tuple[Path, str, list[str]]]:
    """(document, kind, expected codes) for every X.expect.json sidecar."""
    cases = []
    for expect in sorted((EXAMPLES / "invalid").glob("*.expect.json")):
        spec = json.loads(expect.read_text(encoding="utf-8"))
        stem = expect.name.removesuffix(".expect.json")
        (doc,) = (EXAMPLES / "invalid").glob(f"{stem}.{spec['kind']}.*")
        cases.append((doc, spec["kind"], spec["codes"]))
    return cases


def ids(paths: list[Path] | list[tuple[Path, str, list[str]]]) -> list[str]:
    return [(p[0] if isinstance(p, tuple) else p).name for p in paths]
