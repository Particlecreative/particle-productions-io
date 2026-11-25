/**
 * My HR (Tomer, 25 Nov 2026): every CP user connects THEIR OWN BambooHR — a personal API key, which acts as them with
 * their own BambooHR permissions — and does it all in CP: clock in / out, today's and this week's hours, ask for time off,
 * balances, their requests (cancel a pending one), who's out, their own details.
 * The key is sealed (AES-GCM, lib/studio/secrets) in user_bamboohr and never goes back to the browser or into a log.
 * Table created here on first use — no migration. Reads are cached briefly per person; any write clears that person's cache.
 */
const db = require('../../db');
const { seal, unseal } = require('../studio/secrets');
const company = require('../studio/bamboohr');
const W = require('../creative/week');
const { call, memo, forget: forgetCache, TZ } = require('./bamboo');

/** Hours a normal working day is expected to have (Sun–Thu). */
const EXPECTED_DAY_HOURS = Number(process.env.HR_EXPECTED_DAY_HOURS) || 9;
const WORKDAY = (dow) => dow >= 0 && dow <= 4; // Sun–Thu
const READ_TTL = 45 * 1000;

const PROFILE_FIELDS = 'firstName,lastName,preferredName,displayName,jobTitle,jobTitleName,department,division,location,workEmail,mobilePhone,hireDate,supervisor,reportsToName,photoUrl';
const PROFILE_FIELDS_SAFE = 'firstName,lastName,displayName,jobTitle,department,location,workEmail,hireDate,supervisor,photoUrl';

const bad = (msg, status = 400, code = null) => Object.assign(new Error(msg), { status, ...(code ? { code } : {}) });

let ready = null;
function ensure() {
  ready = ready || db.query(`CREATE TABLE IF NOT EXISTS user_bamboohr (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, subdomain TEXT NOT NULL, key_sealed TEXT NOT NULL, employee_id TEXT, name TEXT, email TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_ok_at TIMESTAMPTZ, last_error TEXT, last_error_at TIMESTAMPTZ)`)
    .catch((e) => { ready = null; throw e; });
  return ready;
}

// ── small pure helpers (tested) ───────────────────────────────────────────────────────────────────────────────────────

/** A pasted key → the key, or a friendly 400. BambooHR keys are long hex strings. */
function cleanKey(input) {
  const k = String(input || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!k) throw bad('Paste your BambooHR API key first', 400, 'bad_key');
  if (/\s/.test(k) || !/^[A-Za-z0-9]{20,80}$/.test(k)) throw bad('That doesn’t look like a BambooHR API key — it’s one long run of letters and numbers. Copy the whole key, nothing else.', 400, 'bad_key');
  return k;
}

/** "particle", "particle.bamboohr.com", "https://particle.bamboohr.com/home" → "particle"; '' when empty; null when it looks wrong. */
function cleanSubdomain(input) {
  const s = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.bamboohr\.com.*$/, '').replace(/\/.*$/, '');
  if (!s) return '';
  return /^[a-z0-9-]{2,63}$/.test(s) ? s : null;
}

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !String(s).startsWith('0000');
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const round2 = (n) => Math.round(n * 100) / 100;

/** Next work anniversary from a hire date (Feb 29 → Feb 28 in other years). */
function anniversary(hire, today) {
  if (!isYmd(hire) || !isYmd(today)) return null;
  const [hy, hm, hd] = hire.split('-').map(Number);
  const ty = Number(today.slice(0, 4));
  const on = (y) => {
    const last = new Date(Date.UTC(y, hm, 0)).getUTCDate();
    return `${y}-${String(hm).padStart(2, '0')}-${String(Math.min(hd, last)).padStart(2, '0')}`;
  };
  let next = on(ty);
  if (next < today) next = on(ty + 1);
  if (hire > today) next = on(Math.max(hy + 1, ty));
  const yearsAtNext = Number(next.slice(0, 4)) - hy;
  const days = daysBetween(today, next);
  return { next_date: next, days_until: days, years_at_next: Math.max(0, yearsAtNext), years_so_far: Math.max(0, days === 0 ? yearsAtNext : yearsAtNext - 1), is_today: days === 0 };
}

