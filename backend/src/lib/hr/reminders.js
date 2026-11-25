/**
 * Clock reminders (Tomer, 25 Nov 2026), for everyone who connected their own BambooHR in My HR:
 *   ~10:00 Israel time, not clocked in yet  → "You haven't clocked in yet today"
 *   ~19:00 Israel time, still clocked in     → "You're still clocked in — clock out?"
 * Sun–Thu only, never on a company holiday or the person's own time off, once per person per day each (the notification's
 * dedupe key). tick() can run any time (the worker calls it every few minutes); it only acts inside the two windows.
 */
const db = require('../../db');
const W = require('../creative/week');
const { unseal } = require('../studio/secrets');
const company = require('../studio/bamboohr');
const store = require('../notify/store');
const P = require('./personal');
const { call, TZ } = require('./bamboo');

// minutes after midnight, Israel time, both ends included
const WINDOWS = { morning: { from: 10 * 60, to: 10 * 60 + 45 }, evening: { from: 19 * 60, to: 19 * 60 + 45 } };
const MESSAGES = {
  morning: 'You haven’t clocked in yet today — tap to clock in.',
  evening: 'You’re still clocked in — clock out?',
};

// ── pure (tested) ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Israel date, weekday (0 = Sunday) and minutes after midnight at an instant. */
function israelTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(new Date(now));
  const get = (t) => parts.find(p => p.type === t)?.value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, dow: W.dow(date), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

/** 'morning' | 'evening' | null — Sun–Thu, 10:00–10:45 and 19:00–19:45 Israel time. */
function windowAt(now = new Date()) {
  const t = israelTime(now);
  if (t.dow > 4) return null;
  for (const [k, w] of Object.entries(WINDOWS)) if (t.minutes >= w.from && t.minutes <= w.to) return k;
  return null;
}

const dedupeKey = (kind, date) => `hr:${kind === 'morning' ? 'in' : 'out'}:${date}`;

/** What to remind about, from the person's timesheet entries (normalized): 'clock_in' | 'clock_out' | null. */
function decide(kind, entries, today) {
  const list = Array.isArray(entries) ? entries : [];
  const running = list.some(e => e?.start && !e.end && e.type !== 'hour');
  if (kind === 'morning') return running || list.some(e => e?.date === today) ? null : 'clock_in';
  if (kind === 'evening') return running ? 'clock_out' : null;
  return null;
}

// ── the tick ──────────────────────────────────────────────────────────────────────────────────────────────────────────

async function companyOut(today) {
  try {
    const c = await company.creds();
    if (!c) return null;
    const rows = await call(c, 'GET', '/time_off/whos_out/', { query: { start: today, end: today } });
    return Array.isArray(rows) ? rows : null;
  } catch { return null; }
}

/**
 * Run the reminders for `now`. Returns what it did: { window, checked, notified, off, errors } (or { skipped }).
 * opts.notify — swap the notifier (tests).
 */
async function tick(now = new Date(), { notify = store.notify } = {}) {
  const kind = windowAt(now);
  if (!kind) return { skipped: 'outside the reminder windows' };
  const { date: today } = israelTime(now);
  const key = dedupeKey(kind, today);
  await P.ensure();
  await store.ensure();

  // Connected people, still active in CP, not reminded yet today for this window
  const { rows } = await db.query(
    `SELECT b.user_id::text AS user_id, b.subdomain, b.key_sealed, b.employee_id
       FROM user_bamboohr b JOIN users u ON u.id = b.user_id
      WHERE u.deleted_at IS NULL AND COALESCE(u.active, true) AND b.employee_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id = b.user_id AND n.dedupe = $1)`, [key]);
  const res = { window: kind, date: today, checked: 0, notified: 0, off: 0, errors: 0 };
  if (!rows.length) return res;

  const shared = await companyOut(today);
  if (shared && shared.some(r => r.type === 'holiday' && r.start <= today && (r.end || r.start) >= today)) return { ...res, holiday: true };

  for (const r of rows) {
    res.checked += 1;
    try {
      const creds = { subdomain: r.subdomain, api_key: unseal(r.key_sealed) };
      // the company list first; their own view too (the company key may not see everyone)
      if (P.offOn(shared, r.employee_id, today)) { res.off += 1; continue; }
      const own = await call(creds, 'GET', '/time_off/whos_out/', { query: { start: today, end: today } }).catch(() => []);
      if (P.offOn(Array.isArray(own) ? own : [], r.employee_id, today)) { res.off += 1; continue; }
      const raw = await call(creds, 'GET', '/time_tracking/timesheet_entries', { query: { start: W.addDays(today, -1), end: today, employeeIds: r.employee_id } });
      const entries = (Array.isArray(raw) ? raw : []).map(P.normEntry).filter(e => e && (!e.employee_id || e.employee_id === String(r.employee_id)));
      const action = decide(kind, entries, today);
      if (!action) continue;
      res.notified += await notify({
        userIds: [r.user_id], type: 'hr', link: '/my-hr', message: MESSAGES[kind], meta: { action, date: today }, actor: 'My HR', dedupe: key,
      });
    } catch (e) {
      res.errors += 1;
      P.noteError(r.user_id, e);
      if (e.bambooStatus !== 412 && e.bambooStatus !== 401) console.warn('[hr reminders]', r.user_id, e.message);
    }
  }
  return res;
}

module.exports = { tick, israelTime, windowAt, dedupeKey, decide, WINDOWS, MESSAGES };
