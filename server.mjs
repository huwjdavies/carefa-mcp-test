
import http from 'node:http';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';

// CAREFA Render MCP bridge — development version.
// Keep Render's existing live service on GitHub main until verified.
const PORT = Number(process.env.PORT || 10000);
const SERVER_NAME = 'carefa-mcp-diagnostic';
const PROTOCOL_VERSION = '2025-03-26';
const VERSION = '1.3.0-dev';
const CAREFA_APP_URL = (process.env.CAREFA_APP_URL || 'https://carefacollector.base44.app').replace(/\/$/, '');
const CAREFA_LINK_FUNCTION_URL = process.env.CAREFA_LINK_FUNCTION_URL || '';
const BRIDGE_SECRET = process.env.RENDER_BRIDGE_SECRET || '';
const PUBLIC_URL = (process.env.RENDER_PUBLIC_URL || '').replace(/\/$/, '');
const CALLBACK_URL = PUBLIC_URL ? `${PUBLIC_URL}/link/callback` : '';

// These sessions are temporary and deliberately do not survive restarts.
// This is NOT production-ready durable token storage.
const pending = new Map();
const linked = new Map();
const STATE_TTL = 10 * 60 * 1000;

const TOOLS = [
  {
    name: 'carefa_connection_test',
    description: 'Check ChatGPT-to-Render connectivity. No private data is accessed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'carefa_collection_summary',
    description: 'Private collection summary. Locked until secure MCP caller identity and account isolation are verified.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

function sendJson(res, status, data, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Authorization',
    'Access-Control-Expose-Headers': 'MCP-Protocol-Version, MCP-Session-Id',
    ...extra
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, title, description) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer'
  });
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font:16px system-ui;max-width:34rem;margin:4rem auto;padding:1rem"><h1>${esc(title)}</h1><p>${esc(description)}</p></body></html>`);
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function toolText(message, isError = false) {
  return { content: [{ type: 'text', text: message }], isError };
}
function configured() {
  return !!(CAREFA_LINK_FUNCTION_URL.startsWith('https://') &&
    PUBLIC_URL.startsWith('https://') && BRIDGE_SECRET.length >= 32);
}
function safeEquals(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function prunePending() {
  const now = Date.now();
  for (const [state, value] of pending) if (value.expires <= now) pending.delete(state);
}

async function exchangeCode(code) {
  // Backend-to-backend exchange; never send the bridge secret to the browser.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(CAREFA_LINK_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-carefa-bridge-secret': BRIDGE_SECRET
      },
      body: JSON.stringify({ action: 'exchangeCode', code, callback_url: CALLBACK_URL }),
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`CAREFA exchange rejected (${response.status})`);
    const data = await response.json();
    if (typeof data?.token !== 'string' || data.token.length < 32) {
      throw new Error('CAREFA exchange returned no valid link token');
    }
    return data.token;
  } finally {
    clearTimeout(timer);
  }
}

