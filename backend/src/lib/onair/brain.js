/**
 * On Air · TV from the Particle Brain platform API (18 Nov 2026). Brain keeps its own copy of the TV provider's data
 * (the agency's airings, synced hourly during publish windows) and serves it read-only:
 *   tv/daily      per product per day: spots, spend, orders, revenue (+ roas, cpa, aov)   history from 2024-01-16
 *   tv/breakdown  the same, split by station, creative, day_part and market
 *   tv/cost       spend per product per day — estimated = the agency hasn't reported the day (from the media pre-log)
 *   tv/sessions   website sessions attributed to TV, per product per day
 *   tv/store      store orders attributed to TV (new / returning, promo-code split; product "_all" = the total)
 * CP reads it through AFTERLIFE's /api/export/brain (AFTERLIFE already holds BRAIN_API_KEY; CP sends its usual export
 * token), or straight from Brain when BRAIN_API_KEY is set here. sync() copies it into Postgres (onair_brain_day /
 * onair_brain_air) so the page never waits on Brain; views() turns it into tv.js's Day / Week / Month shape — the
 * same `air` shape the agency's RBD sheet produced, so the creative cards, stations and dayparts read either.
 * Limits: 60 requests a minute and 5,000 a day per token (shared with AFTERLIFE) — requests here are spaced ≥ 1.1 s,
 * an hourly sync is ~6–10 of them and the one-time history backfill ~30.
 */
const db = require('../../db');
const M = require('./tvMail');
const { rangesOf } = require('./sheets');

const BRAIN = 'https://pfm-ai-assistant.cloud/platform/v1';
const SMALL = ['tv/daily', 'tv/cost', 'tv/sessions', 'tv/store'];
const HISTORY_FROM = '2024-01-16';
const KNOWN = ['Face Cream', 'Gravité', 'Neck Cream', 'Hand Cream', 'Anti-Gray Serum', 'Eye Cream'];
const DAY = 86400000;
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const todayUTC = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ym = (d) => String(d || '').slice(0, 7);

// ── reading Brain ────────────────────────────────────────────────────────────
const via = () => (process.env.BRAIN_API_KEY ? 'direct' : process.env.AFTERLIFE_URL && process.env.AFTERLIFE_EXPORT_TOKEN ? 'afterlife' : null);
const configured = () => !!via();

/** The URL + headers for one page — straight to Brain, or through AFTERLIFE's pass-through. */
function pageRequest(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, String(v));
  if (via() === 'direct') return { url: `${BRAIN}/${path}?${q}`, headers: { Authorization: `Bearer ${process.env.BRAIN_API_KEY}`, Accept: 'application/json' } };
  q.set('path', path);
  const headers = { 'X-Export-Token': process.env.AFTERLIFE_EXPORT_TOKEN, Accept: 'application/json' };
  if (process.env.AFTERLIFE_BASIC_AUTH) headers.Authorization = `Basic ${Buffer.from(process.env.AFTERLIFE_BASIC_AUTH).toString('base64')}`;
  return { url: `${String(process.env.AFTERLIFE_URL).replace(/\/$/, '')}/api/export/brain?${q}`, headers };
}

let nextAt = 0;
async function spaced(gapMs) {
  const wait = nextAt - Date.now();
  nextAt = Math.max(Date.now(), nextAt) + gapMs;
  if (wait > 0) await sleep(wait);
}

/** One page; a 429 / 503 waits Brain's Retry-After (≤ 60 s) and tries again, twice at most. */
async function getPage(path, params, { fetchImpl = fetch, gapMs = 1100, retryUnitMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    await spaced(gapMs);
    const { url, headers } = pageRequest(path, params);
    const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(90000) });
    if ((r.status === 429 || r.status === 503) && attempt < 2) {
      await sleep(Math.min(60, Number(r.headers?.get?.('retry-after')) || 20) * retryUnitMs);
      continue;
    }
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* not JSON */ }
    if (!r.ok) {
      const e = new Error(`Brain ${path} ${r.status}: ${String(j?.error || j?.detail || text || '').slice(0, 160)}`);
      e.status = r.status;
      throw e;
    }
    return j;
  }
}

