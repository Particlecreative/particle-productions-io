/**
 * Studio auto-plan — the timeline follows the work (Tomer, 16 Nov 2026: "sometimes editors or designers start a
 * project before it's scheduled — Natalie can work today on an assignment set for in 2 days. If this happens, change
 * the timeline to the day they're working on it. Tasks won't take 5 days for video or 3 for design any more, since
 * Captain Caption does the review and there's no line waiting for human feedback. But no one should go over their
 * tasks a day — if they started something and have more than that, move it to a date they're more available,
 * considering the deadline and priority.")
 *
 * When a task goes from a waiting status (Pending, Ready for Assignment…) to Working:
 *   1. its timeline starts the day they started — early or late; resumed work (from Paused, Fixes Round…) isn't moved;
 *   2. it gets the new, shorter length — video 2 working days, design 1 (Settings) — unless it was shorter already;
 *      a TV production keeps its own length;
 *   3. if that leaves the person over capacity on any of those days (capacity.js — 2 a day for an editor, 4 for a
 *      designer, a TV production fills its days), their other tasks that haven't started yet move to the first days
 *      with room: low priority and the most slack first; critical work and work due within 2 working days stay;
 *      never past a deadline — if nothing can move in time, it's left as it is and noted.
 * Everything is written to Monday as the panel and logged with Undo (Workload → Auto-plan). Off / On in the Workload.
 */
const db = require('../../db');
const monday = require('../monday');
const W = require('../creative/week');
const { getCreativeConfig } = require('../creative/config');
const C = require('./capacity');

const DEFAULTS = { mode: 'on', video_days: 2, design_days: 1, max_moves: 4 };
const PRI = { critical: 3, high: 2, medium: 1, low: 0 };
const norm = (s) => String(s ?? '').trim().toLowerCase();

