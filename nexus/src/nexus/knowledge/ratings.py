"""Ratings, and the style examples they make (P8.1.md §4, ADR-0033).

A human rates a given answer up or down; `answer.rated` records it in the answer's session. An
up rating makes the answer a style example for that user, a down rating retires it, and the latest
rating wins. Examples are shown to the answerer as style only, never as sources, so nothing the
model writes can cite one. An example built from a memory is shown only to private (local) calls,
because the memory may be private.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from ..store import EventStore
from ..store.events import utc_timestamp

ANSWER_RATED = "answer.rated"
RATINGS = ("up", "down")
MAX_NOTE = 500

_SEARCH = """
WITH q AS (SELECT nullif(replace(plainto_tsquery('english', $2)::text, '&', '|'), '')::tsquery AS q)
SELECT question, answer FROM answer_examples e, q
WHERE e.owner_id = $1 AND e.retired_at IS NULL AND ($3 OR NOT e.uses_memory)
ORDER BY coalesce(ts_rank_cd(e.tsv, q.q), 0) DESC, e.rated_at DESC, e.answer_id
LIMIT $4
"""


class RatingError(ValueError):
    """A rating that cannot be recorded: unknown answer, bad rating or note."""


@dataclass(frozen=True)
class GivenAnswer:
    answer_id: str
    session_id: str
    question: str
    text: str
    uses_memory: bool


def _uuid(answer_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(answer_id)
    except ValueError as exc:
        raise RatingError(f"{answer_id!r} is not an answer id") from exc


class Ratings:
    def __init__(self, store: EventStore) -> None:
        self._store = store

    async def find(self, answer_id: str) -> GivenAnswer | None:
        """The `answer.given` event for `answer_id`; abstentions and clarifications are not rated."""
        row = await self._store.pool.fetchrow(
            "SELECT stream, payload FROM events WHERE type = 'answer.given' "
            "AND payload ->> 'answer_id' = $1 ORDER BY pos LIMIT 1",
            str(_uuid(answer_id)),
        )
        if row is None:
            return None
        p = json.loads(row["payload"])
        kinds = {s["kind"] for s in p.get("sources", {}).values()}
        return GivenAnswer(
            p["answer_id"],
            row["stream"].removeprefix("session/"),
            p["question"],
            " ".join(s["text"] for s in p["sentences"]),
            "memory" in kinds,
        )

    async def rate(self, answer: GivenAnswer, rating: str, note: str, actor: Mapping[str, Any]) -> str:
        """Record the rating and update the examples. Returns what happened to the example:
        added | retired | none."""
        if rating not in RATINGS:
            raise RatingError(f"rating must be one of {', '.join(RATINGS)}")
        if len(note) > MAX_NOTE:
            raise RatingError(f"the note must be at most {MAX_NOTE} characters")
        if actor.get("kind") != "human":
            raise RatingError("only a human rates answers")
        now = utc_timestamp(self._store.clock())
        async with self._store.transaction() as conn:
            if rating == "up":
                await conn.execute(
                    "INSERT INTO answer_examples "
                    "(answer_id, owner_id, session_id, question, answer, uses_memory, rated_at) "
                    "VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (answer_id) DO UPDATE "
                    "SET owner_id = $2, rated_at = $7, retired_at = NULL",
                    _uuid(answer.answer_id),
                    actor["id"],
                    answer.session_id,
                    answer.question,
                    answer.text,
                    answer.uses_memory,
                    now,
                )
                effect = "added"
            else:
                status = await conn.execute(
                    "UPDATE answer_examples SET retired_at = $2 WHERE answer_id = $1 AND retired_at IS NULL",
                    _uuid(answer.answer_id),
                    now,
                )
                effect = "retired" if status.endswith(" 1") else "none"
            payload = {"answer_id": answer.answer_id, "rating": rating, "note": note, "example": effect}
            await self._store.append_in(conn, f"session/{answer.session_id}", ANSWER_RATED, payload, actor)
        return effect

    async def examples(
        self, owner: str, question: str, *, k: int = 2, private: bool
    ) -> list[tuple[str, str]]:
        """Up to `k` of `owner`'s examples, the most similar question first. Without `private`,
        examples built from a memory are left out."""
        rows = await self._store.pool.fetch(_SEARCH, owner, question, private, k)
        return [(r["question"], r["answer"]) for r in rows]
