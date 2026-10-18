// Staged Base44 read adapter: no create/update/delete or generic AI-selected entity.
const ENTITIES = {
  user_cards: ["UserCard", "created_by_id"],
  owned_cards: ["UserCard", "created_by_id"],
  collection_entries: ["CollectionEntry", "created_by_id"],
  wishlist: ["UserCard", "created_by_id"],
  binders: ["Binder", "created_by_id"],
  badges: ["GymBadgeAchievement", "user_id"],
  ranking: ["CollectorRanking", "user_id"],
};
const values = (result) => (Array.isArray(result) ? result : result?.items);
export function createBase44ReadRepository(entities, canonical = {}) {
  function query(kind, owner, extra = {}) {
    const mapping = ENTITIES[kind];
    if (!mapping || !owner) throw Error("Invalid read target");
    const [name, key] = mapping,
      filter = { [key]: owner };
    if (kind === "wishlist") filter.is_looking_for = true;
    if (kind === "owned_cards") filter.is_looking_for = { $ne: true };
    if (extra.set_id) filter.set_id = extra.set_id;
    return { entity: entities[name], filter };
  }
  return {
    async findLink(tokenHash) {
      const rows = values(
        await entities.AiAccessLink.filter(
          { token_hash: tokenHash, status: "active" },
          "id",
          2,
          0,
        ),
      );
      if (!rows || rows.length !== 1) return null;
      return rows[0];
    },
    async latestConsent(owner) {
      const rows = values(
        await entities.AICompanionConsent.filter(
          { created_by_id: owner, provider: "ChatGPT" },
          "-updated_date",
          2,
          0,
        ),
      );
      return rows?.[0] ?? null;
    },
    async count(kind, owner, extra) {
      const { entity, filter } = query(kind, owner, extra);
      return entity.count(filter);
    },
    async page(kind, owner, { page, limit, ...extra }) {
      const { entity, filter } = query(kind, owner, extra);
      return values(await entity.filter(filter, "id", limit, page * limit));
    },
    canonicalSet: canonical.canonicalSet,
    canonicalProgress: canonical.canonicalProgress,
  };
}
