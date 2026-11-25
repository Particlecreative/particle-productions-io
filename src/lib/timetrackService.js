/**
 * Task time tracking API client (/api/timetrack) + the shared formatting the panel and the task block use.
 * In local dev (import.meta.env.DEV) it answers from a generated fixture (made-up people and tasks) so the screens
 * render without a backend; VITE_TIMETRACK_LIVE=1 (or VITE_STUDIO_LIVE=1) talks to the real API instead.
 */
import { api } from './apiClient';

const DEV = import.meta.env.DEV && import.meta.env.VITE_TIMETRACK_LIVE !== '1' && import.meta.env.VITE_STUDIO_LIVE !== '1';

export const TZ = 'Asia/Jerusalem';
const H = 3600000;
const DAY = 86400000;

// ── Categories: order of the stacked bars, labels, colours (validated for colour-blind separation, light + dark) ──
export const CATEGORY_ORDER = ['queued', 'in_progress', 'review', 'fixes', 'stuck', 'paused', 'delivered', 'other'];
export const CATEGORY_LABEL = {
  queued: 'Waiting', in_progress: 'Working', review: 'In review', fixes: 'Fixes', stuck: 'Stuck', paused: 'Paused', delivered: 'Done', other: 'Other',
};
export const CATEGORY_HINT = {
  queued: 'Waiting to be picked up (Pending, Ready for assignment…)',
  in_progress: 'Being worked on (Working, Freelance)',
  review: 'Waiting for or in review (Review, approvals, Quality check)',
  fixes: 'Fixes round',
  stuck: 'Stuck',
  paused: 'Paused',
  delivered: 'Approved, then reopened later',
  other: 'Any other status',
};
const LIGHT = { queued: '#1fa898', in_progress: '#4a86f2', review: '#8a3cb0', fixes: '#d97a12', stuck: '#d93d56', paused: '#5b5fc9', delivered: '#00a26a', other: '#c2408f' };
const DARK = { queued: '#1fa898', in_progress: '#4f8af2', review: '#9d50c6', fixes: '#c87a0a', stuck: '#d9405f', paused: '#6a6dd8', delivered: '#00a26a', other: '#cc4e9a' };
const vars = (p) => Object.entries(p).map(([k, v]) => `--tt-${k}:${v};`).join('');
/** Drop into a <style> once per screen: colour tokens for the categories, light and dark. */
export const TT_CSS = `.tt-root{${vars(LIGHT)}--tt-accent:#0808f8;--tt-gap:#fff}html.dark .tt-root{${vars(DARK)}--tt-accent:#8c93ff;--tt-gap:var(--brand-card-bg,#161b22)}`;
export const catColor = (c) => `var(--tt-${CATEGORY_LABEL[c] ? c : 'other'})`;

// ── Formatting ──────────────────────────────────────────────────────────────
/** Wall-clock duration: "45m", "6h 20m", "3d 4h". */
export function fmtDur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  if (ms < 60000) return ms > 0 ? '<1m' : '0m';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) { const h = Math.floor(m / 60); const r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; }
  const hTotal = Math.round(ms / H);
  const d = Math.floor(hTotal / 24);
  const h = hTotal % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}
