"""A pack manifest loaded for the gate: validated, with every expression compiled once."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from ..cel import Expr, compile_expr
from ..contracts import Kind, validate
from ..contracts.validate import ValidationIssue, load_document

_INDEX = re.compile(r"\[\d+\]")


class PackError(ValueError):
    """The manifest is not a valid v1 pack."""

    def __init__(self, source: str, issues: list[ValidationIssue]) -> None:
        super().__init__(f"{source}: " + "; ".join(str(i) for i in issues[:5]))
        self.issues = issues


@dataclass(frozen=True)
class Observable:
    id: str
    type: str
    max_age_s: int


@dataclass(frozen=True)
class LoadedAction:
    pack: str
    spec: Mapping[str, Any]
    preconditions: tuple[Expr, ...]
    params_validator: Draft202012Validator
    param_types: Mapping[str, str]

    @property
    def id(self) -> str:
        return self.spec["id"]

    @property
    def qualified(self) -> str:
        return f"{self.pack}:{self.id}"


@dataclass(frozen=True)
class LoadedPack:
    id: str
    version: str
    manifest: Mapping[str, Any]
    actions: Mapping[str, LoadedAction]
    observables: Mapping[str, Observable] = field(default_factory=dict)

    @classmethod
    def from_document(cls, doc: Mapping[str, Any], source: str = "<pack>") -> LoadedPack:
        """Validate (schema and semantic rules, including CEL_SYNTAX) and compile."""
        issues = validate(Kind.PACK, doc)
        if issues:
            raise PackError(source, issues)
        actions = {}
        for spec in doc["actions"]:
            properties = spec["params"]["properties"]
            actions[spec["id"]] = LoadedAction(
                pack=doc["pack"],
                spec=spec,
                preconditions=tuple(compile_expr(src) for src in spec["preconditions"]),
                params_validator=Draft202012Validator(spec["params"]),
                param_types={name: p["type"] for name, p in properties.items()},
            )
        observables = {o["id"]: Observable(o["id"], o["type"], o["max_age_s"]) for o in doc["observables"]}
        return cls(doc["pack"], doc["version"], doc, actions, observables)

    @classmethod
    def from_file(cls, path: str | Path) -> LoadedPack:
        return cls.from_document(load_document(Path(path)), str(path))

    @property
    def label(self) -> str:
        return f"{self.id}@{self.version}"

    def observable_for(self, key: str) -> Observable | None:
        """The observable that declares a state key: 'oven.zone[2].mode' matches 'oven.zone[*].mode'."""
        return self.observables.get(key) or self.observables.get(_INDEX.sub("[*]", key))
