/**
 * Task time tracking — the maths (pure: no I/O, no clock reads unless `now` is left out).
 *
 * Every Video / Design ticket lives on Monday. From its status and person activity log we rebuild:
 *   - segments: the status it sat in, from the request (item created) until now, each with its category
 *     (queued · in_progress · review · fixes · stuck · paused · delivered · other) and who moved it there;
 *   - assignees over time: who was the editor / designer at each moment (person column changes);
 *   - metrics: lead time (request → delivered or now), waiting before the first Working, wall-clock time per
 *     category, review / fix rounds, moves, on time, and WORKED (clocked) = time in Working while the assignee of
 *     that moment was clocked in on BambooHR. People we can't match to BambooHR (or time before the team clocked
 *     in) fall back to Israel working hours — Sun–Thu 09:00–19:00 — and the task is flagged "estimated".
 * Plus aggregations (by person / type / product / requester / campaign / board), outliers and a weekly trend.
 *
 * Times are epoch ms. Dates are Israel calendar dates "YYYY-MM-DD". Israel moves its clocks twice a year — every
 * local-time conversion here goes through the time zone, so 09:00 is 09:00 local on both sides of a change.
 *
 * Same definitions as the Studio (studio/data.js + effort.js): statuses map to categories through the board's
 * `statuses` config (blank = queued, unknown = other); segments are effort.statusSpans; metrics.life is
 * effort.taskLife (the Studio Time tab's "life": started / completed / phases / fix rounds) so the two can be linked.
 * What this adds: who was assigned at each moment, worked time against THAT person's clock-ins (not split between
 * parallel tasks — see `busy` for the person-level union), delivered = first done after the last work, review rounds.
 */
'use strict';

// The Studio's own building blocks (Studio → Time tab, Hot Projects): the same status rebuild, the same "life" rule
// and the same interval maths — so a task's statuses, phases and rounds never disagree between the two views.
const effort = require('../studio/effort');

const TZ = 'Asia/Jerusalem';
const HOUR = 3600000;
const DAY = 86400000;
const WORK_START_H = 9;
const WORK_END_H = 19;
const CATEGORIES = ['queued', 'in_progress', 'review', 'fixes', 'stuck', 'paused', 'delivered'];
const ALL_CATEGORIES = [...CATEGORIES, 'other'];
const WORK = new Set(['in_progress', 'fixes']);   // "work happened" — for finding the real delivery after a reopen

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── Israel time (one cached formatter; Intl handles the DST rules) ───────────
let fmt = null;
function partsOf(ms) {
  fmt = fmt || new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const o = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}
