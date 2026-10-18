import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createOAuthBridge } from "../oauth.mjs";

const issuer = "https://bridge.example";
const callback = "https://client.example/callback";
const verifier = "a".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const upstreamTokens = {
  alice: "alice-private-link-token-".repeat(3),
  bob: "bob-private-link-token-".repeat(3),
};

async function fixture(t, options = {}) {
  let clock = Date.now();
  const oauth = createOAuthBridge({
    publicUrl: issuer,
    appUrl: "https://carefa.example",
    redirectUris: [callback],
    configured: () => true,
    now: () => clock,
    exchangeCode: async (code) => {
      if (!upstreamTokens[code]) throw new Error("denied");
      return upstreamTokens[code];
    },
    ...options,
  });
  const server = http.createServer(async (req, res) => {
    try {
      if (await oauth.handle(req, res, new URL(req.url, issuer))) return;
      const session = await oauth.authenticate(req);
      if (!session) return oauth.challenge(res);
      res.end(
        JSON.stringify({
          account: session.linkToken === upstreamTokens.alice ? "alice" : "bob",
        }),
      );
    } catch (error) {
      res.writeHead(500);
      res.end(error.message);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) =>
    fetch(`${base}${path}`, { redirect: "manual", ...options });
  const form = (path, data) =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data),
    });
  const register = async () => {
    const r = await request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uris: [callback],
        token_endpoint_auth_method: "none",
      }),
    });
    assert.equal(r.status, 201);
    return (await r.json()).client_id;
  };
  const authorize = async (client, overrides = {}) =>
    request(
      "/oauth/authorize?" +
        new URLSearchParams({
          client_id: client,
          redirect_uri: callback,
          response_type: "code",
          scope: "collection:read",
          resource: `${issuer}/mcp`,
          state: "client-state-123",
          code_challenge: challenge,
          code_challenge_method: "S256",
          ...overrides,
        }),
    );
  const approval = async (client, account = "alice") => {
    const start = await authorize(client);
    assert.equal(start.status, 302);
    const location = new URL(start.headers.get("location"));
    assert.equal(location.origin, "https://carefa.example");
    const upstreamCallback = new URL(location.searchParams.get("cb"));
    assert.equal(
      upstreamCallback.origin + upstreamCallback.pathname,
      `${issuer}/link/callback`,
    );
    assert.ok(upstreamCallback.searchParams.get("state"));
    const cookie = start.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
    const r = await request(
      `/link/callback?code=${account}&state=${upstreamCallback.searchParams.get("state")}`,
      { headers: { Cookie: cookie.split(";")[0] } },
    );
    assert.equal(r.status, 302);
    assert.ok(!(await r.text()).includes(upstreamTokens[account]));
    const result = new URL(r.headers.get("location"));
    assert.equal(result.origin + result.pathname, callback);
    assert.equal(result.searchParams.get("state"), "client-state-123");
    return {
      code: result.searchParams.get("code"),
      cookie: cookie.split(";")[0],
      result,
      upstreamCallback,
    };
  };
  const redeem = (client, code, overrides = {}) =>
    form("/oauth/token", {
      client_id: client,
      grant_type: "authorization_code",
      code,
      redirect_uri: callback,
      resource: `${issuer}/mcp`,
      code_verifier: verifier,
      ...overrides,
    });
  return {
    request,
    form,
    register,
    authorize,
    approval,
    redeem,
    advance: (ms) => {
      clock += ms;
    },
  };
}

test("discovery and unauthenticated MCP challenge identify the exact resource", async (t) => {
  const f = await fixture(t);
  const denied = await f.request("/mcp");
  assert.equal(denied.status, 401);
  assert.match(
    denied.headers.get("www-authenticate"),
    /oauth-protected-resource\/mcp/,
  );
  const metadata = await (
    await f.request("/.well-known/oauth-protected-resource/mcp")
  ).json();
  assert.equal(metadata.resource, `${issuer}/mcp`);
  const auth = await (
    await f.request("/.well-known/oauth-authorization-server")
  ).json();
  assert.deepEqual(auth.code_challenge_methods_supported, ["S256"]);
});

test("complete sign-in keeps Alice and Bob isolated and never exposes upstream tokens", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  const access = [];
  for (const account of ["alice", "bob"]) {
    const { code } = await f.approval(client, account);
    const r = await f.redeem(client, code);
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.expires_in, 900);
    assert.ok(!JSON.stringify(data).includes(upstreamTokens[account]));
    access.push(data.access_token);
    const summary = await f.request("/mcp", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    assert.deepEqual(await summary.json(), { account });
    assert.equal((await f.redeem(client, code)).status, 400);
  }
  assert.notEqual(...access);
  assert.deepEqual(
    await (
      await f.request("/mcp", {
        headers: { Authorization: `Bearer ${access[0]}` },
      })
    ).json(),
    { account: "alice" },
  );
});