const text = (v) => (v && typeof v === 'object' ? v.name || v.label || v.value || null : (v == null || v === '' ? null : String(v)));
/** "Cohen, Dana" → "Dana Cohen" */
const personName = (s) => { const t = text(s); const m = t && t.match(/^([^,]+),\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : t; };

function normProfile(p, today) {
  const first = text(p.preferredName) || text(p.firstName);
  const name = text(p.displayName) || [first, text(p.lastName)].filter(Boolean).join(' ') || null;
  const hire = isYmd(p.hireDate) ? p.hireDate : null;
  return {
    id: String(p.id), name, first_name: first || (name ? name.split(' ')[0] : null),
    job_title: text(p.jobTitleName) || text(p.jobTitle), department: text(p.department), division: text(p.division),
    location: text(p.location), email: text(p.workEmail), mobile: text(p.mobilePhone), hire_date: hire,
    anniversary: hire ? anniversary(hire, today) : null, manager: personName(p.supervisor) || personName(p.reportsToName),
    photo_url: /^https:\/\//.test(String(p.photoUrl || '')) ? p.photoUrl : null,
  };
}

function normEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const hours = Number(e.hours);
  return {
    id: e.id != null ? String(e.id) : null, employee_id: e.employeeId != null ? String(e.employeeId) : null,
    type: e.type || 'clock', date: isYmd(e.date) ? e.date : (e.start ? W.localDate(Date.parse(e.start)) : null),
    start: e.start || null, end: e.end || null, hours: Number.isFinite(hours) ? hours : null, note: e.note || null,
  };
}

/**
 * Hours of one entry. Running today → until now. Left open on an earlier day (forgot to clock out) → until 19:00 that
 * day, at most 10 hours, flagged no_out (the same rule Studio's time tracking uses).
 */
function entryHours(e, today, nowMs = Date.now()) {
  const s = e.start ? Date.parse(e.start) : NaN;
  const t = e.end ? Date.parse(e.end) : NaN;
  if (Number.isFinite(s) && Number.isFinite(t)) return { hours: Number.isFinite(e.hours) && e.hours > 0 ? e.hours : Math.max(0, (t - s) / 3600000), open: false, no_out: false };
  if (Number.isFinite(s) && !e.end) {
    if (e.date && e.date < today) {
      const stop = Math.max(s, Math.min(W.zonedMidnightUtc(e.date) + 19 * 3600000, s + 10 * 3600000));
      return { hours: (stop - s) / 3600000, open: false, no_out: true };
    }
    return { hours: Math.max(0, (nowMs - s) / 3600000), open: true, no_out: false };
  }
  return { hours: Number.isFinite(e.hours) ? e.hours : 0, open: false, no_out: false };
}

/** Entries → { date: { hours, closed_hours, in, out, open, no_out, entries } } */
function dayTotals(entries, today, nowMs = Date.now()) {
  const out = {};
  for (const e of entries) {
    if (!e?.date) continue;
    const h = entryHours(e, today, nowMs);
    const d = (out[e.date] = out[e.date] || { hours: 0, closed_hours: 0, in: null, out: null, open: false, no_out: false, entries: 0 });
    d.entries += 1;
    d.hours = round2(d.hours + h.hours);
    if (!h.open) d.closed_hours = round2(d.closed_hours + h.hours);
    if (h.open) d.open = true;
    if (h.no_out) d.no_out = true;
    if (e.start && (!d.in || Date.parse(e.start) < Date.parse(d.in))) d.in = e.start;
    if (e.end && (!d.out || Date.parse(e.end) > Date.parse(d.out))) d.out = e.end;
  }
  return out;
}

/** Off on a date? (a company holiday, or this employee's time off) — rows from /time_off/whos_out */
function offOn(rows, employeeId, date) {
  return (rows || []).find(r => r && r.start && r.start <= date && (r.end || r.start) >= date
    && (r.type === 'holiday' || (employeeId != null && String(r.employeeId) === String(employeeId)))) || null;
}

const DOW_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * The days a time-off request covers and how much each day counts. Fri / Sat and holidays count 0; a work day is 1 day
 * or that day's hours (BambooHR's default hours when they're set for that weekday, else EXPECTED_DAY_HOURS).
 * half_day (one day only) halves it.
 */
function planDays({ start, end, units = 'days', halfDay = false, defaultHours = [], holidays = new Set() }) {
  const perDay = {};
  for (const h of Array.isArray(defaultHours) ? defaultHours : []) {
    const i = DOW_NAMES.indexOf(String(h?.name || '').toLowerCase());
    const a = Number(h?.amount);
    if (i >= 0 && a > 0) perDay[i] = a;
  }
  const dates = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= n; i++) {
    const ymd = W.addDays(start, i);
    const dow = W.dow(ymd);
    let amount = 0;
    if (WORKDAY(dow) && !holidays.has(ymd)) amount = units === 'hours' ? (perDay[dow] || EXPECTED_DAY_HOURS) : 1;
    if (halfDay && n === 0) amount = amount / 2;
    dates.push({ ymd, amount: round2(amount) });
  }
  return { dates, amount: round2(dates.reduce((s, d) => s + d.amount, 0)) };
}

