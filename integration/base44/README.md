# Phase 2 integration update — STAGED ONLY, 2026-10-19

Phase 2 continues the existing reader/UI with a PostgreSQL link authority to remove the unproven Base44 code-redemption race. Read `docs/PHASE2_SECURITY_HANDOFF.md` and `docs/TWO_ACCOUNT_ONBOARDING_TEST.md` before applying anything. Nothing below authorises deployment or configuration changes.

## Phase 2 files and configuration

- Apply `db/companion-schema.sql` only to the separately approved OAuth database target. The new initializer only checks for this table; it does not migrate it.
- Copy `companion/reader.mjs`, `base44-repository.mjs`, `connection-controller.mjs`, `connections.mjs` into `base44/shared/companion/`, together with the staged `bridge-api.ts`. Existing shared `aiLink.ts` and `collectorFingerprint.ts` remain necessary; fingerprint secret is required but must never enter client code.
- Stage all four functions from this package: carefaAiCompanion, carefaAiCompanionConnections, carefaAiCompanionApproval and carefaAiCompanionConsent.
- Register `MyAiAssistants.jsx` at protected `/my-ai-assistants` as previously described. Register `AiCompanionApproval.jsx` at protected `/AiCompanionApproval`, preserving the complete cb query through CAREFA login. Add the Add My AI Assistant entry button. Existing legacy AiLink/OAuthConsent pages and integrations stay intact.
- After approval ONLY: Render requires durable OAuth storage, CAREFA_COMPANION_V1=enabled, CAREFA_COMPANION_PHASE2=enabled, CAREFA_COMPANION_FUNCTION_URL, CAREFA_COMPANION_CONSENT_FUNCTION_URL and a dedicated CAREFA_COMPANION_INTERNAL_SECRET, distinct from RENDER_BRIDGE_SECRET. Preserve exact actual allowlisted ChatGPT redirects; do not copy examples into live settings. The startup path assembles the new lifecycle only when explicitly enabled.
- After approval ONLY: Base44 needs CAREFA_COMPANION_LINK_AUTHORITY=bridge-postgres-v2, CAREFA_COMPANION_BRIDGE_ORIGIN (exact approved HTTPS issuer), the same dedicated internal secret, the existing data-bridge credential, correct CAREFA_PUBLIC_ORIGIN and account-fingerprint secret. Keep CHATGPT_COMPANION_PUBLIC_READY false and listing URL absent until actual installation is verified. Render controls the new authority's listing/status view.
- Never enable this new authority over a service holding legacy connections. Its new read tokens intentionally resolve only through PostgreSQL. In Phase 2, legacy summary/cards/count tools are not advertised; existing legacy deployments stay unchanged.
- The explicit approval function creates a version-2 consent record through the authenticated user's SDK, with pending_provider (the inspected schema's existing enum), not Connected. Confirm platform-generated created_by_id and consent RLS in the real isolated preview before enabling. All withdrawal paths must invoke bridge disconnect; do not leave a false→true legacy boolean path that can bypass a terminal revocation event.

The old Phase 1 notes below explain the initial staged plan. **Do not also apply the legacy AiAccessLink schema/lifecycle plan when using the Phase 2 PostgreSQL authority.** Keep existing AiAccessLinks untouched. No paid resources, automatic deployments or public availability are implied.

---

# Staged CAREFA integration — NOT APPLIED OR DEPLOYED

Source inspected read-only from Base44 branch `oauth-account-isolation` (`6ad3726306ffdd7f3c4a8d38`) on 2026-10-18. GitHub runtime work stays on `carefa-multiuser-hardening-20261017`; its Render lab has auto-deploy off. No Base44 source has been changed by this assignment.

## UI integration

1. Copy `src/pages/MyAiAssistants.jsx` to the matching Base44 frontend path.
2. In `src/App.jsx`, add `const MyAiAssistants = lazy(() => import('@/pages/MyAiAssistants'));` and register `<Route path="/my-ai-assistants" element={<MyAiAssistants />} />` inside `ProtectedRoute` and `AppLayout` next to `/profile`.
3. Add a Home/Profile link labelled **Add My AI Assistant**, to `/my-ai-assistants`. Match the existing `carefa-luxe-panel`, navy/gold styling. Use a minimum 48px tap target and preserve the fixed bottom navigation/safe area.
4. The page calls first-party `carefaAiCompanionConnections` (not currently deployed). Its `status` response must come from the authenticated CAREFA user and the server model in `companion/connections.mjs`. Never use user-supplied owner IDs, browser localStorage flags, an “I connected” checkbox, or the consent boolean alone to show Connected.
5. `disconnect` must be first-party authenticated, CSRF-protected, explicitly confirmed by the collector, and owner-filtered by `auth.me().id`. It revokes only that user's specified link and its related bridge grant family. This is account-link management, never an AI tool. Do not expose consent, linking, token or revocation operations through MCP tools.
6. `listing_url` stays null/`available=false` until an actual installable ChatGPT listing/invitation has been verified for ordinary users. Do not invent a directory ID or direct-install link. Do not route ordinary collectors through developer mode. The page honestly displays preparation status in the meantime.
7. Replace old `AiLink.jsx` “totals only” disclosure. Explain the actual V1 read categories, show the current CAREFA username (no email) and offer Approve/Deny. Do not trust the `svc` query string for the provider's displayed identity. Fix the `{{user.id}}` literal owner selector by using the verified authenticated user ID; whether the SDK interpolates this client-side placeholder is not proven. Preserve current login/returnTo and callback validation.
8. A user changing CAREFA accounts must cancel the transaction and start fresh. Never reuse an existing grant's owner or retarget it based on the browser's latest login.

