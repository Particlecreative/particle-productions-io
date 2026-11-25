/**
 * My employees (Tomer, 25 Nov 2026: "see my employees' working-hours sheet — interpret it for me, with what they worked on
 * those days (which tickets), approve vacation days, how much vacation is left, an hours-to-the-end-of-the-month dashboard
 * with % — who did more, who less") + the team's days off for My Studio ("show the team when they're OOO / on vacation / sick").
 * All through the COMPANY BambooHR connection (Studio → Connections); tickets from Time tracking (Monday status history).
 */
const W = require('../creative/week');
const P = require('./personal');
const T = require('./team');
const { call, memo } = require('./bamboo');

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z֐-׿]+/g, ' ').trim();
const lastOf = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : null);
const fmtH = (h) => { const m = Math.round((h || 0) * 60); return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`; };

async function creds() {
  const c = await T.companyCreds();
  if (!c) throw Object.assign(new Error('The company BambooHR isn’t connected yet — an admin connects it in Studio → Connections'), { status: 424, code: 'company_not_connected' });
  return c;
}

/** Approved time off with its type (Vacation, Sick…) in [from, to] — who's out doesn't say the type. */
async function approvedOff(c, from, to) {
  const raw = await memo(`hrins:${c.subdomain}|off:${from}:${to}`, 5 * 60000, () => call(c, 'GET', '/time_off/requests', { query: { status: 'approved', start: from, end: to } }).catch(() => []));
  return (Array.isArray(raw) ? raw : []).map(P.normRequest).filter(r => r.start && r.end && r.start <= to && r.end >= from);
}

/** A kind for the colour and the word: vacation / sick / other. */
function kindOf(typeName) {
  const n = norm(typeName);
  if (/sick|illness|מחלה/.test(n)) return 'sick';
  if (/vacation|holiday|pto|annual|leave|חופש/.test(n)) return 'vacation';
  return 'other';
}

/** Days a request covers inside [from, to] that are workdays (Sun–Thu) (pure). */
function workdaysIn(start, end, from, to) {
  let n = 0;
  for (let d = start < from ? from : start; d <= (end > to ? to : end); d = W.addDays(d, 1)) if (W.dow(d) <= 4) n++;
  return n;
}

// ── the month dashboard ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Everyone's month so far: hours on finished days against what's expected (workdays not off × 9h), %, the whole month's
 * target, days missing / short / no clock-out, time off taken, vacation left, average start. Sorted by %.
 */
async function month({ month: mIn } = {}) {
  const c = await creds();
  const nowMs = Date.now();
  const today = W.localDate(nowMs);
  const m = /^\d{4}-\d{2}$/.test(String(mIn || '')) ? mIn : today.slice(0, 7);
  const from = `${m}-01`;
  const last = lastOf(m);
  const to = last < today ? last : today;
  if (from > today) return { month: m, people: [], future: true };
  const emps = await T.directory(c);
  const ids = emps.map(e => e.id);
  const [entries, out, offs, conns] = await Promise.all([
    T.entries(c, from, to, ids).catch(() => []),
    T.whosOut(c, from, last).catch(() => []),
    approvedOff(c, from, last),
    T.connections().catch(() => []),
  ]);
  const holidays = out.filter(r => r.type === 'holiday');
  const tracked = new Set(entries.map(e => e.employee_id));
  const byEmp = new Map();
  for (const e of entries) (byEmp.get(e.employee_id) || byEmp.set(e.employee_id, []).get(e.employee_id)).push(e);
  const links = Object.fromEntries(conns.filter(x => x.hr?.connected && x.hr.employee_id).map(x => [x.id, x.hr.employee_id]));
  const { byEmployee } = T.matchPeople(conns, emps, links);
  const balances = await balancesFor(c, emps.filter(e => tracked.has(e.id) || byEmployee.has(e.id)).map(e => e.id), today);
  const people = [];
  for (const e of emps) {
    const own = byEmp.get(e.id) || [];
    const myOff = offs.filter(r => r.employee_id === e.id);
    if (!own.length && !byEmployee.has(e.id) && !myOff.length) continue;
    const totals = P.dayTotals(own, today, nowMs);
    let hours = 0, expected = 0, expectedMonth = 0, worked = 0, short = 0, missing = 0, noOut = 0, over = 0;
    const starts = [];
    const days = {};
    for (let d = from; d <= last; d = W.addDays(d, 1)) {
      const hol = holidays.find(h => h.start <= d && h.end >= d);
      const off = myOff.find(r => r.start <= d && r.end >= d);
      const workday = W.dow(d) <= 4 && !hol && !off;
      const t = totals[d];
      if (workday) expectedMonth += P.EXPECTED_DAY_HOURS;
      if (d < today) {
        if (workday) expected += P.EXPECTED_DAY_HOURS;
        if (t) {
          hours += t.hours; worked++;
          if (t.no_out) noOut++;
          if (workday && t.hours < P.EXPECTED_DAY_HOURS - 0.25) short++;
          if (t.hours > P.EXPECTED_DAY_HOURS + 0.5) over++;
          if (t.in) starts.push(Number(hm(t.in).replace(':', '.')));
        } else if (workday && own.length) missing++;
      }
      days[d] = t ? round2(t.hours) : off ? kindOf(off.type?.name) : hol ? 'holiday' : 0;
    }
    const offDays = myOff.reduce((a, r) => a + workdaysIn(r.start, r.end, from, last), 0);
    const avgStart = starts.length ? starts.reduce((a, x) => a + Math.floor(x) * 60 + Math.round((x % 1) * 100), 0) / starts.length : null;
    const u = byEmployee.get(e.id);
    people.push({
      id: e.id, name: e.name, job_title: e.job_title, department: e.department, photo_url: e.photo_url, cp_user_id: u?.id || null, hr_connected: !!u?.hr?.connected,
      tracked: own.length > 0, hours_to_date: round2(hours), expected_to_date: expected, expected_month: expectedMonth,
      pct: expected ? Math.round((hours / expected) * 100) : null, remaining_to_target: round2(Math.max(0, expectedMonth - hours)),
      days_worked: worked, days_short: short, days_missing: missing, days_no_out: noOut, days_over: over, off_days: offDays,
      off: myOff.map(r => ({ id: r.id, type: r.type?.name, kind: kindOf(r.type?.name), start: r.start, end: r.end })),
      avg_start: avgStart != null ? `${String(Math.floor(avgStart / 60)).padStart(2, '0')}:${String(Math.round(avgStart % 60)).padStart(2, '0')}` : null,
      balances: balances[e.id] || null, days,
    });
  }
  people.sort((a, b) => (b.tracked - a.tracked) || ((b.pct ?? -1) - (a.pct ?? -1)) || a.name.localeCompare(b.name));
  const withPct = people.filter(p => p.pct != null);
  return {
    month: m, from, to: last, today, expected_day_hours: P.EXPECTED_DAY_HOURS,
    team: {
      hours_to_date: round2(people.reduce((a, p) => a + p.hours_to_date, 0)), expected_to_date: people.reduce((a, p) => a + p.expected_to_date, 0),
      pct: withPct.length ? Math.round(withPct.reduce((a, p) => a + p.pct, 0) / withPct.length) : null,
      off_days: people.reduce((a, p) => a + p.off_days, 0), missing: people.reduce((a, p) => a + p.days_missing, 0), no_out: people.reduce((a, p) => a + p.days_no_out, 0),
    },
    holidays: holidays.map(h => ({ name: h.name, start: h.start, end: h.end })),
    people,
  };
}

/** Vacation / sick left per employee (company key; whoever the key may see). → { id: [{ name, kind, balance, units, used_ytd }] } */
async function balancesFor(c, ids, today) {
  const out = {};
  let i = 0;
  const run = async () => {
    while (i < ids.length) {
      const id = ids[i++];
      try {
        const raw = await memo(`hrins:${c.subdomain}|bal:${id}:${today}`, 3600 * 1000, () => call(c, 'GET', `/employees/${encodeURIComponent(id)}/time_off/calculator`, { query: { end: today } }));
        out[id] = P.normBalances(raw).map(b => ({ name: b.name, kind: kindOf(b.name), balance: b.balance, units: b.units, used_ytd: b.used_ytd, unlimited: b.unlimited }));
      } catch { out[id] = null; }
    }
  };
  await Promise.all([run(), run(), run(), run()]);
  return out;
}

// ── one person's days, read for you ────────────────────────────────────────────────────────────────────────────────
/** The Monday person for a BambooHR employee (Time tracking's people): the clock match, then e-mail, then name. */
function mondayIdFor(emp, data) {
  const people = Object.values(data?.people || {});
  const hit = people.find(p => p.bamboo_id && String(p.bamboo_id) === String(emp.id))
    || (emp.email && people.find(p => p.email && p.email.toLowerCase() === emp.email))
    || people.find(p => norm(p.name) === norm(emp.name))
    || people.find(p => norm(p.name).split(' ')[0] === norm(emp.name).split(' ')[0] && norm(p.name).split(' ').slice(-1)[0] === norm(emp.name).split(' ').slice(-1)[0]);
  return hit ? String(hit.id) : null;
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * The words for a day (pure): how long, from–to, what it was spent on, what moved, and anything odd.
 * day = { date, hours, in, out, open, no_out, off, holiday, workday, tasks: [{ name, ms }], moves: [{ name, to, at }] }
 */
function readDay(day, expected = 9) {
  if (day.off) return `${day.off} — off.`;
  if (day.holiday) return `${day.holiday} — company holiday.`;
  if (!day.hours) return day.workday ? 'No clock-in.' : 'Weekend.';
  const parts = [];
  const len = day.hours >= expected - 1 ? (day.hours > expected + 0.5 ? 'Long day' : 'Full day') : day.hours >= expected / 2 ? 'Short day' : 'A few hours';
  parts.push(`${len}: ${fmtH(day.hours)}${day.in ? ` (${hm(day.in)}–${day.open ? 'now' : day.out ? hm(day.out) : '?'})` : ''}.`);
  const tasks = (day.tasks || []).filter(t => t.ms >= 10 * 60000).sort((a, b) => b.ms - a.ms);
  const workedMs = tasks.reduce((a, t) => a + t.ms, 0);
  if (tasks.length) {
    const top = tasks.slice(0, 3).map(t => `${t.name} (${fmtH(t.ms / 3600000)})`);
    parts.push(`Worked on ${top.join(', ')}${tasks.length > 3 ? ` +${tasks.length - 3} more` : ''}.`);
    const gap = day.hours - workedMs / 3600000;
    if (gap > 1.5) parts.push(`${fmtH(gap)} not in Working on any task (reviews, fixes, meetings, or a status not moved).`);
  } else if (day.workday) parts.push('No task in Working that day — the clock and the board don’t match.');
  if (day.moves?.length) parts.push(`Moved: ${day.moves.slice(0, 3).map(m => `${m.name} → ${m.to} at ${hm(new Date(m.at).toISOString())}`).join('; ')}${day.moves.length > 3 ? ` +${day.moves.length - 3}` : ''}.`);
  if (day.no_out) parts.push('Forgot to clock out — counted until 19:00.');
  return parts.join(' ');
}

/** One employee's sheet for [from, to] with each day read for you + the tickets behind it. */
async function person({ employeeId, from: fIn, to: tIn } = {}) {
  const c = await creds();
  const nowMs = Date.now();
  const today = W.localDate(nowMs);
  const to = P.isYmd(tIn) && tIn <= today ? tIn : today;
  const from = P.isYmd(fIn) && fIn <= to ? fIn : W.addDays(to, -13);
  if (W.addDays(from, 62) < to) throw Object.assign(new Error('Pick up to two months'), { status: 400 });
  const emps = await T.directory(c);
  const emp = emps.find(e => e.id === String(employeeId));
  if (!emp) throw Object.assign(new Error('That person isn’t in BambooHR (or the company key can’t see them)'), { status: 404 });
  const [entries, out, offs, balances] = await Promise.all([
    T.entries(c, from, to, [emp.id]).catch(() => []),
    T.whosOut(c, from, to).catch(() => []),
    approvedOff(c, from, to),
    balancesFor(c, [emp.id], today),
  ]);
  const holidays = out.filter(r => r.type === 'holiday');
  const myOff = offs.filter(r => r.employee_id === emp.id);
  const totals = P.dayTotals(entries, today, nowMs);
  // the tickets: Time tracking for the same range (cached), this person's tasks
  let data = null, mondayId = null, ttError = null;
  try {
    data = await require('../timetrack/data').load({ from, to });
    mondayId = mondayIdFor(emp, data);
  } catch (e) { ttError = e.message; }
  const myTasks = mondayId ? (data.tasks || []).filter(t => require('../timetrack/engine').keysOf(t, 'person').includes(mondayId)) : [];
  const E = require('../timetrack/engine');
  const days = [];
  for (let d = from; d <= to; d = W.addDays(d, 1)) {
    const t = totals[d];
    const dayStart = E.zonedUtc(d, 0), dayEnd = dayStart + DAY;
    // the clock that day (or the whole working day when there's no clock)
    const clocks = entries.filter(e => e.date === d && e.start).map(e => [Date.parse(e.start), e.end ? Date.parse(e.end) : Math.min(nowMs, E.zonedUtc(d, 19))]);
    const tasks = [], moves = [];
    for (const tk of myTasks) {
      let ms = 0;
      for (const s of tk.segments || []) {
        if (s.category === 'in_progress') {
          const inDay = [Math.max(s.from_ms, dayStart), Math.min(s.to_ms ?? nowMs, dayEnd)];
          if (inDay[1] <= inDay[0]) continue;
          ms += clocks.length ? clocks.reduce((a, [c0, c1]) => a + overlap(inDay[0], inDay[1], c0, c1), 0) : 0;
        }
        if (String(s.by || '') === mondayId && s.from_ms >= dayStart && s.from_ms < dayEnd) moves.push({ id: tk.id, name: tk.name, to: s.status, at: s.from_ms });
      }
      if (ms > 0) tasks.push({ id: tk.id, board: tk.board, name: tk.name, url: tk.url || null, ms });
    }
    const hol = holidays.find(h => h.start <= d && h.end >= d);
    const off = myOff.find(r => r.start <= d && r.end >= d);
    const day = {
      date: d, workday: W.dow(d) <= 4, hours: t ? round2(t.hours) : 0, in: t?.in || null, out: t?.out || null, open: !!t?.open, no_out: !!t?.no_out,
      off: off ? (off.type?.name || 'Time off') : null, off_kind: off ? kindOf(off.type?.name) : null, holiday: hol ? (hol.name || 'Holiday') : null,
      tasks: tasks.sort((a, b) => b.ms - a.ms), moves: moves.sort((a, b) => a.at - b.at),
    };
    day.summary = readDay(day, P.EXPECTED_DAY_HOURS);
    days.push(day);
  }
  const worked = days.reduce((a, d) => a + d.hours, 0);
  const expected = days.filter(d => d.workday && !d.off && !d.holiday && d.date < today).length * P.EXPECTED_DAY_HOURS;
  // the tickets over the range
  const byTask = new Map();
  for (const d of days) for (const t of d.tasks) { const x = byTask.get(t.id) || { ...t, ms: 0, days: 0 }; x.ms += t.ms; x.days++; byTask.set(t.id, x); }
  return {
    employee: { id: emp.id, name: emp.name, job_title: emp.job_title, photo_url: emp.photo_url, email: emp.email },
    from, to, today, expected_day_hours: P.EXPECTED_DAY_HOURS, monday_id: mondayId, tickets_error: ttError,
    totals: { hours: round2(worked), expected, pct: expected ? Math.round((worked / expected) * 100) : null, days_worked: days.filter(d => d.hours > 0).length,
      on_tasks_hours: round1([...byTask.values()].reduce((a, t) => a + t.ms, 0) / 3600000) },
    tickets: [...byTask.values()].sort((a, b) => b.ms - a.ms).slice(0, 30).map(t => ({ id: t.id, board: t.board, name: t.name, url: t.url, hours: round1(t.ms / 3600000), days: t.days })),
    days: days.reverse(),
    balances: balances[emp.id] || null,
    off: myOff.map(r => ({ id: r.id, type: r.type?.name, kind: kindOf(r.type?.name), start: r.start, end: r.end })),
  };
}

// ── who's out, for the whole team (My Studio) ───────────────────────────────────────────────────────────────────────
/** People off in [from, to] with the kind (vacation / sick / other) and holidays. Anyone signed in may see it. */
async function teamOut({ from: fIn, to: tIn } = {}) {
  let c;
  try { c = await creds(); } catch { return { connected: false, people: [], holidays: [] }; }
  const today = W.localDate(Date.now());
  const from = P.isYmd(fIn) ? fIn : today;
  const to = P.isYmd(tIn) && tIn >= from ? (W.addDays(from, 62) < tIn ? W.addDays(from, 62) : tIn) : W.addDays(from, 13);
  const [emps, offs, out] = await Promise.all([T.directory(c).catch(() => []), approvedOff(c, from, to), T.whosOut(c, from, to).catch(() => [])]);
  const byId = new Map(emps.map(e => [e.id, e]));
  const typed = offs.map(r => {
    const e = byId.get(String(r.employee_id));
    return { employee_id: r.employee_id, name: e?.name || r.name || 'Someone', photo_url: e?.photo_url || null, email: e?.email || null, type: r.type?.name || 'Out', kind: kindOf(r.type?.name), start: r.start, end: r.end };
  });
  // who's out rows without a matching request (other approvers' types we can't read) still show, as "Out"
  for (const r of out.filter(x => x.type === 'time_off')) {
    if (typed.some(t => t.employee_id === r.employeeId && t.start <= r.end && t.end >= r.start)) continue;
    const e = byId.get(String(r.employeeId));
    typed.push({ employee_id: r.employeeId, name: e?.name || r.name || 'Someone', photo_url: e?.photo_url || null, email: e?.email || null, type: 'Out', kind: 'other', start: r.start, end: r.end });
  }
  return {
    connected: true, from, to, today,
    people: typed.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)),
    holidays: out.filter(r => r.type === 'holiday').map(h => ({ name: h.name, start: h.start, end: h.end })),
  };
}

module.exports = { month, person, teamOut, readDay, kindOf, workdaysIn, mondayIdFor };