/** Hours of work: "6h 20m", "26h" — never days (a work day isn't 24 hours). */
export function fmtHM(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  if (ms <= 0) return '0h';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h >= 20 || !r ? `${Math.round(m / 60)}h` : `${h}h ${r}m`;
}
export function fmtAgo(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return '';
  const d = now - ms;
  if (d < 60000) return 'just now';
  if (d < H) return `${Math.round(d / 60000)} min ago`;
  if (d < DAY) { const h = Math.round(d / H); return `${h} hour${h === 1 ? '' : 's'} ago`; }
  const days = Math.round(d / DAY);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
export const fmtDate = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ }) : '–');
export const fmtDateTime = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '–');
export const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`);

/** Israel calendar date of an instant. */
export function israelYmd(ms = Date.now()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => p.find(x => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
const dowYmd = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
/** Sun–Thu days from one instant to another (both counted), Israel dates. */
export function workdaysBetween(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  let n = 0;
  for (let d = israelYmd(a), end = israelYmd(b), i = 0; d <= end && i < 400; d = addDaysYmd(d, 1), i++) if (dowYmd(d) <= 4) n++;
  return n;
}

export const RANGE_PRESETS = [['week', 'This week'], ['2weeks', 'Last 2 weeks'], ['month', 'This month'], ['90', 'Last 90 days'], ['custom', 'Custom']];
/** A preset → { from, to } (Israel dates; weeks start on Sunday). */
export function presetRange(key, now = Date.now()) {
  const today = israelYmd(now);
  const sunday = addDaysYmd(today, -dowYmd(today));
  if (key === 'week') return { from: sunday, to: today };
  if (key === '2weeks') return { from: addDaysYmd(sunday, -7), to: today };
  if (key === '90') return { from: addDaysYmd(today, -89), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '' && v !== 'all').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const timetrackApi = {
  /** The management panel: { from, to, board, person, product, type, requester, campaign, force } */
  async overview(params) {
    if (import.meta.env.DEV && DEV) { await new Promise(r => setTimeout(r, 350)); return fixtureOverview(params); }
    const { force, ...rest } = params;
    return api(`/timetrack/overview?${qs({ ...rest, force: force ? '1' : '' })}`);
  },
  /** My month on Home: delivered, worked per task, review rounds, on time (the person's own). */
  async me(month) {
    if (import.meta.env.DEV && DEV) {
      await new Promise(r => setTimeout(r, 300));
      const m = month || israelYmd().slice(0, 7);
      const seed = Number(m.slice(5, 7));
      return { connected: true, month: m, kpis: { delivered: 6 + (seed % 5), open: 4, median_worked_ms: (5 + (seed % 3)) * 3.6e6, median_lead_ms: (3 + (seed % 2)) * 86400000, avg_review_rounds: 1.2 + (seed % 3) / 10, on_time_pct: 80 + (seed % 15), busy_ms: 92 * 3.6e6, clocked_ms: 140 * 3.6e6, estimated: 1 },
        tasks: [{ id: 'd1', board: 'video', name: 'Sample | Meta | Hook test', worked_ms: 4.5 * 3.6e6, review_rounds: 1, delivered_at: Date.now() - 2 * 86400000 }, { id: 'd2', board: 'video', name: 'Sample | Creators | Cut v2', worked_ms: 7 * 3.6e6, review_rounds: 2, delivered_at: Date.now() - 5 * 86400000 }] };
    }
    return api(`/timetrack/me${month ? `?month=${encodeURIComponent(month)}` : ''}`);
  },
  /** One task's timeline + numbers (403 when it isn't yours to see). */
  async task(board, itemId) {
    if (import.meta.env.DEV && DEV) { await new Promise(r => setTimeout(r, 300)); return fixtureTask(board, itemId); }
    return api(`/timetrack/task/${encodeURIComponent(board)}/${encodeURIComponent(itemId)}`);
  },
  /** Download the task list as CSV (same filters). */
  async downloadCsv(params) {
    const { force, ...rest } = params;   // eslint-disable-line no-unused-vars
    let blob;
    if (import.meta.env.DEV && DEV) blob = new Blob([fixtureCsv(rest)], { type: 'text/csv' });
    else {
      const t = localStorage.getItem('cp_auth_token');
      const res = await fetch(`/api/timetrack/overview.csv?${qs(rest)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (!res.ok) {
        let msg = `Download failed (${res.status})`;
        try { msg = (await res.json()).error || msg; } catch { /* not JSON */ }
        throw new Error(msg);
      }
      blob = await res.blob();
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `task-time_${rest.board || 'all'}_${rest.from}_${rest.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// DEV fixture — made-up people and tasks, numbers worked out the same way as the server (simplified)
// ═════════════════════════════════════════════════════════════════════════════
const OFF = 2 * H;   // the fixture lives in Israel winter time
const dayStartMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`) - OFF;
const localDay = (ms) => new Date(ms + OFF).toISOString().slice(0, 10);
const FX_PEOPLE = {
  p1: { id: 'p1', name: 'Noa Demo', board: 'video', bamboo: true },
  p2: { id: 'p2', name: 'Omri Sample', board: 'video', bamboo: true },
  p3: { id: 'p3', name: 'Yael Example', board: 'video', bamboo: false },
  p4: { id: 'p4', name: 'Shira Test', board: 'design', bamboo: true },
  p5: { id: 'p5', name: 'Itay Mock', board: 'design', bamboo: true },
  p6: { id: 'p6', name: 'Lia Placeholder', board: 'design', bamboo: true },
  r1: { id: 'r1', name: 'Dana Requester' },
  r2: { id: 'r2', name: 'Gal Marketing' },
  r3: { id: 'r3', name: 'Roni Growth' },
  r4: { id: 'r4', name: 'Tom Brand' },
};
const FX_PRODUCTS = [['Face Cream', '#579bfc'], ['Neck Cream', '#a25ddc'], ['Hand Cream', '#00c875'], ['Body Wash', '#fdab3d'], ['Eye Cream', '#e2445c']];
const FX_TYPES = ['UGC', 'Motion', 'Testimonial', 'TV cutdown', 'Founder ad'];
const FX_CAMPAIGNS = ['Black Friday', 'Holiday Gifting', 'Q4 Always-on', 'New Year Reset'];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let x = 2166136261; for (const ch of String(s)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619); return x >>> 0; };

