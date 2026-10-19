import test from "node:test";
import assert from "node:assert/strict";
import { companionFixture, digest } from "./companion.fixtures.mjs";
import { projectCompanionResult } from "../companion/tools.mjs";
import { createBase44ReadRepository } from "../companion/base44-repository.mjs";
const rejected = (promise, status) =>
  assert.rejects(promise, (error) => error.status === status);

test("fictional nine-card and 1200-card collectors have independent owner-scoped reads", async () => {
  const f = companionFixture(),
    a = await f.reader.read(f.tokens.a),
    b = await f.reader.read(f.tokens.b);
  assert.equal(a.data.owned_user_card_records, 9);
  assert.equal(b.data.owned_user_card_records, 1200);
  assert.notEqual(a.collector_fingerprint, b.collector_fingerprint);
  assert.equal(a.data.owned_copies, 10);
  assert.equal(a.data.saved_price_estimate.gbp, 25);
  assert.equal(a.data.sources_combined, false);
  assert.equal(a.data.collection_entry_records, 1);
  assert.equal(a.data.canonical_collection_value.status, "unavailable");
  assert.ok(f.calls.every((call) => ["a", "b"].includes(call.owner)));
});
test("card pagination is bounded and distinct, and excludes all private fields", async () => {
  const f = companionFixture(),
    first = await f.reader.read(f.tokens.b, { section: "cards" }),
    second = await f.reader.read(f.tokens.b, { section: "cards", page: 1 });
  assert.equal(first.data.items.length, 100);
  assert.equal(second.data.items.length, 100);
  assert.equal(first.data.pagination.total, 1200);
  assert.equal(first.data.pagination.has_more, true);
  assert.equal(
    new Set([...first.data.items, ...second.data.items].map((c) => c.card_id))
      .size,
    200,
  );
  for (const marker of [
    "PRIVATE",
    "private@example",
    "purchase_price",
    "notes",
    "created_by_id",
  ])
    assert.ok(!JSON.stringify(first).includes(marker));
});
test("no caller can choose an owner, entity, action or write operation", async () => {
  const f = companionFixture();
  for (const input of [
    { owner_id: "b" },
    { user_id: "b" },
    { created_by_id: "b" },
    { section: "messages" },
    { section: "profile" },
    { action: "delete" },
    { entity: "User" },
    { section: "cards", page: -1 },
    { section: "cards", source: "User" },
    null,
    [],
  ])
    await rejected(f.reader.read(f.tokens.a, input), 400);
  assert.equal(f.calls.length, 0);
});
test("missing, expired, revoked, wrong-scope and wrong-provider link authorisations are rejected", async () => {
  for (const mutate of [
    (link) => (link.status = "revoked"),
    (link) => (link.scope = "collection:write"),
    (link) => (link.provider = "Other"),
    (link) => (link.access_expires_at = "invalid"),
    (link) => (link.access_expires_at = new Date(0).toISOString()),
    (link) => (link.consent_version = "1"),
  ]) {
    const f = companionFixture();
    mutate(f.links.get(digest(f.tokens.a)));
    await rejected(f.reader.read(f.tokens.a), 401);
    assert.equal(f.calls.length, 0);
  }
  const f = companionFixture();
  for (const token of ["", undefined, "bad", "C".repeat(43)])
    await rejected(f.reader.read(token), 401);
});
test("consent is checked for the exact owner and requires the new explicit disclosure version", async () => {
  for (const change of [
    { permission_granted: false },
    { created_by_id: "b" },
    { provider: "Other" },
    { consent_version: "1" },
  ]) {
    const f = companionFixture();
    Object.assign(f.consents.get("a"), change);
    await rejected(f.reader.read(f.tokens.a), 403);
    assert.equal(f.calls.length, 0);
  }
});
test("a repository leaking a foreign row causes fail-closed rejection, not filtering after disclosure", async () => {
  const f = companionFixture();
  f.repository.page = async () => f.cards.b.slice(0, 1);
  await rejected(f.reader.read(f.tokens.a, { section: "cards" }), 502);
});
test("revocation or consent withdrawal during a read discards the result", async () => {
  for (const withdraw of [
    (f) => (f.links.get(digest(f.tokens.a)).status = "revoked"),
    (f) => (f.consents.get("a").permission_granted = false),
  ]) {
    const f = companionFixture(),
      original = f.repository.page;
    f.repository.page = async (...args) => {
      const rows = await original(...args);
      withdraw(f);
      return rows;
    };
    await assert.rejects(
      f.reader.read(f.tokens.a, { section: "cards" }),
      (error) => [401, 403].includes(error.status),
    );
  }
});
test("oversized scans and missing prices are unknown rather than misleading zero totals", async () => {
  const f = companionFixture({ reader: { maxScan: 10 } }),
    b = await f.reader.read(f.tokens.b);
  assert.equal(b.data.owned_copies, null);
  assert.equal(b.data.saved_price_estimate.status, "unavailable");
  for (const card of f.cards.a) delete card.avg_value_gbp;
  const a = await f.reader.read(f.tokens.a);
  assert.equal(a.data.saved_price_estimate.gbp, null);
});
test("wishlist, binder, stored Collector Score and gym badge reads remain projected and owner-scoped", async () => {
  const f = companionFixture();
  f.cards.a.push({
    id: "wishlist-a",
    created_by_id: "a",
    card_name: "Dream Card",
    is_looking_for: true,
  });
  assert.equal(
    (await f.reader.read(f.tokens.a, { section: "wishlist" })).data.items
      .length,
    1,
  );
  assert.equal(
    (await f.reader.read(f.tokens.a)).data.owned_user_card_records,
    9,
  );
  for (const section of ["binders", "collector_score", "achievements"]) {
    const value = await f.reader.read(f.tokens.a, { section });
    assert.equal(value.data.status, "available");
    assert.ok(!JSON.stringify(value).includes("PRIVATE"));
  }
});
test("canonical progress is unavailable until a read-only app adapter exists; it is never guessed", async () => {
  const f = companionFixture();
  for (const section of ["specialists", "type_mastery", "regional_progress"])
    assert.equal(
      (await f.reader.read(f.tokens.a, { section })).data.status,
      "unavailable",
    );
  assert.equal(
    (
      await f.reader.read(f.tokens.a, {
        section: "sets",
        set_id: "fictional-set",
      })
    ).data.missing_cards,
    null,
  );
});
test("a complete canonical set catalogue can provide exact missing printings without writes", async () => {
  const f = companionFixture({
    repository: {
      canonicalSet: async () => ({
        complete: true,
        version: "fictional-canonical-v1",
        keyForOwned: (c) => c.card_id,
        cards: Array.from({ length: 10 }, (_, i) => ({
          key: "printing-" + i,
          card_id: "printing-" + i,
          card_name: "Card " + i,
        })),
      }),
    },
  });
  const value = await f.reader.read(f.tokens.a, {
    section: "sets",
    set_id: "fictional-set",
  });
  assert.equal(value.data.completion_percent, 90);
  assert.equal(value.data.missing_total, 1);
  assert.equal(value.data.missing_cards[0].card_id, "printing-9");
});
test("MCP edge projection strips unexpected nested personal information", async () => {
  const f = companionFixture(),
    value = await f.reader.read(f.tokens.a, { section: "binders" });
  value.data.items[0].email = "private@example.test";
  value.data.items[0].theme = { secret: "PRIVATE" };
  value.secret = "PRIVATE";
  const result = projectCompanionResult(value, "binders");
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.ok(!JSON.stringify(result).includes("private@example"));
  assert.throws(() =>
    projectCompanionResult({ ...value, read_only: false }, "binders"),
  );
});
test("Base44 adapter always supplies an owner filter and positional pagination, and offers no writes", async () => {
  const calls = [],
    entity = new Proxy(
      {},
      {
        get: (_, method) => {
          if (method === "filter")
            return async (...args) => {
              calls.push(args);
              return [];
            };
          if (method === "count")
            return async (...args) => {
              calls.push(args);
              return 0;
            };
          throw Error("Writes are forbidden");
        },
      },
    );
  const entities = new Proxy({}, { get: () => entity }),
    repo = createBase44ReadRepository(entities);
  await repo.page("user_cards", "a", { page: 3, limit: 100 });
  await repo.count("badges", "a");
  await repo.count("wishlist", "a");
  assert.deepEqual(calls[0], [{ created_by_id: "a" }, "id", 100, 300]);
  assert.deepEqual(calls[1], [{ user_id: "a" }]);
  assert.equal(calls[2][0].is_looking_for, true);
  await assert.rejects(repo.page("User", "a", { page: 0, limit: 100 }));
});

test("MCP edge rejects oversized upstream pages", async () => {
  const f = companionFixture();
  const value = await f.reader.read(f.tokens.a, { section: "cards" });
  value.data.items = Array.from({ length: 101 }, () => ({
    card_name: "fictional",
  }));
  assert.throws(() => projectCompanionResult(value, "cards"));
});

test("binder metadata never claims to contain the collectors actual binder card placements", async () => {
  const f = companionFixture(),
    value = await f.reader.read(f.tokens.a, { section: "binders" }),
    edge = projectCompanionResult(value, "binders");
  assert.equal(edge.data.contents_status, "unavailable");
  assert.equal(
    edge.data.contents_reason,
    "canonical_binder_membership_adapter_required",
  );
  assert.equal(edge.data.items[0].theme, "Fire");
  assert.equal(edge.data.items[0].cards, undefined);
});
