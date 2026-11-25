/**
 * HR panel for admins (Tomer, 25 Nov 2026): everyone, from CP, through the COMPANY BambooHR connection that Studio →
 * Connections already holds (lib/studio/bamboohr creds()). Today board (in now / not in yet / done / off), a Sun–Thu
 * timesheet grid for any week, time-off requests waiting for approval (approve / deny), who's out for the next 30 days
 * (+ holidays), and which CP users connected their own BambooHR (My HR) and their own Monday.
 * BambooHR people are matched to CP users by the employee id their own key gave (My HR), then work email, then name.
 */
const db = require('../../db');
const W = require('../creative/week');
const company = require('../studio/bamboohr');
const store = require('../notify/store');
const P = require('./personal');
const { call, memo, forget } = require('./bamboo');

const bad = (msg, status = 400, code = null) => Object.assign(new Error(msg), { status, ...(code ? { code } : {}) });
const round2 = (n) => Math.round(n * 100) / 100;

async function companyCreds() {
  try { return await company.creds(); } catch { return null; }
}

// ── pure (tested) ─────────────────────────────────────────────────────────────────────────────────────────────────────

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z֐-׿]+/g, ' ').trim();

/** Sunday (YYYY-MM-DD) of the week a date falls in. */
function weekStartOf(date) {
  const d = P.isYmd(date) ? date : W.localDate(Date.now());
  return W.addDays(d, -W.dow(d));
}

/**
 * CP users ↔ BambooHR employees. users: [{ id, name, email }], employees: [{ id, name, first_name, last_name, preferred_name, email }],
 * links: { cpUserId: employeeId } from My HR (their own key said who they are). → { byUser: Map, byEmployee: Map }
 */
function matchPeople(users, employees, links = {}) {
  const byUser = new Map();
  const byEmployee = new Map();
  const emps = new Map(employees.map(e => [String(e.id), e]));
  const take = (u, e) => { if (!e || byUser.has(String(u.id)) || byEmployee.has(String(e.id))) return false; byUser.set(String(u.id), e); byEmployee.set(String(e.id), u); return true; };
  for (const u of users) if (links[String(u.id)]) take(u, emps.get(String(links[String(u.id)])));
  const byEmail = new Map(employees.filter(e => e.email).map(e => [String(e.email).toLowerCase().trim(), e]));
  for (const u of users) if (u.email) take(u, byEmail.get(String(u.email).toLowerCase().trim()));
  const byName = new Map();
  for (const e of employees) {
    for (const n of [e.name, [e.first_name, e.last_name].filter(Boolean).join(' '), [e.preferred_name, e.last_name].filter(Boolean).join(' ')]) {
      const k = norm(n);
      if (k && !byName.has(k)) byName.set(k, e);
    }
  }
  for (const u of users) take(u, byName.get(norm(u.name)));
  return { byUser, byEmployee };
}

/** One person's day for the Today board. */
function dayState({ day, off, holiday, workday }) {
  if (day?.open) return { state: 'in', since: day.in, hours: day.hours };
  if (day && day.entries) return { state: 'done', in: day.in, out: day.out, hours: day.hours, no_out: !!day.no_out };
  if (off) return { state: 'off', label: 'Time off', until: off.end || off.start };
  if (holiday) return { state: 'off', label: holiday.name || 'Holiday' };
  return { state: workday ? 'not_in' : 'weekend' };
}

// ── BambooHR reads (company key) ──────────────────────────────────────────────────────────────────────────────────────

async function directory(c) {
  return memo(`hrteam:${c.subdomain}|dir`, 6 * 3600 * 1000, async () => {
    try {
      const d = await call(c, 'GET', '/employees/directory');
      return (d?.employees || []).map(e => ({
        id: String(e.id), name: e.displayName || [e.preferredName || e.firstName, e.lastName].filter(Boolean).join(' '),
        first_name: e.firstName || null, last_name: e.lastName || null, preferred_name: e.preferredName || null,
        email: e.workEmail ? String(e.workEmail).toLowerCase() : null, job_title: e.jobTitle || null, department: e.department || null,
        photo_url: /^https:\/\//.test(String(e.photoUrl || '')) ? e.photoUrl : null,
      }));
    } catch (e) {
      if (e.bambooStatus !== 403 && e.bambooStatus !== 404) throw e;
      // the directory is switched off for this company — BambooHR users still say who's who
      const u = await call(c, 'GET', '/meta/users');
      return Object.values(u || {}).filter(x => x && x.employeeId && x.status !== 'disabled').map(x => ({
        id: String(x.employeeId), name: [x.firstName, x.lastName].filter(Boolean).join(' '), first_name: x.firstName || null, last_name: x.lastName || null,
        preferred_name: null, email: x.email ? String(x.email).toLowerCase() : null, job_title: null, department: null, photo_url: null,
      }));
    }
  });
}

