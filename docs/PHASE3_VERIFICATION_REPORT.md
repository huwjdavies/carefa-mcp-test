# CAREFA AI Companion V1 — Phase 3 verification report

Date: 2026-10-19. **Prepared for Maple's independent review. No deployment, live configuration change, real linking, disconnection or collection modification occurred. Not production-ready.**

## 1. Executive summary

The mutable legacy consent boolean is no longer the V1 authority in the prepared Phase 3 mode. The existing PostgreSQL lifecycle now records consent generations and terminal owner-wide withdrawal, with explicit fresh approval required after withdrawal. Automated tests passed against fictional collectors and disposable PostgreSQL. No existing environment was proved fully isolated, so a safe creation proposal and a deliberately blocked deployment preflight are supplied instead of deploying to an assumed-safe branch/service.

## 2. Implemented and verified in automated tests

- Owner-row locking serializes explicit consent, withdrawal, approval-code redemption and verification.
- Withdrawal increments consent generation, denies consent and revokes all of that owner's pending/approved/active V1 links atomically. Old approval codes, link tokens and refresh descendants cannot restore access after a new approval.
- Existing PKCE/state, exact callback/client/resource binding, code single-use, grant-family revocation, expiry, output filtering and owner-scoped read checks remain in place.
- Phase 3 requires its exact terminal authority and verified database TLS; startup performs schema checks rather than new automatic DDL. URL SSL overrides cannot weaken the selected TLS policy.
- Ten-live-pending/approved-flow budget is enforced under an owner lock. Prepared least-privilege role pattern was tested to allow metadata access and deny collection reads/DDL in the disposable fixture.
- Metadata-only binder information explicitly reports actual binder contents unavailable. No new scoring, valuation or achievement engine was introduced.

## 3. Implemented, not platform/integration-tested

Staged Base44 v3 wrappers, protected pages, legacy-surface replacements and deny-CRUD consent schema compile. Fictional SDK/HTTP tests exercise the actual staged entrypoint source; they do not prove Base44 runtime/RLS enforcement, iPhone visual behavior, login-return routing, real TLS or actual ChatGPT installation. Those require an approved isolated target.

## 4. Branch and commits

Repository: https://github.com/huwjdavies/carefa-mcp-test . Branch: carefa-multiuser-hardening-20261017. Phase 2 baseline: 2404cee9eae28857a0a3afcede50bf546769327b (green CI before edits).

- cb74ed9b65a715011eff9708f23ded7ba666d5e5 — terminal consent generations, TLS/startup guards, isolated-only bypass closure and tests.
- 0eb492352541ff08d158ec14a648b5d21b42534f — Phase 3 HTTP/permission tests, runtime role script and isolated target preflight.
- 9d2e2120c5fd60952e791d3b8909a5daad2c14c9 — staged chooser/withdrawal clarity and unavailable binder contents. This is the exact proposed runtime commit, subject to review and explicit approval.
- Subsequent documentation commit supplies this report and the completed approval package; it does not change the runtime above. Consult branch history for its reference.

No merge into main and no Render auto-deploy enabled.

## 5–6. Tests and evidence

Local final runtime suite: **83 tests: 68 passed, 0 failed, 15 PostgreSQL tests skipped** without a database. Integration package transpilation/materialization passed, including isolation-only JSX; git diff whitespace checks passed. This is not a Base44 app build/typecheck or visual iPhone test.

CI for cb74ed9: https://github.com/huwjdavies/carefa-mcp-test/actions/runs/39181636359 — default suite 66 pass/13 database skips, separate PostgreSQL 13 pass/0 skip.

CI for 0eb4923: https://github.com/huwjdavies/carefa-mcp-test/actions/runs/39181873512 — default suite 67 pass/15 database skips, separate PostgreSQL **15 pass/0 fail/0 skip**. It includes both Phase 2 and Phase 3 HTTP/OAuth/MCP flows for independent fictional 9-card/1,200-card collectors and real PostgreSQL transactions. Final pinned-runtime CI: https://github.com/huwjdavies/carefa-mcp-test/actions/runs/39182053101 — **68 general tests passed, 0 failed**, then **15 PostgreSQL tests passed, 0 failed, 0 skipped**. The default suite's 15 skips are all executed in that separate database step.

Reproduce: npm ci --ignore-scripts; npm test; npm run check:integration. PostgreSQL runner accepts only CAREFA_TEST_DATABASE_URL on loopback with database carefa_companion_test and CAREFA_TEST_DISPOSABLE=1. It never reads production DATABASE_URL or Render credentials. SQL role/collection privilege probes run only inside this disposable fixture and roll back.

These are simulated CAREFA/ChatGPT boundary tests with real local HTTP/OAuth/MCP/PostgreSQL, not genuine independent live onboarding. No real card contents are logged. The Phase 1 nine-card read remains historical single-connection evidence, not Phase 3 proof.

## 7. Consent findings

Direct writes existed in Profile's AiConnectConsentCard, AIConnectTest and AiLink; AiLinkStatusCard separately revoked legacy links. They are present in main/oauth-account-isolation/profile-management searches. The legacy schema also permits direct owner-side CRUD, which UI hooks alone cannot close. PHASE3_CONSENT_AUDIT.md records each path and exact isolated-only replacement.

Phase 3 v3 does not write or trust those booleans to grant V1 access. Explicit approval commits in the existing PostgreSQL authority. Isolated schema denies old create/update/delete paths and copied pages route to V1 settings. Live legacy permissions and connections were neither modified nor migrated. The fix is conditional on deploying the entire reviewed isolated v3 package; it is not already installed in CAREFA.

## 8. Remaining security uncertainties

