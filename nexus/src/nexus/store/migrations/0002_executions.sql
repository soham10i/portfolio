-- P3: one row per claimed idempotency key (ADR-0012), and a lookup from decision id to its event.

CREATE TABLE executions (
    idempotency_key text PRIMARY KEY,  -- the claim: a second insert of the same key fails
    decision_id     text NOT NULL,
    proposal_id     text NOT NULL,
    stream          text NOT NULL,
    action          text NOT NULL,
    status          text NOT NULL CHECK (status IN (
                        'running', 'refused', 'shadowed', 'succeeded', 'failed',
                        'compensated', 'compensation_failed')),
    verification    text CHECK (verification IN ('not_run', 'passed', 'failed', 'timed_out')),
    incident_ids    jsonb NOT NULL DEFAULT '[]',
    error           text,
    started_at      text NOT NULL,
    finished_at     text
);

CREATE INDEX executions_decision ON executions (decision_id);

CREATE INDEX events_decision_id ON events ((payload->'decision'->>'decision_id'))
    WHERE type = 'decision.made';
