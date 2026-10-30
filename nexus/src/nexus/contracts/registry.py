"""Loads the v1 JSON Schemas and resolves $ref between them locally, never over the network."""

from __future__ import annotations

import json
from enum import StrEnum
from functools import cache
from importlib import resources
from pathlib import Path
from typing import Any

from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

BASE_URI = "https://nexus.local/contracts/v1/"


class Kind(StrEnum):
    """Top-level document kinds a file can be validated as."""

    PACK = "pack"
    ACTION = "action"
    PROPOSAL = "proposal"
    DECISION = "decision"
    EVIDENCE = "evidence"
    EVENT = "event"


SCHEMA_FILE: dict[Kind, str] = {
    Kind.PACK: "pack-manifest.schema.json",
    Kind.ACTION: "action.schema.json",
    Kind.PROPOSAL: "proposal.schema.json",
    Kind.DECISION: "decision.schema.json",
    Kind.EVIDENCE: "evidence-pack.schema.json",
    Kind.EVENT: "event.schema.json",
}


def schema_dir() -> Path:
    """Directory holding the v1 schemas: inside the installed wheel, else the source tree."""
    packaged = resources.files("nexus.contracts").joinpath("schemas", "v1")
    if packaged.is_dir():
        return Path(str(packaged))
    # Editable/dev install: canonical copies live at <repo>/contracts/v1.
    return Path(__file__).resolve().parents[3] / "contracts" / "v1"


@cache
def load_schemas() -> dict[str, dict[str, Any]]:
    """All v1 schemas keyed by file name."""
    directory = schema_dir()
    files = sorted(directory.glob("*.schema.json"))
    if not files:
        raise FileNotFoundError(f"no schemas found in {directory}")
    return {f.name: json.loads(f.read_text(encoding="utf-8")) for f in files}


@cache
def registry() -> Registry:
    """A referencing registry with every schema pre-loaded, so no $ref is ever fetched."""
    resources_ = [
        (BASE_URI + name, Resource.from_contents(body, default_specification=DRAFT202012))
        for name, body in load_schemas().items()
    ]
    return Registry().with_resources(resources_)


def schema_for(kind: Kind) -> dict[str, Any]:
    """The top-level schema for a document kind."""
    return load_schemas()[SCHEMA_FILE[kind]]
