// Explicit disposable CI/test database only. Never reads or migrates a Render database.
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
const raw = process.env.CAREFA_TEST_DATABASE_URL;
if (!raw || process.env.CAREFA_TEST_DISPOSABLE !== "1")
  throw Error("An explicitly disposable PostgreSQL test database is required");
const url = new URL(raw);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/carefa_companion_test"
)
  throw Error("Only the loopback CAREFA fixture database is permitted");
const pool = new Pool({ connectionString: raw });
try {
  await pool.query(
    await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
  );
  await pool.query(
    await readFile(
      new URL("../db/companion-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await pool.query(
    await readFile(
      new URL("../db/consent-generation.sql", import.meta.url),
      "utf8",
    ),
  );
} finally {
  await pool.end();
}
const child = spawn(
  process.execPath,
  [
    "--test",
    "db/durable-grants.integration.test.mjs",
    "db/handshake-store.test.mjs",
    "db/companion-link-store.integration.test.mjs",
    "db/consent-generation.integration.test.mjs",
  ],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