async function entries(c, from, to, ids) {
  if (!ids.length || from > to) return [];
  const chunks = [];
  for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
  const lists = await Promise.all(chunks.map(ch => memo(`hrteam:${c.subdomain}|ts:${from}:${to}:${ch.join(',')}`, 60 * 1000, () =>
    call(c, 'GET', '/time_tracking/timesheet_entries', { query: { start: from, end: to, employeeIds: ch.join(',') } }))));
  return lists.flatMap(l => (Array.isArray(l) ? l : [])).map(P.normEntry).filter(e => e && e.employee_id && e.date);
}

async function whosOut(c, from, to) {
  const raw = await memo(`hrteam:${c.subdomain}|out:${from}:${to}`, 5 * 60000, () => call(c, 'GET', '/time_off/whos_out/', { query: { start: from, end: to } }));
  return (Array.isArray(raw) ? raw : []).filter(r => P.isYmd(r?.start)).map(r => ({
    id: r.id != null ? String(r.id) : null, type: r.type === 'holiday' ? 'holiday' : 'time_off', name: r.name || null,
    start: r.start, end: r.end || r.start, employeeId: r.employeeId != null ? String(r.employeeId) : null,
  }));
}

async function pending(c, today) {
  const raw = await memo(`hrteam:${c.subdomain}|pending`, 60 * 1000, () => call(c, 'GET', '/time_off/requests', {
    query: { action: 'approve', status: 'requested', start: W.addDays(today, -365), end: W.addDays(today, 365) },
  }));
  return (Array.isArray(raw) ? raw : []).map(P.normRequest).filter(r => r.status === 'requested')
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

// ── CP side ───────────────────────────────────────────────────────────────────────────────────────────────────────────

async function cpUsers() {
  const { rows } = await db.query(`SELECT id::text AS id, name, email, role, avatar_url FROM users
    WHERE deleted_at IS NULL AND COALESCE(active, true) ORDER BY name`);
  return rows;
}

async function mondayUserIds() {
  try {
    const { rows } = await db.query('SELECT user_id FROM user_monday');
    return new Set(rows.map(r => String(r.user_id)));
  } catch { return new Set(); } // nobody connected Monday yet (the table is made on first use)
}

/** CP users with their My HR and Monday connections. */
async function connections() {
  const [users, hr, monday] = await Promise.all([cpUsers(), P.connectedRows(), mondayUserIds()]);
  const hrBy = new Map(hr.map(r => [String(r.user_id), r]));
  return users.map(u => {
    const h = hrBy.get(u.id);
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, avatar_url: u.avatar_url || null,
      hr: h ? { connected: true, employee_id: h.employee_id, name: h.name, connected_at: h.connected_at, last_ok_at: h.last_ok_at, error: h.last_error || null } : { connected: false },
      monday: monday.has(u.id),
    };
  });
}

