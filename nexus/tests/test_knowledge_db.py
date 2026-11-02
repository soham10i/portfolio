"""P7 against Postgres: the hybrid index, live reads, explicit memory, the answerer (with a
scripted model) and the CLI. No test talks to a real provider."""

from __future__ import annotations

import asyncio
import json
import re
from datetime import timedelta

import pytest

from nexus import cli
from nexus.cli import main
from nexus.knowledge import (
    ANSWER_ABSTAINED,
    ANSWER_GIVEN,
    KNOWLEDGE_INDEXED,
    MEMORY_ADDED,
    MEMORY_DELETED,
    MEMORY_PURGED,
    Answerer,
    AssetGraph,
    KnowledgeIndex,
    MemoryStore,
    MemoryStoreError,
    Sentence,
    read_entities,
    scopes_for,
)
from nexus.knowledge.evaluation import T0, FixedClock
from nexus.llm import ModelError
from nexus.packs import load_pack, pack_root
from nexus.store import EventStore

from .db import URL
from .plan_support import ScriptedModel

pytestmark = pytest.mark.integration
ACTOR = {"kind": "human", "id": "tester"}
SESSION = "s-1"
SESSION_UUID = "00000000-0000-4000-8000-000000000000"


def run(db_schema, body, clock=None):
    async def go():
        store = await EventStore.connect(URL, schema=db_schema, pool_size=4, clock=clock)
        try:
            return await body(store)
        finally:
            await store.close()

    return asyncio.run(go())


