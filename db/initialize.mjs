import { readFile } from 'node:fs/promises';
import { createDurableGrants } from './durable-grants.mjs';

// Opt-in only. A configured deployment must use durable storage or fail to start.
// No automatic fallback to ephemeral memory after database errors.
export async function initializeDurableGrants(env = process.env) {
  if (env.OAUTH_STORAGE_MODE !== 'postgres') {
    if (env.OAUTH_STORAGE_MODE && env.OAUTH_STORAGE_MODE !== 'memory') {
      throw new Error('Unsupported OAuth storage mode');
    }
    if (env.NODE_ENV === 'production') {
      throw new Error('Production requires durable PostgreSQL OAuth storage');
    }
    return null;
  }
  if (!env.DATABASE_URL || !env.OAUTH_SESSION_ENCRYPTION_KEY) {
    throw new Error('Postgres OAuth mode requires DATABASE_URL and OAUTH_SESSION_ENCRYPTION_KEY');
  }
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ssl: env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined,
  });
  try {
    const client = await pool.connect();
    try {
      const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
      await client.query('BEGIN');
      await client.query(schema);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const grants = createDurableGrants({
      pool, encryptionKey: env.OAUTH_SESSION_ENCRYPTION_KEY
    });
    return { grants, pool };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
