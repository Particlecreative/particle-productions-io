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
       FROM onair_tv_mail WHERE kind = 'report' AND sent_at > NOW() - INTERVAL '75 days' ORDER BY sent_at DESC`);
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
  return {
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
  if (!sent.length) return [];
  const threads = [...new Set(sent.map(s => s.thread_id))];
  const { rows: replies } = await db.query(
    `SELECT thread_id, from_name, from_email, sent_at, body_text, parsed FROM onair_tv_mail
      WHERE thread_id = ANY($1) AND kind = 'reply' ORDER BY sent_at`, [threads]);
  const { rows: libRows } = await db.query(
    `SELECT id, title, product, code, url, market FROM library_items WHERE brand_id = $1 AND code IS NOT NULL`, [brandId]).catch(() => ({ rows: [] }));
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
      library: match ? { id: match.id, title: match.title, code } : null,
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
  const codes = [...new Set(Object.values(byProduct).flatMap(rs => (rs[0].parsed?.spots || []).map(s => s.code)))];
  const libBy = await libraryByCode(brandId, codes);
  const products = Object.values(byProduct).map(rs => productView(rs, firstSeen, libBy, today))
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
  } catch (e) { console.warn('[onair] liveCodes', e.message); }
  liveCache = { at: Date.now(), map };
  return map;
}
const clearLive = () => { liveCache = null; };

module.exports = { buildTv, liveCodes, clearLive, productView, firstSeenOf };
