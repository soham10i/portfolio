-- P1: append-only, hash-chained event log and the world-state projection (ADR-0008).
-- Runs inside the schema on the connection's search_path.

CREATE TABLE events (
    pos       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stream    text   NOT NULL,
    seq       bigint NOT NULL CHECK (seq >= 1),
    type      text   NOT NULL,
    payload   json   NOT NULL,  -- JCS text, kept verbatim: these are the bytes that were hashed
    actor     json   NOT NULL,
    ts        text   NOT NULL,
    trace_id  text   NOT NULL,
    prev_hash text   CHECK ((seq = 1) = (prev_hash IS NULL)),
    hash      text   NOT NULL UNIQUE,
    UNIQUE (stream, seq)
);

CREATE INDEX events_type ON events (type);

-- One row per stream. Every append locks it, so appends to one stream are serialised and
-- verification can tell whether the tail is still there.
CREATE TABLE streams (
    stream    text   PRIMARY KEY,
    head_seq  bigint NOT NULL CHECK (head_seq >= 0),  -- 0 only inside the first append's transaction
    head_hash text   NOT NULL
);

CREATE TABLE state (
    entity     text   NOT NULL,
    key        text   NOT NULL,
    value      jsonb  NOT NULL,
    version    bigint NOT NULL CHECK (version >= 1),
    updated_at text   NOT NULL,
    event_pos  bigint NOT NULL REFERENCES events (pos),
    PRIMARY KEY (entity, key)
);

CREATE FUNCTION events_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'events is append-only: % rejected', TG_OP;
END
$$;

CREATE TRIGGER events_append_only
    BEFORE UPDATE OR DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION events_reject_change();

CREATE TRIGGER events_append_only_truncate
    BEFORE TRUNCATE ON events
    FOR EACH STATEMENT EXECUTE FUNCTION events_reject_change();
