"""P2 A6: CEL compilation, typed conversion, and the state view that records reads (ADR-0011)."""

from __future__ import annotations

import pytest
from celpy import celtypes

from nexus.cel import CelError, StateView, compile_expr, params_map, parse_path, syntax_error, to_cel


def run(source, view=None, **params):
    activation = {"params": params_map(params, {k: "number" for k in params})}
    if view is not None:
        activation["state"] = view.root
    return compile_expr(source).evaluate(activation)


@pytest.mark.parametrize(
    ("value", "declared", "expected"),
    [
        (240, "number", celtypes.DoubleType(240.0)),
        (240.5, "number", celtypes.DoubleType(240.5)),
        (3, "integer", celtypes.IntType(3)),
        (True, "boolean", celtypes.BoolType(True)),
        ("idle", "enum", celtypes.StringType("idle")),
        ("x", "string", celtypes.StringType("x")),
    ],
)
def test_to_cel_converts_by_declared_type(value, declared, expected):
    converted = to_cel(value, declared)
    assert converted == expected and type(converted) is type(expected)


@pytest.mark.parametrize(
    ("value", "declared"),
    [
        (True, "number"),
        (True, "integer"),
        (3.5, "integer"),
        ("1", "number"),
        (1, "boolean"),
        (None, "string"),
    ],
)
def test_to_cel_rejects_a_value_of_another_type(value, declared):
    with pytest.raises(TypeError):
        to_cel(value, declared)


def test_int_and_double_params_compare_equal_once_converted():
    assert run("params.t <= 240.0", t=240) == celtypes.BoolType(True)
    assert run("params.t == 240.0", t=240.0) == celtypes.BoolType(True)


@pytest.mark.parametrize(
    ("key", "path"),
    [
        ("tank", ("tank",)),
        ("oven.zone[2].mode", ("oven", "zone", 2, "mode")),
        ("a[0][1]", ("a", 0, 1)),
        ("storage.raw_count", ("storage", "raw_count")),
    ],
)
def test_parse_path(key, path):
    assert parse_path(key) == path


@pytest.mark.parametrize("key", ["", "Oven", "a..b", "a[x]", "a.", "[1]", "a b", "a[1]b", ".a"])
def test_parse_path_rejects_malformed_keys(key):
    with pytest.raises(ValueError):
        parse_path(key)


def test_view_records_each_leaf_read():
    view = StateView(
        [("oven.zone[1].mode", to_cel("idle", "enum")), ("oven.zone[2].mode", to_cel("busy", "enum"))]
    )
    assert run("state.oven.zone[2].mode == 'busy'", view) == celtypes.BoolType(True)
    assert view.reads == ["oven.zone[2].mode"]
    view.reset()
    assert run("state.oven.zone.all(z, state.oven.zone[z].mode != 'fault')", view)
    assert sorted(set(view.reads)) == ["oven.zone[1].mode", "oven.zone[2].mode"]


@pytest.mark.parametrize(
    ("source", "missing"),
    [
        ("state.storage.raw_count > 1", "storage"),
        ("state.oven.zone[3].mode == 'idle'", "oven.zone[3]"),
        ("state.oven.zone[1].temp > 1.0", "oven.zone[1].temp"),
    ],
)
def test_view_records_missing_keys_and_the_expression_errors(source, missing):
    view = StateView([("oven.zone[1].mode", to_cel("idle", "enum"))])
    with pytest.raises(CelError):
        run(source, view)
    assert view.misses == [missing] and view.reads == []


def test_view_reports_keys_that_collide_with_a_prefix():
    view = StateView(
        [("a.b", celtypes.IntType(1)), ("a.b.c", celtypes.IntType(2)), ("a.b", celtypes.IntType(3))]
    )
    assert view.conflicts == ["a.b.c", "a.b"]
    assert run("state.a.b == 1", view)


@pytest.mark.parametrize(
    "source",
    ["params.t > 'x'", "params.t / 0 > 1", "size(params.t) > 0", "params.missing > 1.0", "1 / 0 == 1"],
)
def test_evaluation_errors_raise_cel_error(source):
    with pytest.raises(CelError):
        run(source, t=1.0)


def test_syntax_errors_report_a_column():
    assert syntax_error("params.t >= ") is not None
    assert "column" in syntax_error("state.a >= params[b")
    assert syntax_error("state.a.b == 'x' && params.t < 3.0") is None
    with pytest.raises(CelError):
        compile_expr("(((")


def test_compile_is_cached():
    assert compile_expr("1 == 1") is compile_expr("1 == 1")