function normRequest(r) {
  const status = String(r?.status?.status || r?.status || '').toLowerCase() || 'requested';
  const notes = r?.notes || {};
  return {
    id: String(r.id), employee_id: r.employeeId != null ? String(r.employeeId) : null, name: r.name || null,
    start: r.start || null, end: r.end || r.start || null, created: r.created || null, status,
    changed: r?.status?.lastChanged || null,
    type: { id: r?.type?.id != null ? String(r.type.id) : null, name: r?.type?.name || 'Time off', icon: r?.type?.icon || null },
    amount: Number(r?.amount?.amount) || null, unit: r?.amount?.unit || null,
    note: typeof notes.employee === 'string' ? notes.employee : null, manager_note: typeof notes.manager === 'string' ? notes.manager : null,
  };
}

function normTypes(raw) {
  const list = Array.isArray(raw) ? raw : (raw?.timeOffTypes || []);
  return {
    types: list.map(t => ({ id: String(t.id), name: t.name || 'Time off', units: t.units === 'hours' ? 'hours' : 'days', color: t.color ? `#${String(t.color).replace(/^#/, '')}` : null, icon: t.icon || null })),
    default_hours: Array.isArray(raw?.defaultHours) ? raw.defaultHours : [],
  };
}

function normBalances(raw) {
  return (Array.isArray(raw) ? raw : []).map(b => ({
    type_id: b.timeOffType != null ? String(b.timeOffType) : null, name: b.name || 'Time off', units: b.units === 'hours' ? 'hours' : 'days',
    balance: Number.isFinite(Number(b.balance)) ? Number(b.balance) : null, used_ytd: Number(b.usedYearToDate) || 0,
    policy: b.policyType || null, unlimited: b.policyType === 'discretionary',
  }));
}

// ── storage ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const forget = (userId) => forgetCache(`hr:${userId}|`);

async function companySubdomain() {
  try { return (await company.creds())?.subdomain || null; } catch { return process.env.BAMBOOHR_SUBDOMAIN || null; }
}

async function row(userId) {
  await ensure();
  const { rows } = await db.query('SELECT user_id, subdomain, key_sealed, employee_id, name, email, connected_at, last_ok_at, last_error, last_error_at FROM user_bamboohr WHERE user_id = $1', [String(userId)]);
  return rows[0] || null;
}

/** The person's creds — throws 409 not_connected when they haven't connected. */
async function credsFor(userId) {
  const r = await row(userId);
  if (!r) throw bad('You haven’t connected your BambooHR yet', 409, 'not_connected');
  let api_key;
  try { api_key = unseal(r.key_sealed); } catch { throw bad('Your BambooHR connection needs to be set up again — connect it once more', 409, 'not_connected'); }
  return { subdomain: r.subdomain, api_key, employee_id: r.employee_id, name: r.name, row: r };
}

const okNoted = new Map();
function noteOk(userId) {
  const last = okNoted.get(String(userId)) || 0;
  if (Date.now() - last < 5 * 60000) return;
  okNoted.set(String(userId), Date.now());
  db.query('UPDATE user_bamboohr SET last_ok_at = NOW(), last_error = NULL, last_error_at = NULL WHERE user_id = $1', [String(userId)]).catch(() => null);
}
function noteError(userId, err) {
  if (err?.bambooStatus !== 401) return;
  okNoted.delete(String(userId));
  db.query('UPDATE user_bamboohr SET last_error = $2, last_error_at = NOW() WHERE user_id = $1', [String(userId), 'BambooHR no longer accepts this key']).catch(() => null);
}

/** What the browser may know about the connection. Never the key. */
async function status(userId) {
  const r = await row(userId);
  if (!r) return { connected: false, company_subdomain: await companySubdomain(), expected_day_hours: EXPECTED_DAY_HOURS };
  return {
    connected: true, name: r.name || null, email: r.email || null, employee_id: r.employee_id || null, subdomain: r.subdomain,
    connected_at: r.connected_at || null, last_ok_at: r.last_ok_at || null, last_error: r.last_error || null,
    needs_reconnect: !!r.last_error, expected_day_hours: EXPECTED_DAY_HOURS,
  };
}

