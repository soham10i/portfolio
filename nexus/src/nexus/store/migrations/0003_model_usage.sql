-- P5: the model router's usage ledger (ADR-0015). One row per provider and UTC day.
-- A call reserves its estimated cost and counts its request before it is sent; settling it
-- replaces the estimate with the actual cost in the same transaction as its model.called event.

CREATE TABLE model_usage (
    provider           text    NOT NULL,
    day                date    NOT NULL,
    requests           integer NOT NULL DEFAULT 0,
    tokens_in          bigint  NOT NULL DEFAULT 0,
    tokens_out         bigint  NOT NULL DEFAULT 0,
    spent_micro_usd    bigint  NOT NULL DEFAULT 0,
    reserved_micro_usd bigint  NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
    PRIMARY KEY (provider, day)
);
