import test from "node:test";
import assert from "node:assert/strict";
import { lifecycleFixture } from "./lifecycle.fixtures.mjs";
import { connectionView } from "../companion/connections.mjs";
import { createCompanionInternalApi } from "../companion/internal-api.mjs";
import { createCarefaConsentReader } from "../companion/consent-client.mjs";
import { createCarefaServer } from "../server.mjs";
import { fingerprint } from "./companion.fixtures.mjs";
test("approval is pinned to first-party account; switching cannot approve, deny or disconnect a foreign flow", async () => {
  const f = lifecycleFixture(),
    start = await f.service.begin("a", f.callback);
  for (const action of ["approval", "approve", "deny", "disconnect"])
    await assert.rejects(f.service[action]("b", start.connection_id));
  assert.equal(f.links.get(start.connection_id).status, "pending");
  assert.equal(
    (await f.service.approval("a", start.connection_id)).read_only,
    true,
  );
  const approved = await f.service.approve("a", start.connection_id),
    code = new URL(approved.redirect_url).searchParams.get("code");
  await assert.rejects(
    f.service.exchangeCode(
      code,
      f.callback.replace("s".repeat(43), "x".repeat(43)),
    ),
  );
  const token = await f.service.exchangeCode(code, f.callback);
  assert.equal((await f.service.resolve(token)).user_id, "a");
  await assert.rejects(f.service.exchangeCode(code, f.callback));
});
test("denied, expired, revoked, legacy and withdrawn consent never authorise data", async () => {
  const f = lifecycleFixture(),
    start = await f.service.begin("a", f.callback);
  const denied = await f.service.deny("a", start.connection_id);
  assert.equal(
    new URL(denied.redirect_url).searchParams.get("error"),
    "access_denied",
  );
  await assert.rejects(f.service.approve("a", start.connection_id));
  for (const c of [
    { permission_granted: false },
    { consent_version: "1" },
    { created_by_id: "b" },
  ]) {
    const g = lifecycleFixture();
    Object.assign(g.consents.get("a"), c);
    const p = await g.service.begin("a", g.callback);
    await assert.rejects(g.service.approve("a", p.connection_id));
  }
  const expired = await f.service.begin("b", f.callback);
  f.advance(11 * 60000);
  await assert.rejects(f.service.approve("b", expired.connection_id));
  const a = await f.activate("a"),
    b = await f.activate("b");
  f.consents.get("a").permission_granted = false;
  assert.equal(await f.service.validate(a.token), false);
  assert.equal(await f.service.validate(b.token), true);
  f.consents.get("a").permission_granted = true;
  await f.service.disconnect("a", a.id);
  assert.equal(await f.service.validate(a.token), false);
  f.advance(31 * 86400000);
  assert.equal(await f.service.validate(b.token), false);
});
test("connection is verified only by a successful server read, with immutable collector fingerprint", async () => {
  const f = lifecycleFixture();
  const status = async () =>
    connectionView({ ...(await f.service.status("a")) });
  assert.equal((await status()).status, "awaiting_chatgpt");
  const start = await f.service.begin("a", f.callback);
  assert.equal((await status()).status, "awaiting_authorisation");
  const approved = await f.service.approve("a", start.connection_id);
  assert.equal((await status()).status, "awaiting_verification");
  const token = await f.service.exchangeCode(
    new URL(approved.redirect_url).searchParams.get("code"),
    f.callback,
  );
  assert.equal((await status()).status, "awaiting_verification");
  await assert.rejects(f.service.verifiedRead(token, "invalid"));
  await f.service.verifiedRead(token, fingerprint("a"));
  assert.equal((await status()).status, "connected");
  await assert.rejects(f.service.verifiedRead(token, fingerprint("b")));
  await f.service.disconnect("a", start.connection_id);
  assert.equal((await status()).status, "disconnected");
  await assert.rejects(f.service.verifiedRead(token, fingerprint("a")));
});
test("callback restrictions and private management API reject untrusted input and never expose verification writes", async () => {
  const f = lifecycleFixture(),
    secret = "fictional-internal-".repeat(3),
    api = createCompanionInternalApi({ service: f.service, secret });
  for (const cb of [
    "https://evil.test/link/callback?state=" + "a".repeat(43),
    f.callback + "&state=x",
    f.callback + "&user=b",
    f.callback + "#token",
    f.callback.replace("https:", "http:"),
  ])
    await assert.rejects(f.service.begin("a", cb));
  await assert.rejects(
    api("", { action: "status", owner: "a" }),
    (e) => e.status === 401,
  );
  for (const input of [
    { action: "verifiedRead", owner: "a" },
    { action: "status", owner: "a", user_id: "b" },
    { action: "resolve", owner: "a", token: "x".repeat(43) },
  ])
    await assert.rejects(api(secret, input), (e) => e.status === 400);
  assert.equal(
    (await api(secret, { action: "status", owner: "a" })).read_only,
    true,
  );
  assert.throws(
    () => createCarefaServer({ env: { CAREFA_COMPANION_PHASE2: "enabled" } }),
    /requires/,
  );
});
test("consent transport fails closed on outages, foreign owners and redirects; requests contain no collection", async () => {
  const calls = [];
  const make = (result) =>
    createCarefaConsentReader({
      endpoint: "https://carefa.example.test/functions/consent",
      carefaOrigin: "https://carefa.example.test",
      secret: "fictional-internal-".repeat(3),
      fetchImpl: async (u, o) => {
        calls.push(o);
        return result;
      },
    });
  const f = lifecycleFixture(),
    read = make(Response.json({ consent: f.consents.get("a") }));
  assert.equal((await read("a")).permission_granted, true);
  assert.equal(calls[0].redirect, "error");
  assert.deepEqual(JSON.parse(calls[0].body), { owner: "a" });
  await assert.rejects(
    make(Response.json({ consent: f.consents.get("b") }))("a"),
  );
  await assert.rejects(make(new Response("", { status: 503 }))("a"));
  assert.throws(() =>
    createCarefaConsentReader({
      endpoint: "https://evil.test",
      carefaOrigin: "https://carefa.example.test",
      secret: "x".repeat(32),
    }),
  );
});
test("consent withdrawal at redemption consumes and revokes the flow instead of issuing a reusable link", async () => {
  const f = lifecycleFixture(),
    p = await f.service.begin("a", f.callback),
    a = await f.service.approve("a", p.connection_id),
    code = new URL(a.redirect_url).searchParams.get("code");
  f.consents.get("a").permission_granted = false;
  await assert.rejects(f.service.exchangeCode(code, f.callback));
  assert.equal(f.links.get(p.connection_id).status, "revoked");
  f.consents.get("a").permission_granted = true;
  await assert.rejects(f.service.exchangeCode(code, f.callback));
});

test("consent service outage at redemption records Connection failed and cannot later replay", async () => {
  let outage = false;
  const f = lifecycleFixture({
    getConsent: async (owner) => {
      if (outage) throw Error("outage");
      return {
        created_by_id: owner,
        provider: "ChatGPT",
        permission_granted: true,
        consent_version: "2",
      };
    },
  });
  const p = await f.service.begin("a", f.callback),
    a = await f.service.approve("a", p.connection_id),
    code = new URL(a.redirect_url).searchParams.get("code");
  outage = true;
  await assert.rejects(f.service.exchangeCode(code, f.callback));
  outage = false;
  assert.equal(
    connectionView({ ...(await f.service.status("a")) }).status,
    "connection_failed",
  );
  await assert.rejects(f.service.exchangeCode(code, f.callback));
});

test("observed consent withdrawal permanently invalidates old credentials even after consent is granted again", async () => {
  const f = lifecycleFixture(),
    a = await f.activate("a");
  f.consents.get("a").permission_granted = false;
  assert.equal(await f.service.validate(a.token), false);
  f.consents.get("a").permission_granted = true;
  assert.equal(await f.service.validate(a.token), false);
  const fresh = await f.activate("a");
  assert.equal(await f.service.validate(fresh.token), true);
});
