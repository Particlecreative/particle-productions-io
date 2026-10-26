/**
 * Production Tracker — every production of a brand with what it takes to track it:
 *  - stage + how long it's been there (change_history), the deadline we chose, notes / links / team (production_tracker)
 *  - CP facts: budget, crew, contract, open tasks, next Gantt milestone, shoot days, casting rights, latest update, weekly
 *  - the Monday TV & SP tickets linked to it (same matching as the Studio: auto by name, human decisions win)
 * Read live, never stored (except the tracker's own fields).
 */
const db = require('../../db');
const monday = require('../monday');
const W = require('../creative/week');
const { getCreativeConfig } = require('../creative/config');
const { normalizeItem } = require('../creative/snapshot');
const { linkTvItems } = require('../studio/tvLinks');

const norm = monday.normLabel;
const DAY = 86400000;
const ACTIVE_STAGES = ['Pre Production', 'Production', 'Post'];
const isDone = (stage) => /^(completed|cancel)/i.test(stage || '');

/** Every TV & SP ticket on the studio boards (open and finished — ~350, one page per board). Particle only. */
async function tvTickets(brandId, { force = false } = {}) {
  const key = `tracker:${brandId}:tickets`;
  if (force) monday.clearCache(key);
  return monday.cached(key, 3 * 60 * 1000, async () => {
    const config = await getCreativeConfig(brandId);
    const rule = config.divisions?.tv || {};
    const now = Date.now();
    const warnings = [];
    const items = [];
    await Promise.all(Object.entries(config.boards || {}).map(async ([bk, board]) => {
      const meta = await monday.boardMeta(board.board_id, { force });
      const c = board.columns;
      const indexesOf = (col, labels) => {
        const sm = col && meta.statusMaps[col];
        if (!sm) return [];
        const want = new Set((labels || []).map(norm));
        return Object.entries(sm.byIndex).filter(([, v]) => want.has(norm(v.label))).map(([i]) => Number(i));
      };
      const rules = [];
      const dept = indexesOf(c.department, rule.departments);
      if (dept.length) rules.push({ column_id: c.department, compare_value: dept, operator: 'any_of' });
      const type = indexesOf(c.type, rule.types);
      if (type.length) rules.push({ column_id: c.type, compare_value: type, operator: 'any_of' });
      if (!rules.length) return;

      const catOf = {};
      for (const [cat, labels] of Object.entries(board.statuses)) for (const l of labels) catOf[norm(l)] = cat;
      const knownProducts = new Set(Object.values(meta.statusMaps[c.product]?.byIndex || {}).map(v => norm(v.label)).filter(Boolean));
      const ctx = {
        boardKey: bk, board, meta, config, now, knownProducts,
        bounds: { fromMs: now - 7 * DAY, toMs: now, partial: false },
        statusCategory: (label) => catOf[norm(label)] || 'other',
      };
      const cols = [...new Set(Object.values(c).filter(Boolean))].filter(id => meta.columns[id]);
      const res = await monday.fetchAllItems(board.board_id, { cols, maxPages: 4, queryParams: { operator: 'or', rules } })
        .catch((e) => { warnings.push(`${board.label}: TV tickets unavailable (${e.message})`); return { items: [] }; });
      if (res.truncated) warnings.push(`${board.label}: TV tickets truncated`);
      for (const raw of res.items) {
        const it = normalizeItem(raw, ctx);
        if (it.division !== 'tv') continue;
        items.push({
          id: it.id, board: bk, name: it.name, title: it.title, subtitle: it.subtitle,
          status: it.status, open: it.status.category !== 'delivered',
          product: it.product, people: it.people, requested_by: it.requested_by,
          timeline: it.timeline, deadline: it.deadline, monday_url: it.monday_url,
          links: { frame: it.links.frame, dropbox: it.links.dropbox, figma: it.links.figma },
          campaign: it.campaign, created_at: it.created_at, updated_at: raw.updated_at || null,
        });
      }
    }));

    // People on those tickets (designers / editors / requesters)
    const ids = [...new Set(items.flatMap(it => [...it.people, ...it.requested_by]))];
    const people = {};
    try {
      for (const u of await monday.usersByIds(ids)) {
        const team = config.team?.[u.id] || {};
        people[u.id] = { id: String(u.id), name: team.display_name || u.name || '', photo: u.photo_thumb_small || u.photo_small || null };
      }
    } catch (e) { warnings.push(`Monday people unavailable (${e.message})`); }
    for (const id of ids) if (!people[id]) people[id] = { id, name: config.team?.[id]?.display_name || 'Monday user', photo: null };
    return { items, people, warnings, fetched_at: new Date(now).toISOString() };
  });
}