/** Work-hour slices (Sun–Thu, h1–h2 local) of [a, b). */
function slices(a, b, h1 = 9, h2 = 19) {
  const out = [];
  for (let d = localDay(a); d <= localDay(b - 1); d = addDaysYmd(d, 1)) {
    if (dowYmd(d) > 4) continue;
    const s = Math.max(a, dayStartMs(d) + h1 * H);
    const e = Math.min(b, dayStartMs(d) + h2 * H);
    if (e > s) out.push([s, e]);
  }
  return out;
}
/** A made-up clock-in day per person (09:00–10:00 in, 17:00–18:30 out; some days off). */
function clockOf(pid, a, b) {
  const out = [];
  for (let d = localDay(a); d <= localDay(b - 1); d = addDaysYmd(d, 1)) {
    if (dowYmd(d) > 4) continue;
    const r = rng(hash(pid + d));
    if (r() < 0.06) continue;
    const s = dayStartMs(d) + 9 * H + Math.floor(r() * 60) * 60000;
    const e = dayStartMs(d) + 17 * H + Math.floor(r() * 90) * 60000;
    const lo = Math.max(a, s);
    const hi = Math.min(b, e);
    if (hi > lo) out.push([lo, hi]);
  }
  return out;
}
const sumPairs = (ps) => ps.reduce((s, [a, b]) => s + (b - a), 0);
function unionPairs(ps) {
  const out = [];
  for (const [a, b] of [...ps].sort((x, y) => x[0] - y[0])) { const l = out[out.length - 1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else out.push([a, b]); }
  return out;
}
const clipPairs = (ps, a, b) => ps.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x);

