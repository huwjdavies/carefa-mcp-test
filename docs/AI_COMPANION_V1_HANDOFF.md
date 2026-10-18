# AI Companion V1 — verification handoff

Date: 2026-10-18. Repository: huwjdavies/carefa-mcp-test. Development branch: carefa-multiuser-hardening-20261017. Implementation commit: 364773b04734e267e48d594a269c70caede1f15b. Follow-up commit adds bounded edge projection and this report.

## What existed

The bridge already supported OAuth authorization codes, PKCE, refresh, protected MCP collection reads, per-link account association, fingerprints and optional encrypted PostgreSQL grant storage. Base44 has consent/linking pages and owner-filtered collection functions. Existing Render hardening lab follows this branch with auto-deploy OFF; isolated test and diagnostic services use other branches. No Render or Base44 configuration/source was changed.

A genuine read using the existing CAREFA OAuth Fresh Test connection returned Total user cards: 9 and Collection entries: 0. This is an authenticated existing-connection check, NOT independent first-time onboarding or proof of isolation from the original collector. No real card contents are included here. No existing integration was disconnected.

## Implemented

- Pure read-only reader, strict ownership on every entity query and returned row, current consent and link expiry/scope checks, post-read revocation check, closed arguments, bounded scans and pages, no private notes/emails/user records.
- Owner-specific cards/quantities/variants/languages, separate collection-source totals, labelled saved-price estimates, wishlist, binders, stored ranking and badge reads. Exact missing cards require a complete canonical catalogue; specialist/type/regional calculations require pure canonical adapters. Unsupported metrics return unavailable rather than fabricated zero/progress.
- OAuth read-scope enforcement; memory grant-family revocation; PostgreSQL refresh/revoke serialization and family revocation through consumed credentials. Generic upstream errors and OAuth reconnect challenges. Existing legacy tools preserved.
- Expanded default test coverage: previously excluded OAuth tests had an unawaited authentication result and stale client-registration assumptions; fixed the harness and included it in npm test.
- Feature-gated new MCP tool: disabled unless CAREFA_COMPANION_V1=enabled. No live environment settings changed.
- iPhone-oriented My AI Assistants React page, first-party connection controller and staged Base44 entrypoints. Honest server-derived status, explicit disconnect confirmation and no false Connected state from a browser click or consent alone. These files have NOT been applied/deployed to Base44. Integration instructions: integration/base44/README.md.

## Reproduction and evidence

Run npm ci --ignore-scripts, npm test, npm run check:integration. Current local suite: 51 tests, 46 pass, 0 fail, 5 PostgreSQL tests skipped without explicit disposable DB. JSX and both TypeScript entrypoints compile; this is not Base44 SDK runtime/type-check or mobile browser visual verification.

Implementation CI: https://github.com/huwjdavies/carefa-mcp-test/actions/runs/39177512742 — success. Its npm test: 50 tests, 45 pass, 0 fail, 5 skipped. Separate PostgreSQL 18 fixture run: 5 pass, 0 fail, 0 skipped. Includes family revocation after refresh and 12 refresh/revoke races. Follow-up adds one oversized-page test; check its own branch workflow result before rollout.

CI provisions only an ephemeral local fixture named carefa_companion_test. PostgreSQL tests require CAREFA_TEST_DISPOSABLE=1 plus CAREFA_TEST_DATABASE_URL on loopback with that exact database name. They never use a Render DATABASE_URL. No production database permissions were changed. A local PostgreSQL setup attempt was blocked by host filesystem ownership restrictions; CI provides the actual PostgreSQL evidence.

HTTP tests use genuine local HTTP/OAuth/MCP code with fictional CAREFA repositories (9 versus 1,200 cards), not live CAREFA/ChatGPT. They cover first linking, owner isolation, refresh, reconnect, revoked consent, closed arguments, rejected write methods and read-only tool declarations. Pure tests cover invalid/expired/revoked links, wrong scope/provider, missing/denied consent, poisoned owner rows, in-flight revocation and data projection. Existing OAuth tests exercise PKCE/state/code/client rejection. These tests do not prove the unmodified live Base44 code has the new protections.

## Supported collector journey

CAREFA Add My AI Assistant → My AI Assistants → ChatGPT's actual install/connect surface → CAREFA sign-in and explicit consent → return to ChatGPT → verified server status in CAREFA. CAREFA never requests ChatGPT credentials, embeds its sign-in, or silently installs anything. Keep the listing button unavailable until an actual usable listing/invitation is verified; ordinary collectors must not need developer mode or API keys.

Official sources inspected:
- https://developers.openai.com/plugins/build/auth — OAuth/PKCE, protected-resource metadata and per-tool security schemes.
- https://developers.openai.com/plugins/deploy/submission — public distribution/review requirements.
- https://developers.openai.com/siwc/chatgpt-plugin — separate limited-partner Sign in with ChatGPT flow; not required for this CAREFA-owned login architecture.

## Release blockers and next assignment

1. Apply the staged integration only with separate deployment approval in a suitable non-production Base44 environment. Existing oauth-account-isolation branch was inspected read-only; do not assume branch writes are non-deploying.
2. Add the documented link schema fields and version-2 consent. Persist and exactly compare callback URLs. Implement provably atomic one-time code redemption using a supported transaction/compare-and-set facility, or bridge transactional storage. Existing Base44 read-then-update exchange is not proven atomic.
3. Implement trusted successful-client verification receipts, activation expiry/renewal policy, and coordinated upstream-link/bridge-family disconnect. Preserve legacy integrations; never silently widen consent. Refresh currently still relies on upstream per-read checks to deny withdrawn consent; public lifecycle needs end-to-end verification.
4. Correct old totals-only consent copy and literal owner placeholder, validate account-switch cancellation, and wire canonical pure metrics without calling ranking/achievement writing helpers. Review least-privilege DB migration/runtime roles separately; current bridge startup initialization predates this work.
5. Verify actual install/distribution availability and complete two independent collector end-to-end onboarding sessions, including the authorized 9-card account and another account; denial, expiry, refresh, disconnect, and account switching. No private contents in logs.
6. Run an actual Base44 preview build and iPhone layout/accessibility checks. No public-readiness or deployed-page claim is made.

Human action now: Maple can inspect the commits and CI without changing anything. Before deploying the prepared integration or changing any live configuration, obtain the owner's explicit approval identifying the target environment. No human needs to share passwords, tokens or API keys in chat. A later genuine two-account onboarding test requires the two collectors to complete their own supported consent flows.

Woodland House remained paused; no project files, services or data were modified.
