import test from 'node:test';
import assert from 'node:assert/strict';
import {collectorFingerprint,sameCollectorFingerprint} from './account-fingerprint.mjs';
const secret='development-test-secret-32-bytes-minimum';
test('same collector has stable diagnostic fingerprint',()=>{
  const a=collectorFingerprint('user-1',secret);
  assert.equal(a,collectorFingerprint('user-1',secret));
  assert.ok(a.startsWith('collector-v1-'));
  assert.ok(!a.includes('user-1'));
});
test('different collectors cannot be confused by diagnostic fingerprint',()=>{
  const a=collectorFingerprint('user-1',secret);
  const b=collectorFingerprint('user-2',secret);
  assert.notEqual(a,b);
  assert.equal(sameCollectorFingerprint(a,b),false);
  assert.equal(sameCollectorFingerprint(a,a),true);
});
test('fingerprint is secret-dependent and rejects weak input',()=>{
  assert.notEqual(collectorFingerprint('user-1',secret),collectorFingerprint('user-1',secret+'-different'));
  assert.throws(()=>collectorFingerprint('user-1','short'));
  assert.throws(()=>collectorFingerprint('',secret));
});
