/**
 * On Air · TV — the agency's Excel attachments (18 Nov 2026). Each daily report email carries:
 *  - "… RBD …xlsx"     results by day: EVERY aired spot since January (date, time, station, market, creative code,
 *                       spend, orders, revenue). Re-sent in full every day → the newest file replaces what we hold.
 *  - "… Future …xlsx"  this week's booked plan: one line per station × daypart (spots, cost) and which creatives
 *                       rotate on it (the cell = that creative's promo code on the line).
 * ingest() reads the newest of each per product from Gmail (only when a newer email has them); views feed tv.js:
 * per creative its real day / week / month numbers and first airing, where (stations) and when (dayparts) it works,
 * and the booked plan with the creatives coming up.
 */
const db = require('../../db');
const X = require('./xlsx');
const L = require('./agencyReport');

let ready = null;
function ensureTables() {
  ready = ready || db.query(`
    CREATE TABLE IF NOT EXISTS onair_tv_airings (
      product      TEXT NOT NULL,
      aired_on     DATE NOT NULL,
      aired_time   TEXT,
      minute       INT,
      station_code TEXT,
      station      TEXT,
      market       TEXT,
      length       INT,
      code         TEXT,
      name         TEXT,
      promo        TEXT,
      spots        NUMERIC,
      spend        NUMERIC,
      orders       NUMERIC,
      revenue      NUMERIC
    );
    CREATE INDEX IF NOT EXISTS onair_tv_airings_pd ON onair_tv_airings (product, aired_on);
    CREATE INDEX IF NOT EXISTS onair_tv_airings_pc ON onair_tv_airings (product, code);
    CREATE TABLE IF NOT EXISTS onair_tv_plan (
      product     TEXT NOT NULL,
      week        DATE NOT NULL,
      lines       JSONB NOT NULL,
      gmail_id    TEXT,
      received_at TIMESTAMPTZ,
      PRIMARY KEY (product, week)
    );`).catch((e) => { ready = null; throw e; });
  return ready;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null; };
