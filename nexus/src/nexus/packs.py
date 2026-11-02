"""Finding first-party packs and loading their bindings (ADR-0014).

Importing a module is running it, so a manifest may only name a module under an allowed prefix."""

from __future__ import annotations

import importlib
from collections.abc import Sequence
from importlib import resources
from pathlib import Path

from .exec import Binding
from .gate import LoadedPack

DEFAULT_ALLOWED = ("nexus_packs.",)


class BindingLoadError(ValueError):
    """The manifest's connector cannot be loaded; nothing was imported."""


def load_pack(pack_id: str) -> LoadedPack:
    """The manifest of a first-party pack, from `nexus_packs/<id>/<id>.pack.yaml`."""
    if not pack_id.isidentifier():
        raise ValueError(f"{pack_id!r} is not a pack id")
    manifest = resources.files("nexus_packs").joinpath(pack_id, f"{pack_id}.pack.yaml")
    with resources.as_file(manifest) as path:
        if not path.is_file():
            raise FileNotFoundError(f"no first-party pack {pack_id!r}")
        return LoadedPack.from_file(path)


def pack_root(pack_id: str) -> Path:
    """The folder of a first-party pack; its `knowledge` paths are relative to it."""
    if not pack_id.isidentifier():
        raise ValueError(f"{pack_id!r} is not a pack id")
    return Path(str(resources.files("nexus_packs").joinpath(pack_id)))


def load_binding(pack: LoadedPack, allowed: Sequence[str] = DEFAULT_ALLOWED) -> Binding:
    """Import the pack's python connector and call its `create_binding(pack)`."""
    connector = pack.manifest.get("connector") or {}
    if connector.get("kind") != "python":
        raise BindingLoadError(f"{pack.label}: connector kind {connector.get('kind')!r} has no loader yet")
    module = connector.get("module", "")
    if not any(module.startswith(prefix) for prefix in allowed):
        raise BindingLoadError(f"{pack.label}: module {module!r} is not under {', '.join(allowed)}")
    factory = getattr(importlib.import_module(module), "create_binding", None)
    if not callable(factory):
        raise BindingLoadError(f"{pack.label}: {module} has no create_binding(pack)")
    return factory(pack)
