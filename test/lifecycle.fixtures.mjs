import { createCompanionLinkService } from "../companion/link-service.mjs";
// Fictional adapter for policy tests. PostgreSQL tests separately prove atomic SQL.
export function lifecycleFixture({ getConsent } = {}) {
  let time = Date.now();
  const links = new Map(),
    consents = new Map(
      ["a", "b"].map((owner) => [
        owner,
        {
          created_by_id: owner,
          provider: "ChatGPT",
          permission_granted: true,
          consent_version: "2",
        },
      ]),
    );
  const fresh = (row) => Date.parse(row.expires_at) > time;
  const store = {
    async begin({ id, owner, callbackUrl, expiresAt }) {
      links.set(id, {
        id,
        user_id: owner,
        callback_url: callbackUrl,
        status: "pending",
        provider: "ChatGPT",
        scope: "collection:read",
        consent_version: "2",
        expires_at: expiresAt.toISOString(),
        created_at: new Date(time).toISOString(),
      });
    },
    async pendingForOwner(owner, id) {
      const r = links.get(id);
      return r?.user_id === owner && r.status === "pending" && fresh(r)
        ? r
        : null;
    },
    async approve({ id, owner, codeHash }) {
      const r = await store.pendingForOwner(owner, id);
      if (!r || r.status !== "pending") return null;
      r.status = "approved";
      r.code_hash = codeHash;
      return r.callback_url;
    },
    async deny({ id, owner }) {
      const r = await store.pendingForOwner(owner, id);
      if (!r || r.status !== "pending") return null;
      r.status = "denied";
      return r.callback_url;
    },
    async redeem({ codeHash, callbackUrl, tokenHash, accessExpiresAt }) {
      const r = [...links.values()].find(
        (r) =>
          r.code_hash === codeHash &&
          r.callback_url === callbackUrl &&
          r.status === "approved" &&
          fresh(r),
      );
      if (!r) return null;
      Object.assign(r, {
        status: "active",
        token_hash: tokenHash,
        access_expires_at: accessExpiresAt.toISOString(),
      });
      return { ...r };
    },
    async resolve(hash) {
      const r = [...links.values()].find(
        (r) =>
          r.token_hash === hash &&
          r.status === "active" &&
          Date.parse(r.access_expires_at) > time,
      );
      return r ? { ...r } : null;
    },
    async verify({ tokenHash, fingerprint }) {
      const r = await store.resolve(tokenHash);
      if (
        !r ||
        (r.collector_fingerprint && r.collector_fingerprint !== fingerprint)
      )
        return false;
      Object.assign(links.get(r.id), {
        client_verified_at: new Date(time).toISOString(),
        collector_fingerprint: fingerprint,
      });
      return true;
    },
    async linksForOwner(owner) {
      return [...links.values()]
        .filter((r) => r.user_id === owner)
        .map((r) => ({ ...r }));
    },
    async revokeOwnLink(owner, id) {
      const r = links.get(id);
      if (r?.user_id !== owner) return false;
      r.status = "revoked";
      return true;
    },
  };
  const service = createCompanionLinkService({
    store,
    getConsent: getConsent || (async (owner) => consents.get(owner)),
    issuer: "https://bridge.example.test",
    now: () => time,
  });
  const callback =
    "https://bridge.example.test/link/callback?state=" + "s".repeat(43);
  async function activate(owner = "a") {
    const start = await service.begin(owner, callback);
    const approval = await service.approve(owner, start.connection_id);
    return {
      id: start.connection_id,
      token: await service.exchangeCode(
        new URL(approval.redirect_url).searchParams.get("code"),
        callback,
      ),
    };
  }
  return {
    service,
    store,
    links,
    consents,
    activate,
    callback,
    advance: (ms) => (time += ms),
  };
}
