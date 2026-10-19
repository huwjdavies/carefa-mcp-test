# Phase 3 consent-path audit — 2026-10-19

Read-only source audit of CAREFA Base44 app `69fc9f9df40058abb77f7f42`. Main and `oauth-account-isolation` have the same identified consent-write surfaces. `profile-management` also has these paths. The targeted searches in `avatar-feature` and `general-improvements` found no matching consent-write/link-handler references. This is a source snapshot, not a guarantee about future edits, platform-managed OAuth internals or installed browser bundles.

| Existing path | Behavior and defect | Prepared isolated-only treatment |
|---|---|---|
| `src/components/ai/AiConnectConsentCard.jsx` | Creates consent; toggles the same record false/true. Chooses any true record rather than necessarily the latest. No bridge withdrawal event. | Replacement routes Profile to My AI Assistants; no direct consent writes. |
| `src/pages/AIConnectTest.jsx` | Creates or updates all matching provider records, including re-enable; writes version 1. No terminal event. | Replacement redirects to My AI Assistants. Other providers are not silently granted V1 access. |
| `src/pages/AiLink.jsx` | Creates/re-enables consent; literal owner placeholder, untrusted service label and obsolete totals-only disclosure. Cancel uses history rather than OAuth denial. | Old request is rejected with guidance to start fresh; new protected AiCompanionApproval page handles explicit Approve/Deny and displayed CAREFA identity. |
| `src/components/ai/AiLinkStatusCard.jsx` | Revokes active legacy links through `carefaAiLink`, not the new PostgreSQL authority. | Replacement links to the new settings page. Production legacy component is untouched. |
| `base44/functions/carefaAiLink/entry.ts` | Legacy status/revoke/start/exchange; latest consent is checked but no durable consent generation exists. | Not a V1 endpoint in the isolated package. Do not redirect production callbacks or migrate old links. |
| `base44/entities/AICompanionConsent.jsonc` | Owner-side create/update/delete enables direct API or stale-browser bypass of UI hooks. | Isolation-only schema sets create/update/delete false. Do not apply to the live app; that would alter legacy permissions. |
| `base44/mcp/config.json` | Consent/entity operations are empty in the inspected configuration. | Keep entity operations disabled and expose only curated read tools. No approval/withdrawal/verification MCP tool. |
| `src/pages/OAuthConsent.jsx` | Platform-managed native Base44 MCP consent uses opaque ctx and platform approve/deny endpoints; it is separate from the Render V1 grant, with no direct AICompanionConsent mutations in the inspected flow. | Preserve that existing protocol; do not present it as V1 verification or configure V1 clients against the native Base44 MCP endpoint. |
| Staged Phase 2 approval/settings/read functions | Version-2 Base44 consent boolean still participates in authorisation. | Opt-in `bridge-postgres-v3` uses the PostgreSQL generation authority, without legacy consent writes or lookup dependence. |

## Terminal V1 authority

`db/consent-generation-store.mjs` extends the existing PostgreSQL link store. It adds `companion_consents`, one owner row with an allowed flag and monotonically increasing generation. `begin` stamps the current generation. Explicit first-party approval, withdrawal, code redemption and verification serialize on that owner's row (`FOR UPDATE`). The original conditional one-use code update, callback binding and PKCE flow remain.

Withdrawal changes the generation, denies consent and revokes that owner's pending/approved/active V1 links in one transaction. All pre-withdrawal link tokens, access/refresh descendants and approval codes fail current-generation checks. Approval cannot operate on an old flow. Reconnection requires a newly created flow and explicit read-only consent. Another collector's rows are untouched. A per-owner limit of ten live pending/approved requests is enforced under the same lock.

Old Phase 2 rows have NULL generation and are rejected in Phase 3; no implicit upgrade occurs. Enabling a legacy boolean is neither a V1 grant nor a bridge operation. In the isolated target, direct boolean writes are also denied by the prepared schema and old UI surfaces are replaced. No legacy global revocation is performed against production.

The server validates link/consent before token issuance/refresh/MCP access; the reader rechecks after I/O; the server rechecks before recording the protected-read receipt. A refresh may finish concurrently with withdrawal, but its descendant remains unusable after withdrawal commits. Receipt writes cannot revive revoked rows. This is transactional metadata invalidation, not deletion of previously shared ChatGPT content.

## Proof and limitations

PostgreSQL fixture tests cover withdrawal followed by fresh approval, old-token reuse, pending/approved code invalidation, concurrent approval/redemption/refresh/withdrawal/verification, independent owners, NULL-generation refusal and atomic pending limits. Existing tests cover PKCE/state/callbacks/expiry/read-only behavior. Local staged-entrypoint tests verify owner derivation and that Phase 3 explicit consent does not write Base44 boolean records.

The Base44 CRUD policy is prepared JSON and statically tested; actual platform enforcement must be tested through both normal SDK and direct entity API in the approved isolated backend. Deployment is BLOCKED if old mutation paths remain reachable, the schema is not applied, or the runtime falls back to v2. Do not claim the unmodified live legacy integrations have this fix. A later production transition requires its own design/approval and preservation plan.
