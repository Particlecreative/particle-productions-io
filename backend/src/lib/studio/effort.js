/**
 * Effort by activity (pure).
 *
 * A task "costs" time only while it is ACTIVE (Working / Fixes Round) AND its person is present:
 * clocked in on BambooHR when we have their clock data, otherwise Israel work hours
 * (Sun–Thu 09:00–19:00). Paused, review, queued, nights and weekends never count. When one person
 * has several tasks active at the same moment, that moment is split equally between them — so a
 * person's total can never exceed the time they actually worked, and per-task numbers add up.
 */
const W = require('../creative/week');

const WORK_START_H = 9;
const WORK_END_H = 19;
const HOUR = 3600000;

/** Work-hour slices of [a, b) — Sun–Thu, 09:00–19:00 Israel time. */
function workSlices(a, b) {
  const out = [];
  if (!(b > a)) return out;
  for (let d = W.localDate(a); d <= W.localDate(b - 1); d = W.addDays(d, 1)) {
    if (W.dow(d) > 4) continue;
    const mid = W.zonedMidnightUtc(d);
    const s = Math.max(a, mid + WORK_START_H * HOUR);
    const e = Math.min(b, mid + WORK_END_H * HOUR);
    if (e > s) out.push([s, e]);
  }
  return out;
}

/**
 * Status spans for one item in [fromMs, toMs) from its status events (any order).
 * initialLabel = status before the first event (falls back to the first event's previous value).
 */
function statusSpans(events, { fromMs, toMs, initialLabel = '' }) {
  const list = [...events].filter(e => Number.isFinite(e.at_ms)).sort((x, y) => x.at_ms - y.at_ms);
  let label = list.length && list[0].at_ms >= fromMs ? (list[0].prev?.text ?? initialLabel) : initialLabel;
  // Events before the window only set the starting state
  for (const e of list) if (e.at_ms < fromMs) label = e.value?.text ?? label;
  const spans = [];
  let cursor = fromMs;
  for (const e of list) {
    if (e.at_ms < fromMs) continue;
    if (e.at_ms >= toMs) break;
    if (e.at_ms > cursor) spans.push({ a: cursor, b: e.at_ms, label });
    cursor = Math.max(cursor, e.at_ms);
    label = e.value?.text ?? label;
  }
  if (toMs > cursor) spans.push({ a: cursor, b: toMs, label });
  return spans;
}

/** Raw [a, b] intervals where the item was active (not yet limited to working time). */
function activeSpans(spans, isActive) {
  return spans.filter(s => isActive(s.label) && s.b > s.a).map(s => [s.a, s.b]);
}

/** Work-hour slices where the item was active (no clock data). */
function activeWork(spans, isActive) {
  const iv = [];
  for (const s of spans) if (isActive(s.label)) iv.push(...workSlices(s.a, s.b));
  return iv;
}

/** Intersection of two sorted, internally disjoint interval lists. */
function intersect(xs, ys) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < xs.length && j < ys.length) {
    const a = Math.max(xs[i][0], ys[j][0]);
    const b = Math.min(xs[i][1], ys[j][1]);
    if (b > a) out.push([a, b]);
    if (xs[i][1] < ys[j][1]) i++; else j++;
  }
  return out;
}

/** Merge overlapping intervals. */
function union(list) {
  const sorted = [...list].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}

/**
 * Split each person's time among their concurrently active tasks.
 * tasks: [{ id, people: [uid], iv: [[a, b], ...] }]
 * presence: { uid: sorted intervals the person worked (clock-ins) } — people without it use `fallback`
 * → { task: { id: seconds }, person: { uid: seconds }, personDay: { uid: { date: seconds } }, taskPerson: { id: { uid: seconds } } }
 */
function splitEffort(tasks, { presence = null, fallback = null } = {}) {
  const byPerson = new Map();
  for (const t of tasks) {
    if (!t.iv?.length) continue;
    const own = union(t.iv);
    for (const uid of t.people || []) {
      // Limit to when this person was actually working: their clock-ins, else the default work hours
      const window = presence?.[uid] || fallback;
      const iv = window ? intersect(own, window) : own;
      if (!iv.length) continue;
      if (!byPerson.has(uid)) byPerson.set(uid, []);
      for (const [a, b] of iv) byPerson.get(uid).push([a, 1, t.id], [b, -1, t.id]);
    }
  }
  const task = {};
  const person = {};
  const personDay = {};
  const taskPerson = {};
  for (const [uid, pts] of byPerson) {
    pts.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1])); // ends before starts at the same instant
    const active = new Map();
    let prev = null;
    for (const [t, delta, id] of pts) {
      if (prev != null && t > prev && active.size) {
        const len = (t - prev) / 1000;
        const share = len / active.size;
        for (const tid of active.keys()) {
          task[tid] = (task[tid] || 0) + share;
          (taskPerson[tid] = taskPerson[tid] || {})[uid] = (taskPerson[tid][uid] || 0) + share;
        }
        person[uid] = (person[uid] || 0) + len;
        const day = W.localDate(prev);
        (personDay[uid] = personDay[uid] || {})[day] = (personDay[uid][day] || 0) + len;
      }
      const n = (active.get(id) || 0) + delta;
      if (n > 0) active.set(id, n); else active.delete(id);
      prev = t;
    }
  }
  const round = (o) => { for (const k of Object.keys(o)) o[k] = Math.round(o[k]); return o; };
  round(task); round(person);
  for (const d of Object.values(personDay)) round(d);
  for (const d of Object.values(taskPerson)) round(d);
  return { task, person, personDay, taskPerson };
}

module.exports = { workSlices, statusSpans, activeSpans, activeWork, splitEffort, intersect, union, WORK_START_H, WORK_END_H };
