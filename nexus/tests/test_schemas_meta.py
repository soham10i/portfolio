"""A3: every v1 schema is itself a valid JSON Schema 2020-12 document."""

from __future__ import annotations

import json

import pytest
from jsonschema import Draft202012Validator

from nexus.contracts import Kind, load_schemas, schema_for
from nexus.contracts.registry import schema_dir

from .support import SCHEMAS

FILES = sorted(SCHEMAS.glob("*.schema.json"))


@pytest.mark.parametrize("path", FILES, ids=[p.name for p in FILES])
def test_schema_is_valid_2020_12(path):
    schema = json.loads(path.read_text(encoding="utf-8"))
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["$id"] == f"https://nexus.local/contracts/v1/{path.name}"
    Draft202012Validator.check_schema(schema)


def test_every_kind_has_a_schema():
    for kind in Kind:
        assert schema_for(kind)["$id"].startswith("https://nexus.local/contracts/v1/")


def test_loaded_schemas_match_the_source_files():
    assert set(load_schemas()) == {p.name for p in FILES}
    for path in FILES:
        assert (schema_dir() / path.name).read_bytes() == path.read_bytes()
