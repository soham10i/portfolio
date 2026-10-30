"""CEL in NEXUS (ADR-0006, ADR-0011): compile once, convert values by their declared type, and
expose world state as nested maps that record which leaves an expression read."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import celpy
from celpy import celtypes

_ENV = celpy.Environment()
_SEGMENT = re.compile(r"([a-z][a-z0-9_]*)|\[(\d+)\]")

Path = tuple[str | int, ...]


class CelError(ValueError):
    """An expression did not parse, or did not evaluate."""


@dataclass(frozen=True)
class Expr:
    source: str
    program: Any

    def evaluate(self, activation: Mapping[str, Any]) -> Any:
        """The CEL value of the expression. Raises CelError instead of returning an error value."""
        try:
            result = self.program.evaluate(dict(activation))
        except celpy.CELEvalError as exc:
            raise CelError(_describe(exc)) from exc
        except (TypeError, KeyError, ValueError, ZeroDivisionError, OverflowError) as exc:
            raise CelError(f"{type(exc).__name__}: {exc}") from exc
        if isinstance(result, celpy.CELEvalError):
            raise CelError(_describe(result))
        return result


def _describe(exc: BaseException) -> str:
    args = getattr(exc, "args", ())
    return str(args[0]) if args else type(exc).__name__


@lru_cache(maxsize=4096)
def compile_expr(source: str) -> Expr:
    """Parse and plan one expression. Raises CelError with the parser's message."""
    try:
        return Expr(source, _ENV.program(_ENV.compile(source)))
    except celpy.CELParseError as exc:
        lines = str(exc).splitlines()
        caret = next((line.index("^") + 1 for line in lines if line.strip() == "^"), None)
        raise CelError(f"does not parse (column {caret})" if caret else "does not parse") from exc


def syntax_error(source: str) -> str | None:
    try:
        compile_expr(source)
    except CelError as exc:
        return str(exc)
    return None


# ── values ──────────────────────────────────────────────────────────────────────


def to_cel(value: Any, declared: str | None = None) -> Any:
    """Convert a JSON value to CEL. With a declared contract type the conversion is exact:
    'number' is always a double and 'integer' always an int, so 240 and 240.0 compare equal."""
    if declared is None:
        return celpy.json_to_cel(value)
    if declared == "number" and isinstance(value, int | float) and not isinstance(value, bool):
        return celtypes.DoubleType(float(value))
    if declared == "integer" and isinstance(value, int) and not isinstance(value, bool):
        return celtypes.IntType(value)
    if declared == "boolean" and isinstance(value, bool):
        return celtypes.BoolType(value)
    if declared in ("string", "enum") and isinstance(value, str):
        return celtypes.StringType(value)
    raise TypeError(f"{value!r} is not a {declared}")


def parse_path(key: str) -> Path:
    """'oven.zone[2].mode' -> ('oven', 'zone', 2, 'mode')."""
    parts: list[str | int] = []
    pos = 0
    while pos < len(key):
        if key[pos] == "." and parts:
            pos += 1
        match = _SEGMENT.match(key, pos)
        if not match:
            raise ValueError(f"not a state key: {key!r}")
        parts.append(match.group(1) if match.group(1) else int(match.group(2)))
        pos = match.end()
    if not parts:
        raise ValueError("empty state key")
    return tuple(parts)


def _cel_key(part: str | int) -> Any:
    return celtypes.IntType(part) if isinstance(part, int) else celtypes.StringType(part)


def _join(prefix: str, part: Any) -> str:
    if isinstance(part, int):
        return f"{prefix}[{part}]"
    return f"{prefix}.{part}" if prefix else str(part)


class _Tracked(celtypes.MapType):
    """A CEL map that appends the state key of every leaf read, and of every missing key asked
    for, to lists shared by the whole view."""

    def __init__(self, items: dict[Any, Any], leaves: dict[Any, str], view: StateView, prefix: str) -> None:
        super().__init__(items)
        self._leaves = leaves
        self._view = view
        self._prefix = prefix

    def __getitem__(self, key: Any) -> Any:
        try:
            value = super().__getitem__(key)
        except KeyError:
            self._view.misses.append(_join(self._prefix, key))
            raise
        if key in self._leaves:
            self._view.reads.append(self._leaves[key])
        return value


class StateView:
    """Nested CEL maps over flat state keys. Since the last `reset()`, `reads` lists the keys an
    expression read and `misses` the keys it asked for that do not exist."""

    def __init__(self, values: Iterable[tuple[str, Any]]) -> None:
        self.reads: list[str] = []
        self.misses: list[str] = []
        tree: dict[Any, Any] = {}
        self.conflicts: list[str] = []
        for key, value in values:
            path = parse_path(key)
            node = tree
            for part in path[:-1]:
                child = node.setdefault(part, {})
                if not isinstance(child, dict):
                    break
                node = child
            else:
                if path[-1] in node:
                    self.conflicts.append(key)
                    continue
                node[path[-1]] = (key, value)
                continue
            self.conflicts.append(key)  # a prefix of this key is itself a leaf
        self.root = self._build(tree, "")

    def reset(self) -> None:
        self.reads.clear()
        self.misses.clear()

    def _build(self, tree: dict[Any, Any], prefix: str) -> _Tracked:
        items: dict[Any, Any] = {}
        leaves: dict[Any, str] = {}
        for part, child in tree.items():
            key = _cel_key(part)
            if isinstance(child, dict):
                items[key] = self._build(child, _join(prefix, part))
            else:
                leaves[key] = child[0]
                items[key] = child[1]
        return _Tracked(items, leaves, self, prefix)


def params_map(params: Mapping[str, Any], types: Mapping[str, str]) -> Any:
    """Params as a CEL map, each converted by its declared type."""
    return celtypes.MapType({celtypes.StringType(k): to_cel(v, types.get(k)) for k, v in params.items()})