let fxCache = null;
function fixtureTasks() {
  const now = Date.now();
  if (fxCache && now - fxCache.at < 10 * 60000) return fxCache.tasks;
  const r = rng(20261125);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const between = (a, b) => a + r() * (b - a);
  const tasks = [];
  for (let i = 0; i < 190; i++) {
    const board = r() < 0.55 ? 'video' : 'design';
    const team = Object.values(FX_PEOPLE).filter(p => p.board === board);
    let person = pick(team);
    const type = board === 'video' ? pick(FX_TYPES) : null;
    const scale = board === 'video' ? (type === 'TV cutdown' ? 2.2 : type === 'Motion' ? 1.5 : 1) : 0.45;
    let t = Math.min(now - 2 * H, now - between(0.2, 110) * DAY);
    const created = t;
    const strip = [];
    const assign = [{ from_ms: created, people: [person.id] }];
    const push = (status, cat, len, by) => { if (t >= now) return; const e = Math.min(now, t + len); strip.push([cat, t, e, status, by]); t = e; };
    push(board === 'video' ? 'Ready for Assignment' : 'Pending', 'queued', between(1, 50) * H * (r() < 0.15 ? 3 : 1), null);
    push('Working', 'in_progress', between(3, 26) * H * scale, person.id);
    if (r() < 0.12) { push('Paused', 'paused', between(4, 40) * H, person.id); push('Working', 'in_progress', between(2, 10) * H * scale, person.id); }
    if (r() < 0.08) { push('Stuck', 'stuck', between(3, 30) * H, person.id); push('Working', 'in_progress', between(1, 6) * H * scale, person.id); }
    if (r() < 0.1 && t < now) { const other = pick(team.filter(p => p.id !== person.id)); person = other; assign.push({ from_ms: t, people: [other.id] }); push('Working', 'in_progress', between(2, 8) * H * scale, other.id); }
    push(board === 'video' ? 'Review' : 'Quality Check', 'review', between(1, 30) * H, person.id);
    let rounds = r() < 0.55 ? (r() < 0.25 ? 2 : 1) : 0;
    while (rounds-- > 0) {
      push('Fixes Round', 'fixes', between(1, 16) * H, 'r1');
      push('Working', 'in_progress', between(1, 6) * H * scale, person.id);
      push('For Approval', 'review', between(1, 20) * H, person.id);
    }
    if (r() < 0.1) { push('Approved', 'delivered', between(2, 30) * H, 'r2'); push('Fixes Round', 'fixes', between(1, 6) * H, 'r2'); push('Working', 'in_progress', between(1, 3) * H, person.id); }
    const doneAt = t < now ? t : null;
    if (doneAt) strip.push(['delivered', t, now, 'Approved', 'r2']);
    for (let k = 0; k < assign.length; k++) assign[k].to_ms = assign[k + 1]?.from_ms ?? now;
    const [product, color] = pick(FX_PRODUCTS);
    const campaigns = r() < 0.55 ? [pick(FX_CAMPAIGNS)] : [];
    const deadline = r() < 0.75 ? localDay(created + between(2, 9) * DAY) : null;
    tasks.push(fxMetrics({
      id: String(9000000000 + i), board, name: `${product} | ${type || pick(['Static set', 'Carousel', 'Banner pack', 'Landing visuals'])} ${['v1', 'v2', 'hooks', 'refresh', 'test'][i % 5]}`,
      url: 'https://monday.com', product: { label: product, color }, type: type || 'Design · no type', campaigns, requesters: [pick(['r1', 'r2', 'r3', 'r4'])],
      priority: pick(['High', 'Medium', 'Low', null]), deadline, created, strip, assign, doneAt, now,
    }));
  }
  fxCache = { at: now, tasks };
  return tasks;
}

function fxMetrics(x) {
  const end = x.doneAt ?? x.now;
  const by_category = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0]));
  let review = 0;
  let fixes = 0;
  let prev = null;
  const pieces = {};
  let estimated = false;
  let fixesWorked = 0;
  for (const [cat, a, b0] of x.strip) {
    const b = Math.min(b0, end);
    if (a >= end) break;
    by_category[cat] += b - a;
    if (cat === 'review' && prev !== 'review') review++;
    if (cat === 'fixes' && prev !== 'fixes') fixes++;
    prev = cat;
    if (cat !== 'in_progress' && cat !== 'fixes') continue;
    for (const p of x.assign) {
      const lo = Math.max(a, p.from_ms);
      const hi = Math.min(b, p.to_ms);
      if (hi <= lo) continue;
      for (const pid of p.people) {
        const bamboo = FX_PEOPLE[pid]?.bamboo;
        const ps = bamboo ? clockOf(pid, lo, hi) : slices(lo, hi);
        if (cat === 'fixes') { fixesWorked += sumPairs(ps); continue; }
        if (!bamboo) estimated = true;
        (pieces[pid] = pieces[pid] || []).push(...ps);
      }
    }
  }
  const worked_by_person = {};
  for (const [pid, ps] of Object.entries(pieces)) { pieces[pid] = unionPairs(ps); worked_by_person[pid] = sumPairs(pieces[pid]); }
  const firstWork = x.strip.find(s => s[0] === 'in_progress');
  const on_time = x.deadline ? (x.doneAt ? localDay(x.doneAt) <= x.deadline : (localDay(x.now) > x.deadline ? false : null)) : null;
  const people = [...new Set([...Object.keys(worked_by_person), ...x.assign[x.assign.length - 1].people])];
  return {
    id: x.id, board: x.board, name: x.name, url: x.url, product: x.product, type: x.type, campaigns: x.campaigns, requesters: x.requesters,
    priority: x.priority, people, current_people: x.assign[x.assign.length - 1].people, deadline: x.deadline,
    status: { label: x.strip[x.strip.length - 1][3], category: x.strip[x.strip.length - 1][0] }, partial: false,
    requested_at: x.created, first_started_at: firstWork ? firstWork[1] : null, delivered_at: x.doneAt, open: !x.doneAt,
    lead_ms: end - x.created, waiting_ms: firstWork ? firstWork[1] - x.created : end - x.created,
    worked_ms: sumPairs(unionPairs(Object.values(pieces).flat())), worked_by_person, fixes_worked_ms: fixesWorked, estimated,
    review_rounds: review, fix_rounds: fixes, moves: x.strip.length - 1, on_time, by_category,
    strip: x.strip, _pieces: pieces, assign: x.assign,
  };
}

