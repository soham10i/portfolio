# 0014. Packs ship as code under `nexus_packs`, and bindings load by an allowed prefix

Date: 2026-10-30

## Status

Accepted (P4).

## Context

A pack is a manifest plus the code that drives its system (the binding). The P0 echo example
already names its binding module `nexus_packs.echo.binding`, but nothing said where packs live,
how the executor gets a binding from a manifest, or which modules a manifest may name. Importing
a module named in a file is running code chosen by that file.

## Decision

1. **Layout.** Each first-party pack is a directory `src/nexus_packs/<id>/` with
   `<id>.pack.yaml` and `binding.py`. `nexus_packs` is a second top-level package in the same
   wheel, so an installed NEXUS finds its packs with `importlib.resources`. It may import `nexus`;
   `nexus` never imports a pack by name.
2. **Factory.** A binding module exposes `create_binding(pack: LoadedPack) -> Binding`.
3. **Loading.** `load_binding(pack, allowed=("nexus_packs.",))` loads only `connector.kind:
   python` modules whose dotted path starts with an allowed prefix. Anything else is an error, not
   a fallback. Other connector kinds (OpenAPI, MCP, OPC UA, MQTT) get their own loaders when their
   parts arrive (P11, P12).
4. **Validation.** `make validate` checks the pack manifests under `src/nexus_packs/` as well as
   the contract examples.

## Consequences

- Adding a third-party pack means widening `allowed` on purpose; a manifest alone cannot make
  NEXUS import arbitrary code.
- The standalone rule now allows the `nexus_packs` import root besides `nexus` and `tests`.
