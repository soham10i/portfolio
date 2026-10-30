"""Fixtures shared by the tests."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator

import pytest


@pytest.fixture
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Any attempt to open a socket fails the test."""
    import socket

    def refuse(*_: object, **__: object) -> None:
        raise AssertionError("network access during validation")

    monkeypatch.setattr(socket, "socket", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)


@pytest.fixture
def db_schema(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A fresh, migrated Postgres schema for one test, dropped afterwards.

    Integration tests only: skips when NEXUS_DB_URL is not set. The CLI picks the schema up from
    NEXUS_DB_SCHEMA, so CLI cases run against the same isolated data.
    """
    from .db import URL, create_schema, drop_schema

    if not URL:
        pytest.skip("NEXUS_DB_URL is not set")
    schema = asyncio.run(create_schema())
    monkeypatch.setenv("NEXUS_DB_SCHEMA", schema)
    try:
        yield schema
    finally:
        asyncio.run(drop_schema(schema))
