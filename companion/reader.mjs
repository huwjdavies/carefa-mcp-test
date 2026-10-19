// SDK-independent, read-only policy boundary. Repository exposes reads only.
export const COMPANION_SCOPE = "collection:read";
export const CONSENT_VERSION = "2";
export const SECTIONS = [
  "overview",
  "cards",
  "sets",
  "collector_score",
  "achievements",
  "wishlist",
  "binders",
  "specialists",
  "type_mastery",
  "regional_progress",
];
const PAGE_SIZE = 100;
export class CompanionError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const deny = (status, code) => {
  throw new CompanionError(status, code);
};
const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export function validateCompanionInput(input) {
  if (!plain(input)) deny(400, "invalid_request");
  if (
    Object.keys(input).some(
      (k) => !["section", "page", "source", "set_id"].includes(k),
    )
  )
    deny(400, "unsupported_argument");
  const {
    section = "overview",
    page = 0,
    source = "user_cards",
    set_id,
  } = input;
  if (
    !SECTIONS.includes(section) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 10000 ||
    !["user_cards", "collection_entries"].includes(source) ||
    (set_id !== undefined &&
      (typeof set_id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(set_id)))
  )
    deny(400, "invalid_request");
  if (section === "sets" && !set_id) deny(400, "set_id_required");
  if (
    !["cards", "sets"].includes(section) &&
    (input.set_id !== undefined || input.source !== undefined)
  )
    deny(400, "unsupported_argument");
  return {
    section,
    page,
    ...(["cards", "sets"].includes(section) ? { source } : {}),
    ...(set_id ? { set_id } : {}),
  };
}
const text = (v, max = 160) =>
  typeof v === "string"
    ? v
        .slice(0, max)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    : undefined;
const number = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const quantity = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 1);
export function projectCard(row) {
  const result = {};
  for (const key of [
    "card_id",
    "card_name",
    "card_number",
    "set_id",
    "set_name",
    "variant",
    "language",
    "card_type",
  ]) {
    const value = text(row[key]);
    if (value !== undefined) result[key] = value;
  }
  result.quantity = quantity(row.quantity);
  result.avg_value_gbp = number(row.avg_value_gbp);
  result.avg_value_usd = number(row.avg_value_usd);
  return result;
}
const ownerField = (kind) =>
  ["ranking", "badges"].includes(kind) ? "user_id" : "created_by_id";
const unavailable = (reason) => ({ status: "unavailable", reason });
const fingerprintValid = (v) =>
  typeof v === "string" && /^collector-v1-[A-Za-z0-9_-]{22}$/.test(v);

