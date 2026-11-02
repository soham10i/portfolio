"""KnowledgeIndex: index a corpus of markdown files, search it two ways, fuse (P7.md §2.2).

Lexical: Postgres full-text search, the OR of the query's lexemes, ranked by ts_rank_cd.
Vector: pgvector cosine distance over the embedder's vectors. The two rankings are fused with
reciprocal rank fusion; ties break on chunk_id, so the order is deterministic. A hit found only
by the vector half must reach `min_similarity`, so an unrelated query finds nothing."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..gate.packs import LoadedPack
from ..store import EventStore
from .chunking import Chunk, chunk_file, corpus_files
from .embedding import Embedder, HashEmbedder, to_pgvector

KNOWLEDGE_INDEXED = "knowledge.indexed"
INDEXER = {"kind": "system", "id": "knowledge-indexer"}
RRF_K = 60
_CORPUS = re.compile(r"^[a-z][a-z0-9_]{0,47}$")

_LEXICAL = """
WITH q AS (SELECT nullif(replace(plainto_tsquery('english', $1)::text, '&', '|'), '')::tsquery AS q)
SELECT c.chunk_id, ts_rank_cd(c.tsv, q.q) AS rank
FROM knowledge_chunks c, q
WHERE q.q IS NOT NULL AND c.tsv @@ q.q AND ($2::text[] IS NULL OR c.corpus = ANY($2))
ORDER BY rank DESC, c.chunk_id
LIMIT $3
"""

_VECTOR = """
SELECT chunk_id, 1 - (embedding OPERATOR(public.<=>) $1::public.vector) AS similarity
FROM knowledge_chunks
WHERE ($2::text[] IS NULL OR corpus = ANY($2)) AND embedder = $4
ORDER BY embedding OPERATOR(public.<=>) $1::public.vector, chunk_id
LIMIT $3
"""


_SELECT = (
    "SELECT chunk_id, corpus, path, line_start, line_end, heading, body, file_sha256, commit_sha "
    "FROM knowledge_chunks "
)


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float
    lexical_rank: int | None
    vector_rank: int | None
    similarity: float


@dataclass(frozen=True)
class IndexReport:
    corpus: str
    files: list[dict[str, Any]]
    chunks: int
    embedder: str


def _chunk(row: Mapping[str, Any]) -> Chunk:
    return Chunk(
        row["chunk_id"],
        row["corpus"],
        row["path"],
        row["line_start"],
        row["line_end"],
        row["heading"],
        row["body"],
        row["file_sha256"],
        row["commit_sha"],
    )


class KnowledgeIndex:
    def __init__(self, store: EventStore, embedder: Embedder | None = None) -> None:
        self._store = store
        self.embedder = embedder or HashEmbedder()

    async def index(
        self,
        corpus: str,
        root: str | Path,
        paths: Sequence[str] | None = None,
        actor: Mapping[str, Any] = INDEXER,
    ) -> IndexReport:
        """Replace every chunk of `corpus` with the chunks of these files, in one transaction
        with its knowledge.indexed event. Embedding is local; nothing is sent anywhere."""
        if not _CORPUS.fullmatch(corpus):
            raise ValueError(f"corpus name {corpus!r} must match {_CORPUS.pattern}")
        root = Path(root).resolve()
        files = corpus_files(root, list(paths) if paths is not None else None)
        chunks: list[Chunk] = []
        listed = []
        for path in files:
            found = chunk_file(root, path, corpus)
            chunks += found
            if found:
                first = found[0]
                listed.append({"path": first.path, "sha256": first.file_sha256, "commit": first.commit})
        rows = [
            (
                c.chunk_id,
                c.corpus,
                c.path,
                c.line_start,
                c.line_end,
                c.heading,
                c.body,
                c.file_sha256,
                c.commit,
                self.embedder.id,
                to_pgvector(self.embedder.embed(f"{c.heading}\n{c.body}")),
            )
            for c in chunks
        ]
        async with self._store.transaction() as conn:
            await conn.execute("DELETE FROM knowledge_chunks WHERE corpus = $1", corpus)
            await conn.executemany(
                "INSERT INTO knowledge_chunks (chunk_id, corpus, path, line_start, line_end, heading, body, "
                "file_sha256, commit_sha, embedder, embedding) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::public.vector)",
                rows,
            )
            payload = {"corpus": corpus, "files": listed, "chunks": len(chunks), "embedder": self.embedder.id}
            await self._store.append_in(conn, f"knowledge/{corpus}", KNOWLEDGE_INDEXED, payload, actor)
        return IndexReport(corpus, listed, len(chunks), self.embedder.id)

    async def index_pack(self, pack: LoadedPack, root: str | Path) -> IndexReport | None:
        """Index a pack's declared `knowledge` paths as the corpus named after the pack."""
        paths = pack.manifest.get("knowledge")
        if not paths:
            return None
        return await self.index(pack.id, root, paths)

    async def search(
        self,
        query: str,
        corpora: Sequence[str] | None = None,
        k: int = 5,
        min_similarity: float = 0.25,
        depth: int = 20,
    ) -> list[Hit]:
        if not query.strip():
            return []
        scope = list(corpora) if corpora is not None else None
        vector = to_pgvector(self.embedder.embed(query))
        pool = self._store.pool
        lexical = await pool.fetch(_LEXICAL, query, scope, depth)
        dense = await pool.fetch(_VECTOR, vector, scope, depth, self.embedder.id)
        lex_rank = {r["chunk_id"]: i for i, r in enumerate(lexical, 1)}
        vec_rank = {r["chunk_id"]: i for i, r in enumerate(dense, 1)}
        similarity = {r["chunk_id"]: float(r["similarity"]) for r in dense}
        keep = set(lex_rank) | {c for c in vec_rank if similarity[c] >= min_similarity}
        if not keep:
            return []
        scores = {
            c: (1 / (RRF_K + lex_rank[c]) if c in lex_rank else 0.0)
            + (1 / (RRF_K + vec_rank[c]) if c in vec_rank and similarity[c] >= min_similarity else 0.0)
            for c in keep
        }
        top = sorted(keep, key=lambda c: (-scores[c], c))[:k]
        rows = await pool.fetch(_SELECT + "WHERE chunk_id = ANY($1)", top)
        by_id = {r["chunk_id"]: _chunk(r) for r in rows}
        return [
            Hit(by_id[c], scores[c], lex_rank.get(c), vec_rank.get(c), similarity.get(c, 0.0)) for c in top
        ]

    async def chunks(self, corpus: str) -> list[Chunk]:
        rows = await self._store.pool.fetch(_SELECT + "WHERE corpus = $1 ORDER BY path, line_start", corpus)
        return [_chunk(r) for r in rows]
