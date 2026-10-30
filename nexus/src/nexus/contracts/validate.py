"""Structural (JSON Schema) and semantic validation of v1 contract documents.

Structural errors all carry the code SCHEMA. Semantic rules run only on structurally
valid documents, so they can rely on the shape; each has a stable code (see RULES).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

from .registry import Kind, registry, schema_for

MAX_MESSAGE = 300


@dataclass(frozen=True, order=True)
class ValidationIssue:
    """One problem: a stable code, an RFC 6901 JSON Pointer into the document, and a message."""

    pointer: str
    code: str
    message: str

    def __str__(self) -> str:
        return f"{self.code} {self.pointer or '/'}: {self.message}"


# ── structural ─────────────────────────────────────────────────────────────────


def _pointer(parts: Any) -> str:
    return "".join("/" + str(p).replace("~", "~0").replace("/", "~1") for p in parts)


_validators: dict[Kind, Draft202012Validator] = {}


def _validator(kind: Kind) -> Draft202012Validator:
    if kind not in _validators:
        _validators[kind] = Draft202012Validator(
            schema_for(kind),
            registry=registry(),
            format_checker=Draft202012Validator.FORMAT_CHECKER,
        )
    return _validators[kind]


def _structural(kind: Kind, data: Any) -> list[ValidationIssue]:
    issues = []
    for err in _validator(kind).iter_errors(data):
        message = err.message if len(err.message) <= MAX_MESSAGE else err.message[: MAX_MESSAGE - 1] + "…"
        issues.append(ValidationIssue(_pointer(err.absolute_path), "SCHEMA", message))
    return issues


# ── semantic rules ─────────────────────────────────────────────────────────────

Rule = Callable[[Mapping[str, Any], str], Iterator[ValidationIssue]]

_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")


def _duplicates(
    items: list[Mapping[str, Any]], base: str, code: str, label: str
) -> Iterator[ValidationIssue]:
    seen: set[str] = set()
    for i, item in enumerate(items):
        if item["id"] in seen:
            yield ValidationIssue(f"{base}/{i}/id", code, f"duplicate {label} id '{item['id']}'")
        seen.add(item["id"])


def _rule_duplicate_action(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    yield from _duplicates(doc["actions"], f"{base}/actions", "DUPLICATE_ACTION", "action")


def _rule_duplicate_observable(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    yield from _duplicates(doc["observables"], f"{base}/observables", "DUPLICATE_OBSERVABLE", "observable")


def _rule_unknown_sandbox(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    declared = {s["id"] for s in doc.get("sandboxes", [])}
    for i, action in enumerate(doc["actions"]):
        if "sandbox" in action and action["sandbox"] not in declared:
            yield ValidationIssue(
                f"{base}/actions/{i}/sandbox",
                "UNKNOWN_SANDBOX",
                f"sandbox '{action['sandbox']}' is not declared in 'sandboxes'",
            )


def _rule_unknown_compensation(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    ids = {a["id"] for a in doc["actions"]}
    for i, action in enumerate(doc["actions"]):
        target = action.get("compensation", {}).get("action")
        if target is not None and target not in ids:
            yield ValidationIssue(
                f"{base}/actions/{i}/compensation/action",
                "UNKNOWN_COMPENSATION",
                f"compensation action '{target}' is not declared in this pack",
            )


def _rule_compensation_loop(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    # A compensating itself (restore the previous setpoint) is allowed: compensations are
    # never compensated. A chain that returns to its start through another action is not.
    edges = {a["id"]: a["compensation"]["action"] for a in doc["actions"] if "compensation" in a}
    index = {a["id"]: i for i, a in enumerate(doc["actions"])}
    for start, first in edges.items():
        node, path = first, [start]
        while node in edges and node not in path and node != edges.get(node):
            path.append(node)
            node = edges[node]
        if node == start and len(path) > 1:
            yield ValidationIssue(
                f"{base}/actions/{index[start]}/compensation/action",
                "SELF_COMPENSATION_LOOP",
                "compensation cycle: " + " -> ".join([*path, start]),
            )


def _envelope_issues(action: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    params = set(action["params"]["properties"])
    for key in action.get("envelope", {}):
        for suffix in ("_max", "_min"):
            if key.endswith(suffix) and key[: -len(suffix)] not in params:
                yield ValidationIssue(
                    f"{base}/envelope/{key}",
                    "ENVELOPE_PARAM_MISMATCH",
                    f"envelope '{key}' limits param '{key[: -len(suffix)]}', which is not declared",
                )


def _rule_envelope_manifest(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    for i, action in enumerate(doc["actions"]):
        yield from _envelope_issues(action, f"{base}/actions/{i}")


def _rule_envelope_action(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    yield from _envelope_issues(doc, base)


def _escapes(path: str) -> bool:
    if path.startswith(("/", "\\", "~")) or re.match(r"^[A-Za-z]:", path):
        return True
    return ".." in re.split(r"[\\/]", path)


def _rule_path_escape(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    for field in ("knowledge", "evals"):
        for i, path in enumerate(doc.get(field, [])):
            if _escapes(path) or _SCHEME.match(path):
                yield ValidationIssue(
                    f"{base}/{field}/{i}", "PATH_ESCAPE", f"'{path}' must stay inside the pack"
                )
    connector = doc["connector"]
    if connector["kind"] == "openapi":
        spec = connector["spec"]
        if not spec.startswith("https://") and (_escapes(spec) or _SCHEME.match(spec)):
            yield ValidationIssue(
                f"{base}/connector/spec",
                "PATH_ESCAPE",
                f"'{spec}' must be a relative path inside the pack or an https URL",
            )


def _rule_approvals(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    outcome, required = doc["outcome"], doc["approvals_required"]
    if (outcome == "NEEDS_APPROVAL") != (required > 0):
        yield ValidationIssue(
            f"{base}/approvals_required",
            "APPROVALS_MISMATCH",
            f"outcome {outcome} with approvals_required={required}",
        )


def _rule_prev_hash(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    if (doc["seq"] == 1) != (doc["prev_hash"] is None):
        yield ValidationIssue(
            f"{base}/prev_hash",
            "PREV_HASH_RULE",
            "prev_hash must be null exactly when seq is 1",
        )


def _rule_trigger_count(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
    triggered = [i for i, item in enumerate(doc["context"]) if item["triggered"]]
    for i in triggered[1:]:
        yield ValidationIssue(
            f"{base}/context/{i}/triggered",
            "TRIGGER_COUNT",
            f"{len(triggered)} context items are marked triggered; at most one may be",
        )


def _nested(rule: Rule, key: str) -> Rule:
    def run(doc: Mapping[str, Any], base: str) -> Iterator[ValidationIssue]:
        yield from rule(doc[key], f"{base}/{key}")

    return run


RULES: dict[Kind, list[Rule]] = {
    Kind.PACK: [
        _rule_duplicate_action,
        _rule_duplicate_observable,
        _rule_unknown_sandbox,
        _rule_unknown_compensation,
        _rule_compensation_loop,
        _rule_envelope_manifest,
        _rule_path_escape,
    ],
    Kind.ACTION: [_rule_envelope_action],
    Kind.PROPOSAL: [_rule_trigger_count],
    Kind.DECISION: [_rule_approvals],
    Kind.EVIDENCE: [_nested(_rule_trigger_count, "proposal"), _nested(_rule_approvals, "decision")],
    Kind.EVENT: [_rule_prev_hash],
}

SEMANTIC_CODES = frozenset(
    {
        "DUPLICATE_ACTION",
        "DUPLICATE_OBSERVABLE",
        "UNKNOWN_SANDBOX",
        "UNKNOWN_COMPENSATION",
        "SELF_COMPENSATION_LOOP",
        "ENVELOPE_PARAM_MISMATCH",
        "PATH_ESCAPE",
        "APPROVALS_MISMATCH",
        "PREV_HASH_RULE",
        "TRIGGER_COUNT",
    }
)


# ── public API ─────────────────────────────────────────────────────────────────


def validate(kind: Kind | str, data: Any) -> list[ValidationIssue]:
    """All issues for one document, sorted deterministically. An empty list means valid."""
    kind = Kind(kind)
    issues = _structural(kind, data)
    if not issues:
        for rule in RULES[kind]:
            issues.extend(rule(data, ""))
    return sorted(issues)


class _Loader(yaml.SafeLoader):
    """safe_load without implicit timestamps: '2026-10-30T10:00:00Z' stays a string, as in JSON."""


_Loader.yaml_implicit_resolvers = {
    ch: [(tag, rx) for tag, rx in resolvers if tag != "tag:yaml.org,2002:timestamp"]
    for ch, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}

_SUFFIX = re.compile(r"\.(pack|action|proposal|decision|evidence|event)\.(ya?ml|json)$")


def kind_from_name(path: Path) -> Kind | None:
    """Kind encoded in a file name such as 'stf.pack.yaml'."""
    match = _SUFFIX.search(path.name)
    return Kind(match.group(1)) if match else None


def load_document(path: Path) -> Any:
    """Parse YAML or JSON. Raises OSError or ValueError on unreadable or malformed files."""
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(text)
    try:
        return yaml.load(text, Loader=_Loader)  # noqa: S506 (_Loader subclasses SafeLoader)
    except yaml.YAMLError as exc:
        raise ValueError(f"invalid YAML: {exc}") from exc


def validate_file(path: Path, kind: Kind | str | None = None) -> list[ValidationIssue]:
    """Validate one file; the kind comes from the argument or the file name."""
    resolved = Kind(kind) if kind is not None else kind_from_name(path)
    if resolved is None:
        raise ValueError(f"{path}: cannot infer kind from the name; use <name>.<kind>.yaml or --kind")
    return validate(resolved, load_document(path))
