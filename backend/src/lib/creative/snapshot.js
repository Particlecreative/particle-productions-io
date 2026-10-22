/**
 * Creative Weekly data engine: builds the normalized week snapshot from live Monday data.
 *
 * buildSnapshot({ brandId, weekStart }) →
 *   { schema_version, generated_at, week, boards, people, items, sections, workload, metrics,
 *     trend, cp_weekly, media_refs, warnings }
 *
 * Media is stored as refs (never expiring URLs); see media.js for resolution.
 */
const crypto = require('crypto');
const db = require('../../db');
const monday = require('../monday');
const W = require('./week');
const { getCreativeConfig, divisionOf } = require('./config');

const DIVISIONS = [
  { key: 'design', label: 'Design' },
  { key: 'video', label: 'Video' },
  { key: 'tv', label: 'TV & Special Productions' },
];
const { classifyDeliveries } = require('./classify');
const { importCpWeekly } = require('./cpWeekly');

const SCHEMA_VERSION = 1;
const DAY_MS = 86400000;
const OVERDUE_LOOKBACK_DAYS = 30;

const norm = monday.normLabel;

// ── Small helpers ───────────────────────────────────────────────────────────
function sha(s, len = 16) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, len); }

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

function parseTs(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  if (/^\d+$/.test(String(v))) { const n = Number(v); return n > 1e12 ? n : n * 1000; }
  return Date.parse(v);
}

/** "Product | Campaign | Platform | Concept" → { title, subtitle } */
function parseItemName(name, productLabel, knownProducts) {
  const parts = String(name || '').split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { title: name || 'Untitled', subtitle: '' };
  const first = norm(parts[0]);
  if (parts.length > 1 && (first === norm(productLabel) || knownProducts.has(first))) parts.shift();
  if (parts.length === 1) return { title: parts[0], subtitle: '' };
  let title = parts[parts.length - 1];
  let rest = parts.slice(0, -1);
  // Short trailing segments ("SAVE MONEY", "v2") and deep names ("Campaign | Platform | Angle | Variant")
  // read better with their predecessor
  if ((title.length < 14 || rest.length >= 3) && rest.length) {
    title = `${rest[rest.length - 1]} — ${title}`;
    rest = rest.slice(0, -1);
  }
  return { title, subtitle: rest.join(' · ') };
}

function canonicalUrl(u) {
  try {
    const url = new URL(String(u).trim());
    url.hash = '';
    // Dropbox: keep rlkey (required), drop tracking params
    if (/dropbox\.com$/i.test(url.hostname)) {
      const rlkey = url.searchParams.get('rlkey');
      url.search = '';
      if (rlkey) url.searchParams.set('rlkey', rlkey);
    }
    return url.toString();
  } catch { return null; }
}

