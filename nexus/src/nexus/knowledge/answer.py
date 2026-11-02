"""The answerer: retrieve, compose, check, critique; answer, abstain or ask (P7.md §2.6, P8.1.md §3).

It reads and cites; it has no gate, executor or binding, and nothing it writes becomes a memory.
Every sentence it returns cites at least one source it was shown, every cited numeric live read
is stated with its value, and the critic marked it supported. Anything else is dropped, and an
answer with nothing left is an abstention.

The answer is organised by the points the question asks. A point no kept sentence answers is
reported as not found in the sources, never filled in. When the question names something
ambiguous and nothing was found, or the model says the sources answer different readings
differently, it asks up to three clarifying questions instead (at most two rounds). The output
limits scale with the question, and examples the user rated up show the style to write in."""

from __future__ import annotations

import re
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from ..gate.packs import LoadedPack
from ..llm import Budget, ModelError
from ..plan.planner import Model
from ..store import EventStore
from ..store.events import new_trace_id
from .assets import AssetGraph, Mention
from .index import KnowledgeIndex
from .live import LiveRead, read_entities, states_value
from .memory import Memory, MemoryStore, scopes_for
from .ratings import Ratings
from .schema import (
    ANSWER_SYSTEM,
    CRITIQUE_SYSTEM,
    MAX_POINTS,
    MAX_QUESTIONS,
    answer_prompt,
    answer_schema,
    critique_prompt,
    critique_schema,
)

ANSWERER = {"kind": "agent", "id": "answerer"}
ANSWER_GIVEN, ANSWER_ABSTAINED = "answer.given", "answer.abstained"
ANSWER_CLARIFY = "answer.clarify_requested"
MAX_QUESTION = 2000
MAX_CLARIFY_ROUNDS = 2
NOT_FOUND = "not found in the sources"
_PARTS = re.compile(
    r"\?|;|\n|\band also\b|\bas well as\b"
    r"|\band\b(?=\s+(?:what|which|who|when|where|why|how|is|are|does|do|can)\b)",
    re.I,
)


def points_asked(question: str) -> int:
    """About how many separate things the question asks, 1 to MAX_POINTS. Only sizes the output
    limit; the model lists the actual points."""
    parts = [p for p in _PARTS.split(question) if len(p.split()) >= 2]
    return max(1, min(len(parts), MAX_POINTS))


def compose_tokens(points: int, sources: int, ceiling: int) -> int:
    return max(256, min(192 + 96 * points + 24 * sources, ceiling))


def critique_tokens(sentences: int, ceiling: int) -> int:
    return max(192, min(128 + 48 * sentences, 512, ceiling))


def _label(entity: str) -> str:
    """'greenhouse.zone[2]' -> 'zone 2', 'greenhouse.roof_vent' -> 'roof vent'."""
    name = entity.split(".", 1)[-1]
    return re.sub(r"\[(\w+)\]", r" \1", name).replace("_", " ").replace(".", " ")


def _choices(labels: Sequence[str]) -> str:
    return labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " or " + labels[-1]


def clarifying_questions(mentions: Sequence[Mention]) -> list[str]:
    """One question per ambiguous mention, from the asset graph alone."""
    out = []
    for m in mentions:
        if m.status == "ambiguous" and m.candidates:
            out.append(f"Which {m.text} do you mean: {_choices([_label(c) for c in m.candidates])}?")
    return out[:MAX_QUESTIONS]


_MARKERS = re.compile(r"\s*\[[dlm]\d+(?:\s*,\s*[dlm]\d+)*\]")


def strip_markers(text: str) -> str:
    """Drop inline source markers such as ' [l2]' or '[d1, d3]' a model writes into the text: the
    citations are in `cites`, and a marker's digits would read as a stated value."""
    return " ".join(_MARKERS.sub("", text).split())


def ambiguity_notes(mentions: Sequence[Mention]) -> list[str]:
    return [
        f"- '{m.text}' could be {_choices([_label(c) for c in m.candidates])}"
        for m in mentions
        if m.status == "ambiguous" and m.candidates
    ]


@dataclass(frozen=True)
class Source:
    id: str  # d1, m1, l1: what the model cites
    kind: str  # doc | memory | live
    label: str
    text: str
    ref: str
    provenance: Mapping[str, Any]
    read: LiveRead | None = None


@dataclass(frozen=True)
class Sentence:
    text: str
    cites: tuple[str, ...]
    point: int | None = None


