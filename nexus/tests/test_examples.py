"""A4 + A7: valid examples pass, invalid ones fail with exactly their codes, all without network."""

from __future__ import annotations

import pytest

from nexus.contracts import SEMANTIC_CODES, validate_file

from .support import ids, invalid_examples, valid_examples

VALID = valid_examples()
INVALID = invalid_examples()


@pytest.mark.parametrize("path", VALID, ids=ids(VALID))
def test_valid_example_passes(path, no_network):
    assert validate_file(path) == []


@pytest.mark.parametrize(("path", "kind", "codes"), INVALID, ids=ids(INVALID))
def test_invalid_example_fails_with_exactly_its_codes(path, kind, codes, no_network):
    issues = validate_file(path)
    assert {i.code for i in issues} == set(codes), [str(i) for i in issues]


def test_every_semantic_code_has_exactly_one_example():
    covered = [c for _, _, codes in INVALID for c in codes if c != "SCHEMA"]
    assert sorted(covered) == sorted(SEMANTIC_CODES)


def test_examples_cover_every_kind():
    from nexus.contracts import Kind, kind_from_name

    assert {kind_from_name(p) for p in VALID} == set(Kind)


def test_sidecars_are_not_documents():
    from nexus.contracts import kind_from_name

    assert all(kind_from_name(p.with_name(p.stem + ".expect.json")) is None for p, _, _ in INVALID)
