import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createCarefaServer } from "../server.mjs";
import { companionFixture } from "./companion.fixtures.mjs";
const issuer = "https://bridge.example.test",
  callback = "https://chatgpt.example.test/callback",
  resource = issuer + "/mcp";
const verifier = "v".repeat(43),
  challenge = createHash("sha256").update(verifier).digest("base64url");
async function setup(t, { enabled = true, storage } = {}) {
  const fixture = companionFixture(),
    logs = [];
  const env = {
    RENDER_PUBLIC_URL: issuer,
    CAREFA_APP_URL: "https://carefa.example.test",
    CAREFA_LINK_FUNCTION_URL:
      "https://carefa.example.test/functions/carefaAiLink",
    RENDER_BRIDGE_SECRET: "fictional-secret-".repeat(3),
    OAUTH_REDIRECT_URIS: JSON.stringify([callback]),
    ...(enabled
      ? {
          CAREFA_COMPANION_V1: "enabled",
          CAREFA_COMPANION_FUNCTION_URL:
            "https://carefa.example.test/functions/carefaAiCompanion",
        }
      : {}),
  };
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith("carefaAiLink"))
      return Response.json({ token: fixture.tokens[body.code] });
    if (url.endsWith("carefaAiCompanion")) {
      try {
        return Response.json(
          await fixture.reader.read(
            options.headers["x-carefa-link-token"],
            body,
          ),
        );
      } catch (error) {
        return Response.json(
          { error: "PRIVATE-ERROR" },
          { status: error.status || 500 },
        );
      }
    }
    return Response.json({ error: "not supported" }, { status: 400 });
  };
  const { server } = createCarefaServer({
    env,
    fetchImpl,
    durableStorage: storage,
    logger: {
      log: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (path, options = {}) =>
    fetch(base + path, { redirect: "manual", ...options });
  const form = (path, data) =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data),
    });
  const rpc = async (token, method, params) => {
    const r = await request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return { status: r.status, data: await r.json() };
  };
  async function grant(owner) {
    const registration = await request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [callback] }),
    });
    const client = (await registration.json()).client_id;
    const begin = await request(
      "/oauth/authorize?" +
        new URLSearchParams({
          client_id: client,
          redirect_uri: callback,
          response_type: "code",
          scope: "collection:read",
          resource,
          state: "fictional-state",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }),
    );
    assert.equal(begin.status, 302);
    const target = new URL(
      new URL(begin.headers.get("location")).searchParams.get("cb"),
    );
    target.searchParams.set("code", owner);
    const approved = await request(target.pathname + target.search, {
      headers: { Cookie: begin.headers.get("set-cookie").split(";")[0] },
    });
    const code = new URL(approved.headers.get("location")).searchParams.get(
      "code",
    );
    const issued = await form("/oauth/token", {
      client_id: client,
      redirect_uri: callback,
      resource,
      code,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    assert.equal(issued.status, 200);
    return { client, ...(await issued.json()) };
  }
  return { ...fixture, logs, request, form, rpc, grant };
}

test("real local HTTP OAuth-to-MCP flow keeps fictional nine-card and large accounts isolated through refresh/reconnect", async (t) => {
  const f = await setup(t),
    a = await f.grant("a"),
    b = await f.grant("b");
  for (const [grant, n] of [
    [a, 9],
    [b, 1200],
  ]) {
    const r = await f.rpc(grant.access_token, "tools/call", {
      name: "carefa_companion_read",
      arguments: { section: "overview" },
    });
    assert.equal(r.status, 200);
    const data = JSON.parse(r.data.result.content[0].text);
    assert.equal(data.data.owned_user_card_records, n);
    assert.ok(!JSON.stringify(r).includes(f.tokens.a));
    assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  }
  const refreshed = await f.form("/oauth/token", {
    grant_type: "refresh_token",
    client_id: a.client,
    refresh_token: a.refresh_token,
    resource,
  });
  assert.equal(refreshed.status, 200);
  const next = await refreshed.json();
  assert.equal(
    JSON.parse(
      (
        await f.rpc(next.access_token, "tools/call", {
          name: "carefa_companion_read",
        })
      ).data.result.content[0].text,
    ).data.owned_user_card_records,
    9,
  );
  await f.form("/oauth/revoke", { client_id: a.client, token: a.access_token });
  assert.equal((await f.rpc(next.access_token, "tools/list")).status, 401);
  assert.equal(
    (
      await f.form("/oauth/token", {
        grant_type: "refresh_token",
        client_id: a.client,
        refresh_token: next.refresh_token,
        resource,
      })
    ).status,
    400,
  );
  assert.equal((await f.rpc(b.access_token, "tools/list")).status, 200);
  const reconnected = await f.grant("a");
  assert.equal(
    (await f.rpc(reconnected.access_token, "tools/list")).status,
    200,
  );
});
test("read-only tool metadata is honest; owner overrides and write calls cannot reach data", async (t) => {
  const f = await setup(t),
    a = await f.grant("a");
  const list = (await f.rpc(a.access_token, "tools/list")).data.result.tools;
  assert.ok(list.some((tool) => tool.name === "carefa_companion_read"));
  assert.ok(
    list.every(
      (tool) =>
        tool.annotations.readOnlyHint === true &&
        tool.annotations.destructiveHint === false &&
        tool.securitySchemes[0].scopes[0] === "collection:read",
    ),
  );
  for (const [name, args] of [
    ["carefa_companion_read", { user_id: "b" }],
    ["carefa_collection_summary", { user_id: "b" }],
    ["carefa_remove_card", {}],
    ["carefa_update_profile", {}],
  ]) {
    const r = await f.rpc(a.access_token, "tools/call", {
      name,
      arguments: args,
    });
    assert.ok(r.data.error || r.data.result?.isError);
  }
  assert.equal(f.calls.length, 0);
  for (const method of ["PATCH", "PUT", "DELETE"])
    assert.equal(
      (
        await f.request("/mcp", {
          method,
          headers: { Authorization: "Bearer " + a.access_token },
        })
      ).status,
      405,
    );
});
test("upstream consent withdrawal triggers host reconnection metadata and no data", async (t) => {
  const f = await setup(t),
    a = await f.grant("a");
  f.consents.get("a").permission_granted = false;
  const r = await f.rpc(a.access_token, "tools/call", {
    name: "carefa_companion_read",
  });
  assert.equal(r.data.result.isError, true);
  assert.match(r.data.result._meta["mcp/www_authenticate"][0], /invalid_token/);
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  assert.equal(f.calls.length, 0);
});
test("new companion feature stays absent by default and wrong scopes cannot enter MCP", async (t) => {
  const f = await setup(t, { enabled: false }),
    a = await f.grant("a");
  assert.ok(
    !(await f.rpc(a.access_token, "tools/list")).data.result.tools.some(
      (tool) => tool.name === "carefa_companion_read",
    ),
  );
  const wrong = await setup(t, {
    storage: {
      grants: {
        authenticate: async () => ({
          scope: "collection:write",
          resource,
          linkToken: "A".repeat(43),
        }),
      },
    },
  });
  assert.equal((await wrong.rpc("x".repeat(43), "tools/list")).status, 401);
});
