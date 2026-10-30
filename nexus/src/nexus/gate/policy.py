"""The gate's policy: a name and version recorded on every decision, plus autonomy caps.

The policy is code until P8 gives it a file format and an API (P2.md §6)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

AUTONOMY_LEVELS = ("L0", "L1", "L2", "L3", "L4")


@dataclass(frozen=True)
class Policy:
    name: str = "default"
    version: str = "0.1.0"
    max_autonomy: Mapping[str, str] = field(default_factory=dict)  # pack id -> highest level allowed

    def __post_init__(self) -> None:
        for pack, level in self.max_autonomy.items():
            if level not in AUTONOMY_LEVELS:
                raise ValueError(f"max_autonomy[{pack!r}] = {level!r} is not one of {AUTONOMY_LEVELS}")
        if len(self.label) > 64:
            raise ValueError("policy name@version must be at most 64 characters")

    @property
    def label(self) -> str:
        return f"{self.name}@{self.version}"

    def effective_autonomy(self, pack: str, declared: str) -> str:
        cap = self.max_autonomy.get(pack)
        if cap is None:
            return declared
        return min(declared, cap, key=AUTONOMY_LEVELS.index)
