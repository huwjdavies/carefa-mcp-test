# Phase 2 — security, connections and onboarding

Phase 3 continuation: see PHASE3_VERIFICATION_REPORT.md and PHASE3_CONSENT_AUDIT.md. These earlier notes describe the historical baseline; the opt-in generation authority supersedes the mutable-boolean release gate only in the complete isolated v3 package. Nothing is deployed.

2026-10-19. Repository `huwjdavies/carefa-mcp-test`, branch `carefa-multiuser-hardening-20261017`. Continues Phase 1 commits `364773b` and `3cc15c4`; does not replace its collection reader. Initial Phase 2 implementation: `f8c98f68d16e189f51f962e1e8779e9f1cc30362`. Follow-up changes and final CI are visible in this branch's commit history.

## Implemented boundary

New V1 connections can use `companion_links`, a PostgreSQL metadata table beside the existing encrypted OAuth handshake/grant store. This avoids claiming atomicity from Base44's unproven read-then-update exchange. No existing Base44 AiAccessLink is migrated, widened or disconnected. No CAREFA collection table is written.

The production-facing feature remains OFF. `CAREFA_COMPANION_PHASE2=enabled` requires PostgreSQL handshakes/grants, the explicit schema migration, a trusted CAREFA consent reader and a dedicated internal secret. Startup does not apply the new migration. The internal management secret must differ from the legacy bridge credential. Do not enable Phase 2 on a service carrying legacy connections: its authority is deliberately new V1 links. Use an approved isolated target, preserving existing service/connection configuration.

`db/companion-schema.sql` is a development migration, NOT a migration applied to Render. Nothing was deployed, no secrets were created/changed, no actual collector connection was linked/disconnected, and no paid resource was created. Base44 source/schema reads were read-only on `oauth-account-isolation`.

## Lifecycle and proof

- First-party Base44 functions derive the owner from `auth.me()`. Browser owner overrides are rejected. New pending flows bind that owner, fixed read scope/version and the exact validated bridge callback. Account switching between display and approval rejects the old flow.
- PostgreSQL approval is a conditional UPDATE from pending to approved; denial competes on the same state. Approval codes expire within 60 seconds. Redemption is one conditional UPDATE from approved to active matching code hash, exact callback and unexpired deadline. PostgreSQL row locking and predicate re-evaluation provide single-use behavior across processes. Only hashes of the new code/link token are stored.
- A wrong callback does not consume the legitimate code. A successful redemption consumes it permanently; crashes/network/consent failures require a new flow. No retry can issue another link token for that code. This is at-most-once issuance, not guaranteed delivery or a distributed transaction with CAREFA.
- The existing outer OAuth handshake store remains the one-time code/state authority. S256 PKCE, exact redirect/client/resource checks, cookie/upstream state correlation and duplicate-parameter rejection remain enforced. OAuth responses now include `iss`, including errors, and discovery advertises issuer identification. No live redirect allowlist changed.
- Access tokens expire after 15 minutes; rotating refresh credentials have a 30-day bound. V1 upstream links expire after 30 days without sliding renewal, so refreshing cannot keep them alive indefinitely. A fresh approved flow is needed after that bound.
- Phase 2 checks current link state/expiry and current CAREFA consent before issuing/refreshing tokens and before accepting MCP access. Observed denied/withdrawn consent terminally revokes that V1 link. Transient consent-service outages fail closed without treating an outage as revocation.
- CAREFA disconnect atomically revokes that owner's identified link, including pending/approved codes. Every descendant OAuth token then fails the mandatory link check, even if its encrypted grant rows remain for expiry/retention. OAuth token revocation also revokes the V1 upstream link and its OAuth family. Collection data never changes.

## Genuine connection status

The settings view covers Not connected, Awaiting authorisation, Authorised but unverified, Connected, Expired, Disconnected and Connection failed. Pending/unverified links can also be disconnected.

Only the MCP server can record a verification receipt. It does so after a successful protected `carefa_companion_read` response passes the output allowlist, a second OAuth grant check and a current link/consent check. The receipt binds the token hash and immutable collector fingerprint. Demo calls, tools/list, opening ChatGPT, consent and token issuance do not verify anything. A verification race cannot revive a revoked row. Failed post-redemption consent-service calls mark the new flow failed and unusable.

“Connected” means CAREFA has accepted a protected read and its grant/consent are still valid. It does NOT cryptographically attest a named ChatGPT account or prove that a user has not locally uninstalled the plugin. A public OAuth client ID can be reproduced by another client; no browser label or User-Agent is treated as identity. The UI displays the CAREFA account and last verification time, not an invented ChatGPT identity. Host revocation events must reach the revocation endpoint to notify CAREFA immediately; otherwise expiry/explicit CAREFA disconnect applies.

## Staged Base44 integration

