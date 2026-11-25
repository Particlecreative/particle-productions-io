/**
 * Task time tracking — reading Monday + BambooHR (the maths is in engine.js).
 *
 * For a range [from, to] (Israel dates) and the Video / Design boards:
 *   items = still open, or created in the range, or delivered in the range (open tasks older than a year are left out);
 *   their status + person activity log from the request (a year back at most) — board-wide since the range start,
 *   per item (50 at a time) for what came before;
 *   BambooHR clock-in intervals for everyone who was on them (working hours when BambooHR isn't connected / can't
 *   match someone).
 * Activity logs are heavy: a board's raw read is cached 25 min, the computed dataset too; ?force=1 reads again.
 */
const monday = require('../monday');
const { getCreativeConfig } = require('../creative/config');
const { normalizeItem, knownProductsOf } = require('../creative/snapshot');
const { boardStatuses } = require('../studio/data');
const bamboo = require('../studio/bamboohr');
const E = require('./engine');

const DAY = 86400000;
const TTL = 25 * 60000;
const HISTORY_DAYS = 365;
const MAX_RANGE_DAYS = 120;
const MAX_ITEMS = 1500;           // per board
const CHUNK = 50;                 // items per older-history read
const BOARDS = ['video', 'design'];
const SKIP = new Set(['files', 'concept', 'hook', 'finished_files', 'working_time', 'frame', 'dropbox', 'figma', 'project_link', 'versions']);
const norm = monday.normLabel;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** Range bounds for [from, to] (inclusive Israel dates; `to` no later than today). */
function rangeBounds({ from, to } = {}, now = Date.now()) {
  if (!DATE_RE.test(String(from || '')) || !DATE_RE.test(String(to || ''))) throw bad('Pick a start and an end date');
  const today = E.localYmd(now);
  const t = to > today ? today : to;
  if (t < from) throw bad('The start is after the end');
  const fromMs = E.zonedUtc(from, 0);
  const toMs = E.zonedUtc(E.addDays(t, 1), 0);
  const days = Math.round((toMs - fromMs) / DAY);
  if (days > MAX_RANGE_DAYS) throw bad(`Pick ${MAX_RANGE_DAYS} days or less`);
  return { from, to: t, days, fromMs, toMs, endMs: Math.min(toMs, now), fromIso: new Date(fromMs).toISOString() };
}

function parseTs(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (/^\d+$/.test(String(v))) { const n = Number(v); return n > 1e12 ? n : n * 1000; }
  return Date.parse(v);
}

/** Monday's own duration timers (review / lifecycle / stuck / upload) in seconds — a cross-check, as Monday shows them. */
function timersOf(raw, board, now) {
  const out = {};
  for (const [k, id] of Object.entries(board.timers || {})) {
    const cv = id && (raw.column_values || []).find(x => x.id === id);
    if (!cv) continue;
    let dur = Number(cv.duration);
    if (!Number.isFinite(dur)) { try { dur = Number(JSON.parse(cv.value || '{}').duration); } catch { dur = NaN; } }
    const started = parseTs(cv.started_at);
    const live = cv.running && Number.isFinite(started) ? Math.max(0, (now - started) / 1000) : 0;
    const s = Math.round((Number.isFinite(dur) ? dur : 0) + live);
    if (s > 0 || cv.running) out[k] = { s, running: !!cv.running };
  }
  return out;
}

/** Run `fn` over `list`, `n` at a time. */
async function inPool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) { const k = i++; await fn(list[k], k); }
  }));
}

/** The task fields we keep from a normalized Monday item. */
function trimItem(it, raw, board, cats) {
  const cv = (id) => (raw.column_values || []).find(x => x.id === id);
  const camp = board.columns.campaign ? cv(board.columns.campaign) : null;
  const campaigns = camp?.values?.length ? camp.values.map(v => v.label).filter(Boolean)
    : String(it.campaign || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    id: it.id,
    board: it.board,
    name: it.name,
    url: it.monday_url || raw.url || null,
    product: it.product?.label && it.product.label !== '-' ? { label: it.product.label, color: it.product.color || null } : null,
    type: it.type?.label || null,
    department: it.department?.label || null,
    division: it.division || it.board,
    campaigns,
    priority: it.priority?.label || null,
    people: it.people,
    requesters: it.requested_by || [],
    deadline: it.deadline || null,
    created_at: Date.parse(it.created_at) || null,
    status: { label: it.status.label, color: it.status.color || null, category: cats(it.status.label) },
    state: raw.state || 'active',
  };
}

