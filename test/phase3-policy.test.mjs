import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { postgresPoolOptions } from "../db/pool-options.mjs";
import { createCarefaServer } from "../server.mjs";
import { createCompanionInternalApi } from "../companion/internal-api.mjs";
test("Phase 3 fails closed without terminal authority and requires verified TLS without URL weakening", () => {
  assert.throws(() =>
    createCarefaServer({ env: { CAREFA_COMPANION_PHASE3: "enabled" } }),
  );
  const env = {
    CAREFA_COMPANION_PHASE3: "enabled",
    DATABASE_URL: "postgres://fixture:fictional@db.example.test/fixture",
    PGSSLMODE: "verify-full",
  };
  assert.equal(postgresPoolOptions(env).ssl.rejectUnauthorized, true);
  for (const mode of ["disable", "require", undefined])
    assert.throws(() => postgresPoolOptions({ ...env, PGSSLMODE: mode }));
  assert.throws(() =>
    postgresPoolOptions({
      ...env,
      DATABASE_URL: env.DATABASE_URL + "?sslmode=no-verify",
    }),
  );
});
test("private metadata API cannot be used to re-enable consent or forge a verification receipt", async () => {
  const secret = "fictional-internal-".repeat(3),
    calls = [];
  const api = createCompanionInternalApi({
    secret,
    service: {
      withdraw: async (owner) => {
        calls.push(owner);
        return { withdrawn: true };
      },
    },
  });
  for (const action of [
    "grant",
    "enable",
    "verify",
    "__proto__",
    "constructor",
  ])
    await assert.rejects(
      api(secret, { action, owner: "a" }),
      (e) => e.status === 400,
    );
  await assert.rejects(
    api("", { action: "withdraw", owner: "a" }),
    (e) => e.status === 401,
  );
  assert.equal(
    (await api(secret, { action: "withdraw", owner: "a" })).withdrawn,
    true,
  );
  assert.deepEqual(calls, ["a"]);
});
test("isolated schema closes the direct consent CRUD bypass; replacement legacy surfaces contain no entity writes", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL(
        "../integration/base44/isolation-only/base44/entities/AICompanionConsent.jsonc",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const op of ["create", "update", "delete"])
    assert.equal(schema.rls[op], false);
  for (const file of [
    "src/components/ai/AiConnectConsentCard.jsx",
    "src/components/ai/AiLinkStatusCard.jsx",
    "src/pages/AIConnectTest.jsx",
    "src/pages/AiLink.jsx",
  ]) {
    const source = await readFile(
      new URL("../integration/base44/isolation-only/" + file, import.meta.url),
      "utf8",
    );
    assert.ok(!source.includes("AICompanionConsent."));
    assert.ok(!source.includes("carefaAiLink"));
  }
});