async def events(store, type_):
    rows = await store.pool.fetch("SELECT payload FROM events WHERE type = $1 ORDER BY pos", type_)
    return [json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"] for r in rows]


# ── index and search ────────────────────────────────────────────────────────


def test_index_search_and_atomic_reindex(db_schema):
    async def body(store):
        index = KnowledgeIndex(store)
        pack = load_pack("greenhouse")
        first = await index.index_pack(pack, pack_root("greenhouse"))
        again = await index.index_pack(pack, pack_root("greenhouse"))
        wind = await index.search("At what wind speed must the vent close?", ["greenhouse"], k=3)
        rated = await index.search("50000", ["greenhouse"], k=3)
        typo = await index.search("ventilashun", ["greenhouse"])
        twice = [await index.search("water the tomatoes", ["greenhouse"]) for _ in range(2)]
        nothing = await index.search("quantum chromodynamics lagrangian", ["greenhouse"])
        other = await index.search("wind speed vent", ["other"])
        count = await store.pool.fetchval("SELECT count(*) FROM knowledge_chunks")
        found = (wind, rated, typo, twice, nothing, other)
        return first, again, found, count, await events(store, KNOWLEDGE_INDEXED)

    first, again, (wind, rated, typo, twice, nothing, other), count, indexed = run(db_schema, body)
    assert first.chunks == again.chunks == count > 0
    assert len(indexed) == 2 and indexed[0]["corpus"] == "greenhouse"
    assert {f["path"] for f in indexed[0]["files"]} >= {"knowledge/climate.md", "knowledge/ventilation.md"}
    assert wind[0].chunk.path == "knowledge/ventilation.md" and "50 km/h" in wind[0].chunk.body
    assert wind[0].lexical_rank is not None and wind[0].vector_rank is not None
    assert rated[0].chunk.path == "knowledge/lighting.md" and rated[0].lexical_rank == 1
    assert [(h.lexical_rank, h.chunk.path) for h in typo] == [(None, "knowledge/ventilation.md")]
    assert [h.chunk.chunk_id for h in twice[0]] == [h.chunk.chunk_id for h in twice[1]]
    assert nothing == [] and other == []


# ── live reads ──────────────────────────────────────────────────────────────


def test_live_reads_are_fresh_stale_or_missing(db_schema):
    clock = FixedClock()
    pack = load_pack("greenhouse")
    graph = AssetGraph.from_packs([pack])

    async def body(store):
        for key, value, age in (
            ("greenhouse.zone[1].setpoint_c", 22, 30),
            ("greenhouse.zone[2].setpoint_c", 21, 900),
        ):
            clock.now = T0 - timedelta(seconds=age)
            await store.state.set("greenhouse", key, value, 0, ACTOR, "test/greenhouse")
        clock.now = T0
        entities = ["greenhouse.zone[1]", "greenhouse.zone[2]", "greenhouse.zone[3]", "nope"]
        return await read_entities(store, graph, {"greenhouse": pack}, entities)

    reads = {r.key: r for r in run(db_schema, body, clock)}
    one, two = reads["greenhouse.zone[1].setpoint_c"], reads["greenhouse.zone[2].setpoint_c"]
    assert (one.status, one.value, one.unit, one.age_s) == ("fresh", 22, "degC", 30.0)
    assert (two.status, two.value, two.age_s) == ("stale", None, 900.0)
    assert reads["greenhouse.zone[3].setpoint_c"].status == "missing"
    assert len(reads) == 6  # two observables for each of the three zones; "nope" is skipped


# ── memory ──────────────────────────────────────────────────────────────────


def test_memory_scopes_delete_purge_and_no_content_in_events(db_schema):
    private_note = "The spare key is under the blue pot."

    async def body(store):
        memories = MemoryStore(store)
        mine = await memories.add(private_note, "session", SESSION, "test", ACTOR)
        await memories.add("The blue pot is by the door.", "project", "greenhouse", "test", ACTOR)
        theirs = await memories.add("The blue pot is cracked.", "session", "s-2", "test", ACTOR)
        found = await memories.search("blue pot", scopes_for(SESSION, ["greenhouse"], None))
        listed = await memories.find(tier="session")
        with pytest.raises(MemoryStoreError):
            await memories.add("x", "forever", "s", "test", ACTOR)
        await memories.delete(mine.memory_id, "test cleanup", ACTOR)
        kept = await memories.show(mine.memory_id)
        after = await memories.search("spare key", scopes_for(SESSION, ["greenhouse"], None))
        current = await memories.find(tier="session")
        everything = await memories.find(tier="session", include_deleted=True)
        with pytest.raises(MemoryStoreError, match="no current memory"):
            await memories.delete(mine.memory_id, "again", ACTOR)
        await memories.purge(mine.memory_id, "erase it", ACTOR)
        gone = await memories.show(mine.memory_id)
        with pytest.raises(MemoryStoreError):
            await memories.purge(mine.memory_id, "again", ACTOR)
        dump = json.dumps(
            [dict(r) for r in await store.pool.fetch("SELECT type, payload FROM events")], default=str
        )
        chain = await store.verify_chain(anchored=False)
        return (
            mine, theirs, found, listed, kept, after, current, everything, gone, dump, chain,
            await events(store, MEMORY_DELETED), await events(store, MEMORY_PURGED),
        )  # fmt: skip

    (mine, theirs, found, listed, kept, after, current, everything, gone, dump, chain, deleted, purged) = run(
        db_schema, body
    )
    assert theirs.memory_id not in {m.memory_id for m in found}
    assert {m.tier for m in found} == {"session", "project"}
    assert len(listed) == 2
    # deleted: kept, marked, never retrieved
    assert kept.status == "deleted" and kept.content == private_note and kept.deleted_reason == "test cleanup"
    assert after == [] and mine.memory_id not in {m.memory_id for m in current}
    assert {m.memory_id: m.status for m in everything}[mine.memory_id] == "deleted"
    # purged: gone
    assert gone is None
    assert private_note not in dump and "spare key" not in dump
    assert MEMORY_ADDED in dump
    assert deleted == [
        {
            "memory_id": mine.memory_id,
            "content_sha256": mine.content_sha256,
            "reason": "test cleanup",
            "kept": True,
        }
    ]
    assert purged == [
        {"memory_id": mine.memory_id, "content_sha256": mine.content_sha256, "reason": "erase it"}
    ]
    assert chain.ok, chain.problems


# ── the answerer ────────────────────────────────────────────────────────────


def answer(*sentences, decision="answer"):
    return {
        "decision": decision,
        "reason": "the sources say so",
        "points": ["what the question asks"],
        "sentences": [{"text": t, "cites": list(c), "point": 1} for t, c in sentences],
        "questions": [],
    }


def review(*supported, verdict="accept"):
    marks = [{"index": i, "supported": ok, "problem": "" if ok else "not in d1"} for i, ok in supported]
    return {"verdict": verdict, "reason": "checked", "sentences": marks, "missed_points": []}


def answer_with(db_schema, model, question, *, seed=None, clock=None, **kw):
    pack = load_pack("greenhouse")

    async def body(store):
        index = KnowledgeIndex(store)
        await index.index_pack(pack, pack_root("greenhouse"))
        if seed:
            await seed(store)
        answerer = Answerer(
            store,
            model,
            index,
            MemoryStore(store),
            AssetGraph.from_packs([pack]),
            {"greenhouse": pack},
            corpora=["greenhouse"],
            **kw,
        )
        result = await answerer.answer(question, SESSION)
        return result, await events(store, ANSWER_GIVEN), await events(store, ANSWER_ABSTAINED)

    return run(db_schema, body, clock)


def test_nothing_retrieved_means_no_model_call(db_schema):
    model = ScriptedModel(answer(("x", ["d1"])))
    result, given, abstained = answer_with(db_schema, model, "xylophone quasar")
    assert (result.status, result.by) == ("abstained", "retrieval")
    assert model.seen == [] and given == [] and abstained[0]["by"] == "retrieval"


def test_unsupported_sentences_are_dropped_and_the_rest_cited(db_schema):
    model = ScriptedModel(
        answer(
            ("The vent closes above 50 km/h.", ["d1"]),
            ("The vent was installed in 2019.", ["d1"]),
            ("It is sunny.", []),
        ),
        review((1, True), (2, False)),
    )
    result, given, _ = answer_with(db_schema, model, "When must the roof vent close?")
    assert result.status == "answered"
    assert [s.text for s in result.sentences] == ["The vent closes above 50 km/h."]
    assert [d["problem"] for d in result.dropped] == ["NO_CITATION", "CRITIC: not in d1"]
    assert model.tasks == ["answer.compose", "answer.critique"]
    assert {c["private"] for c in model.seen} == {True}
    assert {c["budget"].max_cost_usd for c in model.seen} == {0.0}
    [event] = given
    assert event["sources"]["d1"]["kind"] == "doc" and event["sources"]["d1"]["provenance"]["path"]
    assert event["model_calls"] == ["call-1", "call-2"]


def test_a_live_value_must_be_stated_to_be_kept(db_schema):
    clock = FixedClock()

    async def seed(store):
        clock.now = T0 - timedelta(seconds=10)
        await store.state.set("greenhouse", "greenhouse.vent_pct", 35, 0, ACTOR, "test/greenhouse")
        clock.now = T0

    def model():
        return ScriptedModel(
            answer(("The roof vent is open.", ["l1"]), ("The roof vent is 35 percent open.", ["l1"])),
            review((1, True)),
        )

    m = model()
    result, given, _ = answer_with(db_schema, m, "How far open is the roof vent?", seed=seed, clock=clock)
    assert [s.text for s in result.sentences] == ["The roof vent is 35 percent open."]
    assert result.dropped[0]["problem"].startswith("LIVE_VALUE_NOT_STATED")
    assert "35 percent" in m.seen[0]["prompt"] or "= 35 percent" in m.seen[0]["prompt"]
    assert given[0]["sources"]["l1"]["provenance"]["value"] == 35


@pytest.mark.parametrize(
    ("critic_reply", "reason"),
    [
        (ModelError("TIMEOUT", "slow", "c-2", []), "the review failed"),
        (review(verdict="abstain"), "checked"),
        (review((1, False)), "no sentence was supported"),
        (
            {"verdict": "accept", "reason": "ok", "sentences": [], "missed_points": []},
            "no sentence was supported",
        ),
    ],
)
def test_the_critic_fails_closed(db_schema, critic_reply, reason):
    model = ScriptedModel(answer(("The vent closes above 50 km/h.", ["d1"])), critic_reply)
    result, given, abstained = answer_with(db_schema, model, "When must the roof vent close?")
    assert (result.status, result.by, result.reason) == ("abstained", "critic", reason)
    assert given == [] and abstained[0]["by"] == "critic"


def test_the_model_may_abstain_and_errors_abstain(db_schema):
    result, *_ = answer_with(
        db_schema, ScriptedModel(answer(decision="abstain")), "When must the vent close?"
    )
    assert (result.status, result.by) == ("abstained", "answerer")
    failing = ScriptedModel(ModelError("NO_PROVIDER", "none", "c-1", []))
    result, *_ = answer_with(db_schema, failing, "When must the vent close?")
    assert (result.status, result.by, result.reason) == (
        "abstained",
        "model",
        "no model provider gave an answer",
    )


# ── CLI ─────────────────────────────────────────────────────────────────────


def test_cli_knowledge_memory_and_answer(db_schema, monkeypatch, capsys):
    monkeypatch.setenv("NEXUS_DB_URL", URL)
    monkeypatch.setenv("NEXUS_ACTOR", "tester")
    assert main(["knowledge", "index"]) == 0
    assert main(["knowledge", "search", "wind speed vent", "--json"]) == 0
    capsys.readouterr()
    assert main(["resolve", "zone two and the vent", "--json"]) == 0
    resolved = json.loads(capsys.readouterr().out)
    assert [m["entities"] for m in resolved] == [["greenhouse.zone[2]"], ["greenhouse.roof_vent"]]
    assert main(["resolve", "zone 9"]) == 1
    assert "zone 9 is not one of 1 to 4" in capsys.readouterr().out

    assert (
        main(["memory", "add", "Priya runs the weekend shift.", "--tier", "project", "--scope", "greenhouse"])
        == 0
    )
    memory_id = json.loads(capsys.readouterr().out)["memory_id"]
    assert main(["memory", "list", "--tier", "project"]) == 0
    assert memory_id in capsys.readouterr().out

    model = ScriptedModel(answer(("The vent closes above 50 km/h.", ["d1"])), review((1, True)))
    monkeypatch.setattr(cli, "_router", lambda store: model)
    assert main(["answer", "When must the roof vent close?", "--session", SESSION]) == 0
    out = capsys.readouterr().out
    assert "50 km/h.  [greenhouse:knowledge/ventilation.md#L" in out and "nothing was executed" in out
    assert {c["private"] for c in model.seen} == {True}
    answer_id = re.search(r"answer ([0-9a-f-]{36}) in session", out).group(1)
    assert main(["rate", answer_id, "up", "--note", "clear"]) == 0
    assert capsys.readouterr().out == f"rated {answer_id} up as tester; it is now a style example\n"
    assert main(["rate", SESSION_UUID, "down"]) == 1
    assert "no given answer" in capsys.readouterr().err

    ask = answer() | {"decision": "clarify", "reason": "zones differ", "points": [], "sentences": []}
    ask["questions"] = ["Which zone do you mean?"]
    scripted = ScriptedModel(ask, answer(("The vent closes above 50 km/h.", ["d1"])), review((1, True)))
    monkeypatch.setattr(cli, "_router", lambda store: scripted)
    assert main(["answer", "When must the roof vent close?", "--session", SESSION]) == 1
    out = capsys.readouterr().out
    assert "  - Which zone do you mean?" in out
    clarify_id = re.search(r"--clarifies ([0-9a-f-]{36})", out).group(1)
    assert main(["answer", "zone 2", "--clarifies", clarify_id]) == 1  # needs --session
    assert main(["answer", "zone 2", "--session", SESSION, "--clarifies", clarify_id]) == 0
    assert "50 km/h." in capsys.readouterr().out

    monkeypatch.setattr(cli, "_router", lambda store: ScriptedModel(answer(decision="abstain")))
    assert main(["answer", "When must the roof vent close?", "--json"]) == 1
    assert json.loads(capsys.readouterr().out)["by"] == "answerer"

    assert main(["memory", "delete", memory_id, "--reason", "test"]) == 0
    capsys.readouterr()
    assert main(["memory", "show", memory_id]) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "deleted"
    assert main(["memory", "list", "--tier", "project"]) == 0
    assert memory_id not in capsys.readouterr().out
    assert main(["memory", "list", "--tier", "project", "--all"]) == 0
    assert "deleted" in capsys.readouterr().out
    assert main(["memory", "purge", memory_id, "--reason", "test"]) == 0
    assert main(["memory", "show", memory_id]) == 1


# ── P8.1: points, clarifying questions, dynamic limits, rated examples ─────


def answerer_for(store, model, **kw):
    pack = load_pack("greenhouse")
    return Answerer(
        store,
        model,
        KnowledgeIndex(store),
        MemoryStore(store),
        AssetGraph.from_packs([pack]),
        {"greenhouse": pack},
        **({"corpora": ["greenhouse"]} | kw),
    )


async def indexed(store):
    pack = load_pack("greenhouse")
    await KnowledgeIndex(store).index_pack(pack, pack_root("greenhouse"))


def test_points_not_answered_are_reported_and_limits_scale(db_schema):
    reply = answer(("The vent closes above 50 km/h.", ["d1"]))
    reply["points"] = ["when the vent closes", "who installed it"]
    critic = review((1, True)) | {"missed_points": [2, 9]}
    model = ScriptedModel(reply, critic)
    result, given, _ = answer_with(db_schema, model, "When must the roof vent close, and who installed it?")
    assert result.status == "answered" and result.points == reply["points"]
    assert result.uncovered == ["who installed it"]
    assert result.summary()["uncovered"] == [
        {"point": "who installed it", "status": "not found in the sources"}
    ]
    assert given[0]["points"] == reply["points"] and given[0]["uncovered"] == ["who installed it"]
    compose, critique = (c["budget"].max_output_tokens for c in model.seen)
    assert 256 <= compose <= 1024 and 192 <= critique <= 512
    assert compose > 192 + 96  # two points asked


def test_compose_limit_grows_with_the_points_asked():
    from nexus.knowledge.answer import compose_tokens, critique_tokens, points_asked

    assert points_asked("When must the roof vent close?") == 1
    assert points_asked("When must the vent close? What is the wind limit? Who checks it?") == 3
    assert compose_tokens(1, 0, 1024) == 288 and compose_tokens(6, 12, 1024) == 1024
    assert compose_tokens(1, 0, 200) == 256  # never below the floor
    assert critique_tokens(1, 1024) == 192 and critique_tokens(20, 1024) == 512


def test_saying_the_sources_do_not_answer_is_not_an_answer():
    from nexus.knowledge.answer import Source, check_sentences

    doc = {"d1": Source("d1", "doc", "document", "The harvest log is kept on paper.", "notes.md#L9", {})}
    texts = [
        "The sources do not state when the tomatoes will be ready to harvest.",
        "The provided documents don't mention a harvest date.",
        "The harvest log is kept on paper in the potting shed.",
        "Sources say the log is on paper.",
    ]
    kept, dropped = check_sentences([Sentence(t, ("d1",)) for t in texts], doc)
    assert [s.text for s in kept] == texts[2:]
    assert [d["problem"] for d in dropped] == ["NOT_AN_ANSWER", "NOT_AN_ANSWER"]


def test_inline_source_markers_are_dropped_from_the_text():
    from nexus.knowledge.answer import strip_markers

    assert strip_markers("The lights in zone 4 are off [l2].") == "The lights in zone 4 are off."
    assert (
        strip_markers("It closes at 50 km/h [d1, d3] and opens later.")
        == "It closes at 50 km/h and opens later."
    )
    assert strip_markers("See note [a] and zone [2].") == "See note [a] and zone [2]."


def test_an_ambiguous_question_with_nothing_found_asks_without_a_model(db_schema):
    model = ScriptedModel(answer(("x", ["d1"])))

    async def body(store):
        await indexed(store)
        # no corpora: the documents are out of reach, so only the mention is left
        result = await answerer_for(store, model, corpora=[]).answer("What is the zone at?", SESSION)
        return result, await events(store, "answer.clarify_requested")

    result, asked = run(db_schema, body)
    assert (result.status, result.by) == ("clarify", "retrieval") and model.seen == []
    assert result.questions == ["Which zone do you mean: zone 1, zone 2, zone 3 or zone 4?"]
    assert asked[0]["answer_id"] == result.answer_id and asked[0]["round"] == 0


def test_the_model_may_ask_and_the_reply_is_answered_in_the_next_round(db_schema):
    ask = answer() | {"decision": "clarify", "reason": "zones differ", "points": [], "sentences": []}
    ask["questions"] = ["Which zone do you mean?"]
    then = answer(("The vent closes above 50 km/h.", ["d1"]))
    model = ScriptedModel(ask, then, review((1, True)))

    async def body(store):
        await indexed(store)
        answerer = answerer_for(store, model)
        first = await answerer.answer("When must the roof vent close?", SESSION)
        second = await answerer.answer("zone 2", SESSION, clarifies=first.answer_id)
        with pytest.raises(ValueError, match="no clarifying question"):
            await answerer.answer("zone 2", SESSION, clarifies=second.answer_id)
        return first, second, await events(store, ANSWER_GIVEN)

    first, second, given = run(db_schema, body)
    assert (first.status, first.by, first.questions) == ("clarify", "answerer", ["Which zone do you mean?"])
    assert second.status == "answered" and second.round == 1
    assert given[0]["question"] == "When must the roof vent close?\nClarification: zone 2"
    assert "Clarification: zone 2" in model.seen[1]["prompt"]


def test_after_the_last_round_it_abstains_instead_of_asking(db_schema):
    ask = answer() | {"decision": "clarify", "reason": "still unclear", "points": [], "sentences": []}
    ask["questions"] = ["Which zone?"]
    model = ScriptedModel(ask)

    async def body(store):
        await indexed(store)
        answerer = answerer_for(store, model)
        out = [await answerer.answer("When must the roof vent close?", SESSION)]
        for _ in range(2):
            out.append(await answerer.answer("not sure", SESSION, clarifies=out[-1].answer_id))
        return out

    out = run(db_schema, body)
    assert [r.status for r in out] == ["clarify", "clarify", "abstained"]
    assert model.seen[2]["schema"]["properties"]["questions"]["maxItems"] == 0


def test_an_answer_rated_up_becomes_a_style_example(db_schema):
    from nexus.knowledge.ratings import Ratings

    pair = (answer(("The vent closes above 50 km/h.", ["d1"])), review((1, True)))
    model = ScriptedModel(*pair, *pair, *pair)

    async def body(store):
        await indexed(store)
        answerer = answerer_for(store, model, user="tester")
        first = await answerer.answer("When must the roof vent close?", SESSION)
        ratings = Ratings(store)
        given = await ratings.find(first.answer_id)
        added = await ratings.rate(given, "up", "clear", ACTOR)
        second = await answerer.answer("When does the roof vent close?", SESSION)
        retired = await ratings.rate(given, "down", "", ACTOR)
        third = await answerer.answer("When does the roof vent close?", SESSION)
        with pytest.raises(ValueError, match="only a human"):
            await ratings.rate(given, "up", "", {"kind": "agent", "id": "x"})
        return added, retired, second, third, await events(store, "answer.rated")

    added, retired, second, third, rated = run(db_schema, body)
    assert (added, retired) == ("added", "retired")
    assert second.examples == 1 and third.examples == 0
    assert "The vent closes above 50 km/h." in model.seen[2]["prompt"]
    assert [r["rating"] for r in rated] == ["up", "down"]


def test_an_example_built_from_a_memory_never_reaches_a_cloud_call(db_schema):
    from nexus.knowledge.ratings import Ratings

    pair = (answer(("Priya runs the weekend shift.", ["m1"])), review((1, True)))
    model = ScriptedModel(*pair, *pair, *pair)

    async def body(store):
        await indexed(store)
        await MemoryStore(store).add("Priya runs the weekend shift.", "session", SESSION, "msg/1", ACTOR)
        local = answerer_for(store, model, user="tester")
        first = await local.answer("Who runs the weekend shift?", SESSION)
        ratings = Ratings(store)
        assert await ratings.rate(await ratings.find(first.answer_id), "up", "", ACTOR) == "added"
        cloud = await answerer_for(store, model, user="tester", private=False).answer(
            "Who runs the weekend shift?", SESSION
        )
        again = await local.answer("Who runs the weekend shift?", SESSION)
        return first, cloud, again

    first, cloud, again = run(db_schema, body)
    assert first.status == "answered" and first.source("m1").kind == "memory"
    assert cloud.examples == 0 and again.examples == 1
    assert "Examples of answers the user liked" not in model.seen[2]["prompt"]
    assert "Examples of answers the user liked" in model.seen[4]["prompt"]
