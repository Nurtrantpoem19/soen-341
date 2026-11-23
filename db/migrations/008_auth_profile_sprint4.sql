-- Sprint 4: dedicated company column on profiles for recruiters and token revocation for logout.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT '' CHECK (length(company) <= 200);

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS revoked_tokens_expires_at_idx ON revoked_tokens(expires_at);
