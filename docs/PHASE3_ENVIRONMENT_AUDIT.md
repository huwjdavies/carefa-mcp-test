# Environment audit and safe creation proposal — 2026-10-19

**Result: no complete, genuinely isolated existing environment was verified. Nothing was created, configured or deployed.** No real collection data or credentials were retrieved for this audit.

## Observed resources

| Resource | Exact identity | Evidence / conclusion |
|---|---|---|
| CAREFA Base44 app | CarefaCollector — `69fc9f9df40058abb77f7f42` | The name-filtered app inventory returned one CAREFA app. It is the live application; rejected as an isolated target. |
| Base44 branch | oauth-account-isolation — `6ad3726306ffdd7f3c4a8d38` | Source can be inspected read-only. No independent backend/data/secret isolation identifier was established. A branch is insufficient evidence. |
| Other Base44 branches | main (null); profile-management `6acd44efbd675b6e16f99a90`; avatar-feature `6ac9bc1c0fb752c674405ba8`; general-improvements `6ac9b3f3dcbf6733551fd581` | Same parent app. No separately isolated data target established. No writes made. |
| Render hardening lab | `srv-db9lk6mq1p3s738ne2gg` — carefa-oauth-hardening-lab | Frankfurt, free, correct development branch, auto-deploy OFF. Deploy-list response returned no entries. This does NOT prove absence of credentials or active grants. |
| Render existing OAuth test | `srv-db8rc0mi0phs738oguj0` — Carefa-oauth-isolated-test | Frankfurt, free, carefa-plugin-oauth-20261016, auto-deploy ON. Existing connections/configuration must remain unchanged. |
| Render diagnostic | `srv-db5s3ag473hc73c7f9t0` — carefa-mcp-diagnostic | Frankfurt, free, carefa-secure-link, auto-deploy ON. Not selected. |
| CAREFA OAuth PostgreSQL | `dpg-db9l16dg1s2s739497p0-a` — carefa-oauth-development-db | Database carefa_oauth_development_db, Frankfurt, PG18, available, plan 0.1c-256mb; not a free plan. External allowlist has zero entries. No proof of sole use/credential separation or runtime privileges. |
| GitHub | huwjdavies/carefa-mcp-test; carefa-multiuser-hardening-20261017 | Baseline head 2404cee, CI green; Phase 3 code extends it. No main merge. |

The PostgreSQL metadata-only query was rejected by the connector (`INVALID_ARGUMENT`), so schema contents, active grants and runtime role isolation remain unverified. No fallback connected to a database directly. Available Render service reads did not expose environment-variable values/credential relationships; secret separation therefore could not be verified. No protected environment files were read. Empty external IP allowlists do not establish private-network or role isolation.

Shared infrastructure known to exist: GitHub repository/account, Render workspace `tea-db5rksid0e5s738fktr0`, same-region service network and free-service quota pool. No credential equality or database separation is inferred. Non-CAREFA resources were excluded from further inspection and are not proposed for reuse.

## Proposed new target (NOT CREATED)

| Item | Proposed exact name / policy | Actual ID |
|---|---|---|
| Base44 application | CAREFA Companion V1 Isolated Lab; new empty, independently verified backend/data environment | NOT CREATED |
| Base44 branch/backend | New app's main plus its independent app backend; never a branch of the live app | NOT CREATED |
| Render workspace | CAREFA Companion Isolated Lab; only if available without cost and without shared production quota/network | NOT CREATED |
| Render service | carefa-companion-phase3-lab, Frankfurt, free, auto-deploy OFF | NOT CREATED |
| PostgreSQL instance | carefa-companion-phase3-db, Frankfurt, free only if eligible | NOT CREATED |
| Logical database | carefa_companion_phase3 | NOT CREATED |
| Runtime role | carefa_companion_runtime, metadata DML only | NOT CREATED |
| GitHub source | Existing development branch; runtime commit 9d2e2120c5fd60952e791d3b8909a5daad2c14c9 | Existing code only |

The proposal must become a real target record with actual app/backend/service/database IDs, verified origin/host, schema/role evidence, zero-cost confirmation and an exact approved commit BEFORE deployment. `deployment/phase3-target.proposed.json` intentionally fails `scripts/check-isolated-target.mjs`. Its boolean evidence fields are an operator checklist, not automated proof or approval. The validator rejects the known live/unverified resources. It never creates resources or deploys.

## Separation requirements

Create the new Base44 app from reviewed source/schema only. Copy NO users, collection records, OAuth consents, access links, sessions, secrets, scheduled jobs, price-writing jobs, production integrations or outbound webhooks. Generate fresh per-target credentials. The new service must have no production Base44 service-role credential, production database URL, shared env group or shared ChatGPT callback/client configuration. Bind every Base44 endpoint to the new app origin, every V1 grant to the isolated issuer, and the runtime URL to the new database/role. Verify the app IDs/backend IDs and attempted access denials; a name alone is not evidence.

Existing production accounts do NOT automatically become users of a new isolated Base44 backend. Matching email addresses do not establish identity equivalence and must never be used to bind collectors. Initially seed only fictional collections. A later owner-approved private snapshot copy or separately designed, genuinely read-only production gateway is needed to test the original nine-card/larger-account datasets without giving the isolated service writable production credentials. Neither option is approved or implemented by this proposal. A snapshot test proves isolated onboarding, not live production-account integration.

## Cost and availability

No additional cost was incurred through resource creation/configuration; none occurred. Free-target availability and Base44 account limits are unverified. Render documents one free PostgreSQL per workspace, 30-day expiry, no free PostgreSQL backups, shared free-service hours, cold starts and possible bandwidth/build overages. The existing workspace's free-database slot is already occupied by a non-CAREFA resource; do not alter or reuse it. A new free workspace/database is only a proposal, not a guaranteed entitlement. If zero cost cannot be established, STOP; no paid fallback, upgrade, new billing method or removal of unrelated resources is authorised.

Source checked: https://render.com/docs/free . Operator must check actual account eligibility, spend limits and quotas before any creation approval. Cold starts may exceed the private API timeout; warm the approved test service before a timed test, without setting up a permanent keep-awake job.