async function fetchProfile(creds) {
  try {
    return await call(creds, 'GET', '/employees/0', { query: { fields: PROFILE_FIELDS } });
  } catch (e) {
    if (e.bambooStatus !== 400) throw e;
    return call(creds, 'GET', '/employees/0', { query: { fields: PROFILE_FIELDS_SAFE } });
  }
}

/** Paste a personal key (BambooHR → your name, lower left → API Keys → Add new key). */
async function connect(userId, apiKey, subdomainInput) {
  const api_key = cleanKey(apiKey);
  let subdomain = cleanSubdomain(subdomainInput);
  if (subdomain === null) throw bad('That company name looks wrong — use the part before .bamboohr.com in BambooHR’s address', 400, 'bad_subdomain');
  if (!subdomain) subdomain = await companySubdomain();
  if (!subdomain) throw bad('Type your company’s BambooHR name — the part before .bamboohr.com in BambooHR’s address', 400, 'need_subdomain');
  let self;
  try {
    self = await fetchProfile({ subdomain, api_key });
  } catch (e) {
    if (e.bambooStatus === 401) throw bad('BambooHR didn’t accept that key. Copy it again — the whole key, nothing else.', 400, 'bad_key');
    if (e.bambooStatus === 403) throw bad('BambooHR said no to this key. If you tried a few times, BambooHR pauses for a few minutes — wait a little and try again.', 403, 'not_allowed');
    if (e.bambooStatus === 404 || e.code === 'unexpected') throw bad(`We couldn’t find “${subdomain}” on BambooHR — check the company name.`, 400, 'bad_subdomain');
    throw e;
  }
  if (!self || self.id == null || String(self.id) === '0') throw bad('BambooHR didn’t say who this key belongs to — try making a new key', 400, 'bad_key');
  const p = normProfile(self, W.localDate(Date.now()));
  await ensure();
  await db.query(
    `INSERT INTO user_bamboohr (user_id, subdomain, key_sealed, employee_id, name, email, connected_at, last_ok_at, last_error, last_error_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NULL, NULL)
     ON CONFLICT (user_id) DO UPDATE SET subdomain = EXCLUDED.subdomain, key_sealed = EXCLUDED.key_sealed, employee_id = EXCLUDED.employee_id,
       name = EXCLUDED.name, email = EXCLUDED.email, connected_at = NOW(), last_ok_at = NOW(), last_error = NULL, last_error_at = NULL`,
    [String(userId), subdomain, seal(api_key), String(self.id), p.name, p.email ? p.email.toLowerCase() : null]);
  forget(userId);
  return status(userId);
}

async function disconnect(userId) {
  await ensure();
  await db.query('DELETE FROM user_bamboohr WHERE user_id = $1', [String(userId)]);
  forget(userId);
  okNoted.delete(String(userId));
  return { ok: true, connected: false };
}

/** Everyone connected (for reminders and the HR panel) — never the key. */
async function connectedRows() {
  await ensure();
  const { rows } = await db.query('SELECT user_id::text AS user_id, subdomain, employee_id, name, email, connected_at, last_ok_at, last_error FROM user_bamboohr');
  return rows;
}

// ── reads ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const TT_MSG = { 403: 'BambooHR doesn’t let your account see time tracking.', 412: 'Time tracking isn’t turned on for you in BambooHR — ask HR to add you to time tracking.' };

async function entriesFor(c, userId, from, to, { force = false } = {}) {
  const raw = await memo(`hr:${userId}|ts:${from}:${to}`, READ_TTL, () => call(c, 'GET', '/time_tracking/timesheet_entries', {
    query: { start: from, end: to, employeeIds: c.employee_id }, messages: TT_MSG,
  }), { force });
  return (Array.isArray(raw) ? raw : []).map(normEntry).filter(e => e && (!e.employee_id || e.employee_id === String(c.employee_id)));
}

