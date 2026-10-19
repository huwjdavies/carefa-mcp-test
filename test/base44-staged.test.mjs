// Execute staged entrypoints with fictional SDK/transport adapters. NOT live Base44.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, cp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { companionFixture, fingerprint } from "./companion.fixtures.mjs";
const symbol = Symbol.for("carefa-staged-entry-test");
async function entry(t, name, state) {
  const dir = await mkdtemp(join(tmpdir(), "carefa-staged-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(new URL("../integration/base44/", import.meta.url), dir, {
    recursive: true,
  });
  await mkdir(join(dir, "base44/shared/companion"), { recursive: true });
  for (const file of [
    "reader.mjs",
    "base44-repository.mjs",
    "connection-controller.mjs",
    "connections.mjs",
  ])
    await cp(
      new URL("../companion/" + file, import.meta.url),
      join(dir, "base44/shared/companion", file),
    );
  globalThis[symbol] = state;
  const output = await build({
    entryPoints: [join(dir, "base44/functions", name, "entry.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "fictional-base44-boundaries",
        setup(b) {
          b.onResolve(
            { filter: /^(npm:@base44\/sdk|base44:runtime)/ },
            (a) => ({ path: a.path, namespace: "fictional" }),
          );
          b.onResolve(
            { filter: /\/(aiLink|collectorFingerprint)\.ts$/ },
            (a) => ({ path: a.path, namespace: "fictional" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fictional" }, (a) => ({
            contents: a.path.includes("sdk")
              ? 'const state=globalThis[Symbol.for("carefa-staged-entry-test")];export const createClientFromRequest=()=>state.sdk;'
              : a.path === "base44:runtime"
                ? 'const state=globalThis[Symbol.for("carefa-staged-entry-test")];export const secrets={get:name=>state.secrets[name]};'
                : a.path.includes("collectorFingerprint")
                  ? 'export const collectorFingerprint=globalThis[Symbol.for("carefa-staged-entry-test")].fingerprint;'
                  : 'export const hash=globalThis[Symbol.for("carefa-staged-entry-test")].hash;export const constantTimeEqual=(a,b)=>a===b;',
          }));
        },
      },
    ],
  });
  return (
    await import(
      "data:text/javascript;base64," +
        Buffer.from(output.outputFiles[0].text).toString("base64")
    )
  ).default;
}
function fixture(t) {
  const calls = [],
    writes = [],
    f = companionFixture();
  let owner = "a";
  const state = {
    calls,
    writes,
    fingerprint: async (user) => fingerprint(user),
    hash: async (token) => createHash("sha256").update(token).digest("hex"),
    secrets: {
      CAREFA_PUBLIC_ORIGIN: "https://carefa.example.test",
      CAREFA_COMPANION_BRIDGE_ORIGIN: "https://bridge.example.test",
      CAREFA_COMPANION_INTERNAL_SECRET: "fictional-internal-".repeat(3),
      RENDER_BRIDGE_SECRET: "fictional-bridge-".repeat(3),
      CAREFA_COMPANION_LINK_AUTHORITY: "bridge-postgres-v2",
    },
    sdk: {
      auth: {
        me: async () => ({ id: owner, username: "Fictional Collector" }),
      },
      entities: {
        AICompanionConsent: { create: async (value) => writes.push(value) },
      },
      asServiceRole: {
        entities: new Proxy(
          {},
          {
            get: (_, name) => {
              if (name === "AICompanionConsent")
                return {
                  filter: async (query) => {
                    calls.push({ entity: name, query });
                    return [f.consents.get(query.created_by_id)];
                  },
                };
              if (name === "UserCard")
                return {
                  count: async (query) => {
                    calls.push({ entity: name, query });
                    return 9;
                  },
                  filter: async (query, sort, limit, skip) => {
                    calls.push({ entity: name, query });
                    return f.cards[query.created_by_id].slice(
                      skip,
                      skip + limit,
                    );
                  },
                };
              if (name === "CollectionEntry")
                return { count: async () => 0, filter: async () => [] };
              throw Error("Unexpected entity: " + String(name));
            },
          },
        ),
      },
    },
  };
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const input = JSON.parse(options.body);
    if (input.action === "approval" && input.owner !== "a")
      return Response.json({ error: "account_changed" }, { status: 409 });
    if (input.action === "resolve")
      return Response.json({
        ...f.links.get(await state.hash(f.tokens.a)),
        token_hash: await state.hash(input.token),
      });
    if (input.action === "status")
      return Response.json({
        provider: "ChatGPT",
        status: "awaiting_verification",
        read_only: true,
      });
    return Response.json({
      connection_id: "x".repeat(43),
      scope: "collection:read",
      provider: "ChatGPT",
      read_only: true,
    });
  };
  t.after(() => {
    globalThis.fetch = previous;
    delete globalThis[symbol];
  });
  const request = (
    input,
    headers = {},
    origin = "https://carefa.example.test",
  ) =>
    new Request("https://carefa.example.test/functions/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...headers,
      },
      body: JSON.stringify(input),
    });
  return { ...state, request, setOwner: (value) => (owner = value), f };
}
test("staged first-party approval rejects spoofed owners, foreign origins, bridge sessions and switched accounts before consent writes", async (t) => {
  const f = fixture(t),
    handler = await entry(t, "carefaAiCompanionApproval", f);
  assert.equal(
    (
      await handler(
        f.request({ action: "approve", connection_id: "x", owner: "b" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        f.request(
          { action: "approve", connection_id: "x" },
          {},
          "https://evil.example.test",
        ),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        f.request(
          { action: "approve", connection_id: "x" },
          { "x-carefa-link-token": "x" },
        ),
      )
    ).status,
    403,
  );
  f.setOwner("b");
  assert.equal(
    (await handler(f.request({ action: "approve", connection_id: "x" })))
      .status,
    409,
  );
  assert.equal(f.writes.length, 0);
  f.setOwner("a");
  assert.equal(
    (await handler(f.request({ action: "approve", connection_id: "x" })))
      .status,
    200,
  );
  assert.deepEqual(f.writes, [
    {
      provider: "ChatGPT",
      permission_granted: true,
      consent_version: "2",
      connection_status: "pending_provider",
    },
  ]);
  assert.ok(
    f.calls
      .filter((c) => c.options)
      .every(
        (c) =>
          JSON.parse(c.options.body).owner === "a" ||
          JSON.parse(c.options.body).owner === "b",
      ),
  );
});
test("staged settings derive account from auth.me, close inputs and route owner-bound disconnect to bridge", async (t) => {
  const f = fixture(t),
    handler = await entry(t, "carefaAiCompanionConnections", f);
  assert.equal(
    (
      await handler(
        f.request({ action: "disconnect", connection_id: "x", owner: "b" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        f.request({ action: "status" }, { "x-carefa-bridge-secret": "x" }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler(
        f.request({ action: "disconnect", connection_id: "x".repeat(43) }),
      )
    ).status,
    200,
  );
  const call = f.calls.find((c) => c.options);
  assert.equal(JSON.parse(call.options.body).owner, "a");
  assert.equal(call.options.redirect, "error");
  assert.equal(f.writes.length, 0);
});
test("staged private consent lookup requires dedicated server credential and owner-filters every consent read", async (t) => {
  const f = fixture(t),
    handler = await entry(t, "carefaAiCompanionConsent", f);
  assert.equal((await handler(f.request({ owner: "a" }))).status, 401);
  assert.equal(f.calls.length, 0);
  const response = await handler(
    f.request(
      { owner: "a" },
      {
        "x-carefa-companion-internal":
          f.secrets.CAREFA_COMPANION_INTERNAL_SECRET,
      },
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).consent.created_by_id, "a");
  assert.deepEqual(f.calls[0].query, {
    created_by_id: "a",
    provider: "ChatGPT",
  });
  assert.equal(f.writes.length, 0);
});
test("staged read validates bridge and per-user links, rejects owner override and exposes no write calls", async (t) => {
  const f = fixture(t),
    handler = await entry(t, "carefaAiCompanion", f);
  assert.equal((await handler(f.request({ section: "cards" }))).status, 401);
  assert.equal(f.calls.length, 0);
  const headers = {
    "x-carefa-bridge-secret": f.secrets.RENDER_BRIDGE_SECRET,
    "x-carefa-link-token": f.f.tokens.a,
  };
  assert.equal(
    (await handler(f.request({ section: "cards", owner: "b" }, headers)))
      .status,
    400,
  );
  assert.equal(f.calls.length, 0);
  const response = await handler(f.request({ section: "cards" }, headers));
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.data.items.length, 9);
  assert.ok(!JSON.stringify(value).includes("PRIVATE"));
  assert.equal(f.writes.length, 0);
  for (const c of f.calls.filter((c) => c.entity === "UserCard"))
    assert.equal(c.query.created_by_id, "a");
});