test("rejects unregistered redirects, plain PKCE, wrong scope/resource and duplicate parameters", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  for (const overrides of [
    { redirect_uri: "https://evil.example/callback" },
    { code_challenge_method: "plain" },
    { resource: "https://evil.example/mcp" },
    { scope: "collection:write" },
    { state: "" },
  ]) {
    const r = await f.authorize(client, overrides);
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("location"), null);
  }
  const bad = await f.request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["https://evil.example/callback"] }),
  });
  assert.equal(bad.status, 400);
  const duplicate = await f.request("/oauth/authorize?client_id=a&client_id=b");
  assert.equal(duplicate.status, 400);
});

test("wrong verifier, client, redirect or audience cannot redeem a code", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  const other = "unregistered-client";
  for (const overrides of [
    { code_verifier: "b".repeat(43) },
    { client_id: other },
    { redirect_uri: "https://evil.example/callback" },
    { resource: "https://evil.example/mcp" },
  ]) {
    const { code } = await f.approval(client);
    assert.equal((await f.redeem(client, code, overrides)).status, 400);
    assert.equal(
      (await f.redeem(client, code)).status,
      overrides.client_id ? 200 : 400,
    );
  }
});

test("callback requires browser state, is single use and propagates denial without tokens", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  assert.equal((await f.request("/link/callback?code=alice")).status, 400);
  const { cookie } = await f.approval(client);
  assert.equal(
    (
      await f.request("/link/callback?code=alice", {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
  const start = await f.authorize(client);
  const deniedState = new URL(
    new URL(start.headers.get("location")).searchParams.get("cb"),
  ).searchParams.get("state");
  const denied = await f.request(
    `/link/callback?error=access_denied&state=${deniedState}`,
    { headers: { Cookie: start.headers.get("set-cookie").split(";")[0] } },
  );
  const target = new URL(denied.headers.get("location"));
  assert.equal(target.searchParams.get("error"), "access_denied");
  assert.equal(target.searchParams.has("code"), false);
  const failure = await f.approval(client, "unavailable");
  assert.equal(failure.result.searchParams.get("error"), "server_error");
});

test("pending sessions, authorization codes and access tokens expire", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  const start = await f.authorize(client);
  f.advance(600_001);
  assert.equal(
    (
      await f.request("/link/callback?code=alice", {
        headers: { Cookie: start.headers.get("set-cookie").split(";")[0] },
      })
    ).status,
    400,
  );
  const old = await f.approval(client);
  f.advance(60_001);
  assert.equal((await f.redeem(client, old.code)).status, 400);
  const fresh = await f.approval(client);
  const data = await (await f.redeem(client, fresh.code)).json();
  f.advance(900_001);
  assert.equal(
    (
      await f.request("/mcp", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
    ).status,
    401,
  );
});

test("revocation invalidates access; forged and upstream tokens are rejected", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  const { code } = await f.approval(client);
  const data = await (await f.redeem(client, code)).json();
  assert.equal(
    (
      await f.form("/oauth/revoke", {
        client_id: client,
        token: data.access_token,
      })
    ).status,
    200,
  );
  for (const token of [
    data.access_token,
    "x".repeat(43),
    upstreamTokens.alice,
  ]) {
    assert.equal(
      (
        await f.request("/mcp", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
      401,
    );
  }
});

test("fails closed without explicit redirect configuration", async (t) => {
  const f = await fixture(t, { redirectUris: [] });
  assert.equal((await f.request("/oauth/authorize")).status, 503);
});

test("actual server uses the OAuth account token for summary and rejects backend revocation", async (t) => {
  // No requests to CAREFA/Render: replace the child process upstream transport.
  const launcher = `
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (String(url).endsWith('carefaAiLink')) {
        return Response.json({ token: body.code === 'alice' ? ${JSON.stringify(upstreamTokens.alice)} : ${JSON.stringify(upstreamTokens.bob)} });
      }
      const token = options.headers['x-carefa-link-token'];
      if (token === ${JSON.stringify(upstreamTokens.bob)}) return Response.json({ error: 'Link revoked' }, { status: 401 });
      return Response.json({ summary: { total_user_cards: 7, total_collection_entries: 3 } });
    };
    const {startCarefaServer}=await import('./server.mjs');await startCarefaServer();`;
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", launcher],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        RENDER_PUBLIC_URL: issuer,
        CAREFA_APP_URL: "https://carefa.example",
        CAREFA_LINK_FUNCTION_URL: "https://upstream.invalid/carefaAiLink",
        RENDER_BRIDGE_SECRET: "test-secret-".repeat(4),
        OAUTH_REDIRECT_URIS: JSON.stringify([callback]),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  // The server prints the actual ephemeral port for test harnesses.
  t.after(() => {
    child.kill();
  });
  let output = "";
  const port = await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const m = /listening on port (\d+)/.exec(output);
      if (m) resolve(Number(m[1]));
    });
    child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
    const timer = setTimeout(
      () => reject(new Error("server startup timed out")),
      5000,
    );
    timer.unref();
  });
  const request = (path, options = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      redirect: "manual",
      ...options,
    });
  assert.equal(
    (await request("/mcp", { method: "POST", body: "{}" })).status,
    401,
  );
  const registration = await request("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [callback] }),
  });
  const client = (await registration.json()).client_id;
  for (const account of ["alice", "bob"]) {
    const start = await request(
      "/oauth/authorize?" +
        new URLSearchParams({
          client_id: client,
          redirect_uri: callback,
          response_type: "code",
          scope: "collection:read",
          resource: `${issuer}/mcp`,
          state: "state",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
    );
    const upstreamCallback = new URL(
      new URL(start.headers.get("location")).searchParams.get("cb"),
    );
    const approved = await request(
      `/link/callback?code=${account}&state=${upstreamCallback.searchParams.get("state")}`,
      { headers: { Cookie: start.headers.get("set-cookie").split(";")[0] } },
    );
    const code = new URL(approved.headers.get("location")).searchParams.get(
      "code",
    );
    const token = await (
      await request("/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client,
          code,
          code_verifier: verifier,
          grant_type: "authorization_code",
          redirect_uri: callback,
          resource: `${issuer}/mcp`,
        }),
      })
    ).json();
    const rpc = await (
      await request("/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "carefa_collection_summary" },
        }),
      })
    ).json();
    assert.equal(rpc.result.isError, account === "bob");
    if (account === "alice")
      assert.match(rpc.result.content[0].text, /Total user cards: 7/);
    else
      assert.ok(
        rpc.result._meta["mcp/www_authenticate"][0].includes("invalid_token"),
      );
    assert.ok(!JSON.stringify(rpc).includes(upstreamTokens[account]));
  }
});

