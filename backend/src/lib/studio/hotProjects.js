/**
 * Studio → Hot Projects: the big projects the team pinned, with everything Monday knows about each one —
 * how its time went status by status, fix and review rounds, deadline moves, reassignments, Monday's timers,
 * updates and Studio effort — plus suggestions for what to pin (priority, who asked, size, urgency).
 * Pins live in studio_hot_projects; Monday stays the record for the projects themselves.
 */
const db = require('../../db');
const monday = require('../monday');
const W = require('../creative/week');
const { getCreativeConfig } = require('../creative/config');
const { normalizeItem } = require('../creative/snapshot');
const { boardStatuses, getStudio } = require('./data');
const { statusSpans, taskLife, statusSince } = require('./effort');
const { boardOf } = require('./write');

const norm = monday.normLabel;
const HISTORY_DAYS = 365;
const MAX_RELATED = 20;
const BOARDS = ['video', 'design'];
const priorityKey = (label) => norm(label).replace(/[^a-z]/g, ''); // "Critical ⚠️️" → "critical"
const PRIORITY_POINTS = { critical: 40, high: 25, medium: 8, low: 0 };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

function parseTs(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (/^\d+$/.test(String(v))) { const n = Number(v); return n > 1e12 ? n : n * 1000; }
  return Date.parse(v);
}
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const clearHot = (brandId) => monday.clearCache(`studio:${brandId}:hot`);

// ── Pins ─────────────────────────────────────────────────────────────────────
async function listPins(brandId) {
  const { rows } = await db.query(
    `SELECT id, board, item_id, title, note, related, position, added_by, added_at
       FROM studio_hot_projects WHERE brand_id = $1 ORDER BY position, added_at`, [brandId]);
  return rows.map(r => ({ ...r, id: String(r.id), related: Array.isArray(r.related) ? r.related : [] }));
}

async function addPin(brandId, itemId, user) {
  const config = await getCreativeConfig(brandId);
  // Which board it's on comes from Monday, never from the browser
  const board = await boardOf(config, itemId);
  if (!BOARDS.includes(board)) throw bad('Only Video and Design projects can be hot projects');
  const { rows } = await db.query(
    `INSERT INTO studio_hot_projects (brand_id, board, item_id, position, added_by)
     VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM studio_hot_projects WHERE brand_id = $1), 0), $4)
     ON CONFLICT (brand_id, item_id) DO NOTHING RETURNING id`,
    [brandId, board, String(itemId), user?.name || user?.email || null]);
  clearHot(brandId);
  return { id: rows[0] ? String(rows[0].id) : null, already: !rows[0] };
}

async function updatePin(brandId, id, { title, note, related } = {}) {
  const sets = [];
  const vals = [];
  if (title !== undefined) {
    vals.push(String(title || '').trim().slice(0, 120) || null);
    sets.push(`title = $${vals.length}`);
  }
  if (note !== undefined) {
    vals.push(String(note || '').slice(0, 4000) || null);
    sets.push(`note = $${vals.length}`);
  }
  if (related !== undefined) {
    if (!Array.isArray(related)) throw bad('related must be a list');
    const clean = [];
    const seen = new Set();
    for (const r of related.slice(0, MAX_RELATED)) {
      const itemId = String(r?.item_id || '');
      if (!/^\d+$/.test(itemId) || !BOARDS.includes(r?.board) || seen.has(itemId)) continue;
      seen.add(itemId);
      clean.push({ board: r.board, item_id: itemId });
    }
    vals.push(JSON.stringify(clean));
    sets.push(`related = $${vals.length}`);
  }
  if (!sets.length) return;
  vals.push(brandId, id);
  const r = await db.query(`UPDATE studio_hot_projects SET ${sets.join(', ')}, updated_at = NOW()
    WHERE brand_id = $${vals.length - 1} AND id = $${vals.length}`, vals);
  if (!r.rowCount) throw bad('That hot project is gone', 404);
  clearHot(brandId);
}

async function reorderPins(brandId, ids) {
  if (!Array.isArray(ids)) throw bad('ids must be a list');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE studio_hot_projects SET position = $1 WHERE brand_id = $2 AND id = $3', [i, brandId, String(ids[i])]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  clearHot(brandId);
}

async function removePin(brandId, id) {
  await db.query('DELETE FROM studio_hot_projects WHERE brand_id = $1 AND id = $2', [brandId, id]);
  clearHot(brandId);
}

