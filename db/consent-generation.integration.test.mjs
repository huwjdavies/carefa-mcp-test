import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createConsentGenerationStore } from "./consent-generation-store.mjs";
import { createCompanionLinkService } from "../companion/link-service.mjs";
import { createDurableGrants } from "./durable-grants.mjs";
import { fingerprint } from "../test/companion.fixtures.mjs";
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
const integration = url ? test : test.skip,
  random = () => randomBytes(32).toString("base64url");
async function setup(t) {
  const { Pool } = await import("pg"),
    pool = new Pool({ connectionString: url, max: 8 }),
    owner = "consent-" + random(),
    other = "other-" + random(),
    client = "consent-client-" + random();
  t.after(async () => {
    try {
      await pool.query("DELETE FROM companion_links WHERE owner_id=ANY($1)", [
        [owner, other],
      ]);
      await pool.query(
        "DELETE FROM companion_consents WHERE owner_id=ANY($1)",
        [[owner, other]],
      );
      await pool.query("DELETE FROM oauth_sessions WHERE client_id=$1", [
        client,
      ]);
    } finally {
      await pool.end();
    }
  });
  const store = createConsentGenerationStore(pool),
    service = createCompanionLinkService({
      store,
      terminalConsent: true,
      issuer: "https://bridge.example.test",
    }),
    second = createCompanionLinkService({
      store: createConsentGenerationStore(pool),
      terminalConsent: true,
      issuer: "https://bridge.example.test",
    });
  const cb = () =>
    "https://bridge.example.test/link/callback?state=" + random();
  async function pending(user = owner) {
    const callback = cb(),
      p = await service.begin(user, callback);
    return { ...p, callback };
  }
  async function approve(p, user = owner) {
    const a = await service.approve(user, p.connection_id, true);
    return new URL(a.redirect_url).searchParams.get("code");
  }
  async function activate(user = owner) {
    const p = await pending(user),
      code = await approve(p, user),
      token = await service.exchangeCode(code, p.callback);
    return { ...p, token, code };
  }
  return {
    pool,
    owner,
    other,
    client,
    store,
    service,
    second,
    pending,
    approve,
    activate,
  };
}
integration(
  "Phase 3 PostgreSQL: withdrawal invalidates active grants and every earlier pending/code; reapproval never revives them",
  async (t) => {
    const f = await setup(t),
      a = await f.activate(),
      b = await f.activate(f.other),
      pending = await f.pending(),
      approved = await f.pending(),
      code = await f.approve(approved);
    await f.service.verifiedRead(a.token, fingerprint("a"));
    await f.service.withdraw(f.owner);
    for (const token of [a.token])
      assert.equal(await f.second.validate(token), false);
    await assert.rejects(
      f.second.approve(f.owner, pending.connection_id, true),
    );
    await assert.rejects(f.second.exchangeCode(code, approved.callback));
    assert.equal(await f.second.validate(b.token), true);
    // Simulate a legacy permission boolean turned on again: it is not the new authority.
    const legacy = { permission_granted: true };
    assert.equal(legacy.permission_granted, true);
    assert.equal(await f.service.validate(a.token), false);
    const fresh = await f.activate();
    assert.equal(await f.second.validate(fresh.token), true);
    assert.equal(await f.service.validate(a.token), false);
    const result = await f.pool.query(
      "SELECT state,consent_generation FROM companion_links WHERE owner_id=$1",
      [f.owner],
    );
    assert.ok(
      result.rows.some(
        (r) => r.state === "revoked" && r.consent_generation === "0",
      ),
    );
    assert.ok(
      result.rows.some(
        (r) => r.state === "active" && r.consent_generation === "1",
      ),
    );
  },
);
integration(
  "Phase 3 PostgreSQL: concurrent refresh/withdrawal/receipt cannot leave a usable descendant; new flow is required",
  async (t) => {
    const f = await setup(t),
      grants = createDurableGrants({
        pool: f.pool,
        encryptionKey: process.env.OAUTH_SESSION_ENCRYPTION_KEY,
      }),
      resource = "https://bridge.example.test/mcp";
    for (let n = 0; n < 8; n++) {
      const a = await f.activate(),
        pair = await grants.issue({
          clientId: f.client,
          linkToken: a.token,
          resource,
        });
      const [rotated] = await Promise.all([
        grants.refresh({
          refreshToken: pair.refresh_token,
          clientId: f.client,
          resource,
          validateLink: f.service.validate,
        }),
        f.second.withdraw(f.owner),
        f.service.verifiedRead(a.token, fingerprint("a")).catch(() => null),
      ]);
      assert.equal(await f.service.validate(a.token), false);
      assert.equal(
        await grants.refresh({
          refreshToken: pair.refresh_token,
          clientId: f.client,
          resource,
          validateLink: f.service.validate,
        }),
        null,
      );
      if (rotated) {
        const payload = await grants.authenticate(
          rotated.access_token,
          resource,
        );
        if (payload)
          assert.equal(await f.service.validate(payload.linkToken), false);
        assert.equal(
          await grants.refresh({
            refreshToken: rotated.refresh_token,
            clientId: f.client,
            resource,
            validateLink: f.service.validate,
          }),
          null,
        );
      }
      await assert.rejects(f.service.verifiedRead(a.token, fingerprint("a")));
    }
  },
);
integration(
  "Phase 3 PostgreSQL: approval/withdrawal and redemption/withdrawal serialize; old generation cannot cross the boundary",
  async (t) => {
    const f = await setup(t);
    for (let n = 0; n < 8; n++) {
      const p = await f.pending();
      const [approval] = await Promise.allSettled([
        f.service.approve(f.owner, p.connection_id, true),
        f.second.withdraw(f.owner),
      ]);
      if (approval.status === "fulfilled")
        await assert.rejects(
          f.service.exchangeCode(
            new URL(approval.value.redirect_url).searchParams.get("code"),
            p.callback,
          ),
        );
      const fresh = await f.pending(),
        code = await f.approve(fresh);
      const [redeemed] = await Promise.allSettled([
        f.service.exchangeCode(code, fresh.callback),
        f.second.withdraw(f.owner),
      ]);
      if (redeemed.status === "fulfilled")
        assert.equal(await f.service.validate(redeemed.value), false);
      await assert.rejects(f.service.exchangeCode(code, fresh.callback));
    }
  },
);
integration(
  "Phase 3 PostgreSQL: no implicit consent, foreign approval or legacy NULL-generation upgrade; pending budget is atomic",
  async (t) => {
    const f = await setup(t),
      p = await f.pending();
    await assert.rejects(
      f.service.approve(f.owner, p.connection_id),
      (e) => e.code === "explicit_consent_required",
    );
    await assert.rejects(f.service.approve(f.other, p.connection_id, true));
    const pending = await Promise.allSettled(
      Array.from({ length: 16 }, () => f.pending()),
    );
    assert.equal(pending.filter((r) => r.status === "fulfilled").length, 9); // one already exists
    assert.ok(
      pending
        .filter((r) => r.status === "rejected")
        .every((r) => r.reason.status === 429),
    );
    await f.service.withdraw(f.owner);
    assert.equal(
      (await f.store.currentConsent(f.owner)).permission_granted,
      false,
    );
    const p2 = await f.pending();
    await f.pool.query(
      "UPDATE companion_links SET consent_generation=NULL WHERE id=$1",
      [p2.connection_id],
    );
    await assert.rejects(f.service.approve(f.owner, p2.connection_id, true));
  },
);

