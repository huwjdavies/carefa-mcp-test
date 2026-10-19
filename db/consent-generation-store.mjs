// Extends the existing PostgreSQL link store; not a separate OAuth system.
import {
  createCompanionLinkStore,
  companionLinkView,
} from "./companion-link-store.mjs";
export function createConsentGenerationStore(pool) {
  const base = createCompanionLinkStore(pool);
  async function locked(owner, fn) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "INSERT INTO companion_consents(owner_id) VALUES($1) ON CONFLICT DO NOTHING",
        [owner],
      );
      const row = (
        await db.query(
          "SELECT * FROM companion_consents WHERE owner_id=$1 FOR UPDATE",
          [owner],
        )
      ).rows[0];
      const result = await fn(db, row);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  const generation = (row) => row && String(row.generation);
  const consent = (row) =>
    row
      ? {
          created_by_id: row.owner_id,
          provider: "ChatGPT",
          permission_granted: row.permission_granted,
          consent_version: "2",
          consent_generation: generation(row),
        }
      : null;
  return {
    ...base,
    async currentConsent(owner) {
      return consent(
        (
          await pool.query(
            "SELECT * FROM companion_consents WHERE owner_id=$1",
            [owner],
          )
        ).rows[0],
      );
    },
    async begin(input) {
      return locked(input.owner, async (db, row) => {
        const count = Number(
          (
            await db.query(
              "SELECT count(*) FROM companion_links WHERE owner_id=$1 AND state IN ('pending','approved') AND expires_at>now()",
              [input.owner],
            )
          ).rows[0].count,
        );
        if (count >= 10) {
          const error = Error("Too many pending approvals");
          error.status = 429;
          error.code = "approval_limit";
          throw error;
        }
        await db.query(
          `INSERT INTO companion_links(id,owner_id,callback_url,state,scope,consent_version,expires_at,consent_generation)
      VALUES($1,$2,$3,'pending','collection:read','2',$4,$5)`,
          [
            input.id,
            input.owner,
            input.callbackUrl,
            input.expiresAt,
            row.generation,
          ],
        );
      });
    },
    async approveWithConsent({ id, owner, codeHash }) {
      return locked(owner, async (db, row) => {
        const changed = await db.query(
          `UPDATE companion_links SET state='approved',code_hash=$3,approved_at=now(),expires_at=LEAST(expires_at,now()+interval '60 seconds')
      WHERE id=$1 AND owner_id=$2 AND consent_generation=$4 AND state='pending' AND expires_at>now() RETURNING callback_url`,
          [id, owner, codeHash, row.generation],
        );
        if (changed.rowCount !== 1) return null;
        await db.query(
          "UPDATE companion_consents SET permission_granted=true,updated_at=now() WHERE owner_id=$1",
          [owner],
        );
        return changed.rows[0].callback_url;
      });
    },
    async withdraw(owner) {
      return locked(owner, async (db) => {
        await db.query(
          "UPDATE companion_consents SET generation=generation+1,permission_granted=false,updated_at=now() WHERE owner_id=$1",
          [owner],
        );
        await db.query(
          "UPDATE companion_links SET state='revoked',revoked_at=now() WHERE owner_id=$1 AND state IN ('pending','approved','active')",
          [owner],
        );
        return true;
      });
    },
    async redeem(input) {
      const found = await pool.query(
        "SELECT owner_id FROM companion_links WHERE code_hash=$1",
        [input.codeHash],
      );
      if (found.rowCount !== 1) return null;
      return locked(found.rows[0].owner_id, async (db, row) => {
        if (!row.permission_granted) return null;
        // Same owner-row lock as approval/withdrawal, plus the original single-use predicate.
        const r = await db.query(
          `UPDATE companion_links SET state='active',token_hash=$3,access_expires_at=$4,activated_at=now()
      WHERE code_hash=$1 AND callback_url=$2 AND state='approved' AND expires_at>now() AND consent_generation=$5 RETURNING *`,
          [
            input.codeHash,
            input.callbackUrl,
            input.tokenHash,
            input.accessExpiresAt,
            row.generation,
          ],
        );
        if (r.rowCount !== 1) return null;
        return companionLinkView(r.rows[0]);
      });
    },
    async resolve(tokenHash) {
      const r = await pool.query(
        `SELECT l.* FROM companion_links l JOIN companion_consents c ON c.owner_id=l.owner_id
     WHERE l.token_hash=$1 AND l.state='active' AND l.access_expires_at>now() AND c.permission_granted=true
     AND l.consent_generation=c.generation`,
        [tokenHash],
      );
      return r.rowCount === 1
        ? { ...companionLinkView(r.rows[0]), token_hash: r.rows[0].token_hash }
        : null;
    },
    async verify(input) {
      const found = await pool.query(
        "SELECT owner_id FROM companion_links WHERE token_hash=$1",
        [input.tokenHash],
      );
      if (found.rowCount !== 1) return false;
      return locked(found.rows[0].owner_id, async (db, row) => {
        const r = await db.query(
          `UPDATE companion_links SET verified_at=now(),fingerprint=$2 WHERE token_hash=$1
     AND state='active' AND access_expires_at>now() AND consent_generation=$3 AND $4=true
     AND (fingerprint IS NULL OR fingerprint=$2) RETURNING id`,
          [
            input.tokenHash,
            input.fingerprint,
            row.generation,
            row.permission_granted,
          ],
        );
        return r.rowCount === 1;
      });
    },
  };
}
