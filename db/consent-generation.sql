-- PHASE 3: approved isolated OAuth database only. No production execution.
BEGIN;
CREATE TABLE IF NOT EXISTS companion_consents (
  owner_id TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 0 CHECK(generation>=0),
  permission_granted BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT '2' CHECK(consent_version='2'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE companion_links ADD COLUMN IF NOT EXISTS consent_generation BIGINT;
-- Existing Phase 2 rows intentionally remain NULL and cannot enter Phase 3.
-- They are not silently upgraded or reauthorised.
CREATE INDEX IF NOT EXISTS companion_links_owner_generation_idx ON companion_links(owner_id,consent_generation);
COMMIT;