// ── the panel ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Everything the HR panel shows. week = any date in the week to show (default: this week). */
async function team({ week } = {}) {
  const nowMs = Date.now();
  const today = W.localDate(nowMs);
  const thisWeek = weekStartOf(today);
  const ws = weekStartOf(week || today);
  const days = Array.from({ length: 7 }, (_, i) => W.addDays(ws, i));
  const we = days[6];
  const conns = await connections();
  const base = { today, this_week: thisWeek, week_start: ws, days, expected_day_hours: P.EXPECTED_DAY_HOURS, connections: conns, generated_at: new Date(nowMs).toISOString() };

  const c = await companyCreds();
  if (!c) return { ...base, connected: false, reason: 'The company BambooHR isn’t connected yet. An admin connects it in Studio → Connections.' };
  if (ws < W.addDays(today, -364)) throw bad('BambooHR only gives timesheets for the last 12 months', 400);

  let emps;
  try {
    emps = await directory(c);
  } catch (e) {
    return { ...base, connected: true, error: e.message };
  }
  const ids = emps.map(e => e.id);
  const recentFrom = W.addDays(today, -13);
  const outFrom = ws < today ? ws : today;
  const outTo = W.addDays(today, 30) > we ? W.addDays(today, 30) : we;

  const [recentR, weekR, outR, pendR] = await Promise.allSettled([
    entries(c, recentFrom, today, ids),
    ws >= recentFrom ? Promise.resolve(null) : entries(c, ws, we < today ? we : today, ids),
    whosOut(c, outFrom, outTo),
    pending(c, today),
  ]);
  const recent = recentR.status === 'fulfilled' ? recentR.value : [];
  const weekEntries = weekR.status === 'fulfilled' ? (weekR.value || recent) : [];
  const out = outR.status === 'fulfilled' ? outR.value : [];
  const holidays = out.filter(r => r.type === 'holiday');
  const timeOff = out.filter(r => r.type === 'time_off');

  // who's who
  const links = Object.fromEntries(conns.filter(x => x.hr.connected && x.hr.employee_id).map(x => [x.id, x.hr.employee_id]));
  const { byEmployee } = matchPeople(conns, emps, links);
  const tracked = new Set([...recent, ...weekEntries].map(e => e.employee_id));
  const person = (e) => {
    const u = byEmployee.get(e.id);
    return { id: e.id, name: e.name, job_title: e.job_title, department: e.department, photo_url: e.photo_url, email: e.email,
      cp_user_id: u?.id || null, hr_connected: !!u?.hr?.connected, tracked: tracked.has(e.id) };
  };
  const empBy = new Map(emps.map(e => [e.id, e]));
  const group = (list) => { const m = new Map(); for (const x of list) (m.get(x.employee_id) || m.set(x.employee_id, []).get(x.employee_id)).push(x); return m; };

  // Today board
  const todayHoliday = holidays.find(h => h.start <= today && h.end >= today) || null;
  const recentBy = group(recent.filter(e => e.date === today || (e.start && !e.end && e.date === W.addDays(today, -1))));
  const board = [];
  for (const e of emps) {
    const own = recentBy.get(e.id) || [];
    const day = P.dayTotals(own.filter(x => x.date === today), today, nowMs)[today] || null;
    const runningFromYesterday = own.some(x => x.date < today && x.start && !x.end);
    const off = timeOff.find(r => r.employeeId === e.id && r.start <= today && r.end >= today) || null;
    if (!tracked.has(e.id) && !off && !byEmployee.has(e.id)) continue;
    const st = runningFromYesterday && !day ? { state: 'in', since: own.find(x => x.start && !x.end)?.start, hours: null, from_yesterday: true }
      : dayState({ day, off, holiday: todayHoliday, workday: W.dow(today) <= 4 });
    board.push({ ...person(e), ...st });
  }

  // Week grid
  const weekBy = group(weekEntries.filter(e => e.date >= ws && e.date <= we));
  const grid = [];
  for (const e of emps) {
    const own = weekBy.get(e.id) || [];
    const isTracked = tracked.has(e.id) || own.length > 0;
    const offs = timeOff.filter(r => r.employeeId === e.id && r.start <= we && r.end >= ws);
    if (!isTracked && !byEmployee.has(e.id) && !offs.length) continue;
    const totals = P.dayTotals(own, today, nowMs);
    let total = 0;
    let expected = 0;
    let expectedToDate = 0;
    let totalToDate = 0;
    const cells = {};
    for (const d of days) {
      const t = totals[d];
      const dow = W.dow(d);
      const hol = holidays.find(h => h.start <= d && h.end >= d);
      const off = offs.find(r => r.start <= d && r.end >= d);
      const workday = dow <= 4;
      if (workday && !hol && !off) { expected += P.EXPECTED_DAY_HOURS; if (d < today) expectedToDate += P.EXPECTED_DAY_HOURS; }   // finished days only
      if (t) { total += t.hours; if (d < today) totalToDate += t.hours; }
      cells[d] = {
        hours: t ? t.hours : 0, in: t?.in || null, out: t?.out || null, open: !!t?.open, no_out: !!t?.no_out,
        off: off ? 'Time off' : hol ? (hol.name || 'Holiday') : null,
        missing: workday && !t && !off && !hol && d < today && isTracked,
        short: workday && !!t && !t.open && !off && !hol && t.hours < P.EXPECTED_DAY_HOURS - 0.25 && d <= today,
      };
    }
    grid.push({ ...person(e), cells, total: round2(total), total_to_date: round2(totalToDate), expected, expected_to_date: expectedToDate });
  }
  grid.sort((a, b) => (b.tracked - a.tracked) || a.name.localeCompare(b.name));

  // Waiting for approval, who's out
  const requests = (pendR.status === 'fulfilled' ? pendR.value : []).map(r => {
    const e = empBy.get(String(r.employee_id));
    const u = e ? byEmployee.get(e.id) : null;
    return { ...r, name: r.name || e?.name || 'Someone', photo_url: e?.photo_url || null, job_title: e?.job_title || null, cp_user_id: u?.id || null };
  });
  const in30 = W.addDays(today, 30);
  const outList = timeOff.filter(r => r.end >= today && r.start <= in30).map(r => {
    const e = empBy.get(String(r.employeeId));
    return { id: r.id, employee_id: r.employeeId, name: e?.name || r.name, photo_url: e?.photo_url || null, start: r.start, end: r.end };
  }).sort((a, b) => a.start.localeCompare(b.start) || String(a.name).localeCompare(String(b.name)));

  // employees whose BambooHR match is known, for the connections list
  const empOfUser = new Map([...byEmployee.entries()].map(([eid, u]) => [u.id, empBy.get(eid)]));
  return {
    ...base, connected: true, subdomain: c.subdomain,
    connections: conns.map(x => ({ ...x, bamboo: empOfUser.get(x.id) ? { id: empOfUser.get(x.id).id, name: empOfUser.get(x.id).name } : null })),
    board, grid, requests,
    whos_out: { from: today, to: in30, people: outList, holidays: holidays.filter(h => h.end >= today && h.start <= in30).map(h => ({ name: h.name, start: h.start, end: h.end })) },
    holidays_week: holidays.filter(h => h.start <= we && h.end >= ws).map(h => ({ name: h.name, start: h.start, end: h.end })),
    errors: {
      timesheets: recentR.status === 'rejected' ? recentR.reason?.message : (weekR.status === 'rejected' ? weekR.reason?.message : null),
      whos_out: outR.status === 'rejected' ? outR.reason?.message : null,
      requests: pendR.status === 'rejected' ? pendR.reason?.message : null,
    },
  };
}

