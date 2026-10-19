import { randomBytes, createHash } from "node:crypto";
import { CompanionError } from "./reader.mjs";
const random = () => randomBytes(32).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const opaque = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const reject = (status, code) => {
  throw new CompanionError(status, code);
};
// Only trusted first-party CAREFA adapters may supply authenticatedOwner/getConsent.
// Do not expose begin/approve/deny/status/disconnect as MCP tools.
export function createCompanionLinkService({
  store,
  getConsent,
  issuer,
  now = Date.now,
}) {
  const origin = new URL(issuer);
  if (origin.protocol !== "https:" || origin.origin !== issuer)
    throw Error("Exact HTTPS issuer required");
  function callback(value) {
    try {
      const u = new URL(value);
      if (
        u.origin !== issuer ||
        u.pathname !== "/link/callback" ||
        u.hash ||
        u.username ||
        u.password ||
        [...u.searchParams.keys()].length !== 1 ||
        !opaque(u.searchParams.get("state"))
      )
        throw Error();
      return u.href;
    } catch {
      reject(400, "invalid_callback");
    }
  }
  const owner = (value) => {
    if (typeof value !== "string" || !value || value.length > 200)
      reject(401, "sign_in_required");
    return value;
  };
  async function consent(user) {
    const c = await getConsent(user);
    if (
      c?.created_by_id !== user ||
      c.provider !== "ChatGPT" ||
      c.permission_granted !== true ||
      c.consent_version !== "2"
    )
      reject(403, "consent_required");
    return c;
  }
  async function resolve(token) {
    if (!opaque(token)) reject(401, "invalid_token");
    const link = await store.resolve(digest(token));
    if (
      !link ||
      link.scope !== "collection:read" ||
      link.consent_version !== "2"
    )
      reject(401, "invalid_token");
    await consent(link.user_id);
    return link;
  }
  return {
    async begin(authenticatedOwner, callbackUrl) {
      const user = owner(authenticatedOwner),
        cb = callback(callbackUrl),
        id = random();
      await store.begin({
        id,
        owner: user,
        callbackUrl: cb,
        expiresAt: new Date(now() + 10 * 60000),
      });
      return { connection_id: id, status: "awaiting_authorisation" };
    },
    async approval(authenticatedOwner, id) {
      const user = owner(authenticatedOwner);
      if (!opaque(id)) reject(400, "invalid_request");
      if (!(await store.pendingForOwner(user, id)))
        reject(409, "approval_expired_or_account_changed");
      return {
        connection_id: id,
        provider: "ChatGPT",
        scope: "collection:read",
        consent_version: "2",
        read_only: true,
      };
    },
    async approve(authenticatedOwner, id) {
      const user = owner(authenticatedOwner);
      if (!opaque(id)) reject(400, "invalid_request");
      await consent(user);
      const code = random(),
        cb = await store.approve({ id, owner: user, codeHash: digest(code) });
      if (!cb) reject(409, "approval_expired_or_account_changed");
      const destination = new URL(cb);
      destination.searchParams.set("code", code);
      return { redirect_url: destination.href };
    },
    async deny(authenticatedOwner, id) {
      const user = owner(authenticatedOwner);
      if (!opaque(id)) reject(400, "invalid_request");
      const cb = await store.deny({ id, owner: user });
      if (!cb) reject(409, "approval_expired_or_account_changed");
      const destination = new URL(cb);
      destination.searchParams.set("error", "access_denied");
      return { redirect_url: destination.href };
    },
    async exchangeCode(code, callbackUrl) {
      if (!opaque(code)) reject(400, "invalid_grant");
      const token = random();
      const link = await store.redeem({
        codeHash: digest(code),
        callbackUrl: callback(callbackUrl),
        tokenHash: digest(token),
        accessExpiresAt: new Date(now() + 30 * 86400000),
      });
      if (!link) reject(400, "invalid_grant");
      // Revocation of consent between approval and redemption fails closed, even though
      // the one-time code has been consumed. The collector must start a fresh flow.
      try {
        await consent(link.user_id);
      } catch (e) {
        await store.revokeOwnLink(link.user_id, link.id);
        throw e;
      }
      return token;
    },
    resolve,
    async validate(token) {
      try {
        await resolve(token);
        return true;
      } catch (e) {
        if ([401, 403].includes(e.status)) return false;
        throw e;
      }
    },
    async revokeToken(token) {
      if (!opaque(token)) return;
      const link = await store.resolve(digest(token));
      if (link) await store.revokeOwnLink(link.user_id, link.id);
    },
    async verifiedRead(token, fingerprint) {
      if (!/^collector-v1-[A-Za-z0-9_-]{22}$/.test(fingerprint || ""))
        reject(502, "invalid_fingerprint");
      await resolve(token);
      if (!(await store.verify({ tokenHash: digest(token), fingerprint })))
        reject(401, "invalid_token");
    },
    async status(authenticatedOwner) {
      const user = owner(authenticatedOwner);
      const [links, currentConsent] = await Promise.all([
        store.linksForOwner(user),
        getConsent(user),
      ]);
      if (
        links.some((l) => l.user_id !== user) ||
        (currentConsent && currentConsent.created_by_id !== user)
      )
        reject(502, "owner_scope_violation");
      return { links, consent: currentConsent };
    },
    async disconnect(authenticatedOwner, id) {
      const user = owner(authenticatedOwner);
      if (!opaque(id)) reject(400, "invalid_request");
      if (!(await store.revokeOwnLink(user, id)))
        reject(404, "connection_not_found");
      return { disconnected: true };
    },
  };
}
