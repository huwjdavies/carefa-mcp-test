import { createCompanionLinkStore } from "./companion-link-store.mjs";
import { createCompanionLinkService } from "../companion/link-service.mjs";
import { createCarefaConsentReader } from "../companion/consent-client.mjs";
// Deliberately NO migrations or resource creation. Schema/configuration must have
// been applied separately in the precise environment approved by the owner.
export async function initializeCompanionLifecycle(
  env,
  storage,
  fetchImpl = fetch,
) {
  if (env.CAREFA_COMPANION_PHASE2 !== "enabled") return null;
  if (!storage?.pool) throw Error("Phase 2 requires durable PostgreSQL");
  const result = await storage.pool.query(
    "SELECT to_regclass('companion_links') AS relation",
  );
  if (!result.rows[0]?.relation)
    throw Error("Approved Phase 2 schema migration is missing");
  return createCompanionLinkService({
    store: createCompanionLinkStore(storage.pool),
    issuer: env.RENDER_PUBLIC_URL,
    getConsent: createCarefaConsentReader({
      endpoint: env.CAREFA_COMPANION_CONSENT_FUNCTION_URL,
      carefaOrigin: env.CAREFA_LINK_FUNCTION_URL,
      secret: env.CAREFA_COMPANION_INTERNAL_SECRET,
      fetchImpl,
    }),
  });
}
