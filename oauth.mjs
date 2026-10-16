import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const SCOPE = 'collection:read';
const SESSION_MS = 10 * 60_000;
const CODE_MS = 60_000;
const TOKEN_MS = 15 * 60_000;
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

// Single-process development implementation. A restart invalidates every session.
// No refresh tokens: the collector signs in again after access-token expiration.
export function createOAuthBridge({ publicUrl, appUrl, redirectUris, configured,
  exchangeCode, now = Date.now }) {
  if (!Array.isArray(redirectUris) || redirectUris.some(u => typeof u !== 'string' || !safeHttps(u))) {
    throw new Error('OAUTH_REDIRECT_URIS must be a JSON array of exact HTTPS callback URLs');
  }
  const issuer = publicUrl;
  const resource = `${issuer}/mcp`;
  const clients = new Map(), pending = new Map(), codes = new Map(), tokens = new Map();
  const ready = () => configured() && safeHttps(issuer) && new URL(issuer).origin === issuer &&
    safeHttps(appUrl) && redirectUris.length > 0;
  function prune() {
    for (const map of [pending, codes, tokens]) {
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
  function authenticate(req) {
    prune();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.authorization || '');
    return match ? tokens.get(hash(match[1])) : undefined;
  }
  function challenge(res) {
    return json(res, 401, { error: 'invalid_token' }, {
      'WWW-Authenticate': `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`
    });
  }
  async function handle(req, res, url) {
    const path = url.pathname;
    const known = ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-authorization-server', '/oauth/register', '/oauth/authorize',
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
      path === '/.well-known/oauth-authorization-server'
    );
    if (!ready() && !discovery) return error(res, 503, 'oauth_not_configured');
    if (req.method === 'GET' && path.startsWith('/.well-known/oauth-protected-resource')) {
      return json(res, 200, { resource, authorization_servers: [issuer],
        scopes_supported: [SCOPE], bearer_methods_supported: ['header'] });
    }
    if (req.method === 'GET' && path === '/.well-known/oauth-authorization-server') {
      return json(res, 200, { issuer, authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`, registration_endpoint: `${issuer}/oauth/register`,
        revocation_endpoint: `${issuer}/oauth/revoke`, scopes_supported: [SCOPE],
        response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
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
          (data.grant_types && (!Array.isArray(data.grant_types) || data.grant_types.length !== 1 || data.grant_types[0] !== 'authorization_code')) ||
          (data.response_types && (!Array.isArray(data.response_types) || data.response_types.length !== 1 || data.response_types[0] !== 'code'))) {
        return error(res, 400, 'invalid_client_metadata');
      }
      const client_id = random();
      const client = { client_id, redirect_uris: [...data.redirect_uris],
        token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'] };
      clients.set(client_id, client);
      return json(res, 201, client);
    }
    if (req.method === 'GET' && path === '/oauth/authorize') {
      // Reject duplicate parameters to avoid conflicting parser interpretations.
      for (const key of url.searchParams.keys()) {
        if (url.searchParams.getAll(key).length !== 1) return error(res, 400, 'invalid_request');
      }
      const p = Object.fromEntries(url.searchParams);
      const client = clients.get(p.client_id);
      if (!client || !client.redirect_uris.includes(p.redirect_uri)) return error(res, 400, 'invalid_request');
      if (p.response_type !== 'code' || p.code_challenge_method !== 'S256' ||
          !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge || '') || p.resource !== resource ||
          p.scope !== SCOPE || !p.state || p.state.length > 1024) return error(res, 400, 'invalid_request');
      if (pending.size >= MAX_ENTRIES) return error(res, 429, 'temporarily_unavailable');
      const session = random();
      const upstreamState = random();
      const callbackUrl = `${issuer}/link/callback?state=${upstreamState}`;
      pending.set(hash(session), { ...p, upstreamState, callbackUrl, expires: now() + SESSION_MS });
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
      const entry = pending.get(key);
      pending.delete(key); // Consume before any network await to prevent parallel replay.
      res.setHeader('Set-Cookie', '__Secure-carefa_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/link/callback; Max-Age=0');
      if (!entry || url.searchParams.getAll('code').length > 1 ||
          url.searchParams.getAll('state').length !== 1 ||
          !equal(url.searchParams.get('state'), entry.upstreamState)) return error(res, 400, 'invalid_request');
      const destination = new URL(entry.redirect_uri);
      destination.searchParams.set('state', entry.state);
      if (url.searchParams.has('error')) {
        destination.searchParams.set('error', 'access_denied');
        return redirect(res, destination.toString());
      }
      const code = url.searchParams.get('code');
      if (!code || code.length > 512) return error(res, 400, 'invalid_request');
      if (codes.size >= MAX_ENTRIES) return error(res, 429, 'temporarily_unavailable');
      try {
        const linkToken = await exchangeCode(code, entry.callbackUrl);
        if (typeof linkToken !== 'string' || linkToken.length < 32) throw new Error('invalid upstream response');
        const oauthCode = random();
        codes.set(hash(oauthCode), { ...entry, linkToken, expires: now() + CODE_MS });
        destination.searchParams.set('code', oauthCode);
        return redirect(res, destination.toString());
      } catch {
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
        if (tokens.get(key)?.client_id === client.client_id) tokens.delete(key);
        return json(res, 200, {});
      }
      if (p.get('grant_type') !== 'authorization_code') return error(res, 400, 'unsupported_grant_type');
      const key = hash(p.get('code') || '');
      const entry = codes.get(key);
      codes.delete(key); // One attempt per authorization code.
      const verifier = p.get('code_verifier') || '';
      if (!entry || entry.client_id !== client.client_id || entry.redirect_uri !== p.get('redirect_uri') ||
          entry.resource !== p.get('resource') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
          !equal(hash(verifier), entry.code_challenge)) return error(res, 400, 'invalid_grant');
      if (tokens.size >= MAX_ENTRIES) return error(res, 429, 'temporarily_unavailable');
      const token = random();
      tokens.set(hash(token), { linkToken: entry.linkToken, client_id: entry.client_id,
        resource: entry.resource, scope: SCOPE, expires: now() + TOKEN_MS });
      return json(res, 200, { access_token: token, token_type: 'Bearer',
        expires_in: TOKEN_MS / 1000, scope: SCOPE });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }
  return { handle, authenticate, challenge, ready };
}
