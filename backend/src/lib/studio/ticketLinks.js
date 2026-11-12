/**
 * The ticket creator's public request link (Tomer, 11 Nov 2026): one permanent link per brand that anyone can use to
 * request a ticket without a CP login. Admins create, replace or turn it off; every ticket says who asked for it.
 * Its own table — studio_ticket_links is the Production Tracker's (TV tickets ↔ productions).
 */
const crypto = require('crypto');
const db = require('../../db');

async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS studio_request_links (
    token TEXT PRIMARY KEY, brand_id TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true, created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), uses INT NOT NULL DEFAULT 0, last_used_at TIMESTAMPTZ)`);
}

async function current(brandId) {
  await ensureTable();
  const { rows } = await db.query('SELECT token, created_by, created_at, uses, last_used_at FROM studio_request_links WHERE brand_id = $1 AND active ORDER BY created_at DESC LIMIT 1', [brandId]);
  return rows[0] || null;
}

/** A new link; the old one stops working. */
async function rotate(brandId, actor) {
  await ensureTable();
  await db.query('UPDATE studio_request_links SET active = false WHERE brand_id = $1', [brandId]);
  const token = crypto.randomBytes(18).toString('base64url');
  await db.query('INSERT INTO studio_request_links (token, brand_id, created_by) VALUES ($1, $2, $3)', [token, brandId, actor || null]);
  return current(brandId);
}

async function disable(brandId) {
  await ensureTable();
  await db.query('UPDATE studio_request_links SET active = false WHERE brand_id = $1', [brandId]);
  return { ok: true };
}

async function resolve(token) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ''))) return null;
  await ensureTable();
  const { rows } = await db.query('SELECT token, brand_id FROM studio_request_links WHERE token = $1 AND active', [token]);
  return rows[0] || null;
}

async function used(token) { await db.query('UPDATE studio_request_links SET uses = uses + 1, last_used_at = NOW() WHERE token = $1', [token]).catch(() => null); }

// Files uploaded through a link are only usable through that same link: "<uuid>.<signature>"
const key = () => crypto.createHash('sha256').update(`studio-ticket-files:${process.env.SETTINGS_SECRET || process.env.JWT_SECRET || ''}`).digest();
const sig = (id, token) => crypto.createHmac('sha256', key()).update(`${id}:${token}`).digest('base64url').slice(0, 22);
const signFile = (id, token) => `${id}.${sig(id, token)}`;
function readFile(signed, token) {
  const [id, s] = String(signed || '').split('.');
  if (!id || !s || s.length !== 22) return null;
  return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sig(id, token))) ? id : null;
}

module.exports = { current, rotate, disable, resolve, used, signFile, readFile };
