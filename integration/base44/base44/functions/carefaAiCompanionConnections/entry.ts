// STAGED ONLY. First-party connection settings; never exposed through an AI tool.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { createConnectionController } from "../../shared/companion/connection-controller.mjs";
import { companionBridge } from "../../shared/companion/bridge-api.ts";
import { CompanionError } from "../../shared/companion/reader.mjs";
const rows = (value: any) => (Array.isArray(value) ? value : value?.items);
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
  try {
    // Do not allow a bridge/API token to manage first-party connection settings.
    if (
      req.headers.has("x-carefa-bridge-secret") ||
      req.headers.has("x-carefa-link-token")
    )
      return Response.json(
        { error: "first_party_session_required" },
        { status: 403, headers },
      );
    const expectedOrigin = new URL(
      secrets.get("CAREFA_PUBLIC_ORIGIN") ||
        "https://carefacollector.base44.app",
    ).origin;
    if (req.headers.get("origin") !== expectedOrigin)
      return Response.json(
        { error: "invalid_origin" },
        { status: 403, headers },
      );
    const sdk = createClientFromRequest(req),
      user = await sdk.auth.me();
    if (!user?.id)
      return Response.json(
        { error: "sign_in_required" },
        { status: 401, headers },
      );
    if (
      ["bridge-postgres-v2", "bridge-postgres-v3"].includes(
        secrets.get("CAREFA_COMPANION_LINK_AUTHORITY"),
      )
    ) {
      const input = await req.json();
      if (
        !input ||
        !["status", "disconnect", "withdraw"].includes(input.action) ||
        Object.keys(input).some((k) => !["action", "connection_id"].includes(k))
      )
        return Response.json(
          { error: "invalid_request" },
          { status: 400, headers },
        );
      const result = await companionBridge({ ...input, owner: user.id });
      if (input.action === "status")
        result.collector_label =
          typeof user.username === "string" && !user.username.includes("@")
            ? user.username.slice(0, 80)
            : "Your CAREFA collector";
      return Response.json(result, { headers });
    }
    const entity = sdk.asServiceRole.entities;
    const controller = createConnectionController({
      listingUrl: secrets.get("CHATGPT_COMPANION_LISTING_URL"),
      publicReady: secrets.get("CHATGPT_COMPANION_PUBLIC_READY") === "true",
      repository: {
        async linksForOwner(owner: string) {
          const result = rows(
            await entity.AiAccessLink.filter(
              { user_id: owner },
              "-created_date",
              101,
              0,
            ),
          );
          if (!result || result.length > 100)
            throw Error("Connection limit requires review");
          return result;
        },
        async latestConsent(owner: string) {
          return (
            rows(
              await entity.AICompanionConsent.filter(
                { created_by_id: owner, provider: "ChatGPT" },
                "-updated_date",
                2,
                0,
              ),
            )?.[0] ?? null
          );
        },
        async revokeOwnLink(owner: string, id: string) {
          await entity.AiAccessLink.updateMany(
            { user_id: owner, id, status: { $in: ["active", "pending"] } },
            {
              $set: { status: "revoked", revoked_at: new Date().toISOString() },
            },
          );
        },
      },
    });
    const input = await req.json();
    const result = await controller(user.id, input);
    if (input.action === "status")
      result.collector_label =
        typeof user.username === "string" && !user.username.includes("@")
          ? user.username.slice(0, 80)
          : "Your CAREFA collector";
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof CompanionError)
      return Response.json(
        { error: error.code },
        { status: error.status, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json({ error: "invalid_json" }, { status: 400, headers });
    console.error("CAREFA connection settings request failed");
    return Response.json(
      { error: "connection_unavailable" },
      { status: 503, headers },
    );
  }
}
