/**
 * Monday person → CP account(s): their connected Monday first (user_monday), else the same e-mail on both sides.
 * Cached 10 minutes. Everything here only reads.
 */
const db = require('../../db');
const monday = require('../monday');

let cache = { at: 0, byMonday: new Map(), byName: new Map() };

async function load() {
  if (Date.now() - cache.at < 10 * 60 * 1000) return cache;
  const byMonday = new Map();
  const byName = new Map();
  const add = (m, k, v) => { const key = String(k); if (!m.has(key)) m.set(key, new Set()); m.get(key).add(String(v)); };
  const { rows: users } = await db.query('SELECT id, email, name FROM users WHERE COALESCE(active, true) AND deleted_at IS NULL');
  for (const u of users) if (u.name) add(byName, norm(u.name), u.id);
  const { rows: linked } = await db.query('SELECT user_id, monday_user_id, name FROM user_monday WHERE monday_user_id IS NOT NULL').catch(() => ({ rows: [] }));
  for (const l of linked) { add(byMonday, l.monday_user_id, l.user_id); if (l.name) add(byName, norm(l.name), l.user_id); }
  cache = { at: Date.now(), byMonday, byName, byEmail: new Map(users.map(u => [String(u.email || '').toLowerCase(), String(u.id)])) };
  return cache;
}

const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z֐-׿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** monday ids → Map(mondayId → [cp user ids]). Unknown ids are looked up on Monday by e-mail. */
async function cpUsersFor(mondayIds) {
  const c = await load();
  const out = new Map();
  const missing = [];
  for (const id of new Set((mondayIds || []).map(String).filter(Boolean))) {
    if (c.byMonday.has(id)) out.set(id, [...c.byMonday.get(id)]); else missing.push(id);
  }
  if (missing.length) {
    const users = await monday.usersByIds(missing).catch(() => []);
    for (const u of users) {
      const cp = c.byEmail.get(String(u.email || '').toLowerCase());
      if (cp) { out.set(String(u.id), [cp]); c.byMonday.set(String(u.id), new Set([cp])); }
    }
  }
  return out;
}

/** A display name (e.g. AfterLife's "maker") → CP user ids with that full name. */
async function cpUsersByName(name) {
  const c = await load();
  const k = norm(name);
  return k.split(' ').length >= 2 && c.byName.has(k) ? [...c.byName.get(k)] : [];
}

module.exports = { cpUsersFor, cpUsersByName, norm };