// ── Reading Monday ───────────────────────────────────────────────────────────
/** Monday's timers as Monday shows them: finished sessions + the one running now. */
function timersOf(raw, board, now) {
  const ids = { working: board.columns.working_time, ...(board.timers || {}) };
  const out = {};
  for (const [k, id] of Object.entries(ids)) {
    const cv = id && (raw.column_values || []).find(x => x.id === id);
    if (!cv) continue;
    let dur = Number(cv.duration);
    if (!Number.isFinite(dur)) { try { dur = Number(JSON.parse(cv.value || '{}').duration); } catch { dur = NaN; } }
    const started = parseTs(cv.started_at);
    const live = cv.running && Number.isFinite(started) ? Math.max(0, (now - started) / 1000) : 0;
    out[k] = { s: Math.round((Number.isFinite(dur) ? dur : 0) + live), running: !!cv.running };
  }
  return out;
}

/** The latest 3 updates (trimmed) and how many there are, for every item at once. */
async function updatesFor(ids, deadline) {
  const out = {};
  if (!ids.length) return out;
  const d = await monday.mondayQuery(
    `query ($ids: [ID!]) { items(ids: $ids, limit: 100) {
       id
       recent: updates(limit: 3) { id text_body created_at creator { id name } }
       all: updates(limit: 100) { id }
     } }`, { ids }, { deadline });
  for (const it of d?.items || []) {
    out[String(it.id)] = {
      count: (it.all || []).length,
      recent: (it.recent || []).map(u => ({
        id: String(u.id),
        text: (u.text_body || '').slice(0, 600),
        at: u.created_at,
        by: u.creator ? { id: String(u.creator.id), name: u.creator.name } : null,
      })),
    };
  }
  return out;
}