/** "10:42A" · "9:05 PM" · "21:30" → minutes after midnight */
function minuteOf(t) {
  if (typeof t === 'number' && t >= 0 && t < 1) return Math.round(t * 1440);   // an Excel time
  const m = String(t ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*([AP])?/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (!m[3]) h = Number(m[1]);
  else if (/p/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}
const headerIdx = (head, re) => head.findIndex(h => re.test(norm(h)));

/** RBD rows → airings (one per aired spot). Pure — tested. */
function parseRbd(rows) {
  const hi = rows.findIndex(r => r.some(c => norm(c) === 'creative aired') && r.some(c => norm(c) === 'spend'));
  if (hi < 0) return [];
  const h = rows[hi];
  const at = {
    date: headerIdx(h, /^date$/), time: headerIdx(h, /^time aired$/), scode: headerIdx(h, /^station code$/), station: headerIdx(h, /^station$/),
    market: headerIdx(h, /^market$/), length: headerIdx(h, /^length$/), code: headerIdx(h, /^creative aired$/), name: headerIdx(h, /^creative name$/),
    promo: headerIdx(h, /^promo code$/), spots: headerIdx(h, /^cleared spots$/), spend: headerIdx(h, /^spend$/), orders: headerIdx(h, /^web orders?$/), revenue: headerIdx(h, /^(ttl|total) rev/),
  };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const date = X.excelDate(r[at.date]);
    const code = String(r[at.code] ?? '').trim().toUpperCase();
    if (!date || !/^[A-Z0-9]{4,16}$/.test(code)) continue;
    const time = r[at.time] == null ? null : (typeof r[at.time] === 'number' ? null : String(r[at.time]).trim());
    out.push({
      date, time, minute: minuteOf(r[at.time]), station_code: r[at.scode] != null ? String(r[at.scode]).trim() : null, station: r[at.station] != null ? String(r[at.station]).trim() : null,
      market: r[at.market] != null ? String(r[at.market]).trim() : null, length: num(r[at.length]), code, name: r[at.name] != null ? String(r[at.name]).trim() : null,
      promo: r[at.promo] != null ? String(r[at.promo]).trim() : null, spots: num(r[at.spots]) ?? 1, spend: num(r[at.spend]) ?? 0, orders: num(r[at.orders]) ?? 0, revenue: num(r[at.revenue]) ?? 0,
    });
  }
  return out;
}

/** Future rows → { week, lines: [{ market, station, station_name, length, days, times, spots, rate, cost, creatives: [{ name, promo }] }] }. Pure — tested. */
function parseFuture(rows) {
  const hi = rows.findIndex(r => r.some(c => norm(c) === 'station name') && r.some(c => /ordered cost/.test(norm(c))));
  if (hi < 0) return null;
  const h = rows[hi];
  const at = {
    week: headerIdx(h, /^week$/), market: headerIdx(h, /^market$/), station: headerIdx(h, /^station$/), sname: headerIdx(h, /^station name$/), length: headerIdx(h, /^length$/),
    days: headerIdx(h, /^days$/), times: headerIdx(h, /^times$/), spots: headerIdx(h, /^ord spots$/), rate: headerIdx(h, /^ord buy rate$/), cost: headerIdx(h, /^ordered cost$/),
  };
  const creativeCols = h.map((c, i) => [i, c]).filter(([i, c]) => i > at.cost && c != null && String(c).trim());
  let week = null;
  const lines = [];
  for (const r of rows.slice(hi + 1)) {
    const wk = X.excelDate(r[at.week]);
    const sname = String(r[at.sname] ?? '').trim();
    if (!wk || /total/i.test(sname) || /total/i.test(String(r[at.week] ?? ''))) continue;
    week = week || wk;
    lines.push({
      market: r[at.market] != null ? String(r[at.market]).trim() : null, station: r[at.station] != null ? String(r[at.station]).trim() : null, station_name: sname || null,
      length: num(r[at.length]), days: r[at.days] != null ? String(r[at.days]).trim() : null, times: r[at.times] != null ? String(r[at.times]).trim() : null,
      spots: num(r[at.spots]) ?? 0, rate: num(r[at.rate]), cost: num(r[at.cost]) ?? 0,
      creatives: creativeCols.filter(([i]) => r[i] != null && String(r[i]).trim()).map(([i, name]) => ({ name: String(name).trim(), promo: String(r[i]).trim() })),
    });
  }
  return lines.length ? { week, lines } : null;
}

async function replaceAirings(product, airings) {
  if (!airings.length) return 0;
  const dates = airings.map(a => a.date).sort();
  const client = await db.connect();                          // one connection: the delete + inserts are one transaction
  const q = client.query.bind(client);
  try {
    await q('BEGIN');
    await q('DELETE FROM onair_tv_airings WHERE product = $1 AND aired_on BETWEEN $2 AND $3', [product, dates[0], dates[dates.length - 1]]);
    const COLS = 15;
    for (let i = 0; i < airings.length; i += 1000) {
      const chunk = airings.slice(i, i + 1000);
      const vals = [], params = [];
      chunk.forEach((a, j) => {
        vals.push(`(${Array.from({ length: COLS }, (_, k) => `$${j * COLS + k + 1}`).join(',')})`);
        params.push(product, a.date, a.time, a.minute, a.station_code, a.station, a.market, a.length, a.code, a.name, a.promo, a.spots, a.spend, a.orders, a.revenue);
      });
      await q(`INSERT INTO onair_tv_airings (product, aired_on, aired_time, minute, station_code, station, market, length, code, name, promo, spots, spend, orders, revenue) VALUES ${vals.join(',')}`, params);
    }
    await q('COMMIT');
  } catch (e) { await q('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  return airings.length;
}

/** Read the newest RBD + Future per product from Gmail (only when a newer email has them). → summary */
async function ingest({ days = 14 } = {}) {
  await ensureTables();
  const M = require('./tvMail');
  const gmail = await M.gmailClient();
  const list = await gmail.users.messages.list({ userId: 'me', q: `from:${M.AGENCY} subject:campaign has:attachment newer_than:${days}d`, maxResults: 40 });
  const seen = { rbd: new Set(), future: new Set() };
  const out = [];
  for (const { id } of list.data.messages || []) {           // newest first
    const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const subject = (data.payload?.headers || []).find(h => h.name.toLowerCase() === 'subject')?.value || '';
    if (/^\s*((re|fwd?|fw)\s*:\s*)+/i.test(subject)) continue;
    const product = L.reportSubject(subject)?.product;
    if (!product) continue;
    const parts = [];
    const walk = (p) => { if (!p) return; if (p.filename && p.body?.attachmentId) parts.push(p); (p.parts || []).forEach(walk); };
    walk(data.payload);
    for (const part of parts) {
      const kind = /\.xlsx$/i.test(part.filename) ? (/\brbd\b/i.test(part.filename) ? 'rbd' : /future/i.test(part.filename) ? 'future' : null) : null;
      if (!kind || seen[kind].has(product)) continue;
      seen[kind].add(product);                                 // the newest file of this kind for this product
      const stateKey = `sheet:${kind}:${product}`;
      const st = await M.getState(stateKey);
      if (st?.gmail_id === id && st?.attachment === part.filename) { out.push({ product, kind, file: part.filename, unchanged: true }); continue; }
      try {
        const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: part.body.attachmentId });
        const buf = Buffer.from(String(att.data.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        const rows = X.readSheet(buf);
        if (kind === 'rbd') {
          const airings = parseRbd(rows);
          const n = await replaceAirings(product, airings);
          out.push({ product, kind, file: part.filename, airings: n });
        } else {
          const plan = parseFuture(rows);
          if (plan) {
            await db.query(`INSERT INTO onair_tv_plan (product, week, lines, gmail_id, received_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
                            ON CONFLICT (product, week) DO UPDATE SET lines = EXCLUDED.lines, gmail_id = EXCLUDED.gmail_id, received_at = EXCLUDED.received_at`,
              [product, plan.week, JSON.stringify(plan.lines), id, Number(data.internalDate) || Date.now()]);
          }
          out.push({ product, kind, file: part.filename, lines: plan?.lines.length || 0, week: plan?.week || null });
        }
        await M.setState(stateKey, { gmail_id: id, attachment: part.filename, at: new Date().toISOString() });
      } catch (e) {
        console.warn('[onair] sheet', part.filename, e.message);
        out.push({ product, kind, file: part.filename, error: e.message });
      }
    }
  }
  await M.setState('sheets', { ok: true, at: new Date().toISOString(), files: out });
  return out;
}

// ── views for tv.js ──────────────────────────────────────────────────────────
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (d) => { const dt = new Date(`${d}T12:00:00Z`); const wd = (dt.getUTCDay() + 6) % 7; return addDays(d, -wd); };
const DAYPARTS = [
  ['Morning', '6a–12p', 360, 719], ['Daytime', '12p–5p', 720, 1019], ['Early evening', '5p–8p', 1020, 1199], ['Prime', '8p–11p', 1200, 1379],
];
const daypartSql = `CASE ${DAYPARTS.map(([n, , a, b]) => `WHEN minute BETWEEN ${a} AND ${b} THEN '${n}'`).join(' ')} WHEN minute IS NULL THEN 'Unknown' ELSE 'Late night' END`;

/** The date ranges for Day / Week / Month (and the period before) from the newest airing. Pure. */
function rangesOf(last) {
  const wk = mondayOf(last);                                   // the agency's weeks start on Monday
  const m0 = `${last.slice(0, 7)}-01`;
  const pm = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  return {
    day: [last, last], day_prev: [addDays(last, -1), addDays(last, -1)],
    week: [wk, last], week_prev: [addDays(wk, -7), addDays(wk, -1)],
    month: [m0, last], month_prev: [pm, addDays(m0, -1)],
  };
}
const stat = (r, k) => {
  const spend = Number(r[`${k}_spend`]) || 0, orders = Number(r[`${k}_orders`]) || 0, revenue = Number(r[`${k}_rev`]) || 0, spots = Number(r[`${k}_spots`]) || 0;
  return spots || spend ? { spots, spend: Math.round(spend * 100) / 100, orders, revenue: Math.round(revenue * 100) / 100, mer: spend ? revenue / spend : null, cpo: orders ? spend / orders : null, aov: orders ? revenue / orders : null } : null;
};

/** Per creative (code): first airing + Day / Week / Month (and before); stations and dayparts per period. */
async function airingsView(product) {
  await ensureTables();
  const { rows: [lr] } = await db.query('SELECT MAX(aired_on)::text AS last, MIN(aired_on)::text AS first, COUNT(*)::int AS n FROM onair_tv_airings WHERE product = $1', [product]);
  if (!lr?.last) return null;
  const R = rangesOf(lr.last);
  const keys = Object.keys(R);
  const agg = keys.map((k, i) => {
    const a = `$${2 + i * 2}`, b = `$${3 + i * 2}`;
    return `SUM(spots) FILTER (WHERE aired_on BETWEEN ${a} AND ${b}) ${k}_spots, SUM(spend) FILTER (WHERE aired_on BETWEEN ${a} AND ${b}) ${k}_spend,
            SUM(orders) FILTER (WHERE aired_on BETWEEN ${a} AND ${b}) ${k}_orders, SUM(revenue) FILTER (WHERE aired_on BETWEEN ${a} AND ${b}) ${k}_rev`;
  }).join(',\n');
  const params = [product, ...keys.flatMap(k => R[k])];
  const [codes, firsts, stations, dayparts, daily] = await Promise.all([
    db.query(`SELECT code, MAX(name) AS name, ${agg} FROM onair_tv_airings WHERE product = $1 GROUP BY code`, params).then(r => r.rows),
    db.query(`SELECT DISTINCT ON (code) code, aired_on::text AS d, aired_time AS t, station, market FROM onair_tv_airings
               WHERE product = $1 AND spots > 0 ORDER BY code, aired_on, minute NULLS LAST`, [product]).then(r => r.rows),
    db.query(`SELECT station, MAX(market) AS market, ${agg} FROM onair_tv_airings WHERE product = $1 AND aired_on >= $12 GROUP BY station`, params).then(r => r.rows),
    db.query(`SELECT ${daypartSql} AS daypart, ${agg} FROM onair_tv_airings WHERE product = $1 AND aired_on >= $12 GROUP BY 1`, params).then(r => r.rows),
    db.query(`SELECT code, aired_on::text AS d, SUM(spend) spend, SUM(revenue) rev, SUM(orders) orders FROM onair_tv_airings
               WHERE product = $1 AND aired_on > $2::date - 21 GROUP BY code, aired_on ORDER BY aired_on`, [product, lr.last]).then(r => r.rows),
  ]);
  const firstBy = Object.fromEntries(firsts.map(f => [f.code, { date: f.d, time: f.t, station: f.station, market: f.market }]));
  const series = {};
  for (const d of daily) (series[d.code] = series[d.code] || []).push({ d: d.d, spend: Math.round(Number(d.spend)), mer: Number(d.spend) ? Number(d.rev) / Number(d.spend) : null });
  const byCode = {};
  for (const c of codes) {
    byCode[c.code] = { code: c.code, name: c.name, first: firstBy[c.code] || null, series: series[c.code] || [] };
    for (const k of keys) byCode[c.code][k] = stat(c, k);
  }
  const per = (rows, label) => Object.fromEntries(['day', 'week', 'month'].map(k => [k, rows.map(r => ({ [label]: r[label], market: r.market, ...stat(r, k), prev: stat(r, `${k}_prev`) }))
    .filter(x => x.spots || x.spend).sort((a, b) => (b.spend || 0) - (a.spend || 0))]));
  const order = Object.fromEntries([...DAYPARTS.map(d => d[0]), 'Late night', 'Unknown'].map((n, i) => [n, i]));
  const dp = per(dayparts, 'daypart');
  for (const k of Object.keys(dp)) dp[k].sort((a, b) => order[a.daypart] - order[b.daypart]);
  return {
    last: lr.last, first: lr.first, rows: lr.n, ranges: R,
    codes: byCode,
    stations: Object.fromEntries(Object.entries(per(stations, 'station')).map(([k, v]) => [k, v.slice(0, 14)])),
    dayparts: dp,
    daypart_hours: Object.fromEntries([...DAYPARTS.map(([n, h]) => [n, h]), ['Late night', '11p–6a']]),
  };
}

/** This week's booked plan (the newest Future for the week of the newest airing / today), with the creatives coming up. */
async function planView(product, airedCodes = {}) {
  await ensureTables();
  const { rows: [p] } = await db.query(`SELECT week::text AS week, lines, received_at FROM onair_tv_plan WHERE product = $1 ORDER BY week DESC LIMIT 1`, [product]);
  if (!p) return null;
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const markets = {};
  const creatives = {};
  let unassigned = 0;
  for (const l of lines) {
    const mk = l.market || 'Other';
    markets[mk] = markets[mk] || { market: mk, lines: 0, spots: 0, cost: 0 };
    markets[mk].lines += 1; markets[mk].spots += l.spots || 0; markets[mk].cost += l.cost || 0;
    if (!l.creatives?.length) { unassigned += 1; continue; }
    for (const c of l.creatives) {
      const k = norm(c.name);
      creatives[k] = creatives[k] || { name: c.name, lines: 0, stations: new Set(), cost: 0, spots: 0 };
      creatives[k].lines += 1; creatives[k].stations.add(l.station_name || l.station);
      creatives[k].cost += (l.cost || 0) / l.creatives.length; creatives[k].spots += (l.spots || 0) / l.creatives.length;
    }
  }
  // which booked creatives already aired (by name, against the RBD's creative names) — the rest are coming up.
  // The plan says 'Phil Simms "Turning 70"', the RBD says 'Turning 70': the shorter name's words inside the longer one
  // count (plurals folded); the best overlap wins.
  const words = (x) => norm(x).replace(/\b(w|with|the|a|an|and|of|for|to|v\d+|\d{2,3})\b/g, ' ').split(' ').filter(w => w.length > 1).map(w => w.replace(/s$/, ''));
  const aired = Object.values(airedCodes).map(c => ({ code: c.code, w: new Set(words(c.name)) })).filter(c => c.w.size);
  const matchOf = (name) => {
    const pw = new Set(words(name));
    let best = null;
    for (const a of aired) {
      const common = [...pw].filter(w => a.w.has(w)).length;
      const small = Math.min(pw.size, a.w.size);
      if (!small || common < small) continue;                  // every word of the shorter name must be in the other
      const score = common * 10 - Math.abs(pw.size - a.w.size);
      if (!best || score > best.score) best = { code: a.code, score };
    }
    return best?.code || null;
  };
  const total = lines.reduce((a, l) => ({ spots: a.spots + (l.spots || 0), cost: a.cost + (l.cost || 0) }), { spots: 0, cost: 0 });
  return {
    week: p.week, received_at: p.received_at, lines: lines.length, unassigned, total,
    markets: Object.values(markets).sort((a, b) => b.cost - a.cost),
    creatives: Object.values(creatives).map(c => {
      const code = matchOf(c.name);
      return { name: c.name, lines: c.lines, stations: c.stations.size, cost: Math.round(c.cost), spots: Math.round(c.spots), share: total.cost ? c.cost / total.cost : null, code, aired: !!code };
    }).sort((a, b) => b.cost - a.cost),
  };
}

module.exports = { ensureTables, parseRbd, parseFuture, ingest, airingsView, planView, rangesOf, minuteOf };