/** Every row of an endpoint for [from, to] (≤ 400 days), paging by meta.next_offset. */
async function fetchAll(path, from, to, opts = {}) {
  const rows = [];
  let offset = 0;
  for (let n = 0; n < 60; n++) {
    const j = await getPage(path, { from, to, limit: 10000, offset }, opts);
    rows.push(...(Array.isArray(j?.data) ? j.data : []));
    const next = j?.meta?.next_offset;
    if (next == null) return rows;
    offset = next;
  }
  throw new Error(`Brain ${path}: more than 60 pages for ${from}→${to}`);
}

/** [from, to] in pieces of at most maxDays (Brain takes 400 days a request). Pure. */
function chunks(from, to, maxDays = 400) {
  const out = [];
  for (let a = from; a <= to;) {
    const b = addDays(a, maxDays - 1) < to ? addDays(a, maxDays - 1) : to;
    out.push([a, b]);
    a = addDays(b, 1);
  }
  return out;
}

// ── storing it ───────────────────────────────────────────────────────────────
let ready = null;
function ensureTables() {
  ready = ready || db.query(`
    CREATE TABLE IF NOT EXISTS onair_brain_day (
      endpoint  TEXT NOT NULL,
      product   TEXT NOT NULL,
      day       DATE NOT NULL,
      data      JSONB NOT NULL,
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (endpoint, product, day)
    );
    CREATE TABLE IF NOT EXISTS onair_brain_air (
      product       TEXT NOT NULL,
      product_name  TEXT,
      day           DATE NOT NULL,
      station       TEXT,
      station_name  TEXT,
      creative      TEXT,
      creative_name TEXT,
      day_part      TEXT,
      market        TEXT,
      spots         NUMERIC,
      spend         NUMERIC,
      orders        NUMERIC,
      revenue       NUMERIC
    );
    CREATE INDEX IF NOT EXISTS onair_brain_air_pd ON onair_brain_air (product, day);
    CREATE INDEX IF NOT EXISTS onair_brain_air_pc ON onair_brain_air (product, creative);`).catch((e) => { ready = null; throw e; });
  return ready;
}

const dayOf = (r) => String(r?.report_date ?? r?.date ?? r?.day ?? '').slice(0, 10) || null;
const num = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const SEP = '\u0001';

