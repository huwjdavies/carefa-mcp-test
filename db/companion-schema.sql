-- PHASE 2 DEVELOPMENT MIGRATION. Apply only to an explicitly approved environment.
-- These are connection metadata, never CAREFA collection tables.
CREATE TABLE IF NOT EXISTS companion_links (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','approved','active','denied','revoked','failed')),
  code_hash TEXT UNIQUE,
  token_hash TEXT UNIQUE,
  scope TEXT NOT NULL CHECK (scope='collection:read'),
  consent_version TEXT NOT NULL CHECK (consent_version='2'),
  expires_at TIMESTAMPTZ NOT NULL,
  access_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS companion_links_owner_idx ON companion_links(owner_id, created_at DESC);
