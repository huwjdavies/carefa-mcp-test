import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const SCOPE = 'collection:read';
const SESSION_MS = 10 * 60_000;
const CODE_MS = 60_000;
const TOKEN_MS = 15 * 60_000;
const REFRESH_MS = 30 * 24 * 60 * 60_000;
const MAX_ENTRIES = 1000;
const random = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('base64url');
const equal = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const safeHttps = value => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash;
  } catch { return false; }
};

// Development-only storage: rotating refresh tokens are supported, but process restarts
// still invalidate sessions. Production requires a transactional durable store.
export function createOAuthBridge({ publicUrl, appUrl, redirectUris, configured,
  exchangeCode, now = Date.now, durableGrants = null, durableHandshakes = null }) {
  if (!Array.isArray(redirectUris) || redirectUris.some(u => typeof u !== 'string' || !safeHttps(u))) {
    throw new Error('OAUTH_REDIRECT_URIS must be a JSON array of exact HTTPS callback URLs');
  }
  const issuer = publicUrl;
  const resource = `${issuer}/mcp`;
  const clients = new Map(), pending = new Map(), codes = new Map(), tokens = new Map(), refreshTokens = new Map();
  // Stable public OAuth client for the allowlisted ChatGPT callback; no client secret.
  // A deterministic ID survives free-tier restarts without storing credentials.
  const fixedClientId = `carefa-chatgpt-${hash(`${issuer}|${redirectUris.join('|')}`).slice(0,32)}`;
  if (redirectUris.length) clients.set(fixedClientId, {
    client_id: fixedClientId, redirect_uris: [...redirectUris],
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code']
  });
  const ready = () => configured() && safeHttps(issuer) && new URL(issuer).origin === issuer &&
    safeHttps(appUrl) && redirectUris.length > 0;
  function prune() {
    for (const map of [pending, codes, tokens, refreshTokens]) {
      for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
    }
  }
  function json(res, status, data, extra = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', ...extra });
    res.end(JSON.stringify(data));
    return true;
  }
  const error = (res, status, name) => json(res, status, { error: name });
  const redirect = (res, location, headers = {}) => {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', ...headers });
    res.end();
    return true;
  };
  async function body(req) {
    let value = '', size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) throw new Error('oversize');
      value += chunk.toString('utf8');
    }
    return value;
  }
  async function authenticate(req) {
    prune();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization || '');
    return match ? (durableGrants ? await durableGrants.authenticate(match[1], resource) : tokens.get(hash(match[1]))) : undefined;
  }
  function challenge(res) {
    return json(res, 401, { error: 'invalid_token' }, {
      'WWW-Authenticate': `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`
    });
  }
  async function handle(req, res, url) {
    const path = url.pathname;
    const known = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-authorization-server', '/.well-known/openid-configuration', '/oauth/register', '/oauth/authorize',
      '/oauth/token', '/oauth/revoke', '/link/callback'];
    if (!known.includes(path)) return false;
    prune();
    // Discovery is public metadata, not an authorization grant. Keep it available
    // while the isolated test environment is awaiting its callback allowlist.
    // Every registration, authorization, token and callback operation still
    // requires the complete bridge configuration below.
    const discovery = req.method === 'GET' && (
      path === '/.well-known/oauth-protected-resource' ||
      path === '/.well-known/oauth-protected-resource/mcp' ||
      path === '/.well-known/oauth-authorization-server' ||
      path === '/.well-known/openid-configuration'
    );
    if (!ready() && !discovery) return error(res, 503, 'oauth_not_configured');
    if (req.method === 'GET' && path.startsWith('/.well-known/oauth-protected-resource')) {
      return json(res, 200, { resource, authorization_servers: [issuer],
        scopes_supported: [SCOPE], bearer_methods_supported: ['header'] });
    }
    if (req.method === 'GET' && (path === '/.well-known/oauth-authorization-server' ||
        path === '/.well-known/openid-configuration')) {
      return json(res, 200, { issuer, authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`, registration_endpoint: `${issuer}/oauth/register`,
        revocation_endpoint: `${issuer}/oauth/revoke`, scopes_supported: [SCOPE],
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'] });
    }
    if (req.method === 'POST' && path === '/oauth/register') {
      if (clients.size >= MAX_ENTRIES) return error(res, 429, 'registration_limit');
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
        return error(res, 415, 'invalid_client_metadata');
      }
      let data;
      try { data = JSON.parse(await body(req)); } catch { return error(res, 400, 'invalid_client_metadata'); }
      if (!data || !Array.isArray(data.redirect_uris) || data.redirect_uris.length < 1 ||
          data.redirect_uris.length > 10 || !data.redirect_uris.every(u => redirectUris.includes(u)) ||
          (data.token_endpoint_auth_method && data.token_endpoint_auth_method !== 'none') ||
          (data.grant_types && (!Array.isArray(data.grant_types) || !data.grant_types.includes('authorization_code') || data.grant_types.some(g => !['authorization_code', 'refresh_token'].includes(g)))) ||
          (data.response_types && (!Array.isArray(data.response_types) || data.response_types.length !== 1 || data.response_types[0] !== 'code'))) {
        // Report only validation categories, never registration payloads or credentials.
        const reason = !data || !Array.isArray(data.redirect_uris) ? 'missing_redirect_uris'
          : data.redirect_uris.length < 1 || data.redirect_uris.length > 10 ? 'redirect_count'
          : !data.redirect_uris.every(u => redirectUris.includes(u)) ? 'redirect_not_allowlisted'
          : data.token_endpoint_auth_method && data.token_endpoint_auth_method !== 'none' ? 'auth_method'
          : data.grant_types && (!Array.isArray(data.grant_types) || !data.grant_types.includes('authorization_code') || data.grant_types.some(g => !['authorization_code', 'refresh_token'].includes(g))) ? 'grant_types'
          : 'response_types';
        console.warn('[CAREFA OAuth] Registration rejected:', reason);
        return error(res, 400, 'invalid_client_metadata');
      }
      // Return a stable public client ID so Render free-tier restarts cannot
      // invalidate ChatGPT's registration. Redirect URIs are strictly allowlisted.
      const client = clients.get(fixedClientId);
      return json(res, 201, client);
    }
    if (req.method === 'GET' && path === '/oauth/authorize') {
      // Reject duplicate parameters to avoid conflicting parser interpretations.
      for (const key of url.searchParams.keys()) {
        if (url.searchParams.getAll(key).length !== 1) return error(res, 400, 'invalid_request');
      }
      const p = Object.fromEntries(url.searchParams);
      const client = clients.get(p.client_id);
      if (!client || !client.redirect_uris.includes(p.redirect_uri)) {
        console.warn('[CAREFA OAuth] Authorization rejected:', !client ? 'unknown_client' : 'redirect_uri_mismatch');
        return error(res, 400, 'invalid_request');
      }
      if (p.response_type !== 'code' || p.code_challenge_method !== 'S256' ||
          !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge || '') || p.resource !== resource ||
          p.scope !== SCOPE || !p.state || p.state.length > 1024) {
        console.warn('[CAREFA OAuth] Authorization parameters rejected:', {
          response_type: p.response_type === 'code',
          pkce_method: p.code_challenge_method === 'S256',
          pkce_format: /^[A-Za-z0-9_-]{43}$/.test(p.code_challenge || ''),
          resource_match: p.resource === resource,
          scope_match: p.scope === SCOPE,
          state_present: Boolean(p.state),
          state_length_ok: Boolean(p.state && p.state.length <= 1024)
        });
        return error(res, 400, 'invalid_request');
      }
      if (pending.size >= MAX_ENTRIES) return error(res, 429, 'temporarily_unavailable');
      const session = random();
      const upstreamState = random();
      const callbackUrl = `${issuer}/link/callback?state=${upstreamState}`;
      if (durableHandshakes) await durableHandshakes.put('pending', session, p.client_id, { ...p, upstreamState, callbackUrl }, now() + SESSION_MS);
      else pending.set(hash(session), { ...p, upstreamState, callbackUrl, expires: now() + SESSION_MS });
      const approval = new URL('/AiLink', appUrl);
      approval.searchParams.set('cb', callbackUrl);
      approval.searchParams.set('svc', 'Render MCP');
      return redirect(res, approval.toString(), {
        'Set-Cookie': `__Secure-carefa_oauth=${session}; HttpOnly; Secure; SameSite=Lax; Path=/link/callback; Max-Age=600`
      });
    }
    if (req.method === 'GET' && path === '/link/callback') {
      const cookies = (req.headers.cookie || '').split(';').map(x => x.trim())
        .filter(x => x.startsWith('__Secure-carefa_oauth='));
      const cookie = cookies.length === 1 ? cookies[0].slice('__Secure-carefa_oauth='.length) : '';
      const key = hash(cookie);
      const stored = durableHandshakes ? await durableHandshakes.consume('pending', cookie) : null;
      const entry = durableHandshakes ? stored?.payload : pending.get(key);
      if (!durableHandshakes) pending.delete(key); // Consume before any network await to prevent parallel replay.
      res.setHeader('Set-Cookie', '__Secure-carefa_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/link/callback; Max-Age=0');
      if (!entry || url.searchParams.getAll('code').length > 1 ||
          url.searchParams.getAll('state').length !== 1 ||
          !equal(url.searchParams.get('state'), entry.upstreamState)) return error(res, 400, 'invalid_request');
      const destination = new URL(entry.redirect_uri);
      destination.searchParams.set('state', entry.state);
      if (url.searchParams.has('error')) {
        console.warn('[CAREFA OAuth] Callback returned upstream denial');
        destination.searchParams.set('error', 'access_denied');
        return redirect(res, destination.toString());
      }
      const code = url.searchParams.get('code');
      if (!code || code.length > 512) return error(res, 400, 'invalid_request');
      if (codes.size >= MAX_ENTRIES) return error(res, 429, 'temporarily_unavailable');
      try {
        const linkToken = await exchangeCode(code, entry.callbackUrl);
        if (typeof linkToken !== 'string' || linkToken.length < 32) throw new Error('invalid upstream response');
        console.info('[CAREFA OAuth] Upstream exchange succeeded; issuing authorization code');
        const oauthCode = random();
        if (durableHandshakes) await durableHandshakes.put('code', oauthCode, entry.client_id, { ...entry, linkToken }, now() + CODE_MS);
        else codes.set(hash(oauthCode), { ...entry, linkToken, expires: now() + CODE_MS });
        destination.searchParams.set('code', oauthCode);
        return redirect(res, destination.toString());
      } catch (err) {
        console.warn('[CAREFA OAuth] Upstream exchange failed:', err instanceof Error ? err.message : 'unknown error');
        destination.searchParams.set('error', 'server_error');
        return redirect(res, destination.toString());
      }
    }
    if (req.method === 'POST' && (path === '/oauth/token' || path === '/oauth/revoke')) {
      if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        return error(res, 415, 'invalid_request');
      }
      let p;
      try { p = new URLSearchParams(await body(req)); } catch { return error(res, 400, 'invalid_request'); }
      for (const key of p.keys()) if (p.getAll(key).length !== 1) return error(res, 400, 'invalid_request');
      const client = clients.get(p.get('client_id'));
      if (!client) return error(res, 400, 'invalid_client');
      if (path === '/oauth/revoke') {
        const key = hash(p.get('token') || '');
        if (durableGrants) await durableGrants.revoke(p.get('token') || '', client.client_id);
        if (tokens.get(key)?.client_id === client.client_id) tokens.delete(key);
        if (refreshTokens.get(key)?.client_id === client.client_id) refreshTokens.delete(key);
        return json(res, 200, {});
      }
      if (p.get('grant_type') === 'refresh_token' && durableGrants) {
        const result = await durableGrants.refresh({ refreshToken: p.get('refresh_token'), clientId: client.client_id, resource: p.get('resource') });
        return result ? json(res, 200, result) : error(res, 400, 'invalid_grant');
      }
      if (p.get('grant_type') === 'refresh_token') {
        const oldKey = hash(p.get('refresh_token') || '');
        const session = refreshTokens.get(oldKey);
        // Consume before any await: one-time rotating refresh credentials.
        if (!session || session.client_id !== client.client_id || session.expires <= now() ||
            p.get('resource') !== resource) return error(res, 400, 'invalid_grant');
        refreshTokens.delete(oldKey);
        const accessToken = random(), refreshToken = random();
        tokens.set(hash(accessToken), { ...session, expires: now() + TOKEN_MS });
        refreshTokens.set(hash(refreshToken), { ...session, expires: now() + REFRESH_MS });
        return json(res, 200, { access_token: accessToken, refresh_token: refreshToken,
          token_type: 'Bearer', expires_in: TOKEN_MS / 1000, scope: SCOPE });
      }
      if (p.get('grant_type') !== 'authorization_code') return error(res, 400, 'unsupported_grant_type');
      const key = hash(p.get('code') || '');
      const stored = durableHandshakes ? await durableHandshakes.consume('code', p.get('code') || '') : null;
      const entry = durableHandshakes ? stored?.payload : codes.get(key);
      if (!durableHandshakes) codes.delete(key); // One attempt per authorization code.
      const verifier = p.get('code_verifier') || '';
      if (!entry || entry.client_id !== client.client_id || entry.redirect_uri !== p.get('redirect_uri') ||
          entry.resource !== p.get('resource') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
          !equal(hash(verifier), entry.code_challenge)) return error(res, 400, 'invalid_grant');
      if (tokens.size >= MAX_ENTRIES) return error(res, 429, 'temporarily_unavailable');
      if (durableGrants) {
        const result = await durableGrants.issue({ clientId: entry.client_id, linkToken: entry.linkToken, resource: entry.resource, scope: SCOPE });
        return json(res, 200, result);
      }
      const token = random(), refreshToken = random();
      const grant = { linkToken: entry.linkToken, client_id: entry.client_id, resource: entry.resource, scope: SCOPE };
      tokens.set(hash(token), { ...grant, expires: now() + TOKEN_MS });
      refreshTokens.set(hash(refreshToken), { ...grant, expires: now() + REFRESH_MS });
      return json(res, 200, { access_token: token, refresh_token: refreshToken, token_type: 'Bearer',
        expires_in: TOKEN_MS / 1000, scope: SCOPE });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }
  return { handle, authenticate, challenge, ready };
}
