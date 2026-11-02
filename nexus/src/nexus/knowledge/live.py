"""Live reads of observables for grounding answers (P7.md §2.4).

A fresh value comes with its unit and age. A stale or missing one comes without any value, only
the fact that there is none fresh, so a model shown the read has nothing to repeat: a question
about a current value can only be answered from a fresh read."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from ..gate.gate import parse_ts
from ..gate.packs import LoadedPack
from ..plan.planner import ContextItem
from ..store import EventStore
from .assets import AssetGraph


@dataclass(frozen=True)
class LiveRead:
    entity: str  # the asset, e.g. greenhouse.zone[2]
    key: str  # the observable key, e.g. greenhouse.zone[2].setpoint_c
    pack: str
    status: str  # fresh | stale | missing
    value: Any
    unit: str | None
    age_s: float | None
    max_age_s: int
    updated_at: str | None
    description: str | None

    @property
    def numeric(self) -> bool:
        value = self.value
        return self.status == "fresh" and isinstance(value, int | float) and not isinstance(value, bool)

    def text(self) -> str:
        """What the model is shown. Only a fresh read carries the value."""
        what = f"{self.key}" + (f" ({self.description})" if self.description else "")
        if self.status == "fresh":
            unit = f" {self.unit}" if self.unit else ""
            age = f"read {self.age_s:.0f} s ago (max {self.max_age_s} s)"
            return f"{what} = {_format(self.value)}{unit}, {age}."
        if self.status == "stale":
            return (
                f"{what}: no fresh value; the last one is {self.age_s:.0f} s old (max {self.max_age_s} s), "
                "so the current value is unknown."
            )
        return f"{what}: no value has been recorded, so the current value is unknown."

    def provenance(self) -> dict[str, Any]:
        out: dict[str, Any] = {"pack": self.pack, "key": self.key, "status": self.status}
        if self.status == "fresh":
            out |= {"value": self.value, "unit": self.unit, "age_s": round(self.age_s or 0.0, 3)}
        if self.updated_at is not None:
            out["updated_at"] = self.updated_at
        return out


def _format(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _spec(pack: LoadedPack, key: str) -> Mapping[str, Any] | None:
    declared = pack.observable_for(key)
    if declared is None:
        return None
    return next((o for o in pack.manifest["observables"] if o["id"] == declared.id), None)


async def read_entities(
    store: EventStore,
    graph: AssetGraph,
    packs: Mapping[str, LoadedPack],
    entities: Iterable[str],
    now: datetime | None = None,
) -> list[LiveRead]:
    """Every observable of every entity, in order. World state is keyed (pack id, observable key)."""
    now = now or store.clock()
    reads: list[LiveRead] = []
    seen: set[str] = set()
    for entity in entities:
        asset = graph.asset_of(entity)
        if asset is None or asset.pack not in packs:
            continue
        pack = packs[asset.pack]
        for key in graph.observables_of(entity):
            spec = _spec(pack, key)
            if spec is None or key in seen:
                continue
            seen.add(key)
            reads.append(await _read(store, pack, entity, key, spec, now))
    return reads


async def _read(
    store: EventStore, pack: LoadedPack, entity: str, key: str, spec: Mapping[str, Any], now: datetime
) -> LiveRead:
    row = await store.state.get(pack.id, key)
    common = {
        "entity": entity,
        "key": key,
        "pack": pack.id,
        "unit": spec.get("unit"),
        "max_age_s": spec["max_age_s"],
        "description": spec.get("description"),
    }
    if row is None:
        return LiveRead(status="missing", value=None, age_s=None, updated_at=None, **common)
    age = max(0.0, (now - parse_ts(row.updated_at)).total_seconds())
    if age > spec["max_age_s"]:
        return LiveRead(status="stale", value=None, age_s=age, updated_at=row.updated_at, **common)
    return LiveRead(status="fresh", value=row.value, age_s=age, updated_at=row.updated_at, **common)


def states_value(text: str, value: Any) -> bool:
    """Does `text` state the number `value`, to the precision it is written? 21.5 matches "21.5"
    and "21.50", not "21" or "215"."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return True
    for m in re.finditer(r"(?<![\d.])-?\d+(?:\.\d+)?(?![\d])", text):
        try:
            if float(m.group()) == float(value):
                return True
        except ValueError:
            continue
    return False


def context_item(reads: Sequence[LiveRead], item_id: str = "live") -> ContextItem:
    """Live reads as one planner context item. Its source is `tool`, never `user`, so a value read
    from the system cannot by itself trigger an action (P2 taint rule)."""
    text = " ".join(r.text() for r in reads) or "no live readings"
    return ContextItem(item_id, "tool", "live:" + ",".join(r.key for r in reads), text)
