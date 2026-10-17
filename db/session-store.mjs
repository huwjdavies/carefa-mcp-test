// Isolated development adapter. Requires an injected pg Pool, never connects on import.
// payload_ciphertext must be encrypted by the caller before storage.
export function createSessionStore(pool) {
  if (!pool?.connect) throw new TypeError('A PostgreSQL connection pool is required');
  return {
    async put({ tokenHash, kind, clientId, grantId, ciphertext, expiresAt }) {
      await pool.query(
        'INSERT INTO oauth_sessions (token_hash,token_kind,client_id,grant_id,payload_ciphertext,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [tokenHash,kind,clientId,grantId,ciphertext,expiresAt]);
    },
    async get(tokenHash) {
      const result = await pool.query(
        'SELECT token_kind,client_id,grant_id,payload_ciphertext,expires_at,consumed_at FROM oauth_sessions WHERE token_hash=$1 AND expires_at>now() AND consumed_at IS NULL',
        [tokenHash]);
      return result.rows[0] ?? null;
    },
    async rotate({ oldHash, clientId, newAccess, newRefresh }) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        const consumed = await connection.query(
          'UPDATE oauth_sessions SET consumed_at=now() WHERE token_hash=$1 AND client_id=$2 AND token_kind=$3 AND consumed_at IS NULL AND expires_at>now() RETURNING grant_id',
          [oldHash,clientId,'refresh']);
        if (consumed.rowCount !== 1) { await connection.query('ROLLBACK'); return false; }
        if (consumed.rows[0].grant_id !== newAccess.grantId || newAccess.grantId !== newRefresh.grantId) {
          await connection.query('ROLLBACK'); return false;
        }
        for (const session of [newAccess,newRefresh]) {
          await connection.query(
            'INSERT INTO oauth_sessions (token_hash,token_kind,client_id,grant_id,payload_ciphertext,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
            [session.tokenHash,session.kind,clientId,session.grantId,session.ciphertext,session.expiresAt]);
        }
        await connection.query('COMMIT');
        return true;
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally { connection.release(); }
    },
    async revokeGrant(grantId, clientId) {
      await pool.query('UPDATE oauth_sessions SET consumed_at=now() WHERE grant_id=$1 AND client_id=$2 AND consumed_at IS NULL', [grantId,clientId]);
    },
    async prune() {
      await pool.query('DELETE FROM oauth_sessions WHERE expires_at<now()');
    }
  };
}
