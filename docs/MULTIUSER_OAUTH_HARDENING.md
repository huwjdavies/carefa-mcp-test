# CAREFA multi-collector OAuth hardening — isolated development plan

## Non-negotiable product acceptance
A collector signs into CAREFA, selects a supported AI, approves the requested collection permission once, and can ask about their own collection. No manual token handling, technical settings, or per-user developer intervention. The collector must be able to disconnect and revoke access.

## Current implementation limitations verified in oauth.mjs
- In-memory maps for pending authorizations, codes, and access tokens; restart invalidates sessions.
- Access token lifetime 15 minutes and no refresh-token grant despite registration accepting clients requesting refresh_token.
- Single configured ChatGPT scope/provider; not a generic multi-AI implementation.
- Fixed allowlist of callback URLs; adding providers requires deliberate support.
- Account identity is intentionally omitted from collection API responses, so cross-account diagnostics currently lack a privacy-safe identity assertion.
- Consent and owner-scoped data access exist in Base44; need tests proving isolation rather than trusting displayed connection nickname.

## Architecture to implement on this branch (do not deploy before review)
1. Replace process-local OAuth maps with a durable shared session store. Store only hashed opaque tokens and expiration metadata, encrypted upstream CAREFA link tokens, scoped client/provider IDs, and revocation status. Never expose secrets or personal IDs in tool output. Do not create paid infrastructure without approval.
2. Add refresh-token rotation with reuse detection, bounded lifetimes, atomic one-time redemption, and revocation. Use secure server-side transaction semantics to prevent replay.
3. On OAuth grant, bind immutable CAREFA owner ID to each authorized session; never infer account from a nickname, browser's latest login, or ChatGPT connection label. A switch of CAREFA account must initiate a new grant; it must never silently rebind an existing grant.
4. Add a privacy-safe diagnostic returning a stable, non-reversible, provider-scoped collector fingerprint derived server-side from owner ID with a secret key. No email, name, raw owner ID, token, or credential exposure. Return only on authorized, authenticated requests.
5. Ensure all collection reads use only server-verified owner ID from active grant, with explicit consent checks and database-level owner filter.
6. Provide an accessible consent UI with clear current account, AI provider, read scope, approve/deny, revoke, and a clean redirect back to AI. Do not claim all AI providers supported until each provider integration is actually tested.
7. Add integration tests for two separate accounts A/B with different card totals; ensure no crossover on connection, reconnect, concurrent sessions, account switching, token refresh, revocation, expiry, server restart, and attempted replay.
8. Perform first-time collector UX test with no technical instructions. Define success as one provider connection plus CAREFA sign-in and consent, followed by accurate account-scoped answers.

## Rollout gates
- Automated isolation/security tests pass.
- Restart persistence and refresh rotation verified in isolated deployment.
- Independent A/B end-to-end login tested with real OAuth grants and privacy-safe identity assertions.
- No unintended changes to production CAREFA, existing Render services, or existing users.
- Obtain explicit approval before any production deployment, paid resource, or permission expansion.
