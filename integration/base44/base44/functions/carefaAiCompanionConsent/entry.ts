// STAGED private consent lookup. Server-to-server only; never an MCP tool.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import { constantTimeEqual } from "../../shared/aiLink.ts";
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
  const expected = secrets.get("CAREFA_COMPANION_INTERNAL_SECRET");
  if (
    !expected ||
    expected.length < 32 ||
    !constantTimeEqual(
      expected,
      req.headers.get("x-carefa-companion-internal") || "",
    )
  )
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  try {
    const input = await req.json();
    if (
      !input ||
      Object.keys(input).length !== 1 ||
      typeof input.owner !== "string" ||
      !input.owner ||
      input.owner.length > 200
    )
      return Response.json(
        { error: "invalid_request" },
        { status: 400, headers },
      );
    const sdk = createClientFromRequest(req);
    const raw = await sdk.asServiceRole.entities.AICompanionConsent.filter(
      { created_by_id: input.owner, provider: "ChatGPT" },
      "-updated_date",
      2,
      0,
    );
    const rows = Array.isArray(raw) ? raw : raw?.items,
      row = rows?.[0];
    if (row && row.created_by_id !== input.owner) throw Error("Owner mismatch");
    return Response.json(
      {
        consent: row
          ? {
              created_by_id: row.created_by_id,
              provider: row.provider,
              permission_granted: row.permission_granted === true,
              consent_version: row.consent_version,
            }
          : null,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "consent_unavailable" },
      { status: 503, headers },
    );
  }
}