@dataclass
class AnswerResult:
    answer_id: str
    session_id: str
    status: str  # answered | abstained | clarify
    by: str = ""  # who abstained or asked: retrieval | model | answerer | checks | critic
    reason: str = ""
    points: list[str] = field(default_factory=list)
    uncovered: list[str] = field(default_factory=list)  # points no kept sentence answers
    questions: list[str] = field(default_factory=list)  # clarifying questions to the user
    round: int = 0  # how many clarifications this question has had
    examples: int = 0  # style examples shown to the model
    sentences: list[Sentence] = field(default_factory=list)
    dropped: list[dict[str, Any]] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    mentions: list[Mention] = field(default_factory=list)
    model_calls: list[str] = field(default_factory=list)

    def source(self, sid: str) -> Source | None:
        return next((s for s in self.sources if s.id == sid), None)

    def summary(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "answer_id": self.answer_id,
            "status": self.status,
            "points": self.points,
            "uncovered": [{"point": p, "status": NOT_FOUND} for p in self.uncovered],
            "sentences": [
                {"text": s.text, "cites": [self._cite(c) for c in s.cites], "point": s.point}
                for s in self.sentences
            ],
            "dropped": self.dropped,
            "mentions": [m.as_dict() for m in self.mentions],
            "model_calls": self.model_calls,
        }
        if self.status in ("abstained", "clarify"):
            out |= {"by": self.by, "reason": self.reason}
        if self.status == "clarify":
            out |= {"questions": self.questions, "round": self.round}
        return out

    def _cite(self, sid: str) -> dict[str, Any]:
        src = self.source(sid)
        return {"id": sid, "kind": src.kind, "ref": src.ref} if src else {"id": sid}


def _doc_sources(hits: Sequence[Any]) -> list[Source]:
    out = []
    for i, hit in enumerate(hits, 1):
        c = hit.chunk
        ref = f"{c.corpus}:{c.ref}"
        provenance = {
            "chunk_id": c.chunk_id,
            "corpus": c.corpus,
            "path": c.path,
            "lines": [c.line_start, c.line_end],
            "file_sha256": c.file_sha256,
            "commit": c.commit,
        }
        text = f"{c.heading}: {c.body}" if c.heading else c.body
        out.append(Source(f"d{i}", "doc", f"document {ref}", " ".join(text.split()), ref, provenance))
    return out


def _memory_sources(memories: Sequence[Memory]) -> list[Source]:
    # Provenance holds the id and hash only, so an answer.given event never copies a memory's text.
    return [
        Source(
            f"m{i}",
            "memory",
            f"memory ({m.tier}, from {m.source})",
            m.content,
            m.ref,
            {"memory_id": m.memory_id, "tier": m.tier, "content_sha256": m.content_sha256},
        )
        for i, m in enumerate(memories, 1)
    ]


def _live_sources(reads: Sequence[LiveRead]) -> list[Source]:
    return [
        Source(f"l{i}", "live", "live reading", r.text(), f"live:{r.pack}/{r.key}", r.provenance(), r)
        for i, r in enumerate(reads, 1)
    ]


_NON_ANSWER = re.compile(
    r"^(?:the\s+)?(?:provided\s+|available\s+|given\s+)?(?:sources?|documents?|notes?|context|information)"
    r"(?:\s+provided)?\s+(?:do|does|did)\s*(?:not|n't)\s+"
    r"(?:state|say|mention|contain|include|specify|provide|indicate|cover|give)\b",
    re.I,
)


def check_sentences(
    sentences: Sequence[Sentence], sources: Mapping[str, Source]
) -> tuple[list[Sentence], list[dict[str, Any]]]:
    """The deterministic checks: a sentence must cite only shown sources, at least one, and state
    the value of every fresh numeric live read it cites, and not merely say that the sources do not
    answer (that point is reported as not found instead)."""
    kept: list[Sentence] = []
    dropped: list[dict[str, Any]] = []
    for s in sentences:
        problem = ""
        if not s.cites:
            problem = "NO_CITATION"
        elif _NON_ANSWER.match(s.text):
            problem = "NOT_AN_ANSWER"
        elif unknown := [c for c in s.cites if c not in sources]:
            problem = f"UNKNOWN_SOURCE: {', '.join(unknown)}"
        else:
            for c in s.cites:
                read = sources[c].read
                if read is not None and read.numeric and not states_value(s.text, read.value):
                    problem = f"LIVE_VALUE_NOT_STATED: {c} is {read.value}"
                    break
        if problem:
            dropped.append({"text": s.text, "cites": list(s.cites), "problem": problem})
        else:
            kept.append(s)
    return kept, dropped


