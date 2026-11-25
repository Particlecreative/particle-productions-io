/**
 * My HR (everyone's own BambooHR) and the HR panel (admins) — 25 Nov 2026.
 * Local dev without the API answers with small, obviously-made-up stand-ins (Dana Demo, Ori Sample…) so the pages render;
 * the stand-in remembers clock in / out, requests and the connection for the browser tab (sessionStorage).
 */
import { api, apiGet, apiPost } from './apiClient';

const LIVE = !import.meta.env.DEV || import.meta.env.VITE_HR_LIVE === '1';

/** A normal working day, Sun–Thu (the server sends its own number too — that one wins). */
export const EXPECTED_DAY_HOURS = 9;
export const TZ = 'Asia/Jerusalem';

// ── small helpers the HR pages share ─────────────────────────────────────────────────────────────────────────────────
export const ilToday = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
export const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
export const dowOf = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const sundayOf = (ymd) => addDays(ymd, -dowOf(ymd));
export const isWorkday = (ymd) => dowOf(ymd) <= 4;

/** 7.5 → "7h 30m", 0.25 → "15m", 0 → "0h" */
export function fmtHours(h, { zero = '0h' } = {}) {
  const mins = Math.round((Number(h) || 0) * 60);
  if (mins <= 0) return zero;
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return hh ? (mm ? `${hh}h ${mm}m` : `${hh}h`) : `${mm}m`;
}
/** seconds → "3:12:45" */
export function fmtTimer(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
/** ISO instant → "09:14" (Israel time) */
export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
/** "2026-11-25" → "Wed 25 Nov" */
export const fmtDay = (ymd, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' }) : '');
export function fmtRange(a, b, opts) {
  if (!a) return '';
  if (!b || a === b) return fmtDay(a, opts);
  return `${fmtDay(a, opts)} – ${fmtDay(b, opts)}`;
}
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const PALETTE = ['#0808f8', '#00a3a3', '#a25ddc', '#ff7a00', '#e2445c', '#00c875', '#579bfc', '#c2185b'];
export const colorFor = (s) => PALETTE[[...String(s || '')].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// ── dev stand-ins ────────────────────────────────────────────────────────────────────────────────────────────────────
const DEV_KEY = 'cp_dev_hr';
const devLoad = () => { try { return JSON.parse(sessionStorage.getItem(DEV_KEY) || 'null'); } catch { return null; } };
const devSave = (s) => { try { sessionStorage.setItem(DEV_KEY, JSON.stringify(s)); } catch { /* ignore */ } };
const wait = (ms = 350) => new Promise(r => setTimeout(r, ms));
const devErr = (msg, status = 400) => Object.assign(new Error(msg), { status });

function devState() {
  let s = devLoad();
  if (!s) {
    const today = ilToday();
    s = {
      connected: false, open: false, since: null, todayClosed: 0,
      requests: [
        { id: '9001', start: addDays(sundayOf(today), 18), end: addDays(sundayOf(today), 20), status: 'requested', type: { id: '1', name: 'Vacation' }, amount: 3, unit: 'days', note: 'Family trip (demo)' },
        { id: '9000', start: addDays(sundayOf(today), -12), end: addDays(sundayOf(today), -12), status: 'approved', type: { id: '3', name: 'Personal hours' }, amount: 4.5, unit: 'hours', note: null },
      ],
    };
    devSave(s);
  }
  return s;
}

const DEV_TYPES = [
  { id: '1', name: 'Vacation', units: 'days', color: '#3BA7D8', icon: 'palm-tree' },
  { id: '2', name: 'Sick', units: 'days', color: '#F06A6A', icon: 'medical' },
  { id: '3', name: 'Personal hours', units: 'hours', color: '#9B6BF2', icon: 'clock' },
];
const DEV_PEOPLE = [
  { id: '901', name: 'Dana Demo', title: 'Video Editor', cp: 'u-dana' },
  { id: '902', name: 'Ori Sample', title: 'Designer', cp: 'u-ori' },
  { id: '903', name: 'Noa Example', title: 'Motion Designer', cp: 'u-noa' },
  { id: '904', name: 'Gil Placeholder', title: 'Video Editor', cp: 'u-gil' },
  { id: '905', name: 'Tal Fixture', title: 'Copywriter', cp: 'u-tal' },
  { id: '906', name: 'Lior Testman', title: 'Producer', cp: null },
  { id: '907', name: 'Maya Mockup', title: 'Designer', cp: 'u-maya' },
];
const devHours = [8.6, 9.3, 7.4, 9.1, 8.8, 0, 0];
const nextWork = (ymd) => { let d = ymd; while (!isWorkday(d)) d = addDays(d, 1); return d; };

function devMe() {
  const s = devState();
  if (!s.connected) return { connected: false, company_subdomain: 'demo-company', expected_day_hours: EXPECTED_DAY_HOURS };
  const now = Date.now();
  const today = ilToday(now);
  const ws = sundayOf(today);
  const running = s.open && s.since ? (now - Date.parse(s.since)) / 3600000 : 0;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ws, i);
    const isToday = date === today;
    const past = date < today;
    const hours = isToday ? s.todayClosed + running : past ? devHours[i] : 0;
    return {
      date, dow: i, workday: i <= 4, future: date > today, today: isToday, hours, closed_hours: isToday ? s.todayClosed : hours,
      in: past && hours ? `${date}T07:${10 + i}:00Z` : null, out: past && hours ? `${date}T${String(7 + Math.floor(hours)).padStart(2, '0')}:40:00Z` : null,
      open: isToday && s.open, no_out: false, off: null,
    };
  });
  const weekClosed = days.reduce((n, d) => n + d.closed_hours, 0);
  const pastWork = days.filter(d => d.workday).length;
  return {
    connected: true, name: 'Dana Demo', subdomain: 'demo-company', connected_at: new Date(now - 86400000 * 3).toISOString(), needs_reconnect: false,
    expected_day_hours: EXPECTED_DAY_HOURS, today, week_start: ws, generated_at: new Date(now).toISOString(),
    profile: {
      id: '901', name: 'Dana Demo', first_name: 'Dana', job_title: 'Video Editor (demo)', department: 'Creative', division: null, location: 'Tel Aviv office',
      email: 'dana.demo@example.com', mobile: '+972 50-000-0000', hire_date: '2022-03-14', manager: 'Avery Example', photo_url: null,
      anniversary: (() => { const y = Number(today.slice(0, 4)); let next = `${y}-03-14`; if (next < today) next = `${y + 1}-03-14`; return { next_date: next, days_until: daysBetween(today, next), years_at_next: Number(next.slice(0, 4)) - 2022, years_so_far: Number(next.slice(0, 4)) - 2023, is_today: false }; })(),
    },
    clock: {
      enabled: true, open: s.open, since: s.since, open_from_earlier: false, open_date: s.open ? today : null,
      today_hours: s.todayClosed + running, today_closed_hours: s.todayClosed, week_hours: weekClosed + running, week_closed_hours: weekClosed,
      expected_day_hours: EXPECTED_DAY_HOURS, expected_week_hours: pastWork * EXPECTED_DAY_HOURS, days, entries_today: [],
    },
    time_off: {
      types: DEV_TYPES, default_hours: [],
      balances: [
        { type_id: '1', name: 'Vacation', units: 'days', balance: 11.5, used_ytd: 6, color: '#3BA7D8' },
        { type_id: '2', name: 'Sick', units: 'days', balance: 14, used_ytd: 2, color: '#F06A6A' },
        { type_id: '3', name: 'Personal hours', units: 'hours', balance: 13.5, used_ytd: 4.5, color: '#9B6BF2' },
      ],
      requests: s.requests, errors: {},
    },
    whos_out: {
      from: ws, to: addDays(ws, 13), error: null,
      people: [
        { id: 'o1', type: 'time_off', name: 'Noa Example', employeeId: '903', start: addDays(ws, 2), end: addDays(ws, 4), is_me: false, job_title: 'Motion Designer', photo_url: null },
        { id: 'o2', type: 'time_off', name: 'Gil Placeholder', employeeId: '904', start: today, end: today, is_me: false, job_title: 'Video Editor', photo_url: null },
        { id: 'o3', type: 'time_off', name: 'Tal Fixture', employeeId: '905', start: addDays(ws, 8), end: addDays(ws, 11), is_me: false, job_title: 'Copywriter', photo_url: null },
      ],
      holidays: [{ name: 'Demo Holiday', start: addDays(ws, 10), end: addDays(ws, 10) }],
    },
  };
}

