// Phase 3 cannot silently weaken TLS via a connection-string query override.
export function postgresPoolOptions(env) {
  const raw = env.DATABASE_URL;
  if (!raw) throw Error("Database configuration missing");
  const url = new URL(raw),
    phase3 = env.CAREFA_COMPANION_PHASE3 === "enabled";
  if (
    phase3 &&
    (env.PGSSLMODE !== "verify-full" ||
      [...url.searchParams.keys()].some((k) => /^ssl/i.test(k)))
  )
    throw Error(
      "Phase 3 requires explicit verified TLS without URL SSL overrides",
    );
  return {
    connectionString: raw,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ssl: ["require", "verify-full"].includes(env.PGSSLMODE)
      ? { rejectUnauthorized: true }
      : undefined,
  };
}
