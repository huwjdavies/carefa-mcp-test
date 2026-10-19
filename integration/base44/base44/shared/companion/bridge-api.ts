// STAGED ONLY. This API is never called from a browser or an AI tool directly.
import { secrets } from "base44:runtime";
export async function companionBridge(input: Record<string, unknown>) {
  const raw = secrets.get("CAREFA_COMPANION_BRIDGE_ORIGIN");
  const secret = secrets.get("CAREFA_COMPANION_INTERNAL_SECRET");
  if (!raw || !secret || secret.length < 32)
    throw Error("Companion is not configured");
  const origin = new URL(raw);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== raw ||
    origin.username ||
    origin.password
  )
    throw Error("Invalid bridge origin");
  const response = await fetch(new URL("/internal/companion", origin), {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      "x-carefa-companion-internal": secret,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error: any = new Error("Connection request failed");
    error.status = [400, 401, 403, 404, 409].includes(response.status)
      ? response.status
      : 503;
    throw error;
  }
  return response.json();
}
export function firstPartyOrigin(req: Request) {
  const expected =
    secrets.get("CAREFA_PUBLIC_ORIGIN") || "https://carefacollector.base44.app";
  return (
    req.headers.get("origin") === new URL(expected).origin &&
    !req.headers.has("x-carefa-bridge-secret") &&
    !req.headers.has("x-carefa-link-token")
  );
}

export async function companionLinkHash(token: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
