// STAGED ONLY: copy through a separately approved Base44 integration review.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { secrets } from "base44:runtime";
import {
  createCompanionReader,
  CompanionError,
} from "../../shared/companion/reader.mjs";
import { createBase44ReadRepository } from "../../shared/companion/base44-repository.mjs";
import { collectorFingerprint } from "../../shared/collectorFingerprint.ts";
import { hash, constantTimeEqual } from "../../shared/aiLink.ts";
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
    const expected = secrets.get("RENDER_BRIDGE_SECRET");
    if (!expected || expected.length < 32)
      return Response.json(
        { error: "not_configured" },
        { status: 503, headers },
      );
    if (
      !constantTimeEqual(
        req.headers.get("x-carefa-bridge-secret") || "",
        expected,
      )
    )
      return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const token = req.headers.get("x-carefa-link-token") || "";
    // The shared credential authenticates the bridge only; the per-user link selects the owner.
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const reader = createCompanionReader({
      repository: createBase44ReadRepository(base44.asServiceRole.entities),
      hashToken: hash,
      fingerprint: collectorFingerprint,
    });
    return Response.json(await reader.read(token, body), { headers });
  } catch (error) {
    if (error instanceof CompanionError)
      return Response.json(
        { error: error.code },
        { status: error.status, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json({ error: "invalid_json" }, { status: 400, headers });
    console.error("CAREFA companion read failed");
    return Response.json(
      { error: "read_unavailable" },
      { status: 503, headers },
    );
  }
}
