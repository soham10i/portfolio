"""Fixtures shared by the tests."""

from __future__ import annotations

import pytest


@pytest.fixture
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Any attempt to open a socket fails the test."""
    import socket

    def refuse(*_: object, **__: object) -> None:
        raise AssertionError("network access during validation")

    monkeypatch.setattr(socket, "socket", refuse)
    monkeypatch.setattr(socket, "create_connection", refuse)
