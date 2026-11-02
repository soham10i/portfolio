-- P8: principals, their public keys and their sessions (ADR-0027, ADR-0028).
-- Tokens are stored only as sha256; no event ever carries a token or its hash.

CREATE TABLE principals (
    principal_id  text PRIMARY KEY CHECK (principal_id ~ '^[a-z][a-z0-9_.-]{0,63}$'),
    kind          text NOT NULL CHECK (kind IN ('human', 'agent')),
    roles         text[] NOT NULL,
    token_sha256  text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
    created_at    timestamptz NOT NULL,
    revoked_at    timestamptz
);

-- Ed25519 public keys a human approves with. A revoked key signs nothing new.
CREATE TABLE principal_keys (
    key_id        text PRIMARY KEY CHECK (key_id ~ '^[0-9a-f]{32}$'),
    principal_id  text NOT NULL REFERENCES principals (principal_id),
    public_key    text NOT NULL UNIQUE CHECK (public_key ~ '^[0-9a-f]{64}$'),
    created_at    timestamptz NOT NULL,
    revoked_at    timestamptz
);

CREATE INDEX principal_keys_owner ON principal_keys (principal_id);

-- An API session belongs to the principal that opened it; nobody else can see it.
CREATE TABLE sessions (
    session_id  uuid PRIMARY KEY,
    owner_id    text NOT NULL REFERENCES principals (principal_id),
    created_at  timestamptz NOT NULL
);

CREATE INDEX sessions_owner ON sessions (owner_id, created_at);
