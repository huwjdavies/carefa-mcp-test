import test from "node:test";
import assert from "node:assert/strict";
import { isolatedCollectors, insertionPayloads } from "../fixtures/isolated-collectors.mjs";
test("offline lab collections are deterministic, disjoint and contain no ownership or authentication fields", () => {
  const fixture = isolatedCollectors();
  assert.deepEqual(fixture, isolatedCollectors());
  assert.equal(fixture["lab-a"].records.length, 9);
  assert.equal(fixture["lab-b"].records.length, 1200);
  assert.equal(fixture["lab-a"].records.reduce((n,r)=>n+r.quantity,0),9);
  assert.equal(fixture["lab-b"].records.reduce((n,r)=>n+r.quantity,0),2400);
  const a = new Set(fixture["lab-a"].records.map(r=>r.card_id));
  assert.ok(fixture["lab-b"].records.every(r=>!a.has(r.card_id)));
  for (const owner of ["lab-a","lab-b"]) for (const row of insertionPayloads(owner)) {
    assert.ok(!Object.keys(row).some(k=>/owner|user|created_by|email|token|password|secret|fixture_key/i.test(k)));
    assert.match(row.card_name,/^FICTIONAL /);
  }
  assert.throws(()=>insertionPayloads("production"));
  assert.throws(()=>insertionPayloads("__proto__"));
});