## Data endpoint

Copy `base44/functions/carefaAiCompanion/entry.ts` to its matching Base44 path **only after separate deployment approval**. Copy the canonical GitHub `companion/reader.mjs` and `companion/base44-repository.mjs` to `base44/shared/companion/`. These shared modules contain no collection writes. `collectorFingerprint.ts` and `aiLink.ts` are existing helpers. Pin SDK compatibility and run an actual branch preview build before publishing.

The endpoint requires the bridge service credential AND an active per-collector link. A shared service credential never selects a collector. It checks link expiry, scope, new consent version, exact ownership and latest consent on each request; it rechecks after data I/O to discard a result revoked in flight.

The existing `carefaAiConnect` function and tools stay available without replacement. The new Render tool is opt-in through `CAREFA_COMPANION_V1=enabled` and `CAREFA_COMPANION_FUNCTION_URL` for this separate endpoint. No live settings were changed.

## Required link-lifecycle/schema additions before enabling V1

Add fields to `AiAccessLink`: `callback_url`, `scope` (read-only constant), `consent_version`, `access_expires_at`, and `client_verified_at`. These fields are **not present in the inspected schema**. V1 rejects legacy links until the collector explicitly approves the new disclosure; this prevents silent permission expansion.

- At first-party `startLink`: derive `user_id` exclusively from `auth.me()`, require version-2 consent, fix provider to ChatGPT, store the exact validated callback URL and scope. Never accept the owner from the request.
- At bridge `exchangeCode`: require the same exact callback URL recorded on that pending link, recheck current owner consent, and claim a non-expired pending code atomically. The current Base44 implementation reads then updates separately and does not persist callback binding. Do not claim atomicity from an undocumented SDK return shape. Verify a supported compare-and-set/transaction primitive or use the existing bridge's transactional handshake store before rollout.
- On activation, set a distinct `access_expires_at` (the existing `expires_at` is a ten-minute pending-code expiry and must not be reused blindly). Bind the token hash, owner, scope and consent version immutably. A new account gets a new link.
- Set `client_verified_at` only from trusted server evidence after ChatGPT has redeemed its token and successfully used the protected connection. A browser “Continue” click is not evidence. The read-only companion reader intentionally performs no writes; authenticated lifecycle/read-receipt handling must be implemented separately and never modify cards, profiles or achievements.
- Revocation must cover pending and active links and current refresh families. Disconnect must not leave a pending code redeemable. Keep current existing connections intact during migration.

## Canonical calculations and limits

Available adapters use inspected entities: UserCard, CollectionEntry, CollectorRanking, GymBadgeAchievement and Binder. Wishlist reads UserCard with `is_looking_for=true`. No messages, User records, listings, private notes or purchase prices are queried.

Overview distinguishes sources rather than double-counting them. Its saved-price estimate explicitly uses saved UserCard unit prices times quantity and is **not claimed to match the dashboard valuation**. Coverage/freshness are explicit. The complete dashboard valuation requires a shared read-only canonical valuation adapter; never call price refresh jobs or ranking upserts from an AI read.

Exact set completion/missing cards require a complete canonical multilingual printing catalogue and the app's variant-matching keys. Specialist, Type Mastery and regional progress require shared **pure read-only** calculation adapters. They are unavailable by default, not guessed or reported as zero. Do not call `computeAndUpsertUserRanking` or `reconcileGymBadgeAchievements`: those functions write. Preserve the agreed species/form dual-type and TAG TEAM rules when wiring the canonical achievement engine.

## Release gate

This package is reviewable code and an exact integration plan, not a claim of a deployed page or finished public onboarding. Keep the feature disabled until lifecycle additions, canonical adapters, privacy/consent disclosure, installation availability and two-account end-to-end tests are complete.
