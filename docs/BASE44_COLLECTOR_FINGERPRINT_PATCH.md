# CAREFA Base44 collector identity patch (NOT APPLIED TO LIVE APP)

## Purpose
Distinguish the two independently authenticated collectors during OAuth A/B verification without sharing names, emails, credentials, or raw Base44 user IDs. This is diagnostic metadata, **not authorization**.

## Server-only secret
Provision a separate `CAREFA_ACCOUNT_FINGERPRINT_SECRET` (>=32 unpredictable bytes). Do not reuse bridge, OAuth encryption, or client secrets. Rotate under an explicit migration plan because changing it changes identifiers.

## Shared helper in Base44
In `base44/shared/collectorFingerprint.ts`, implement:

```ts
import { secrets } from 'base44:runtime';

export async function collectorFingerprint(userId: string): Promise<string> {
  if (!userId || typeof userId !== 'string') throw new Error('Missing user ID');
  const secret = secrets.get('CAREFA_ACCOUNT_FINGERPRINT_SECRET');
  if (!secret || new TextEncoder().encode(secret).length < 32) throw new Error('Identity fingerprint not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode('carefa-collector-v1\\0' + userId)));
  const base64url = btoa(String.fromCharCode(...mac)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  return 'collector-v1-' + base64url.slice(0, 22);
}
```

## Collection endpoint (both paths)
In `base44/functions/carefaAiConnect/entry.ts`, import helper and replace only the two instances of `user: { authenticated: true }`:
- Bridge-authenticated path: `user: { authenticated: true, collector_fingerprint: await collectorFingerprint(link.user_id) }`.
- Signed-in user path: `user: { authenticated: true, collector_fingerprint: await collectorFingerprint(user.id) }`.

**Do not change** the existing `created_by_id: link.user_id` filters, consent checks, bridge-secret verification, link-token lookup, or RLS. Never return `user.id`, `link.user_id`, email, or fingerprint secret.

## Tests before rollout
1. Two test users get distinct stable fingerprints across calls.
2. A second connection authorised while user A is logged in reports user A's fingerprint, making wrong-account sign-in visible.
3. Each account's card count remains isolated; confirm 7,291 vs 203 only after both users separately consent.
4. A revoked link cannot read identity or collection.
5. Unconfigured fingerprint secret fails closed in the isolated branch.
6. Verify Base44 runtime supports `crypto.subtle` and `btoa` before deploying.

## Deployment gate
This patch is a proposal only. Apply and test on a dedicated Base44 branch first; do not publish the live app or modify production secrets without explicit approval.
