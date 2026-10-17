import { createHash } from 'node:crypto';
import { createSessionCrypto } from './session-crypto.mjs';

// Durable one-time OAuth handshake records; hashes only for lookup, encrypted payloads.
export function createHandshakeStore(pool, encryptionKey, now = Date.now) {
  const crypto = createSessionCrypto(encryptionKey);
  const digest = value => createHash('sha256').update(value).digest('base64url');
  const allowed = new Set(['pending', 'code']);
  return {
    async put(kind, secret, clientId, payload, expiresAt) {
      if (!allowed.has(kind) || !secret || !clientId) throw new Error('Invalid handshake');
      await pool.query(
        'INSERT INTO oauth_sessions (token_hash,token_kind,client_id,grant_id,payload_ciphertext,expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [digest(secret),kind,clientId,digest(secret),crypto.encrypt(payload),new Date(expiresAt)]);
    },
    async consume(kind, secret) {
      if (!allowed.has(kind) || typeof secret !== 'string' || !secret) return null;
      const result = await pool.query(
        "UPDATE oauth_sessions SET consumed_at=now() WHERE token_hash=$1 AND token_kind=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING client_id,payload_ciphertext",
        [digest(secret),kind]);
      const row = result.rows[0];
      return row ? { clientId: row.client_id, payload: crypto.decrypt(row.payload_ciphertext) } : null;
    }
  };
}