/**
 * One board's raw read for the range: items + their status / person events (cached).
 * → { key, label, now, status_col, person_col, statuses, status_colors, items: [{ ...trimItem, events, history_from, partial, timers }], warnings }
 */
async function buildBoard(R, bk, { brandId, now = Date.now() }) {
  const deadline = now + 50000;
  const config = await getCreativeConfig(brandId);
  const board = config.boards[bk];
  if (!board?.board_id) throw bad(`No ${bk} board configured`);
  const meta = await monday.boardMeta(board.board_id);
  const c = board.columns;
  const { sm, statusCategory } = boardStatuses(bk, board, meta);
  const cats = (label) => E.categoryOf(label, board.statuses);
  const knownProducts = new Set();
  knownProductsOf(meta, c, knownProducts);
  const cols = [...new Set([
    ...Object.entries(c).filter(([role, id]) => id && !SKIP.has(role)).map(([, id]) => id),
    ...Object.values(board.timers || {}),
  ])].filter(id => meta.columns[id]);
  const logCols = [c.status, c.person].filter(id => id && meta.columns[id]);
  const doneIdx = [...new Set((board.statuses.delivered || []).map(l => sm.byLabel[norm(l)]).filter(i => i != null))];
  const warnings = [];

  const [open, recent] = await Promise.all([
    monday.fetchAllItems(board.board_id, {
      cols, maxPages: 4, deadline,
      queryParams: doneIdx.length ? { rules: [{ column_id: c.status, compare_value: doneIdx, operator: 'not_any_of' }] } : null,
    }),
    // Every status / person move on the board since the range started (newest work + deliveries + new tickets)
    monday.activityLogs(board.board_id, { fromIso: R.fromIso, toIso: new Date(now + 60000).toISOString(), columnIds: logCols, raw: true, maxPages: 40, deadline }),
  ]);
  if (open.truncated) warnings.push(`${board.label}: more than 2,000 open tasks — the oldest are left out`);
  if (recent.truncated) warnings.push(`${board.label}: a very busy stretch — the earliest moves in this range may be missing`);

  const events = new Map();
  const seen = new Set();
  const addEvents = (list) => {
    for (const e of list || []) {
      if (!e.pulse_id || e.parent_item_id || seen.has(e.id) || !logCols.includes(e.column_id)) continue;
      seen.add(e.id);
      if (!events.has(e.pulse_id)) events.set(e.pulse_id, []);
      events.get(e.pulse_id).push({ id: e.id, column_id: e.column_id, at_ms: e.at_ms, user_id: e.user_id, prev: e.prev, value: e.value, prev_raw: e.prev_raw ?? null, value_raw: e.value_raw ?? null });
    }
  };
  addEvents(recent.events);

  // Finished tasks moved since the range began (delivered in it, or created in it) — read them too
  const raws = new Map(open.items.map(r => [String(r.id), r]));
  const touched = [...events.keys()].filter(id => !raws.has(id));
  if (touched.length > MAX_ITEMS) warnings.push(`${board.label}: more than ${MAX_ITEMS} finished tasks moved in this range — the rest are left out`);
  if (touched.length) for (const r of await monday.itemsByIds(touched.slice(0, MAX_ITEMS), { cols, deadline })) raws.set(String(r.id), r);

  const ctx = { boardKey: bk, board, meta, config, bounds: { fromMs: R.fromMs, toMs: R.toMs }, now, knownProducts, statusCategory };
  const floor = now - HISTORY_DAYS * DAY;
  let staleOpen = 0;
  let items = [];
  for (const raw of raws.values()) {
    if (raw.state === 'deleted' || (raw.board?.id && String(raw.board.id) !== String(board.board_id))) continue;
    const t = trimItem(normalizeItem(raw, ctx), raw, board, cats);
    const created = t.created_at ?? now;
    const isOpen = t.status.category !== 'delivered';
    const evs = events.get(t.id) || [];
    const createdIn = created >= R.fromMs && created < R.toMs;
    const doneMove = evs.some(e => e.column_id === c.status && cats(e.value?.text) === 'delivered');
    if (!isOpen && !createdIn && !doneMove) continue;              // finished before the range, only touched later
    if (isOpen && created < floor) { staleOpen++; continue; }
    items.push({ ...t, timers: timersOf(raw, board, now), history_from: created < floor ? floor : null, partial: created < floor });
  }
  if (staleOpen) warnings.push(`${board.label}: ${staleOpen} open task${staleOpen === 1 ? '' : 's'} older than a year left out`);
  if (items.length > MAX_ITEMS) {
    items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    warnings.push(`${board.label}: ${items.length} tasks — showing the newest ${MAX_ITEMS}`);
    items = items.slice(0, MAX_ITEMS);
  }

  // What happened before the range began, for tasks requested earlier (oldest first, 50 at a time)
  const older = items.filter(x => (x.created_at ?? now) < R.fromMs).sort((a, b) => a.created_at - b.created_at);
  const chunks = [];
  for (let i = 0; i < older.length; i += CHUNK) chunks.push(older.slice(i, i + CHUNK));
  let cut = 0;
  await inPool(chunks, 2, async (chunk) => {
    const lost = () => { for (const x of chunk) { x.partial = true; x.history_from = Math.max(x.history_from || 0, R.fromMs); } cut += chunk.length; };
    if (Date.now() > deadline) return lost();
    const from = Math.max(chunk[0].created_at, floor) - 60000;
    try {
      const r = await monday.activityLogs(board.board_id, {
        fromIso: new Date(from).toISOString(), toIso: new Date(R.fromMs + 60000).toISOString(),
        columnIds: logCols, itemIds: chunk.map(x => x.id), raw: true, maxPages: 10, deadline,
      });
      addEvents(r.events);
      if (r.truncated) for (const x of chunk) x.partial = true;
    } catch (e) {
      console.warn('[timetrack] older history', board.label, e.message);
      lost();
    }
  });
  if (cut) warnings.push(`${board.label}: the history before ${R.from} couldn’t be read for ${cut} task${cut === 1 ? '' : 's'} — their times start at ${R.from}`);

  const colors = {};
  for (const v of Object.values(sm.byIndex || {})) if (v.label && !v.deactivated) colors[v.label] = v.color || null;
  for (const x of items) x.events = events.get(x.id) || [];
  return {
    key: bk, label: board.label, board_id: board.board_id, now,
    status_col: c.status, person_col: c.person, statuses: board.statuses, status_colors: colors,
    items, warnings,
  };
}

