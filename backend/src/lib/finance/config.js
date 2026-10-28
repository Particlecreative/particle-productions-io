/**
 * Finance settings — who gets what, which days things happen. Stored as JSON in app_config('finance_config'),
 * edited from the Finance page. Shadow mode (on by default) sends every email to Tomer only.
 */
const db = require('../../db');

const DEFAULTS = {
  shadow: true,                                   // every email goes to shadow_to until switched off
  shadow_to: 'tomer@particleformen.com',
  to: 'billing@particleformen.com',               // finance
  cc: ['omer@particleformen.com'],
  internal: ['omer@particleformen.com', 'tomer@particleformen.com'],  // buffer warnings, rights, accrual drafts
  report_approvers: ['omer@particleformen.com', 'tomer@particleformen.com'],
  reminders_to: ['omer@particleformen.com'],      // missing invoices (never the supplier)
  producer_emails: { 'Omer Barak': 'omer@particleformen.com' },     // stale-date nudges
  dashboard_emails: [
    'billing@particleformen.com', 'ortal@particleformen.com', 'arina@particleformen.com',
    'omer@particleformen.com', 'tomer@particleformen.com',
  ],
  approvers: ['Ayal Ebert', 'Tomer Wilf Lezmy', 'Omer Barak'],
  bundle_minutes: 15,
  accrual_day: 25,
  reminder_days: [21, 26],
  invoice_cutoff_day: 28,
  payment_day: 29,
  default_net_days: 30,
  buffer_warn_pct: 80,
  nudges: true,
  weekly_digest: true,
  sheet_sync: true,
};

let cache = null, cachedAt = 0;

async function get({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < 30000) return cache;
  let saved = {};
  try {
    const { rows } = await db.query("SELECT value FROM app_config WHERE key = 'finance_config'");
    if (rows[0]?.value) saved = JSON.parse(rows[0].value);
  } catch (e) { console.error('[finance] config read failed:', e.message); }
  cache = { ...DEFAULTS, ...saved };
  cachedAt = Date.now();
  return cache;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanList = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map(s => String(s).trim().toLowerCase()).filter(s => EMAIL_RE.test(s));

/** Merge a patch from the Finance page (only known keys, validated). */
async function set(patch) {
  const cur = await get({ fresh: true });
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    const def = DEFAULTS[k];
    if (typeof def === 'boolean') next[k] = !!v;
    else if (typeof def === 'number') { const n = Number(v); if (Number.isFinite(n)) next[k] = n; }
    else if (k === 'reminder_days') next[k] = (Array.isArray(v) ? v : String(v).split(',')).map(Number).filter(n => n >= 1 && n <= 31);
    else if (k === 'approvers') next[k] = (Array.isArray(v) ? v : String(v).split(',')).map(s => String(s).trim()).filter(Boolean);
    else if (k === 'producer_emails') next[k] = typeof v === 'object' && v ? v : cur[k];
    else if (Array.isArray(def)) next[k] = cleanList(v);
    else if (typeof def === 'string') { const s = String(v || '').trim().toLowerCase(); if (EMAIL_RE.test(s)) next[k] = s; }
  }
  const saved = Object.fromEntries(Object.entries(next).filter(([k]) => JSON.stringify(next[k]) !== JSON.stringify(DEFAULTS[k])));
  await db.query(
    `INSERT INTO app_config (key, value) VALUES ('finance_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(saved)]);
  cache = null;
  return get({ fresh: true });
}

module.exports = { get, set, DEFAULTS };