/** The small endpoints: the days in [from, to] are replaced by what Brain says now (rows grouped per product per day). */
async function replaceDays(endpoint, from, to, rows) {
  const by = new Map();
  for (const r of rows) {
    const day = dayOf(r);
    if (!day) continue;
    const k = `${r.product ?? '_all'}${SEP}${day}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const keys = [...by.keys()];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM onair_brain_day WHERE endpoint = $1 AND day BETWEEN $2 AND $3', [endpoint, from, to]);
    for (let i = 0; i < keys.length; i += 1000) {
      const part = keys.slice(i, i + 1000);
      await client.query(
        `INSERT INTO onair_brain_day (endpoint, product, day, data, synced_at)
         SELECT $1, p, d, x, NOW() FROM unnest($2::text[], $3::date[], $4::jsonb[]) AS t(p, d, x)
         ON CONFLICT (endpoint, product, day) DO UPDATE SET data = EXCLUDED.data, synced_at = NOW()`,
        [endpoint, part.map(k => k.split(SEP)[0]), part.map(k => k.split(SEP)[1]), part.map(k => JSON.stringify(by.get(k)))]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  return keys.length;
}

/** The breakdown: the days in [from, to] are replaced in one transaction. */
async function replaceAir(from, to, rows) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM onair_brain_air WHERE day BETWEEN $1 AND $2', [from, to]);
    const ok = rows.filter(r => dayOf(r));
    for (let i = 0; i < ok.length; i += 2000) {
      const part = ok.slice(i, i + 2000);
      const col = (f) => part.map(f);
      const str = (v) => (v == null || v === '' ? null : String(v));
      await client.query(
        `INSERT INTO onair_brain_air (product, product_name, day, station, station_name, creative, creative_name, day_part, market, spots, spend, orders, revenue)
         SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
                              $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[])`,
        [col(r => str(r.product) || '_all'), col(r => str(r.product_name)), col(dayOf), col(r => str(r.station)), col(r => str(r.station_name)),
          col(r => str(r.creative)), col(r => str(r.creative_name)), col(r => str(r.day_part)), col(r => str(r.market)),
          col(r => num(r.spots)), col(r => num(r.spend)), col(r => num(r.orders)), col(r => num(r.revenue))]);
    }
    await client.query('COMMIT');
    return ok.length;
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
}

let running = null;
/** Copy Brain's TV data for the last `days` days (or from `from`) into Postgres. One sync at a time. */
function sync({ days = 10, from = null, why = 'sync' } = {}) {
  if (running) return running;
  running = (async () => {
    if (!configured()) return { ok: false, error: 'Particle Brain isn’t connected (no AfterLife link or BRAIN_API_KEY on CP)' };
    await ensureTables();
    const t0 = Date.now();
    const to = todayUTC();
    const start = from || addDays(to, -days);
    const out = { ok: true, why, from: start, to, rows: {}, via: via(), at: new Date().toISOString() };
    try {
      for (const ep of SMALL) {
        let n = 0;
        for (const [a, b] of chunks(start, to)) n += (await replaceDays(ep, a, b, await fetchAll(ep, a, b)));
        out.rows[ep] = n;
      }
      let n = 0;
      for (const [a, b] of chunks(start, to, 120)) n += (await replaceAir(a, b, await fetchAll('tv/breakdown', a, b)));
      out.rows['tv/breakdown'] = n;
    } catch (e) { out.ok = false; out.error = e.message; }
    out.ms = Date.now() - t0;
    await M.setState(why === 'backfill' ? 'brain_backfill' : 'brain_sync', out).catch(() => {});
    if (why === 'backfill' && out.ok) await M.setState('brain_sync', out).catch(() => {});
    clearViews();
    return out;
  })().finally(() => { running = null; });
  return running;
}

/** The whole history (from 2024-01-16), once — later syncs only touch the last days. */
async function backfillOnce() {
  if (!configured()) return null;
  const done = await M.getState('brain_backfill').catch(() => null);
  if (done?.ok) return null;
  return sync({ from: HISTORY_FROM, why: 'backfill' });
}

// ── views for tv.js ──────────────────────────────────────────────────────────
const RATIO = /^(roas|cpa|aov|cpo|mer|ctr|cvr|cpm|cpv|rate|pct|share)$|_(rate|pct|share|roas|cpa|aov|cpo)$/;
/** Sum the additive numbers of some rows (ratios are recomputed, never added; `estimated` = any row estimated). Pure. */
function sumRows(rows) {
  const out = {};
  for (const r of rows || []) {
    for (const [k, v] of Object.entries(r || {})) {
      if (k === 'estimated') { out.estimated = out.estimated || v === true; continue; }
      if (RATIO.test(k) || typeof v === 'boolean') continue;
      const n = typeof v === 'number' ? v : null;
      if (n == null) continue;
      out[k] = (out[k] || 0) + n;
    }
  }
  return out;
}
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
/** spend / orders / revenue (+ anything else additive) → the TV numbers the page shows. Pure. */
function finish(t, extra = {}) {
  if (!t) return null;
  const spend = t.spend || 0, orders = t.orders || 0, revenue = t.revenue || 0, spots = t.spots || 0;
  if (!spend && !orders && !revenue && !spots) return null;
  return { ...t, ...extra, spots, spend: round2(spend), orders, revenue: round2(revenue), mer: spend ? revenue / spend : null, cpo: orders ? spend / orders : null, aov: orders ? revenue / orders : null };
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(particle|for men|tv)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
/** Brain's product → the name CP uses for it (the agency report's product names), else Brain's own name. Pure. */
function displayName(product, productName, known = []) {
  const n = fold(productName || product);
  if (!n) return productName || product;
  const exact = known.find(k => fold(k) === n);
  if (exact) return exact;
  // one name inside the other ("Particle Face Cream 2.0" ↔ "Face Cream") — only when exactly one known product fits
  const near = known.filter(k => { const f = fold(k); return (f.length >= 4 && n.includes(f)) || (n.length >= 5 && f.includes(n)); });
  return near.length === 1 ? near[0] : productName || product;
}

/** Day / Week / Month (and the period before, and the same days of it) from per-day totals. Pure. */
function periodsOf(byDay, last) {
  const R = rangesOf(last);
  const sum = ([a, b]) => { const rows = []; for (let d = a; d <= b; d = addDays(d, 1)) if (byDay.has(d)) rows.push(byDay.get(d)); return finish(sumRows(rows)); };
  const into = (r) => Math.round((Date.parse(last) - Date.parse(r[0])) / DAY);    // days into the period (0 = its first day)
  const weekEnd = addDays(R.week[0], 6);
  const monthEnd = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const sameDays = (prev, n) => { const b = addDays(prev[0], n) < prev[1] ? addDays(prev[0], n) : prev[1]; return sum([prev[0], b]); };
  return {
    ranges: R,
    day: { label: last, date: last, ...(sum(R.day) || {}), prev: sum(R.day_prev) },
    week: { label: R.week[0], date: R.week[0], ...(sum(R.week) || {}), partial: last < weekEnd, prev: sum(R.week_prev), prev_same: last < weekEnd ? sameDays(R.week_prev, into(R.week)) : null, days: into(R.week) + 1 },
    month: { label: ym(last), ...(sum(R.month) || {}), partial: last < monthEnd, prev: sum(R.month_prev), prev_same: last < monthEnd ? sameDays(R.month_prev, into(R.month)) : null, days: into(R.month) + 1 },
  };
}

/** Charts: the last 42 days, 16 weeks (Monday starts), 13 months (so the same month last year shows). Pure. */
function historyFrom(byDay, last) {
  const days = [...byDay.keys()].filter(d => d <= last).sort();
  const daily = days.slice(-42).map(d => ({ date: d, ...(finish(byDay.get(d)) || { spend: 0, orders: 0, revenue: 0, spots: 0, mer: null }) }));
  const R = rangesOf(last);
  const weeks = new Map(), months = new Map();
  for (const d of days) {
    const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
    const w = addDays(d, -wd);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w).push(byDay.get(d));
    const m = ym(d);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(byDay.get(d));
  }
  const weekly = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-16)
    .map(([w, rs]) => ({ date: w, ...(finish(sumRows(rs)) || { spend: 0, orders: 0, mer: null }), partial: w === R.week[0] && last < addDays(w, 6) }));
  const monthEnd = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const monthly = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-13)
    .map(([m, rs]) => ({ month: m, ...(finish(sumRows(rs)) || { spend: 0, orders: 0, mer: null }), partial: m === ym(last) && last < monthEnd }));
  return { daily, weekly, monthly };
}

const DAYPART_ORDER = ['early morning', 'morning', 'daytime', 'day', 'early fringe', 'early evening', 'early news', 'prime access', 'prime', 'late news', 'late fringe', 'late night', 'overnight', 'rotator', 'ros'];
const dpRank = (n) => { const i = DAYPART_ORDER.indexOf(String(n || '').toLowerCase()); return i < 0 ? 99 : i; };

/**
 * The creatives, stations, dayparts and markets per period, from the breakdown rows of the last two months
 * (+ each creative's first airing over the whole history). The same shape sheets.airingsView returns. Pure.
 */
function airFrom(rows, firsts, last) {
  const R = rangesOf(last);
  const keys = Object.keys(R);
  const inRange = (d, [a, b]) => d >= a && d <= b;
  const group = (keyOf) => {
    const g = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (k == null) continue;
      if (!g.has(k)) g.set(k, { rows: [], sample: r });
      g.get(k).rows.push(r);
    }
    return g;
  };
  const statsOf = (rs) => Object.fromEntries(keys.map(k => [k, finish(sumRows(rs.filter(r => inRange(r.day, R[k])).map(r => ({ spots: num(r.spots) || 0, spend: num(r.spend) || 0, orders: num(r.orders) || 0, revenue: num(r.revenue) || 0 }))))]));
  const codes = {};
  for (const [code, { rows: rs }] of group(r => r.creative || r.creative_name || null)) {
    const latest = rs.reduce((a, r) => (r.day > a.day ? r : a), rs[0]);
    const daily = new Map();
    for (const r of rs) if (r.day > addDays(last, -21)) { const x = daily.get(r.day) || { spend: 0, rev: 0 }; x.spend += num(r.spend) || 0; x.rev += num(r.revenue) || 0; daily.set(r.day, x); }
    codes[code] = {
      code, name: latest.creative_name || code,
      first: firsts[code] || null,
      series: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, x]) => ({ d, spend: Math.round(x.spend), mer: x.spend ? x.rev / x.spend : null })),
      ...statsOf(rs),
    };
  }
  const per = (keyOf, label, extra = () => ({})) => {
    const out = { day: [], week: [], month: [] };
    for (const [k, { rows: rs, sample }] of group(keyOf)) {
      const s = statsOf(rs);
      for (const p of ['day', 'week', 'month']) if (s[p]) out[p].push({ [label]: k, ...extra(rs, sample), ...s[p], prev: s[`${p}_prev`] });
    }
    for (const p of Object.keys(out)) out[p].sort((a, b) => (b.spend || 0) - (a.spend || 0));
    return out;
  };
  const marketOf = (rs) => {
    const c = new Map();
    for (const r of rs) if (r.market) c.set(r.market, (c.get(r.market) || 0) + (num(r.spend) || 0));
    return { market: [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null };
  };
  const stations = per(r => r.station_name || r.station || null, 'station', marketOf);
  const dayparts = per(r => r.day_part || null, 'daypart');
  for (const p of Object.keys(dayparts)) dayparts[p].sort((a, b) => dpRank(a.daypart) - dpRank(b.daypart) || (b.spend || 0) - (a.spend || 0));
  const markets = per(r => r.market || null, 'market');
  return {
    last, first: rows.reduce((a, r) => (!a || r.day < a ? r.day : a), null), ranges: R, source: 'brain',
    codes,
    stations: Object.fromEntries(Object.entries(stations).map(([k, v]) => [k, v.slice(0, 14)])),
    dayparts, daypart_hours: {},
    markets: Object.fromEntries(Object.entries(markets).map(([k, v]) => [k, v.slice(0, 12)])),
  };
}

/** One product's whole Brain view from its rows. Pure (tested). */
function productFrom({ name, daily = [], cost = [], sessions = [], store = [], air = [], firsts = {}, today = todayUTC() }) {
  const byDay = (rows) => {
    const m = new Map();
    for (const r of rows) { if (!r.day || r.day > today) continue; m.set(r.day, sumRows([m.get(r.day) || {}, sumRows(r.data)])); }
    return m;
  };
  const D = byDay(daily);
  const last = [...D.entries()].filter(([, t]) => (t.spend || 0) > 0 || (t.spots || 0) > 0).map(([d]) => d).sort().pop() || null;
  if (!last) return null;
  const periods = periodsOf(D, last);
  const S = byDay(sessions), ST = byDay(store), C = byDay(cost);
  const R = periods.ranges;
  const extraOf = (m, [a, b]) => { const rows = []; for (let d = a; d <= b; d = addDays(d, 1)) if (m.has(d)) rows.push(m.get(d)); return rows.length ? sumRows(rows) : null; };
  const side = (k) => ({ sessions: extraOf(S, R[k]), store: extraOf(ST, R[k]) });
  const estimated = [...C.entries()].filter(([d, t]) => t.estimated && d >= R.month_prev[0]).map(([d, t]) => ({ date: d, spend: round2(t.spend || 0) })).sort((a, b) => a.date.localeCompare(b.date));
  return {
    name, last,
    periods: { day: periods.day, week: periods.week, month: periods.month },
    ranges: R,
    history: historyFrom(D, last),
    site: { day: side('day'), day_prev: side('day_prev'), week: side('week'), week_prev: side('week_prev'), month: side('month'), month_prev: side('month_prev') },
    estimated: { days: estimated, after_last: estimated.filter(e => e.date > last), spend_after_last: round2(estimated.filter(e => e.date > last).reduce((a, e) => a + e.spend, 0)) },
    air: air.length ? airFrom(air, firsts, last) : null,
  };
}

let viewCache = null; // { at, map }
const clearViews = () => { viewCache = null; };

/** CP product name → its Brain view (Brain's products with TV in the last 75 days). known = the names CP already uses. */
async function views(known = []) {
  if (!configured()) return {};
  if (viewCache && Date.now() - viewCache.at < 5 * 60 * 1000) return viewCache.map;
  await ensureTables();
  const today = todayUTC();
  const { rows: prods } = await db.query(
    `SELECT product, MAX(data->0->>'product_name') AS product_name FROM onair_brain_day
      WHERE endpoint = 'tv/daily' AND product <> '_all' AND day > CURRENT_DATE - 75 GROUP BY product`);
  if (!prods.length) { viewCache = { at: Date.now(), map: {} }; return {}; }
  const names = [...new Set([...known, ...KNOWN])];
  const groups = {};
  for (const p of prods) { const n = displayName(p.product, p.product_name, names); (groups[n] = groups[n] || []).push(p.product); }
  const all = prods.map(p => p.product);
  const [small, air, firsts] = await Promise.all([
    db.query(`SELECT endpoint, product, day::text AS day, data FROM onair_brain_day WHERE product = ANY($1) AND (endpoint = 'tv/daily' OR day > CURRENT_DATE - 75)`, [all]).then(r => r.rows),
    db.query(`SELECT product, day::text AS day, station, station_name, creative, creative_name, day_part, market, spots, spend, orders, revenue
                FROM onair_brain_air WHERE product = ANY($1) AND day >= date_trunc('month', CURRENT_DATE - 75)`, [all]).then(r => r.rows),
    db.query(`SELECT DISTINCT ON (product, creative) product, creative, day::text AS d, station_name, station, market
                FROM onair_brain_air WHERE product = ANY($1) AND creative IS NOT NULL AND COALESCE(spots, 0) > 0
               ORDER BY product, creative, day, spend DESC NULLS LAST`, [all]).then(r => r.rows),
  ]);
  const map = {};
  for (const [name, codes] of Object.entries(groups)) {
    const mine = (r) => codes.includes(r.product);
    const pick = (ep) => small.filter(r => r.endpoint === ep && mine(r));
    const fs = {};
    for (const f of firsts.filter(mine)) if (!fs[f.creative] || f.d < fs[f.creative].date) fs[f.creative] = { date: f.d, station: f.station_name || f.station, market: f.market };
    const v = productFrom({ name, daily: pick('tv/daily'), cost: pick('tv/cost'), sessions: pick('tv/sessions'), store: pick('tv/store'), air: air.filter(mine), firsts: fs, today });
    if (v) map[name] = { ...v, brain_products: codes };
  }
  viewCache = { at: Date.now(), map };
  return map;
}

/** creative code → { product, last, first, spend, orders, mer } for creatives with spots in the last 8 days (feeds the TV Library's "on air"). */
async function recentCodes() {
  if (!configured()) return [];
  await ensureTables();
  const { rows } = await db.query(
    `SELECT creative AS code, MAX(product_name) AS product, MAX(day)::text AS last, SUM(spend) spend, SUM(orders) orders, SUM(revenue) rev
       FROM onair_brain_air WHERE day > CURRENT_DATE - 8 AND creative IS NOT NULL AND COALESCE(spots, 0) > 0 GROUP BY creative`);
  return rows;
}

async function status() {
  const [s, b] = await Promise.all([M.getState('brain_sync').catch(() => null), M.getState('brain_backfill').catch(() => null)]);
  return { configured: configured(), via: via(), sync: s, backfilled: !!b?.ok };
}

module.exports = {
  configured, sync, backfillOnce, views, recentCodes, status, clearViews, ensureTables,
  // pure, for tests
  fetchAll, chunks, sumRows, finish, displayName, periodsOf, historyFrom, airFrom, productFrom, pageRequest,
};