class Answerer:
    """Answers one question at a time. Every model call is free-only (`max_cost_usd=0`) and,
    unless `private=False`, only goes to providers allowed private data (ADR-0021)."""

    def __init__(
        self,
        store: EventStore,
        model: Model,
        index: KnowledgeIndex,
        memories: MemoryStore,
        graph: AssetGraph,
        packs: Mapping[str, LoadedPack],
        *,
        private: bool = True,
        critic: bool = True,
        corpora: Sequence[str] | None = None,
        user: str | None = None,
        k_docs: int = 4,
        k_memories: int = 3,
        max_output_tokens: int = 1024,
        k_examples: int = 2,
    ) -> None:
        self._store = store
        self.model = model
        self.index = index
        self.memories = memories
        self.graph = graph
        self.packs = dict(packs)
        self.private = private
        self.critic = critic
        self.corpora = list(corpora) if corpora is not None else None
        self.user = user
        self.k_docs = k_docs
        self.k_memories = k_memories
        self.max_output_tokens = max_output_tokens
        self.k_examples = k_examples
        self.ratings = Ratings(store)

    def _budget(self, tokens: int) -> Budget:
        return Budget(max_output_tokens=tokens, max_cost_usd=0.0, temperature=0.0)

    async def retrieve(self, question: str, session_id: str) -> tuple[list[Mention], list[Source]]:
        mentions = self.graph.resolve(question)
        entities = list(dict.fromkeys(e for m in mentions if m.status == "resolved" for e in m.entities))
        reads = await read_entities(self._store, self.graph, self.packs, entities)
        hits = await self.index.search(question, self.corpora, k=self.k_docs)
        found = await self.memories.search(
            question, scopes_for(session_id, sorted(self.packs), self.user), k=self.k_memories
        )
        return mentions, [*_doc_sources(hits), *_memory_sources(found), *_live_sources(reads)]

    async def answer(
        self,
        question: str,
        session_id: str,
        *,
        trace_id: str | None = None,
        clarifies: str | None = None,
    ) -> AnswerResult:
        """Answer `question`, or, with `clarifies`, the earlier question that asked for
        clarification in this session, combined with this reply."""
        if not question.strip() or len(question) > MAX_QUESTION:
            raise ValueError(f"the question must be 1 to {MAX_QUESTION} characters")
        trace_id = trace_id or new_trace_id()
        result = AnswerResult(str(uuid.uuid4()), session_id, "abstained")
        if clarifies is not None:
            earlier = await self._clarification(session_id, clarifies)
            question = f"{earlier['question']}\nClarification: {question.strip()}"
            result.round = earlier["round"] + 1
        may_ask = result.round < MAX_CLARIFY_ROUNDS
        result.mentions, result.sources = await self.retrieve(question, session_id)
        if not result.sources:
            asks = clarifying_questions(result.mentions)
            if asks and may_ask:
                why = "nothing was found, and the question names something ambiguous"
                return await self._clarify(result, question, "retrieval", why, asks, trace_id)
            return await self._abstain(result, question, "retrieval", "nothing relevant was found", trace_id)
        by_id = {s.id: s for s in result.sources}
        shown = [(s.id, s.label, s.text) for s in result.sources]
        examples = (
            await self.ratings.examples(self.user, question, k=self.k_examples, private=self.private)
            if self.user and self.k_examples
            else []
        )
        result.examples = len(examples)

        tokens = compose_tokens(points_asked(question), len(shown), self.max_output_tokens)
        output = await self._call(
            result,
            "compose",
            answer_prompt(question, shown, ambiguous=ambiguity_notes(result.mentions), examples=examples),
            answer_schema(list(by_id), clarify=may_ask),
            ANSWER_SYSTEM,
            session_id,
            trace_id,
            tokens,
        )
        if output is None:
            return await self._abstain(result, question, "model", result.reason, trace_id)
        if output["decision"] == "clarify":
            asks = [q.strip() for q in output["questions"] if q.strip()][:MAX_QUESTIONS]
            if asks and may_ask:
                return await self._clarify(result, question, "answerer", output["reason"], asks, trace_id)
            return await self._abstain(result, question, "answerer", output["reason"], trace_id)
        if output["decision"] == "abstain":
            return await self._abstain(result, question, "answerer", output["reason"], trace_id)
        result.points = [p.strip() for p in output["points"] if p.strip()][:MAX_POINTS]
        sentences = [
            Sentence(strip_markers(s["text"]), tuple(dict.fromkeys(s["cites"])), s["point"])
            for s in output["sentences"]
        ]
        kept, result.dropped = check_sentences(sentences, by_id)
        if not kept:
            return await self._abstain(result, question, "checks", "no sentence passed the checks", trace_id)

        missed: set[int] = set()
        if self.critic:
            pairs = [(s.text, s.cites) for s in kept]
            review = await self._call(
                result,
                "critique",
                critique_prompt(question, shown, pairs, result.points),
                critique_schema(len(kept), len(result.points)),
                CRITIQUE_SYSTEM,
                session_id,
                trace_id,
                critique_tokens(len(kept), self.max_output_tokens),
            )
            if review is None:  # fail closed: an unreviewed answer is not given
                return await self._abstain(result, question, "critic", "the review failed", trace_id)
            if review["verdict"] == "abstain":
                return await self._abstain(result, question, "critic", review["reason"], trace_id)
            missed = {i for i in review["missed_points"] if 1 <= i <= len(result.points)}
            marks = {r["index"]: r for r in review["sentences"]}
            reviewed = []
            for i, s in enumerate(kept, 1):
                mark = marks.get(i)
                if mark is not None and mark["supported"]:
                    reviewed.append(s)
                else:
                    problem = mark["problem"] if mark else "not reviewed"
                    result.dropped.append(
                        {"text": s.text, "cites": list(s.cites), "problem": f"CRITIC: {problem}"}
                    )
            kept = reviewed
            if not kept:
                return await self._abstain(result, question, "critic", "no sentence was supported", trace_id)

        covered = {s.point for s in kept}
        result.uncovered = [p for i, p in enumerate(result.points, 1) if i not in covered or i in missed]
        result.status, result.sentences = "answered", kept
        cited = {c for s in kept for c in s.cites}
        await self._store.append(
            f"session/{session_id}",
            ANSWER_GIVEN,
            {
                "answer_id": result.answer_id,
                "question": question,
                "points": result.points,
                "uncovered": result.uncovered,
                "sentences": [{"text": s.text, "cites": list(s.cites), "point": s.point} for s in kept],
                "sources": {
                    s.id: {"kind": s.kind, "ref": s.ref, "provenance": dict(s.provenance)}
                    for s in result.sources
                    if s.id in cited
                },
                "shown": [s.id for s in result.sources],
                "mentions": [m.as_dict() for m in result.mentions],
                "dropped": result.dropped,
                "model_calls": result.model_calls,
                "round": result.round,
                "examples": result.examples,
            },
            ANSWERER,
            trace_id,
        )
        return result

    async def _clarification(self, session_id: str, answer_id: str) -> Mapping[str, Any]:
        for event in await self._store.read(f"session/{session_id}"):
            if event["type"] == ANSWER_CLARIFY and event["payload"]["answer_id"] == answer_id:
                return event["payload"]
        raise ValueError(f"no clarifying question {answer_id} in this session")

    async def _call(
        self,
        result: AnswerResult,
        task: str,
        prompt: str,
        schema: Mapping[str, Any],
        system: str,
        session_id: str,
        trace_id: str,
        max_output_tokens: int,
    ) -> Mapping[str, Any] | None:
        try:
            generation = await self.model.generate(
                f"answer.{task}",
                prompt,
                schema,
                system=system,
                budget=self._budget(max_output_tokens),
                private=self.private,
                session_id=session_id,
                actor=ANSWERER,
                trace_id=trace_id,
            )
        except ModelError as exc:
            result.model_calls.append(exc.call_id)
            none = exc.code == "NO_PROVIDER"
            result.reason = "no model provider gave an answer" if none else f"MODEL_{exc.code}: {exc}"
            return None
        result.model_calls.append(generation.call_id)
        return generation.output

    async def _clarify(
        self, result: AnswerResult, question: str, by: str, reason: str, asks: list[str], trace_id: str
    ) -> AnswerResult:
        result.status, result.by, result.reason, result.questions = "clarify", by, reason, asks
        await self._store.append(
            f"session/{result.session_id}",
            ANSWER_CLARIFY,
            {
                "answer_id": result.answer_id,
                "question": question,
                "questions": asks,
                "by": by,
                "reason": result.reason,
                "round": result.round,
                "shown": [s.id for s in result.sources],
                "mentions": [m.as_dict() for m in result.mentions],
                "model_calls": result.model_calls,
            },
            ANSWERER,
            trace_id,
        )
        return result

    async def _abstain(
        self, result: AnswerResult, question: str, by: str, reason: str, trace_id: str
    ) -> AnswerResult:
        result.status, result.by, result.reason = "abstained", by, reason or f"the {by} abstained"
        await self._store.append(
            f"session/{result.session_id}",
            ANSWER_ABSTAINED,
            {
                "answer_id": result.answer_id,
                "question": question,
                "by": by,
                "reason": result.reason,
                "shown": [s.id for s in result.sources],
                "dropped": result.dropped,
                "model_calls": result.model_calls,
            },
            ANSWERER,
            trace_id,
        )
        return result
