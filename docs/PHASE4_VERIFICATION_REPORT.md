# CAREFA AI Companion V1 — Phase 4 verification report

Date: 2026-10-19. Review for Maple. **Development verified; isolated environment, exact incremental cost and independent onboarding remain blocked/unverified. Not production-ready.** No creation, deployment, publication, live configuration/permissions changes, remote dataset insertion, collection read/copy, account linking/disconnection or main merge was performed.

## 1. Independently verified

Read the existing Phase 1/2 handoffs and discovered Phase 3 filenames: PHASE3_VERIFICATION_REPORT.md, PHASE3_ENVIRONMENT_AUDIT.md, PHASE3_DEPLOYMENT_APPROVAL.md and PHASE3_CONSENT_AUDIT.md; retained the existing architecture and onboarding/installation/Base44 integration documents. Branch head initially a1debec40d71243b9893be81a3f71c1e34dd4638; latest Phase 3 CI 39182493618 passed before changes.

Read-only resource inventory confirms only the live CAREFA Base44 app is visible, three pre-existing CAREFA Render services and the existing CAREFA development PostgreSQL database; none proves isolation. The proposed app/service/DB do not exist in accessible inventory. Existing workspace's free PostgreSQL slot is occupied. Exact safe target and no-additional-cost entitlement are not verified. See PHASE4_ENVIRONMENT_AND_COST.md for IDs, sources, evidence requirements and conditional alternatives.

## 2. Implemented and locally verified

- Approval preflight now refuses auto-deploy, non-explicit-free plans and missing V1/Phase2 security flags, in addition to existing ID/consent/isolation/cost gates. A validator pass is not independent provider proof or deployment approval.
- Offline fixture factory: A9 records/9 copies, B1,200 records/2,400 copies; disjoint printings/set markers, fictional names, no auth/owner/email fields. Payloads omit offline fixture keys and cannot select a real owner. No seeder/network operation exists.
- Tests assert deterministic data, distinct collections, quantities, removal of ownership/auth fields and rejection of unknown/prototype collector keys.
- Staged iPhone approval page gets top/bottom safe-area spacing; permissions disclosure gets a 48px target. Existing navy/gold tokens, server-derived status and explicit read-only/withdrawal disclosures preserved.

## 3. GitHub and validation evidence

Repository: huwjdavies/carefa-mcp-test. Branch: carefa-multiuser-hardening-20261017. Runtime/UI/fixture/preflight commit: **79146e45d9cdd89aa33090d1e36180cc50a1044d**. Phase 4 report/approval documents are a later documentation commit on that branch; deploy only the pinned runtime after separate approval.

Local npm test: **85 total, 70 passed, 0 failed, 15 skipped**. Skips are PostgreSQL integration cases: no local PostgreSQL/docker fixture executable was available. Local integration compilation/materialisation and git diff --check passed. Proposed-target preflight rejected missing actual IDs/evidence as expected.

GitHub CI run **39187684513**, job **117853460373**, commit 79146e4: **SUCCESS**. Logs confirm default suite 70 passed/15 skipped/0 failed; dedicated PostgreSQL 18 disposable fixture suite **15 passed, 0 failed, 0 skipped**; staged integration compilation and JavaScript syntax passed. CI uses loopback carefa_companion_test with explicit disposable guard, not Render. This is automated protocol/database/mocked-platform evidence, not Base44/ChatGPT end-to-end evidence.

## 4. Security review

Reviewed PostgreSQL terminal consent owner-row locking/current-generation checks, conditional one-use approval redemption, exact callback condition, private management API and owner-filtered read adapter. Existing tested PKCE/state, expiry, refresh rotation/family revocation, replay/cross-owner rejection and post-read verification protections remain intact in CI. Withdrawal increments generation and revokes owner's pending/approved/active links transactionally; old refresh/access/code descendants cannot restore current-generation access; fresh reconnect requires new flow and explicit consent. Production legacy integrations have not received these changes.

