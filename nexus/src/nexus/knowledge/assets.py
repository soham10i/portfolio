"""The asset graph and deterministic entity resolution (P7.md §2.3, ADR-0024).

Packs declare their assets: a site, a numbered family such as `greenhouse.zone[*]` with
`count: 4`, a single roof vent. `AssetGraph.resolve(text)` turns the phrases that name them into
entity ids, "zone two" → `greenhouse.zone[2]`, with no model involved. The result is a pure
function of the text and the graph: the same text always gives the same mentions, whatever order
the packs were loaded in.

A mention is `resolved` (one or more concrete entities), `ambiguous` (a family named without a
number, or an alias two assets share) or `unknown` (a member that does not exist, "zone 7")."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

FAMILY = "[*]"
NUMBER_WORDS = {
    w: i
    for i, w in enumerate(
        [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
            "twenty",
        ]
    )
}
ORDINAL_WORDS = {
    w: i
    for i, w in enumerate(
        [
            "zeroth",
            "first",
            "second",
            "third",
            "fourth",
            "fifth",
            "sixth",
            "seventh",
            "eighth",
            "ninth",
            "tenth",
            "eleventh",
            "twelfth",
            "thirteenth",
            "fourteenth",
            "fifteenth",
            "sixteenth",
            "seventeenth",
            "eighteenth",
            "nineteenth",
            "twentieth",
        ]
    )
}
ALL_WORDS = frozenset({"all", "every", "each"})
LIST_WORDS = frozenset({",", "and", "&", "or"})
NUMBER_PREFIX = frozenset({"number", "no", "#", "nr"})
# A number followed by one of these is a quantity, not a member: "zone 2 and 3 litres".
UNIT_WORDS = frozenset(
    [
        "l",
        "litre",
        "litres",
        "liter",
        "liters",
        "ml",
        "minute",
        "minutes",
        "min",
        "mins",
        "hour",
        "hours",
        "h",
        "s",
        "second",
        "seconds",
        "percent",
        "pct",
        "%",
        "degree",
        "degrees",
        "deg",
        "c",
        "celsius",
        "f",
        "fahrenheit",
        "kg",
        "g",
    ]
)
_TOKEN = re.compile(r"\d+(?:st|nd|rd|th)?|[a-z]+\d+|[a-z]+|#|,|&|%")
_ORDINAL_DIGITS = re.compile(r"^(\d+)(?:st|nd|rd|th)$")
_COMPACT = re.compile(r"^([a-z]+)(\d+)$")


@dataclass(frozen=True)
class Asset:
    id: str
    pack: str
    kind: str
    name: str
    aliases: tuple[str, ...]
    parent: str | None
    count: int | None
    observables: tuple[str, ...]

    @property
    def is_family(self) -> bool:
        return self.id.endswith(FAMILY)

    def member(self, n: int) -> str:
        return self.id[: -len(FAMILY)] + f"[{n}]"

    def members(self) -> list[str]:
        return [self.member(n) for n in range(1, (self.count or 0) + 1)]


@dataclass(frozen=True)
class Mention:
    text: str
    start: int
    end: int
    status: str  # resolved | ambiguous | unknown
    entities: tuple[str, ...] = ()
    candidates: tuple[str, ...] = ()
    reason: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "start": self.start,
            "end": self.end,
            "status": self.status,
            "entities": list(self.entities),
            "candidates": list(self.candidates),
            "reason": self.reason,
        }


@dataclass(frozen=True)
class _Tok:
    text: str
    start: int
    end: int


def _tokens(text: str) -> list[_Tok]:
    """Lower-cased tokens with their spans in the original text. 'z2' becomes 'z', '2'."""
    out: list[_Tok] = []
    lowered = text.lower()
    for m in _TOKEN.finditer(lowered):
        compact = _COMPACT.match(m.group())
        if compact:
            split = m.start() + len(compact.group(1))
            out += [_Tok(compact.group(1), m.start(), split), _Tok(compact.group(2), split, m.end())]
        else:
            out.append(_Tok(m.group(), m.start(), m.end()))
    return out


def _cardinal(tok: str) -> int | None:
    if tok.isdigit():
        return int(tok)
    return NUMBER_WORDS.get(tok)


def _ordinal(tok: str) -> int | None:
    m = _ORDINAL_DIGITS.match(tok)
    return int(m.group(1)) if m else ORDINAL_WORDS.get(tok)


@dataclass
class AssetGraph:
    assets: dict[str, Asset] = field(default_factory=dict)
    _aliases: dict[tuple[str, ...], list[str]] = field(default_factory=dict)

    @classmethod
    def from_manifests(cls, manifests: Iterable[Mapping[str, Any]]) -> AssetGraph:
        graph = cls()
        for manifest in sorted(manifests, key=lambda m: m["pack"]):
            for spec in manifest.get("assets") or ():
                graph._add(manifest["pack"], spec)
        return graph

    @classmethod
    def from_packs(cls, packs: Iterable[Any]) -> AssetGraph:
        return cls.from_manifests(p.manifest for p in packs)

    def _add(self, pack: str, spec: Mapping[str, Any]) -> None:
        if spec["id"] in self.assets:
            raise ValueError(f"asset {spec['id']} is declared twice")
        aliases = tuple(dict.fromkeys([spec["name"].lower(), *spec.get("aliases", ())]))
        asset = Asset(
            spec["id"],
            pack,
            spec["kind"],
            spec["name"],
            aliases,
            spec.get("parent"),
            spec.get("count"),
            tuple(spec.get("observables", ())),
        )
        self.assets[asset.id] = asset
        for alias in aliases:
            words = tuple(t.text for t in _tokens(alias))
            if words:
                ids = self._aliases.setdefault(words, [])
                if asset.id not in ids:
                    ids.append(asset.id)
                    ids.sort()

    # ── lookups ──────────────────────────────────────────────────────────────

    def asset_of(self, entity: str) -> Asset | None:
        """The asset that declares an entity id: `greenhouse.zone[2]` → the zone family."""
        if entity in self.assets:
            return self.assets[entity]
        family = re.sub(r"\[(\d+)\]$", FAMILY, entity)
        asset = self.assets.get(family)
        if asset is None or not asset.is_family:
            return None
        n = int(re.search(r"\[(\d+)\]$", entity).group(1))
        return asset if 1 <= n <= (asset.count or 0) else None

    def observables_of(self, entity: str) -> list[str]:
        """The concrete observable keys of an entity: zone[2] → zone[2].setpoint_c, ..."""
        asset = self.asset_of(entity)
        if asset is None:
            return []
        if not asset.is_family:
            return list(asset.observables)
        index = entity[entity.rindex("[") :]
        return [o.replace(FAMILY, index, 1) for o in asset.observables]

    def path(self, entity: str) -> list[str]:
        """The entity and its ancestors, nearest first."""
        out = [entity]
        asset = self.asset_of(entity)
        while asset is not None and asset.parent:
            out.append(asset.parent)
            asset = self.assets.get(asset.parent)
        return out

    # ── resolution ───────────────────────────────────────────────────────────

    def _match_alias(self, toks: Sequence[_Tok], i: int) -> tuple[int, list[str]] | None:
        """The longest alias starting at token i (a trailing 's' or 'es' allowed for plurals)."""
        best: tuple[int, list[str]] | None = None
        for words, ids in self._aliases.items():
            n = len(words)
            if i + n > len(toks):
                continue
            got = [t.text for t in toks[i : i + n]]
            last = got[-1]
            same = got[:-1] == list(words[:-1]) and last in (words[-1], words[-1] + "s", words[-1] + "es")
            if same and (best is None or n > best[0] or (n == best[0] and ids < best[1])):
                best = (n, ids)
        return best

    def _number_at(self, toks: Sequence[_Tok], j: int) -> tuple[int, int] | None:
        """(value, next index) for a member number at j: '2', 'two', '#2', 'number 2'."""
        if j < len(toks) and toks[j].text in NUMBER_PREFIX:
            j += 1
        if j >= len(toks):
            return None
        value = _cardinal(toks[j].text)
        if value is None:
            value = _ordinal(toks[j].text)
        if value is None:
            return None
        if j + 1 < len(toks) and toks[j + 1].text in UNIT_WORDS:
            return None
        return value, j + 1

    def resolve(self, text: str) -> list[Mention]:
        toks = _tokens(text)
        mentions: list[Mention] = []
        i = 0
        while i < len(toks):
            found = self._match_alias(toks, i)
            if found is None:
                i += 1
                continue
            width, ids = found
            end = i + width
            start_tok = i
            assets = [self.assets[a] for a in ids]
            families = [a for a in assets if a.is_family]
            if len(assets) > 1:
                mention = Mention("", 0, 0, "ambiguous", candidates=tuple(ids), reason="names several assets")
            elif not families:
                mention = Mention("", 0, 0, "resolved", entities=(assets[0].id,))
            else:
                family = families[0]
                numbers: list[int] = []
                number = self._number_at(toks, end)
                while number is not None:
                    numbers.append(number[0])
                    end = number[1]
                    if end < len(toks) and toks[end].text in LIST_WORDS:
                        nxt = end + 1
                        if nxt < len(toks) and toks[nxt].text in LIST_WORDS:
                            nxt += 1  # ", and"
                        number = self._number_at(toks, nxt)
                        if number is None:
                            break
                    else:
                        break
                k = start_tok - 1
                if not numbers and k >= 0 and _ordinal(toks[k].text) is not None:
                    numbers, start_tok = [_ordinal(toks[k].text)], k  # "the second zone"
                elif not numbers:
                    while (
                        k >= 0
                        and start_tok - k <= 3
                        and (toks[k].text in ("the", "of") or _cardinal(toks[k].text) is not None)
                    ):
                        k -= 1  # "all four zones", "all of the zones"
                    if k >= 0 and toks[k].text in ALL_WORDS:
                        numbers, start_tok = list(range(1, (family.count or 0) + 1)), k
                mention = self._family_mention(family, numbers)
            span_start, span_end = toks[start_tok].start, toks[end - 1].end
            mentions.append(
                Mention(
                    text[span_start:span_end],
                    span_start,
                    span_end,
                    mention.status,
                    mention.entities,
                    mention.candidates,
                    mention.reason,
                )
            )
            i = end
        return mentions

    def _family_mention(self, family: Asset, numbers: list[int]) -> Mention:
        if not numbers:
            which = f"which {family.name.lower()}?"
            return Mention("", 0, 0, "ambiguous", candidates=tuple(family.members()), reason=which)
        count = family.count or 0
        bad = [n for n in numbers if not 1 <= n <= count]
        if bad:
            return Mention(
                "", 0, 0, "unknown", reason=f"{family.name.lower()} {bad[0]} is not one of 1 to {count}"
            )
        return Mention("", 0, 0, "resolved", entities=tuple(family.member(n) for n in dict.fromkeys(numbers)))

    def entities_in(self, text: str) -> list[str]:
        """Every resolved entity in the text, in order, once."""
        out: dict[str, None] = {}
        for m in self.resolve(text):
            if m.status == "resolved":
                out.update(dict.fromkeys(m.entities))
        return list(out)
