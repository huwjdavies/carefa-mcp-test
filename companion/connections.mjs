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
  return {
    provider: "ChatGPT",
    status: verified
      ? "connected"
      : allowed
        ? active.length
          ? "awaiting_verification"
          : "awaiting_chatgpt"
        : links.some((link) => link.status === "active")
          ? "reconnect_required"
          : "not_connected",
    permission_granted: allowed,
    connection_id: verified?.id ?? null,
    verified_at: verified?.client_verified_at ?? null,
    listing_url: publicReady ? chatgptListingUrl(listingUrl) : null,
    available: publicReady && !!chatgptListingUrl(listingUrl),
    read_only: true,
  };
}
