# Phase 3 test gate — still NOT RUN

Read PHASE3_DEPLOYMENT_APPROVAL.md and PHASE3_ENVIRONMENT_AUDIT.md first. No existing isolated backend was proved. Do not run the steps below until the exact new target and deployment are approved and verified. New isolated Base44 accounts have different identities/data from production; do not equate them by email. An owner-approved private snapshot copy or a separately approved genuinely read-only production integration is a prerequisite for testing the existing nine-card/larger-collection datasets. Fictional and snapshot tests are distinct from genuine live production-account onboarding.

Phase 3 additions to the procedure:

- Approve creation/linking separately from intentional test disconnection/withdrawal. Record which named NEW V1 links may be withdrawn; exclude all existing integrations.
- Before real linking, use a fictional ordinary collector to verify direct AICompanionConsent create/update/delete requests are denied in the isolated backend. Confirm every old consent surface is replaced and all active endpoints use bridge-postgres-v3. Attempting an old schema/API response must fail closed.
- Test full consent withdrawal with one active A link plus an A pending approval/code. All old A reads, refresh credentials and codes must fail. B must remain usable. Merely turning a legacy boolean on cannot reconnect A.
- Start an entirely fresh A flow and explicitly approve read-only access. Require correct A fingerprint/count and new verification only after a protected read; retry ALL old tokens/codes afterward and require continued rejection.
- During approved fictional test sessions, race refresh/approval with withdrawal. Do not manipulate production timestamps or credentials. For genuine owners, carry out only the specific approved test operations and log counts/fingerprints/statuses, never card contents or secrets.
- Confirm the actual installation route works on each owner's ChatGPT account/iPhone without asking the collector for MCP URLs/API keys/developer setup. A custom development-server experiment is not proof of ordinary public installability.

The original account-owner steps below remain the detailed sequence after these gates pass.

---

# Controlled two-account onboarding — NOT RUN

No new live linking, disconnect, refresh experiment, expiry manipulation or collection mutation was performed in Phase 2. The Phase 1 nine-card summary is historical evidence of one existing authenticated connection only.

## Required approvals and environment record

Before any deployment or live test, the owner must approve the exact Render service ID, Base44 app/backend and branch ID, PostgreSQL database target and commit SHA. Record them here privately or in an operational ticket. No target is approved by this document. The existing hardening lab is `carefa-oauth-hardening-lab` (`srv-db9lk6mq1p3s738ne2gg`); its auto-deploy was OFF. Do not assume the inspected branch of the live Base44 app has an isolated backend. Establish actual backend/entity/secret isolation before selecting it. No new paid resources are permitted.

Separately approve linking two NEW test connections for:

- Collector A: the existing nine-card test account.
- Collector B: another account whose owner explicitly authorises the test.

Each collector signs in themselves. Never request passwords, tokens, email addresses or screenshots containing codes. Never replace/disconnect the original collector's current ChatGPT integration. If the chosen host account cannot keep separate test connections without replacing an existing one, STOP that test; use a separate authorised ChatGPT account/profile or another verified supported test installation. Separate chats alone do not guarantee separate OAuth credentials.

## Human sequence after deployment approval and preview checks

1. Confirm the exact approved URLs/commit, feature flags and separate test plugin listing/invitation. Confirm Base44 preview build, SDK compatibility and consent entity permissions. Keep public availability false until distribution is genuinely verified.
2. Use two separate browser profiles/devices and, where needed, separate authorised ChatGPT accounts. Label evidence A/B using random collector fingerprints, never email addresses.
3. Collector A signs into the approved CAREFA test surface. Confirm the collection has exactly 9 UserCard records; distinguish records, quantities and CollectionEntry records. Do not add/remove cards to make a test pass.
4. Tap Add My AI Assistant → ChatGPT. Follow the actual supported ChatGPT install/connect surface. Check that the CAREFA approval screen names A's collector account. Approve read-only access. Before the first protected read, CAREFA must show Authorised — waiting for verification, not Connected.
5. In a new ChatGPT conversation explicitly select the test plugin. Ask: “Read only: summarise my collection and return the collector fingerprint and owned UserCard record count.” Expect A's count 9 and fingerprint A. Do not print card contents. Check CAREFA now reports Connected with a server verification timestamp.
6. Collector B independently repeats steps 3–5. Record B's own expected record count from their signed-in app and fingerprint B. Require A and B fingerprints to differ; require both authenticated results to match their respective accounts. Do not assume B holds the fictional fixture's 1,200 cards.
7. Return to A's original chat and repeat the read after B connects. A must still return 9/fingerprint A. Repeat B. This catches shared/latest-login owner selection. A browser login change must not retarget an existing grant.
8. Ask A's assistant to read B by owner ID/fingerprint and to add/delete/edit a card. Expect rejection/no write tool. Verify neither collection changed through the app; don't actually perform writes.
9. In a NEW pending A approval flow, switch the browser to B before approval. Expect rejection requiring restart. Cancel and deliberately start a fresh B flow if needed; never reuse/retarget A's grant.
10. Test Deny in a new flow. Expect access_denied and no usable code/token. Do not interpret an existing separate active connection as a denial failure.
11. With separate approval for the NEW test connection only, disconnect A from CAREFA. Its old reads and refresh must fail; B must continue working. Reconnect A by fresh consent; expect the same collector fingerprint, a new opaque grant and the original count 9. Do not remove data already shared into chats.
12. Test token expiry and refresh using the approved isolated fixture environment/short-lived test policy. Never change live database timestamps, permissions or credentials to force expiry. Confirm expiry/withdrawn consent blocks reads/refresh and reconnection requires explicit consent where applicable.
13. Record iPhone tap targets, safe-area/navigation overlap, browser return flow, account label accuracy, errors, cancelled consent, status freshness, reconnect/disconnect confirmation and absence of developer instructions.

## Minimal evidence table

| Check | Expected | Actual | Result |
|---|---|---|---|
| A independent first connection | 9 UserCard records; fingerprint A | Not run | Unverified |
| B independent first connection | B's own count; different fingerprint | Not run | Unverified |
| A after B signs in | Still 9 and fingerprint A | Not run | Unverified |
| Cross-account/write requests | Rejected; no collection changes | Not run | Unverified |
| Deny/account switch | No new authorised access | Not run | Unverified |
| A test disconnect | A reads/refresh denied; B unaffected | Not run | Unverified |
| Reconnect/expiry | Correct identity; fail closed when expired | Not run | Unverified |
| Ordinary iPhone installation | No developer tools/admin per user | Not run | Unverified |

Store only counts, timestamps, commit/run references, pseudonymous fingerprints and pass/fail outcomes. Redact all tokens/codes/credentials and real collection contents. Any discrepancy blocks public rollout.
