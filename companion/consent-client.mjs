// Private CAREFA consent lookup. No email, credentials or collection contents returned.
export function createCarefaConsentReader({
  endpoint,
  carefaOrigin,
  secret,
  fetchImpl = fetch,
}) {
  const url = new URL(endpoint),
    origin = new URL(carefaOrigin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    typeof secret !== "string" ||
    secret.length < 32
  )
    throw Error("Invalid private consent configuration");
  return async (owner) => {
    const response = await fetchImpl(url.href, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        "x-carefa-companion-internal": secret,
      },
      body: JSON.stringify({ owner }),
    });
    if (!response.ok) throw Error("Consent service unavailable");
    const value = await response.json();
    if (value.consent === null) return null;
    const c = value.consent;
    if (
      !c ||
      c.created_by_id !== owner ||
      c.provider !== "ChatGPT" ||
      typeof c.permission_granted !== "boolean" ||
      typeof c.consent_version !== "string"
    )
      throw Error("Invalid private consent response");
    return {
      created_by_id: owner,
      provider: "ChatGPT",
      permission_granted: c.permission_granted,
      consent_version: c.consent_version,
    };
  };
}