function linkKind(u) {
  if (!u) return null;
  if (/(^|\.)frame\.io\//i.test(u.replace(/^https?:\/\//, '')) || /\/\/f\.io\//i.test(u) || /frame\.io/i.test(u)) return 'frameio';
  if (/dropbox\.com\/(scl\/)?fo\//i.test(u) || /dropbox\.com\/sh\//i.test(u)) return 'dropbox_folder';
  if (/dropbox\.com\//i.test(u)) return 'dropbox_file';
  if (/figma\.com\//i.test(u)) return 'figma';
  return 'link';
}

// ── Normalization ───────────────────────────────────────────────────────────
function cvMap(raw) {
  const m = {};
  for (const cv of raw.column_values || []) m[cv.id] = cv;
  return m;
}

function labelColor(meta, colId, cv) {
  const sm = meta.statusMaps[colId];
  if (!sm || !cv) return null;
  const idx = cv.index ?? sm.byLabel[norm(cv.label ?? cv.text)];
  return idx != null ? sm.byIndex[idx]?.color || null : null;
}

// Timers are automation-driven and sometimes left running for days, so time is clipped to
// Israel work hours (09:00–19:00, Sun–Thu). A forgotten timer adds at most one workday.
const WORK_START_H = 9;
const WORK_END_H = 19;

function trackedInWindow(cv, fromMs, toMs, now) {
  const sessions = Array.isArray(cv?.history) ? [...cv.history] : [];
  if (cv?.running && !sessions.some(s => !s.ended_at) && Number.isFinite(parseTs(cv.started_at))) {
    sessions.push({ started_at: cv.started_at, ended_at: null });
  }
  const intervals = [];
  const days = new Set();
  for (const s of sessions) {
    const a = parseTs(s.started_at);
    let b = parseTs(s.ended_at);
    if (!Number.isFinite(a)) continue;
    if (!Number.isFinite(b)) b = now;
    const lo = Math.max(a, fromMs);
    const hi = Math.min(b, toMs, now);
    if (hi <= lo) continue;
    for (let d = W.localDate(lo); d <= W.localDate(hi - 1); d = W.addDays(d, 1)) {
      if (W.dow(d) > 4) continue; // Fri/Sat
      const mid = W.zonedMidnightUtc(d);
      const ws = Math.max(lo, mid + WORK_START_H * 3600000);
      const we = Math.min(hi, mid + WORK_END_H * 3600000);
      if (we > ws) {
        intervals.push([ws, we]);
        days.add(d);
      }
    }
  }
  const merged = unionIntervals(intervals);
  const total = merged.reduce((s, [a, b]) => s + (b - a), 0) / 1000;
  return { seconds: Math.round(total), days: [...days], intervals: merged };
}

/** Merge overlapping [start, end] ms intervals. */
function unionIntervals(list) {
  const sorted = [...list].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function normalizeItem(raw, ctx) {
  const { boardKey, board, meta, config, bounds, now, knownProducts, statusCategory } = ctx;
  const c = board.columns;
  const cv = cvMap(raw);
  const get = (role) => (c[role] ? cv[c[role]] : null);

  const personCv = get('person');
  const people = (personCv?.persons_and_teams || []).filter(p => p.kind !== 'team').map(p => String(p.id));
  const reqCv = get('requested_by');
  const requested_by = (reqCv?.persons_and_teams || []).filter(p => p.kind !== 'team').map(p => String(p.id));

  const statusCv = get('status');
  const statusLabel = statusCv?.label ?? statusCv?.text ?? '';
  const productCv = get('product');
  const productLabel = productCv?.label ?? productCv?.text ?? '';
  const productColor = config.product_colors?.[productLabel] || labelColor(meta, c.product, productCv);

  const typeCv = get('type');
  const deptCv = get('department');
  const platCv = get('platform');
  const campCv = get('campaign');
  const timelineCv = get('timeline');
  const deadlineCv = get('deadline');
  const versionsCv = get('versions');
  const workCv = get('working_time');
  const filesCv = get('files');

  const linkUrl = (role) => {
    const v = get(role);
    if (!v) return null;
    const u = v.url || (v.text && (v.text.match(/https?:\/\/\S+/) || [])[0]) || null;
    return u ? u.trim() : null;
  };

  const { title, subtitle } = parseItemName(raw.name, productLabel, knownProducts);
  const tracked = trackedInWindow(workCv, bounds.fromMs, bounds.toMs, now);

  const assets = [];
  for (const f of filesCv?.files || []) {
    if (f.asset_id) assets.push({ asset_id: String(f.asset_id), name: f.name || '', is_image: !!f.is_image });
  }

  const item = {
    id: String(raw.id),
    board: boardKey,
    name: raw.name,
    title,
    subtitle,
    product: { label: productLabel || '', color: productColor || null },
    type: typeCv ? { label: typeCv.label ?? typeCv.text ?? '', color: labelColor(meta, c.type, typeCv) } : null,
    department: deptCv ? { label: deptCv.label ?? deptCv.text ?? '', color: labelColor(meta, c.department, deptCv) } : null,
    platform: platCv ? (platCv.label ?? platCv.text ?? '') : '',
    campaign: campCv ? (campCv.values?.map(v => v.label).join(', ') || campCv.text || '') : '',
    status: { label: statusLabel, color: labelColor(meta, c.status, statusCv), category: statusCategory(statusLabel) },
    group: raw.group?.title || '',
    people,
    requested_by,
    timeline: timelineCv && (timelineCv.from || timelineCv.to)
      ? { from: W.dateOnly(timelineCv.from), to: W.dateOnly(timelineCv.to) } : null,
    deadline: W.dateOnly(deadlineCv?.date || deadlineCv?.text),
    versions: Number.isFinite(versionsCv?.number) ? versionsCv.number : (versionsCv?.text ? Number(versionsCv.text) || null : null),
    tracked_s_week: tracked.seconds,
    tracked_days: tracked.days,
    _iv: tracked.intervals, // internal: per-person union; stripped before the snapshot is returned
    created_at: raw.created_at || null,
    monday_url: raw.url || null,
    links: {
      frame: linkUrl('frame'),
      dropbox: linkUrl('dropbox'),
      figma: linkUrl('figma'),
      project: linkUrl('project_link'),
    },
    assets,
    media_refs: [],
  };
  item.division = divisionOf(item, config);
  return item;
}

function registerMedia(item, mediaRefs) {
  const add = (ref) => {
    const id = sha(`${ref.kind}|${ref.url || ref.asset_id}`);
    if (!mediaRefs[id]) mediaRefs[id] = { ...ref, item_id: item.id };
    if (!item.media_refs.includes(id)) item.media_refs.push(id);
  };
  for (const role of ['frame', 'dropbox', 'figma']) {
    const u = item.links[role];
    if (!u) continue;
    const cu = canonicalUrl(u);
    if (!cu) continue;
    add({ kind: linkKind(cu), url: cu });
  }
  for (const a of item.assets) add({ kind: 'monday_asset', asset_id: a.asset_id, name: a.name, is_image: a.is_image });
}

// ── Trend (8 weeks) with creative_week_stats cache ─────────────────────────
function ruleHash(config) {
  const b = config.boards;
  return sha(JSON.stringify({ r: config.delivery_rule, v: b.video.statuses.delivered, d: b.design.statuses.delivered, x: config.exclude, dv: config.divisions }), 12);
}

async function computeTrend({ brandId, config, bounds, currentCounts, metas, deadline, warnings }) {
  const weeks = [];
  for (let i = 7; i >= 1; i--) weeks.push(W.addDays(bounds.start, -7 * i));
  const rh = ruleHash(config);
  const stored = {};
  try {
    const { rows } = await db.query(
      `SELECT week_start, board_key, delivered_count, by_person, by_product, by_division, rule_hash, is_closed
         FROM creative_week_stats WHERE brand_id = $1 AND week_start = ANY($2)`,
      [brandId, weeks]
    );
    for (const r of rows) stored[`${r.week_start}|${r.board_key}`] = r;
  } catch (e) {
    warnings.push(`Trend cache unavailable (${e.message})`);
  }

  const result = {};
  const toCompute = { video: [], design: [] };
  for (const ws of weeks) {
    for (const bk of ['video', 'design']) {
      const row = stored[`${ws}|${bk}`];
      if (row && row.is_closed && row.rule_hash === rh && row.by_division) {
        result[`${ws}|${bk}`] = { count: row.delivered_count, by_person: row.by_person || {}, by_product: row.by_product || {}, by_division: row.by_division || {} };
      } else {
        toCompute[bk].push(ws);
      }
    }
  }

  for (const bk of ['video', 'design']) {
    const list = toCompute[bk];
    if (!list.length) continue;
    const board = config.boards[bk];
    const windows = list.map(ws => { const wb = W.weekBounds(ws); return { key: ws, fromIso: wb.fromIso, toIso: wb.toIso, fromMs: wb.fromMs, toMs: wb.toMs }; });
    let byWeek;
    try {
      byWeek = await monday.activityLogsMulti(board.board_id, windows, { columnIds: [board.columns.status], deadline });
    } catch (e) {
      warnings.push(`Trend for ${bk} unavailable (${e.message})`);
      continue;
    }
    const deliveredByWeek = {};
    const allIds = new Set();
    for (const w of windows) {
      const cls = classifyDeliveries(byWeek[w.key] || [], {
        statusColumn: board.columns.status, delivered: board.statuses.delivered, fixes: board.statuses.fixes,
        fromMs: w.fromMs, toMs: w.toMs, rule: config.delivery_rule,
      });
      deliveredByWeek[w.key] = Object.keys(cls.delivered);
      deliveredByWeek[w.key].forEach(id => allIds.add(id));
    }
    let details = {};
    if (allIds.size) {
      try {
        const cols = [board.columns.person, board.columns.product, board.columns.department, board.columns.type].filter(Boolean);
        const raws = await monday.itemsByIds([...allIds], { cols, deadline });
        for (const r of raws) {
          const m = cvMap(r);
          const pc = m[board.columns.person];
          const pr = m[board.columns.product];
          const dc = board.columns.department ? m[board.columns.department] : null;
          const tc = board.columns.type ? m[board.columns.type] : null;
          details[String(r.id)] = {
            people: (pc?.persons_and_teams || []).filter(p => p.kind !== 'team').map(p => String(p.id)),
            product: pr?.label ?? pr?.text ?? '',
            division: divisionOf({ board: bk, department: { label: dc?.label ?? dc?.text ?? '' }, type: { label: tc?.label ?? tc?.text ?? '' } }, config),
          };
        }
      } catch (e) { warnings.push(`Trend details for ${bk} unavailable (${e.message})`); details = {}; }
    }
    for (const w of windows) {
      const ids = deliveredByWeek[w.key];
      const by_person = {};
      const by_product = {};
      const by_division = {};
      for (const id of ids) {
        const d = details[id];
        if (d && config.exclude?.products?.includes(d.product)) continue;
        for (const p of d?.people || []) by_person[p] = (by_person[p] || 0) + 1;
        if (d?.product) by_product[d.product] = (by_product[d.product] || 0) + 1;
        const dv = d?.division || bk;
        by_division[dv] = (by_division[dv] || 0) + 1;
      }
      const count = ids.filter(id => !(details[id] && config.exclude?.products?.includes(details[id].product))).length;
      result[`${w.key}|${bk}`] = { count, by_person, by_product, by_division };
      const isClosed = w.toMs + 3 * DAY_MS < Date.now();
      try {
        await db.query(
          `INSERT INTO creative_week_stats (brand_id, week_start, board_key, delivered_count, delivered_item_ids, by_person, by_product, by_division, rule_hash, is_closed, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (brand_id, week_start, board_key) DO UPDATE SET
             delivered_count = EXCLUDED.delivered_count, delivered_item_ids = EXCLUDED.delivered_item_ids,
             by_person = EXCLUDED.by_person, by_product = EXCLUDED.by_product, by_division = EXCLUDED.by_division,
             rule_hash = EXCLUDED.rule_hash, is_closed = EXCLUDED.is_closed, computed_at = NOW()`,
          [brandId, w.key, bk, count, ids, JSON.stringify(by_person), JSON.stringify(by_product), JSON.stringify(by_division), rh, isClosed]
        );
      } catch { /* cache write is best-effort */ }
    }
  }

  return [
    ...weeks.map(ws => ({
      week_start: ws,
      label: W.shortLabel(ws),
      video: result[`${ws}|video`]?.count ?? null,
      design: result[`${ws}|design`]?.count ?? null,
      by_person: mergeCounts(result[`${ws}|video`]?.by_person, result[`${ws}|design`]?.by_person),
      by_division: result[`${ws}|video`] || result[`${ws}|design`]
        ? mergeCounts(result[`${ws}|video`]?.by_division, result[`${ws}|design`]?.by_division) : null,
    })),
    {
      week_start: bounds.start, label: W.shortLabel(bounds.start), video: currentCounts.video, design: currentCounts.design,
      by_person: currentCounts.by_person, by_division: currentCounts.by_division, current: true,
    },
  ];
}

function mergeCounts(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function buildSnapshot({ brandId = 'particle', weekStart, force = false, now = Date.now(), budgetMs = 60000, includeTrend = true, includeCp = true, includeStudio = true } = {}) {
  const t0 = Date.now();
  const deadline = t0 + budgetMs;
  const config = await getCreativeConfig(brandId);
  const bounds = W.weekBounds(weekStart, { now });
  const warnings = [];
  if (force) monday.clearCache('meta:');

  // The Studio's dataset for the same week, built alongside: one source for people, hours (BambooHR clock-ins ×
  // Working), time off and TV ↔ production links, so the deck and Creative Control show the same numbers.
  // (Required here, not at the top: the Studio module itself uses this file's normalizeItem.)
  const studioP = includeStudio
    ? require('../studio/data').getStudio({ brandId, from: bounds.start, to: W.addDays(bounds.start, 6), force })
      .catch((e) => { warnings.push(`Studio data unavailable (${e.message}) — hours from Monday timers`); return null; })
    : Promise.resolve(null);

  const boardKeys = Object.keys(config.boards);
  const metas = {};
  await Promise.all(boardKeys.map(async bk => { metas[bk] = await monday.boardMeta(config.boards[bk].board_id, { force }); }));

  // Known product labels across boards (for name parsing)
  const knownProducts = new Set();
  for (const bk of boardKeys) {
    const pm = metas[bk].statusMaps[config.boards[bk].columns.product];
    for (const v of Object.values(pm?.byIndex || {})) if (v.label) knownProducts.add(norm(v.label));
  }

  const items = {};
  const mediaRefs = {};
  const delivered = {};   // id → delivery info
  const reopened = [];
  const openIds = { video: new Set(), design: new Set() };

  // Per board: activity logs + open items in parallel
  await Promise.all(boardKeys.map(async (bk) => {
    const board = config.boards[bk];
    const meta = metas[bk];
    const cols = [...new Set(Object.values(board.columns).filter(Boolean))].filter(id => meta.columns[id]);
    const sm = meta.statusMaps[board.columns.status] || { byLabel: {}, byIndex: {} };

    const catOf = {};
    for (const [cat, labels] of Object.entries(board.statuses)) for (const l of labels) catOf[norm(l)] = cat;
    const statusCategory = (label) => catOf[norm(label)] || 'other';

    const deliveredIdx = board.statuses.delivered
      .map(l => sm.byLabel[norm(l)]).filter(i => i != null)
      .concat(Object.entries(sm.byIndex).filter(([, v]) => /^(done|completed)$/i.test(v.label)).map(([i]) => Number(i)));

    const [logs, open] = await Promise.all([
      monday.activityLogs(board.board_id, { fromIso: bounds.fromIso, toIso: bounds.toIso, columnIds: [board.columns.status], deadline }),
      monday.fetchAllItems(board.board_id, {
        cols,
        queryParams: deliveredIdx.length
          ? { rules: [{ column_id: board.columns.status, compare_value: [...new Set(deliveredIdx)], operator: 'not_any_of' }] }
          : null,
        deadline,
      }),
    ]);
    if (logs.truncated) warnings.push(`${board.label}: activity log truncated — counts may be low`);
    if (open.truncated) warnings.push(`${board.label}: open items truncated`);

    const cls = classifyDeliveries(logs.events, {
      statusColumn: board.columns.status, delivered: board.statuses.delivered, fixes: board.statuses.fixes,
      fromMs: bounds.fromMs, toMs: bounds.toMs, rule: config.delivery_rule,
    });
    warnings.push(...cls.warnings.map(w => `${board.label}: ${w}`));
    reopened.push(...cls.reopened);

    const ctx = { boardKey: bk, board, meta, config, bounds, now, knownProducts, statusCategory };
    for (const raw of open.items) {
      const it = normalizeItem(raw, ctx);
      items[it.id] = it;
      openIds[bk].add(it.id);
    }

    const needDetails = Object.keys(cls.delivered).filter(id => !items[id]);
    const raws = needDetails.length ? await monday.itemsByIds(needDetails, { cols, deadline }) : [];
    for (const raw of raws) {
      const it = normalizeItem(raw, ctx);
      items[it.id] = it;
    }
    for (const [id, info] of Object.entries(cls.delivered)) {
      if (!items[id]) {
        // Deleted since delivery — keep a minimal record from the log
        const { title, subtitle } = parseItemName(info.pulse_name, '', knownProducts);
        items[id] = {
          id, board: bk, division: bk, name: info.pulse_name, title, subtitle, missing: true,
          product: { label: '', color: null }, type: null, department: null, platform: '', campaign: '',
          status: { label: info.delivered_status, color: null, category: 'delivered' }, group: '',
          people: [], requested_by: [], timeline: null, deadline: null, versions: null,
          tracked_s_week: 0, tracked_days: [], created_at: null, monday_url: null,
          links: { frame: null, dropbox: null, figma: null, project: null }, assets: [], media_refs: [],
        };
      }
      // An item delivered this week but currently open (reopened after the week) keeps its delivery
      if (openIds[bk].has(id) && !bounds.partial) items[id].reopened_after = true;
      delivered[id] = info;
      items[id].delivered_at = info.delivered_at;
      items[id].delivered_status = info.delivered_status;
      items[id].delivery_rounds = info.rounds;
      items[id].fixes_in_week = info.fixes_in_week;
      items[id].delivered_by_automation = info.by_automation;
    }
  }));

  // Exclusions
  const excludedProducts = new Set((config.exclude?.products || []).map(norm));
  const excludedGroups = new Set((config.exclude?.groups || []).map(norm));
  for (const [id, it] of Object.entries(items)) {
    if (excludedProducts.has(norm(it.product.label)) || excludedGroups.has(norm(it.group))) {
      delete items[id];
      delete delivered[id];
    }
  }

  for (const it of Object.values(items)) registerMedia(it, mediaRefs);

  // Studio facts on each ticket: hands-on hours, its life (turnaround, fix rounds), the TV production it belongs to
  const studio = await studioP;
  const sItems = new Map((studio?.items || []).map(i => [i.id, i]));
  for (const it of Object.values(items)) {
    const si = sItems.get(it.id);
    if (!si) continue;
    it.effort_s = si.effort_s || 0;
    it.effort_total_s = si.effort_total_s || 0;
    if (si.life) it.life = si.life;
    if (si.tv) it.tv = { production_id: si.tv.production_id || null, name: si.tv.name || null, source: si.tv.source };
  }

  // ── Sections ──
  const todayIl = W.localDate(now);
  const asOf = todayIl < bounds.lastDay ? todayIl : bounds.lastDay;
  const overdueFloor = W.addDays(asOf, -OVERDUE_LOOKBACK_DAYS);
  const all = Object.values(items);
  const isOpen = (it) => !delivered[it.id] && it.status.category !== 'delivered';
  const byDeliveredDesc = (a, b) => (items[b].delivered_at || 0) - (items[a].delivered_at || 0);

  const sections = {
    delivered: Object.keys(delivered).filter(id => items[id]).sort(byDeliveredDesc),
    in_progress: all.filter(it => isOpen(it) && it.status.category === 'in_progress').map(it => it.id),
    review: all.filter(it => isOpen(it) && it.status.category === 'review').map(it => it.id),
    fixes: all.filter(it => isOpen(it) && it.status.category === 'fixes').map(it => it.id),
    stuck: all.filter(it => isOpen(it) && it.status.category === 'stuck').map(it => it.id),
    paused: all.filter(it => isOpen(it) && it.status.category === 'paused').map(it => it.id),
    overdue: all.filter(it => isOpen(it) && !['paused', 'other'].includes(it.status.category) && it.deadline
      && it.deadline < asOf && it.deadline >= overdueFloor).map(it => it.id),
    planned_next_week: all.filter(it => isOpen(it) && it.status.category !== 'paused' && (
      it.timeline ? W.rangesOverlap(it.timeline.from, it.timeline.to, bounds.next.start, bounds.next.workdays[4])
        : (it.deadline && it.deadline >= bounds.next.start && it.deadline <= bounds.next.workdays[4])
    )).map(it => it.id),
    active_this_week: all.filter(it => isOpen(it) && it.timeline
      && W.rangesOverlap(it.timeline.from, it.timeline.to, bounds.start, bounds.lastDay)).map(it => it.id),
    reopened: [...new Set(reopened)].filter(id => items[id]),
  };
  const deadlineSort = (a, b) => String(items[a].deadline || '9999').localeCompare(String(items[b].deadline || '9999'));
  sections.overdue.sort(deadlineSort);
  sections.planned_next_week.sort(deadlineSort);

  // ── People roster ──
  const roleCount = {};
  const relevant = new Set([...sections.delivered, ...sections.in_progress, ...sections.review, ...sections.fixes,
    ...sections.stuck, ...sections.planned_next_week, ...sections.active_this_week, ...sections.overdue]);
  for (const id of relevant) {
    for (const uid of items[id].people) {
      roleCount[uid] = roleCount[uid] || { video: 0, design: 0 };
      roleCount[uid][items[id].board]++;
    }
  }
  for (const uid of Object.keys(config.team || {})) roleCount[uid] = roleCount[uid] || { video: 0, design: 0 };
  let users = [];
  try { users = await monday.usersByIds(Object.keys(roleCount)); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const userMap = Object.fromEntries(users.map(u => [String(u.id), u]));
  const people = {};
  for (const [uid, rc] of Object.entries(roleCount)) {
    const u = userMap[uid] || {};
    const t = config.team?.[uid] || {};
    if (t.hidden) continue;
    // Former accounts Monday no longer returns: their tickets still count, but no person slide (same as the Studio)
    if (!userMap[uid] && !t.display_name && users.length) continue;
    const sp = studio?.people?.[uid];
    people[uid] = {
      id: uid,
      name: t.display_name || sp?.name || u.name || `User ${uid}`,
      title: u.title || '',
      photo: u.photo_small || u.photo_thumb_small || sp?.photo || null,
      role: t.role || sp?.role || (rc.video >= rc.design ? (rc.video ? 'video' : 'design') : 'design'),
      order: t.order ?? null,
      enabled: u.enabled !== false,
    };
  }

  // ── Workload ──
  const days = [...bounds.workdays, ...bounds.next.workdays];
  const workload = { days, this_week: bounds.workdays, next_week: bounds.next.workdays, capacity: config.capacity_per_day, people: {}, out: {}, hours: {}, holidays: studio?.holidays || [] };
  // Worked on a day = hands-on time that day (Studio), else the Monday timer ran that day
  const workedOn = (it, uid, d) => (studio ? (sItems.get(it.id)?.effort_days?.[uid]?.[d] || 0) >= 900 : it.tracked_days.includes(d));
  const consider = new Set([...sections.delivered, ...sections.active_this_week, ...sections.planned_next_week,
    ...sections.in_progress, ...sections.review, ...sections.fixes, ...sections.stuck]);
  for (const uid of Object.keys(people)) workload.people[uid] = Object.fromEntries(days.map(d => [d, { planned: [], active: [] }]));
  for (const id of consider) {
    const it = items[id];
    for (const uid of it.people) {
      const row = workload.people[uid];
      if (!row) continue;
      for (const d of days) {
        if (it.timeline && W.rangesOverlap(it.timeline.from, it.timeline.to, d, d)) row[d].planned.push(id);
        if (workedOn(it, uid, d)) row[d].active.push(id);
      }
    }
  }
  // Time off and holidays (BambooHR), and each day's hands-on hours vs. hours clocked in
  for (const uid of Object.keys(people)) {
    const sp = studio?.people?.[uid];
    if (!sp) continue;
    const off = {};
    for (const d of days) {
      const o = (sp.out || []).find(x => x.start <= d && x.end >= d);
      if (o) off[d] = { type: o.type || 'time_off', name: o.name || null };
    }
    if (Object.keys(off).length) workload.out[uid] = off;
    const hrs = {};
    for (const d of bounds.workdays) {
      const on = sp.effort_by_day?.[d] || 0;
      const clocked = sp.clock_by_day?.[d]?.hours;
      if (on || clocked) hrs[d] = { on_tasks: round1(on / 3600), clocked: clocked != null ? clocked : null };
    }
    workload.hours[uid] = hrs;
  }

  // ── Metrics ──
  const del = sections.delivered.map(id => items[id]);
  const turnarounds = del.filter(it => it.created_at).map(it => (it.delivered_at - Date.parse(it.created_at)) / DAY_MS).filter(n => n >= 0);
  const withDeadline = del.filter(it => it.deadline);
  const onTime = withDeadline.filter(it => W.localDate(it.delivered_at) <= it.deadline).length;

  const countBy = (list, keyFn, colorFn) => {
    const m = new Map();
    for (const it of list) {
      const k = keyFn(it);
      if (!k) continue;
      const e = m.get(k) || { label: k, color: colorFn ? colorFn(it) : null, video: 0, design: 0, total: 0 };
      e[it.board]++;
      e.total++;
      if (!e.color && colorFn) e.color = colorFn(it);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  };

  const byPerson = {};
  for (const uid of Object.keys(people)) {
    const mine = (list) => list.filter(id => items[id].people.includes(uid));
    const d = mine(sections.delivered);
    const tt = d.map(id => items[id]).filter(it => it.created_at).map(it => (it.delivered_at - Date.parse(it.created_at)) / DAY_MS);
    const vers = d.map(id => items[id].versions).filter(v => Number.isFinite(v));
    // Wall-clock time with at least one of their tickets in Working (parallel timers aren't double-counted)
    const trackedS = unionIntervals(Object.values(items).filter(it => it.people.includes(uid)).flatMap(it => it._iv || []))
      .reduce((s, [a, b]) => s + (b - a), 0) / 1000;
    const sp = studio?.people?.[uid];
    const hours = sp ? {
      on_tasks: round1((sp.effort_s || 0) / 3600),
      clocked: sp.clocked_s != null ? round1(sp.clocked_s / 3600) : null,
      not_on_task: sp.unassigned_s != null ? round1(sp.unassigned_s / 3600) : null,
    } : null;
    byPerson[uid] = {
      delivered: d.length,
      video: d.filter(id => items[id].board === 'video').length,
      design: d.filter(id => items[id].board === 'design').length,
      in_progress: mine([...sections.in_progress, ...sections.review, ...sections.fixes]).length,
      planned_next: mine(sections.planned_next_week).length,
      fixes: d.reduce((s, id) => s + (items[id].fixes_in_week || 0), 0) + mine(sections.fixes).length,
      stuck: mine(sections.stuck).length,
      overdue: mine(sections.overdue).length,
      median_turnaround_days: round1(median(tt)),
      avg_versions: vers.length ? round1(vers.reduce((a, b) => a + b, 0) / vers.length) : null,
      // Hands-on hours (clocked in × Working, split between parallel tasks); Monday's timer only without the Studio
      tracked_hours: hours ? hours.on_tasks : round1(trackedS / 3600),
      hours,
      products: countBy(d.map(id => items[id]), it => it.product.label, it => it.product.color).slice(0, 6),
    };
  }

  const metrics = {
    totals: {
      delivered: del.length,
      video: del.filter(it => it.board === 'video').length,
      design: del.filter(it => it.board === 'design').length,
      in_progress: sections.in_progress.length + sections.review.length + sections.fixes.length,
      in_review: sections.review.length,
      fixes: sections.fixes.length,
      stuck: sections.stuck.length,
      overdue: sections.overdue.length,
      planned_next: sections.planned_next_week.length,
      reopened: sections.reopened.length,
      people: Object.keys(people).length,
      fixes_rounds_in_week: del.reduce((s, it) => s + (it.fixes_in_week || 0), 0),
    },
    turnaround: { median_days: round1(median(turnarounds)), p75_days: round1(percentile(turnarounds, 75)), sample: turnarounds.length },
    on_time: { on_time: onTime, with_deadline: withDeadline.length, rate: withDeadline.length ? Math.round((onTime / withDeadline.length) * 100) : null },
    by_product: countBy(del, it => it.product.label && it.product.label !== '-' ? it.product.label : null, it => it.product.color),
    by_type: countBy(del.filter(it => it.board === 'video'), it => it.type?.label || null, it => it.type?.color),
    by_department: countBy(del, it => it.department?.label || null, it => it.department?.color),
    by_platform: countBy(del, it => it.platform || null),
    by_person: byPerson,
  };

  metrics.hours = {
    source: studio ? studio.effort_source : 'monday_timer',
    on_tasks: round1(Object.values(byPerson).reduce((a, p) => a + (p.hours?.on_tasks || 0), 0)),
    clocked: studio ? round1(Object.values(byPerson).reduce((a, p) => a + (p.hours?.clocked || 0), 0)) : null,
  };
  if (studio) metrics.studio = studioStats({ studio, items, delivered, sections });

  // ── Per division (Design / Video / TV & Special Productions) ──
  const inDiv = (dv) => (list) => list.filter(id => items[id]?.division === dv);
  metrics.by_division = {};
  for (const { key: dv } of DIVISIONS) {
    const pick = inDiv(dv);
    const dDel = pick(sections.delivered).map(id => items[id]);
    const tt = dDel.filter(it => it.created_at).map(it => (it.delivered_at - Date.parse(it.created_at)) / DAY_MS).filter(n => n >= 0);
    const perPerson = {};
    for (const it of dDel) for (const uid of it.people) perPerson[uid] = (perPerson[uid] || 0) + 1;
    metrics.by_division[dv] = {
      delivered: dDel.length,
      in_progress: pick([...sections.in_progress, ...sections.review, ...sections.fixes]).length,
      in_review: pick(sections.review).length,
      stuck: pick(sections.stuck).length,
      planned_next: pick(sections.planned_next_week).length,
      median_turnaround_days: round1(median(tt)),
      by_product: countBy(dDel, it => it.product.label && it.product.label !== '-' ? it.product.label : null, it => it.product.color),
      by_department: countBy(dDel, it => it.department?.label || null, it => it.department?.color),
      by_person: perPerson,
    };
  }

  // ── Trend ──
  const currentByPerson = Object.fromEntries(Object.entries(byPerson).map(([k, v]) => [k, v.delivered]));
  const currentByDivision = Object.fromEntries(Object.entries(metrics.by_division).map(([k, v]) => [k, v.delivered]));
  let trend = [];
  if (includeTrend) {
    trend = await computeTrend({
      brandId, config, bounds, metas, deadline, warnings,
      currentCounts: { video: metrics.totals.video, design: metrics.totals.design, by_person: currentByPerson, by_division: currentByDivision },
    });
  }
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  metrics.vs_last_week = prev ? {
    video: prev.video != null ? metrics.totals.video - prev.video : null,
    design: prev.design != null ? metrics.totals.design - prev.design : null,
    delivered: prev.video != null && prev.design != null ? metrics.totals.delivered - (prev.video + prev.design) : null,
    by_division: prev.by_division
      ? Object.fromEntries(DIVISIONS.map(({ key }) => [key, currentByDivision[key] - (prev.by_division[key] || 0)]))
      : null,
  } : null;

  // ── CP weekly ──
  let cp_weekly = { found: false, productions: [], general_updates: [] };
  if (includeCp) {
    try { cp_weekly = await importCpWeekly(brandId, bounds.start); } catch (e) { warnings.push(`CP weekly import failed (${e.message})`); }
  }

  for (const it of Object.values(items)) delete it._iv;

  const snapshot = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date(now).toISOString(),
    build_ms: Date.now() - t0,
    week: {
      start: bounds.start, end: bounds.end, last_day: bounds.lastDay, label: bounds.label, number: bounds.number,
      year: bounds.year, workdays: bounds.workdays, partial: bounds.partial,
      next: { start: bounds.next.start, label: W.weekBounds(bounds.next.start).label },
    },
    boards: Object.fromEntries(boardKeys.map(bk => [bk, { board_id: config.boards[bk].board_id, label: config.boards[bk].label, name: metas[bk].name }])),
    divisions: DIVISIONS,
    people,
    items,
    sections,
    workload,
    metrics,
    trend,
    cp_weekly,
    media_refs: mediaRefs,
    sources: { studio: !!studio, hours: metrics.hours.source },
    warnings,
  };
  return snapshot;
}

/**
 * The studio-stats slide: who asked for what this week, how much hands-on time it took, how long a delivered
 * task lived from request to done and where that time went. Hours come from every task worked this week.
 */
function studioStats({ studio, items, delivered, sections }) {
  const del = sections.delivered.map(id => items[id]).filter(Boolean);
  const mix = {};
  const lives = [];
  const fixes = [];
  const lifeDays = (l) => (Date.parse(l.completed) - Date.parse(l.submitted)) / DAY_MS - (l.phases?.delivered || 0) / 86400;
  for (const it of del) {
    const l = it.life;
    if (!l?.submitted || !l.completed || l.partial) continue;
    for (const [k, v] of Object.entries(l.phases || {})) if (k !== 'delivered') mix[k] = (mix[k] || 0) + v;
    lives.push(lifeDays(l));
    fixes.push(l.fix_rounds || 0);
  }
  const reqs = new Map();
  const row = (r) => reqs.get(r) || { id: r, delivered: 0, hours_s: 0, lives: [], fixes: [] };
  // A shared request splits its hours between its requesters, so the shares add up to 100%
  for (const si of studio.items) {
    const rs = si.requested_by || [];
    for (const r of rs) { const e = row(r); e.hours_s += (si.effort_s || 0) / rs.length; reqs.set(r, e); }
  }
  for (const it of del) {
    for (const r of it.requested_by || []) {
      const e = row(r);
      e.delivered++;
      if (it.life?.completed && it.life.submitted && !it.life.partial) { e.lives.push(lifeDays(it.life)); e.fixes.push(it.life.fix_rounds || 0); }
      reqs.set(r, e);
    }
  }
  const avg = (xs) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const hoursTotal = studio.items.reduce((a, i) => a + (i.effort_s || 0), 0);
  const nowMs = Date.parse(studio.generated_at) || Date.now();
  return {
    hands_on_hours: round1(hoursTotal / 3600),
    delivered: del.length,
    median_life_days: round1(median(lives)),
    avg_fix_rounds: avg(fixes),
    life_mix: mix,
    waiting_5d: studio.items.filter(i => i.open && i.life?.submitted && !i.life.started && nowMs - Date.parse(i.life.submitted) > 5 * DAY_MS).length,
    by_requester: [...reqs.values()]
      .map(e => ({
        id: e.id, name: studio.requesters?.[e.id]?.name || studio.people?.[e.id]?.name || 'Unknown',
        photo: studio.requesters?.[e.id]?.photo || null,
        delivered: e.delivered, hours: round1(e.hours_s / 3600), share: hoursTotal ? Math.round((e.hours_s / hoursTotal) * 100) : 0,
        median_life_days: round1(median(e.lives)), avg_fix_rounds: avg(e.fixes),
      }))
      .filter(r => r.delivered || r.hours >= 0.5)
      .sort((a, b) => (b.hours - a.hours) || (b.delivered - a.delivered))
      .slice(0, 8),
  };
}

function hashSnapshot(snapshot) {
  const { generated_at, build_ms, ...rest } = snapshot || {};
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

module.exports = { buildSnapshot, hashSnapshot, parseItemName, canonicalUrl, linkKind, trackedInWindow, unionIntervals, normalizeItem, SCHEMA_VERSION };