/** Israel's offset from UTC at instant `ms` (ms). */
function offsetMs(ms) {
  const p = partsOf(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
const pad = (n) => String(n).padStart(2, '0');
/** Israel calendar date of an instant. */
function localYmd(ms) {
  const p = partsOf(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) throw new Error(`Invalid date "${s}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function addDays(ymd, n) {
  const [y, m, d] = parseYmd(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** 0 = Sunday … 6 = Saturday */
function dow(ymd) {
  const [y, m, d] = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** UTC instant of `hour`:00 local time on Israel date `ymd` (DST-correct). */
function zonedUtc(ymd, hour = 0) {
  const [y, m, d] = parseYmd(ymd);
  const naive = Date.UTC(y, m - 1, d, hour);
  let guess = naive - offsetMs(naive);
  for (let i = 0; i < 2; i++) guess = naive - offsetMs(guess);
  return guess;
}
/** Sunday of the Israel week holding `ymd`. */
const sundayOf = (ymd) => addDays(ymd, -dow(ymd));

// ── Intervals ────────────────────────────────────────────────────────────────
/** Any interval shape → sorted, merged [[a, b], …] ({start_ms,end_ms} · {from_ms,to_ms} · [a, b]). */
function pairs(list) {
  const out = [];
  for (const x of list || []) {
    let a, b;
    if (Array.isArray(x)) [a, b] = x;
    else if (x && typeof x === 'object') { a = x.start_ms ?? x.from_ms; b = x.end_ms ?? x.to_ms; }
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b]);
  }
  return effort.union(out);
}
/** Intersection of two interval lists (any shape) → merged pairs. */
function intersect(xs, ys) {
  return effort.intersect(pairs(xs), pairs(ys));
}
const total = (ps) => ps.reduce((s, [a, b]) => s + (b - a), 0);
/** How much of `segments` falls inside `intervals` (ms). Both lists in any interval shape. */
function overlap(intervals, segments) {
  return total(intersect(intervals, segments));
}

// ── Working hours fallback ──────────────────────────────────────────────────
const dayHours = new Map();   // ymd → [start, end] | null  (memo — the rules never change)
function workDay(ymd) {
  if (!dayHours.has(ymd)) {
    dayHours.set(ymd, dow(ymd) > 4 ? null : [zonedUtc(ymd, WORK_START_H), zonedUtc(ymd, WORK_END_H)]);
    if (dayHours.size > 5000) dayHours.delete(dayHours.keys().next().value);
  }
  return dayHours.get(ymd);
}
/** Israel working hours inside [from, to): Sun–Thu 09:00–19:00 (Fri / Sat never). → [{ start_ms, end_ms }] */
function workingHoursFallback(from, to) {
  return workingPairs(from, to).map(([a, b]) => ({ start_ms: a, end_ms: b }));
}
function workingPairs(from, to) {
  const out = [];
  if (!(Number.isFinite(from) && Number.isFinite(to) && to > from)) return out;
  const last = localYmd(to - 1);
  for (let d = localYmd(from); d <= last; d = addDays(d, 1)) {
    const h = workDay(d);
    if (!h) continue;
    const a = Math.max(from, h[0]);
    const b = Math.min(to, h[1]);
    if (b > a) out.push([a, b]);
  }
  return out;
}

// ── Status → category ───────────────────────────────────────────────────────
const catMaps = new WeakMap();
/**
 * A status label's category from the board's statuses config ({ delivered: [...], in_progress: [...], … }) — the
 * Studio's rule (studio/data.js boardStatuses + its life category): blank = queued (a new ticket), unknown = 'other'.
 */
function categoryOf(statusText, statusesConfig) {
  const n = norm(statusText);
  if (!n) return 'queued';
  let map = null;
  if (statusesConfig && typeof statusesConfig === 'object') {
    map = catMaps.get(statusesConfig);
    if (!map) {
      map = new Map();
      for (const cat of CATEGORIES) for (const l of statusesConfig[cat] || []) if (!map.has(norm(l))) map.set(norm(l), cat);
      catMaps.set(statusesConfig, map);
    }
  }
  return map?.get(n) || 'other';
}

// ── Rebuilding the history ──────────────────────────────────────────────────
const toMs = (v) => {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
};
const textOf = (v) => (v && typeof v === 'object' ? String(v.text ?? v.label ?? '') : String(v ?? ''));
const byTime = (a, b) => (a.at_ms - b.at_ms) || String(a.id ?? '').localeCompare(String(b.id ?? ''));

/**
 * Status segments from the request until `now`.
 * item: { created_at, status (current label or { label }) } · statusEvents: activity log rows ({ at_ms, prev: { text },
 * value: { text }, user_id }) for the status column, any order.
 * The status before the first event = that event's previous value (else the current status when nothing moved).
 * opts.fromMs: the history we have starts here (older events weren't read) — segments start there, not at created_at.
 * → [{ status, category, from_ms, to_ms, by }]  (consecutive stretches of the same status are one segment)
 */
function segments(item, statusEvents, now = Date.now(), statusesConfig = item?.statuses, opts = {}) {
  const evs = (statusEvents || []).filter(e => e && Number.isFinite(e.at_ms)).sort(byTime);
  const created = toMs(item?.created_at);
  let start = Number.isFinite(created) ? created : (evs[0]?.at_ms ?? now);
  if (evs.length && evs[0].at_ms < start) start = evs[0].at_ms;          // a log row a moment before created_at
  if (Number.isFinite(opts.fromMs) && opts.fromMs > start) start = opts.fromMs;
  const current = item?.status && typeof item.status === 'object' ? item.status.label : item?.status;
  // The Studio's rebuild: before the first move it was in that move's previous status; with no moves, its status now
  const spans = effort.statusSpans(evs.map(e => ({ at_ms: e.at_ms, prev: { text: textOf(e.prev) }, value: { text: textOf(e.value) } })),
    { fromMs: start, toMs: now, initialLabel: evs.length ? '' : textOf(current) });
  const setter = new Map();   // instant → the move made then (who moved it)
  for (const e of evs) setter.set(e.at_ms, e);
  const out = [];
  for (const s of spans) {
    const label = s.label ?? '';
    const last = out[out.length - 1];
    if (last && last.status === label && last.to_ms === s.a) { last.to_ms = s.b; continue; }
    const e = setter.get(s.a);
    out.push({
      status: label, category: categoryOf(label, statusesConfig), from_ms: s.a, to_ms: s.b,
      by: e && textOf(e.value) === label && e.user_id != null ? String(e.user_id) : null,
    });
  }
  return out;
}

/** People ids in a raw person-column value (string or object; teams skipped), sorted. */
function peopleOfRaw(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const list = v && typeof v === 'object' ? (v.personsAndTeams || v.persons_and_teams || []) : [];
  return [...new Set(list.filter(p => p && p.kind !== 'team' && p.id != null).map(p => String(p.id)))].sort();
}

/**
 * Who was on the task when. item: { created_at, people (current ids) } · personEvents: activity rows for the person
 * column with prev_raw / value_raw. → [{ from_ms, to_ms, people: [ids] }]
 */
function assigneesOverTime(item, personEvents, now = Date.now(), opts = {}) {
  const evs = (personEvents || []).filter(e => e && Number.isFinite(e.at_ms)).sort(byTime);
  const created = toMs(item?.created_at);
  let start = Number.isFinite(created) ? created : (evs[0]?.at_ms ?? now);
  if (evs.length && evs[0].at_ms < start) start = evs[0].at_ms;
  if (Number.isFinite(opts.fromMs) && opts.fromMs > start) start = opts.fromMs;
  let people = evs.length ? peopleOfRaw(evs[0].prev_raw) : [...new Set((item?.people || []).map(String))].sort();
  const out = [];
  const push = (a, b, ps) => {
    if (!(b > a)) return;
    const last = out[out.length - 1];
    if (last && last.people.join() === ps.join() && last.to_ms === a) { last.to_ms = b; return; }
    out.push({ from_ms: a, to_ms: b, people: ps });
  };
  let cursor = start;
  for (const e of evs) {
    const at = Math.min(e.at_ms, now);
    if (at > cursor) { push(cursor, at, people); cursor = at; }
    people = peopleOfRaw(e.value_raw);
  }
  push(cursor, now, people);
  return out;
}

// ── Worked time ─────────────────────────────────────────────────────────────
/**
 * Where person `uid` was working inside [lo, hi): their BambooHR clock-ins when we have them, else working hours.
 * clock: { byPerson: { uid: intervals }, since_ms } — time before since_ms (the team wasn't clocking in yet) uses
 * working hours too. → { real: pairs, est: pairs }
 */
function presence(uid, lo, hi, clock) {
  const iv = clock?.byPerson?.[uid];
  if (!iv) return { real: [], est: workingPairs(lo, hi) };
  const since = Number.isFinite(clock.since_ms) ? clock.since_ms : -Infinity;
  const est = since > lo ? workingPairs(lo, Math.min(hi, since)) : [];
  const real = intersect(iv, [[Math.max(lo, since), hi]]);
  return { real, est };
}

/**
 * Worked time over a set of work intervals, attributed to whoever was assigned at that moment.
 * → { total_ms (union over people — a task worked by two at once counts once), by_person: { uid: ms }, pieces: { uid: pairs },
 *     estimated_ms, estimated }
 */
function workedOver(work, assignees, clock, fallbackPeople = []) {
  const periods = assignees?.length ? assignees : [{ from_ms: -Infinity, to_ms: Infinity, people: fallbackPeople }];
  const all = [];
  const est = [];
  const pieces = {};
  for (const [a, b] of work) {
    for (const p of periods) {
      const lo = Math.max(a, p.from_ms);
      const hi = Math.min(b, p.to_ms);
      if (!(hi > lo)) continue;
      if (!p.people?.length) {               // nobody on it — working hours, nobody's share
        const fb = workingPairs(lo, hi);
        all.push(...fb); est.push(...fb);
        continue;
      }
      for (const uid of p.people) {
        const { real, est: e } = presence(uid, lo, hi, clock);
        (pieces[uid] = pieces[uid] || []).push(...real, ...e);
        all.push(...real, ...e);
        est.push(...e);
      }
    }
  }
  const by_person = {};
  for (const [uid, ps] of Object.entries(pieces)) {
    pieces[uid] = pairs(ps);
    const ms = total(pieces[uid]);
    if (ms > 0) by_person[uid] = ms;
  }
  const estMs = total(pairs(est));
  return { total_ms: total(pairs(all)), by_person, pieces, estimated_ms: estMs, estimated: estMs > 0 };
}

/**
 * One task's numbers.
 * task: { created_at, deadline ("YYYY-MM-DD" | null), people (current ids) }
 * ctx: { segments, assignees, clock: { byPerson, since_ms }, now, range: { from_ms, to_ms } }
 */
function metrics(task, { segments: segs = [], assignees = [], clock = null, now = Date.now(), range = null } = {}) {
  const created = toMs(task?.created_at);
  const requested_at = Number.isFinite(created) ? created : (segs[0]?.from_ms ?? now);
  const final = segs[segs.length - 1] || null;

  const firstWork = segs.find(s => s.category === 'in_progress');
  const first_started_at = firstWork ? Math.max(firstWork.from_ms, requested_at) : null;

  // Delivered = it's done now; the moment = the first move into a delivered status after the last work
  // (Working / Fixes) — so an approval that was reopened for fixes doesn't count, and later done → done moves don't either.
  let delivered_at = null;
  if (final && final.category === 'delivered') {
    let lastWorkEnd = null;
    for (const s of segs) if (WORK.has(s.category)) lastWorkEnd = s.to_ms;
    const d = segs.find(s => s.category === 'delivered' && (lastWorkEnd == null || s.from_ms >= lastWorkEnd));
    delivered_at = Math.max((d || final).from_ms, requested_at);
  }
  const open = delivered_at == null;
  const end = open ? Math.max(now, requested_at) : delivered_at;

  const by_category = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0]));
  let review_rounds = 0;
  let fix_rounds = 0;
  let moves = 0;
  const movers = {};
  let prevCat = null;
  segs.forEach((s, i) => {
    if (s.from_ms > end) return;                          // after delivery
    const a = Math.max(s.from_ms, requested_at);
    const b = Math.min(s.to_ms, end);
    if (b > a) by_category[s.category] = (by_category[s.category] || 0) + (b - a);
    if (i > 0) {
      moves++;
      if (s.by) movers[s.by] = (movers[s.by] || 0) + 1;
    }
    if (s.category === 'review' && prevCat !== 'review') review_rounds++;
    if (s.category === 'fixes' && prevCat !== 'fixes') fix_rounds++;
    prevCat = s.category;
  });

  const clip = (cat) => segs.filter(s => s.category === cat)
    .map(s => [Math.max(s.from_ms, requested_at), Math.min(s.to_ms, end)]).filter(([a, b]) => b > a);
  const worked = workedOver(clip('in_progress'), assignees, clock, task?.people || []);
  const fixes = workedOver(clip('fixes'), assignees, clock, task?.people || []);

  // In the range: delivered in it, and the worked time that happened in it (for utilization)
  let in_range = null;
  if (range && Number.isFinite(range.from_ms) && Number.isFinite(range.to_ms)) {
    const R = [[range.from_ms, range.to_ms]];
    const byPerson = {};
    for (const [uid, ps] of Object.entries(worked.pieces)) {
      const ms = overlap(ps, R);
      if (ms > 0) byPerson[uid] = ms;
    }
    in_range = {
      delivered: !open && delivered_at >= range.from_ms && delivered_at < range.to_ms,
      created: requested_at >= range.from_ms && requested_at < range.to_ms,
      worked_by_person: byPerson,
    };
  }

  let on_time = null;
  const deadline = /^\d{4}-\d{2}-\d{2}/.test(String(task?.deadline || '')) ? String(task.deadline).slice(0, 10) : null;
  if (deadline) {
    if (!open) on_time = localYmd(delivered_at) <= deadline;
    else if (localYmd(now) > deadline) on_time = false;
  }

  const people = [...new Set([...(assignees || []).flatMap(p => p.people || []), ...(task?.people || []).map(String)])];
  // The Studio Time tab's "life" for the same segments (effort.taskLife) — to link the two views
  const life = effort.taskLife(segs.map(s => ({ label: s.category, a: s.from_ms, b: s.to_ms })), (c) => c);
  return {
    requested_at,
    first_started_at,
    delivered_at,
    deadline,
    on_time,
    open,
    lead_ms: Math.max(0, end - requested_at),
    waiting_ms: first_started_at != null ? Math.max(0, first_started_at - requested_at) : (open ? Math.max(0, end - requested_at) : null),
    still_waiting: open && first_started_at == null,
    by_category,
    worked_ms: worked.total_ms,
    worked_by_person: worked.by_person,
    worked_pieces: worked.pieces,          // server-side only (person-level union); routes strip it
    estimated: worked.estimated,
    estimated_ms: worked.estimated_ms,
    fixes_worked_ms: fixes.total_ms,
    review_rounds,
    fix_rounds,
    moves,
    movers,
    people,
    current: final ? { status: final.status, category: final.category, since_ms: final.from_ms } : null,
    in_range,
    life: { started_ms: life.started_ms, completed_ms: life.completed_ms, fix_rounds: life.fix_rounds, phases: life.phases },
  };
}

// ── Aggregation ─────────────────────────────────────────────────────────────
function median(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function mean(xs) {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
}
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const delivered = (t) => (t.metrics?.in_range ? t.metrics.in_range.delivered : !t.metrics?.open);

/** The group keys a task belongs to for `by`. */
function keysOf(t, by) {
  const m = t.metrics || {};
  switch (by) {
    // whoever has worked time on it, plus who's on it now (not someone assigned and removed before any work)
    case 'person': return [...new Set([...Object.keys(m.worked_by_person || {}), ...(t.people || []).map(String)])];
    case 'type': return [t.type || `${t.board === 'design' ? 'Design' : t.board === 'video' ? 'Video' : 'Other'} · no type`];
    case 'product': return [t.product?.label && t.product.label !== '-' ? t.product.label : 'No product'];
    case 'requester': return t.requesters?.length ? t.requesters : ['unknown'];
    case 'campaign': return t.campaigns || [];
    case 'board': return [t.board || 'other'];
    default: return [];
  }
}

/**
 * Per person: the time inside the range when at least one of their tasks was in Working while they were clocked in
 * (union over tasks — two tasks in Working at once count once). Utilization = busy ÷ clocked, so it can't pass 100%.
 * → { personId: ms }
 */
function busyByPerson(tasks, range) {
  const acc = {};
  const R = range && Number.isFinite(range.from_ms) && Number.isFinite(range.to_ms) ? [[range.from_ms, range.to_ms]] : null;
  for (const t of tasks || []) {
    for (const [uid, ps] of Object.entries(t.metrics?.worked_pieces || {})) (acc[uid] = acc[uid] || []).push(...ps);
  }
  const out = {};
  for (const [uid, ps] of Object.entries(acc)) {
    const ms = R ? overlap(ps, R) : total(pairs(ps));
    if (ms > 0) out[uid] = ms;
  }
  return out;
}

/** Stats for one group of tasks. person = the person this row is about (their share of worked time). */
function groupStats(list, { person = null, clocked = null, busy = null } = {}) {
  const done = list.filter(delivered);
  const workedOf = (t) => (person ? (t.metrics.worked_by_person?.[person] || 0) : t.metrics.worked_ms);
  const by_category = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0]));
  for (const t of done) for (const c of ALL_CATEGORIES) by_category[c] += t.metrics.by_category?.[c] || 0;
  const timed = done.filter(t => t.metrics.on_time != null);
  const row = {
    tasks: list.length,
    delivered: done.length,
    open: list.filter(t => t.metrics.open).length,
    worked_total_ms: done.reduce((a, t) => a + workedOf(t), 0),
    worked_median_ms: median(done.map(workedOf)),
    worked_avg_ms: mean(done.map(workedOf)),
    lead_median_ms: median(done.map(t => t.metrics.lead_ms)),
    lead_avg_ms: mean(done.map(t => t.metrics.lead_ms)),
    waiting_median_ms: median(done.map(t => t.metrics.waiting_ms)),
    review_rounds_avg: round1(mean(done.map(t => t.metrics.review_rounds))),
    fix_rounds_avg: round1(mean(done.map(t => t.metrics.fix_rounds))),
    on_time_pct: timed.length ? Math.round((timed.filter(t => t.metrics.on_time).length / timed.length) * 100) : null,
    estimated: done.filter(t => t.metrics.estimated).length,
    by_category,
  };
  if (person) {
    row.worked_in_range_ms = list.reduce((a, t) => a + (t.metrics.in_range?.worked_by_person?.[person] || 0), 0);
    const b = busy?.[person];
    row.busy_ms = Number.isFinite(b) ? b : row.worked_in_range_ms;
    const c = clocked?.[person];
    row.clocked_ms = Number.isFinite(c) ? c : null;
    row.utilization = Number.isFinite(c) && c > 0 ? Math.min(1, Math.round((row.busy_ms / c) * 100) / 100) : null;
  }
  return row;
}

/**
 * Group tasks by 'person' | 'type' | 'product' | 'requester' | 'campaign' | 'board'.
 * opts.clocked: { personId: ms clocked in the range } · opts.busy: busyByPerson() (utilization) · opts.labelOf(key) → label
 * → rows sorted by delivered tasks, then tasks: [{ key, label, ...groupStats }]
 */
function aggregate(tasks, by, opts = {}) {
  const groups = new Map();
  for (const t of tasks || []) {
    for (const k of new Set(keysOf(t, by))) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
  }
  const rows = [];
  for (const [key, list] of groups) {
    rows.push({ key, label: opts.labelOf ? opts.labelOf(key) : key, ...groupStats(list, by === 'person' ? { person: key, clocked: opts.clocked, busy: opts.busy } : {}) });
  }
  return rows.sort((a, b) => (b.delivered - a.delivered) || (b.tasks - a.tasks) || String(a.label).localeCompare(String(b.label)));
}

/**
 * Delivered tasks whose worked time is more than `factor` × the median of their type (same board), in types with at
 * least `minGroup` delivered tasks that have worked time. → [{ id, name, board, type, worked_ms, median_ms, ratio }] biggest first
 */
function outliers(tasks, { factor = 2, minGroup = 3 } = {}) {
  const groups = new Map();
  for (const t of tasks || []) {
    if (!delivered(t) || !(t.metrics.worked_ms > 0)) continue;
    const k = `${t.board}|${keysOf(t, 'type')[0]}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = [];
  for (const list of groups.values()) {
    if (list.length < minGroup) continue;
    const med = median(list.map(t => t.metrics.worked_ms));
    if (!(med > 0)) continue;
    for (const t of list) {
      if (t.metrics.worked_ms > factor * med) {
        out.push({ id: t.id, name: t.name, board: t.board, type: keysOf(t, 'type')[0], url: t.url || null, people: t.metrics.people || [],
          worked_ms: t.metrics.worked_ms, median_ms: med, ratio: Math.round((t.metrics.worked_ms / med) * 10) / 10, estimated: !!t.metrics.estimated });
      }
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (ymd) => { const [, m, d] = parseYmd(ymd); return `${MON[m - 1]} ${d}`; };

/** Delivered tasks by Israel week (Sunday start) across [from, to] (dates). */
function weekly(tasks, { from, to }) {
  const weeks = [];
  for (let w = sundayOf(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  const buckets = new Map(weeks.map(w => [w, []]));
  for (const t of tasks || []) {
    if (t.metrics?.open || !Number.isFinite(t.metrics?.delivered_at)) continue;
    const w = sundayOf(localYmd(t.metrics.delivered_at));
    if (buckets.has(w)) buckets.get(w).push(t);
  }
  return weeks.map((w) => {
    const list = buckets.get(w);
    const timed = list.filter(t => t.metrics.on_time != null);
    return {
      week: w,
      label: shortDay(w),
      delivered: list.length,
      median_lead_ms: median(list.map(t => t.metrics.lead_ms)),
      median_worked_ms: median(list.map(t => t.metrics.worked_ms)),
      avg_review_rounds: round1(mean(list.map(t => t.metrics.review_rounds))),
      on_time_pct: timed.length ? Math.round((timed.filter(t => t.metrics.on_time).length / timed.length) * 100) : null,
    };
  });
}

/**
 * The KPI row. clocked: { personId: ms clocked in the range } (only people matched to BambooHR) · busy: busyByPerson().
 * Utilization = their busy time ÷ their clocked time, over the people who clocked in.
 */
function kpis(tasks, { clocked = {}, busy = null } = {}) {
  const done = (tasks || []).filter(delivered);
  const timed = done.filter(t => t.metrics.on_time != null);
  const busyMs = busy || busyByPerson(tasks, null);
  let worked = 0;
  let clock = 0;
  for (const [uid, c] of Object.entries(clocked || {})) {
    if (!(c > 0)) continue;
    clock += c;
    worked += Math.min(c, busyMs[uid] || 0);
  }
  const time = Object.fromEntries(ALL_CATEGORIES.map(c => [c, 0]));
  for (const t of done) for (const c of ALL_CATEGORIES) time[c] += t.metrics.by_category?.[c] || 0;
  return {
    delivered: done.length,
    open: (tasks || []).filter(t => t.metrics.open).length,
    median_lead_ms: median(done.map(t => t.metrics.lead_ms)),
    median_waiting_ms: median(done.map(t => t.metrics.waiting_ms)),
    median_worked_ms: median(done.map(t => t.metrics.worked_ms)),
    avg_review_rounds: round1(mean(done.map(t => t.metrics.review_rounds))),
    avg_fix_rounds: round1(mean(done.map(t => t.metrics.fix_rounds))),
    on_time_pct: timed.length ? Math.round((timed.filter(t => t.metrics.on_time).length / timed.length) * 100) : null,
    utilization: clock > 0 ? Math.round((worked / clock) * 100) / 100 : null,
    busy_ms: worked,
    clocked_ms: clock,
    estimated: done.filter(t => t.metrics.estimated).length,
    time_by_category: time,
  };
}

module.exports = {
  TZ, HOUR, DAY, CATEGORIES, ALL_CATEGORIES, WORK_START_H, WORK_END_H,
  categoryOf, segments, assigneesOverTime, peopleOfRaw, overlap, intersect, pairs, workingHoursFallback, workingPairs,
  presence, workedOver, metrics, aggregate, groupStats, busyByPerson, outliers, weekly, kpis, keysOf, median, mean,
  localYmd, zonedUtc, addDays, dow, sundayOf,
};
