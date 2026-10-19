import { randomBytes, createHash } from "node:crypto";
import { createSessionStore } from "./session-store.mjs";
import { createSessionCrypto } from "./session-crypto.mjs";
import { issueTokenPair } from "./transactional-issuance.mjs";

const digest = (value) =>
  createHash("sha256").update(value).digest("base64url");
const random = () => randomBytes(32).toString("base64url");
const ACCESS_MS = 15 * 60_000;
const REFRESH_MS = 30 * 24 * 60 * 60_000;

// All credentials are opaque. Database keys are SHA-256 hashes and the
// upstream CAREFA link token is stored only in AES-GCM encrypted payloads.
// This adapter is not yet enabled by the public OAuth bridge.
export function createDurableGrants({ pool, encryptionKey, now = Date.now }) {
  const store = createSessionStore(pool);
  const crypto = createSessionCrypto(encryptionKey);
  function record(token, kind, clientId, grantId, payload, expiresAt) {
    return {
      tokenHash: digest(token),
      kind,
      clientId,
      grantId,
      ciphertext: crypto.encrypt(payload),
      expiresAt: new Date(expiresAt),
    };
  }
  return {
    async issue({ clientId, linkToken, resource, scope = "collection:read" }) {
      if (!clientId || !linkToken || !resource || scope !== "collection:read")
        throw new Error("Invalid read-only grant parameters");
      const grantId = random();
      const payload = { linkToken, resource, scope };
      const accessToken = random(),
        refreshToken = random();
      await issueTokenPair(
        pool,
        record(
          accessToken,
          "access",
          clientId,
          grantId,
          payload,
          now() + ACCESS_MS,
        ),
        record(
          refreshToken,
          "refresh",
          clientId,
          grantId,
          payload,
          now() + REFRESH_MS,
        ),
      );
      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: ACCESS_MS / 1000,
        scope,
      };
    },
    async authenticate(accessToken, resource) {
      if (
        typeof accessToken !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(accessToken)
      )
        return null;
      const row = await store.get(digest(accessToken));
      if (
        !row ||
        row.token_kind !== "access" ||
        new Date(row.expires_at).getTime() <= now()
      )
        return null;
      const payload = crypto.decrypt(row.payload_ciphertext);
      return payload.resource === resource &&
        payload.scope === "collection:read" &&
        typeof payload.linkToken === "string"
        ? payload
        : null;
    },
    async refresh({ refreshToken, clientId, resource, validateLink }) {
      if (!refreshToken || !clientId || !resource) return null;
      const row = await store.get(digest(refreshToken));
      if (
        !row ||
        row.token_kind !== "refresh" ||
        row.client_id !== clientId ||
        new Date(row.expires_at).getTime() <= now()
      )
        return null;
      const payload = crypto.decrypt(row.payload_ciphertext);
      if (payload.resource !== resource || payload.scope !== "collection:read")
        return null;
      if (validateLink && !(await validateLink(payload.linkToken))) return null;
      const accessToken = random(),
        nextRefreshToken = random();
      const accepted = await store.rotate({
        oldHash: digest(refreshToken),
        clientId,
        newAccess: record(
          accessToken,
          "access",
          clientId,
          row.grant_id,
          payload,
          now() + ACCESS_MS,
        ),
        newRefresh: record(
          nextRefreshToken,
          "refresh",
          clientId,
          row.grant_id,
          payload,
          now() + REFRESH_MS,
        ),
      });
      if (!accepted) return null;
      return {
        access_token: accessToken,
        refresh_token: nextRefreshToken,
        token_type: "Bearer",
        expires_in: ACCESS_MS / 1000,
        scope: payload.scope,
      };
    },
    async revoke(token, clientId, revokeLink) {
      if (!token || !clientId) return;
      const row = await store.findForRevocation(digest(token));
      if (row?.client_id === clientId) {
        if (revokeLink) {
          const session = row;
          const payload = crypto.decrypt(session.payload_ciphertext);
          await revokeLink(payload.linkToken);
        }
        await store.revokeGrant(row.grant_id, clientId);
      }
    },
  };
}
