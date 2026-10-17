-- Development schema. No live migration.
CREATE TABLE IF NOT EXISTS oauth_sessions (
  token_hash TEXT PRIMARY KEY,
  token_kind TEXT NOT NULL CHECK (token_kind IN ('access','refresh','code','pending')),
  client_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  payload_ciphertext BYTEA NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oauth_sessions_expiry_idx ON oauth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS oauth_sessions_grant_idx ON oauth_sessions(grant_id);
