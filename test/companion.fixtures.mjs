import { createHash } from "node:crypto";
import { createCompanionReader } from "../companion/reader.mjs";
import { collectorFingerprint } from "../db/account-fingerprint.mjs";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const fingerprint = (owner) =>
  collectorFingerprint(owner, "fictional-testing-fingerprint-secret-32");
export function companionFixture(options = {}) {
  const now = Date.now(),
    tokens = { a: "A".repeat(43), b: "B".repeat(43) };
  const links = new Map(),
    consents = new Map(),
    calls = [];
  for (const owner of ["a", "b"]) {
    links.set(digest(tokens[owner]), {
      id: "link-" + owner,
      user_id: owner,
      token_hash: digest(tokens[owner]),
      status: "active",
      provider: "ChatGPT",
      scope: "collection:read",
      consent_version: "2",
      access_expires_at: new Date(now + 3600000).toISOString(),
    });
    consents.set(owner, {
      created_by_id: owner,
      provider: "ChatGPT",
      permission_granted: true,
      consent_version: "2",
    });
  }
  const cards = Object.fromEntries(
    [
      ["a", 9],
      ["b", 1200],
    ].map(([owner, n]) => [
      owner,
      Array.from({ length: n }, (_, i) => ({
        id: owner + "-" + String(i).padStart(5, "0"),
        created_by_id: owner,
        card_id: "printing-" + i,
        set_id: "fictional-set",
        set_name: "Fictional Set",
        card_name: "Fictional Card " + i,
        card_number: String(i),
        language: i % 2 ? "Japanese" : "English",
        variant: i % 2 ? "Holo" : "Normal",
        quantity: i === 0 ? 2 : 1,
        avg_value_gbp: 2.5,
        notes: "PRIVATE-NOTE",
        purchase_price: 999,
        email: "private@example.test",
        scan_url: "PRIVATE-SCAN",
      })),
    ]),
  );
  const extra = {
    collection_entries: {
      a: [{ id: "entry-a", created_by_id: "a", card_id: "printing-0" }],
      b: [],
    },
    binders: {
      a: [
        {
          id: "binder-a",
          created_by_id: "a",
          name: "Fire Garden",
          theme: "Fire",
          capacity: 360,
          description: "PRIVATE-DESCRIPTION",
        },
      ],
      b: [],
    },
    badges: {
      a: [
        {
          id: "badge-a",
          user_id: "a",
          region: "Kanto",
          gen: 1,
          badge_index: 1,
          badge_name: "Boulder",
          user_name: "PRIVATE-NAME",
        },
      ],
      b: [],
    },
    ranking: {
      a: [
        {
          id: "rank-a",
          user_id: "a",
          total_score: 42,
          card_count: 9,
          avg_score: 5,
          user_name: "PRIVATE-NAME",
        },
      ],
      b: [],
    },
  };
  const select = (kind, owner, filter = {}) => {
    let source = ["owned_cards", "user_cards", "wishlist"].includes(kind)
      ? cards[owner]
      : extra[kind]?.[owner] || [];
    if (kind === "owned_cards")
      source = source.filter((r) => r.is_looking_for !== true);
    if (kind === "wishlist")
      source = source.filter((r) => r.is_looking_for === true);
    if (filter.set_id)
      source = source.filter((r) => r.set_id === filter.set_id);
    return source;
  };
  const repository = {
    async findLink(tokenHash) {
      return links.get(tokenHash);
    },
    async latestConsent(owner) {
      return consents.get(owner);
    },
    async count(kind, owner, filter) {
      calls.push({ op: "count", kind, owner });
      return select(kind, owner, filter).length;
    },
    async page(kind, owner, { page, limit, ...filter }) {
      calls.push({ op: "page", kind, owner });
      return select(kind, owner, filter).slice(
        page * limit,
        (page + 1) * limit,
      );
    },
    ...options.repository,
  };
  const reader = createCompanionReader({
    repository,
    hashToken: digest,
    fingerprint,
    now: () => now,
    ...options.reader,
  });
  return {
    reader,
    repository,
    tokens,
    links,
    consents,
    cards,
    extra,
    calls,
    now,
  };
}