Base44 staged reads use service role (admin-capable), authenticated bridge PLUS independently resolved per-user link, closed entity mappings, owner filters, poison-row rejection and no collection-write methods. Therefore read-only is enforced by curated server code, NOT by a physically read-only Base44 credential. Compromise of backend service-role runtime is a broader trust boundary. Do not describe normal-user RLS tests as proving service-role least privilege. No AI-visible entity write tools are permitted.

Prepared legacy consent deny-create/update/delete schema is only statically verified. Actual Base44 boolean-policy interpretation, SDK count/filter/paging and effective deployed rules remain untested. Base44 docs state any matching rule grants access, so broad additional rules matter. PHASE4_LAB_TEST_PLAN.md specifies known-existing sentinels, ordinary A/B/anonymous SDK and direct HTTP probes, persisted-state checks and no production testing. No remote permission tests were run.

Other release gates remain: provider request-log query redaction, public edge abuse limits, actual TLS/role restrictions, quotas, SDK/runtime integration, username-absent account identification, canonical progress/catalogue parity, iPhone/VoiceOver/navigation and OAuth return paths. No vulnerability claim or production-readiness claim follows from passing compilation.

## 5. Infrastructure, cost and distribution

Proposed-only identities: Base44 CAREFA Companion V1 Isolated Lab; Render carefa-companion-phase3-lab; PostgreSQL carefa-companion-phase3-db / carefa_companion_phase3. Actual IDs/backend identity NOT_CREATED. New empty independent backend/auth/data/secrets required; a live-app branch is insufficient. Separate Render workspace/private network/quotas and credentials are proposed, eligibility unconfirmed. Evidence of production isolation does not yet exist for these hypothetical resources.

Official pricing supports conditional free Render compute, with 30-day database expiry and material suspension/usage limits. Base44 Builder annual equivalent $40/month ($480 upfront/year), with custom backend functions; current account entitlement and incremental cost unknown. Current Render dynamic paid price table not extracted; official July snapshot ~$13/month for always-on small web + DB is only an alternative estimate. No guaranteed ongoing free environment or current paid quote. Exact account-specific spending remains an owner/provider evidence blocker, not permission to spend.

CAREFA plugin search returned none in current discovery context, while existing CAREFA MCP namespaces are available. That does not prove absence of a private integration, or prove a shareable lab integration exists. Current OpenAI docs support custom MCP testing subject to account/workspace policy, and plugin use on mobile for available non-desktop-only plugins. Public distribution requires publisher/domain verification, review and publication. No public CAREFA listing, second-account installability, subscription/region eligibility or iPhone CAREFA flow was verified. See the appended Phase 4 section in CHATGPT_DISTRIBUTION.md.

## 6. Readiness and exact next decisions

Prepared: revised runtime pin/proposal, fictional dataset, direct API denial test matrix, insertion ownership rules, iPhone acceptance checks and target-specific deployment approval package. Existing Phase 3 migration/configuration/monitoring/fail-closed rollback procedures are reused. Public readiness remains false. PHASE4_DEPLOYMENT_APPROVAL.md is authoritative for Phase 4 pin and separate decisions.

Not ready to deploy today: exact target identities, independence and cost are absent. First obtain non-secret account entitlement/usage/extra-workspace evidence. Then request **creation-only approval** for named empty resources at verified cost; any auto-deploying creation operation must wait for deployment approval. Re-audit actual IDs and return a populated deployment tuple.

Separately request **deployment approval** naming actual Base44 app/backend, Render workspace/service, PostgreSQL ID/name, migration/role/configuration scope and commit 79146e45d9cdd89aa33090d1e36180cc50a1044d. Then separately approve **fictional lab account/data/private installation tests**, each new test link, and **withdraw/disconnect/reconnect tests** for those new links only. Real CAREFA production identity/collection compatibility and publication remain later separate decisions. Lab users cannot prove production-account compatibility.

Recommended Phase 5: resolve entitlement/quotas and private two-tester installation audience; create only expressly approved isolated resources, verify actual boundaries, obtain exact deployment approval, deploy, prove direct entity denials and then conduct separately approved fictional two-account onboarding. Preserve all existing integrations.
