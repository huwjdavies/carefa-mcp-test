// STAGED ONLY. Explicit first-party consent; NO collection writes. Not an MCP tool.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  companionBridge,
  firstPartyOrigin,
} from "../../shared/companion/bridge-api.ts";
export default async function (req: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.method !== "POST")
    return Response.json(
      { error: "method_not_allowed" },
      { status: 405, headers },
    );
  if (!firstPartyOrigin(req))
    return Response.json({ error: "invalid_origin" }, { status: 403, headers });
  try {
    const sdk = createClientFromRequest(req),
      user = await sdk.auth.me();
    if (!user?.id)
      return Response.json(
        { error: "sign_in_required" },
        { status: 401, headers },
      );
    const input = await req.json(),
      fields: any = {
        begin: ["callback_url"],
        approval: ["connection_id"],
        approve: ["connection_id"],
        deny: ["connection_id"],
      };
    if (
      !input ||
      !fields[input.action] ||
      Object.keys(input).some(
        (k) => k !== "action" && !fields[input.action].includes(k),
      )
    )
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers },
      );
    if (input.action === "approve") {
      // Reject a switched account before writing even consent metadata.
      await companionBridge({
        action: "approval",
        owner: user.id,
        connection_id: input.connection_id,
      });
      await sdk.entities.AICompanionConsent.create({
        provider: "ChatGPT",
        permission_granted: true,
        consent_version: "2",
        connection_status: "authorised_unverified",
      });
    }
    const result = await companionBridge({ ...input, owner: user.id });
    if (input.action === "approval")
      result.collector_label =
        typeof user.username === "string" && !user.username.includes("@")
          ? user.username.slice(0, 80)
          : "Your signed-in CAREFA collector";
    return Response.json(result, { headers });
  } catch (error: any) {
    return Response.json(
      { error: "approval_unavailable_or_expired" },
      { status: error.status || 503, headers },
    );
  }
}