function rawBoard(R, bk, { brandId, force }) {
  return monday.cached(`timetrack:raw:${brandId}:${bk}:${R.from}:${R.to}`, TTL, () => buildBoard(R, bk, { brandId, now: Date.now() }), { force });
}

/** Names, photos and emails for Monday people (config.team display names win). */
async function peopleMap(ids, config, warnings) {
  const out = {};
  if (!ids.length) return out;
  let users = [];
  try { users = await monday.usersByIds(ids); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const byId = Object.fromEntries((users || []).map(u => [String(u.id), u]));
  for (const id of ids) {
    const u = byId[id];
    const t = config.team?.[id] || {};
    let name = t.display_name || u?.name || `User ${id}`;
    if (/@/.test(name)) name = name.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    out[id] = { id, name, photo: u?.photo_small || u?.photo_thumb_small || null, email: u?.email || null, role: t.role || null };
  }
  return out;
}

/** Clock-in intervals for `workers` (BambooHR), or null → everyone on working hours. */
async function clockFor(workers, people, fromMs, now, warnings) {
  if (!workers.length || !(await bamboo.configured().catch(() => false))) return { clock: null, matched: {}, source: 'work_hours' };
  try {
    const fromYmd = E.localYmd(Math.max(fromMs, now - HISTORY_DAYS * DAY));
    const r = await bamboo.entriesFor(workers.map(id => ({ id, name: people[id]?.name, email: people[id]?.email })), fromYmd, E.localYmd(now));
    if (!r.since) {
      warnings.push('BambooHR has no clock-ins for these people in this time — working hours (Sun–Thu 09:00–19:00) are used instead');
      return { clock: null, matched: {}, source: 'work_hours' };
    }
    return {
      clock: { byPerson: Object.fromEntries(Object.entries(r.intervals).map(([k, v]) => [k, E.pairs(v)])), since_ms: E.zonedUtc(r.since, 0) },
      matched: r.matched,
      source: r.unmatched.length ? 'mixed' : 'bamboohr',
    };
  } catch (e) {
    warnings.push(`BambooHR: ${e.message} — working hours (Sun–Thu 09:00–19:00) are used instead`);
    return { clock: null, matched: {}, source: 'work_hours' };
  }
}

/** Segments + assignees of a raw item. */
function rebuild(x, b) {
  const statusEvs = x.events.filter(e => e.column_id === b.status_col);
  const personEvs = x.events.filter(e => e.column_id === b.person_col);
  const opts = { fromMs: x.history_from ?? undefined };
  return {
    segs: E.segments({ created_at: x.created_at, status: x.status.label }, statusEvs, b.now, b.statuses, opts),
    assignees: E.assigneesOverTime({ created_at: x.created_at, people: x.people }, personEvs, b.now, opts),
  };
}

async function buildDataset(R, { brandId, boards, force }) {
  const config = await getCreativeConfig(brandId);
  const raws = await Promise.all(boards.map(bk => rawBoard(R, bk, { brandId, force })));
  const warnings = raws.flatMap(b => b.warnings);
  const now = Math.max(...raws.map(b => b.now));

  const pre = [];
  const workers = new Set();
  const ids = new Set();
  let firstWork = R.fromMs;
  for (const b of raws) {
    for (const x of b.items) {
      const { segs, assignees } = rebuild(x, b);
      pre.push({ x, b, segs, assignees });
      for (const p of assignees) for (const id of p.people) ids.add(id);
      for (const id of [...x.people, ...x.requesters]) ids.add(id);
      for (const s of segs) {
        if (s.category !== 'in_progress' && s.category !== 'fixes') continue;
        firstWork = Math.min(firstWork, s.from_ms);
        for (const p of assignees) if (p.from_ms < s.to_ms && p.to_ms > s.from_ms) for (const id of p.people) workers.add(id);
      }
      for (const id of x.people) workers.add(id);
    }
  }
  const people = await peopleMap([...ids], config, warnings);
  const { clock, matched, source } = await clockFor([...workers], people, firstWork, now, warnings);
  for (const id of Object.keys(people)) { people[id].matched = !!matched[id]; people[id].bamboo_id = matched[id] ? String(matched[id]) : null; }

  const range = { from_ms: R.fromMs, to_ms: R.toMs };
  const tasks = [];
  for (const { x, b, segs, assignees } of pre) {
    const metrics = E.metrics({ created_at: x.created_at, deadline: x.deadline, people: x.people }, { segments: segs, assignees, clock, now: b.now, range });
    // still open (and already requested by the end of the range), or requested / delivered in it
    if (!((metrics.open && metrics.requested_at < R.toMs) || metrics.in_range.delivered || metrics.in_range.created)) continue;
    const { events, ...rest } = x;
    tasks.push({ ...rest, metrics, segments: segs, assignees });
  }

  // Clocked time inside the range, per person who worked on these tasks (utilization)
  const clocked = {};
  if (clock) {
    for (const id of workers) {
      const iv = clock.byPerson[id];
      if (iv) clocked[id] = E.overlap(iv, [[Math.max(R.fromMs, clock.since_ms), R.endMs]]);
    }
  }
  return {
    range: { from: R.from, to: R.to, days: R.days, from_ms: R.fromMs, to_ms: R.toMs, partial: R.toMs > now },
    generated_at: new Date(now).toISOString(),
    boards: Object.fromEntries(raws.map(b => [b.key, { key: b.key, label: b.label, status_colors: b.status_colors }])),
    people,
    tasks,
    clocked,
    clock_source: source,
    warnings,
  };
}

/**
 * The dataset for a range: { range, generated_at, boards, people, tasks: [{ …item, metrics, segments, assignees }],
 * clocked: { personId: ms }, clock_source: 'bamboohr' | 'mixed' | 'work_hours', warnings }.
 * board: 'all' | 'video' | 'design'.
 */
async function load(range, { brandId = 'particle', board = 'all', force = false, now = Date.now() } = {}) {
  const R = rangeBounds(range, now);
  const boards = board === 'all' || !board ? BOARDS : BOARDS.filter(b => b === board);
  if (!boards.length) throw bad('Board is all, video or design');
  const key = `timetrack:${brandId}:${boards.join('+')}:${R.from}:${R.to}`;
  return monday.cached(key, TTL, () => buildDataset(R, { brandId, boards, force }), { force });
}

// ── The management panel's answer ───────────────────────────────────────────
const typeKey = (t) => E.keysOf(t, 'type')[0];
const productKey = (t) => E.keysOf(t, 'product')[0];

/** Does a task pass the filters? { person, product, type, requester, campaign } */
function matches(t, f = {}) {
  if (f.person && !E.keysOf(t, 'person').includes(String(f.person))) return false;
  if (f.product && productKey(t) !== f.product) return false;
  if (f.type && typeKey(t) !== f.type) return false;
  if (f.requester && !(t.requesters || []).includes(String(f.requester))) return false;
  if (f.campaign && !(t.campaigns || []).includes(f.campaign)) return false;
  return true;
}

/** A task for the list: no raw intervals, the strip as [category, from, to, status, by]. */
function trimTask(t) {
  const m = t.metrics;
  return {
    id: t.id, board: t.board, name: t.name, url: t.url, product: t.product, type: typeKey(t), campaigns: t.campaigns,
    requesters: t.requesters, priority: t.priority, people: E.keysOf(t, 'person'), current_people: t.people, deadline: t.deadline,
    status: t.status, partial: !!t.partial,
    requested_at: m.requested_at, first_started_at: m.first_started_at, delivered_at: m.delivered_at, open: m.open,
    delivered_in_range: !!m.in_range?.delivered,
    lead_ms: m.lead_ms, waiting_ms: m.waiting_ms, worked_ms: m.worked_ms, fixes_worked_ms: m.fixes_worked_ms,
    estimated: m.estimated, review_rounds: m.review_rounds, fix_rounds: m.fix_rounds, moves: m.moves, on_time: m.on_time,
    by_category: m.by_category,
    strip: t.segments.map(s => [s.category, s.from_ms, s.to_ms, s.status, s.by]),
  };
}

const sortTasks = (a, b) => (b.metrics.delivered_at ?? b.metrics.requested_at ?? 0) - (a.metrics.delivered_at ?? a.metrics.requested_at ?? 0);

/** Filter options from the whole dataset (so a dropdown doesn't lose its choices once something is picked). */
function filterOptions(data) {
  const count = (fn) => {
    const m = new Map();
    for (const t of data.tasks) for (const k of fn(t)) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const person = (id) => ({ id, name: data.people[id]?.name || `User ${id}`, photo: data.people[id]?.photo || null });
  const productColor = {};
  for (const t of data.tasks) if (t.product?.label) productColor[t.product.label] = t.product.color;
  return {
    people: count(t => E.keysOf(t, 'person')).map(([id, n]) => ({ ...person(id), count: n })),
    products: count(t => [productKey(t)]).map(([label, n]) => ({ label, color: productColor[label] || null, count: n })),
    types: count(t => [typeKey(t)]).map(([label, n]) => ({ label, count: n })),
    requesters: count(t => t.requesters || []).map(([id, n]) => ({ ...person(id), count: n })),
    campaigns: count(t => t.campaigns || []).map(([label, n]) => ({ label, count: n })),
  };
}

/** Everything the panel shows for the filters. */
function overview(data, f = {}) {
  const tasks = data.tasks.filter(t => matches(t, f)).sort(sortTasks);
  const range = { from_ms: data.range.from_ms, to_ms: data.range.to_ms };
  const busy = E.busyByPerson(tasks, range);
  // A person filter = that person's clock only
  const clocked = f.person ? (data.clocked[f.person] != null ? { [f.person]: data.clocked[f.person] } : {})
    : Object.fromEntries(Object.entries(data.clocked).filter(([id]) => busy[id] != null || tasks.some(t => t.people.includes(id))));
  const name = (id) => data.people[id]?.name || (id === 'unknown' ? 'Not set' : `User ${id}`);
  const withPerson = (rows) => rows.map(r => ({ ...r, label: name(r.key), photo: data.people[r.key]?.photo || null, matched: !!data.people[r.key]?.matched }));
  const by = (k, opts) => E.aggregate(tasks, k, opts);
  const byPerson = withPerson(by('person', { clocked: data.clocked, busy }))
    .filter(r => !f.person || r.key === String(f.person));
  return {
    range: data.range,
    generated_at: data.generated_at,
    clock_source: data.clock_source,
    warnings: data.warnings,
    boards: data.boards,
    people: Object.fromEntries(Object.entries(data.people).map(([id, p]) => [id, { id, name: p.name, photo: p.photo, matched: !!p.matched, role: p.role }])),
    filters: filterOptions(data),
    applied: f,
    kpis: E.kpis(tasks, { clocked, busy }),
    tasks_total: tasks.length,
    tasks: tasks.slice(0, 1500).map(trimTask),
    by_person: byPerson,
    by_type: by('type'),
    by_product: by('product'),
    by_requester: withPerson(by('requester')),
    by_campaign: by('campaign'),
    by_board: by('board'),
    weekly: E.weekly(tasks, { from: data.range.from, to: data.range.to }),
    outliers: E.outliers(tasks).slice(0, 25),
  };
}

// ── CSV ─────────────────────────────────────────────────────────────────────
const CSV_CATS = ['queued', 'in_progress', 'review', 'fixes', 'stuck', 'paused', 'delivered', 'other'];
const CAT_LABEL = { queued: 'Waiting', in_progress: 'Working', review: 'In review', fixes: 'Fixes', stuck: 'Stuck', paused: 'Paused', delivered: 'Done then reopened', other: 'Other statuses' };
const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const hours = (ms) => (Number.isFinite(ms) ? Math.round((ms / 3600000) * 100) / 100 : '');
function localDateTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = E.localYmd(ms);
  const t = new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: E.TZ, hourCycle: 'h23' });
  return `${d} ${t}`;
}

