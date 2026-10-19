import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { once } from "node:events";
import { createConsentGenerationStore } from "./consent-generation-store.mjs";
import { createCompanionLinkStore } from "./companion-link-store.mjs";
import { createCompanionLinkService } from "../companion/link-service.mjs";
import { createDurableGrants } from "./durable-grants.mjs";
import { createHandshakeStore } from "./handshake-store.mjs";
import { createCarefaServer } from "../server.mjs";
import { createCompanionReader } from "../companion/reader.mjs";
import {
  companionFixture,
  fingerprint,
  digest,
} from "../test/companion.fixtures.mjs";
const url = process.env.CAREFA_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    process.env.CAREFA_TEST_DISPOSABLE !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.pathname !== "/carefa_companion_test"
  )
    throw Error("Disposable loopback fixture only");
}
const integration = url ? test : test.skip;
const opaque = () => randomBytes(32).toString("base64url");
const issuer = "https://bridge.example.test",
  callback = () => issuer + "/link/callback?state=" + opaque();
async function database(t) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 12 });
  return pool;
}
integration(
  "PostgreSQL: 12 competing approvals and redemptions have exactly one winner across adapters",
  async (t) => {
    const pool = await database(t),
      store = createCompanionLinkStore(pool),
      other = createCompanionLinkStore(pool),
      owner = "atomic-" + opaque(),
      ids = [];
    t.after(async () => {
      try {
        await pool.query("DELETE FROM companion_links WHERE owner_id=$1", [
          owner,
        ]);
      } finally {
        await pool.end();
      }
    });
    const service = createCompanionLinkService({
      store,
      getConsent: async (user) => ({
        created_by_id: user,
        provider: "ChatGPT",
        permission_granted: true,
        consent_version: "2",
      }),
      issuer,
    });
    const second = createCompanionLinkService({
      store: other,
      getConsent: async (user) => ({
        created_by_id: user,
        provider: "ChatGPT",
        permission_granted: true,
        consent_version: "2",
      }),
      issuer,
    });
    for (let run = 0; run < 4; run++) {
      const cb = callback(),
        start = await service.begin(owner, cb);
      ids.push(start.connection_id);
      await assert.rejects(second.approve("foreign", start.connection_id));
      const approvals = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          (i % 2 ? service : second).approve(owner, start.connection_id),
        ),
      );
      assert.equal(approvals.filter((r) => r.status === "fulfilled").length, 1);
      const code = new URL(
        approvals.find((r) => r.status === "fulfilled").value.redirect_url,
      ).searchParams.get("code");
      await assert.rejects(service.exchangeCode(code, callback())); // mismatch cannot consume legitimate code
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          (i % 2 ? service : second).exchangeCode(code, cb),
        ),
      );
      const winners = results.filter((r) => r.status === "fulfilled");
      assert.equal(winners.length, 1);
      assert.equal((await second.resolve(winners[0].value)).user_id, owner);
      await assert.rejects(second.exchangeCode(code, cb));
      const raw = (
        await pool.query("SELECT * FROM companion_links WHERE id=$1", [
          start.connection_id,
        ])
      ).rows[0];
      assert.equal(raw.state, "active");
      assert.ok(!JSON.stringify(raw).includes(winners[0].value));
      assert.ok(!JSON.stringify(raw).includes(code));
    }
  },
);
integration(
  "PostgreSQL: deny/approve and disconnect/redeem races fail closed, expired pending cannot activate",
  async (t) => {
    const pool = await database(t),
      store = createCompanionLinkStore(pool),
      owner = "race-" + opaque();
    t.after(async () => {
      try {
        await pool.query("DELETE FROM companion_links WHERE owner_id=$1", [
          owner,
        ]);
      } finally {
        await pool.end();
      }
    });
    const service = createCompanionLinkService({
      store,
      getConsent: async (user) => ({
        created_by_id: user,
        provider: "ChatGPT",
        permission_granted: true,
        consent_version: "2",
      }),
      issuer,
    });
    for (let run = 0; run < 8; run++) {
      const cb = callback(),
        p = await service.begin(owner, cb);
      const results = await Promise.allSettled([
        service.approve(owner, p.connection_id),
        service.deny(owner, p.connection_id),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const approved =
        results[0].status === "fulfilled" ? results[0].value : null;
      if (approved) {
        const code = new URL(approved.redirect_url).searchParams.get("code");
        const [redemption] = await Promise.allSettled([
          service.exchangeCode(code, cb),
          service.disconnect(owner, p.connection_id),
        ]);
        if (redemption.status === "fulfilled")
          await assert.rejects(service.resolve(redemption.value));
        await assert.rejects(service.exchangeCode(code, cb));
      }
    }
    const cb = callback(),
      p = await service.begin(owner, cb);
    await pool.query(
      "UPDATE companion_links SET expires_at=now()-interval '1 second' WHERE id=$1",
      [p.connection_id],
    );
    await assert.rejects(service.approve(owner, p.connection_id));
  },
);
for (const phase3 of [false, true])
  integration(
    `Phase ${phase3 ? 3 : 2} PostgreSQL + local HTTP: independent 9/1200-card onboarding verifies only protected reads; disconnect rejects refresh`,
    async (t) => {
      const pool = await database(t),
        fixture = companionFixture(),
        store = phase3
          ? createConsentGenerationStore(pool)
          : createCompanionLinkStore(pool),
        created = [];
      const service = createCompanionLinkService({
        store,
        terminalConsent: phase3,
        getConsent: async (owner) => fixture.consents.get(owner),
        issuer,
      });
      const tracked = {
        ...service,
        async begin(...args) {
          const r = await service.begin(...args);
          created.push(r.connection_id);
          return r;
        },
      };
      const reader = createCompanionReader({
        repository: {
          ...fixture.repository,
          findLink: async (hash) => store.resolve(hash),
          ...(phase3
            ? { latestConsent: (owner) => store.currentConsent(owner) }
            : {}),
        },
        hashToken: digest,
        fingerprint,
      });
      const grants = createDurableGrants({
        pool,
        encryptionKey: process.env.OAUTH_SESSION_ENCRYPTION_KEY,
      });
      const { server } = createCarefaServer({
        companionLifecycle: tracked,
        durableStorage: {
          grants,
          handshakes: createHandshakeStore(
            pool,
            process.env.OAUTH_SESSION_ENCRYPTION_KEY,
          ),
        },
        env: {
          RENDER_PUBLIC_URL: issuer,
          CAREFA_APP_URL: "https://carefa.example.test",
          CAREFA_LINK_FUNCTION_URL:
            "https://carefa.example.test/functions/link",
          RENDER_BRIDGE_SECRET: "fictional-bridge-".repeat(3),
          OAUTH_REDIRECT_URIS: JSON.stringify([
            "https://chatgpt.example.test/callback",
          ]),
          CAREFA_COMPANION_V1: "enabled",
          CAREFA_COMPANION_PHASE2: "enabled",
          ...(phase3 ? { CAREFA_COMPANION_PHASE3: "enabled" } : {}),
          CAREFA_COMPANION_INTERNAL_SECRET: "fictional-internal-".repeat(3),
          CAREFA_COMPANION_FUNCTION_URL:
            "https://carefa.example.test/functions/companion",
        },
        logger: { log() {}, error() {} },
        fetchImpl: async (_url, options) => {
          try {
            return Response.json(
              await reader.read(
                options.headers["x-carefa-link-token"],
                JSON.parse(options.body),
              ),
            );
          } catch (e) {
            return Response.json(
              { error: "withheld" },
              { status: e.status || 503 },
            );
          }
        },
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      t.after(async () => {
        await new Promise((r) => server.close(r));
        await pool.query("DELETE FROM companion_links WHERE id=ANY($1)", [
          created,
        ]);
        await pool.query("DELETE FROM oauth_sessions WHERE client_id=$1", [
          client,
        ]);
        if (phase3)
          await pool.query(
            "DELETE FROM companion_consents WHERE owner_id=ANY($1)",
            [["a", "b"]],
          );
        await pool.end();
      });
      const base = "http://127.0.0.1:" + server.address().port;
      const request = (path, options = {}) =>
        fetch(base + path, { redirect: "manual", ...options });
      const post = (path, input, headers = {}) =>
        request(path, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(input),
        });
      const internal = async (input) => {
        const r = await post("/internal/companion", input, {
          "x-carefa-companion-internal": "fictional-internal-".repeat(3),
        });
        assert.equal(r.status, 200);
        return r.json();
      };
      const form = (input, path = "/oauth/token") =>
        request(path, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(input),
        });
      const rpc = async (token, name, args = {}) => {
        const r = await post(
          "/mcp",
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          },
          { Authorization: "Bearer " + token },
        );
        return { status: r.status, body: await r.json() };
      };
      const client = (
        await (
          await post("/oauth/register", {
            redirect_uris: ["https://chatgpt.example.test/callback"],
          })
        ).json()
      ).client_id;
      const verifier = "v".repeat(43),
        challenge = createHash("sha256").update(verifier).digest("base64url"),
        resource = issuer + "/mcp";
      async function connect(owner) {
        const begin = await request(
          "/oauth/authorize?" +
            new URLSearchParams({
              client_id: client,
              redirect_uri: "https://chatgpt.example.test/callback",
              response_type: "code",
              scope: "collection:read",
              resource,
              state: "fictional-host-state",
              code_challenge: challenge,
              code_challenge_method: "S256",
            }),
        );
        const target = new URL(begin.headers.get("location"));
        assert.equal(target.pathname, "/AiCompanionApproval");
        const cb = target.searchParams.get("cb"),
          pending = await internal({
            action: "begin",
            owner,
            callback_url: cb,
          });
        assert.equal(
          (await internal({ action: "status", owner })).status,
          "awaiting_authorisation",
        );
        const switched = await post(
          "/internal/companion",
          {
            action: "approve",
            ...(phase3 ? { consent_approved: true } : {}),
            owner: owner === "a" ? "b" : "a",
            connection_id: pending.connection_id,
          },
          { "x-carefa-companion-internal": "fictional-internal-".repeat(3) },
        );
        assert.equal(switched.status, 409);
        const approval = await internal({
          action: "approve",
          ...(phase3 ? { consent_approved: true } : {}),
          owner,
          connection_id: pending.connection_id,
        });
        const finish = new URL(approval.redirect_url),
          response = await request(finish.pathname + finish.search, {
            headers: { Cookie: begin.headers.get("set-cookie").split(";")[0] },
          });
        const final = new URL(response.headers.get("location"));
        assert.equal(final.searchParams.get("iss"), issuer);
        assert.equal(final.searchParams.get("state"), "fictional-host-state");
        const code = final.searchParams.get("code");
        const attempts = await Promise.all(
          Array.from({ length: 6 }, () =>
            form({
              grant_type: "authorization_code",
              client_id: client,
              redirect_uri: "https://chatgpt.example.test/callback",
              resource,
              code,
              code_verifier: verifier,
            }),
          ),
        );
        assert.equal(attempts.filter((r) => r.status === 200).length, 1);
        const grant = await attempts.find((r) => r.status === 200).json();
        assert.equal(
          (await internal({ action: "status", owner })).status,
          "awaiting_verification",
        );
        await rpc(grant.access_token, "carefa_demo_collection");
        assert.equal(
          (await internal({ action: "status", owner })).status,
          "awaiting_verification",
        );
        const read = await rpc(grant.access_token, "carefa_companion_read", {
          section: "overview",
        });
        assert.equal(read.status, 200);
        const value = JSON.parse(read.body.result.content[0].text);
        assert.equal(
          value.data.owned_user_card_records,
          owner === "a" ? 9 : 1200,
        );
        const status = await internal({ action: "status", owner });
        assert.equal(status.status, "connected");
        assert.equal(
          status.verification_basis,
          "successful_protected_oauth_read",
        );
        return {
          grant,
          id: pending.connection_id,
          fingerprint: value.collector_fingerprint,
        };
      }
      const a = await connect("a"),
        b = await connect("b");
      assert.notEqual(a.fingerprint, b.fingerprint);
      const cross = await rpc(a.grant.access_token, "carefa_companion_read", {
        section: "cards",
        user_id: "b",
      });
      assert.equal(cross.body.result.isError, true);
      const denied = await post("/internal/companion", {
        action: "status",
        owner: "a",
      });
      assert.equal(denied.status, 401);
      const refresh = await form({
        grant_type: "refresh_token",
        client_id: client,
        resource,
        refresh_token: a.grant.refresh_token,
      });
      assert.equal(refresh.status, 200);
      const next = await refresh.json();
      await internal({ action: "disconnect", owner: "a", connection_id: a.id });
      assert.equal(
        (await internal({ action: "status", owner: "a" })).status,
        "disconnected",
      );
      assert.equal(
        (await rpc(next.access_token, "carefa_companion_read")).status,
        401,
      );
      assert.equal(
        (
          await form({
            grant_type: "refresh_token",
            client_id: client,
            resource,
            refresh_token: next.refresh_token,
          })
        ).status,
        400,
      );
      assert.equal(
        (await rpc(b.grant.access_token, "carefa_companion_read")).status,
        200,
      );
      if (phase3) await service.withdraw("b");
      else fixture.consents.get("b").permission_granted = false;
      assert.equal(
        (
          await form({
            grant_type: "refresh_token",
            client_id: client,
            resource,
            refresh_token: b.grant.refresh_token,
          })
        ).status,
        400,
      );
      assert.equal(
        (await rpc(b.grant.access_token, "carefa_companion_read")).status,
        401,
      );
      fixture.consents.get("b").permission_granted = true;
      const reconnected = await connect("a");
      assert.equal(
        (await rpc(reconnected.grant.access_token, "carefa_companion_read"))
          .status,
        200,
      );
      await form(
        { client_id: client, token: reconnected.grant.access_token },
        "/oauth/revoke",
      );
      assert.equal(
        (await internal({ action: "status", owner: "a" })).status,
        "disconnected",
      );
    },
  );

integration(
  "PostgreSQL: receipt/revoke races, code expiry, immutable identity and stored read-only constraints",
  async (t) => {
    const pool = await database(t),
      store = createCompanionLinkStore(pool),
      owner = "receipt-" + opaque();
    t.after(async () => {
      try {
        await pool.query("DELETE FROM companion_links WHERE owner_id=$1", [
          owner,
        ]);
      } finally {
        await pool.end();
      }
    });
    const service = createCompanionLinkService({
      store,
      getConsent: async (user) => ({
        created_by_id: user,
        provider: "ChatGPT",
        permission_granted: true,
        consent_version: "2",
      }),
      issuer,
    });
    async function approve() {
      const cb = callback(),
        p = await service.begin(owner, cb),
        a = await service.approve(owner, p.connection_id);
      return {
        id: p.connection_id,
        cb,
        code: new URL(a.redirect_url).searchParams.get("code"),
      };
    }
    const expired = await approve();
    const row = (
      await pool.query(
        "SELECT expires_at,approved_at FROM companion_links WHERE id=$1",
        [expired.id],
      )
    ).rows[0];
    assert.ok(row.expires_at - row.approved_at <= 60000);
    await pool.query(
      "UPDATE companion_links SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await assert.rejects(service.exchangeCode(expired.code, expired.cb));
    for (let run = 0; run < 6; run++) {
      const p = await approve(),
        token = await service.exchangeCode(p.code, p.cb);
      await service.verifiedRead(token, fingerprint("a"));
      await assert.rejects(service.verifiedRead(token, fingerprint("b")));
      await assert.rejects(
        pool.query(
          "UPDATE companion_links SET scope='collection:write' WHERE id=$1",
          [p.id],
        ),
      );
      await Promise.allSettled([
        service.verifiedRead(token, fingerprint("a")),
        service.disconnect(owner, p.id),
      ]);
      await assert.rejects(service.resolve(token));
      await assert.rejects(service.verifiedRead(token, fingerprint("a")));
    }
    const p = await approve(),
      token = await service.exchangeCode(p.code, p.cb);
    await pool.query(
      "UPDATE companion_links SET access_expires_at=now()-interval '1 second' WHERE id=$1",
      [p.id],
    );
    assert.equal(await service.validate(token), false);
  },
);
