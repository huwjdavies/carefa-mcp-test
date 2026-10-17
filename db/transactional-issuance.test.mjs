import test from 'node:test';
import assert from 'node:assert/strict';
import { issueTokenPair } from './transactional-issuance.mjs';

const record = name => ({
  tokenHash: name, kind: name, clientId: 'client', grantId: 'grant',
  ciphertext: Buffer.from(name), expiresAt: new Date(Date.now() + 60000)
});

function fakePool(failSecond = false) {
  const calls = [];
  let inserts = 0;
  return {
    calls,
    async connect() {
      return {
        async query(sql) {
          calls.push(sql);
          if (sql.startsWith('INSERT') && ++inserts === 2 && failSecond) throw Error('simulated failure');
        },
        release() { calls.push('RELEASE'); }
      };
    }
  };
}

test('both credentials commit together', async () => {
  const pool = fakePool();
  await issueTokenPair(pool, record('access'), record('refresh'));
  assert.equal(pool.calls.filter(sql => sql.startsWith('INSERT')).length, 2);
  assert.ok(pool.calls.includes('COMMIT'));
  assert.ok(!pool.calls.includes('ROLLBACK'));
});

test('failure of second credential rolls back the whole transaction', async () => {
  const pool = fakePool(true);
  await assert.rejects(issueTokenPair(pool, record('access'), record('refresh')), /simulated failure/);
  assert.ok(pool.calls.includes('ROLLBACK'));
  assert.ok(!pool.calls.includes('COMMIT'));
  assert.equal(pool.calls.at(-1), 'RELEASE');
});
