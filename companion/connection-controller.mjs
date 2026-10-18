import { connectionView } from "./connections.mjs";
import { CompanionError } from "./reader.mjs";
// Explicit first-party auth settings API; NEVER register this controller as an MCP tool.
export function createConnectionController({
  repository,
  listingUrl,
  publicReady = false,
  now = Date.now,
}) {
  return async function manage(authenticatedOwner, input) {
    if (typeof authenticatedOwner !== "string" || !authenticatedOwner)
      throw new CompanionError(401, "sign_in_required");
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((k) => !["action", "connection_id"].includes(k))
    )
      throw new CompanionError(400, "invalid_request");
    if (!["status", "disconnect"].includes(input.action))
      throw new CompanionError(400, "invalid_action");
    const links = await repository.linksForOwner(authenticatedOwner);
    if (
      !Array.isArray(links) ||
      links.some((link) => link.user_id !== authenticatedOwner)
    )
      throw new CompanionError(502, "owner_scope_violation");
    if (input.action === "disconnect") {
      if (
        typeof input.connection_id !== "string" ||
        !links.some((link) => link.id === input.connection_id)
      )
        throw new CompanionError(404, "connection_not_found");
      // Implementation must use both authenticatedOwner and connection ID in the UPDATE predicate.
      await repository.revokeOwnLink(authenticatedOwner, input.connection_id);
      return { disconnected: true };
    }
    const consent = await repository.latestConsent(authenticatedOwner);
    if (consent && consent.created_by_id !== authenticatedOwner)
      throw new CompanionError(502, "owner_scope_violation");
    return connectionView({
      consent,
      links,
      listingUrl,
      publicReady,
      now: now(),
    });
  };
}