function handleRpc(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
    return rpcError(null, -32600, 'Invalid JSON-RPC request');
  }
  const { id, method, params } = message;
  if (typeof method === 'string' && id === undefined) return null;
  if (id === undefined || typeof method !== 'string') return rpcError(id ?? null, -32600, 'Invalid JSON-RPC request');
  if (method === 'initialize') {
    const supported = ['2025-03-26', '2025-06-18', '2025-11-25'];
    return rpcResult(id, {
      protocolVersion: supported.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: SERVER_NAME, version: VERSION }
    });
  }
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') return rpcResult(id, { tools: TOOLS });
  if (method === 'tools/call') {
    if (params?.name === 'carefa_connection_test') {
      return rpcResult(id, toolText('CAREFA MCP CONNECTION SUCCESSFUL. ChatGPT reached the Render server and called its diagnostic tool. No private collection data was accessed.'));
    }
    if (params?.name === 'carefa_collection_summary') {
      // IMPORTANT: /mcp is a public No Auth endpoint. Even if a collector
      // links through /link/start, a random MCP caller cannot be safely
      // associated with that collector. Never return linked data here.
      return rpcResult(id, toolText('CAREFA COLLECTION ACCESS LOCKED. Account linking alone does not authenticate the public MCP caller. No private collection data was accessed.', true));
    }
    return rpcError(id, -32602, 'Unknown tool');
  }
  return rpcError(id, -32601, 'Method not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const path = url.pathname;
  res.on('finish', () => console.log('[CAREFA MCP]', req.method, path, res.statusCode));

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Authorization'
    });
    return res.end();
  }

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      status: 'ok', service: 'CAREFA MCP diagnostic', version: VERSION,
      collectionAccess: false, authentication: 'none - diagnostic only',
      linkBridgeConfigured: configured(), requestId: randomUUID()
    });
  }

  if (req.method === 'GET' && path === '/link/start') {
    if (!configured()) return sendHtml(res, 503, 'Connection not configured', 'The CAREFA secure bridge is not configured yet. No account data was accessed.');
    prunePending();
    const state = randomBytes(32).toString('base64url');
    pending.set(state, { expires: Date.now() + STATE_TTL });
    const approval = new URL('/AiLink', CAREFA_APP_URL);
    approval.searchParams.set('cb', CALLBACK_URL);
    approval.searchParams.set('svc', 'Render MCP');
    // State is set as a host-only, HttpOnly browser cookie, not as a collector ID.
    res.writeHead(302, {
      Location: approval.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `carefa_link_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/link; Max-Age=600`
    });
    return res.end();
  }

  if (req.method === 'GET' && path === '/link/callback') {
    const code = url.searchParams.get('code') || '';
    const cookies = req.headers.cookie || '';
    const state = cookies.split(';').map(x => x.trim()).find(x => x.startsWith('carefa_link_state='))?.slice('carefa_link_state='.length) || '';
    const entry = pending.get(state);
    if (state) pending.delete(state);
    res.setHeader('Set-Cookie', 'carefa_link_state=; HttpOnly; Secure; SameSite=Lax; Path=/link; Max-Age=0');
    if (!configured() || !code || code.length > 512 || !state || !entry || entry.expires <= Date.now()) {
      return sendHtml(res, 400, 'Link not completed', 'The link request is missing, expired or invalid. Please start again.');
    }
    try {
      const token = await exchangeCode(code);
      // Token is intentionally held only in server memory for isolated
      // testing. Never expose it via a public endpoint or MCP tool.
      const linkId = randomUUID();
      linked.set(linkId, { token, linkedAt: Date.now() });
      return sendHtml(res, 200, 'CAREFA approval received', 'The account-link exchange succeeded in this development server. Private MCP collection access remains disabled until identity isolation and revocation tests pass.');
    } catch (error) {
      console.error('[CAREFA MCP] Link exchange failed:', error.message);
      return sendHtml(res, 502, 'Connection could not be completed', 'CAREFA rejected the exchange or the backend was unavailable. No collection data was returned.');
    }
  }

  if (path !== '/mcp') return sendJson(res, 404, { error: 'Not found' });
  if (req.method === 'GET') return sendJson(res, 405, { error: 'SSE stream not supported. Use POST.' }, { Allow: 'POST, OPTIONS' });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) return sendJson(res, 413, { error: 'Request too large' });
      chunks.push(chunk);
    }
  } catch {
    return sendJson(res, 400, { error: 'Could not read request' });
  }
  let message;
  try { message = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return sendJson(res, 400, rpcError(null, -32700, 'Parse error')); }
  if (Array.isArray(message)) return sendJson(res, 400, rpcError(null, -32600, 'Batch requests not supported'));
  const response = handleRpc(message);
  if (response === null) {
    res.writeHead(202, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  return sendJson(res, 200, response, { 'MCP-Protocol-Version': PROTOCOL_VERSION });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CAREFA MCP diagnostic server ${VERSION} listening on port ${PORT}`);
});
