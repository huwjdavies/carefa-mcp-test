import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSessionCrypto } from './session-crypto.mjs';

test('session payload round trip', () => {
  const cipher = createSessionCrypto(randomBytes(32).toString('base64'));
  assert.deepEqual(cipher.decrypt(cipher.encrypt({linkToken:'private'})), {linkToken:'private'});
});
test('ciphertext tampering is rejected', () => {
  const cipher = createSessionCrypto(randomBytes(32).toString('base64'));
  const bytes = cipher.encrypt({linkToken:'private'});
  bytes[bytes.length-1] ^= 1;
  assert.throws(() => cipher.decrypt(bytes));
});
test('wrong encryption key is rejected', () => {
  const first = createSessionCrypto(randomBytes(32).toString('base64'));
  const second = createSessionCrypto(randomBytes(32).toString('base64'));
  assert.throws(() => second.decrypt(first.encrypt({linkToken:'private'})));
});
test('invalid key length is rejected', () => {
  assert.throws(() => createSessionCrypto('YWJj'));
});
