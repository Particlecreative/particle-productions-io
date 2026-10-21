/**
 * BambooHR clock in / clock out for the studio (read-only, server-side).
 * Uses the manager's own API key, so it sees exactly what that manager sees in BambooHR
 * (their direct reports' timesheets). Credentials: pasted in Studio → Connections (stored sealed),
 * or env BAMBOOHR_SUBDOMAIN + BAMBOOHR_API_KEY.
 */
const { cached, clearCache } = require('../monday');
const W = require('../creative/week');
const { getSecret } = require('./secrets');

async function creds() {
  if (process.env.BAMBOOHR_API_KEY && process.env.BAMBOOHR_SUBDOMAIN) {
    return { subdomain: process.env.BAMBOOHR_SUBDOMAIN, api_key: process.env.BAMBOOHR_API_KEY, source: 'env' };
  }
  const s = await getSecret('bamboohr');
  return s?.api_key && s?.subdomain ? { ...s, source: 'settings' } : null;
}
async function configured() { return !!(await creds()); }

async function bhr(path, params = {}, override = null) {
  const c = override || await creds();
  if (!c) { const e = new Error('BambooHR is not connected'); e.status = 400; throw e; }
  const url = new URL(`https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(c.subdomain)}/v1${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const auth = Buffer.from(`${c.api_key}:x`).toString('base64');
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = new Error(res.status === 401 ? 'BambooHR rejected the API key' : res.status === 403 ? 'BambooHR: this key can’t see that data' : `BambooHR ${res.status}`);
    err.status = 502;
    err.bambooStatus = res.status;
    throw err;
  }
  return res.json();
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** Employees the key can see: [{ id, name, email }] (cached 6h). */
function directory() {
  return cached('bhr:directory', 6 * 3600000, async () => {
    const d = await bhr('/employees/directory');
    return (d.employees || []).map(e => ({
      id: String(e.id),
      name: e.displayName || [e.firstName, e.lastName].filter(Boolean).join(' '),
      email: (e.workEmail || '').toLowerCase() || null,
    }));
  });
}

/**
 * Clock data for studio people in [from, to] (Israel dates).
 * people: [{ id (Monday), name, email }] → { matched: { mondayId: bambooId }, unmatched: [mondayId], days: { mondayId: { date: { in, out, hours, open } } } }
 */
async function clockFor(people, from, to) {
  const emps = await directory();
  const byEmail = new Map(emps.filter(e => e.email).map(e => [e.email, e]));
  const byName = new Map(emps.map(e => [norm(e.name), e]));
  const matched = {};
  const unmatched = [];
  for (const p of people) {
    const e = (p.email && byEmail.get(String(p.email).toLowerCase())) || byName.get(norm(p.name));
    if (e) matched[p.id] = e.id; else unmatched.push(p.id);
  }
  const ids = [...new Set(Object.values(matched))];
  const out = { matched, unmatched, days: {}, since: null };
  if (!ids.length) return out;
  const entries = await cached(`bhr:ts:${from}:${to}:${ids.join(',')}`, 10 * 60000, () =>
    bhr('/time_tracking/timesheet_entries', { start: from, end: to, employeeIds: ids.join(',') }));
  const toMonday = {};
  for (const [mid, bid] of Object.entries(matched)) (toMonday[bid] = toMonday[bid] || []).push(mid);
  for (const e of Array.isArray(entries) ? entries : []) {
    if (e.date && (!out.since || e.date < out.since)) out.since = e.date;
    const date = e.date || (e.start ? W.localDate(Date.parse(e.start)) : null);
    if (!date) continue;
    const startMs = e.start ? Date.parse(e.start) : NaN;
    const endMs = e.end ? Date.parse(e.end) : NaN;
    const hours = Number.isFinite(e.hours) ? e.hours
      : (Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 3600000 : 0);
    for (const mid of toMonday[String(e.employeeId)] || []) {
      const day = ((out.days[mid] = out.days[mid] || {})[date] = out.days[mid][date] || { in: null, out: null, hours: 0, open: false, intervals: [] });
      if (Number.isFinite(startMs)) day.intervals.push([startMs, Number.isFinite(endMs) ? endMs : Math.min(Date.now(), startMs + 14 * 3600000)]);
      if (Number.isFinite(startMs) && (!day.in || startMs < Date.parse(day.in))) day.in = new Date(startMs).toISOString();
      if (Number.isFinite(endMs) && (!day.out || endMs > Date.parse(day.out))) day.out = new Date(endMs).toISOString();
      if (e.type === 'clock' && e.start && !e.end) day.open = true;
      day.hours = Math.round((day.hours + hours) * 100) / 100;
    }
  }
  return out;
}

/**
 * Clocked-in intervals per Monday person, for limiting effort to real working time.
 * Matched people get their intervals (an empty list on days they never clocked in);
 * unmatched people are left out so they fall back to the default work hours.
 */
function presenceFrom(clock) {
  const out = {};
  for (const mid of Object.keys(clock.matched || {})) {
    const iv = Object.values(clock.days?.[mid] || {}).flatMap(d => d.intervals || []);
    out[mid] = iv.sort((a, b) => a[0] - b[0]).reduce((acc, [a, b]) => {
      const last = acc[acc.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b); else acc.push([a, b]);
      return acc;
    }, []);
  }
  return out;
}

/**
 * Who's out in [from, to]: time off per Monday person + company holidays (everyone).
 * → { byPerson: { mondayId: [{ start, end, type, name }] }, holidays: [{ start, end, name }] }
 */
async function whosOut(people, from, to) {
  const emps = await directory();
  const byEmail = new Map(emps.filter(e => e.email).map(e => [e.email, e]));
  const byName = new Map(emps.map(e => [norm(e.name), e]));
  const toMonday = {};
  for (const p of people) {
    const e = (p.email && byEmail.get(String(p.email).toLowerCase())) || byName.get(norm(p.name));
    if (e) (toMonday[e.id] = toMonday[e.id] || []).push(p.id);
  }
  const rows = await cached(`bhr:out:${from}:${to}`, 30 * 60000, () => bhr('/time_off/whos_out/', { start: from, end: to }));
  const out = { byPerson: {}, holidays: [] };
  for (const r of Array.isArray(rows) ? rows : []) {
    const entry = { start: r.start, end: r.end || r.start, type: r.type === 'holiday' ? 'holiday' : 'time_off', name: r.name || null };
    if (r.type === 'holiday') { out.holidays.push(entry); continue; }
    for (const mid of toMonday[String(r.employeeId)] || []) (out.byPerson[mid] = out.byPerson[mid] || []).push(entry);
  }
  return out;
}

/** Check a key before saving it: how many employees it can see. */
async function testConnection(c) {
  const d = await bhr('/employees/directory', {}, c);
  return { employees_visible: (d.employees || []).length };
}

function resetCache() { clearCache('bhr:'); }

module.exports = { configured, clockFor, presenceFrom, whosOut, testConnection, resetCache, creds };