const fmtRange = (a, b) => {
  const f = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return !b || a === b ? f(a) : `${f(a)} – ${f(b)}`;
};

/** Approve or deny a time-off request with the company key; tells the person in CP when we know who they are. */
async function answer(id, decision, { note, actor } = {}) {
  const rid = String(id || '');
  if (!/^\d+$/.test(rid)) throw bad('Unknown request', 400);
  const c = await companyCreds();
  if (!c) throw bad('The company BambooHR isn’t connected — connect it in Studio → Connections', 409, 'company_not_connected');
  const n = String(note || '').trim().slice(0, 500);
  const today = W.localDate(Date.now());
  const before = await pending(c, today).catch(() => []);
  const req = before.find(r => r.id === rid) || null;
  const messages = { 409: 'Someone already answered this request.', 403: 'The company BambooHR key isn’t allowed to answer this request.', 404: 'That request isn’t there anymore.' };
  const path = decision === 'approve' ? 'approvals' : 'denials';
  try {
    await call(c, 'POST', `/time-off/requests/${rid}/${path}`, { body: n ? { managerNote: n } : {}, messages });
  } catch (e) {
    if (![404, 405].includes(e.bambooStatus)) throw e;
    await call(c, 'PUT', `/time_off/requests/${rid}/status`, { body: { status: decision === 'approve' ? 'approved' : 'denied', note: n }, messages });
  }
  forget(`hrteam:${c.subdomain}|pending`);
  forget(`hrteam:${c.subdomain}|out:`);

  // Tell them in CP (only when we know which CP user it is)
  if (req?.employee_id) {
    try {
      const conns = await connections();
      const emps = await directory(c).catch(() => []);
      const links = Object.fromEntries(conns.filter(x => x.hr.connected && x.hr.employee_id).map(x => [x.id, x.hr.employee_id]));
      const u = matchPeople(conns, emps, links).byEmployee.get(String(req.employee_id));
      if (u) {
        P.forget(u.id);
        const what = `${req.type?.name || 'time off'} (${fmtRange(req.start, req.end)})`;
        await store.notify({
          userIds: [u.id], type: 'hr', link: '/my-hr', actor: actor || null, dedupe: `hr:req:${rid}:${decision}`,
          message: decision === 'approve' ? `Your ${what} was approved ✓${n ? ` — “${n}”` : ''}` : `Your ${what} wasn’t approved${n ? ` — “${n}”` : ''}`,
          meta: { action: 'time_off', status: decision === 'approve' ? 'approved' : 'denied', request_id: rid },
        });
      }
    } catch (e) { console.warn('[hr team] notify', e.message); }
  }
  return { ok: true, id: rid, status: decision === 'approve' ? 'approved' : 'denied' };
}

const approve = (id, opts) => answer(id, 'approve', opts);
const deny = (id, opts) => answer(id, 'deny', opts);

module.exports = { team, approve, deny, connections, matchPeople, weekStartOf, dayState };
