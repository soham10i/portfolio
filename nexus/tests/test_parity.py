"""A5: the pydantic models and the JSON Schemas agree on every example.

The schemas are canonical. Semantic rules live only in validate.py, so the examples that break
nothing but a semantic rule are listed here: the models accept them, validate() does not.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from nexus.contracts import load_document, validate
from nexus.contracts.models import MODEL_FOR

from .support import ids, invalid_examples, valid_examples

SEMANTIC_ONLY = {
    "approvals-mismatch.decision.yaml",
    "compensation-loop.pack.yaml",
    "dup-action.pack.yaml",
    "dup-observable.pack.yaml",
    "envelope-mismatch.pack.yaml",
    "path-escape.pack.yaml",
    "prev-hash.event.yaml",
    "trigger-count.proposal.yaml",
    "unknown-compensation.pack.yaml",
    "unknown-sandbox.pack.yaml",
}

CASES = [(p, p.name.split(".")[-2]) for p in valid_examples()] + [(p, k) for p, k, _ in invalid_examples()]


def model_accepts(kind: str, data: object) -> bool:
    try:
        MODEL_FOR[kind].model_validate(data)
    except ValidationError:
        return False
    return True


@pytest.mark.parametrize(("path", "kind"), CASES, ids=ids([p for p, _ in CASES]))
def test_same_verdict(path, kind):
    data = load_document(path)
    schema_ok = not validate(kind, data)
    if path.name in SEMANTIC_ONLY:
        assert not schema_ok
        assert {i.code for i in validate(kind, data)} != {"SCHEMA"}
        assert model_accepts(kind, data), "a semantic-only example must be structurally valid"
    else:
        assert model_accepts(kind, data) == schema_ok


def test_semantic_only_list_is_exact():
    semantic = {p.name for p, _, codes in invalid_examples() if "SCHEMA" not in codes}
    assert semantic == SEMANTIC_ONLY


def test_models_cover_every_kind():
    from nexus.contracts import Kind

    assert set(MODEL_FOR) == {k.value for k in Kind}