function devTeam(week) {
  const now = Date.now();
  const today = ilToday(now);
  const ws = sundayOf(week || today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const states = ['in', 'in', 'done', 'not_in', 'off', 'in', 'not_in'];
  const at = (h, m) => `${today}T${String(h - 2).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
  const board = DEV_PEOPLE.map((p, i) => {
    const st = isWorkday(today) ? states[i] : (i === 4 ? 'off' : 'weekend');
    const base = { id: p.id, name: p.name, job_title: p.title, photo_url: null, cp_user_id: p.cp, hr_connected: i % 3 !== 2, tracked: true };
    if (st === 'in') return { ...base, state: 'in', since: at(8 + (i % 2), 5 + i * 7), hours: null };
    if (st === 'done') return { ...base, state: 'done', in: at(7, 50), out: at(14, 5), hours: 6.25 };
    if (st === 'off') return { ...base, state: 'off', label: 'Time off', until: addDays(today, 2) };
    return { ...base, state: st };
  });
  const grid = DEV_PEOPLE.map((p, i) => {
    const cells = {};
    let total = 0;
    let expected = 0;
    let toDate = 0;
    let totalToDate = 0;
    days.forEach((d, j) => {
      const work = j <= 4;
      const off = i === 4 && d >= today && d <= addDays(today, 2) && work;
      if (work && !off) { expected += EXPECTED_DAY_HOURS; if (d < today) toDate += EXPECTED_DAY_HOURS; }
      const hours = d < today && work && !off ? [8.9, 9.4, 7.1, 9.0, 8.2, 9.6, 6.8][(i + j) % 7] : d === today && board[i].state === 'in' ? 3.2 : 0;
      const missing = d < today && work && !off && i === 6 && j === 1;
      total += missing ? 0 : hours;
      if (d < today) totalToDate += missing ? 0 : hours;
      cells[d] = {
        hours: missing ? 0 : hours, in: hours ? `${d}T06:${String(10 + i * 3).padStart(2, '0')}:00Z` : null, out: hours && d < today ? `${d}T${String(6 + Math.floor(hours)).padStart(2, '0')}:20:00Z` : null,
        open: d === today && board[i].state === 'in', no_out: i === 3 && j === 2 && d < today, off: off ? 'Time off' : null, missing,
        short: !missing && work && hours > 0 && hours < EXPECTED_DAY_HOURS - 0.25 && d < today,
      };
    });
    return { id: p.id, name: p.name, job_title: p.title, photo_url: null, cp_user_id: p.cp, hr_connected: i % 3 !== 2, tracked: true, cells, total: Math.round(total * 100) / 100, total_to_date: Math.round(totalToDate * 100) / 100, expected, expected_to_date: toDate };
  });
  const s = devState();
  const answered = new Set(s.answered || []);
  const requests = [
    { id: '7001', employee_id: '902', name: 'Ori Sample', job_title: 'Designer', photo_url: null, start: addDays(today, 9), end: addDays(today, 11), created: new Date(now - 2 * 86400000).toISOString(), status: 'requested', type: { id: '1', name: 'Vacation' }, amount: 3, unit: 'days', note: 'Wedding abroad (demo)', cp_user_id: 'u-ori' },
    { id: '7002', employee_id: '907', name: 'Maya Mockup', job_title: 'Designer', photo_url: null, start: nextWork(addDays(today, 3)), end: nextWork(addDays(today, 3)), created: new Date(now - 5 * 3600000).toISOString(), status: 'requested', type: { id: '3', name: 'Personal hours' }, amount: 4.5, unit: 'hours', note: null, cp_user_id: 'u-maya' },
  ].filter(r => !answered.has(r.id));
  const conns = DEV_PEOPLE.filter(p => p.cp).map((p, i) => ({
    id: p.cp, name: p.name, email: `${p.name.split(' ')[0].toLowerCase()}@example.com`, role: i < 3 ? 'Creative' : i === 3 ? 'Growth' : 'Editor',
    hr: i % 3 !== 2 ? { connected: true, connected_at: new Date(now - (i + 1) * 86400000).toISOString() } : { connected: false },
    monday: i !== 1, bamboo: { id: p.id, name: p.name },
  })).concat([{ id: 'u-admin', name: 'Demo Admin', email: 'admin@example.com', role: 'Admin', hr: { connected: false }, monday: true, bamboo: null }]);
  return {
    connected: true, subdomain: 'demo-company', today, this_week: sundayOf(today), week_start: ws, days, expected_day_hours: EXPECTED_DAY_HOURS, generated_at: new Date(now).toISOString(),
    board, grid, requests, connections: conns,
    whos_out: {
      from: today, to: addDays(today, 30),
      people: [
        { id: 'w1', employee_id: '905', name: 'Tal Fixture', start: today, end: addDays(today, 2) },
        { id: 'w2', employee_id: '903', name: 'Noa Example', start: addDays(today, 5), end: addDays(today, 8) },
        { id: 'w3', employee_id: '902', name: 'Ori Sample', start: addDays(today, 13), end: addDays(today, 14) },
        { id: 'w4', employee_id: '904', name: 'Gil Placeholder', start: addDays(today, 20), end: addDays(today, 26) },
        { id: 'w5', employee_id: '905', name: 'Tal Fixture', start: addDays(today, 22), end: addDays(today, 22) },
      ],
      holidays: [{ name: 'Demo Holiday', start: addDays(today, 16), end: addDays(today, 16) }],
    },
    holidays_week: [], errors: {},
  };
}

const dev = {
  async me() { await wait(); return devMe(); },
  async clock() {
    const s = devState();
    if (!s.connected) return { connected: false };
    const running = s.open && s.since ? (Date.now() - Date.parse(s.since)) / 3600000 : 0;
    return { connected: true, open: s.open, since: s.since, today_closed_hours: s.todayClosed, today_hours: s.todayClosed + running, generated_at: new Date().toISOString() };
  },
  async connect(key) {
    await wait(700);
    if (!/^[a-f0-9]{20,80}$/i.test(String(key || '').trim())) throw devErr('That doesn’t look like a BambooHR API key — it’s a long mix of numbers and the letters a–f. Copy the whole key, nothing else.');
    devSave({ ...devState(), connected: true });
    return { connected: true, name: 'Dana Demo' };
  },
  async disconnect() { await wait(); devSave({ ...devState(), connected: false, open: false, since: null }); return { ok: true }; },
  async clockIn() {
    await wait();
    const s = devState();
    if (s.open) throw devErr('You’re already clocked in.', 409);
    devSave({ ...s, open: true, since: new Date().toISOString() });
    return { ok: true, clock: await dev.clock() };
  },
  async clockOut() {
    await wait();
    const s = devState();
    if (!s.open) throw devErr('You’re not clocked in right now.', 404);
    const add = (Date.now() - Date.parse(s.since)) / 3600000;
    devSave({ ...s, open: false, since: null, todayClosed: s.todayClosed + add });
    return { ok: true, clock: await dev.clock() };
  },
  async requestTimeOff(body) {
    await wait(600);
    if (!body.type_id) throw devErr('Pick the kind of time off');
    if (!body.start || !body.end) throw devErr('Pick the dates');
    const s = devState();
    const type = DEV_TYPES.find(t => t.id === String(body.type_id));
    const id = String(9100 + s.requests.length);
    s.requests.unshift({ id, start: body.start, end: body.end, status: 'requested', type: { id: type.id, name: type.name }, amount: body.amount || 1, unit: type.units, note: body.note || null });
    devSave(s);
    return { ok: true, request: { id } };
  },
  async cancelTimeOff(id) {
    await wait();
    const s = devState();
    s.requests = s.requests.map(r => (r.id === String(id) ? { ...r, status: 'canceled' } : r));
    devSave(s);
    return { ok: true };
  },
  async team(week) { await wait(); return devTeam(week); },
  async answer(id, decision) {
    await wait(500);
    const s = devState();
    devSave({ ...s, answered: [...(s.answered || []), String(id)] });
    return { ok: true, id: String(id), status: decision === 'approve' ? 'approved' : 'denied' };
  },
};

// ── the API ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const hrApi = {
  me: (fresh = false) => (LIVE ? apiGet(`/hr/me${fresh ? '?fresh=1' : ''}`) : dev.me()),
  clock: () => (LIVE ? apiGet('/hr/me/clock') : dev.clock()),
  connect: (api_key, subdomain) => (LIVE ? apiPost('/hr/me/connect', { api_key, ...(subdomain ? { subdomain } : {}) }) : dev.connect(api_key)),
  disconnect: () => (LIVE ? api('/hr/me', { method: 'DELETE' }) : dev.disconnect()),
  clockIn: (note) => (LIVE ? apiPost('/hr/me/clock-in', note ? { note } : {}) : dev.clockIn()),
  clockOut: (opts = {}) => (LIVE ? apiPost('/hr/me/clock-out', opts) : dev.clockOut()),
  requestTimeOff: (body) => (LIVE ? apiPost('/hr/me/time-off', body) : dev.requestTimeOff(body)),
  cancelTimeOff: (id) => (LIVE ? apiPost(`/hr/me/time-off/${encodeURIComponent(id)}/cancel`, {}) : dev.cancelTimeOff(id)),
  team: (week) => (LIVE ? apiGet(`/hr/team${week ? `?week=${encodeURIComponent(week)}` : ''}`) : dev.team(week)),
  approve: (id, note) => (LIVE ? apiPost(`/hr/team/time-off/${encodeURIComponent(id)}/approve`, note ? { note } : {}) : dev.answer(id, 'approve')),
  deny: (id, note) => (LIVE ? apiPost(`/hr/team/time-off/${encodeURIComponent(id)}/deny`, note ? { note } : {}) : dev.answer(id, 'deny')),
  // My employees + My month + who's out (25 Nov 2026)
  teamMonth: (month) => (LIVE ? apiGet(`/hr/team/month${month ? `?month=${encodeURIComponent(month)}` : ''}`) : devInsights.month(month)),
  teamPerson: (id, from, to) => (LIVE ? apiGet(`/hr/team/person/${encodeURIComponent(id)}?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`) : devInsights.person(id, from, to)),
  out: (from, to) => (LIVE ? apiGet(`/hr/out?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`) : devInsights.out(from, to)),
  myMonth: (month) => (LIVE ? apiGet(`/hr/me/month${month ? `?month=${encodeURIComponent(month)}` : ''}`) : devInsights.myMonth(month)),
};

// ── local preview stand-ins for My employees (obviously sample people) ─────────────────────────────────────────────
const devInsights = (() => {
  const P = [['101', 'Dana Demo', 'Video Editor'], ['102', 'Ori Sample', 'Designer'], ['103', 'Noa Example', 'Video Editor'], ['104', 'Gil Placeholder', 'Motion Designer'], ['105', 'Tal Fixture', 'Designer'], ['106', 'Lior Testman', 'Video Editor']];
  const today = ilToday();
  const m0 = today.slice(0, 7);
  const kinds = { 103: [['vacation', addDays(today, -1), addDays(today, 2), 'Vacation']], 104: [['sick', today, today, 'Sick']] };
  const month = async (m = m0) => {
    await new Promise(r => setTimeout(r, 250));
    const from = `${m}-01`;
    const pcts = [104, 98, 91, 86, 78, 63];
    const people = P.map(([id, name, job], i) => {
      const exp = 9 * 16, hrs = Math.round(exp * pcts[i]) / 100;
      const days = {};
      for (let d = from; d.slice(0, 7) === m && d <= today; d = addDays(d, 1)) days[d] = dowOf(d) > 4 ? 0 : d === today ? 4.2 : Math.round((7 + ((Number(d.slice(8)) * (i + 3)) % 30) / 10) * 100) / 100;
      return { id, name, job_title: job, photo_url: null, tracked: true, hours_to_date: hrs, expected_to_date: exp, expected_month: 9 * 21, pct: pcts[i], remaining_to_target: Math.round((9 * 21 - hrs) * 10) / 10,
        days_worked: 15 + (i % 2), days_short: i, days_missing: i > 3 ? 2 : 0, days_no_out: i === 2 ? 1 : 0, days_over: 5 - i, off_days: (kinds[id] || []).length * 2,
        off: (kinds[id] || []).map(([kind, a, b, type]) => ({ kind, start: a, end: b, type })), avg_start: `0${8 + (i % 2)}:${['12', '41', '05', '58', '20', '33'][i]}`,
        balances: [{ name: 'Vacation', kind: 'vacation', balance: 14 - i * 2.5, units: 'days', used_ytd: 3 + i }, { name: 'Sick', kind: 'sick', balance: 18 - i, units: 'days', used_ytd: i }], days };
    });
    return { month: m, from, to: `${m}-30`, today, expected_day_hours: 9, team: { hours_to_date: people.reduce((a, p) => a + p.hours_to_date, 0), expected_to_date: 9 * 16 * 6, pct: 87, off_days: 3, missing: 4, no_out: 1 }, holidays: [], people };
  };
  const person = async (id, from, to) => {
    await new Promise(r => setTimeout(r, 300));
    const p = P.find(x => x[0] === String(id)) || P[0];
    const end = to || today, start = from || addDays(end, -13);
    const tickets = [['Face Cream | Meta | Hook test', 'video'], ['NeoRoot | Creators | Cut v2', 'video'], ['Gravité | TV | She Won’t Have To resizes', 'video'], ['Hand Cream | Meta | Static set', 'design']];
    const days = [];
    for (let d = end; d >= start; d = addDays(d, -1)) {
      const wd = dowOf(d) <= 4, n = Number(d.slice(8));
      const hours = wd ? Math.round((6.5 + (n % 5) * 0.6) * 100) / 100 : 0;
      const tasks = wd ? [{ id: 't1', name: tickets[n % 4][0], board: tickets[n % 4][1], ms: hours * 0.55 * 3.6e6 }, { id: 't2', name: tickets[(n + 1) % 4][0], board: tickets[(n + 1) % 4][1], ms: hours * 0.25 * 3.6e6 }] : [];
      const day = { date: d, workday: wd, hours, in: wd ? `${d}T0${8 + (n % 2)}:1${n % 6}:00+02:00` : null, out: wd ? `${d}T17:${10 + (n % 40)}:00+02:00` : null, open: d === today, no_out: false, off: null, holiday: null, tasks, moves: wd && n % 3 === 0 ? [{ id: 't1', name: tickets[n % 4][0], to: 'Review', at: Date.parse(`${d}T15:20:00+02:00`) }] : [] };
      day.summary = !wd ? 'Weekend.' : `Full day: ${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m (0${8 + (n % 2)}:1${n % 6}–17:${10 + (n % 40)}). Worked on ${tasks.map(t => `${t.name} (${Math.round(t.ms / 3.6e6 * 10) / 10}h)`).join(', ')}.${day.moves.length ? ` Moved: ${day.moves[0].name} → Review at 15:20.` : ''}`;
      days.push(day);
    }
    return { employee: { id: p[0], name: p[1], job_title: p[2] }, from: start, to: end, today, expected_day_hours: 9, totals: { hours: 92.4, expected: 99, pct: 93, days_worked: 11, on_tasks_hours: 71.2 },
      tickets: tickets.map(([name, board], i) => ({ id: `t${i}`, board, name, hours: [24.5, 18, 15.2, 13.5][i], days: [5, 4, 3, 3][i] })), days,
      balances: [{ name: 'Vacation', kind: 'vacation', balance: 11.5, units: 'days', used_ytd: 6 }, { name: 'Sick', kind: 'sick', balance: 14, units: 'days', used_ytd: 2 }], off: [] };
  };
  const out = async () => ({ connected: true, from: today, to: addDays(today, 13), today, holidays: [], people: [
    { employee_id: '103', name: 'Noa Example', kind: 'vacation', type: 'Vacation', start: addDays(today, -1), end: addDays(today, 2) },
    { employee_id: '104', name: 'Gil Placeholder', kind: 'sick', type: 'Sick', start: today, end: today },
    { employee_id: '105', name: 'Tal Fixture', kind: 'vacation', type: 'Vacation', start: addDays(today, 5), end: addDays(today, 8) },
  ] });
  const myMonth = async () => ({ connected: true, month: m0, hours_to_date: 128.5, expected_to_date: 144, expected_month: 189, pct: 89, today_hours: 3.4, open: false, days_worked: 16, days_short: 3, days_missing: 0, expected_day_hours: 9 });
  return { month, person, out, myMonth };
})();

/** "the clock changed" — so the header pill and My HR stay in step without a reload */
export const HR_CLOCK_EVENT = 'cp:hr-clock';
export const announceClock = (clock) => { try { window.dispatchEvent(new CustomEvent(HR_CLOCK_EVENT, { detail: clock || null })); } catch { /* ignore */ } };
