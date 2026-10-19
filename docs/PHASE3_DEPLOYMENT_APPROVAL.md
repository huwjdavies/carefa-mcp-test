# Phase 3 deployment approval package — PREPARED, BLOCKED, NOT AUTHORISED

Runtime/migration/UI source proposed for review: **9d2e2120c5fd60952e791d3b8909a5daad2c14c9**, branch **carefa-multiuser-hardening-20261017**, repository **huwjdavies/carefa-mcp-test**. Later documentation commits do not change that runtime. Do not deploy a floating branch tip or an unreviewed replacement commit.

## A. Target

Use the fresh-target proposal in PHASE3_ENVIRONMENT_AUDIT.md and deployment/phase3-target.proposed.json. Proposed names: Base44 CAREFA Companion V1 Isolated Lab, Render carefa-companion-phase3-lab, PostgreSQL carefa-companion-phase3-db / logical database carefa_companion_phase3 in a separate zero-cost workspace if eligible. **Actual IDs and isolation evidence do not yet exist.** Therefore there is no complete deployment tuple to approve today. Existing live Base44 app, existing three Render services and current CAREFA database are not substitutes.

## B. Prepared changes

- Runtime: existing server.mjs, oauth.mjs, db modules and companion read/lifecycle modules; no AI write tools.
- Base44 package: all staged functions/shared modules, protected MyAiAssistants and AiCompanionApproval pages; apply the isolation-only overlay for the four legacy surfaces and the legacy consent entity. Rebuild browser assets so old bundles are not distributed. Use only the approved Render MCP endpoint for V1; review native Base44 MCP exposure separately and never use it as a V1 fallback. Keep existing curated MCP entity overrides disabled; new approval/withdrawal/resolve/verification operations must not be advertised to the AI.
- PostgreSQL migrations, in order: db/schema.sql → db/companion-schema.sql → db/consent-generation.sql. Execute ONLY against the new approved database, as its isolated migration administrator.
- Separately approved least-privilege role setup: db/isolated-runtime-role.sql. Guard requires exact carefa_companion_phase3 database. Runtime gets no collection tables, DDL, role creation, memberships or ownership. Set its password using a private secret procedure; no credentials in command arguments, logs, repository or chat.
- Phase 3 startup checks schema presence and performs NO automatic migrations. Old Phase 2 NULL-generation links are not upgraded. The new target starts without any copied auth state.

## C. Configuration (names only; NO values are supplied)

| Target | Variable | Required policy |
|---|---|---|
| Render | NODE_ENV | production (durable-store requirement) |
| Render | OAUTH_STORAGE_MODE | postgres |
| Render | DATABASE_URL | New database, restricted runtime role only; never admin/production |
| Render | PGSSLMODE | verify-full; reject URL ssl* overrides; certificate/hostname verified in preflight |
| Render | OAUTH_SESSION_ENCRYPTION_KEY | Fresh valid AES-GCM key, held privately; no copied production key |
| Render | RENDER_PUBLIC_URL | Exact new isolated HTTPS issuer origin |
| Render | CAREFA_APP_URL | New Base44 app's origin |
| Render | CAREFA_LINK_FUNCTION_URL | New-app endpoint only, needed by existing bridge configuration; never live app |
| Render | CAREFA_COMPANION_FUNCTION_URL | New-app carefaAiCompanion endpoint |
| Render/Base44 | RENDER_BRIDGE_SECRET | Fresh isolated data-bridge secret; not a collector identity |
| Render/Base44 | CAREFA_COMPANION_INTERNAL_SECRET | Separate fresh >=32-character management secret, distinct from data bridge secret |
| Render | OAUTH_REDIRECT_URIS | Exact URI shown for the new approved test ChatGPT installation; no wildcards/examples |
| Render | CAREFA_COMPANION_V1 / CAREFA_COMPANION_PHASE2 / CAREFA_COMPANION_PHASE3 | All enabled only in the approved isolated target |
| Base44 | CAREFA_COMPANION_LINK_AUTHORITY | bridge-postgres-v3; no v2 fallback |
| Base44 | CAREFA_COMPANION_BRIDGE_ORIGIN | Exact new isolated HTTPS issuer |
| Base44 | CAREFA_PUBLIC_ORIGIN | Exact approved frontend origin, including preview origin only when expressly approved |
| Base44 | CAREFA_ACCOUNT_FINGERPRINT_SECRET | Fresh isolated secret; no frontend exposure |
| Render/Base44 | CHATGPT_COMPANION_PUBLIC_READY | false; never invent a directory listing |
| Render | CHATGPT_COMPANION_LISTING_URL | Absent until the actual allowed test/public installation is verified |

The Phase 2 private consent lookup is not used by Phase 3: PostgreSQL owns V1 consent. CAREFA_COMPANION_CONSENT_FUNCTION_URL is unnecessary in Phase 3. Pin frontend SDK compatibility to the real approved Base44 runtime; current transpilation does not typecheck or run that platform.

## D. Deployment sequence — DO NOT EXECUTE WITHOUT TARGET-SPECIFIC APPROVAL