const dateOf = (v) => {
  const s = v && typeof v === 'object' ? (v.date || '') : '';
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const rangeOf = (v) => (v && typeof v === 'object' && (v.from || v.to) ? { from: (v.from || '').slice(0, 10) || null, to: (v.to || '').slice(0, 10) || null } : null);
const peopleOf = (v) => (v && typeof v === 'object' ? (v.personsAndTeams || v.persons_and_teams || []) : [])
  .filter(p => p.kind !== 'team').map(p => String(p.id)).sort();

/** Everything the item's activity log says: status journey, rounds, deadline / timeline moves, reassignments. */
function historyOf(evs, it, board, meta, statusCategory, now) {
  const c = board.columns;
  const created = Date.parse(it.created_at);
  const startMs = Number.isFinite(created) ? created : now;
  const statusEvs = evs.filter(e => e.column_id === c.status);
  const spans = statusSpans(statusEvs, { fromMs: startMs, toMs: now, initialLabel: statusEvs.length ? '' : it.status.label });
  const cat = (label) => (label ? statusCategory(label) : 'queued');
  const sm = meta.statusMaps[c.status];
  const colorOf = (label) => { const i = sm?.byLabel[norm(label)]; return (i != null && sm.byIndex[i]?.color) || null; };

  // Consecutive stretches in the same status, oldest first
  const journey = [];
  for (const s of spans) {
    const last = journey[journey.length - 1];
    if (last && last.label === (s.label || '')) last.b = s.b;
    else journey.push({ label: s.label || '', a: s.a, b: s.b });
  }
  let reviewRounds = 0;
  let prev = null;
  for (const s of journey) {
    const k = cat(s.label);
    if (k === 'review' && prev !== 'review') reviewRounds++;
    prev = k;
  }
  const life = taskLife(spans, cat);
  const since = statusSince(spans, it.status.label);

  const at = (e) => iso(e.at_ms);
  const deadlineMoves = evs.filter(e => e.column_id === c.deadline)
    .map(e => ({ at: at(e), by: e.user_id, from: dateOf(e.prev_raw), to: dateOf(e.value_raw) }))
    .filter(m => m.from && m.to && m.from !== m.to);
  const timelineMoves = evs.filter(e => e.column_id === c.timeline)
    .map(e => ({ at: at(e), by: e.user_id, from: rangeOf(e.prev_raw), to: rangeOf(e.value_raw) }))
    .filter(m => m.from?.to && m.to?.to && m.from.to !== m.to.to);
  const peopleEvs = evs.filter(e => e.column_id === c.person).sort((x, y) => x.at_ms - y.at_ms);
  const reassignments = peopleEvs
    .map(e => ({ at: at(e), by: e.user_id, from: peopleOf(e.prev_raw), to: peopleOf(e.value_raw) }))
    .filter(m => m.from.length && m.from.join() !== m.to.join());
  const firstAssigned = peopleEvs.find(e => peopleOf(e.value_raw).length);

  return {
    journey: journey.slice(-200).map(s => ({ label: s.label || '—', category: cat(s.label), color: colorOf(s.label), from: iso(s.a), to: iso(s.b) })),
    life: {
      submitted: iso(created),
      assigned: firstAssigned ? iso(firstAssigned.at_ms) : null,
      started: iso(life.started_ms),
      completed: it.open ? null : iso(life.completed_ms),
      phases: Object.fromEntries(Object.entries(life.phases).map(([k, v]) => [k, Math.round(v / 1000)]).filter(([, v]) => v > 0)),
      partial: Number.isFinite(created) && created < now - HISTORY_DAYS * 86400000,
    },
    fix_rounds: life.fix_rounds,
    review_rounds: reviewRounds,
    status_since: iso(since),
    deadline_moves: deadlineMoves,
    timeline_moves: timelineMoves,
    reassignments,
    last_activity: iso(Math.max(...evs.map(e => e.at_ms).filter(Number.isFinite), Number.isFinite(created) ? created : 0)),
  };
}

/** On track / at risk / late, with the reasons — from the main ticket. */
function healthOf(it, today) {
  if (!it.open) return { key: 'done', reasons: [] };
  const reasons = [];
  const due = it.deadline || it.timeline?.to || null;
  const late = !!(due && due < today);
  if (late) reasons.push(`${W.daysBetween(due, today)} ${W.daysBetween(due, today) === 1 ? 'day' : 'days'} past ${it.deadline ? 'the deadline' : 'its timeline'}`);
  const cat = it.status.category;
  if (cat === 'stuck') reasons.push('Stuck');
  if (cat === 'paused') reasons.push('Paused');
  if (!it.people.length) reasons.push('Nobody assigned');
  if (it.fix_rounds >= 3) reasons.push(`${it.fix_rounds} fix rounds`);
  if (it.deadline_moves?.length >= 2) reasons.push(`Deadline moved ${it.deadline_moves.length}×`);
  if (due && !late && W.daysBetween(today, due) <= 2 && ['queued', 'paused', 'stuck'].includes(cat)) reasons.push('Due soon and not started');
  return { key: late ? 'late' : reasons.length ? 'at_risk' : 'on_track', reasons };
}

// This week's Studio dataset holds the effort numbers (split between parallel tasks, BambooHR-aware)
function thisWeek(brandId, lite = false) {
  const from = W.sundayOf(Date.now());
  return getStudio({ brandId, from, to: W.addDays(from, 6), lite });
}

async function buildHotProjects({ brandId = 'particle', now = Date.now() } = {}) {
  const t0 = Date.now();
  const deadline = t0 + 50000;
  const today = W.localDate(now);
  const warnings = [];
  const pins = await listPins(brandId);
  const out = { generated_at: iso(now), today, build_ms: 0, boards: {}, people: {}, requesters: {}, items: [], projects: [], effort_pending: false, warnings };
  if (!pins.length) return out;

  const config = await getCreativeConfig(brandId);
  // Effort comes from the Studio week build — usually cached already; started now so it runs alongside
  const weekP = thisWeek(brandId).catch((e) => { warnings.push(`Effort unavailable (${e.message})`); return null; });

  const want = {};
  for (const p of pins) {
    (want[p.board] = want[p.board] || new Set()).add(String(p.item_id));
    for (const r of p.related) (want[r.board] = want[r.board] || new Set()).add(String(r.item_id));
  }
  const items = {};
  const userIds = new Set();
  await Promise.all(BOARDS.filter(bk => want[bk]?.size && config.boards[bk]).map(async (bk) => {
    const board = config.boards[bk];
    const meta = await monday.boardMeta(board.board_id);
    const c = board.columns;
    const { statusCategory, legend } = boardStatuses(bk, board, meta);
    out.boards[bk] = legend;
    const knownProducts = new Set(Object.values(meta.statusMaps[c.product]?.byIndex || {}).map(v => norm(v.label)).filter(Boolean));
    const cols = [...new Set([...Object.values(c), ...Object.values(board.timers || {})].filter(Boolean))].filter(id => meta.columns[id]);
    const ids = [...want[bk]];
    const [raws, updates] = await Promise.all([
      monday.itemsByIds(ids, { cols, deadline }),
      updatesFor(ids, deadline).catch((e) => { warnings.push(`${board.label}: updates unavailable (${e.message})`); return {}; }),
    ]);
    const created = raws.map(r => Date.parse(r.created_at)).filter(Number.isFinite);
    const fromMs = Math.max(created.length ? Math.min(...created) : now, now - HISTORY_DAYS * 86400000);
    let events = [];
    try {
      const r = await monday.activityLogs(board.board_id, {
        fromIso: iso(fromMs), toIso: iso(now), itemIds: ids, deadline, raw: true,
        columnIds: [c.status, c.person, c.timeline, c.deadline].filter(id => id && meta.columns[id]),
      });
      events = r.events.filter(e => !e.parent_item_id);
      if (r.truncated) warnings.push(`${board.label}: project history truncated`);
    } catch (e) { warnings.push(`${board.label}: project history unavailable (${e.message})`); }

    const ctx = { boardKey: bk, board, meta, config, bounds: { fromMs: now, toMs: now }, now, knownProducts, statusCategory };
    for (const raw of raws) {
      const it = normalizeItem(raw, ctx);
      for (const k of ['_iv', 'tracked_s_week', 'tracked_days', 'media_refs']) delete it[k];
      it.open = statusCategory(it.status.label) !== 'delivered';
      it.timers = timersOf(raw, board, now);
      it.updates = updates[it.id] || { count: 0, recent: [] };
      const evs = events.filter(e => e.pulse_id === it.id);
      Object.assign(it, historyOf(evs, it, board, meta, statusCategory, now));
      for (const uid of [...it.people, ...it.requested_by]) userIds.add(uid);
      for (const e of evs) if (e.user_id && e.user_id !== '-4') userIds.add(e.user_id);
      items[it.id] = it;
    }
  }));

  // Effort: wait for the week build while there's time, otherwise say it's still being worked out
  const week = await Promise.race([weekP, sleep(Math.max(1000, Math.min(25000, deadline - Date.now() - 8000))).then(() => 'slow')]);
  if (week === 'slow') out.effort_pending = true;
  const weekItems = week && week !== 'slow' ? new Map(week.items.map(i => [i.id, i])) : new Map();
  for (const it of Object.values(items)) {
    const w = weekItems.get(it.id);
    if (w) {
      it.effort_total_s = w.effort_total_s || 0;
      it.effort_week_s = w.effort_s || 0;
      it.effort_days = w.effort_days || {};
      it.effort_by_person = Object.fromEntries(Object.entries(w.effort_days || {}).map(([uid, byDay]) => [uid, Object.values(byDay).reduce((a, s) => a + s, 0)]));
      if (w.tv) it.tv = w.tv;
    } else {
      it.effort_total_s = null; // not in this week's build (finished before this week) — Monday's timer still shows
    }
  }

  // Names and photos, the way the rest of Studio shows them
  let users = [];
  try { users = await monday.usersByIds([...userIds]); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const userMap = Object.fromEntries(users.map(u => [String(u.id), u]));
  const nameOf = (uid) => {
    const raw = config.team?.[uid]?.display_name || userMap[uid]?.name || week?.people?.[uid]?.name || `User ${uid}`;
    return /@/.test(raw) ? raw.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : raw;
  };
  for (const uid of userIds) {
    out.people[uid] = { id: uid, name: nameOf(uid), photo: userMap[uid]?.photo_small || userMap[uid]?.photo_thumb_small || week?.people?.[uid]?.photo || null };
  }
  out.requesters = out.people; // one map — the task panel looks in both

  for (const p of pins) {
    const main = items[String(p.item_id)];
    const base = { id: p.id, board: p.board, item_id: String(p.item_id), title: p.title || null, note: p.note || '', added_by: p.added_by, added_at: p.added_at, related: p.related };
    if (!main) { out.projects.push({ ...base, missing: true }); continue; }
    out.projects.push({ ...base, health: healthOf(main, today), related_ids: p.related.map(r => String(r.item_id)).filter(id => items[id]) });
  }
  out.items = Object.values(items);
  out.build_ms = Date.now() - t0;
  return out;
}

/** Shared for 2 minutes; any pin change clears it. Not kept while effort is still being worked out. */
async function getHotProjects({ brandId = 'particle', force = false } = {}) {
  const key = `studio:${brandId}:hot`;
  if (force) monday.clearCache(key);
  const r = await monday.cached(key, 2 * 60 * 1000, () => buildHotProjects({ brandId }));
  if (r.effort_pending) monday.clearCache(key);
  return r;
}

// ── Suggestions ──────────────────────────────────────────────────────────────
const slim = (it) => ({
  id: it.id, board: it.board, name: it.name, title: it.title, subtitle: it.subtitle, product: it.product, status: it.status,
  priority: it.priority || null, division: it.division, people: it.people, requested_by: it.requested_by, timeline: it.timeline,
  deadline: it.deadline, versions: it.versions, campaign: it.campaign, platform: it.platform, type: it.type, monday_url: it.monday_url, created_at: it.created_at,
});

/**
 * Open Video + Design tickets ranked as hot-project candidates: priority first, then TV & SP, who asked
 * (people whose projects are already hot count more), how big it is, how urgent, and whether it needs attention.
 */
async function suggestHotProjects({ brandId = 'particle', q = '', requester = '', limit = 15 } = {}) {
  const now = Date.now();
  const today = W.localDate(now);
  const [week, pins] = await Promise.all([thisWeek(brandId, true), listPins(brandId)]);
  const pinned = new Set(pins.flatMap(p => [String(p.item_id), ...p.related.map(r => String(r.item_id))]));
  const byId = new Map(week.items.map(i => [i.id, i]));
  // Who asked for the projects that are already hot
  const hotAskers = {};
  for (const p of pins) for (const uid of byId.get(String(p.item_id))?.requested_by || []) hotAskers[uid] = (hotAskers[uid] || 0) + 1;
  const nameOf = (uid) => week.requesters?.[uid]?.name || week.people?.[uid]?.name || 'someone';

  const scored = [];
  for (const it of week.items) {
    if (!it.open || pinned.has(it.id) || !BOARDS.includes(it.board)) continue;
    let score = 0;
    const reasons = [];
    const pk = priorityKey(it.priority?.label);
    if (PRIORITY_POINTS[pk]) { score += PRIORITY_POINTS[pk]; if (pk === 'critical' || pk === 'high') reasons.push(`${pk === 'critical' ? 'Critical' : 'High'} priority`); }
    if (it.division === 'tv') { score += 15; reasons.push('TV & SP'); }
    const asker = it.requested_by.find(uid => hotAskers[uid]);
    if (asker) { score += Math.min(20, 10 * hotAskers[asker]); reasons.push(`Requested by ${nameOf(asker).split(' ')[0]}, like ${hotAskers[asker]} hot ${hotAskers[asker] === 1 ? 'project' : 'projects'}`); }
    const span = it.timeline?.from && it.timeline?.to ? W.daysBetween(it.timeline.from, it.timeline.to) + 1 : 0;
    if (span >= 14) { score += 15; reasons.push(`${Math.round(span / 7)}-week timeline`); } else if (span >= 7) { score += 10; reasons.push('1-week+ timeline'); }
    if ((it.versions || 0) >= 3) { score += 6; reasons.push(`${it.versions} versions`); }
    const due = it.deadline || it.timeline?.to;
    if (due && due < today) { score += 12; reasons.push('Overdue'); } else if (due && W.daysBetween(today, due) <= 7) { score += 8; reasons.push(`Due ${due === today ? 'today' : `in ${W.daysBetween(today, due)}d`}`); }
    if (it.status.category === 'stuck') { score += 8; reasons.push('Stuck'); } else if (['in_progress', 'review', 'fixes'].includes(it.status.category)) score += 5;
    const age = Number.isFinite(Date.parse(it.created_at)) ? (now - Date.parse(it.created_at)) / 86400000 : 0;
    if (age >= 14) { score += 5; reasons.push(`Open ${Math.floor(age / 7)} weeks`); }
    scored.push({ item: slim(it), score, reasons });
  }

  // Requester chips: who asked for the open candidates (most first)
  const counts = {};
  for (const s of scored) for (const uid of s.item.requested_by) counts[uid] = (counts[uid] || 0) + 1;
  const requesters = Object.entries(counts).map(([id, n]) => ({ id, name: nameOf(id), photo: week.requesters?.[id]?.photo || null, n, hot: hotAskers[id] || 0 }))
    .sort((a, b) => b.hot - a.hot || b.n - a.n).slice(0, 14);

  const needle = String(q || '').trim().toLowerCase();
  let list = scored;
  if (requester) list = list.filter(s => s.item.requested_by.includes(String(requester)));
  if (needle) list = list.filter(s => `${s.item.name} ${s.item.campaign || ''}`.toLowerCase().includes(needle));
  list.sort((a, b) => b.score - a.score || (a.item.deadline || a.item.timeline?.to || '9999').localeCompare(b.item.deadline || b.item.timeline?.to || '9999'));
  return {
    suggestions: list.slice(0, needle || requester ? 40 : limit),
    total: list.length,
    requesters,
    people: Object.fromEntries(Object.entries({ ...(week.people || {}), ...(week.requesters || {}) }).map(([id, p]) => [id, { id, name: p.name, photo: p.photo || null }])),
    boards: week.boards,
    today,
  };
}

module.exports = { getHotProjects, buildHotProjects, suggestHotProjects, listPins, addPin, updatePin, reorderPins, removePin, healthOf, historyOf };
