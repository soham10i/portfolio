"""The actions the planner may propose, as the model sees them (P6.md §2).

Only actions whose effective autonomy is L2 or above are offered: an L0 or L1 action can never
execute, so proposing one only wastes a gate decision. The text is deterministic (sorted, same
packs → same bytes), so the prompt hash of a recorded reply stays stable."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from jsonschema import Draft202012Validator

from ..gate import AUTONOMY_LEVELS, LoadedPack, Policy

PROPOSABLE = AUTONOMY_LEVELS[AUTONOMY_LEVELS.index("L2") :]


@dataclass(frozen=True)
class Entry:
    action: str  # qualified id, pack:action
    title: str
    description: str
    risk: str
    autonomy: str
    params: Mapping[str, Any]
    validator: Draft202012Validator

    def as_dict(self) -> dict[str, Any]:
        return {
            "action": self.action,
            "title": self.title,
            "description": self.description,
            "risk": self.risk,
            "params": self.params,
        }


class Catalog:
    def __init__(self, packs: Iterable[LoadedPack], policy: Policy) -> None:
        entries: dict[str, Entry] = {}
        for pack in packs:
            for action in pack.actions.values():
                autonomy = policy.effective_autonomy(pack.id, action.spec["autonomy"])
                if autonomy not in PROPOSABLE:
                    continue
                spec = action.spec
                entries[action.qualified] = Entry(
                    action=action.qualified,
                    title=spec["title"],
                    description=spec.get("description", spec["title"]),
                    risk=spec["risk"],
                    autonomy=autonomy,
                    params=spec["params"],
                    validator=action.params_validator,
                )
        self.entries = dict(sorted(entries.items()))

    def __contains__(self, action: object) -> bool:
        return action in self.entries

    def __len__(self) -> int:
        return len(self.entries)

    @property
    def actions(self) -> list[str]:
        return list(self.entries)

    def text(self) -> str:
        """One JSON object per line, keys sorted."""
        return "\n".join(json.dumps(e.as_dict(), sort_keys=True) for e in self.entries.values())

    def params_problem(self, action: str, params: Any) -> str | None:
        """Why `params` does not fit the action's schema, or None."""
        errors = sorted(self.entries[action].validator.iter_errors(params), key=lambda e: list(e.path))
        if not errors:
            return None
        where = "/".join(str(p) for p in errors[0].path) or "params"
        return f"{where}: {errors[0].message}"
