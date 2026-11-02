"""Record a live run's model replies once; replay them in tests and CI with no network (P6.md §4).

A recorded call is keyed by its position in the case and by a hash of everything that was sent
(task, system text, prompt and schema). A replay whose request no longer hashes the same fails,
so a changed prompt, catalog or schema can never pass on stale replies."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from ..llm import ModelError
from ..store.canonical import canonical_json


class ReplayMismatch(AssertionError):
    """The planner asked for something the recording does not hold: re-record."""


def request_hash(task: str, system: str, prompt: str, schema: Mapping[str, Any]) -> str:
    sent = {"task": task, "system": system, "prompt": prompt, "schema": schema}
    return hashlib.sha256(canonical_json(sent)).hexdigest()


@dataclass
class Replayed:
    output: Any
    provider: str
    model: str
    call_id: str
    notes: list[str] = field(default_factory=list)


class Recorder:
    """Wraps a model (the router) and remembers each call's request hash and reply."""

    def __init__(self, model: Any) -> None:
        self._model = model
        self.calls: list[dict[str, Any]] = []

    async def generate(self, task: str, prompt: str, schema: Mapping[str, Any], **kw: Any) -> Any:
        entry: dict[str, Any] = {
            "task": task,
            "request_sha256": request_hash(task, kw.get("system", ""), prompt, schema),
        }
        try:
            generation = await self._model.generate(task, prompt, schema, **kw)
        except ModelError as exc:
            entry["error"] = {"code": exc.code, "message": str(exc)}
            self.calls.append(entry)
            raise
        entry |= {"output": generation.output, "provider": generation.provider, "model": generation.model}
        self.calls.append(entry)
        return generation

    def take(self) -> list[dict[str, Any]]:
        calls, self.calls = self.calls, []
        return calls


class Replayer:
    """Answers from one case's recorded calls, in order. Records the keyword arguments it was
    called with, so tests can check the budget and the privacy flag."""

    def __init__(self, calls: list[dict[str, Any]], case: str = "") -> None:
        self._calls = list(calls)
        self._case = case
        self.seen: list[dict[str, Any]] = []

    @property
    def remaining(self) -> int:
        return len(self._calls)

    async def generate(self, task: str, prompt: str, schema: Mapping[str, Any], **kw: Any) -> Replayed:
        self.seen.append({"task": task, **kw})
        n = len(self.seen)
        if not self._calls:
            raise ReplayMismatch(f"{self._case}: call {n} ({task}) was not recorded; re-record")
        entry = self._calls.pop(0)
        sha = request_hash(task, kw.get("system", ""), prompt, schema)
        if entry["task"] != task or entry["request_sha256"] != sha:
            raise ReplayMismatch(
                f"{self._case}: call {n} ({task}) differs from the recording ({entry['task']}); re-record"
            )
        call_id = f"replay-{self._case}-{n}"
        if "error" in entry:
            raise ModelError(entry["error"]["code"], entry["error"]["message"], call_id, [])
        errors = list(Draft202012Validator(schema).iter_errors(entry["output"]))
        if errors:
            raise ReplayMismatch(f"{self._case}: call {n}: the recorded reply no longer fits the schema")
        return Replayed(entry["output"], entry["provider"], entry["model"], call_id)


def load_recordings(path: str | Path) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("version") != 1 or not isinstance(data.get("cases"), dict):
        raise ValueError(f"{path}: not a v1 planner recording")
    return data


def save_recordings(path: str | Path, data: Mapping[str, Any]) -> None:
    Path(path).write_text(json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False) + "\n", "utf-8")
