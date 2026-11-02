"""P4 A2: the echo binding, and loading bindings only from allowed modules (ADR-0014)."""

from __future__ import annotations

import asyncio
import dataclasses
import importlib
import io

import pytest

from nexus.contracts import load_document
from nexus.exec import BindingError, ExecRequest
from nexus.packs import BindingLoadError, load_binding, load_pack
from nexus_packs.echo.binding import EchoBinding

from .support import ROOT


def test_echo_says_and_observes():
    out = io.StringIO()
    binding = EchoBinding(out)

    async def body() -> tuple[dict, dict]:
        before = dict(await binding.observe())
        await binding.execute(ExecRequest("echo.say", {"text": "hello"}, "k" * 8))
        return before, dict(await binding.observe())

    before, after = asyncio.run(body())
    assert before == {} and after == {"echo.last_message": "hello"}
    assert out.getvalue() == "echo> hello\n"


def test_echo_rejects_other_actions():
    with pytest.raises(BindingError, match=r"echo cannot echo\.shout"):
        asyncio.run(EchoBinding(io.StringIO()).execute(ExecRequest("echo.shout", {"text": "x"}, "k" * 8)))


def test_the_packaged_manifest_is_the_contract_example():
    example = load_document(ROOT / "contracts/examples/valid/echo.pack.yaml")
    assert load_pack("echo").manifest == example


def test_load_binding_builds_the_echo_binding():
    assert isinstance(load_binding(load_pack("echo")), EchoBinding)


def _with_connector(connector: dict) -> object:
    pack = load_pack("echo")
    return dataclasses.replace(pack, manifest={**pack.manifest, "connector": connector})


@pytest.mark.parametrize(
    ("connector", "message"),
    [
        ({"kind": "openapi", "spec": "x.yaml"}, "connector kind 'openapi' has no loader yet"),
        ({"kind": "python", "module": "os"}, "module 'os' is not under nexus_packs."),
        ({"kind": "python", "module": "nexus_packsevil.binding"}, "is not under nexus_packs."),
        ({"kind": "python", "module": "nexus.packs"}, "is not under nexus_packs."),
    ],
)
def test_load_binding_refuses_without_importing(connector, message, monkeypatch):
    pack = _with_connector(connector)
    imported: list[str] = []
    monkeypatch.setattr(importlib, "import_module", lambda name: imported.append(name))
    with pytest.raises(BindingLoadError, match=message):
        load_binding(pack)
    assert imported == []


def test_load_binding_needs_a_factory():
    with pytest.raises(BindingLoadError, match="has no create_binding"):
        load_binding(_with_connector({"kind": "python", "module": "nexus_packs.echo"}))


def test_load_pack_refuses_odd_ids():
    with pytest.raises(ValueError, match="not a pack id"):
        load_pack("../echo")
    with pytest.raises(FileNotFoundError):
        load_pack("nothing_here")
