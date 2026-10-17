export async function issueTokenPair(pool, first, second) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of [first, second]) {
      await client.query('INSERT INTO oauth_sessions (token_hash, token_kind, client_id, grant_id, payload_ciphertext, expires_at) VALUES ($1,$2,$3,$4,$5,$6)', [item.tokenHash, item.kind, item.clientId, item.grantId, item.ciphertext, item.expiresAt]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
