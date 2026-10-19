// Read-only approval preflight. Passing this check never authorises deployment.
const forbidden = {
  base44: ["69fc9f9df40058abb77f7f42"],
  render: [
    "srv-db9lk6mq1p3s738ne2gg",
    "srv-db8rc0mi0phs738oguj0",
    "srv-db5s3ag473hc73c7f9t0",
  ],
  postgres: ["dpg-db9l16dg1s2s739497p0-a"],
};
export function validateIsolatedTarget(m) {
  const errors = [];
  if (!m || typeof m !== "object") return ["Target record required"];
  if (!/^[a-f0-9]{40}$/.test(m.commit || ""))
    errors.push("Exact reviewed commit required");
  if (m.branch !== "carefa-multiuser-hardening-20261017")
    errors.push("Wrong development branch");
  for (const kind of ["base44", "render", "postgres"]) {
    if (
      typeof m[kind]?.id !== "string" ||
      !m[kind].id ||
      /not.created|pending|[<>]/i.test(m[kind].id)
    )
      errors.push(kind + " actual resource ID required");
    if (forbidden[kind].includes(m[kind]?.id))
      errors.push(kind + " existing/unverified target forbidden");
  }
  if (m.render?.autoDeploy !== "no") errors.push("Automatic deployment must remain off");
  if (m.render?.plan !== "free" || m.postgres?.plan !== "free")
    errors.push("Only explicitly verified free plans are permitted by this proposal");
  for (const flag of ["CAREFA_COMPANION_V1", "CAREFA_COMPANION_PHASE2", "CAREFA_COMPANION_PHASE3"])
    if (m.flags?.[flag] !== "enabled") errors.push(flag + " must be enabled");
  if (m.postgres?.databaseName !== "carefa_companion_phase3")
    errors.push("Exact isolated database name required");
  for (const key of [
    "independentBackendVerified",
    "freshCredentialsVerified",
    "noProductionDataOrWritableAccess",
    "zeroAdditionalCostVerified",
    "quotasSeparateFromProduction",
    "legacyConsentWritesDenied",
    "runtimeRoleVerified",
  ])
    if (m[key] !== true) errors.push(key + " evidence required");
  if (
    m.flags?.CAREFA_COMPANION_PHASE3 !== "enabled" ||
    m.flags?.CHATGPT_COMPANION_PUBLIC_READY !== "false"
  )
    errors.push("Isolated feature flags required");
  if (m.flags?.CAREFA_COMPANION_LINK_AUTHORITY !== "bridge-postgres-v3")
    errors.push("Terminal consent authority required");
  return errors;
}
