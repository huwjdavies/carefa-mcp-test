import { timingSafeEqual } from "node:crypto";
import { CompanionError } from "./reader.mjs";
import { connectionView } from "./connections.mjs";
// Server-to-server metadata API only. Never registered in tools/list.
// Its secret authenticates CAREFA's first-party adapter, not individual collectors.
export function createCompanionInternalApi({
  service,
  secret,
  listingUrl,
  publicReady = false,
}) {
  if (typeof secret !== "string" || secret.length < 32)
    throw Error("Dedicated internal secret required");
  return async function dispatch(header, input) {
    const provided = Buffer.from(header || ""),
      expected = Buffer.from(secret);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    )
      throw new CompanionError(401, "unauthorized");
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new CompanionError(400, "invalid_request");
    const fields = {
      begin: ["owner", "callback_url"],
      approval: ["owner", "connection_id"],
      approve: ["owner", "connection_id", "consent_approved"],
      withdraw: ["owner"],
      deny: ["owner", "connection_id"],
      status: ["owner"],
      disconnect: ["owner", "connection_id"],
      resolve: ["token"],
    };
    const allowed = Object.hasOwn(fields, input.action)
      ? fields[input.action]
      : null;
    if (
      !allowed ||
      Object.keys(input).some((k) => k !== "action" && !allowed.includes(k))
    )
      throw new CompanionError(400, "invalid_request");
    switch (input.action) {
      case "begin":
        return service.begin(input.owner, input.callback_url);
      case "approval":
        return service.approval(input.owner, input.connection_id);
      case "approve":
        return service.approve(
          input.owner,
          input.connection_id,
          input.consent_approved,
        );
      case "deny":
        return service.deny(input.owner, input.connection_id);
      case "status":
        return connectionView({
          ...(await service.status(input.owner)),
          listingUrl,
          publicReady,
        });
      case "withdraw":
        return service.withdraw(input.owner);
      case "disconnect":
        return service.disconnect(input.owner, input.connection_id);
      case "resolve":
        return service.resolve(input.token);
    }
  };
}