/** Clock state + this week's hours from timesheet entries. */
function clockFrom(entries, { today, weekStart, nowMs, off = [] }) {
  const days = dayTotals(entries, today, nowMs);
  const open = entries.filter(e => e.start && !e.end && e.type !== 'hour')
    .map(e => ({ e, h: entryHours(e, today, nowMs) }))
    .filter(x => x.h.open || x.e.date === today || x.e.date === W.addDays(today, -1))
    .sort((a, b) => Date.parse(b.e.start) - Date.parse(a.e.start))[0]?.e || null;
  const week = [];
  let weekHours = 0;
  let weekClosed = 0;
  let expected = 0;
  for (let i = 0; i < 7; i++) {
    const date = W.addDays(weekStart, i);
    const d = days[date] || null;
    const dow = W.dow(date);
    const offRow = offOn(off, null, date) || off.find(r => r.mine && r.start <= date && (r.end || r.start) >= date) || null;   // a holiday, or my own time off
    const workday = WORKDAY(dow);
    if (workday && !offRow) expected += EXPECTED_DAY_HOURS;
    if (d) { weekHours += d.hours; weekClosed += d.closed_hours; }
    week.push({
      date, dow, workday, future: date > today, today: date === today,
      hours: d ? d.hours : 0, closed_hours: d ? d.closed_hours : 0, in: d?.in || null, out: d?.out || null,
      open: !!d?.open, no_out: !!d?.no_out, off: offRow ? { type: offRow.type === 'holiday' ? 'holiday' : 'time_off', name: offRow.type === 'holiday' ? offRow.name || 'Holiday' : 'Time off' } : null,
    });
  }
  const t = days[today];
  return {
    enabled: true, open: !!open, since: open?.start || null, open_date: open?.date || null, open_from_earlier: !!(open && open.date < today),
    entry_id: open?.id || null, today_hours: round2(t?.hours || 0), today_closed_hours: round2(t?.closed_hours || 0),
    week_hours: round2(weekHours), week_closed_hours: round2(weekClosed), expected_day_hours: EXPECTED_DAY_HOURS, expected_week_hours: expected,
    days: week, entries_today: entries.filter(e => e.date === today).map(e => ({ start: e.start, end: e.end, hours: round2(entryHours(e, today, nowMs).hours), note: e.note })),
  };
}

/** Light clock state for the header pill (one call, cached). */
async function clockState(userId) {
  let c;
  try { c = await credsFor(userId); } catch (e) { if (e.code === 'not_connected') return { connected: false }; throw e; }
  const nowMs = Date.now();
  const today = W.localDate(nowMs);
  try {
    const entries = await entriesFor(c, userId, W.addDays(today, -1), today);
    noteOk(userId);
    const cl = clockFrom(entries, { today, weekStart: W.sundayOf(nowMs), nowMs });
    return { connected: true, open: cl.open, since: cl.since, open_from_earlier: cl.open_from_earlier, open_date: cl.open_date, today_hours: cl.today_hours, today_closed_hours: cl.today_closed_hours, generated_at: new Date(nowMs).toISOString() };
  } catch (e) {
    noteError(userId, e);
    return { connected: true, error: e.message, code: e.code || null, needs_reconnect: e.bambooStatus === 401 };
  }
}

async function typesFor(c, userId) {
  return normTypes(await memo(`hr:${userId}|types`, 3600 * 1000, () => call(c, 'GET', '/meta/time_off/types', { query: { mode: 'request' } })));
}

async function myRequests(c, userId, today, { force = false } = {}) {
  const start = W.addDays(today, -180);
  const end = W.addDays(today, 365);
  const raw = await memo(`hr:${userId}|req`, READ_TTL, async () => {
    try {
      return await call(c, 'GET', '/time_off/requests', { query: { action: 'myRequests', start, end } });
    } catch (e) {
      if (e.bambooStatus !== 400) throw e;
      return call(c, 'GET', '/time_off/requests', { query: { employeeId: c.employee_id, start, end } });
    }
  }, { force });
  const order = { requested: 0, approved: 1, denied: 2, canceled: 3, superceded: 4 };
  return (Array.isArray(raw) ? raw : []).map(normRequest)
    .filter(r => !r.employee_id || r.employee_id === String(c.employee_id))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(b.start).localeCompare(String(a.start)))
    .slice(0, 40);
}

async function whosOutFor(c, userId, from, to) {
  const raw = await memo(`hr:${userId}|out:${from}:${to}`, 5 * 60000, () => call(c, 'GET', '/time_off/whos_out/', { query: { start: from, end: to } }));
  return (Array.isArray(raw) ? raw : []).map(r => ({
    id: r.id != null ? String(r.id) : null, type: r.type === 'holiday' ? 'holiday' : 'time_off', name: r.name || null,
    start: r.start, end: r.end || r.start, employeeId: r.employeeId != null ? String(r.employeeId) : null,
  })).filter(r => isYmd(r.start));
}

