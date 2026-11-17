/**
 * On Air · TV — what the agency's reports say is running, built from the stored emails (lib/onair/tvMail.js):
 *  - per product: this week's spots (by code) with spend, orders, MER, CPO, AOV, the stations they ran on, what moved
 *    since the previous report (same week), which spots are NEW (first seen in a report in the last 7 days), and the
 *    TV Library commercial each code belongs to (library_items.code — the sheet's creative codes are the same codes)
 *  - the daily and weekly results, the big placements and dayparts, the agency's note
 *  - the pipeline: creatives the team sent the agency → the agency confirmed / sent to networks → first seen on air
 * liveCodes() feeds the TV Library: a commercial whose code is in this week's report is "on air".
 */
const db = require('../../db');
const lib = require('../library');
const M = require('./tvMail');
const L = require('./agencyReport');
const Sheets = require('./sheets');
const { canonicalUrl, linkKind } = require('../creative/snapshot');

const DAY = 86400000;
const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ymd = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);
const POSTER_MAX_BYTES = 1.5e9;
const words = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !['commercial', 'tv', 'the', 'final', 'new', 'version', 'v'].includes(w));
const gmailLink = (threadId) => (threadId ? `https://mail.google.com/mail/#all/${threadId}` : null);

async function reportRows() {
  await M.ensureTables();
  const { rows } = await db.query(
    `SELECT gmail_id, thread_id, product, subject, sent_at, report_date::text AS report_date, body_text, parsed
       FROM onair_tv_mail WHERE kind = 'report' AND subject !~* '^\s*(re|fwd?|fw)\s*:' AND sent_at > NOW() - INTERVAL '75 days' ORDER BY sent_at DESC`);
  // one report per product per day (a resend replaces the first)
  const seen = new Set();
  return rows.filter(r => { const k = `${r.product}|${r.report_date}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** code → the day it first showed up in a report (and whether our history reaches back far enough to call it new) */
function firstSeenOf(reports) {
  const first = {};
  for (const r of [...reports].reverse()) for (const s of r.parsed?.spots || []) if (!first[s.code]) first[s.code] = r.report_date;
  const oldest = reports.length ? reports[reports.length - 1].report_date : null;
  return { first, oldest };
}

async function libraryByCode(brandId, codes) {
  if (!codes.length) return {};
  const { rows } = await db.query(
    `SELECT li.id, li.title, li.product, li.code, li.url, li.market, li.on_air, li.file_kind, li.size_bytes, li.production_id,
            li.landing_url, li.vanity, p.project_name AS production_name
       FROM library_items li LEFT JOIN productions p ON p.id = li.production_id
      WHERE li.brand_id = $1 AND UPPER(li.code) = ANY($2)`, [brandId, codes.map(c => c.toUpperCase())]).catch(() => ({ rows: [] }));
  const by = {};
  for (const r of rows) {
    const k = r.code.toUpperCase();
    if (by[k] && by[k].market === 'US') continue;   // one file per code — the US master when there are several
    by[k] = r;
  }
  for (const k of Object.keys(by)) {
    const r = by[k];
    const dbx = ['dropbox_file', 'dropbox_folder'].includes(linkKind(r.url));
    by[k] = {
      id: r.id, title: r.title, product: r.product, url: r.url, market: r.market, production_id: r.production_id, production_name: r.production_name,
      landing_url: r.landing_url, vanity: r.vanity,
      thumb_url: ['video', 'image'].includes(r.file_kind) && dbx && !(Number(r.size_bytes) > POSTER_MAX_BYTES) ? lib.thumbUrl(r.id) : null,
    };
  }
  return by;
}

/** Same week's spot in the previous report → what moved (spend, orders, revenue) since then. */
function moved(s, prev) {
  if (!prev) return null;
  const d = (k) => (s[k] != null && prev[k] != null ? Math.round((s[k] - prev[k]) * 100) / 100 : null);
  return { spent: d('spent'), orders: d('orders'), revenue: d('revenue'), mer: d('mer') };
}

// ── Day / Week / Month (18 Nov 2026): every stored report adds its days and weeks to the history
const totalsOf = (rows) => {
  const t = rows.reduce((a, r) => ({ spend: a.spend + (r.spend || 0), orders: a.orders + (r.orders || 0), revenue: a.revenue + (r.revenue || 0), visits: a.visits + (r.visits || 0) }), { spend: 0, orders: 0, revenue: 0, visits: 0 });
  return { ...t, spend: Math.round(t.spend * 100) / 100, revenue: Math.round(t.revenue * 100) / 100, mer: t.spend ? t.revenue / t.spend : null, aov: t.orders ? t.revenue / t.orders : null, cpo: t.orders ? t.spend / t.orders : null };
};
const spotTotals = (list) => {
  const t = list.reduce((a, s) => ({ spent: a.spent + (s.spent || 0), orders: a.orders + (s.orders || 0), revenue: a.revenue + (s.revenue || 0) }), { spent: 0, orders: 0, revenue: 0 });
  return { ...t, mer: t.spent ? t.revenue / t.spent : null, cpo: t.orders ? t.spent / t.orders : null, aov: t.orders ? t.revenue / t.orders : null };
};
const ym = (d) => String(d || '').slice(0, 7);
const prevYm = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };

/** The product's history from all its reports (newest report wins a day / week it shares with an older one). Pure. */
function historyOf(rs) {
  const days = new Map(), weeks = new Map(), spotWeeks = new Map();
  for (const r of [...rs].reverse()) {                       // oldest → newest, so newer overwrite
    const p = r.parsed || {};
    for (const d of p.daily || []) if (d.date) days.set(d.date, d);
    for (const w of p.weekly || []) if (w.date) weeks.set(w.date, w);
    const wk = p.spots?.[0]?.week_of;
    if (wk) spotWeeks.set(wk, p.spots);                      // the week's spots as of its newest report
  }
  const cur = rs[0]?.parsed || {};
  const curWeek = cur.spots?.[0]?.week_of || cur.daily?.[0]?.date || null;
  if (curWeek && cur.daily_totals) weeks.set(curWeek, { ...cur.daily_totals, date: curWeek, partial: true });   // the totals row carries date: null
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-42);
  const weekly = [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-16).map(w => ({ ...w, partial: w.date === curWeek }));
  const byMonth = new Map();
  for (const w of weeks.values()) { const m = ym(w.date); byMonth.set(m, [...(byMonth.get(m) || []), w]); }
  const curMonth = ym(curWeek || daily[daily.length - 1]?.date);
  let monthly = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, ws]) => ({ month: m, weeks: ws.length, first_week: ws.map(w => w.date).sort()[0], partial: m === curMonth, ...totalsOf(ws) }));
  // the oldest month is only partly in the history (its first weeks came before the reports we have) — leave it out
  if (monthly.length > 1 && monthly[0].first_week > `${monthly[0].month}-07`) monthly = monthly.slice(1);
  monthly = monthly.slice(-6);
  return { daily, weekly, monthly, spotWeeks, curWeek, curMonth };
}

function productView(rs, firstSeen, libBy, today) {
  const cur = rs[0];
  const p = cur.parsed || {};
  const weekOf = p.spots?.[0]?.week_of || p.daily?.[0]?.date || null;
  // the previous report of the SAME week (a new week starts every count from zero)
  const prev = rs.slice(1).find(r => (r.parsed?.spots?.[0]?.week_of || r.parsed?.daily?.[0]?.date) === weekOf && r.report_date !== cur.report_date) || null;
  const prevBy = Object.fromEntries((prev?.parsed?.spots || []).map(s => [s.code, s]));
  const total = p.spot_totals?.spent || (p.spots || []).reduce((a, s) => a + (s.spent || 0), 0) || null;
  const spots = (p.spots || []).map(s => {
    const fs = firstSeen.first[s.code] || cur.report_date;
    const isNew = !!fs && fs > (firstSeen.oldest || '') && fs >= addDays(today, -7);
    return {
      ...s,
      share: total && s.spent != null ? s.spent / total : null,
      moved: moved(s, prevBy[s.code]),
      new_in_report: !!prev && !prevBy[s.code],
      first_seen: fs, is_new: isNew,
      stations: (p.stations || []).filter(x => x.code === s.code).map(x => ({ station: x.station, spent: x.spent, orders: x.orders, mer: x.mer })),
      library: libBy[s.code] || null,
    };
  }).sort((a, b) => (b.spent || 0) - (a.spent || 0));
  const daily = p.daily || [];
  const last = daily[daily.length - 1] || null, before = daily[daily.length - 2] || null;

  // Week: each spot against its own last week · Month: every spot that aired this month (weeks by their start)
  const H = historyOf(rs);
  const weekKeys = [...H.spotWeeks.keys()].sort();
  const prevWeek = weekKeys.filter(k => k < (weekOf || '')).pop() || null;
  const prevWeekBy = Object.fromEntries((H.spotWeeks.get(prevWeek) || []).map(s => [s.code, s]));
  for (const s of spots) {
    const pw = prevWeekBy[s.code];
    s.week_prev = pw ? { spent: pw.spent, orders: pw.orders, revenue: pw.revenue, mer: pw.mer, cpo: pw.cpo, aov: pw.aov } : null;
  }
  const monthSpots = (m) => {
    const by = {};
    for (const k of weekKeys.filter(k => ym(k) === m)) for (const sp of H.spotWeeks.get(k) || []) (by[sp.code] = by[sp.code] || []).push(sp);
    return by;
  };
  const curM = monthSpots(H.curMonth), prevM = monthSpots(prevYm(H.curMonth || '2000-01'));
  const curMonthTotal = spotTotals(Object.values(curM).flat());
  const month = {
    month: H.curMonth, prev_month: prevYm(H.curMonth || '2000-01'),
    spots: Object.entries(curM).map(([code, list]) => {
      const t = spotTotals(list);
      const latest = list[list.length - 1];
      const fs = firstSeen.first[code] || null;
      return {
        code, name: latest.name, length: latest.length, ...t, weeks: list.length,
        share: curMonthTotal.spent ? t.spent / curMonthTotal.spent : null,
        prev: prevM[code] ? spotTotals(prevM[code]) : null,
        first_seen: fs, is_new: !!fs && fs > (firstSeen.oldest || '') && fs >= addDays(today, -30),
        on_air_now: spots.some(x => x.code === code),
        library: libBy[code] || null,
      };
    }).sort((a, b) => (b.spent || 0) - (a.spent || 0)),
  };
  const wk = (d) => H.weekly.find(w => w.date === d) || null;
  const mo = (m) => H.monthly.find(x => x.month === m) || null;
  const periods = {
    day: last ? { label: last.date, ...last, prev: before } : null,
    week: { label: weekOf, ...(wk(weekOf) || {}), prev: prevWeek ? wk(prevWeek) : (H.weekly.filter(w => w.date < (weekOf || '')).pop() || null) },
    month: { label: H.curMonth, ...(mo(H.curMonth) || {}), prev: mo(prevYm(H.curMonth || '2000-01')) },
  };
  return {
    history: { daily: H.daily, weekly: H.weekly, monthly: H.monthly },
    periods,
    month,
    previous_week: prevWeek,
    product: cur.product,
    report_date: cur.report_date,
    received_at: cur.sent_at,
    previous_report: prev ? prev.report_date : null,
    week_of: weekOf,
    note: { text: cur.body_text || '', at: cur.sent_at, link: gmailLink(cur.thread_id) },
    week: {
      spent: p.daily_totals?.spend ?? total, orders: p.daily_totals?.orders ?? p.spot_totals?.orders ?? null,
      revenue: p.daily_totals?.revenue ?? p.spot_totals?.revenue ?? null, mer: p.daily_totals?.mer ?? p.spot_totals?.mer ?? null,
      aov: p.daily_totals?.aov ?? p.spot_totals?.aov ?? null, cpo: p.daily_totals?.cpo ?? p.spot_totals?.cpo ?? null,
      visits: p.daily_totals?.visits ?? null,
    },
    last_day: last ? { ...last, vs: before ? { spend: last.spend != null && before.spend != null ? last.spend - before.spend : null, orders: last.orders != null && before.orders != null ? last.orders - before.orders : null, mer: last.mer != null && before.mer != null ? Math.round((last.mer - before.mer) * 100) / 100 : null } : null } : null,
    spots,
    daily,
    weekly: p.weekly || [],
    lifetime: p.lifetime || null,
    placements: p.placements || [],
    dayparts: p.dayparts || [],
    reports: rs.slice(0, 14).map(r => ({ date: r.report_date, at: r.sent_at, spent: r.parsed?.daily_totals?.spend ?? r.parsed?.spot_totals?.spent ?? null, mer: r.parsed?.daily_totals?.mer ?? r.parsed?.spot_totals?.mer ?? null })),
  };
}

/** Creatives the team sent the agency, what the agency answered, and whether they're on air yet. */
async function pipeline(brandId, firstSeen, liveByCode) {
  const { rows: sent } = await db.query(
    `SELECT gmail_id, thread_id, product, subject, from_name, from_email, sent_at, body_text, links
       FROM onair_tv_mail WHERE kind = 'creative_sent' AND sent_at > NOW() - INTERVAL '60 days' ORDER BY sent_at DESC`);
  // only real creatives (older rows could be a meeting or a bus-shelter buy with a Drive link)
  for (let i = sent.length - 1; i >= 0; i--) if (!L.isCreativeMail(sent[i].subject, Array.isArray(sent[i].links) ? sent[i].links : [])) sent.splice(i, 1);
  if (!sent.length) return [];
  const threads = [...new Set(sent.map(s => s.thread_id))];
  const { rows: replies } = await db.query(
    `SELECT thread_id, from_name, from_email, sent_at, body_text, parsed FROM onair_tv_mail
      WHERE thread_id = ANY($1) AND kind = 'reply' ORDER BY sent_at`, [threads]);
  const { rows: libRows } = await db.query(
    `SELECT li.id, li.title, li.product, li.code, li.url, li.market, li.production_id, p.project_name AS production_name
       FROM library_items li LEFT JOIN productions p ON p.id = li.production_id
      WHERE li.brand_id = $1 AND li.code IS NOT NULL`, [brandId]).catch(() => ({ rows: [] }));
  const byUrl = new Map(libRows.map(r => [canonicalUrl(r.url) || r.url, r]));
  const out = [];
  const seenThread = new Set();
  for (const s of sent) {
    if (seenThread.has(s.thread_id)) continue;   // a thread = one creative; the first email in it is the hand-off
    seenThread.add(s.thread_id);
    const title = L.cleanSubject(s.subject);
    const links = Array.isArray(s.links) ? s.links : [];
    // which library commercial: the same file link, else every word of the library title is in the subject (longest wins)
    let match = links.map(u => byUrl.get(canonicalUrl(u) || u)).find(Boolean) || null;
    if (!match) {
      const tw = new Set(words(title));
      match = libRows.filter(r => { const w = words(r.title); return w.length && w.every(x => tw.has(x)); })
        .sort((a, b) => words(b.title).length - words(a.title).length || (a.market === 'US' ? -1 : 1))[0] || null;
    }
    const agency = replies.filter(r => r.thread_id === s.thread_id && String(r.from_email || '').endsWith(`@${M.AGENCY}`));
    const networks = [...new Set(agency.flatMap(r => r.parsed?.networks || []))];
    const code = match?.code?.toUpperCase() || null;
    const airedSince = code ? firstSeen.first[code] || null : null;
    const firstSent = sent.filter(x => x.thread_id === s.thread_id).sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))[0];
    out.push({
      title, product: s.product || match?.product || null,
      sent_by: firstSent.from_name || firstSent.from_email, sent_at: firstSent.sent_at, links, note: String(firstSent.body_text || '').slice(0, 600),
      link: gmailLink(s.thread_id),
      agency: agency.map(r => ({ by: r.from_name || r.from_email, at: r.sent_at, text: String(r.body_text || '').slice(0, 400), networks: r.parsed?.networks || [] })),
      networks,
      library: match ? { id: match.id, title: match.title, code, production_id: match.production_id || null, production_name: match.production_name || null } : null,
      on_air_since: airedSince && airedSince >= ymd(firstSent.sent_at) ? airedSince : (code && liveByCode.has(code) ? airedSince : null),
      status: code && liveByCode.has(code) ? 'on_air' : agency.length ? 'confirmed' : 'sent',
    });
  }
  return out;
}

/** The whole TV side of On Air. */
async function buildTv(brandId = 'particle') {
  const today = todayIL();
  const [reports, google, sync] = await Promise.all([reportRows(), M.googleStatus(), M.getState('tv_sync')]);
  const byProduct = {};
  for (const r of reports) (byProduct[r.product || 'Other'] = byProduct[r.product || 'Other'] || []).push(r);
  const firstSeen = firstSeenOf(reports);
  // the agency's Excel files: every airing (RBD) and this week's booked plan (Future), per product
  const names = Object.keys(byProduct);
  const air = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await Sheets.airingsView(n).catch((e) => { console.warn('[onair] airings', e.message); return null; })])));
  const codes = [...new Set([
    ...Object.values(byProduct).flatMap(rs => rs.flatMap(r => (r.parsed?.spots || []).map(s => s.code))),
    ...Object.values(air).flatMap(a => Object.keys(a?.codes || {})),
  ])];
  const libBy = await libraryByCode(brandId, codes);
  const plans = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await Sheets.planView(n, air[n]?.codes || {}).catch(() => null)])));
  const products = Object.values(byProduct).map(rs => withSheets(productView(rs, firstSeen, libBy, today), air[rs[0].product || 'Other'], plans[rs[0].product || 'Other'], libBy, today))
    .sort((a, b) => (b.week.spent || 0) - (a.week.spent || 0));
  const live = await liveCodes(brandId, { reports });
  const [pipe, notes] = await Promise.all([
    pipeline(brandId, firstSeen, live).catch((e) => { console.warn('[onair] pipeline', e.message); return []; }),
    db.query(`SELECT kind, product, subject, from_name, from_email, sent_at, body_text, parsed, thread_id FROM onair_tv_mail
               WHERE (kind = 'report' OR (kind = 'reply' AND from_email LIKE $1)) AND sent_at > NOW() - INTERVAL '21 days'
               ORDER BY sent_at DESC LIMIT 40`, [`%@${M.AGENCY}`]).then(r => r.rows).catch(() => []),
  ]);
  return {
    today, generated_at: new Date().toISOString(),
    google, sync,
    products,
    pipeline: pipe,
    notes: notes.filter(n => String(n.body_text || '').trim()).map(n => ({
      kind: n.kind, product: n.product, subject: L.cleanSubject(n.subject), by: n.from_name || n.from_email, at: n.sent_at,
      text: String(n.body_text || '').slice(0, 900), networks: n.parsed?.networks || [], link: gmailLink(n.thread_id),
    })),
  };
}

/**
 * The Excel side on a product: per period (day / week / month) every creative that aired with its real numbers and the
 * period before, its first airing (date · time · station), plus where (stations) and when (dayparts) it works and the
 * booked plan. Lisa's tables stay the source of the totals; the airings give the per-creative detail.
 */
function withSheets(v, air, plan, libBy, today) {
  if (plan) {
    for (const c of plan.creatives) c.library = c.code ? libBy[c.code] || null : null;
    v.plan = plan;
  }
  if (!air) return v;
  const list = (k) => {
    const rows = Object.values(air.codes).filter(c => c[k] && (c[k].spots || c[k].spend));
    const total = rows.reduce((a, c) => a + (c[k].spend || 0), 0);
    return rows.map(c => ({
      code: c.code, name: c.name, length: null,
      spent: c[k].spend, orders: c[k].orders, revenue: c[k].revenue, mer: c[k].mer, cpo: c[k].cpo, aov: c[k].aov, spots: c[k].spots,
      share: total ? c[k].spend / total : null, prev: c[`${k}_prev`] || null,
      first: c.first, first_seen: c.first?.date || null,
      is_new: !!c.first?.date && c.first.date >= addDays(air.last, -6),
      series: c.series, library: libBy[c.code] || null,
    })).sort((a, b) => (b.spent || 0) - (a.spent || 0));
  };
  v.air = {
    last: air.last, first: air.first, ranges: air.ranges,
    spots: { day: list('day'), week: list('week'), month: list('month') },
    stations: air.stations, dayparts: air.dayparts, daypart_hours: air.daypart_hours,
  };
  // the report's spot cards get their first airing too
  for (const s of v.spots) { const c = air.codes[s.code]; if (c) { s.first = c.first; s.air = { day: c.day, day_prev: c.day_prev }; } }
  return v;
}

let liveCache = null; // { at, map }
/** code → { product, report_date, spent, orders, mer, first_seen } for the spots in each product's latest report (≤ 9 days old). */
async function liveCodes(brandId = 'particle', { reports = null } = {}) {
  if (!reports && liveCache && Date.now() - liveCache.at < 5 * 60 * 1000) return liveCache.map;
  const map = new Map();
  try {
    const rs = reports || await reportRows();
    const firstSeen = firstSeenOf(rs);
    const latest = {};
    for (const r of rs) if (!latest[r.product]) latest[r.product] = r;
    const cutoff = addDays(todayIL(), -9);
    for (const r of Object.values(latest)) {
      if (!r.report_date || r.report_date < cutoff) continue;
      for (const s of r.parsed?.spots || []) {
        if (!(s.spent > 0) && !(s.orders > 0)) continue;
        map.set(s.code, { product: r.product, report_date: r.report_date, spent: s.spent, orders: s.orders, mer: s.mer, first_seen: firstSeen.first[s.code] || null });
      }
    }
    // and anything the RBD shows airing in the last 8 days
    await Sheets.ensureTables();
    const { rows: recent } = await db.query(
      `SELECT code, product, MAX(aired_on)::text AS last, MIN(aired_on)::text AS first, SUM(spend) spend, SUM(orders) orders, SUM(revenue) rev
         FROM onair_tv_airings WHERE aired_on > (CURRENT_DATE - 8) GROUP BY code, product`);
    for (const r of recent) if (!map.has(r.code)) map.set(r.code, { product: r.product, report_date: r.last, spent: Number(r.spend), orders: Number(r.orders), mer: Number(r.spend) ? Number(r.rev) / Number(r.spend) : null, first_seen: r.first });
  } catch (e) { console.warn('[onair] liveCodes', e.message); }
  liveCache = { at: Date.now(), map };
  return map;
}
const clearLive = () => { liveCache = null; };

module.exports = { buildTv, liveCodes, clearLive, productView, firstSeenOf, historyOf, withSheets };
