// First-party CAREFA settings model. This is never exposed as an AI write tool.
export function chatgptListingUrl(value) {
  try {
    const u = new URL(value);
    if (
      u.origin !== "https://chatgpt.com" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !/^\/(plugins|apps)\/[A-Za-z0-9_-]+$/.test(u.pathname)
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function connectionView({
  consent,
  links = [],
  listingUrl,
  publicReady = false,
  now = Date.now(),
}) {
  const allowed =
    consent?.provider === "ChatGPT" &&
    consent.permission_granted === true &&
    consent.consent_version === "2";
  const active = links.filter(
    (link) =>
      link.provider === "ChatGPT" &&
      link.status === "active" &&
      link.scope === "collection:read" &&
      link.consent_version === "2" &&
      Number.isFinite(Date.parse(link.access_expires_at)) &&
      Date.parse(link.access_expires_at) > now,
  );
  const verified =
    allowed &&
    active.find(
      (link) =>
        Number.isFinite(Date.parse(link.client_verified_at)) &&
        Date.parse(link.client_verified_at) <= now,
    );
  const fresh = (link) =>
    Number.isFinite(Date.parse(link.expires_at)) &&
    Date.parse(link.expires_at) > now;
  const recent = [...links]
    .filter((l) => l.provider === "ChatGPT")
    .sort(
      (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0),
    );
  const pending = recent.find((l) => l.status === "pending" && fresh(l));
  const approved = recent.find((l) => l.status === "approved" && fresh(l));
  const latest = recent[0];
  const status = verified
    ? "connected"
    : allowed && active.length
      ? "awaiting_verification"
      : pending
        ? "awaiting_authorisation"
        : allowed && approved
          ? "awaiting_verification"
          : latest?.status === "failed"
            ? "connection_failed"
            : latest?.status === "revoked"
              ? "disconnected"
              : recent.some((l) =>
                    ["active", "approved", "pending"].includes(l.status),
                  )
                ? "expired"
                : allowed
                  ? "awaiting_chatgpt"
                  : "not_connected";
  return {
    provider: "ChatGPT",
    status,
    permission_granted: allowed,
    // Pending and unverified links can also be explicitly disconnected.
    connection_id:
      verified?.id ?? active[0]?.id ?? pending?.id ?? approved?.id ?? null,
    verified_at: verified?.client_verified_at ?? null,
    verification_basis: verified ? "successful_protected_oauth_read" : null,
    listing_url: publicReady ? chatgptListingUrl(listingUrl) : null,
    available: publicReady && !!chatgptListingUrl(listingUrl),
    read_only: true,
  };
}
