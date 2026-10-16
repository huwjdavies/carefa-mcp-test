# CAREFA MCP bridge — OAuth development branch

Work is isolated to `carefa-plugin-oauth-20261016`. Do not merge or deploy this
branch to the existing live Render service as part of this change.

## Implemented authentication

The MCP endpoint requires a bridge-issued opaque bearer token. Sign-in uses
OAuth authorization code flow with mandatory S256 PKCE and the read-only
`collection:read` scope, bound to the exact `/mcp` resource. Protected-resource
and authorization-server discovery metadata are provided.

Public clients register through `/oauth/register`. Registration and authorization
accept only exact HTTPS callback URLs explicitly configured in
`OAUTH_REDIRECT_URIS` (a JSON array). No redirect hosts are guessed or wildcarded.
Only authorization-code grants and token endpoint authentication `none` are
supported; confidential clients and refresh tokens are not advertised.

The authorization endpoint redirects to the existing CAREFA `/AiLink` page.
CAREFA approval returns to `/link/callback` with a per-transaction state query.
The browser must also present the matching Secure, HttpOnly, SameSite=Lax cookie.
The backend exchanges the CAREFA code using that **exact state-bearing callback
URL**. The upstream account token stays in server memory and is never returned
to the browser or MCP client. OAuth access tokens select only their associated
CAREFA account. Every collection request is checked by the existing CAREFA
backend, so revoking the CAREFA link prevents further collection reads.

Authorization codes last 60 seconds and permit one redemption attempt. Pending
sign-ins last 10 minutes; access tokens last 15 minutes. `/oauth/revoke` revokes
a bridge access token. Directly supplying an upstream CAREFA token is rejected.
The old manual `/link/start` token-display flow is disabled on this branch.

## Local validation

Node 24, no external packages:

```sh
node --check server.mjs
node --check oauth.mjs
node --test test/oauth.test.mjs
```

Tests run entirely on loopback with fictional accounts and a substituted CAREFA
transport. They cover discovery, complete OAuth sign-in, summary retrieval through
the actual server, account isolation, callback state and PKCE enforcement,
redirect/resource/scope validation, replay (including concurrent requests),
denial, upstream failure, expiry, revocation and restart invalidation.
No live CAREFA or Render requests, settings changes or deployments are needed.

## Integration still to verify

These tests are **not a real CAREFA browser login or ChatGPT OAuth connection**.
Before any plugin setting changes, verify in a separately authorized isolated
environment that the existing CAREFA `/AiLink` and `carefaAiLink` functions accept,
preserve and validate the exact state-bearing callback URL during approval and
code exchange. A backend that only accepts the former fixed callback URL needs
compatible development-branch changes; do not remove transaction state to work
around that restriction. Confirm real user approval, denial, account switching
and CAREFA revocation there, then verify the actual client's registration and
redirect requirements. No real callback configuration has been assumed here.

This branch intentionally uses **single-process, in-memory development storage**.
Restarting loses registrations, pending approvals, codes and tokens. It is not
ready for production or multiple instances. Durable encrypted token storage,
shared atomic code consumption, persistent client registration and operational
abuse controls need a production implementation before deployment.

Existing server configuration names are retained: `PORT`, `CAREFA_APP_URL`,
`CAREFA_LINK_FUNCTION_URL`, `RENDER_BRIDGE_SECRET`, `RENDER_PUBLIC_URL`. OAuth
additionally requires `OAUTH_REDIRECT_URIS`; absent or invalid configuration fails
closed. No secrets or live configuration values are included in this repository.