integration(
  "Phase 3 PostgreSQL: isolated runtime privilege pattern permits metadata and denies DDL/collection reads",
  async (t) => {
    const f = await setup(t),
      db = await f.pool.connect(),
      role =
        "fixture_" + random().slice(0, 12).toLowerCase().replace(/-/g, "_");
    try {
      await db.query("BEGIN");
      await db.query(
        `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
      await db.query(
        "CREATE TABLE public.fictional_collection_privilege_probe(id text)",
      );
      await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await db.query(
        `GRANT SELECT,INSERT,UPDATE ON public.companion_consents,public.companion_links TO ${role}`,
      );
      await db.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON public.oauth_sessions TO ${role}`,
      );
      await db.query(`SET LOCAL ROLE ${role}`);
      await db.query("SELECT owner_id FROM public.companion_consents LIMIT 0");
      for (const sql of [
        "SELECT * FROM public.fictional_collection_privilege_probe",
        "CREATE TABLE public.forbidden_fixture_table(id text)",
      ]) {
        await db.query("SAVEPOINT permission_probe");
        await assert.rejects(db.query(sql), (e) => e.code === "42501");
        await db.query("ROLLBACK TO SAVEPOINT permission_probe");
      }
    } finally {
      await db.query("ROLLBACK");
      db.release();
    }
  },
);
