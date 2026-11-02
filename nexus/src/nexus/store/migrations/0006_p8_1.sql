-- P8.1: deleted memories are kept and marked (ADR-0030), a provider's used-up day is stored
-- (ADR-0031), and answers a human rated up become style examples (ADR-0033).

ALTER TABLE memories ADD COLUMN deleted_at text, ADD COLUMN deleted_reason text;

ALTER TABLE model_usage ADD COLUMN exhausted_at timestamptz;

-- Only answers the user rated up; a later down rating retires the row. Scoped to that user.
CREATE TABLE answer_examples (
    answer_id    uuid PRIMARY KEY,
    owner_id     text NOT NULL,
    session_id   text NOT NULL,
    question     text NOT NULL,
    answer       text NOT NULL,
    uses_memory  boolean NOT NULL,
    rated_at     text NOT NULL,
    retired_at   text,
    tsv          tsvector GENERATED ALWAYS AS (to_tsvector('english', question)) STORED
);

CREATE INDEX answer_examples_owner ON answer_examples (owner_id) WHERE retired_at IS NULL;
CREATE INDEX answer_examples_tsv ON answer_examples USING gin (tsv);
