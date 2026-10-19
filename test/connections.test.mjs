import test from "node:test";
import assert from "node:assert/strict";
import {
  connectionView,
  chatgptListingUrl,
} from "../companion/connections.mjs";
import { createConnectionController } from "../companion/connection-controller.mjs";
const consent = {
  created_by_id: "a",
  provider: "ChatGPT",
  permission_granted: true,
  consent_version: "2",
};
const link = {
  id: "a-link",
  user_id: "a",
  provider: "ChatGPT",
  status: "active",
  scope: "collection:read",
  consent_version: "2",
  access_expires_at: new Date(Date.now() + 3600000).toISOString(),
};
test("consent or a pending link alone cannot produce Connected status", () => {
  assert.equal(connectionView({ consent }).status, "awaiting_chatgpt");
  assert.equal(
    connectionView({ consent, links: [link] }).status,
    "awaiting_verification",
  );
  assert.equal(
    connectionView({
      consent,
      links: [{ ...link, client_verified_at: new Date().toISOString() }],
    }).status,
    "connected",
  );
  assert.notEqual(
    connectionView({
      consent: { ...consent, permission_granted: false },
      links: [link],
    }).status,
    "connected",
  );
  for (const change of [
    { status: "revoked" },
    { scope: "collection:write" },
    { access_expires_at: new Date(0).toISOString() },
  ])
    assert.notEqual(
      connectionView({
        consent,
        links: [
          { ...link, client_verified_at: new Date().toISOString(), ...change },
        ],
      }).status,
      "connected",
    );
});
test("launch uses only an actual configured ChatGPT listing and never implies automatic installation", () => {
  for (const url of [
    "https://evil.example/plugins/x",
    "https://chatgpt.com.evil.example/plugins/x",
    "javascript:alert(1)",
    "https://chatgpt.com/plugins/x?redirect=evil",
    "https://name:pass@chatgpt.com/plugins/x",
    "https://chatgpt.com/settings",
  ])
    assert.equal(chatgptListingUrl(url), null);
  assert.equal(
    connectionView({
      listingUrl: "https://chatgpt.com/plugins/example",
      publicReady: false,
    }).listing_url,
    null,
  );
  assert.equal(
    connectionView({
      listingUrl: "https://chatgpt.com/plugins/example",
      publicReady: true,
    }).available,
    true,
  );
});
test("first-party management never accepts AI-supplied owner selection or a foreign connection", async () => {
  const revoked = [];
  const controller = createConnectionController({
    repository: {
      linksForOwner: async () => [link],
      latestConsent: async () => consent,
      revokeOwnLink: async (...args) => revoked.push(args),
    },
  });
  await assert.rejects(
    controller("", { action: "status" }),
    (e) => e.status === 401,
  );
  await assert.rejects(
    controller("a", { action: "status", user_id: "b" }),
    (e) => e.status === 400,
  );
  await assert.rejects(
    controller("a", { action: "disconnect", connection_id: "b-link" }),
    (e) => e.status === 404,
  );
  assert.deepEqual(revoked, []);
  await controller("a", { action: "disconnect", connection_id: "a-link" });
  assert.deepEqual(revoked, [["a", "a-link"]]);
});

test("all requested connection states are truthful, including expired and failed flows", () => {
  const now = Date.now(),
    future = new Date(now + 60000).toISOString();
  const pending = { ...link, status: "pending", expires_at: future };
  const view = (links) => connectionView({ links, consent, now });
  assert.equal(connectionView({ links: [], now }).status, "not_connected");
  assert.equal(view([pending]).status, "awaiting_authorisation");
  assert.equal(
    view([{ ...pending, status: "approved" }]).status,
    "awaiting_verification",
  );
  assert.equal(
    view([{ ...link, access_expires_at: new Date(0).toISOString() }]).status,
    "expired",
  );
  assert.equal(view([{ ...link, status: "revoked" }]).status, "disconnected");
  assert.equal(
    view([{ ...link, status: "failed" }]).status,
    "connection_failed",
  );
  assert.notEqual(
    view([{ ...link, client_verified_at: future }]).status,
    "connected",
  );
  assert.equal(view([link]).connection_id, link.id);
});
