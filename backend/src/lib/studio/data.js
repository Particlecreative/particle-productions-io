/**
 * Studio Control — the creative studio's live dataset for a period (read from Monday, never stored).
 *
 * Items = everything open right now on the Video + Design boards, plus everything finished whose Monday
 * timeline falls in the period (the studio schedules by timeline) or that was delivered in the period.
 * Effort = time the task was ACTIVE (Working / Fixes Round) in Israel work hours (Sun–Thu 09:00–19:00),
 * split between a person's parallel tasks (see effort.js). Paused, review, nights and weekends never count.
 * Monday's own timer is kept alongside as a reference (designers' timers often run for days).
 */
const monday = require('../monday');
const W = require('../creative/week');
const { getCreativeConfig } = require('../creative/config');
const { classifyDeliveries } = require('../creative/classify');
const { normalizeItem, trackedInWindow } = require('../creative/snapshot');
const { statusSpans, activeSpans, splitEffort, workSlices, taskLife, statusSince } = require('./effort');
const bamboo = require('./bamboohr');
const { linkTvItems } = require('./tvLinks');

const norm = monday.normLabel;
const CATEGORY_ORDER = ['delivered', 'review', 'fixes', 'in_progress', 'queued', 'paused', 'stuck', 'other'];

/** Period bounds for [from, to] (inclusive Israel dates). */
function periodBounds(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
    const e = new Error('Invalid period'); e.status = 400; throw e;
  }
  const fromMs = W.zonedMidnightUtc(from);
  const toMs = W.zonedMidnightUtc(W.addDays(to, 1));
  return { from, to, fromMs, toMs, fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString() };
}

const ACTIVE = new Set(['in_progress', 'fixes']);
const LIFETIME_DAYS = 180;

/** Email tasks from Retention Projects 3.0 designed by the studio's designers (open, or completed in the period). */
async function loadEmails(config, P, now, deadline) {
  const r = config.retention;
  if (!r?.board_id) return { emails: [], board: null };
  const meta = await monday.boardMeta(r.board_id);
  const c = r.columns;
  const cols = [...new Set(Object.values(c))].filter(id => meta.columns[id]);
  // Only the studio designers' items (asked of Monday directly — the board is large)
  const byDesigner = { rules: [{ column_id: c.designer, compare_value: r.designers.map(id => `person-${id}`), operator: 'any_of' }] };
  const { items } = await monday.fetchAllItems(r.board_id, { cols, queryParams: byDesigner, maxPages: 4, deadline })
    .catch(() => monday.fetchAllItems(r.board_id, { cols, maxPages: 4, deadline }));
  const catOf = {};
  for (const [cat, labels] of Object.entries(r.statuses)) for (const l of labels) catOf[norm(l)] = cat;
  const category = (label) => catOf[norm(label)] || (label ? 'other' : 'queued');
  const sm = meta.statusMaps[c.status] || { byIndex: {}, byLabel: {} };
  const color = (colId, cv) => {
    const m = meta.statusMaps[colId];
    if (!m || !cv) return null;
    const idx = cv.index ?? m.byLabel[norm(cv.label ?? cv.text)];
    return idx != null ? m.byIndex[idx]?.color || null : null;
  };
  const wanted = new Set(r.designers.map(String));
  const emails = [];
  for (const raw of items) {
    const cv = Object.fromEntries((raw.column_values || []).map(x => [x.id, x]));
    const designers = (cv[c.designer]?.persons_and_teams || []).filter(p => p.kind !== 'team').map(p => String(p.id));
    if (!designers.some(d => wanted.has(d))) continue;
    const label = cv[c.status]?.label ?? cv[c.status]?.text ?? '';
    const cat = category(label);
    const completed = W.dateOnly(cv[c.completed]?.date || cv[c.completed]?.text);
    if (cat === 'delivered' && !(completed && completed >= P.from && completed <= P.to)) continue;
    const tl = cv[c.timeline];
    emails.push({
      id: String(raw.id),
      board: 'retention',
      division: 'email',
      name: raw.name,
      group: raw.group?.title || '',
      status: { label: label || '—', color: color(c.status, cv[c.status]) || '#c4c4c4', category: cat },
      people: designers,
      manager: (cv[c.manager]?.persons_and_teams || []).map(p => String(p.id)),
      deadline: W.dateOnly(cv[c.deadline]?.date || cv[c.deadline]?.text),
      launch: W.dateOnly(cv[c.launch]?.date || cv[c.launch]?.text),
      timeline: tl && (tl.from || tl.to) ? { from: W.dateOnly(tl.from), to: W.dateOnly(tl.to) } : null,
      product: { label: cv[c.product]?.label ?? cv[c.product]?.text ?? '', color: color(c.product, cv[c.product]) },
      priority: cv[c.priority]?.label ?? cv[c.priority]?.text ?? '',
      amount: Number.isFinite(cv[c.amount]?.number) ? cv[c.amount].number : null,
      completed,
      open: cat !== 'delivered',
      monday_url: raw.url || null,
    });
  }
  const board = {
    key: 'retention', label: r.label, board_id: r.board_id,
    statuses: Object.entries(sm.byIndex).filter(([, v]) => v.label && !v.deactivated)
      .map(([idx, v]) => ({ label: v.label, color: v.color || '#c4c4c4', category: category(v.label), index: Number(idx) })),
  };
  return { emails, board };
}

