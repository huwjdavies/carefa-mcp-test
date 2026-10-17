import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// Key must be a randomly generated 32-byte secret supplied through a server-only env var.
export function createSessionCrypto(base64Key) {
  const key = Buffer.from(base64Key || '', 'base64');
  if (key.length !== 32) throw new Error('OAUTH_SESSION_ENCRYPTION_KEY must decode to 32 bytes');
  return {
    encrypt(payload) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
      return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), data]);
    },
    decrypt(blob) {
      const data = Buffer.from(blob);
      if (data.length < 29 || data[0] !== 1) throw new Error('Invalid session ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(1, 13));
      decipher.setAuthTag(data.subarray(13, 29));
      return JSON.parse(Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]).toString('utf8'));
    }
  };
}
