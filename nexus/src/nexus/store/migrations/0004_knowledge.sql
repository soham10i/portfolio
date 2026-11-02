-- P7: the knowledge index (ADR-0023) and explicit memory (ADR-0025).
-- pgvector lives in `public` once per database. Created in a test schema, it would be dropped
-- with that schema and take every other schema's vector columns with it.

SELECT pg_advisory_xact_lock(hashtext('nexus:pgvector'));
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
DO $$
BEGIN
    IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE e.extname = 'vector') <> 'public' THEN
        RAISE EXCEPTION 'the vector extension must live in schema public';
    END IF;
END $$;

-- A derived index, rebuilt from the files: replacing a corpus is one transaction plus one
-- knowledge.indexed event that lists what was indexed.
CREATE TABLE knowledge_chunks (
    chunk_id    text PRIMARY KEY,
    corpus      text NOT NULL,
    path        text NOT NULL,
    line_start  integer NOT NULL CHECK (line_start >= 1),
    line_end    integer NOT NULL CHECK (line_end >= line_start),
    heading     text NOT NULL,
    body        text NOT NULL,
    file_sha256 text NOT NULL,
    commit_sha  text,
    embedder    text NOT NULL,
    embedding   public.vector(256) NOT NULL,
    tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', heading || ' ' || body)) STORED
);

CREATE INDEX knowledge_chunks_corpus ON knowledge_chunks (corpus);
CREATE INDEX knowledge_chunks_tsv ON knowledge_chunks USING gin (tsv);

-- Memory content lives only here, never in an event, so a delete really removes it.
CREATE TABLE memories (
    memory_id      uuid PRIMARY KEY,
    tier           text NOT NULL CHECK (tier IN ('session', 'project', 'profile')),
    scope          text NOT NULL,
    content        text NOT NULL,
    source         text NOT NULL,
    content_sha256 text NOT NULL,
    created_at     text NOT NULL,
    tsv            tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX memories_scope ON memories (tier, scope);
CREATE INDEX memories_tsv ON memories USING gin (tsv);