async function photosFor(c, userId) {
  try {
    const d = await memo(`hr:${userId}|dir`, 6 * 3600 * 1000, () => call(c, 'GET', '/employees/directory'));
    return new Map((d?.employees || []).map(e => [String(e.id), { photo: /^https:\/\//.test(String(e.photoUrl || '')) ? e.photoUrl : null, title: e.jobTitle || null }]));
  } catch { return new Map(); }
}

const settledError = (r) => (r.status === 'rejected' ? (r.reason?.message || 'Couldn’t load this from BambooHR') : null);

/** Everything My HR shows, in one go. Each part loads on its own — one failing doesn't hide the rest. */
async function me(userId, { force = false } = {}) {
  let c;
  try { c = await credsFor(userId); } catch (e) { if (e.code === 'not_connected') return status(userId); throw e; }
  if (force) forget(userId);
  const nowMs = Date.now();
  const today = W.localDate(nowMs);
  const weekStart = W.sundayOf(nowMs);
  const outTo = W.addDays(weekStart, 13);

  const profileP = memo(`hr:${userId}|profile`, 10 * 60000, () => fetchProfile(c));
  const [profileR, entriesR, outR, typesR, balR, reqR] = await Promise.allSettled([
    profileP,
    entriesFor(c, userId, W.addDays(today, -1) < weekStart ? W.addDays(today, -1) : weekStart, today),
    whosOutFor(c, userId, weekStart, outTo),
    typesFor(c, userId),
    memo(`hr:${userId}|bal`, READ_TTL, () => call(c, 'GET', `/employees/${encodeURIComponent(c.employee_id)}/time_off/calculator`, { query: { end: today } })),
    myRequests(c, userId, today),
  ]);

  const base = await status(userId);
  if (profileR.status === 'rejected' && profileR.reason?.bambooStatus === 401) {
    noteError(userId, profileR.reason);
    return { ...base, needs_reconnect: true, error: 'BambooHR no longer accepts your key (it may have been deleted). Make a new key and connect again.' };
  }
  if (profileR.status === 'fulfilled') noteOk(userId);

  const out = outR.status === 'fulfilled' ? outR.value : [];
  const mineOff = out.filter(r => r.type === 'time_off' && r.employeeId === String(c.employee_id)).map(r => ({ ...r, mine: true }));
  const holidays = out.filter(r => r.type === 'holiday');
  let photos = new Map();
  if (out.some(r => r.type === 'time_off')) photos = await photosFor(c, userId);

  const profile = profileR.status === 'fulfilled' ? normProfile(profileR.value, today) : null;
  if (profile && !profile.photo_url && photos.get(profile.id)?.photo) profile.photo_url = photos.get(profile.id).photo;

  const clock = entriesR.status === 'fulfilled'
    ? clockFrom(entriesR.value, { today, weekStart, nowMs, off: [...holidays, ...mineOff] })
    : { enabled: false, error: settledError(entriesR), code: entriesR.reason?.code || null, expected_day_hours: EXPECTED_DAY_HOURS };

  const types = typesR.status === 'fulfilled' ? typesR.value : { types: [], default_hours: [] };
  const balances = balR.status === 'fulfilled' ? normBalances(balR.value) : [];
  for (const b of balances) { const t = types.types.find(x => x.id === b.type_id); if (t) { b.color = t.color; b.icon = t.icon; } }

  return {
    ...base, needs_reconnect: false, last_error: null,
    today, week_start: weekStart, generated_at: new Date(nowMs).toISOString(), timezone: TZ,
    profile, profile_error: settledError(profileR),
    clock,
    time_off: {
      types: types.types, default_hours: types.default_hours, balances, requests: reqR.status === 'fulfilled' ? reqR.value : [],
      errors: { types: settledError(typesR), balances: settledError(balR), requests: settledError(reqR) },
    },
    whos_out: {
      from: weekStart, to: outTo, error: settledError(outR),
      people: out.filter(r => r.type === 'time_off').map(r => ({ ...r, is_me: r.employeeId === String(c.employee_id), photo_url: photos.get(r.employeeId)?.photo || null, job_title: photos.get(r.employeeId)?.title || null })),
      holidays: holidays.map(h => ({ name: h.name, start: h.start, end: h.end })),
    },
  };
}

// ── writes ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const ROUTE_GONE = [403, 404, 405];

async function afterWrite(userId) {
  forget(userId);
  try { return await clockState(userId); } catch { return null; }
}

/** Clock in now (Israel time). */
async function clockIn(userId, { note } = {}) {
  const c = await credsFor(userId);
  const n = String(note || '').trim().slice(0, 200);
  const messages = { 409: 'You’re already clocked in.', 412: TT_MSG[412] };
  let entry;
  try {
    entry = await call(c, 'POST', `/time_tracking/employees/${encodeURIComponent(c.employee_id)}/clock_in`, { body: { timezone: TZ, ...(n ? { note: n } : {}) }, messages });
  } catch (e) {
    if (!ROUTE_GONE.includes(e.bambooStatus)) { noteError(userId, e); throw e; }
    try {
      entry = await call(c, 'POST', '/time-tracking/clock-ins', { body: { employeeId: Number(c.employee_id) || c.employee_id, timezone: TZ, ...(n ? { note: n } : {}) }, messages });
    } catch (e2) {
      throw ROUTE_GONE.includes(e2.bambooStatus) ? e : e2;
    }
  }
  return { ok: true, entry: normEntry(entry), clock: await afterWrite(userId) };
}

/** Clock out now — or, for an entry left open on an earlier day, at the time they finished ({ date, end: "HH:MM" }). */
async function clockOut(userId, { date, end } = {}) {
  const c = await credsFor(userId);
  const today = W.localDate(Date.now());
  const body = { timezone: TZ };
  if (date != null && date !== '') {
    if (!isYmd(date) || date > today || date < W.addDays(today, -7)) throw bad('Pick the day you finished (within the last week)', 400);
    body.date = date;
  }
  if (end != null && end !== '') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(end))) throw bad('Pick the time you finished, like 18:30', 400);
    body.end = String(end);
  }
  const messages = { 404: 'You’re not clocked in right now.', 409: 'You’re not clocked in right now.', 412: 'You’re not clocked in right now.' };
  let entry;
  try {
    entry = await call(c, 'POST', `/time_tracking/employees/${encodeURIComponent(c.employee_id)}/clock_out`, { body, messages });
  } catch (e) {
    if (!ROUTE_GONE.includes(e.bambooStatus) || body.date || body.end) { noteError(userId, e); throw e; }
    try {
      entry = await call(c, 'POST', '/time-tracking/clock-outs', { body: { employeeId: Number(c.employee_id) || c.employee_id }, messages });
    } catch (e2) {
      throw ROUTE_GONE.includes(e2.bambooStatus) ? e : e2;
    }
  }
  return { ok: true, entry: normEntry(entry), clock: await afterWrite(userId) };
}

/** Ask for time off. { type_id, start, end, amount?, note?, half_day? } */
async function requestTimeOff(userId, input = {}) {
  const c = await credsFor(userId);
  const typeId = String(input.type_id ?? '').trim();
  if (!/^\d+$/.test(typeId)) throw bad('Pick the kind of time off', 400);
  const start = String(input.start || '').trim();
  const end = String(input.end || input.start || '').trim();
  if (!isYmd(start) || !isYmd(end)) throw bad('Pick the dates', 400);
  if (end < start) throw bad('The last day is before the first day', 400);
  if (daysBetween(start, end) > 90) throw bad('That’s more than 90 days — for something that long, talk to HR directly', 400);
  const today = W.localDate(Date.now());
  if (start < W.addDays(today, -60)) throw bad('That’s too far back to ask for here — ask HR to add it', 400);
  const note = String(input.note || '').trim().slice(0, 500);

  const { types, default_hours } = await typesFor(c, userId);
  const type = types.find(t => t.id === typeId);
  if (types.length && !type) throw bad('That kind of time off isn’t available to you', 400);
  const units = type?.units || 'days';

  let holidays = new Set();
  try {
    const out = await whosOutFor(c, userId, start, end);
    holidays = new Set(out.filter(r => r.type === 'holiday').flatMap(r => {
      const list = [];
      for (let d = r.start; d <= (r.end || r.start) && list.length < 120; d = W.addDays(d, 1)) list.push(d);
      return list;
    }));
  } catch { /* no holidays known — BambooHR still checks */ }

  const halfDay = !!input.half_day && start === end;
  const plan = planDays({ start, end, units, halfDay, defaultHours: default_hours, holidays });
  let amount = plan.amount;
  let dates = plan.dates;
  if (input.amount != null && input.amount !== '') {
    const a = Number(input.amount);
    if (!(a > 0 && a <= 2000)) throw bad('The amount looks wrong', 400);
    if (a !== amount) dates = undefined; // their own number — let BambooHR spread it
    amount = round2(a);
  }
  if (!(amount > 0)) throw bad('Those days are already off (weekend or holiday) — nothing to ask for', 400);

  const body = { status: 'requested', start, end, timeOffTypeId: Number(typeId), amount, notes: note ? [{ from: 'employee', note }] : [], ...(dates ? { dates } : {}) };
  const r = await call(c, 'PUT', `/employees/${encodeURIComponent(c.employee_id)}/time_off/request`, {
    body, messages: { 403: 'BambooHR won’t let you ask for this kind of time off.', 409: 'You already have time off on some of those days.' },
  }).catch((e) => { noteError(userId, e); throw e; });
  forget(userId);
  return { ok: true, amount, units, request: r && typeof r === 'object' && r.id != null && r.start ? normRequest(r) : (r?.id ? { id: String(r.id) } : null) };
}

/** Cancel one of MY pending requests. */
async function cancelTimeOff(userId, requestId) {
  const id = String(requestId || '');
  if (!/^\d+$/.test(id)) throw bad('Unknown request', 400);
  const c = await credsFor(userId);
  const today = W.localDate(Date.now());
  const mine = await myRequests(c, userId, today, { force: true });
  const r = mine.find(x => x.id === id);
  if (!r) throw bad('That request isn’t one of yours', 404, 'not_found');
  if (r.status !== 'requested') throw bad(`This request is already ${r.status === 'canceled' ? 'cancelled' : r.status} — it can’t be cancelled here`, 409, 'conflict');
  const messages = { 409: 'This request can’t be cancelled anymore.', 403: 'BambooHR won’t let you cancel this request — ask HR.' };
  try {
    await call(c, 'POST', `/time-off/requests/${id}/cancellations`, { messages });
  } catch (e) {
    if (![404, 405].includes(e.bambooStatus)) throw e;
    await call(c, 'PUT', `/time_off/requests/${id}/status`, { body: { status: 'canceled', note: 'Cancelled from CP' }, messages });
  }
  forget(userId);
  return { ok: true };
}

/**
 * My month (Home's clock card, 25 Nov 2026): hours this month against what's expected so far — workdays (Sun–Thu) that
 * aren't a holiday or your time off, 9h each; today counts once it's over. → { month, hours_to_date, expected_to_date,
 * expected_month, pct, today_hours, days_worked, days_short, days_missing, open }
 */
async function monthFor(userId, month) {
  let c;
  try { c = await credsFor(userId); } catch (e) { if (e.code === 'not_connected') return { connected: false }; throw e; }
  const nowMs = Date.now();
  const today = W.localDate(nowMs);
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : today.slice(0, 7);
  const from = `${m}-01`;
  const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (from > today) return { connected: true, month: m, hours_to_date: 0, expected_to_date: 0, expected_month: 0, pct: null };
  const to = last < today ? last : today;
  const [entries, out] = await Promise.all([entriesFor(c, userId, from, to), whosOutFor(c, userId, from, last).catch(() => [])]);
  const totals = dayTotals(entries, today, nowMs);
  let hoursToDate = 0, expectedToDate = 0, expectedMonth = 0, worked = 0, short = 0, missing = 0;
  for (let d = from; d <= last; d = W.addDays(d, 1)) {
    const off = offOn(out, c.employee_id, d);
    const workday = W.dow(d) <= 4 && !off;
    const t = totals[d];
    if (workday) expectedMonth += EXPECTED_DAY_HOURS;
    if (d < today) {
      if (workday) expectedToDate += EXPECTED_DAY_HOURS;
      if (t) { hoursToDate += t.hours; worked += 1; if (workday && t.hours < EXPECTED_DAY_HOURS - 0.25) short += 1; } else if (workday) missing += 1;
    }
  }
  const t0 = totals[today];
  return {
    connected: true, month: m, from, to: last, today,
    hours_to_date: round2(hoursToDate), expected_to_date: expectedToDate, expected_month: expectedMonth,
    pct: expectedToDate ? Math.round((hoursToDate / expectedToDate) * 100) : null,
    today_hours: t0 ? round2(t0.hours) : 0, open: !!t0?.open, days_worked: worked, days_short: short, days_missing: missing,
    expected_day_hours: EXPECTED_DAY_HOURS,
  };
}

module.exports = {
  EXPECTED_DAY_HOURS, ensure, connect, disconnect, status, me, clockState, clockIn, clockOut, requestTimeOff, cancelTimeOff,
  credsFor, connectedRows, forget, noteError, monthFor, entriesFor, whosOutFor, normBalances,
  // pure (tested)
  cleanKey, cleanSubdomain, anniversary, normProfile, normEntry, entryHours, dayTotals, offOn, planDays, normRequest, clockFrom, isYmd,
};