- Actual Base44 RLS/SDK/direct-API denial, independent backend identity, credential separation, first-party Origin handling and login routing are unverified. Any bypass blocks deployment/testing.
- Public edge abuse/request limits, platform request-log query redaction, TLS trust/hostname behavior, spend ceilings, backup/retention policy and operational monitoring need target-specific verification. The pending-flow budget is not a complete public rate limiter.
- Status history caps at 100; define reviewed metadata retention before larger rollout. Do not delete consent generations in a way that permits credential resurrection.
- Do not restore old auth/consent snapshots or roll back to Phase 2's boolean authority; this could revive revoked credentials. Roll back fail-closed while preserving latest revocations.
- Connected proves an accepted protected CAREFA read and a valid grant, not a cryptographically attested ChatGPT identity or proof that the host has not locally forgotten the installation.

## 9–10. Exact environment and production separation

No complete existing target is verified. Only one CAREFA Base44 app was returned (live app 69fc9f9df40058abb77f7f42); its branch is not proved a separate backend. Existing Render test labels do not prove credential separation. CAREFA development PostgreSQL dpg-db9l16dg1s2s739497p0-a is available on a non-free plan; metadata SQL via the connector failed, so active use/roles/schema are unknown.

Fresh proposal: Base44 **CAREFA Companion V1 Isolated Lab**; Render **carefa-companion-phase3-lab**; PostgreSQL **carefa-companion-phase3-db / carefa_companion_phase3**, Frankfurt, in a separately verified zero-cost workspace if eligible. IDs are **NOT CREATED**, not invented. Runtime source is pinned above. PHASE3_ENVIRONMENT_AUDIT.md lists exact observed IDs/branches, unknowns, cost limitations and required separation proof.

Evidence of production preservation: tool actions were source/metadata reads, local/CI fixture work and development-branch commits only; auto-deploy on the hardening lab remained OFF. No production credential/data copy, database permission update, deployment, live link/disconnect or main merge was performed. This does not prove isolation of resources that have not yet been created. No unrelated project was modified.

## 11. Deployment preparation

Three ordered schema migrations, guarded least-privilege role SQL, environment-variable matrix, exact callback policy, read-only target validator, deployment sequence, failure/monitoring guidance and fail-closed rollback are prepared in PHASE3_DEPLOYMENT_APPROVAL.md. The target record intentionally fails until actual identifiers, isolation and zero-cost evidence are supplied. No paid fallback is authorised; free resource eligibility is not guaranteed.

## 12. My AI Assistants

Existing navy/gold identity is retained. The staged page offers Add My AI Assistant → Choose ChatGPT, protected approval/denial, displayed CAREFA identity, seven server-derived statuses, last-read verification, confirmed terminal withdrawal and safe-area/48px controls. Merely choosing, opening ChatGPT or granting consent cannot establish Connected. Old approval requests do not silently migrate; a wrong account must cancel/start fresh. Prepared and compiled; not deployed or visually verified on iPhone.

## 13. Collection intelligence

Owned card records/quantities/variants/languages, separated source totals, clearly labelled saved-price estimates, stored scores/badges, wishlist and binder themes remain readable. Exact set catalogue/missing printings, dashboard valuation parity, regional percentages, Specialist/Type Mastery and binder placements remain unavailable pending validated canonical pure adapters.

Inspected pricing code depends on cached/API/snapshot sources and lives alongside cache-writing helpers. The older Pokémon normalizer retains only the first TAG TEAM partner and strips form details; it cannot safely supply the agreed all-species/canonical-type rules. No competing calculator was extracted or enabled. No ranking/achievement/price writer is called by the AI reader.

## 14. ChatGPT distribution

Current official documentation still describes directory installation and external-service authorisation, publisher/domain verification, review and explicit publication. Mobile uses plugins available to that account; workspace policy can restrict access. No actual CAREFA installable listing, complete CAREFA-specific subscription/region eligibility matrix or ordinary iPhone installation was verified. Signing into ChatGPT is not data consent. CHATGPT_DISTRIBUTION.md and the approval package record these blockers; no listing URL was invented or configured.

## 15. Genuine two-account readiness

Automated foundation: ready for independent review. Deployment/real test: **blocked** on approved resource identities, proven backend/credential/role separation, zero-cost eligibility, SDK/RLS preview checks and a real permitted ChatGPT installation route.

A new isolated backend does not automatically authenticate the existing production collectors or contain their collections. Initial tests use fictional accounts. To involve the nine-card and larger-collection owners, choose and separately approve either an isolated-account/private-snapshot test or a genuinely read-only production-data integration design. Snapshot onboarding does not prove live production integration. No email-based identity mapping or production service-role credential may bridge this gap.

## 16–17. Exact separate approvals required

1. Named empty resource creation at verified zero cost, with no automatic code deployment/data copy.
2. Deployment/configuration/migrations/role setup only after exact Base44 app/backend/branch, Render service/workspace, PostgreSQL instance/database and reviewed commit are recorded. If resource creation auto-deploys, it requires this deployment decision too.
3. Each collector's new test connection to the specified test plugin; any data snapshot/export is a separate consent decision.
4. Explicit disconnection/owner-wide withdrawal of named NEW test links. Existing integrations are excluded.

No approval was requested or inferred from completing this package. No credentials need to be sent in chat.

## 18. Recommended Phase 4

Maple reviews commits/tests and consent-path closure. Resolve the isolated resource/cost/identity/data strategy, obtain scoped creation and then target-specific deployment approval, verify fictional-user SDK/RLS/iPhone flows, and only then request separate account-linking/data/disconnection approvals for the controlled two-owner test. Keep public listing and production migration disabled until real independent onboarding passes.