let ready = null;
function ensureTables() {
  if (!ready) {
    ready = db.query(`CREATE TABLE IF NOT EXISTS studio_autoplan_log (
        id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT NOW(), kind TEXT NOT NULL, board TEXT, item_id TEXT, item_name TEXT,
        person_id TEXT, person_name TEXT, before JSONB, after JSONB, why TEXT, trigger_item TEXT, undone_at TIMESTAMPTZ, undone_by TEXT);
      CREATE INDEX IF NOT EXISTS studio_autoplan_log_at ON studio_autoplan_log (at DESC);
      CREATE TABLE IF NOT EXISTS studio_autoplan_cursor (board_id TEXT PRIMARY KEY, last_ms BIGINT NOT NULL, seen JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
      .catch(e => { ready = null; throw e; });
  }
  return ready;
}

async function getSettings(brandId = 'particle') {
  const { rows } = await db.query('SELECT config FROM studio_settings WHERE brand_id = $1', [brandId]).catch(() => ({ rows: [] }));
  return { ...DEFAULTS, ...(rows[0]?.config?.autoplan || {}) };
}
async function saveSettings(patch, brandId = 'particle') {
  const cur = await getSettings(brandId);
  const next = { ...cur };
  if (patch.mode !== undefined) { if (!['on', 'off'].includes(patch.mode)) throw Object.assign(new Error('Auto-plan is on or off'), { status: 400 }); next.mode = patch.mode; }
  for (const k of ['video_days', 'design_days']) if (patch[k] !== undefined) {
    const n = Math.round(Number(patch[k]));
    if (!(n >= 1 && n <= 10)) throw Object.assign(new Error('A task takes 1–10 working days'), { status: 400 });
    next[k] = n;
  }
  await db.query(`INSERT INTO studio_settings (brand_id, config, updated_at) VALUES ($1, jsonb_build_object('autoplan', $2::jsonb), NOW())
    ON CONFLICT (brand_id) DO UPDATE SET config = studio_settings.config || jsonb_build_object('autoplan', $2::jsonb), updated_at = NOW()`, [brandId, JSON.stringify(next)]);
  return next;
}

// ── the rules (pure — tested) ─────────────────────────────────────────────────
const plannedDays = (it, s) => (it.board === 'design' ? s.design_days : s.video_days) || 1;

/** A task that just went to Working on `day` → its new timeline, or null when it's already right. */
function planStart({ it, day, settings = DEFAULTS }) {
  const s = { ...DEFAULTS, ...settings };
  const cur = it.timeline?.from && it.timeline?.to ? it.timeline : null;
  const curLen = cur ? C.workdays(cur.from, cur.to).length : 0;
  const planned = plannedDays(it, s);
  const len = C.isTvProduction(it) ? Math.max(1, curLen || planned) : Math.max(1, Math.min(curLen || planned, planned));
  const from = day;
  const to = C.isWorkday(day) ? C.addWorkdays(day, len - 1) : C.addWorkdays(day, len - 1);   // a Friday start ends on Sunday at the earliest
  if (cur && cur.from === from && cur.to === to) return null;
  const early = cur && cur.from > day ? C.workdays(day, W.addDays(cur.from, -1)).length : 0;
  const why = !cur ? `started without a date → ${len} working day${len === 1 ? '' : 's'} from the day they started`
    : early ? `started ${early} working day${early === 1 ? '' : 's'} early — the timeline moves to the day they started`
      : cur.from < day ? 'started later than planned — the timeline moves to the day they started'
        : `shortened to ${len} working day${len === 1 ? '' : 's'} — no waiting for review now`;
  return { from, to, len, why };
}

const keepScore = (it, today) => (PRI[norm(it.priority?.label)] ?? 0.5) + (it.deadline && it.deadline <= C.addWorkdays(today, 2) ? 3 : 0);
const slack = (it, today) => (it.deadline ? C.workdays(today, it.deadline).length : 99);
const outOn = (out, d) => (out || []).some(o => o.start <= d && o.end >= d);

/** The first run of `len` working days from today with room every day, not off, ending by the deadline. */
function findWindow({ len, load, cap, today, deadline = null, out = [], horizon = 25 }) {
  let start = C.nextWorkday(today);
  for (let i = 0; i < horizon; i++) {
    const days = C.workdays(start, C.addWorkdays(start, len - 1));
    const to = days[days.length - 1];
    if (deadline && to > deadline) return null;
    if (days.every(d => !outOn(out, d) && (load[d] || 0) + 1 / len <= cap + 1e-9)) return { from: start, to };
    start = C.nextWorkday(W.addDays(start, 1));
  }
  return null;
}

/**
 * Make room on `days` for one person: move their tasks that haven't started yet to the first days with room.
 * items are mutated as moves are planned. → { moves: [{ it, before, after, day }], notes: [{ day, why }] }
 */
function makeRoom({ person, items, cap, today, days, settings = DEFAULTS, protect = new Set(), out = [] }) {
  const s = { ...DEFAULTS, ...settings };
  const moves = [], notes = [];
  const pid = String(person);
  for (const d of [...new Set(days)].filter(x => x >= today && C.isWorkday(x)).sort()) {
    for (let guard = 0; guard < 8 && moves.length < s.max_moves; guard++) {
      const load = C.loadByDay(items, pid, cap);
      if ((load[d] || 0) <= cap + 1e-9) break;
      const cands = items.filter(it => it.open && it.people?.includes(pid) && it.timeline?.from <= d && it.timeline?.to >= d && it.status?.category === 'queued'
          && !protect.has(String(it.id)) && !C.isTvProduction(it) && !it._moved)
        .sort((a, b) => keepScore(a, today) - keepScore(b, today) || slack(b, today) - slack(a, today));
      let moved = false;
      for (const it of cands) {
        if (keepScore(it, today) >= 3) continue;                       // critical, or due within 2 working days: stays
        const len = Math.max(1, Math.min(C.workdays(it.timeline.from, it.timeline.to).length || plannedDays(it, s), plannedDays(it, s)));
        const win = findWindow({ len, load: C.loadByDay(items, pid, cap, { skipId: it.id }), cap, today, deadline: it.deadline, out });
        if (!win || (win.from <= d && win.to >= d && len >= C.workdays(it.timeline.from, it.timeline.to).length)) continue;
        moves.push({ it, before: { ...it.timeline }, after: win, day: d });
        it.timeline = win;
        it._moved = true;
        moved = true;
        break;
      }
      if (!moved) {
        notes.push({ day: d, why: cands.length ? 'everything else that day is critical, due soon, or has no room before its deadline — left as it is' : 'nothing else that day can move (it’s all started already)' });
        break;
      }
    }
  }
  return { moves, notes };
}

// ── running it ────────────────────────────────────────────────────────────────
const statusText = (v) => (v == null ? null : typeof v === 'string' ? v : (v.text || v.label?.text || v.label || null));
const inList = (list, v) => (list || []).some(x => norm(x) === norm(v));
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayText = (d) => DAY.format(new Date(`${d}T12:00:00Z`));
const span = (t) => (t.from === t.to ? dayText(t.from) : `${dayText(t.from)} → ${dayText(t.to)}`);

async function log(row) {
  await db.query(`INSERT INTO studio_autoplan_log (kind, board, item_id, item_name, person_id, person_name, before, after, why, trigger_item)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [row.kind, row.board || null, row.item_id || null, row.item_name || null, row.person_id || null, row.person_name || null,
    row.before ? JSON.stringify(row.before) : null, row.after ? JSON.stringify(row.after) : null, row.why || null, row.trigger_item || null]);
}

/** Every 2 minutes (captain-worker): a task that just went from waiting to Working → an auto-plan job. */
async function watch(brandId = 'particle') {
  const s = await getSettings(brandId);
  if (s.mode !== 'on') return { off: true };
  await ensureTables();
  const cfg = await getCreativeConfig(brandId);
  const { enqueue } = require('../captain/queue');
  const out = {};
  for (const bk of ['video', 'design']) {
    const b = cfg.boards[bk];
    if (!b) continue;
    const { rows } = await db.query('SELECT last_ms, seen FROM studio_autoplan_cursor WHERE board_id = $1', [b.board_id]);
    const now = Date.now();
    const since = rows[0] ? Number(rows[0].last_ms) - 5 * 60 * 1000 : now - 2 * 60 * 1000;   // first run: from now on only
    const seen = new Set(rows[0]?.seen || []);
    const { events } = await monday.activityLogs(b.board_id, { fromIso: new Date(since).toISOString(), columnIds: [b.columns.status], limit: 200, maxPages: 3 });
    let last = rows[0] ? Number(rows[0].last_ms) : since, queued = 0;
    const keep = [];
    for (const e of events) {
      last = Math.max(last, e.at_ms || 0);
      if ((e.at_ms || 0) > now - 30 * 60 * 1000) keep.push(e.id);
      if (seen.has(e.id)) continue;
      const to = statusText(e.value), from = statusText(e.prev);
      if (!inList(b.statuses.in_progress, to)) continue;
      if (from && !inList(b.statuses.queued, from)) continue;          // resumed work (Paused, Fixes Round…) keeps its dates
      const id = await enqueue('studio_autoplan', { board: bk, item_id: String(e.pulse_id), at_ms: e.at_ms }, { dedupeKey: `autoplan:${e.id}`, delaySec: 45, maxAttempts: 2, priority: 6 }).catch(() => null);
      if (id) queued++;
    }
    await db.query(`INSERT INTO studio_autoplan_cursor (board_id, last_ms, seen) VALUES ($1, $2, $3)
      ON CONFLICT (board_id) DO UPDATE SET last_ms = GREATEST(studio_autoplan_cursor.last_ms, EXCLUDED.last_ms), seen = EXCLUDED.seen, updated_at = NOW()`,
      [b.board_id, last || now, JSON.stringify([...new Set([...keep, ...[...seen].slice(-300)])].slice(-500))]);
    out[bk] = queued;
  }
  return out;
}

/** One start: payload { board, item_id, at_ms }. */
async function run(payload, { brandId = 'particle' } = {}) {
  const s = await getSettings(brandId);
  if (s.mode !== 'on') return { off: true };
  await ensureTables();
  const cfg = await getCreativeConfig(brandId);
  const { getStudio } = require('./data');
  const { updateTask } = require('./write');
  const today = W.localDate(Date.now());
  const day = W.localDate(payload.at_ms || Date.now());
  const from = W.addDays(today, -W.dow(today));
  monday.clearCache(`studio:${brandId}:`);
  const data = await getStudio({ brandId, from, to: W.addDays(from, 34), lite: true, force: true });
  const items = Object.values(data.items).filter(it => ['video', 'design'].includes(it.board)).map(it => ({ ...it, timeline: it.timeline ? { ...it.timeline } : null }));
  const it = items.find(x => String(x.id) === String(payload.item_id));
  if (!it || !it.open) return { skipped: 'not open' };
  if (it.status?.category !== 'in_progress') return { skipped: `moved on to ${it.status?.label}` };
  const nameOf = (id) => data.people?.[id]?.name || null;
  const done = { started: null, moved: [], notes: [] };

  const plan = planStart({ it, day, settings: s });
  if (plan) {
    const before = it.timeline ? { ...it.timeline } : null;
    await updateTask(cfg, { board: it.board, itemId: it.id, timeline: { from: plan.from, to: plan.to } });
    it.timeline = { from: plan.from, to: plan.to };
    await log({ kind: 'start', board: it.board, item_id: it.id, item_name: it.name, person_id: it.people[0] || null, person_name: nameOf(it.people[0]), before, after: it.timeline, why: plan.why });
    done.started = { ...it.timeline, why: plan.why };
  }
  if (!it.timeline) return done;

  for (const pid of it.people) {
    const role = data.people?.[pid]?.role || it.board;
    const cap = C.perDay(data.capacity_week, role);
    const r = makeRoom({ person: pid, items, cap, today, days: C.workdays(it.timeline.from, it.timeline.to), settings: s, protect: new Set([String(it.id)]), out: data.people?.[pid]?.out || [] });
    for (const m of r.moves) {
      try {
        await updateTask(cfg, { board: m.it.board, itemId: m.it.id, timeline: m.after });
        const why = `made room on ${dayText(m.day)} after “${it.title || it.name}” started — moved to ${span(m.after)}${m.it.deadline ? ` (due ${dayText(m.it.deadline)})` : ''}`;
        await log({ kind: 'room', board: m.it.board, item_id: m.it.id, item_name: m.it.name, person_id: pid, person_name: nameOf(pid), before: m.before, after: m.after, why, trigger_item: it.id });
        done.moved.push({ id: m.it.id, ...m.after });
      } catch (e) { done.notes.push(`couldn’t move ${m.it.name}: ${e.message}`); }
    }
    if (r.notes.length) {   // one heads-up per person, however many days
      const days = r.notes.map(n => dayText(n.day)).join(', ');
      const why = `${C.isTvProduction(it) ? 'a TV production should be the only thing on its days, but ' : ''}over capacity on ${days} — ${r.notes[0].why}`;
      await log({ kind: 'note', board: it.board, item_id: it.id, item_name: it.name, person_id: pid, person_name: nameOf(pid), why, trigger_item: it.id });
      done.notes.push(why);
    }
  }
  return done;
}

/** Undo one change — only if nobody changed that task's dates since. */
async function undo(id, { actor = null, brandId = 'particle' } = {}) {
  await ensureTables();
  const { rows } = await db.query('SELECT * FROM studio_autoplan_log WHERE id = $1', [id]);
  const r = rows[0];
  if (!r || !['start', 'room'].includes(r.kind)) throw Object.assign(new Error('Nothing to undo'), { status: 404 });
  if (r.undone_at) throw Object.assign(new Error('Already undone'), { status: 400 });
  const cfg = await getCreativeConfig(brandId);
  const b = cfg.boards[r.board];
  const d = await monday.mondayQuery(`query ($ids: [ID!]) { items(ids: $ids) { id column_values(ids: ["${b.columns.timeline}"]) { ... on TimelineValue { from to } } } }`, { ids: [String(r.item_id)] });
  const now = d?.items?.[0]?.column_values?.[0] || {};
  if (W.dateOnly(now.from) !== r.after?.from || W.dateOnly(now.to) !== r.after?.to) throw Object.assign(new Error('Its dates were changed since — not undone'), { status: 409 });
  await require('./write').updateTask(cfg, { board: r.board, itemId: r.item_id, timeline: r.before || null });
  await db.query('UPDATE studio_autoplan_log SET undone_at = NOW(), undone_by = $2 WHERE id = $1', [id, actor]);
  return { ok: true, timeline: r.before };
}

async function recent({ days = 7, limit = 60 } = {}) {
  await ensureTables();
  const { rows } = await db.query(`SELECT id, at, kind, board, item_id, item_name, person_id, person_name, before, after, why, undone_at, undone_by
    FROM studio_autoplan_log WHERE at > NOW() - make_interval(days => $1) ORDER BY at DESC LIMIT $2`, [days, limit]);
  return rows;
}

module.exports = { DEFAULTS, getSettings, saveSettings, planStart, makeRoom, findWindow, watch, run, undo, recent, plannedDays };