/**
 * lite = schedule only (Workload): items, people, time off — no activity history, effort or clock-ins,
 * so moving between weeks is quick.
 */
async function buildStudio({ brandId = 'particle', from, to, now = Date.now(), force = false, lite = false } = {}) {
  const t0 = Date.now();
  const deadline = t0 + 50000;
  const config = await getCreativeConfig(brandId);
  const P = periodBounds(from, to);
  const warnings = [];
  if (force) { monday.clearCache('meta:'); monday.clearCache(`studio:${brandId}:open:`); }

  // Email tasks don't depend on the boards below — fetch them alongside
  const emailsP = loadEmails(config, P, now, deadline).catch((e) => { warnings.push(`Email tasks unavailable (${e.message})`); return { emails: [], board: null }; });

  const boardKeys = Object.keys(config.boards);
  const metas = {};
  await Promise.all(boardKeys.map(async bk => { metas[bk] = await monday.boardMeta(config.boards[bk].board_id, { force }); }));

  const knownProducts = new Set();
  for (const bk of boardKeys) {
    const pm = metas[bk].statusMaps[config.boards[bk].columns.product];
    for (const v of Object.values(pm?.byIndex || {})) if (v.label) knownProducts.add(norm(v.label));
  }

  const items = {};
  const boards = {};
  const periodTasks = [];
  const lifeTasks = [];
  let lifeWindowFrom = now;
  const periodEnd = Math.min(P.toMs, now);
  const bounds = { fromMs: P.fromMs, toMs: P.toMs, partial: P.toMs > now };

  await Promise.all(boardKeys.map(async (bk) => {
    const board = config.boards[bk];
    const meta = metas[bk];
    const cols = [...new Set(Object.values(board.columns).filter(Boolean))].filter(id => meta.columns[id]);
    const sm = meta.statusMaps[board.columns.status] || { byLabel: {}, byIndex: {} };
    const catOf = {};
    for (const [cat, labels] of Object.entries(board.statuses)) for (const l of labels) catOf[norm(l)] = cat;
    const statusCategory = (label) => catOf[norm(label)] || 'other';

    // Board status legend (Monday order + colours), active labels only
    boards[bk] = {
      key: bk,
      label: board.label,
      board_id: board.board_id,
      statuses: Object.entries(sm.byIndex)
        .filter(([, v]) => v.label && !v.deactivated)
        .map(([idx, v]) => ({ label: v.label, color: v.color || '#c4c4c4', category: statusCategory(v.label), index: Number(idx) }))
        .sort((a, b) => (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) || (a.index - b.index)),
    };

    const deliveredIdx = board.statuses.delivered
      .map(l => sm.byLabel[norm(l)]).filter(i => i != null)
      .concat(Object.entries(sm.byIndex).filter(([, v]) => /^(done|completed)$/i.test(v.label)).map(([i]) => Number(i)));

    const tl = board.columns.timeline;
    const doneIdx = [...new Set(deliveredIdx)];
    const [logs, open, finished] = await Promise.all([
      lite ? { events: [] } : monday.activityLogs(board.board_id, { fromIso: P.fromIso, toIso: P.toIso, columnIds: [board.columns.status], deadline }),
      // Open tasks are the same for every period — shared for a minute so moving between weeks is quick
      monday.cached(`studio:${brandId}:open:${board.board_id}`, 60 * 1000, () => monday.fetchAllItems(board.board_id, {
        cols,
        queryParams: doneIdx.length ? { rules: [{ column_id: board.columns.status, compare_value: doneIdx, operator: 'not_any_of' }] } : null,
        deadline,
      })),
      // Finished tasks whose timeline overlaps the period (they belong to that week even if done earlier)
      tl && meta.columns[tl] && doneIdx.length
        ? monday.fetchAllItems(board.board_id, {
          cols, maxPages: 4, deadline,
          queryParams: {
            operator: 'and',
            rules: [
              { column_id: board.columns.status, compare_value: doneIdx, operator: 'any_of' },
              { column_id: tl, compare_value: ['EXACT', P.to], compare_attribute: 'START_DATE', operator: 'lower_than_or_equal' },
              { column_id: tl, compare_value: ['EXACT', P.from], compare_attribute: 'END_DATE', operator: 'greater_than_or_equals' },
            ],
          },
        }).catch((e) => { warnings.push(`${board.label}: finished tasks in this timeline unavailable (${e.message})`); return { items: [] }; })
        : { items: [] },
    ]);
    if (logs.truncated) warnings.push(`${board.label}: activity log truncated for this period`);
    if (open.truncated) warnings.push(`${board.label}: open items truncated`);

    const cls = lite ? { delivered: {} } : classifyDeliveries(logs.events, {
      statusColumn: board.columns.status, delivered: board.statuses.delivered, fixes: board.statuses.fixes,
      fromMs: P.fromMs, toMs: P.toMs, rule: { ...config.delivery_rule, exclude_reopened_in_week: false },
    });

    const have = new Set(open.items.map(r => String(r.id)));
    const raws = [...open.items];
    for (const r of finished.items) if (!have.has(String(r.id))) { have.add(String(r.id)); raws.push(r); }
    const extraIds = Object.keys(cls.delivered).filter(id => !have.has(id));
    if (extraIds.length) raws.push(...await monday.itemsByIds(extraIds, { cols, deadline }));

    const ctx = { boardKey: bk, board, meta, config, bounds, now, knownProducts, statusCategory };
    const isActive = (label) => ACTIVE.has(statusCategory(label));
    const ids = [];
    for (const raw of raws) {
      const it = normalizeItem(raw, ctx);
      items[it.id] = it;
      ids.push(it.id);
      const wcv = (raw.column_values || []).find(c => c.id === board.columns.working_time);
      // Monday timer (reference only): work hours in the period / ever
      it.timer_s = it.tracked_s_week;
      it.timer_total_s = trackedInWindow(wcv, 0, now, now).seconds;
      it.running = !!wcv?.running;
      it.open = statusCategory(it.status.label) !== 'delivered';
      it.active_now = isActive(it.status.label);
      delete it._iv;
      if (cls.delivered[it.id]) {
        it.delivered_at = cls.delivered[it.id].delivered_at;
        it.delivered_in_period = true;
      }
    }

    if (lite) return;

    // Status history → active work-hour intervals, for the period and for the task's whole life
    const byItem = (events) => {
      const m = new Map();
      for (const e of events) {
        if (e.column_id !== board.columns.status || !e.pulse_id || e.parent_item_id) continue;
        if (!m.has(e.pulse_id)) m.set(e.pulse_id, []);
        m.get(e.pulse_id).push(e);
      }
      return m;
    };
    const periodEvents = byItem(logs.events);
    for (const id of ids) {
      const it = items[id];
      const evs = periodEvents.get(id) || [];
      const spans = statusSpans(evs, { fromMs: P.fromMs, toMs: periodEnd, initialLabel: evs.length ? '' : it.status.label });
      periodTasks.push({ id, people: it.people, iv: activeSpans(spans, isActive) });
    }
    const created = ids.map(id => Date.parse(items[id].created_at)).filter(Number.isFinite);
    const lifeFrom = Math.max(created.length ? Math.min(...created) : now, now - LIFETIME_DAYS * 86400000);
    lifeWindowFrom = Math.min(lifeWindowFrom, lifeFrom);
    const lifeEvents = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      try {
        const r = await monday.activityLogs(board.board_id, {
          fromIso: new Date(lifeFrom).toISOString(), toIso: new Date(now).toISOString(),
          columnIds: [board.columns.status], itemIds: ids.slice(i, i + 100), deadline,
        });
        if (r.truncated) warnings.push(`${board.label}: task history truncated — lifetime effort may be low`);
        for (const [id, evs] of byItem(r.events)) lifeEvents.set(id, evs);
      } catch (e) { warnings.push(`${board.label}: task history unavailable (${e.message})`); }
    }
    const lifeCategory = (label) => (label ? statusCategory(label) : 'queued');
    for (const id of ids) {
      const it = items[id];
      const c = Date.parse(it.created_at);
      const evs = lifeEvents.get(id) || [];
      const startMs = Math.max(Number.isFinite(c) ? c : lifeFrom, lifeFrom);
      const spans = statusSpans(evs, { fromMs: startMs, toMs: now, initialLabel: evs.length ? '' : it.status.label });
      lifeTasks.push({ id, people: it.people, iv: activeSpans(spans, isActive) });
      // When it entered its current status (the last unbroken stretch) — to spot tasks left in Working / Paused
      const since = statusSince(spans, it.status.label);
      it.status_since = since ? new Date(since).toISOString() : null;
      it.status_since_partial = since != null && since <= lifeFrom && Number.isFinite(c) && c < lifeFrom;
      // Life: submitted → completed (or now), and where that calendar time went
      const life = taskLife(spans, lifeCategory);
      const completed = life.completed_ms ?? (it.open ? null : (it.delivered_at ?? null));
      it.life = {
        submitted: Number.isFinite(c) ? new Date(c).toISOString() : null,
        started: life.started_ms ? new Date(life.started_ms).toISOString() : null,
        completed: completed ? new Date(completed).toISOString() : null,
        partial: !Number.isFinite(c) || c < lifeFrom || (!it.open && !life.completed_ms && !evs.length),
        fix_rounds: life.fix_rounds,
        phases: Object.fromEntries(Object.entries(life.phases).map(([k, v]) => [k, Math.round(v / 1000)]).filter(([, v]) => v > 0)),
      };
    }
  }));

  // People: assignees by board (role = board they work on most) + requesters
  const roleCount = {};
  const reqIds = new Set();
  for (const it of Object.values(items)) {
    for (const uid of it.people) {
      roleCount[uid] = roleCount[uid] || { video: 0, design: 0 };
      roleCount[uid][it.board] = (roleCount[uid][it.board] || 0) + 1;
    }
    for (const uid of it.requested_by) reqIds.add(uid);
  }
  for (const [uid, t] of Object.entries(config.team || {})) {
    if (t?.role && !roleCount[uid]) roleCount[uid] = { video: 0, design: 0, [t.role]: 0 };
  }
  let users = [];
  try { users = await monday.usersByIds([...Object.keys(roleCount), ...reqIds]); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const userMap = Object.fromEntries(users.map(u => [String(u.id), u]));
  const nameOf = (uid) => {
    const t = config.team?.[uid];
    const u = userMap[uid];
    const raw = t?.display_name || u?.name || `User ${uid}`;
    return /@/.test(raw) ? raw.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : raw;
  };
  const people = {};
  for (const [uid, rc] of Object.entries(roleCount)) {
    const t = config.team?.[uid] || {};
    if (t.hidden) continue;
    // Accounts Monday no longer returns (former staff) — keep their tasks, drop them from the roster
    if (!userMap[uid] && !t.display_name && users.length) continue;
    people[uid] = {
      id: uid,
      name: nameOf(uid),
      photo: userMap[uid]?.photo_small || userMap[uid]?.photo_thumb_small || null,
      email: userMap[uid]?.email || null,
      role: t.role || ((rc.video || 0) > (rc.design || 0) ? 'video' : 'design'),
      counts: rc,
    };
  }

  // Email tasks (Retention Projects 3.0) for the studio's designers
  const { emails, board: emailBoard } = await emailsP;
  if (emailBoard) boards.retention = emailBoard;

  // When were people actually working? BambooHR clock-ins when connected, else Sun–Thu 09:00–19:00
  let presence = { period: null, life: null };
  let clock = null;
  let lifeClock = null;
  let clockSource = 'work_hours';
  let holidays = [];
  if (lite) {
    if (await bamboo.configured().catch(() => false)) {
      try {
        const wo = await bamboo.whosOut(Object.values(people).map(p => ({ id: p.id, name: p.name, email: p.email })), P.from, W.addDays(P.to, 14));
        holidays = wo.holidays;
        for (const [uid, p] of Object.entries(people)) p.out = [...(wo.byPerson[uid] || []), ...wo.holidays];
      } catch (e) { warnings.push(`BambooHR time off unavailable (${e.message})`); }
    }
  } else if (await bamboo.configured().catch(() => false)) {
    try {
      const plist = Object.values(people).map(p => ({ id: p.id, name: p.name, email: p.email }));
      clock = await bamboo.clockFor(plist, P.from, W.localDate(periodEnd - 1));
      presence.period = bamboo.presenceFrom(clock);
      try {
        lifeClock = await bamboo.clockFor(plist, W.localDate(lifeWindowFrom), W.localDate(now));
        // Before the team started clocking in, fall back to work hours for everyone
        const before = lifeClock.since ? workSlices(lifeWindowFrom, W.zonedMidnightUtc(lifeClock.since)) : [];
        presence.life = Object.fromEntries(Object.entries(bamboo.presenceFrom(lifeClock)).map(([uid, iv]) => [uid, [...before, ...iv]]));
      } catch (e) { warnings.push(`BambooHR history unavailable (${e.message}) — lifetime effort uses 09:00–19:00`); }
      clockSource = 'bamboohr';
      for (const [uid, p] of Object.entries(people)) p.bamboo = !!clock.matched?.[uid];
      // Vacations layer: time off + company holidays (a week past the period, for planning)
      try {
        const wo = await bamboo.whosOut(plist, P.from, W.addDays(P.to, 14));
        holidays = wo.holidays;
        for (const [uid, p] of Object.entries(people)) p.out = [...(wo.byPerson[uid] || []), ...wo.holidays];
      } catch (e) { warnings.push(`BambooHR time off unavailable (${e.message})`); }
    } catch (e) {
      warnings.push(`BambooHR: ${e.message} — using 09:00–19:00 instead`);
    }
  }

  // Split each person's working time between their parallel active tasks
  const period = splitEffort(periodTasks, { presence: presence.period, fallback: workSlices(P.fromMs, periodEnd) });
  const life = splitEffort(lifeTasks, { presence: presence.life, fallback: workSlices(lifeWindowFrom, now) });
  const workedDays = {}; // uid → dates someone worked on a task (to send their clock-ins for those days)
  for (const it of Object.values(items)) {
    it.effort_s = period.task[it.id] || 0;
    it.effort_by_person = period.taskPerson[it.id] || {};
    it.effort_total_s = life.task[it.id] || 0;
    it.effort_days = life.taskPersonDay[it.id] || {};
    for (const [uid, byDay] of Object.entries(it.effort_days)) for (const d of Object.keys(byDay)) (workedDays[uid] = workedDays[uid] || new Set()).add(d);
  }
  const dayClock = (v) => ({ in: v.in, out: v.out, hours: v.hours, open: v.open });
  for (const [uid, p] of Object.entries(people)) {
    p.effort_s = period.person[uid] || 0;
    p.effort_by_day = period.personDay[uid] || {};
    if (clock?.matched?.[uid]) {
      const days = clock.days?.[uid] || {};
      p.clock_by_day = Object.fromEntries(Object.entries(days).map(([d, v]) => [d, dayClock(v)]));
      // Earlier days they worked on tasks shown here — so a task's hours can be compared with that day's clock-in
      for (const d of workedDays[uid] || []) {
        const v = lifeClock?.days?.[uid]?.[d];
        if (v && !p.clock_by_day[d]) p.clock_by_day[d] = dayClock(v);
      }
      p.clocked_s = Math.round(Object.values(days).reduce((a, v) => a + (v.hours || 0), 0) * 3600);
      // Clocked in but no task in Working / Fixes — usually statuses that weren't updated
      p.unassigned_s = Math.max(0, p.clocked_s - p.effort_s);
    }
  }
  const requesters = {};
  for (const uid of reqIds) {
    requesters[uid] = { id: uid, name: nameOf(uid), photo: userMap[uid]?.photo_small || userMap[uid]?.photo_thumb_small || null };
  }

  // TV tickets ↔ CP productions
  let productions = [];
  try {
    const r = await linkTvItems(brandId, Object.values(items).filter(it => it.division === 'tv'));
    productions = r.productions;
    for (const [id, link] of Object.entries(r.links)) if (items[id]) items[id].tv = link;
  } catch (e) { warnings.push(`TV linking failed (${e.message})`); }

  return {
    period: { from: P.from, to: P.to, partial: P.toMs > now },
    generated_at: new Date(now).toISOString(),
    build_ms: Date.now() - t0,
    boards,
    people,
    requesters,
    items: Object.values(items),
    emails,
    productions,
    effort_source: lite ? null : clockSource,
    lite,
    holidays,
    capacity: config.capacity_per_day,
    stale: config.stale_status,
    warnings,
  };
}

/** Cached per period (3 min) so switching tabs / filters is instant. */
function getStudio({ brandId = 'particle', from, to, force = false, lite = false }) {
  const key = `studio:${brandId}:${from}:${to}${lite ? ':lite' : ''}`;
  if (force) monday.clearCache(key);
  return monday.cached(key, 3 * 60 * 1000, () => buildStudio({ brandId, from, to, force, lite }));
}

module.exports = { getStudio, buildStudio, periodBounds };
