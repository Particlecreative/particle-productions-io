/**
 * Connection secrets for Studio Control (BambooHR / TMDB), pasted by an admin in the CP and stored
 * sealed with AES-256-GCM. The key derives from SETTINGS_SECRET (or JWT_SECRET); values are never
 * returned to the browser — only "configured", who set it and when. Env vars still win when present.
 */
const crypto = require('crypto');
const db = require('../../db');

function boxKey() {
  const s = process.env.SETTINGS_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('SETTINGS_SECRET / JWT_SECRET not set');
  return crypto.createHash('sha256').update(`cp-studio-settings:${s}`).digest();
}

function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', boxKey(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

function unseal(sealed) {
  const [v, iv, tag, ct] = String(sealed || '').split(':');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', boxKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

let memo = { at: 0, brand: null, rows: null };
async function loadAll(brandId = 'particle') {
  if (memo.rows && memo.brand === brandId && Date.now() - memo.at < 60000) return memo.rows;
  let rows = {};
  try {
    const r = await db.query('SELECT secrets FROM studio_settings WHERE brand_id = $1', [brandId]);
    rows = r.rows[0]?.secrets || {};
  } catch (e) {
    if (!/studio_settings/.test(e.message)) throw e; // migration not applied yet
  }
  memo = { at: Date.now(), brand: brandId, rows };
  return rows;
}

/** Plain value (object) of a stored secret, or null. */
async function getSecret(name, brandId = 'particle') {
  const all = await loadAll(brandId);
  if (!all[name]?.sealed) return null;
  try { return JSON.parse(unseal(all[name].sealed)); } catch { return null; }
}

/** Public status for every secret (never the value). */
async function secretStatus(brandId = 'particle') {
  const all = await loadAll(brandId);
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { set_at: v.set_at, set_by: v.set_by, meta: v.meta || {} }]));
}

async function setSecret(name, value, { brandId = 'particle', user = null, meta = {} } = {}) {
  const entry = { sealed: seal(JSON.stringify(value)), set_at: new Date().toISOString(), set_by: user?.name || user?.email || null, meta };
  await db.query(
    `INSERT INTO studio_settings (brand_id, secrets, updated_at) VALUES ($1, jsonb_build_object($2::text, $3::jsonb), NOW())
     ON CONFLICT (brand_id) DO UPDATE SET secrets = studio_settings.secrets || jsonb_build_object($2::text, $3::jsonb), updated_at = NOW()`,
    [brandId, name, JSON.stringify(entry)]
  );
  memo = { at: 0, brand: null, rows: null };
}

async function clearSecret(name, brandId = 'particle') {
  await db.query('UPDATE studio_settings SET secrets = secrets - $2::text, updated_at = NOW() WHERE brand_id = $1', [brandId, name]);
  memo = { at: 0, brand: null, rows: null };
}

module.exports = { getSecret, setSecret, clearSecret, secretStatus, seal, unseal };
