"""A8: nothing in nexus/ reaches outside nexus/ (README, "The standalone rule")."""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

import pytest

from .support import ROOT

SKIP_DIRS = {".venv", ".git", ".pytest_cache", ".ruff_cache", "__pycache__", "build", "dist"}
TEXT_SUFFIXES = {".py", ".md", ".toml", ".yaml", ".yml", ".json", ".cfg", ".ini", ".txt", ""}
SKIP_FILES = {"uv.lock", "LICENSE"}
# Third-party top-level modules our declared dependencies provide.
DEPENDENCY_MODULES = {"jsonschema", "referencing", "pydantic", "yaml", "pytest", "asyncpg"}

LINK = re.compile(r"(?:\]\(|`|\"|'|\s)((?:\.\./)+[^\s)`\"']*)")
ABSOLUTE = re.compile(r"(?<![\w.:/])(/Users/|/home/|/private/|/tmp/|[A-Z]:\\\\)")


def files() -> list[Path]:
    out = []
    for path in ROOT.rglob("*"):
        rel = path.relative_to(ROOT)
        keep = path.suffix in TEXT_SUFFIXES or path.name == "Makefile"
        if keep and path.is_file() and not SKIP_DIRS & set(rel.parts) and path.name not in SKIP_FILES:
            out.append(path)
    return sorted(out)


FILES = files()


def leaves_root(path: Path, target: str) -> bool:
    return not (path.parent / target).resolve().is_relative_to(ROOT.resolve())


@pytest.mark.parametrize("path", FILES, ids=[str(p.relative_to(ROOT)) for p in FILES])
def test_no_reference_outside_nexus(path):
    text = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(ROOT))
    # Invalid examples and the rule tests contain escaping paths on purpose.
    if not rel.startswith("contracts/examples/invalid/") and rel != "tests/test_semantic_rules.py":
        assert not [t for t in LINK.findall(text) if leaves_root(path, t)]
    if rel != "tests/test_standalone.py":  # this file spells the patterns out
        assert not ABSOLUTE.findall(text), f"absolute path in {rel}"


def test_imports_are_stdlib_dependencies_or_nexus():
    allowed = set(sys.stdlib_module_names) | DEPENDENCY_MODULES | {"nexus", "tests"}
    bad = []
    for path in FILES:
        if path.suffix != ".py":
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            else:
                continue
            bad += [f"{path.relative_to(ROOT)}: {n}" for n in names if n.split(".")[0] not in allowed]
    assert not bad


def test_the_scan_sees_the_project():
    rels = {str(p.relative_to(ROOT)) for p in FILES}
    assert {"pyproject.toml", "src/nexus/cli.py", "contracts/v1/event.schema.json"} <= rels
