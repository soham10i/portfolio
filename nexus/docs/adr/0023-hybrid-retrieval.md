# 0023. Hybrid retrieval: Postgres full text and pgvector, fused by reciprocal rank

Date: 2026-10-31

## Status

Accepted (P7).

## Context

The answerer needs the few chunks of a pack's documents that bear on a question. The constraints:
no new dependency, no paid service, nothing sent off the machine to index, and the same results
every run so the grounding suites can be recorded and replayed. Postgres 16 with pgvector 0.8 is
already the store (ADR-0003).

## Decision

- **Two retrievers over one table.** `knowledge_chunks` holds each chunk with a `tsvector`
  (English configuration) and a 256-dimension `vector`. A query runs both: full text with the
  query's lexemes OR'd (`ts_rank_cd`), and cosine distance on the vector.
- **Local embeddings.** `HashEmbedder` hashes words and character trigrams into 256 dimensions
  (blake2b, signed). It is deterministic, needs no model and no download, and indexing makes no
  network call. Its id (`hash-256-v1`) is stored with every row, and the vector search only
  compares rows from the same embedder.
- **Reciprocal rank fusion**, `k = 60`, over the top 20 of each list. A vector hit counts only
  above a cosine similarity of 0.25, so an unrelated question retrieves nothing and the answerer
  abstains before any model call. Ties break on the chunk id, so the order is total.
- **Re-indexing replaces a corpus in one transaction**, with its `knowledge.indexed` event
  (files, sha256, commit, chunk count, embedder).

## Alternatives

- **BM25** (`pg_search`/ParadeDB, or a Python BM25 library). Better term weighting than
  `ts_rank_cd`, which ignores document frequency. Rejected for now: it is a new extension or a
  new dependency, and on a corpus of tens of chunks the difference does not show in the suites.
  Revisit when a pack ships hundreds of pages or the answerable suite drops below threshold
  because of ranking.
- **A model embedder** (a sentence-transformer, or a cloud embedding API). Much better semantic
  recall. A local one is a large new dependency and download; a cloud one sends private
  documents off the machine and is not free in general. The `Embedder` protocol leaves room for
  one later, with its own id, without a schema change.
- **Vector only.** Misses exact numbers and names ("50000", "Crimson Shield") that full text
  finds at rank 1.
- **Full text only.** Misses paraphrases and inflections the trigrams catch.

## Consequences

- Retrieval quality is "good enough for a small manual", not state of the art. The grounding
  suites measure it end to end.
- A new embedder means re-indexing; old rows are ignored by the vector search, not mixed in.