1. Resolve zero-cost eligibility and create only separately approved empty resources. Resource creation that triggers an initial deployment needs deployment approval too. Record actual resource/backend IDs, origins, regions and quota separation. Never duplicate production secrets/data/jobs.
2. Inspect the new empty target's metadata and credential boundaries. Confirm no shared env groups, old callbacks, production writable credentials or seeded real data. Keep external PostgreSQL exposure closed except a narrowly approved migration path; private networking also requires role isolation.
3. Privately provision fresh credentials. Apply the three migrations using the isolated migration role. Apply the separately approved runtime-role grants. Verify no DDL/collection privileges and TLS chain/hostname validation. Remove any temporary migration access after approved completion.
4. Populate the non-secret target record with the exact runtime commit and evidence, retaining a separately recorded owner approval. Run node scripts/check-isolated-target.mjs path/to/reviewed-target.json. A pass does not grant approval or prove the fields truthful; Maple/operator verifies evidence independently.
5. With deployment approval identifying the actual IDs/database/commit, deploy staged Base44 functions/routing/schema to the new app only and the pinned Render runtime to the new service. Auto-deploy remains off. Avoid creating the Render service before this permission if creation automatically deploys it.
6. Run health/discovery/syntax/preview checks. Verify fixed read scope, exact issuer/redirects and secret rejection. Test the consent CRUD deny policy using a fictional ordinary user's SDK AND direct entity API; test no old legacy endpoint can mint a usable V1 grant. Verify the v3 authority on every endpoint.
7. With fictional collectors, verify all seven statuses, explicit consent, denial, account switching, failed verification, refresh, withdraw-all and reconnect. A protected read alone records verification. Confirm logs contain route/status counts only, no cookies, codes, tokens, query strings, email addresses or card contents. Review platform request-log query handling, not just application logging.
8. Exercise iPhone app/browser return paths and wrong-account cancellation. Check safe-area spacing, 48px targets, error recovery and copied browser bundles. Confirm ordinary users need no API keys, server URLs or developer setup on the actual install route.
9. STOP before real linking. Obtain the separate account/data/test-disconnection approvals below. Keep public availability false.

## E. Rate limits, monitoring and failure behavior

Implemented: closed arguments/actions, body bounds, owner-scoped ten-pending-flow limit under a PostgreSQL lock, bounded scans/pages, metadata status cap, timeout/redirect refusal, TLS checks, generic failures and current-generation invalidation. These are not a complete public edge rate limiter. Before exposure, approve and verify endpoint request-rate/abuse limits, workspace spend ceilings and concurrency limits; no permanent keep-awake jobs. Monitor only aggregate 401/403/409/429/503 counts, latency, database saturation, grant expiry and failed verification. Never log grant payloads or collection responses.

Consent API/database outages fail closed; an unavailable status must not be labelled Connected. Approval/code delivery is at most once, not guaranteed exactly-once delivery: failed network responses require a new flow, not replay. A concurrent refresh can return an opaque credential that has already become unusable after withdrawal. Post-commit token/grant checks prevent it restoring data access.

## F. Backups and rollback

Free Render PostgreSQL has no managed backups; do not claim otherwise. Any approved manual encrypted export remains private and outside the repository. It must never be printed or uploaded into chat. Do not restore old OAuth/consent snapshots into an accepting service: doing so could resurrect withdrawn credentials. Prefer disposable fictional test data and fresh explicit authorisation over restoring auth state.

Rollback is fail-closed: stop isolated ingress/service and disable test installation, preserve latest revocation/generation history, keep publicReady false, investigate privately, and restore only a reviewed Phase 3-compatible build after approval. NEVER roll back to Phase 2's mutable-boolean authority or drop the new consent table/column. No down migration is supplied. If auth-state restore is unavoidable, keep service inaccessible and require a separately reviewed invalidation/key/issuer plan and fresh authorisations before reopening. Reverting a Git commit alone is not a safe consent rollback.

Rollback actions affect only the approved new target. Suspending a service, changing flags, restoring backups, rotating credentials or deleting resources still requires the relevant explicit approval; this document does not authorise those actions. Production app/services, existing integrations and unrelated resources remain untouched.

## G. Cost

Zero-cost eligibility is NOT confirmed. Free PostgreSQL is one per workspace and expires after 30 days; existing shared-workspace quota/billing can affect other services. A new isolated free workspace/app/backend may be unavailable under the account's plan. Stop if cost cannot be guaranteed; no paid resources or upgrades are approved. Do not repurpose unrelated resources to obtain a free slot.

## H. Separate human decisions

1. **Resource proposal approval:** only named empty isolated resources at confirmed zero cost; actual IDs/backend separation must then be recorded. This is not permission to deploy code, import data, connect accounts or alter existing resources.
2. **Deployment approval:** exact actual Base44 app/backend/branch, Render service/workspace, PostgreSQL database/instance, runtime role/migration scope and reviewed commit above. Migration/role/configuration/deployment operations must be explicitly included. A service-creation operation that auto-deploys is part of this decision.
3. **Test-account/data approval:** each owner independently approves a new test connection; specify the exact test plugin and account identities privately. Any private snapshot/export into the isolated app is a separate data-copy decision. No credentials in chat and no existing connection replacement.
4. **Test-disconnection approval:** explicitly name which NEW test connection(s) and owner-wide V1 withdrawals may be exercised. Do not include existing integrations or assume linking approval includes disconnection.
5. **Publication/migration approval later:** public listing, production integration, changes to live consent paths, callback credentials or transition of legacy connections require a later separate review. None is authorised here.

The exact human onboarding steps are in TWO_ACCOUNT_ONBOARDING_TEST.md. No genuine independent onboarding has yet been run.
