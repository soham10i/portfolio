"""Errors raised by the event store."""

from __future__ import annotations


class StoreError(ValueError):
    """An append or state write was rejected; nothing was written."""


class CasConflict(StoreError):
    """Compare-and-set failed: the key's version is not the one the writer expected."""

    def __init__(self, entity: str, key: str, expected: int, actual: int) -> None:
        super().__init__(f"{entity}/{key}: expected version {expected}, found {actual}")
        self.entity, self.key, self.expected, self.actual = entity, key, expected, actual
