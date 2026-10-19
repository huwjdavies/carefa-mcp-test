# Phase 4 approval package — BLOCKED, no deployment authorised

Repository huwjdavies/carefa-mcp-test; branch carefa-multiuser-hardening-20261017. Proposed exact runtime/UI/fixture/preflight source: **79146e45d9cdd89aa33090d1e36180cc50a1044d**. This supersedes the Phase 3 runtime pin only; later report commits do not change runtime. No new migration is added by Phase 4.

## Target-specific record

| Component | Proposed target | Actual ID / evidence |
|---|---|---|
| Base44 | CAREFA Companion V1 Isolated Lab, new independent empty app/backend, main | NOT_CREATED / NOT_VERIFIED |
| Render | carefa-companion-phase3-lab, new independently eligible workspace, Frankfurt, free, auto-deploy off | NOT_CREATED / NOT_VERIFIED |
| PostgreSQL | carefa-companion-phase3-db / carefa_companion_phase3, Frankfurt, new runtime role carefa_companion_runtime | NOT_CREATED / NOT_VERIFIED |

This is not a complete deployment tuple. Names are not IDs; no existing service may substitute. `PHASE4_ENVIRONMENT_AND_COST.md` records actual inventory and pricing limits. Expected incremental cost UNKNOWN; conditional short-lab minimum $0, not proven, database expires after 30 days. Current preflight intentionally accepts only verified free compute with zeroAdditionalCostVerified=true. Any paid alternative requires its own cost approval and reviewed policy change, never a bypass by setting false evidence to true.

## Prepared deployment changes

Use `PHASE3_DEPLOYMENT_APPROVAL.md` sections B–F for exact file inventory, secret-name table, deployment order, monitoring and rollback. Apply runtime modules/server, staged protected Base44 functions/UI and isolation-only replacements/deny-CRUD schema to the NEW backend only. Keep native Base44 MCP separate; expose only curated read-only tools. Fixture source is offline; no automatic seed.

Migrations: `db/schema.sql`, then `db/companion-schema.sql`, then `db/consent-generation.sql`; then separately approved `db/isolated-runtime-role.sql` against exact isolated database. No production roles or schemas. Phase 3 runtime checks rather than auto-migrates.

Secret names (fresh values, never repository/chat): DATABASE_URL (restricted new role), OAUTH_SESSION_ENCRYPTION_KEY, RENDER_BRIDGE_SECRET, CAREFA_COMPANION_INTERNAL_SECRET (distinct management secret), CAREFA_ACCOUNT_FINGERPRINT_SECRET. Configure PGSSLMODE=verify-full; NODE_ENV=production; OAUTH_STORAGE_MODE=postgres; all three companion flags enabled; bridge-postgres-v3 authority; publicReady false. URLs CAREFA_APP_URL, CAREFA_LINK_FUNCTION_URL, CAREFA_COMPANION_FUNCTION_URL, CAREFA_PUBLIC_ORIGIN, CAREFA_COMPANION_BRIDGE_ORIGIN, RENDER_PUBLIC_URL must identify only new targets. OAUTH_REDIRECT_URIS must match the actual approved test installation's exact callback. No invented listing URL, copied production credentials or shared env groups.

Before deployment, independently verify actual identities, app/backend auth boundaries, empty entities, effective RLS, no inherited connectors/jobs/secrets, separate quota/spend controls, TLS and role scope. Populate the existing proposal JSON with the exact commit and evidence. Preflight refuses unknown/current targets, missing flags, auto-deploy and unverified free plans. A pass only validates the supplied assertions, not their truth or approval. Maple reviews provider evidence privately. Stop on any unknown production dependency.

After deployment, only under the approved isolated test scope, run `PHASE4_LAB_TEST_PLAN.md` direct SDK/HTTP permission probes and two-user fictional tests. Monitor aggregate failures/latency, DB connections, verification failures, quota/expiry; never auth codes, bearer values, emails, collection contents or request query strings. Review provider log redaction and edge rate limits before inviting testers. No scheduled keep-awake workaround.

Rollback: keep public readiness false; obtain approval to stop only isolated ingress/service, preserve latest consent generations/revocations, investigate, and redeploy only a reviewed v3-compatible build. Never restore old auth snapshots into an accepting service, down-migrate consent or fall back to Phase 2 authority. Fictional collections can be reseeded only with cleanup/data approval; do not restore tokens. Free DB has no managed backup; plan bounded test window/expiry alerts. Existing integrations have no intended changes; wrong origin/credential/target or shared quota can create impact and is a stop condition.

## Separate decisions required, in order

1. **Entitlement/cost evidence:** privately confirm Base44 custom-function entitlement, app/quota isolation, remaining credits, Render extra-workspace/free-DB eligibility and spending controls. This is information, not purchase approval. If additional charges are needed, present exact checkout quote, taxes/usage and spending ceiling for a separate decision. No resource creation yet.
2. **Creation only:** approve the named empty independent resources at the confirmed cost, explicitly excluding data copies, code deployment and account linking. If creation automatically deploys (e.g. Render web service), defer that operation until deployment approval; do not treat creation consent as deployment permission. Record new actual IDs and backend identity, re-audit, return a populated tuple.
3. **Deployment:** separately approve actual Base44 app/backend ID and main target, Render workspace/service IDs, DB ID/name, migration and runtime-role operations, new-only configuration/secrets, and commit 79146e45d9cdd89aa33090d1e36180cc50a1044d. No valid executable deployment request exists until IDs/cost/isolation gates are filled.
4. **Fictional account/data and private test installation:** approve new lab identities, offline dataset import, exact separate test plugin scope/audience and direct permission probes. Do not replace or share an existing connection. Obtain each tester's permission to create their new link separately; no actual production collection access.
5. **Withdraw/disconnect/reconnect tests:** separately approve the NEW test connections and owner-wide lab V1 withdrawals exercised by the procedure. Existing integrations excluded.
6. **Real CAREFA account compatibility/public distribution:** later separate design and approval. Lab accounts/data do not prove production identity compatibility; no production data copy or live read gateway is included.
