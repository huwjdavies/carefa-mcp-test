export const companionLinkView = (row) =>
  row && {
    id: row.id,
    user_id: row.owner_id,
    provider: "ChatGPT",
    status: row.state,
    scope: row.scope,
    consent_version: row.consent_version,
    ...(row.consent_generation == null
      ? {}
      : { consent_generation: String(row.consent_generation) }),
    expires_at: row.expires_at?.toISOString(),
    access_expires_at: row.access_expires_at?.toISOString(),
    client_verified_at: row.verified_at?.toISOString(),
    collector_fingerprint: row.fingerprint,
    created_at: row.created_at?.toISOString(),
  };

// PostgreSQL is authoritative for NEW V1 connection metadata only. No collection writes.
export function createCompanionLinkStore(pool) {
  const view = companionLinkView;
  return {
    async begin({ id, owner, callbackUrl, expiresAt }) {
      await pool.query(
        `INSERT INTO companion_links
        (id,owner_id,callback_url,state,scope,consent_version,expires_at)
        VALUES($1,$2,$3,'pending','collection:read','2',$4)`,
        [id, owner, callbackUrl, expiresAt],
      );
    },
    async pendingForOwner(owner, id) {
      const r = await pool.query(
        "SELECT * FROM companion_links WHERE owner_id=$1 AND id=$2 AND state='pending' AND expires_at>now()",
        [owner, id],
      );
      return view(r.rows[0]) ?? null;
    },
    async approve({ id, owner, codeHash }) {
      const r = await pool.query(
        `UPDATE companion_links SET state='approved',code_hash=$3,approved_at=now(),expires_at=LEAST(expires_at,now()+interval '60 seconds')
        WHERE id=$1 AND owner_id=$2 AND state='pending' AND expires_at>now() RETURNING callback_url`,
        [id, owner, codeHash],
      );
      return r.rows[0]?.callback_url ?? null;
    },
    async deny({ id, owner }) {
      const r = await pool.query(
        `UPDATE companion_links SET state='denied'
        WHERE id=$1 AND owner_id=$2 AND state='pending' AND expires_at>now() RETURNING callback_url`,
        [id, owner],
      );
      return r.rows[0]?.callback_url ?? null;
    },
    async redeem({ codeHash, callbackUrl, tokenHash, accessExpiresAt }) {
      // A single conditional UPDATE locks the matching row. Concurrent waiters re-evaluate
      // state='approved' after the winner commits, therefore exactly one can return a row.
      const r = await pool.query(
        `UPDATE companion_links SET state='active',token_hash=$3,
        access_expires_at=$4,activated_at=now() WHERE code_hash=$1 AND callback_url=$2
        AND state='approved' AND expires_at>now() RETURNING *`,
        [codeHash, callbackUrl, tokenHash, accessExpiresAt],
      );
      return view(r.rows[0]) ?? null;
    },
    async resolve(tokenHash) {
      const r = await pool.query(
        `SELECT * FROM companion_links WHERE token_hash=$1
        AND state='active' AND access_expires_at>now()`,
        [tokenHash],
      );
      const row = r.rows[0];
      return row ? { ...view(row), token_hash: row.token_hash } : null;
    },
    async verify({ tokenHash, fingerprint }) {
      const r = await pool.query(
        `UPDATE companion_links SET verified_at=now(),fingerprint=$2
        WHERE token_hash=$1 AND state='active' AND access_expires_at>now()
        AND (fingerprint IS NULL OR fingerprint=$2) RETURNING id`,
        [tokenHash, fingerprint],
      );
      return r.rowCount === 1;
    },
    async linksForOwner(owner) {
      const r = await pool.query(
        "SELECT * FROM companion_links WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 101",
        [owner],
      );
      if (r.rows.length > 100) throw Error("Connection limit requires review");
      return r.rows.map(view);
    },
    async failOwnLink(owner, id) {
      await pool.query(
        "UPDATE companion_links SET state='failed' WHERE owner_id=$1 AND id=$2 AND state='active'",
        [owner, id],
      );
    },
    async revokeOwnLink(owner, id) {
      const r = await pool.query(
        `UPDATE companion_links SET state='revoked',revoked_at=now()
        WHERE owner_id=$1 AND id=$2 RETURNING id`,
        [owner, id],
      );
      return r.rowCount === 1;
    },
  };
}