export function createCompanionReader({
  repository,
  hashToken,
  fingerprint,
  now = Date.now,
  maxScan = 10000,
}) {
  async function authorize(token) {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
      deny(401, "invalid_token");
    const digest = await hashToken(token),
      link = await repository.findLink(digest);
    if (
      !link ||
      link.token_hash !== digest ||
      link.status !== "active" ||
      typeof link.user_id !== "string" ||
      !link.user_id ||
      link.provider !== "ChatGPT" ||
      link.scope !== COMPANION_SCOPE ||
      link.consent_version !== CONSENT_VERSION ||
      !Number.isFinite(Date.parse(link.access_expires_at)) ||
      Date.parse(link.access_expires_at) <= now()
    )
      deny(401, "invalid_token");
    const consent = await repository.latestConsent(link.user_id);
    if (
      !consent ||
      consent.created_by_id !== link.user_id ||
      consent.provider !== "ChatGPT" ||
      consent.permission_granted !== true ||
      consent.consent_version !== CONSENT_VERSION ||
      (link.consent_generation !== undefined &&
        consent.consent_generation !== link.consent_generation)
    )
      deny(403, "consent_required");
    return link;
  }
  async function count(kind, owner, extra = {}) {
    const total = await repository.count(kind, owner, extra);
    if (!Number.isSafeInteger(total) || total < 0) deny(502, "invalid_data");
    return total;
  }
  async function rows(kind, owner, page, extra = {}) {
    const values = await repository.page(kind, owner, {
      page,
      limit: PAGE_SIZE,
      ...extra,
    });
    if (
      !Array.isArray(values) ||
      values.length > PAGE_SIZE ||
      values.some((row) => !plain(row) || row[ownerField(kind)] !== owner)
    )
      deny(502, "owner_scope_violation");
    return values;
  }
  async function all(kind, owner, extra = {}) {
    const total = await count(kind, owner, extra);
    if (total > maxScan) return { records: [], complete: false, total };
    const records = [],
      seen = new Set();
    for (let page = 0; records.length < total; page++) {
      const part = await rows(kind, owner, page, extra);
      if (!part.length) deny(409, "collection_changed_retry");
      for (const row of part) {
        if (typeof row.id !== "string" || seen.has(row.id))
          deny(409, "collection_changed_retry");
        seen.add(row.id);
        records.push(row);
      }
    }
    if (records.length !== total || (await count(kind, owner, extra)) !== total)
      deny(409, "collection_changed_retry");
    return { records, complete: true, total };
  }
  async function pageData(kind, owner, page, project, extra = {}) {
    const total = await count(kind, owner, extra),
      records = await rows(kind, owner, page, extra);
    return {
      status: "available",
      items: records.map(project),
      pagination: {
        page,
        page_size: PAGE_SIZE,
        total,
        has_more: (page + 1) * PAGE_SIZE < total,
      },
      snapshot: false,
    };
  }
  return {
    async read(token, input = {}) {
      const args = validateCompanionInput(input),
        link = await authorize(token),
        owner = link.user_id;
      const identity = await fingerprint(owner);
      if (!fingerprintValid(identity)) deny(502, "identity_unavailable");
      let data;
      if (args.section === "cards")
        data = await pageData(
          args.source,
          owner,
          args.page,
          projectCard,
          args.set_id ? { set_id: args.set_id } : {},
        );
      else if (args.section === "wishlist")
        data = await pageData("wishlist", owner, args.page, projectCard);
      else if (args.section === "binders") {
        data = await pageData("binders", owner, args.page, (row) => ({
          name: text(row.name),
          theme: text(row.theme),
          capacity: number(row.capacity),
          set_id: text(row.set_id),
        }));
        data.contents_status = "unavailable";
        data.contents_reason = "canonical_binder_membership_adapter_required";
      } else if (args.section === "achievements")
        data = await pageData("badges", owner, args.page, (row) => ({
          region: text(row.region),
          generation: number(row.gen),
          badge_index: number(row.badge_index),
          badge_name: text(row.badge_name),
          species_collected: number(row.species_collected),
          earned_at: text(row.earned_at),
        }));
      else if (args.section === "collector_score") {
        const values = await rows("ranking", owner, 0),
          row = values[0];
        data = row
          ? {
              status: "available",
              total_score: number(row.total_score),
              card_count: number(row.card_count),
              average_score: number(row.avg_score),
              top_card_name: text(row.top_card_name),
              top_card_score: number(row.top_card_score),
              as_of: text(row.updated_date),
              basis: "stored_carefa_ranking_not_recalculated",
            }
          : unavailable("ranking_not_calculated");
      } else if (args.section === "overview") {
        const [owned, entries, wishlist] = await Promise.all([
          all("owned_cards", owner),
          count("collection_entries", owner),
          count("wishlist", owner),
        ]);
        const saved = { gbp: 0, usd: 0, priced_gbp: 0, priced_usd: 0 };
        if (owned.complete)
          for (const row of owned.records) {
            const card = projectCard(row);
            for (const currency of ["gbp", "usd"])
              if (card["avg_value_" + currency] !== null) {
                saved[currency] +=
                  card["avg_value_" + currency] * card.quantity;
                saved["priced_" + currency]++;
              }
          }
        data = {
          status: "available",
          owned_user_card_records: owned.total,
          collection_entry_records: entries,
          wishlist_records: wishlist,
          owned_copies: owned.complete
            ? owned.records.reduce((n, c) => n + quantity(c.quantity), 0)
            : null,
          languages: owned.complete
            ? [
                ...new Set(
                  owned.records.map((c) => text(c.language)).filter(Boolean),
                ),
              ].sort()
            : null,
          saved_price_estimate: owned.complete
            ? {
                basis: "saved_UserCard_unit_prices_times_quantity",
                gbp:
                  owned.total && !saved.priced_gbp
                    ? null
                    : Math.round(saved.gbp * 100) / 100,
                usd:
                  owned.total && !saved.priced_usd
                    ? null
                    : Math.round(saved.usd * 100) / 100,
                priced_records_gbp: saved.priced_gbp,
                priced_records_usd: saved.priced_usd,
                total_records: owned.total,
                market_freshness: "unknown",
                dashboard_parity: false,
              }
            : unavailable("collection_exceeds_bounded_scan"),
          sources_combined: false,
          canonical_collection_value: unavailable(
            "canonical_read_only_valuation_adapter_required",
          ),
        };
      } else if (args.section === "sets") {
        const owned = await all("owned_cards", owner, { set_id: args.set_id });
        const catalogue = repository.canonicalSet
          ? await repository.canonicalSet(args.set_id)
          : null;
        if (!owned.complete || !catalogue?.complete)
          data = {
            ...unavailable("complete_canonical_set_catalogue_required"),
            owned_records: owned.total,
            missing_cards: null,
            completion_percent: null,
          };
        else {
          // Canonical adapter supplies matching printing keys (language + variant rules included).
          if (
            !Array.isArray(catalogue.cards) ||
            catalogue.cards.some((c) => typeof c.key !== "string") ||
            typeof catalogue.keyForOwned !== "function"
          )
            deny(502, "invalid_catalogue");
          const have = new Set(owned.records.map(catalogue.keyForOwned));
          const unique = [
            ...new Map(catalogue.cards.map((c) => [c.key, c])).values(),
          ];
          const missing = unique.filter((c) => !have.has(c.key));
          data = {
            status: "available",
            set_id: args.set_id,
            total_printings: unique.length,
            owned_printings: unique.length - missing.length,
            completion_percent: unique.length
              ? Math.round(
                  (10000 * (unique.length - missing.length)) / unique.length,
                ) / 100
              : null,
            missing_cards: missing
              .slice(args.page * PAGE_SIZE, (args.page + 1) * PAGE_SIZE)
              .map(projectCard),
            missing_total: missing.length,
            pagination: {
              page: args.page,
              page_size: PAGE_SIZE,
              has_more: (args.page + 1) * PAGE_SIZE < missing.length,
            },
            basis: text(catalogue.version),
          };
        }
      } else {
        // Never invoke ranking upserts, badge reconciliation, or guessed type/name rules.
        const snapshot = repository.canonicalProgress
          ? await repository.canonicalProgress(owner, args.section)
          : null;
        data = snapshot
          ? projectProgress(snapshot, args.section)
          : unavailable("canonical_read_only_progress_adapter_required");
      }
      // Recheck after reads: consent/link revocation during I/O must discard the data.
      const finalLink = await authorize(token);
      if (finalLink.user_id !== owner) deny(401, "invalid_token");
      return {
        schema_version: "carefa-companion-v1",
        read_only: true,
        collector_fingerprint: identity,
        section: args.section,
        data,
      };
    },
  };
}
function projectProgress(snapshot, section) {
  if (
    !plain(snapshot) ||
    snapshot.status !== "available" ||
    typeof snapshot.version !== "string" ||
    !Array.isArray(snapshot.items)
  )
    return unavailable("invalid_canonical_progress");
  const allowed =
    section === "regional_progress"
      ? ["region", "collected", "total", "percent"]
      : ["name", "collected", "total", "percent", "tier", "target"];
  return {
    status: "available",
    basis: text(snapshot.version),
    items: snapshot.items.slice(0, 1025).map((row) =>
      Object.fromEntries(
        allowed.flatMap((key) => {
          const value =
            typeof row[key] === "number" ? number(row[key]) : text(row[key]);
          return value === undefined ? [] : [[key, value]];
        }),
      ),
    ),
  };
}
