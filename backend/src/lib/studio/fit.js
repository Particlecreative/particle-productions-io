/**
 * Studio — who should take a ticket, learned from the studio's own history (Tomer, 16 Nov 2026: "give us suggestions
 * in a friendly way of who to schedule and when … base it by requester, knowledge, who does which type of tickets
 * usually. Take the history as a brain").
 *
 * The brain: every Video / Design ticket finished in the last 180 days — who made it, for whom, its type, product,
 * brand, platform and department, and how many working days its timeline took. Read from Monday, cached 6 h.
 * fitFor(items) → for each ticket, the people who fit it best, with the reasons as data (the browser words them with
 * names) and how long it usually takes them. *When* is worked out in the browser, where the Workload already knows
 * everyone's load and time off.
 */
const monday = require('../monday');
const W = require('../creative/week');
const { getCreativeConfig } = require('../creative/config');
const { productOf } = require('./product');
const { brandOf } = require('./brand');

const HISTORY_DAYS = 180;
const ACTIVE_DAYS = 90;            // someone who hasn't finished a ticket in 90 days isn't suggested
const FEATURES = ['req', 'type', 'product', 'brand', 'platform', 'dept'];
const WEIGHTS = { req: 0.32, type: 0.26, product: 0.2, brand: 0.12, platform: 0.05, dept: 0.05 };
const DEFAULT_DAYS = { video: 2, design: 1 };
const UNSET = new Set(['', '-', 'none', 'other', 'not a product task', 'multiple products']);

const norm = (s) => String(s ?? '').trim().toLowerCase();
const isSet = (v) => v != null && !UNSET.has(norm(v));

/** Working days (Sun–Thu) from → to, inclusive (pure). */
function workdays(from, to) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = from, i = 0; d <= to && i < 90; d = W.addDays(d, 1), i++) if (W.dow(d) <= 4) n++;
  return n;
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** One finished Monday item → a history row (pure). */
function rowOf(raw, board, boardKey) {
  const c = board.columns;
  const by = Object.fromEntries((raw.column_values || []).map(v => [v.id, v]));
  const people = (col) => (by[col]?.persons_and_teams || []).filter(p => p.kind !== 'team').map(p => String(p.id));
  const label = (col) => (col && by[col] ? (by[col].label ?? by[col].text ?? '') : '');
  const tl = c.timeline ? by[c.timeline] : null;
  const from = W.dateOnly(tl?.from), to = W.dateOnly(tl?.to);
  const product = productOf(by, c) || '';
  const campaign = c.campaign && by[c.campaign] ? (by[c.campaign].values?.map(v => v.label).join(', ') || by[c.campaign].text || '') : '';
  return {
    id: String(raw.id), board: boardKey,
    people: people(c.person), req: c.requested_by ? people(c.requested_by) : [],
    type: label(c.type), product, platform: label(c.platform), dept: label(c.department),
    brand: brandOf({ column: label(c.brand_status), text: label(c.brand), name: raw.name, campaign, product }).label,
    days: from && to ? workdays(from, to) : null,
    done: to || W.dateOnly(raw.updated_at) || null,
  };
}

/** The last 180 days of finished tickets, per board (cached 6 h — the brain doesn't change by the minute). */
function history(brandId = 'particle', { force = false } = {}) {
  return monday.cached(`studio:${brandId}:fit-history`, 6 * 3600 * 1000, async () => {
    const config = await getCreativeConfig(brandId);
    const since = W.addDays(W.localDate(Date.now()), -HISTORY_DAYS);
    const out = { since, boards: {} };
    await Promise.all(['video', 'design'].filter(bk => config.boards[bk]).map(async (bk) => {
      const board = config.boards[bk];
      const meta = await monday.boardMeta(board.board_id);
      const sm = meta.statusMaps?.[board.columns.status];
      const done = (board.statuses?.delivered || []).map(l => sm?.byLabel?.[norm(l)]).filter(i => i != null).map(Number);
      const cols = [...new Set(['person', 'requested_by', 'type', 'department', 'product', 'product_dropdown', 'platform', 'campaign', 'timeline', 'brand', 'brand_status']
        .map(k => board.columns[k]).filter(Boolean))].filter(id => meta.columns[id]);
      if (!done.length) { out.boards[bk] = []; return; }
      const { items } = await monday.fetchAllItems(board.board_id, {
        cols, maxPages: 8, deadline: Date.now() + 45000,
        queryParams: { operator: 'and', rules: [
          { column_id: board.columns.status, compare_value: done, operator: 'any_of' },
          { column_id: '__creation_log__', compare_value: ['EXACT', since], operator: 'greater_than_or_equals' },
        ] },
      });
      out.boards[bk] = items.filter(i => i.state !== 'deleted').map(raw => rowOf(raw, board, bk)).filter(r => r.people.length);
    }));
    return out;
  }, { force });
}