const median = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const fxKeys = (t, by) => ({ person: t.people, type: [t.type], product: [t.product?.label || 'No product'], requester: t.requesters, campaign: t.campaigns, board: [t.board] }[by] || []);

function fxGroup(list, person, ctx) {
  const done = list.filter(t => t.delivered_in_range);
  const w = (t) => (person ? t.worked_by_person[person] || 0 : t.worked_ms);
  const by_category = Object.fromEntries(CATEGORY_ORDER.map(c => [c, done.reduce((a, t) => a + (t.by_category[c] || 0), 0)]));
  const timed = done.filter(t => t.on_time != null);
  const row = {
    tasks: list.length, delivered: done.length, open: list.filter(t => t.open).length,
    worked_total_ms: done.reduce((a, t) => a + w(t), 0), worked_median_ms: median(done.map(w)), worked_avg_ms: mean(done.map(w)),
    lead_median_ms: median(done.map(t => t.lead_ms)), lead_avg_ms: mean(done.map(t => t.lead_ms)), waiting_median_ms: median(done.map(t => t.waiting_ms)),
    review_rounds_avg: r1(mean(done.map(t => t.review_rounds))), fix_rounds_avg: r1(mean(done.map(t => t.fix_rounds))),
    on_time_pct: timed.length ? Math.round((timed.filter(t => t.on_time).length / timed.length) * 100) : null,
    estimated: done.filter(t => t.estimated).length, by_category,
  };
  if (person) {
    row.busy_ms = ctx.busy[person] || 0;
    row.clocked_ms = ctx.clocked[person] ?? null;
    row.utilization = row.clocked_ms ? Math.min(1, Math.round((row.busy_ms / row.clocked_ms) * 100) / 100) : null;
  }
  return row;
}
function fxAggregate(tasks, by, ctx) {
  const m = new Map();
  for (const t of tasks) for (const k of new Set(fxKeys(t, by))) { if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  return [...m.entries()].map(([key, list]) => {
    const p = FX_PEOPLE[key];
    return { key, label: p?.name || key, photo: null, matched: !!p?.bamboo, ...fxGroup(list, by === 'person' ? key : null, ctx) };
  }).sort((a, b) => (b.delivered - a.delivered) || (b.tasks - a.tasks));
}

function fxSelect(params) {
  const now = Date.now();
  const to = params.to > israelYmd(now) ? israelYmd(now) : params.to;
  const fromMs = dayStartMs(params.from);
  const toMs = dayStartMs(addDaysYmd(to, 1));
  const inR = (ms) => ms != null && ms >= fromMs && ms < toMs;
  const base = fixtureTasks()
    .filter(t => (!params.board || params.board === 'all' || t.board === params.board))
    .filter(t => (t.open && t.requested_at < toMs) || inR(t.delivered_at) || inR(t.requested_at))
    .map(t => ({ ...t, delivered_in_range: inR(t.delivered_at) }));
  const f = params;
  const tasks = base.filter(t => (!f.person || t.people.includes(f.person)) && (!f.product || t.product?.label === f.product) && (!f.type || t.type === f.type)
    && (!f.requester || t.requesters.includes(f.requester)) && (!f.campaign || t.campaigns.includes(f.campaign)))
    .sort((a, b) => (b.delivered_at ?? b.requested_at) - (a.delivered_at ?? a.requested_at));
  return { now, to, fromMs, toMs, base, tasks };
}

function fixtureOverview(params) {
  const { now, to, fromMs, toMs, base, tasks } = fxSelect(params);
  const end = Math.min(toMs, now);
  const busy = {};
  const clocked = {};
  for (const p of Object.values(FX_PEOPLE)) {
    if (!p.board) continue;
    const ps = unionPairs(tasks.flatMap(t => t._pieces[p.id] || []));
    const b = sumPairs(clipPairs(ps, fromMs, end));
    if (b) busy[p.id] = b;
    if (p.bamboo && (!params.person || params.person === p.id)) clocked[p.id] = sumPairs(clockOf(p.id, fromMs, end));
  }
  const ctx = { busy, clocked };
  const done = tasks.filter(t => t.delivered_in_range);
  const timed = done.filter(t => t.on_time != null);
  let cl = 0;
  let bz = 0;
  for (const [pid, c] of Object.entries(clocked)) if (tasks.some(t => t.people.includes(pid))) { cl += c; bz += Math.min(c, busy[pid] || 0); }
  const time = Object.fromEntries(CATEGORY_ORDER.map(c => [c, done.reduce((a, t) => a + (t.by_category[c] || 0), 0)]));
  const weeks = [];
  for (let w = addDaysYmd(params.from, -dowYmd(params.from)); w <= to; w = addDaysYmd(w, 7)) {
    const a = dayStartMs(w);
    const list = done.filter(t => t.delivered_at >= a && t.delivered_at < a + 7 * DAY);
    const tw = list.filter(t => t.on_time != null);
    weeks.push({ week: w, label: new Date(`${w}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), delivered: list.length,
      median_lead_ms: median(list.map(t => t.lead_ms)), median_worked_ms: median(list.map(t => t.worked_ms)), avg_review_rounds: r1(mean(list.map(t => t.review_rounds))),
      on_time_pct: tw.length ? Math.round((tw.filter(t => t.on_time).length / tw.length) * 100) : null });
  }
  const groups = new Map();
  for (const t of done) { if (!(t.worked_ms > 0)) continue; const k = `${t.board}|${t.type}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const outliers = [];
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    const med = median(list.map(t => t.worked_ms));
    for (const t of list) if (t.worked_ms > 2 * med) outliers.push({ id: t.id, name: t.name, board: t.board, type: t.type, url: t.url, people: t.people, worked_ms: t.worked_ms, median_ms: med, ratio: Math.round((t.worked_ms / med) * 10) / 10, estimated: t.estimated });
  }
  const count = (fn) => { const m = new Map(); for (const t of base) for (const k of fn(t)) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const anyMissing = Object.values(FX_PEOPLE).some(p => p.board && !p.bamboo);
  return {
    range: { from: params.from, to, from_ms: fromMs, to_ms: toMs, partial: toMs > now },
    generated_at: new Date(now - 4 * 60000).toISOString(),
    clock_source: anyMissing ? 'mixed' : 'bamboohr',
    warnings: [],
    board: params.board || 'all',
    boards: { video: { key: 'video', label: 'Video' }, design: { key: 'design', label: 'Design' } },
    people: Object.fromEntries(Object.values(FX_PEOPLE).map(p => [p.id, { id: p.id, name: p.name, photo: null, matched: !!p.bamboo }])),
    filters: {
      people: count(t => t.people).map(([id, n]) => ({ id, name: FX_PEOPLE[id]?.name || id, photo: null, count: n })),
      products: count(t => [t.product.label]).map(([label, n]) => ({ label, color: FX_PRODUCTS.find(p => p[0] === label)?.[1], count: n })),
      types: count(t => [t.type]).map(([label, n]) => ({ label, count: n })),
      requesters: count(t => t.requesters).map(([id, n]) => ({ id, name: FX_PEOPLE[id]?.name || id, photo: null, count: n })),
      campaigns: count(t => t.campaigns).map(([label, n]) => ({ label, count: n })),
    },
    kpis: {
      delivered: done.length, open: tasks.filter(t => t.open).length,
      median_lead_ms: median(done.map(t => t.lead_ms)), median_waiting_ms: median(done.map(t => t.waiting_ms)), median_worked_ms: median(done.map(t => t.worked_ms)),
      avg_review_rounds: r1(mean(done.map(t => t.review_rounds))), avg_fix_rounds: r1(mean(done.map(t => t.fix_rounds))),
      on_time_pct: timed.length ? Math.round((timed.filter(t => t.on_time).length / timed.length) * 100) : null,
      utilization: cl ? Math.round((bz / cl) * 100) / 100 : null, busy_ms: bz, clocked_ms: cl, estimated: done.filter(t => t.estimated).length, time_by_category: time,
    },
    tasks_total: tasks.length,
    tasks: tasks.map(({ _pieces, assign, ...t }) => t),   // eslint-disable-line no-unused-vars
    by_person: fxAggregate(tasks, 'person', ctx).filter(r => FX_PEOPLE[r.key]?.board && (!params.person || r.key === params.person)),
    by_type: fxAggregate(tasks, 'type', ctx),
    by_product: fxAggregate(tasks, 'product', ctx),
    by_requester: fxAggregate(tasks, 'requester', ctx),
    by_campaign: fxAggregate(tasks, 'campaign', ctx),
    by_board: fxAggregate(tasks, 'board', ctx),
    weekly: weeks,
    outliers: outliers.sort((a, b) => b.ratio - a.ratio).slice(0, 25),
  };
}

function fixtureCsv(params) {
  const { tasks } = fxSelect(params);
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const hrs = (ms) => (Number.isFinite(ms) ? Math.round((ms / H) * 100) / 100 : '');
  const rows = [['Board', 'Task', 'Product', 'Type', 'Editor / designer', 'Requested', 'Delivered', 'Lead time (h)', 'Worked, clocked (h)', 'Worked is estimated', 'Review rounds', 'Fix rounds']];
  for (const t of tasks) rows.push([t.board, t.name, t.product?.label, t.type, t.people.map(p => FX_PEOPLE[p]?.name).join('; '), fmtDateTime(t.requested_at), t.delivered_at ? fmtDateTime(t.delivered_at) : '', hrs(t.lead_ms), hrs(t.worked_ms), t.estimated ? 'yes' : 'no', t.review_rounds, t.fix_rounds]);
  return `﻿${rows.map(r => r.map(cell).join(',')).join('\r\n')}`;
}

function fixtureTask(board, itemId) {
  const all = fixtureTasks();
  const t = all.find(x => x.id === String(itemId)) || all.filter(x => x.board === board)[hash(itemId) % Math.max(1, all.filter(x => x.board === board).length)] || all[0];
  const segments = t.strip.map(([category, from_ms, to_ms, status, by]) => ({ category, from_ms, to_ms, status, by }));
  return {
    task: {
      id: String(itemId), board: t.board, name: t.name, url: t.url, product: t.product, type: t.type, deadline: t.deadline, status: t.status,
      people: t.current_people, requesters: t.requesters, partial: false, segments, assignees: t.assign,
      metrics: {
        requested_at: t.requested_at, first_started_at: t.first_started_at, delivered_at: t.delivered_at, open: t.open, deadline: t.deadline, on_time: t.on_time,
        lead_ms: t.lead_ms, waiting_ms: t.waiting_ms, still_waiting: t.open && !t.first_started_at, by_category: t.by_category,
        worked_ms: t.worked_ms, worked_by_person: t.worked_by_person, estimated: t.estimated, fixes_worked_ms: t.fixes_worked_ms,
        review_rounds: t.review_rounds, fix_rounds: t.fix_rounds, moves: t.moves, people: t.people,
        current: { status: t.status.label, category: t.status.category, since_ms: t.strip[t.strip.length - 1][1] },
      },
    },
    people: Object.fromEntries(Object.values(FX_PEOPLE).map(p => [p.id, { id: p.id, name: p.name, photo: null, matched: !!p.bamboo }])),
    clock_source: 'mixed',
    monday_timers: {},
    warnings: [],
    generated_at: new Date().toISOString(),
  };
}
