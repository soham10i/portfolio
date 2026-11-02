# 0024. The asset graph in pack manifests, and deterministic entity resolution

Date: 2026-10-31

## Status

Accepted (P7). An additive contract change to `pack-manifest.schema.json` v1.

## Context

Questions name things in many ways: "zone two", "z2", "the second bed", "all zones", "the
boiler". To read the right live values the answerer must turn those phrases into entity ids
(`greenhouse.zone[2]`) and from there into observable keys. Letting a model do it would make
the most safety-relevant step (which value is read) depend on a model that may be wrong, and
would not be replayable without recording it too.

## Decision

- **Packs declare `assets`.** Each has an id, kind, name, optional aliases, parent, observables
  and description. A numbered family ends in `[*]` and must give `count` (and only a family may).
  Two semantic rules: `DUPLICATE_ASSET`, and `UNKNOWN_ASSET_REF` (a parent declared earlier, and
  every observable declared and belonging to its asset, a family's own `[*]` keys only).
- **Resolution is code, not a model.** `AssetGraph.resolve` tokenises the text, matches the
  longest alias (plural allowed), then reads member numbers after it (digits, words, `#2`,
  "number 2", lists with "and"/","/"or") or before it ("second zone", "all four zones"). A
  number followed by a unit is a quantity, not a member.
- **Three outcomes.** `resolved` (one or more entities), `ambiguous` (a family with no number,
  or an alias two assets share, with the candidates) and `unknown` (a member out of range). Only
  resolved entities are read; the others are reported, never guessed.
- **Order-independent.** Manifests are sorted by pack id and candidate lists are sorted, so the
  result does not depend on load order. The 50-case suite checks both orders.

## Alternatives

- **Model-based extraction** (ask the model which entities a question names). Handles odd
  phrasings, but is non-deterministic, costs a call per question, and a wrong entity silently
  reads the wrong value.
- **Aliases in a separate file per pack.** Keeps the manifest small but splits one contract in
  two; the manifest is already where observables are declared.
- **Fuzzy matching** (edit distance). Turns typos into confident matches on the wrong asset.
  Rejected; an unmatched phrase simply reads nothing.

## Consequences

- A pack without `assets` still loads and validates; its questions get documents and memories
  but no live reads.
- New phrasings need new aliases, added by the pack author and covered by the suite.
