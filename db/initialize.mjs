import { postgresPoolOptions } from "./pool-options.mjs";
import { readFile } from "node:fs/promises";
import { createDurableGrants } from "./durable-grants.mjs";
import { createHandshakeStore } from "./handshake-store.mjs";

// Opt-in only. A configured deployment must use durable storage or fail to start.
// No automatic fallback to ephemeral memory after database errors.
export async function initializeDurableGrants(env = process.env) {
  if (env.OAUTH_STORAGE_MODE !== "postgres") {
    if (env.OAUTH_STORAGE_MODE && env.OAUTH_STORAGE_MODE !== "memory") {
      throw new Error("Unsupported OAuth storage mode");
    }
    if (env.NODE_ENV === "production") {
      throw new Error("Production requires durable PostgreSQL OAuth storage");
    }
    return null;
  }
  if (!env.DATABASE_URL || !env.OAUTH_SESSION_ENCRYPTION_KEY) {
    throw new Error(
      "Postgres OAuth mode requires DATABASE_URL and OAUTH_SESSION_ENCRYPTION_KEY",
    );
  }
  const { Pool } = await import("pg");
  const pool = new Pool(postgresPoolOptions(env));
  try {
    const client = await pool.connect();
    try {
      if (env.CAREFA_COMPANION_PHASE3 === "enabled") {
        const result = await client.query(
          "SELECT to_regclass('oauth_sessions') AS oauth, to_regclass('companion_links') AS links, to_regclass('companion_consents') AS consents",
        );
        if (
          !result.rows[0]?.oauth ||
          !result.rows[0]?.links ||
          !result.rows[0]?.consents
        )
          throw Error("Approved schema migration missing");
      } else {
        const schema = await readFile(
          new URL("./schema.sql", import.meta.url),
          "utf8",
        );
        await client.query("BEGIN");
        await client.query(schema);
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const grants = createDurableGrants({
      pool,
      encryptionKey: env.OAUTH_SESSION_ENCRYPTION_KEY,
    });
    return {
      grants,
      handshakes: createHandshakeStore(pool, env.OAUTH_SESSION_ENCRYPTION_KEY),
      pool,
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