test("upstream callback is bound to its browser transaction and exact exchange URL", async (t) => {
  let exchangedUrl;
  const f = await fixture(t, {
    exchangeCode: async (code, url) => {
      exchangedUrl = url;
      return upstreamTokens.alice;
    },
  });
  const client = await f.register();
  const start = await f.authorize(client);
  const upstreamCallback = new URL(
    new URL(start.headers.get("location")).searchParams.get("cb"),
  );
  const cookie = start.headers.get("set-cookie").split(";")[0];
  // An attacker can know their own callback state, but cannot transplant it into another browser session.
  assert.equal(
    (
      await f.request("/link/callback?code=alice&state=attacker-state", {
        headers: { Cookie: cookie },
      })
    ).status,
    400,
  );
  assert.equal(exchangedUrl, undefined);
  const approved = await f.approval(client);
  assert.equal(exchangedUrl, approved.upstreamCallback.toString());
  assert.notEqual(
    upstreamCallback.searchParams.get("state"),
    approved.upstreamCallback.searchParams.get("state"),
  );
});

test("concurrent callback and code replay permit exactly one successful redemption", async (t) => {
  const f = await fixture(t);
  const client = await f.register();
  const start = await f.authorize(client);
  const cb = new URL(
    new URL(start.headers.get("location")).searchParams.get("cb"),
  );
  const options = {
    headers: { Cookie: start.headers.get("set-cookie").split(";")[0] },
  };
  const callbacks = await Promise.all(
    [1, 2].map(() =>
      f.request(
        `/link/callback?code=alice&state=${cb.searchParams.get("state")}`,
        options,
      ),
    ),
  );
  assert.deepEqual(callbacks.map((r) => r.status).sort(), [302, 400]);
  const code = new URL(
    callbacks.find((r) => r.status === 302).headers.get("location"),
  ).searchParams.get("code");
  const tokens = await Promise.all([1, 2].map(() => f.redeem(client, code)));
  assert.deepEqual(tokens.map((r) => r.status).sort(), [200, 400]);
});

test("a new server instance cannot use a previous instance access token", async (t) => {
  const first = await fixture(t);
  const client = await first.register();
  const { code } = await first.approval(client);
  const data = await (await first.redeem(client, code)).json();
  const second = await fixture(t);
  assert.equal(
    (
      await second.request("/mcp", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
    ).status,
    401,
  );
});
