/**
 * Notifications, the whole platform (Tomer, 25 Nov 2026: "make the notifications UX/UI nicer in general — notify when a
 * task's status changes or you get a comment, and a quiet one when your ad starts running on Meta").
 * Server-made notifications carry a link (where clicking takes you), meta (item id, board, Monday link, colours…), who
 * did it, and a dedupe key so a watcher that looks twice never notifies twice. Each person chooses what they get.
 * Tables/columns are created here on first use — no manual migration on deploy.
 */
const db = require('../../db');

/** What a person can switch on/off, with the defaults. */
const TYPES = {
  mention: { label: 'Someone tags you', on: true },
  comment: { label: 'New updates and replies on your tasks', on: true },
  status: { label: 'Status changes on your tasks', on: true },
  assigned: { label: 'You’re put on a task', on: true },
  ad_live: { label: 'Your ad is uploaded to Meta / starts running', on: true },
  requests: { label: 'Tickets you asked for: ready for review, done, stuck', on: true },
};
const DEFAULTS = { types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.on])), toast: true, desktop: false, quiet_hours: null };

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async () => {
      await db.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link TEXT, ADD COLUMN IF NOT EXISTS meta JSONB,
        ADD COLUMN IF NOT EXISTS actor TEXT, ADD COLUMN IF NOT EXISTS dedupe TEXT`);
      await db.query('CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe ON notifications (user_id, dedupe) WHERE dedupe IS NOT NULL');
      await db.query(`CREATE TABLE IF NOT EXISTS notification_settings (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await db.query(`CREATE TABLE IF NOT EXISTS notify_cursor (name TEXT PRIMARY KEY, last_ms BIGINT NOT NULL DEFAULT 0,
        seen JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** A person's settings merged over the defaults (pure). */
function merged(s) {
  const v = s && typeof s === 'object' ? s : {};
  return { ...DEFAULTS, ...v, types: { ...DEFAULTS.types, ...(v.types || {}) } };
}

async function getSettings(userId) {
  await ensure();
  const { rows } = await db.query('SELECT settings FROM notification_settings WHERE user_id = $1', [userId]);
  return merged(rows[0]?.settings);
}

/** Only known keys, booleans only. */
function clean(input) {
  const v = input && typeof input === 'object' ? input : {};
  const types = {};
  for (const k of Object.keys(TYPES)) if (typeof v.types?.[k] === 'boolean') types[k] = v.types[k];
  const out = { types };
  if (typeof v.toast === 'boolean') out.toast = v.toast;
  if (typeof v.desktop === 'boolean') out.desktop = v.desktop;
  return out;
}

async function saveSettings(userId, input) {
  await ensure();
  const cur = await getSettings(userId);
  const c = clean(input);
  const next = merged({ ...cur, ...c, types: { ...cur.types, ...c.types } });
  await db.query(`INSERT INTO notification_settings (user_id, settings) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()`, [userId, JSON.stringify(next)]);
  return next;
}

/**
 * Notify people. userIds = CP user ids; type = one of TYPES (anything else always goes out); dedupe = a key unique per
 * event (with the person) so the same event never lands twice. Returns how many were written.
 */
async function notify({ userIds, type, message, link = null, meta = null, actor = null, dedupe = null, productionId = null }) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length || !message) return 0;
  await ensure();
  const { rows: prefs } = await db.query('SELECT user_id, settings FROM notification_settings WHERE user_id = ANY($1::uuid[])', [ids]);
  const off = new Set(prefs.filter(p => TYPES[type] && merged(p.settings).types[type] === false).map(p => String(p.user_id)));
  let n = 0;
  for (const uid of ids) {
    if (off.has(uid)) continue;
    const r = await db.query(
      `INSERT INTO notifications (user_id, type, message, production_id, link, meta, actor, dedupe) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, dedupe) WHERE dedupe IS NOT NULL DO NOTHING`,
      [uid, type, String(message).slice(0, 500), productionId, link, meta ? JSON.stringify(meta) : null, actor, dedupe],
    ).catch((e) => { console.warn('[notify] insert', e.message); return { rowCount: 0 }; });
    n += r.rowCount || 0;
  }
  return n;
}

async function cursor(name) {
  await ensure();
  const { rows } = await db.query('SELECT last_ms, seen FROM notify_cursor WHERE name = $1', [name]);
  return rows[0] ? { last: Number(rows[0].last_ms), seen: new Set(rows[0].seen || []) } : null;
}
async function saveCursor(name, last, seen) {
  await db.query(`INSERT INTO notify_cursor (name, last_ms, seen) VALUES ($1, $2, $3)
    ON CONFLICT (name) DO UPDATE SET last_ms = GREATEST(notify_cursor.last_ms, EXCLUDED.last_ms), seen = EXCLUDED.seen, updated_at = NOW()`,
  [name, Math.round(last), JSON.stringify([...seen].slice(-600))]);
}

module.exports = { TYPES, DEFAULTS, ensure, merged, clean, getSettings, saveSettings, notify, cursor, saveCursor };