Four staged functions and two pages compile locally. `carefaAiCompanionApproval` is authenticated first-party approval/denial, `carefaAiCompanionConnections` handles owner-bound status/disconnect, `carefaAiCompanionConsent` is a private consent lookup, and `carefaAiCompanion` performs read-only data queries. Dedicated internal requests never appear in tools/list and cannot be invoked as AI write tools. Server credentials authenticate CAREFA's adapter only; the opaque V1 link selects the collector for reads.

The real consent schema was inspected read-only: `connection_status` permits only not_connected/pending_provider/connected. Staged explicit approval therefore writes pending_provider, never Connected. The bridge receipt remains authoritative. SDK execution in the real Base44 environment, route build, actual entity authorization, runtime callback behavior and iPhone visual/accessibility checks remain unverified. Local staged-entrypoint tests use fictional SDK/HTTP adapters, not real Base44.

See `integration/base44/README.md` for exact file/configuration staging. The old Phase 1 AiAccessLink-field plan is historical; Phase 2 uses the PostgreSQL authority instead and does not require both competing link authorities. No Base44 files were written remotely.

## Collection intelligence

Reuse the Phase 1 reader and CAREFA's stored CollectorRanking/GymBadgeAchievement data. No new Collector Score, species/type scoring or badge awarding algorithm was introduced. Cards, quantities, variants/languages, separate totals, saved-price estimates, wishlist and binder themes remain owner-scoped. Dashboard valuation parity, exact set completion/missing printings, regional percentages, Pokémon Specialist and Type Mastery remain unavailable until shared canonical PURE adapters are safely extracted and validated. Do not call ranking upserts, price refresh jobs or achievement reconciliation from an AI read. Do not turn absent metrics into zero or confident recommendations.

In Phase 2 mode, only diagnostics/demo and the new companion reader are advertised. Legacy summary/cards/count tools remain unchanged on legacy deployments; they are not offered against the new PostgreSQL link authority because their old Base44 endpoint cannot resolve those new links. This prevents misleading half-working tools or fallback to a different account.

## Verification and reproduction

- `npm ci --ignore-scripts`
- `npm test` — local policy/OAuth/HTTP/staged-entrypoint tests; PostgreSQL tests skip without explicit fixture configuration.
- `npm run check:integration` — staged JSX/TS transpilation/package materialization, not a real Base44 app build or SDK typecheck.
- `npm run test:postgres` — only an explicitly disposable loopback database named carefa_companion_test, with CAREFA_TEST_DISPOSABLE=1 and the fixture encryption key. Applies schemas only there. Never reads DATABASE_URL or contacts Render.

Initial Phase 2 CI passed: https://github.com/huwjdavies/carefa-mcp-test/actions/runs/39179365387 . That run had 52 local tests pass, 8 PostgreSQL skips in the default suite, then all 8 PostgreSQL tests passed with zero skips. It includes four rounds of 12-way approval/redemption races, deny/approve and disconnect/redeem races, and real local HTTP/OAuth/MCP/PostgreSQL with fictional CAREFA 9/1,200-card accounts. Follow-up adds further expiry/receipt/consent and staged adapter tests. Use the latest green branch CI for final counts.

## Remaining uncertainties and release gates

1. No real independent two-account ChatGPT onboarding has been performed. Follow `docs/TWO_ACCOUNT_ONBOARDING_TEST.md` only after target-specific deployment and separate live-linking approvals.
2. No actual installable CAREFA public listing was established. Directory publication/review and representative account/workspace/mobile eligibility remain gates; see `docs/CHATGPT_DISTRIBUTION.md`.
3. Real Base44 runtime SDK behavior, protected routing, consent record defaults/RLS, Origin handling and backend isolation need an approved preview test. A branch of the live app is not automatically a separate backend. Existing broad service-role credentials remain privileged backend secrets, never collector selectors or AI credentials.
4. All V1 consent-withdrawal UI paths must invoke terminal bridge disconnection, even if no read occurs during withdrawal. A legacy Base44 settings path that flips consent false then true without notifying the bridge can erase an unobserved withdrawal interval; this cannot be inferred from a latest-boolean lookup. Do not enable public V1 until those paths are wired/audited. Observed withdrawal and explicit disconnection are terminal and tested.
5. Review migration/runtime least privilege, TLS settings, rate limiting, monitoring, metadata retention/pruning, backup/encryption-key rotation and schema rollout in the chosen environment. No database permissions were changed. The pre-existing OAuth initializer still applies its own old schema at startup; this work adds no automatic Phase 2 migration. Connection history is capped at 100 for status (fails closed above that); establish a reviewed retention/archive policy before large-scale use.
6. Canonical metrics listed above remain unavailable; no new scoring system was substituted. Recommendations must use returned data and disclose unavailable progress.

Human approvals required next: exact isolated Render service, Base44 app/backend/branch, database and commit for deployment/configuration; then separate permission for the two new live test links and any intentional disconnect of those test links. No request for passwords/tokens or changes to existing integrations is needed. Woodland House remains paused and untouched.