async function rowsOf(sql, params, warnings, label) {
  try { return (await db.query(sql, params)).rows; } catch (e) { warnings.push(`${label} unavailable (${e.message})`); return []; }
}
const groupBy = (rows, key = 'production_id') => {
  const m = {};
  for (const r of rows) (m[r[key]] = m[r[key]] || []).push(r);
  return m;
};
const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);
const day = (v) => (v ? String(v).slice(0, 10) : null);
const daysBetween = (a, b) => Math.round((W.zonedMidnightUtc(b) - W.zonedMidnightUtc(a)) / DAY);

/**
 * What needs a look, per production (pure — tested). Kinds, most urgent first:
 * overdue, blocked, due_soon, shoot_no_contract, over_budget, tasks_overdue, stuck_ticket, casting, stale, no_deadline.
 */
function signalsFor(p, today) {
  const out = [];
  if (isDone(p.stage)) return out;
  const active = ACTIVE_STAGES.includes(p.stage);
  const dl = p.tracker?.deadline;
  if (dl && dl < today) out.push({ kind: 'overdue', level: 'red', text: `Deadline passed ${daysBetween(dl, today)}d ago` });
  if (p.tracker?.health === 'blocked') out.push({ kind: 'blocked', level: 'red', text: 'Marked blocked' });
  if (dl && dl >= today && daysBetween(today, dl) <= 7) out.push({ kind: 'due_soon', level: 'amber', text: daysBetween(today, dl) === 0 ? 'Due today' : `Due in ${daysBetween(today, dl)}d` });
  const nextShoot = p.shoot?.next;
  if (nextShoot && daysBetween(today, nextShoot) <= 14 && p.contract && p.contract.status !== 'signed') {
    out.push({ kind: 'shoot_no_contract', level: 'red', text: `Shoot in ${daysBetween(today, nextShoot)}d — contract ${p.contract.status || 'not sent'}` });
  }
  if (p.budget.planned > 0 && p.budget.actual > p.budget.planned * 1.0001) {
    out.push({ kind: 'over_budget', level: 'amber', text: `Over budget by ${Math.round((p.budget.actual / p.budget.planned - 1) * 100)}%` });
  }
  if (p.tasks.overdue > 0) out.push({ kind: 'tasks_overdue', level: 'amber', text: `${p.tasks.overdue} overdue task${p.tasks.overdue > 1 ? 's' : ''}` });
  const stuck = (p.tickets || []).filter(t => t.open && t.status?.category === 'stuck').length;
  if (stuck) out.push({ kind: 'stuck_ticket', level: 'amber', text: `${stuck} Monday ticket${stuck > 1 ? 's' : ''} stuck` });
  if (p.casting.warnings > 0) out.push({ kind: 'casting', level: 'amber', text: `${p.casting.warnings} casting right${p.casting.warnings > 1 ? 's' : ''} expiring` });
  if (active && p.last_activity && daysBetween(day(p.last_activity), today) >= 14) {
    out.push({ kind: 'stale', level: 'gray', text: `No updates for ${daysBetween(day(p.last_activity), today)}d` });
  }
  if (active && !dl) out.push({ kind: 'no_deadline', level: 'gray', text: 'No deadline set' });
  return out;
}

