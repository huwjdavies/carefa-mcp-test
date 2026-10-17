import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createDurableGrants } from './durable-grants.mjs';

const databaseUrl = process.env.DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

integration('PostgreSQL stores independent collector grants across adapter restarts', async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({connectionString: databaseUrl, max:2});
  const encryptionKey = process.env.OAUTH_SESSION_ENCRYPTION_KEY;
  assert.ok(encryptionKey, 'encryption key required');
  const grants = createDurableGrants({pool,encryptionKey});
  const resource = 'https://integration.example.test/mcp';
  const a = 'collector-A-' + randomBytes(16).toString('hex');
  const b = 'collector-B-' + randomBytes(16).toString('hex');
  let tokensA, tokensB, nextA;
  try {
    tokensA = await grants.issue({clientId:'integration-client',linkToken:a,resource});
    tokensB = await grants.issue({clientId:'integration-client',linkToken:b,resource});
    assert.equal((await grants.authenticate(tokensA.access_token,resource)).linkToken,a);
    assert.equal((await grants.authenticate(tokensB.access_token,resource)).linkToken,b);
    const restarted = createDurableGrants({pool,encryptionKey});
    assert.equal((await restarted.authenticate(tokensA.access_token,resource)).linkToken,a);
    nextA = await restarted.refresh({refreshToken:tokensA.refresh_token,clientId:'integration-client',resource});
    assert.ok(nextA);
    assert.equal(await restarted.refresh({refreshToken:tokensB.refresh_token,clientId:'wrong-client',resource}),null);
    assert.equal(await restarted.authenticate(tokensA.access_token,'https://wrong.example.test/mcp'),null);
    assert.equal((await restarted.authenticate(nextA.access_token,resource)).linkToken,a);
    assert.equal(await restarted.refresh({refreshToken:tokensA.refresh_token,clientId:'integration-client',resource}),null);
    assert.equal((await restarted.authenticate(tokensB.access_token,resource)).linkToken,b);
    await restarted.revoke(nextA.refresh_token,'integration-client');
    assert.equal(await restarted.authenticate(nextA.access_token,resource),null);
    assert.equal((await restarted.authenticate(tokensB.access_token,resource)).linkToken,b);
  } finally {
    await pool.query('DELETE FROM oauth_sessions WHERE token_hash = ANY($1)', [[tokensA?.access_token,tokensA?.refresh_token,tokensB?.access_token,tokensB?.refresh_token,nextA?.access_token,nextA?.refresh_token].filter(Boolean).map(t=>requireDigest(t))]).catch(()=>{});
    await pool.end();
  }
});
integration('simultaneous refresh is single-use and collector-scoped', async () => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const grants = createDurableGrants({ pool, encryptionKey: process.env.OAUTH_SESSION_ENCRYPTION_KEY });
  const resource = 'https://concurrency.example.test/mcp';
  const clientId = 'concurrency-test';
  let a, b, winner;
  try {
    a = await grants.issue({ clientId, linkToken: 'A-' + randomBytes(32).toString('hex'), resource });
    b = await grants.issue({ clientId, linkToken: 'B-' + randomBytes(32).toString('hex'), resource });
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      grants.refresh({ refreshToken: a.refresh_token, clientId, resource })));
    assert.equal(results.filter(Boolean).length, 1);
    winner = results.find(Boolean);
    assert.ok(await grants.authenticate(winner.access_token, resource));
    assert.ok(await grants.authenticate(b.access_token, resource));
    await grants.revoke(winner.refresh_token, clientId);
    assert.equal(await grants.authenticate(winner.access_token, resource), null);
    assert.ok(await grants.authenticate(b.access_token, resource));
  } finally {
    const hashes = [a?.access_token, a?.refresh_token, b?.access_token, b?.refresh_token,
      winner?.access_token, winner?.refresh_token].filter(Boolean).map(requireDigest);
    await pool.query('DELETE FROM oauth_sessions WHERE token_hash = ANY($1)', [hashes]);
    await pool.end();
  }
});
function requireDigest(value) { return createHash('sha256').update(value).digest('base64url'); }