/** The brain for one board: per person, what they've done, and per type, how long it takes (pure). */
function buildModel(rows, today) {
  const totals = Object.fromEntries(FEATURES.map(k => [k, {}]));
  const people = {};
  const typeDays = {};
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const valuesOf = (r, k) => (k === 'req' ? r.req : isSet(r[k]) ? [r[k]] : []);
  for (const r of rows) {
    for (const k of FEATURES) for (const v of valuesOf(r, k)) inc(totals[k], norm(v));
    if (r.days) (typeDays[norm(r.type) || '_'] ||= []).push(r.days);
    for (const p of r.people) {
      const P = people[p] ||= { n: 0, last: null, days: {}, ...Object.fromEntries(FEATURES.map(k => [k, {}])) };
      P.n++;
      for (const k of FEATURES) for (const v of valuesOf(r, k)) inc(P[k], norm(v));
      if (r.done && (!P.last || r.done > P.last)) P.last = r.done;
      if (r.days) (P.days[norm(r.type) || '_'] ||= []).push(r.days);
    }
  }
  const activeSince = W.addDays(today, -ACTIVE_DAYS);
  for (const [id, P] of Object.entries(people)) if (!P.last || P.last < activeSince) delete people[id];
  return { totals, people, typeDays, n: rows.length };
}

/**
 * The people who fit one ticket, best first (pure).
 * item: { board, type, product, brand, platform, department, requested_by: [ids] }
 * → [{ person, score, days, reasons: [{ kind, label?, id?, n, of?, spec? }] }]
 */
function fitOne(model, item, { limit = 5, today = W.localDate(Date.now()) } = {}) {
  const v = {
    type: isSet(item.type) ? norm(item.type) : null,
    product: isSet(item.product) ? norm(item.product) : null,
    brand: item.brand && norm(item.brand) !== 'particle' ? norm(item.brand) : null,   // the house brand isn't a skill
    platform: isSet(item.platform) ? norm(item.platform) : null,
    dept: isSet(item.department) ? norm(item.department) : null,
  };
  const reqs = (item.requested_by || []).map(String);
  const out = [];
  for (const [person, P] of Object.entries(model.people)) {
    const share = (k, val) => (val ? (P[k][val] || 0) / Math.max(1, model.totals[k][val] || 0) : 0);   // their part of all such tickets
    const spec = (k, val) => (val ? (P[k][val] || 0) / Math.max(1, P.n) : 0);                          // how much of their work it is
    let bestReq = null;
    for (const r of reqs) { const n = P.req[r] || 0; if (n && (!bestReq || n > bestReq.n)) bestReq = { id: r, n, of: model.totals.req[r] || n }; }
    const f = {
      req: bestReq ? bestReq.n / Math.max(1, bestReq.of) : 0,
      type: v.type ? 0.5 * share('type', v.type) + 0.5 * spec('type', v.type) : 0,
      product: share('product', v.product),
      brand: share('brand', v.brand),
      platform: spec('platform', v.platform),
      dept: spec('dept', v.dept),
    };
    let score = FEATURES.reduce((a, k) => a + WEIGHTS[k] * f[k], 0);
    const quiet = P.last && P.last < W.addDays(today, -45);   // hasn't finished anything in 6 weeks — still possible, just less likely
    if (quiet) score *= 0.6;
    const reasons = [];
    if (bestReq && bestReq.n >= 2) reasons.push({ kind: 'req', id: bestReq.id, n: bestReq.n, of: bestReq.of });
    if (v.type && (P.type[v.type] || 0) >= 2) reasons.push({ kind: 'type', label: item.type, n: P.type[v.type], spec: Math.round(spec('type', v.type) * 100) / 100 });
    if (v.brand && (P.brand[v.brand] || 0) >= 1) reasons.push({ kind: 'brand', label: item.brand, n: P.brand[v.brand] });   // a sister brand says more than the product
    if (v.product && (P.product[v.product] || 0) >= 2) reasons.push({ kind: 'product', label: item.product, n: P.product[v.product] });
    const own = P.days[v.type || '_'] || [];
    const team = model.typeDays[v.type || '_'] || [];
    const days = Math.min(10, Math.max(1, Math.round(median(own.length >= 2 ? own : team) || DEFAULT_DAYS[item.board] || 1)));
    out.push({ person, score: Math.round(score * 1000) / 1000, days, days_from: own.length >= 2 ? 'theirs' : team.length ? 'team' : 'default', done: P.n, quiet: !!quiet, reasons: reasons.slice(0, 3) });
  }
  return out.sort((a, b) => b.score - a.score || b.done - a.done).slice(0, limit);
}

/** items: [{ key, board, … }] → { learned, fits: { [key]: candidates } } */
async function fitFor(items, { brandId = 'particle' } = {}) {
  const h = await history(brandId);
  // timelines in the history include the old wait for human review — cap at today's lengths (Auto-plan settings)
  const s = await require('./autoplan').getSettings(brandId).catch(() => ({ video_days: 2, design_days: 1 }));
  const today = W.localDate(Date.now());
  const models = Object.fromEntries(Object.entries(h.boards).map(([bk, rows]) => [bk, buildModel(rows, today)]));
  const fits = {};
  for (const it of (items || []).slice(0, 200)) {
    const m = models[it.board];
    if (m) fits[it.key] = fitOne(m, it, { today }).map(c => ({ ...c, days: Math.min(c.days, it.board === 'design' ? s.design_days : s.video_days) }));
  }
  return { learned: { since: h.since, video: h.boards.video?.length || 0, design: h.boards.design?.length || 0 }, fits };
}

module.exports = { fitFor, fitOne, buildModel, rowOf, workdays, history };