/** The task list as CSV (Excel-friendly: BOM, Israel times, hours as numbers). */
function toCsv(data, f = {}) {
  const tasks = data.tasks.filter(t => matches(t, f)).sort(sortTasks);
  const name = (id) => data.people[id]?.name || id;
  const head = ['Board', 'Task', 'Monday link', 'Product', 'Type', 'Campaign', 'Requested by', 'Editor / designer', 'Status now',
    'Requested', 'First started', 'Delivered', 'Deadline', 'On time', 'Lead time (h)', 'Waiting before start (h)',
    'Worked, clocked (h)', 'Worked is estimated', 'Clocked during fixes (h)', 'Review rounds', 'Fix rounds', 'Status moves',
    ...CSV_CATS.map(c => `${CAT_LABEL[c]} (h)`), 'History incomplete'];
  const rows = tasks.map((t) => {
    const m = t.metrics;
    return [
      data.boards[t.board]?.label || t.board, t.name, t.url, t.product?.label || '', typeKey(t), (t.campaigns || []).join('; '),
      (t.requesters || []).map(name).join('; '), E.keysOf(t, 'person').map(name).join('; '), t.status?.label || '',
      localDateTime(m.requested_at), localDateTime(m.first_started_at), localDateTime(m.delivered_at), m.deadline || '',
      m.on_time == null ? '' : m.on_time ? 'yes' : 'no', hours(m.lead_ms), hours(m.waiting_ms),
      hours(m.worked_ms), m.estimated ? 'yes' : 'no', hours(m.fixes_worked_ms), m.review_rounds, m.fix_rounds, m.moves,
      ...CSV_CATS.map(c => hours(m.by_category?.[c] || 0)), t.partial ? 'yes' : '',
    ];
  });
  return `﻿${[head, ...rows].map(r => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

// ── One task (the task panel) ───────────────────────────────────────────────
async function buildTask({ brandId, board: bk, itemId, now = Date.now() }) {
  const config = await getCreativeConfig(brandId);
  const board = config.boards[bk];
  if (!board?.board_id) throw bad('Unknown board', 404);
  const meta = await monday.boardMeta(board.board_id);
  const c = board.columns;
  const { statusCategory } = boardStatuses(bk, board, meta);
  const cats = (label) => E.categoryOf(label, board.statuses);
  const cols = [...new Set([...Object.entries(c).filter(([role, id]) => id && !SKIP.has(role)).map(([, id]) => id), ...Object.values(board.timers || {})])].filter(id => meta.columns[id]);
  const [raw] = await monday.itemsByIds([String(itemId)], { cols });
  if (!raw || raw.state === 'deleted' || String(raw.board?.id) !== String(board.board_id)) throw bad('This task isn’t on that board', 404);
  const knownProducts = new Set();
  knownProductsOf(meta, c, knownProducts);
  const it = trimItem(normalizeItem(raw, { boardKey: bk, board, meta, config, bounds: { fromMs: now, toMs: now }, now, knownProducts, statusCategory }), raw, board, cats);
  const floor = now - HISTORY_DAYS * DAY;
  const created = it.created_at ?? now;
  const logCols = [c.status, c.person].filter(id => id && meta.columns[id]);
  const { events, truncated } = await monday.activityLogs(board.board_id, {
    fromIso: new Date(Math.max(created, floor) - 60000).toISOString(), toIso: new Date(now + 60000).toISOString(),
    columnIds: logCols, itemIds: [it.id], raw: true, limit: 500, maxPages: 4,
  });
  const mine = events.filter(e => e.pulse_id === it.id && !e.parent_item_id);
  const b = { now, status_col: c.status, person_col: c.person, statuses: board.statuses };
  const x = { ...it, events: mine, history_from: created < floor ? floor : null };
  const { segs, assignees } = rebuild(x, b);

  const warnings = [];
  const ids = [...new Set([...assignees.flatMap(p => p.people), ...it.people, ...it.requesters, ...segs.map(s => s.by).filter(Boolean)])];
  const people = await peopleMap(ids, config, warnings);
  const workers = [...new Set([...assignees.flatMap(p => p.people), ...it.people])];
  const firstWork = segs.find(s => s.category === 'in_progress' || s.category === 'fixes')?.from_ms ?? now;
  const { clock, matched, source } = await clockFor(workers, people, firstWork, now, warnings);
  for (const id of Object.keys(people)) { people[id].matched = !!matched[id]; people[id].bamboo_id = matched[id] ? String(matched[id]) : null; }
  const m = E.metrics({ created_at: it.created_at, deadline: it.deadline, people: it.people }, { segments: segs, assignees, clock, now });
  const { worked_pieces, in_range, ...metrics } = m;
  return {
    task: {
      id: it.id, board: bk, name: it.name, url: it.url, product: it.product, type: it.type, campaigns: it.campaigns,
      priority: it.priority, people: it.people, requesters: it.requesters, deadline: it.deadline, status: it.status,
      partial: created < floor || !!truncated,
      metrics, segments: segs, assignees,
    },
    people: Object.fromEntries(Object.entries(people).map(([id, p]) => [id, { id, name: p.name, photo: p.photo, matched: !!p.matched }])),
    status_colors: Object.fromEntries(Object.values(meta.statusMaps[c.status]?.byIndex || {}).filter(v => v.label).map(v => [v.label, v.color || null])),
    monday_timers: timersOf(raw, board, now),
    clock_source: source,
    warnings,
    generated_at: new Date(now).toISOString(),
  };
}

/** One task's timeline + numbers (cached 5 min). */
async function loadTask({ brandId = 'particle', board, itemId, force = false }) {
  if (!BOARDS.includes(board)) throw bad('Board is video or design', 404);
  if (!/^\d+$/.test(String(itemId))) throw bad('Bad task id', 404);
  return monday.cached(`timetrack:task:${brandId}:${board}:${itemId}`, 5 * 60000, () => buildTask({ brandId, board, itemId }), { force });
}

function clear() { monday.clearCache('timetrack:'); }

module.exports = { load, loadTask, overview, toCsv, matches, filterOptions, rangeBounds, trimTask, clear, buildBoard, buildDataset, MAX_RANGE_DAYS };
