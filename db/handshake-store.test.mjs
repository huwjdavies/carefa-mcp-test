import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { createHandshakeStore } from "./handshake-store.mjs";

const url = process.env.CAREFA_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    process.env.CAREFA_TEST_DISPOSABLE !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ||
    u.pathname !== "/carefa_companion_test"
  )
    throw Error("Only disposable loopback test databases are allowed");
}
const integration = url ? test : test.skip;
integration(
  "OAuth handshake survives adapter recreation and is consumed only once",
  async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.CAREFA_TEST_DATABASE_URL,
      max: 4,
    });
    const key = process.env.OAUTH_SESSION_ENCRYPTION_KEY;
    const one = createHandshakeStore(pool, key);
    const two = createHandshakeStore(pool, key);
    const session = randomBytes(32).toString("base64url");
    const code = randomBytes(32).toString("base64url");
    const client = "handshake-test";
    const hash = (s) => createHash("sha256").update(s).digest("base64url");
    try {
      await one.put(
        "pending",
        session,
        client,
        { owner: "A" },
        Date.now() + 60000,
      );
      const results = await Promise.all(
        Array.from({ length: 6 }, () => two.consume("pending", session)),
      );
      assert.equal(results.filter(Boolean).length, 1);
      assert.deepEqual(results.find(Boolean), {
        clientId: client,
        payload: { owner: "A" },
      });
      await one.put("code", code, client, { owner: "B" }, Date.now() + 60000);
      assert.equal(await two.consume("pending", code), null);
      assert.deepEqual(await two.consume("code", code), {
        clientId: client,
        payload: { owner: "B" },
      });
      assert.equal(await one.consume("code", code), null);
    } finally {
      await pool.query("DELETE FROM oauth_sessions WHERE token_hash=ANY($1)", [
        [hash(session), hash(code)],
      ]);
      await pool.end();
    }
  },
);
