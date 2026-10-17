import { createHmac, timingSafeEqual } from 'node:crypto';

// Diagnostic identifier only. Never use as authorization or as a replacement
// for server-side owner filtering. Secret must be separate from token encryption.
export function collectorFingerprint(userId, secret) {
  if (typeof userId !== 'string' || !userId.trim()) throw new Error('Missing collector identity');
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('Fingerprint secret too short');
  return 'collector-v1-' + createHmac('sha256', secret).update('carefa-collector-v1\0').update(userId).digest('base64url').slice(0,22);
}
export function sameCollectorFingerprint(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