async function buildTracker({ brandId, force = false, now = Date.now() }) {
  const t0 = Date.now();
  const warnings = [];
  const today = W.localDate(now);
  const prods = await db.query(
    `SELECT id, project_name, product_type, producer, production_type, production_category, stage, locked,
            planned_start::text AS planned_start, planned_end::text AS planned_end, shoot_dates,
            delivery_date::text AS delivery_date, air_date::text AS air_date,
            planned_budget_2026, estimated_budget, actual_spent, created_at, updated_at
       FROM productions WHERE brand_id = $1 AND COALESCE(stage, '') NOT ILIKE '%cancel%'
      ORDER BY id DESC`,
    [brandId]
  ).then(r => r.rows);
  const ids = prods.map(p => p.id);

  const ticketsP = brandId === 'particle'
    ? tvTickets(brandId, { force }).catch((e) => { warnings.push(`Monday tickets unavailable (${e.message})`); return null; })
    : Promise.resolve(null);
  const [tracker, lines, contracts, links, comments, tasks, gantt, sheets, casting, stageRows, touched, weeklies, users, suppliers] = await Promise.all([
    rowsOf('SELECT * FROM production_tracker WHERE production_id = ANY($1)', [ids], warnings, 'Tracker fields'),
    rowsOf(`SELECT production_id, item, full_name, supplier, type, payment_status, actual_spent
              FROM production_line_items WHERE production_id = ANY($1) ORDER BY created_at`, [ids], warnings, 'Line items'),
    rowsOf('SELECT production_id, status, provider_name, sent_at, signed_at FROM contracts WHERE production_id = ANY($1)', [ids], warnings, 'Contracts'),
    rowsOf('SELECT production_id, category, title, url FROM links WHERE production_id = ANY($1) ORDER BY "order", created_at', [ids], warnings, 'Links'),
    rowsOf(`SELECT DISTINCT ON (production_id) production_id, author, body, created_at, COUNT(*) OVER (PARTITION BY production_id) AS n
              FROM comments WHERE production_id = ANY($1) ORDER BY production_id, created_at DESC`, [ids], warnings, 'Updates'),
    rowsOf(`SELECT t.production_id, t.title, t.status, t.priority, t.due_date::text AS due_date, u.id AS assignee_id, u.name AS assignee
              FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
             WHERE t.production_id = ANY($1) AND t.status <> 'Done'`, [ids], warnings, 'Tasks'),
    rowsOf(`SELECT production_id, title, start_date::text AS start_date, end_date::text AS end_date
              FROM gantt_events WHERE production_id = ANY($1) AND end_date >= $2::date ORDER BY start_date`, [ids, today], warnings, 'Gantt'),
    rowsOf('SELECT production_id, title, shoot_date FROM call_sheets WHERE production_id = ANY($1)', [ids], warnings, 'Call sheets'),
    rowsOf(`SELECT production_id, name, role, contract_status, warning_date::text AS warning_date, end_date::text AS end_date
              FROM casting WHERE production_id = ANY($1)`, [ids], warnings, 'Casting'),
    rowsOf(`SELECT DISTINCT ON (production_id) production_id, created_at, user_name
              FROM change_history WHERE production_id = ANY($1) AND field = 'stage' ORDER BY production_id, created_at DESC`, [ids], warnings, 'Stage history'),
    rowsOf(`SELECT production_id, MAX(created_at) AS at FROM change_history WHERE production_id = ANY($1) GROUP BY production_id`, [ids], warnings, 'History'),
    rowsOf('SELECT week_start, entries FROM weekly_reports WHERE brand_id = $1 ORDER BY week_start DESC LIMIT 8', [brandId], warnings, 'Weekly'),
    rowsOf(`SELECT id, name, avatar_url FROM users WHERE active IS NOT FALSE AND deleted_at IS NULL AND COALESCE(name, '') <> '' ORDER BY name`, [], warnings, 'Users'),
    rowsOf('SELECT id, full_name AS name, role, company_name FROM suppliers ORDER BY full_name LIMIT 2000', [], warnings, 'Suppliers'),
  ]);
  const tickets = await ticketsP;

  const by = {
    tracker: Object.fromEntries(tracker.map(r => [r.production_id, r])),
    lines: groupBy(lines), links: groupBy(links), tasks: groupBy(tasks), gantt: groupBy(gantt), sheets: groupBy(sheets), casting: groupBy(casting),
    contract: Object.fromEntries(contracts.map(r => [r.production_id, r])),
    comment: Object.fromEntries(comments.map(r => [r.production_id, r])),
    stage: Object.fromEntries(stageRows.map(r => [r.production_id, r])),
    touched: Object.fromEntries(touched.map(r => [r.production_id, r.at])),
  };

  // The latest CP weekly entry per production
  const weekly = {};
  for (const wr of weeklies) {
    for (const e of Array.isArray(wr.entries) ? wr.entries : []) {
      if (!e?.production_id || weekly[e.production_id]) continue;
      const bullets = (Array.isArray(e.bullets) ? e.bullets : []).map(b => (b?.text || '').trim()).filter(Boolean);
      const note = String(e.long_text ?? e.note ?? '').trim();
      if (bullets.length || note) weekly[e.production_id] = { week_start: wr.week_start, note: note.slice(0, 600), bullets: bullets.slice(0, 5) };
    }
  }

  // Monday tickets → productions
  let ticketsBy = {};
  const ask = [];
  if (tickets) {
    try {
      const r = await linkTvItems(brandId, tickets.items);
      for (const it of tickets.items) {
        const link = r.links[it.id];
        const t = { ...it, tv: link };
        if (link?.production_id) (ticketsBy[link.production_id] = ticketsBy[link.production_id] || []).push(t);
        else if (link?.source === 'ask' && it.open) ask.push(t); // finished ones don't need a decision any more
      }
    } catch (e) { warnings.push(`TV linking failed (${e.message})`); }
    warnings.push(...tickets.warnings);
  }
  const ticketOrder = (a, b) => (b.open - a.open) || String(b.timeline?.to || b.deadline || '').localeCompare(String(a.timeline?.to || a.deadline || ''));

  const out = prods.map((p) => {
    const tr = by.tracker[p.id] || null;
    const lineRows = by.lines[p.id] || [];
    const taskRows = by.tasks[p.id] || [];
    const shootDays = [
      ...(Array.isArray(p.shoot_dates) ? p.shoot_dates : []),
      ...(by.sheets[p.id] || []).map(s => s.shoot_date),
    ].map(day).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d));
    const uniqShoot = [...new Set(shootDays)].sort();
    const ganttRows = by.gantt[p.id] || [];
    const castRows = by.casting[p.id] || [];
    const ticketsOf = (ticketsBy[p.id] || []).sort(ticketOrder);
    const stageAt = by.stage[p.id]?.created_at || p.created_at;
    const contract = by.contract[p.id];
    const lastActivity = [by.touched[p.id], by.comment[p.id]?.created_at, tr?.updated_at, p.updated_at]
      .filter(Boolean).map(d => new Date(d).toISOString()).sort().pop() || null;

    // Who's on it: what the tracker says + what the CP and Monday already know
    const internal = [];
    const external = [];
    const seen = new Set();
    const add = (list, m) => {
      const k = `${m.kind}:${norm(m.name)}`;
      if (!m.name || seen.has(k)) return;
      seen.add(k);
      list.push(m);
    };
    for (const m of tr?.team || []) add(m.kind === 'external' ? external : internal, { ...m, source: 'tracker' });
    if (p.producer) add(internal, { kind: 'internal', name: p.producer, role: 'Producer', source: 'cp' });
    for (const t of taskRows) if (t.assignee) add(internal, { kind: 'internal', name: t.assignee, role: 'Tasks', user_id: t.assignee_id, source: 'tasks' });
    const studio = {};
    for (const t of ticketsOf) for (const uid of t.people) studio[uid] = (studio[uid] || 0) + (t.open ? 1 : 0);
    for (const [uid] of Object.entries(studio).sort((a, b) => b[1] - a[1])) {
      const person = tickets?.people?.[uid];
      if (person) add(internal, { kind: 'internal', name: person.name, role: 'Studio', monday_id: uid, photo: person.photo, source: 'monday' });
    }
    for (const li of lineRows) {
      const name = (li.full_name || li.supplier || '').trim();
      if (name && (li.type === 'Crew' || li.type === 'Post' || li.full_name)) add(external, { kind: 'external', name, role: li.item || li.type || '', source: 'budget' });
    }
    if (contract?.provider_name) add(external, { kind: 'external', name: contract.provider_name, role: 'Contract', source: 'contract' });

    const row = {
      id: p.id,
      name: p.project_name,
      stage: p.stage || 'Pending',
      stage_since: stageAt ? new Date(stageAt).toISOString() : null,
      stage_days: stageAt ? Math.max(0, daysBetween(W.localDate(new Date(stageAt).getTime()), today)) : null,
      stage_by: by.stage[p.id]?.user_name || null,
      production_type: p.production_type || '',
      category: p.production_category || '',
      product_type: Array.isArray(p.product_type) ? p.product_type : [],
      producer: p.producer || null,
      locked: !!p.locked,
      dates: { planned_start: p.planned_start, planned_end: p.planned_end, delivery: p.delivery_date, air: p.air_date },
      shoot: { days: uniqShoot, next: uniqShoot.find(d => d >= today) || null },
      tracker: tr ? {
        deadline: day(tr.deadline), deadline_label: tr.deadline_label || '', notes: tr.notes || '',
        links: Array.isArray(tr.links) ? tr.links : [], team: Array.isArray(tr.team) ? tr.team : [],
        health: tr.health || null, updated_by: tr.updated_by || null, updated_at: tr.updated_at,
      } : null,
      team: { internal, external },
      budget: {
        planned: num(p.planned_budget_2026) || num(p.estimated_budget),
        actual: num(p.actual_spent),
        unpaid: lineRows.filter(li => num(li.actual_spent) > 0 && !/^paid$/i.test(li.payment_status || '')).length,
        lines: lineRows.length,
      },
      contract: contract ? { status: contract.status || 'none', provider: contract.provider_name || null, sent_at: contract.sent_at, signed_at: contract.signed_at } : null,
      cp_links: (by.links[p.id] || []).slice(0, 8).map(l => ({ category: l.category, title: l.title, url: l.url })),
      cp_links_count: (by.links[p.id] || []).length,
      latest_update: by.comment[p.id] ? { author: by.comment[p.id].author, body: String(by.comment[p.id].body || '').slice(0, 400), at: by.comment[p.id].created_at, count: Number(by.comment[p.id].n) } : null,
      tasks: {
        open: taskRows.length,
        overdue: taskRows.filter(t => t.due_date && t.due_date < today).length,
        next: taskRows.filter(t => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3)
          .map(t => ({ title: t.title, due_date: t.due_date, status: t.status, assignee: t.assignee })),
      },
      milestone: (() => {
        const cur = ganttRows.find(g => g.start_date <= today && g.end_date >= today);
        const next = ganttRows.find(g => g.start_date > today);
        return { current: cur ? { title: cur.title, start: cur.start_date, end: cur.end_date } : null, next: next ? { title: next.title, start: next.start_date, end: next.end_date } : null };
      })(),
      casting: {
        count: castRows.length,
        warnings: castRows.filter(c => c.warning_date && c.warning_date <= W.addDays(today, 30) && !/expired|ended/i.test(c.contract_status || '')).length,
      },
      weekly: weekly[p.id] || null,
      tickets: ticketsOf,
      last_activity: lastActivity,
    };
    row.signals = signalsFor(row, today);
    return row;
  });

  return {
    brand_id: brandId,
    today,
    generated_at: new Date(now).toISOString(),
    build_ms: Date.now() - t0,
    productions: out,
    ask: ask.sort(ticketOrder),
    people: tickets?.people || {},
    monday: !!tickets,
    directory: {
      users: users.map(u => ({ id: u.id, name: u.name, avatar_url: u.avatar_url || null })),
      suppliers: suppliers.map(s => ({ id: s.id, name: s.name, role: s.role || s.company_name || '' })),
    },
    warnings,
  };
}

module.exports = { buildTracker, tvTickets, signalsFor };
