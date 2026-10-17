import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
  let tokensA, tokensB;
  try {
    tokensA = await grants.issue({clientId:'integration-client',linkToken:a,resource});
    tokensB = await grants.issue({clientId:'integration-client',linkToken:b,resource});
    assert.equal((await grants.authenticate(tokensA.access_token,resource)).linkToken,a);
    assert.equal((await grants.authenticate(tokensB.access_token,resource)).linkToken,b);
    const restarted = createDurableGrants({pool,encryptionKey});
    assert.equal((await restarted.authenticate(tokensA.access_token,resource)).linkToken,a);
    const nextA = await restarted.refresh({refreshToken:tokensA.refresh_token,clientId:'integration-client',resource});
    assert.ok(nextA);
    assert.equal((await restarted.authenticate(nextA.access_token,resource)).linkToken,a);
    assert.equal(await restarted.refresh({refreshToken:tokensA.refresh_token,clientId:'integration-client',resource}),null);
    assert.equal((await restarted.authenticate(tokensB.access_token,resource)).linkToken,b);
    await restarted.revoke(nextA.refresh_token,'integration-client');
    assert.equal(await restarted.authenticate(nextA.access_token,resource),null);
    assert.equal((await restarted.authenticate(tokensB.access_token,resource)).linkToken,b);
  } finally {
    await pool.query('DELETE FROM oauth_sessions WHERE token_hash = ANY($1)', [[tokensA?.access_token,tokensA?.refresh_token,tokensB?.access_token,tokensB?.refresh_token].filter(Boolean).map(t=>requireDigest(t))]).catch(()=>{});
    await pool.end();
  }
});
function requireDigest(value) { return value; }
