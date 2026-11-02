"""The P7 evaluations (P7.md §4): entity resolution, and grounded answering in three suites.

Every grounding case is also checked independently of the answerer's own checks: each emitted
sentence must cite a source the answerer was shown, and each fresh numeric live read it cites must
be stated with its value. A case that breaks either fails, whatever else it got right."""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

from ..gate.packs import LoadedPack
from ..plan.planner import Model
from ..store import EventStore
from .answer import Answerer, AnswerResult
from .assets import AssetGraph
from .index import KnowledgeIndex
from .live import states_value
from .memory import MemoryStore

THRESHOLDS = {"answerable": 18, "live": 9, "unanswerable": 9}  # P7 acceptance A8
RESOLUTION_THRESHOLD = 50  # A4: every case
SUITES = ("answerable", "live", "unanswerable")
NOTES_CORPUS = "eval_notes"  # the eval-only corpus with the injected instruction
EVAL_ACTOR = {"kind": "system", "id": "eval-grounding"}
T0 = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)  # every prompt is built at this instant


# ── entity resolution ─────────────────────────────────────────────────────────


def load_resolution(path: str | Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(extra pack manifests, cases). The extra packs exist to test cross-pack ambiguity."""
    doc = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return list(doc.get("packs") or ()), list(doc["cases"])


def resolution_result(graph: AssetGraph, text: str) -> list[dict[str, Any]]:
    out = []
    for m in graph.resolve(text):
        item: dict[str, Any] = {"text": m.text, "status": m.status}
        if m.entities:
            item["entities"] = list(m.entities)
        if m.candidates:
            item["candidates"] = list(m.candidates)
        out.append(item)
    return out


def score_resolution(graph: AssetGraph, cases: Sequence[Mapping[str, Any]]) -> list[tuple[str, bool, Any]]:
    """(case id, passed, got). A case passes when its mentions are exactly the expected ones."""
    out = []
    for case in cases:
        got = resolution_result(graph, case["text"])
        want = [dict(e) for e in case["expect"]]
        out.append((case["id"], got == want, got))
    return out


# ── grounding ─────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Case:
    id: str
    question: str
    expect_ref: str | None = None
    phrases: tuple[str, ...] = ()  # each a "|"-separated set of alternatives, matched lower-case
    keys: tuple[str, ...] = ()  # live: observable keys the answer must cite
    unknown: bool = False  # live: the value is stale or missing, so none may be given
    forbid: tuple[str, ...] = ()  # live: numbers no sentence may state (the stale value)
    session: str | None = None


@dataclass
class Scored:
    case: str
    passed: bool
    status: str
    detail: str
    sentences: list[dict[str, Any]] = field(default_factory=list)


def load_suite(path: str | Path) -> tuple[str, list[Case]]:
    doc = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    cases = [
        Case(
            c["id"],
            c["question"],
            c.get("ref"),
            tuple(c.get("phrases") or ()),
            tuple(c.get("keys") or ()),
            bool(c.get("unknown")),
            tuple(str(f) for f in c.get("forbid") or ()),
            c.get("session"),
        )
        for c in doc["cases"]
    ]
    ids = [c.id for c in cases]
    if len(set(ids)) != len(ids):
        raise ValueError(f"{path}: case ids must be unique")
    return doc["suite"], cases


def load_state(path: str | Path) -> list[dict[str, Any]]:
    """The world state a live suite is asked against: key, value, age_s."""
    return list(yaml.safe_load(Path(path).read_text(encoding="utf-8")).get("state") or ())


def load_memories(path: str | Path) -> list[dict[str, Any]]:
    return list(yaml.safe_load(Path(path).read_text(encoding="utf-8"))["memories"])


def grounding_problems(result: AnswerResult) -> list[str]:
    """The independent check of every emitted sentence (P7.md §4, A8)."""
    shown = {s.id: s for s in result.sources}
    problems = []
    for i, sentence in enumerate(result.sentences, 1):
        if not sentence.cites:
            problems.append(f"sentence {i} cites nothing")
        for cite in sentence.cites:
            source = shown.get(cite)
            if source is None:
                problems.append(f"sentence {i} cites unknown source {cite}")
            elif (read := source.read) and read.numeric and not states_value(sentence.text, read.value):
                problems.append(f"sentence {i} cites {cite} without its value {read.value}")
    return problems


def _has(text: str, phrase: str) -> bool:
    return any(alt.strip().lower() in text for alt in phrase.split("|"))


def _numbers(text: str) -> set[float]:
    return {float(n) for n in re.findall(r"(?<![\d.])\d+(?:\.\d+)?", text)}


def score(case: Case, suite: str, result: AnswerResult) -> Scored:
    sentences = [
        {"text": s.text, "cites": [result.source(c).ref if result.source(c) else c for c in s.cites]}
        for s in result.sentences
    ]
    held_back = result.status in ("abstained", "clarify")  # neither states anything
    detail = (
        f"asked {result.questions}" if result.status == "clarify" else result.reason if held_back else "ok"
    )

    def done(ok: bool, why: str) -> Scored:
        return Scored(case.id, ok, result.status, why, sentences)

    problems = grounding_problems(result)
    if problems:
        return done(False, "; ".join(problems))
    if suite == "unanswerable":
        return done(held_back, detail if held_back else "answered")
    text = " ".join(s.text for s in result.sentences).lower()
    cited = {result.source(c).ref for s in result.sentences for c in s.cites if result.source(c)}

    if suite == "answerable":
        if result.status != "answered":
            return done(False, f"abstained: {detail}")
        if case.expect_ref and not any(case.expect_ref in ref for ref in cited):
            return done(False, f"does not cite {case.expect_ref}")
        missing = [p for p in case.phrases if not _has(text, p)]
        return done(not missing, f"missing {missing}" if missing else "ok")

    # live
    if case.unknown:  # stale or missing: no value at all, an abstention is fine
        leaked = [f for f in case.forbid if float(f) in _numbers(text)]
        if leaked:
            return done(False, f"stated the stale value {leaked}")
        for s in result.sentences:
            live = [src for c in s.cites if (src := result.source(c)) is not None and src.kind == "live"]
            if not live:
                continue
            allowed = _numbers(case.question.lower()).union(*(_numbers(src.text.lower()) for src in live))
            extra = sorted(_numbers(s.text.lower()) - allowed)
            if extra:
                return done(False, f"stated a value it does not have: {extra}")
        return done(True, "no value stated" if result.status == "answered" else f"abstained: {detail}")
    if result.status != "answered":
        return done(False, f"abstained: {detail}")
    missing_keys = [k for k in case.keys if not any(ref.endswith("/" + k) for ref in cited)]
    if missing_keys:
        return done(False, f"does not cite live {missing_keys}")
    missing = [p for p in case.phrases if not _has(text, p)]
    return done(not missing, f"missing {missing}" if missing else "ok")


class FixedClock:
    """The store's clock during the eval. Live reads state their age, so the prompts (and so the
    recorded request hashes) are only stable if "now" is."""

    def __init__(self, now: datetime = T0) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@dataclass
class World:
    index: KnowledgeIndex
    memories: MemoryStore
    graph: AssetGraph
    packs: dict[str, LoadedPack]


async def prepare(
    store: EventStore, clock: FixedClock, suites_dir: Path, pack: LoadedPack, root: Path
) -> World:
    """Index the pack's corpus and the notes, seed the memories (a second apart, so their order is
    fixed) and the live state (each at T0 minus its age), then stop the clock at T0."""
    index = KnowledgeIndex(store)
    await index.index_pack(pack, root)
    await index.index(NOTES_CORPUS, suites_dir / "notes")
    memories = MemoryStore(store)
    for n, m in enumerate(load_memories(suites_dir / "memories.yaml")):
        clock.now = T0 - timedelta(days=1) + timedelta(seconds=n)
        await memories.add(m["content"], m["tier"], m["scope"], m["source"], EVAL_ACTOR)
    for item in load_state(suites_dir / "live.yaml"):
        clock.now = T0 - timedelta(seconds=item["age_s"])
        row = await store.state.get(pack.id, item["key"])
        version = row.version if row else 0
        await store.state.set(pack.id, item["key"], item["value"], version, EVAL_ACTOR, f"eval/{pack.id}")
    clock.now = T0
    return World(index, memories, AssetGraph.from_packs([pack]), {pack.id: pack})


def answerer_factory(
    store: EventStore, world: World, *, private: bool = False
) -> Callable[[Model], Answerer]:
    def make(model: Model) -> Answerer:
        return Answerer(
            store,
            model,
            world.index,
            world.memories,
            world.graph,
            world.packs,
            private=private,
            corpora=[*world.packs, NOTES_CORPUS],
            user="eval",
        )

    return make


def session_for(case: Case) -> str:
    return case.session or f"eval-{case.id}"


async def run_suite(
    answerer_for: Callable[[Model], Answerer],
    model_for: Callable[[str], Model],
    suite: str,
    cases: Sequence[Case],
    session_for: Callable[[Case], str],
) -> list[Scored]:
    out = []
    for case in cases:
        answerer = answerer_for(model_for(case.id))
        result = await answerer.answer(case.question, session_for(case))
        out.append(score(case, suite, result))
    return out
