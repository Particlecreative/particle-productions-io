/**
 * On Air · TV — reading the media agency's emails (LBD2C). Pure — tested in test/onair.test.js.
 *
 * The agency's daily "Particle <Product> Campaign MM/DD" email is a few lines of commentary and HTML tables copied from
 * Excel. The tables are read by their HEADERS, never by position:
 *  - "Creative Aired" + "Creative Name"      → the spots that aired this week, one row per creative (ISCI-style code,
 *                                              e.g. PM1MMH = Face Cream · Most Men :60). With a "Station" column it's
 *                                              the per-station breakdown (OTT) of the same spots.
 *  - "Network / Show"                         → the big placements she calls out (cost, orders, MER)
 *  - "Fox News Daypart"                        → cost / orders / MER per daypart × creative (Gravité)
 *  - "Date | Week of" + "… Spend"             → the combined results: a daily block for this week, then a weekly block
 *                                              ("Approximate / Total / Weekly Spend"; a row with no date — "Week to date",
 *                                              "Campaign to date" — is the totals). Blocks are told apart by their title row.
 * Replies in a thread ("Already sent to Fox News, CNN…") are read as text above the quoted part.
 */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é' };
function decode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));
}
const text = (html) => decode(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\s ]+/g, ' ').trim();

/** An HTML body as plain text with its line breaks (for replies without a text/plain part). */
const plainOf = (html) => decode(String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** <table>s → rows of cell text (nested tables are flattened into their parent cell). */
function tablesOf(html) {
  const src = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '');
  const out = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let m;
  while ((m = re.exec(src))) {
    const rows = [];
    const rr = /<tr\b[\s\S]*?<\/tr>/gi;
    let r;
    while ((r = rr.exec(m[0]))) {
      const cells = [];
      const cr = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
      let c;
      while ((c = cr.exec(r[0]))) {
        cells.push(text(c[2]));
        const span = Number((c[1].match(/colspan\s*=\s*"?(\d+)/i) || [])[1] || 1);
        for (let i = 1; i < Math.min(span, 12); i++) cells.push('');
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    out.push(rows);
  }
  return out;
}

/** "$16,740" → 16740 · "(1,200)" → -1200 · "17.55%" → 0.1755 · "" → null */
function num(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s === '—') return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const pct = s.includes('%');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || !/\d/.test(s)) return null;
  const v2 = pct ? n / 100 : n;
  return neg ? -v2 : v2;
}

/** "11/9/2026" · "11/09/26" · "11/9" (+ year) → "2026-11-09" */
function ymd(s, year) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : Number(year);
  if (!y) return null;
  if (y < 100) y += 2000;
  const mo = Number(m[1]), d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9%$/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const PRODUCTS = [[/gravit/i, 'Gravité'], [/face\s*cream/i, 'Face Cream'], [/anti[\s-]*gr[ae]y/i, 'Anti-Gray Serum'], [/hand\s*cream/i, 'Hand Cream'], [/face\s*wash/i, 'Face Wash'], [/eye/i, 'Eye Cream']];
function productOf(s) {
  for (const [re, name] of PRODUCTS) if (re.test(s || '')) return name;
  const m = String(s || '').match(/particle\s+(.+?)\s+campaign/i);
  return m ? m[1].trim() : null;
}

/** "Particle Face Cream Campaign 11/16" → { product: 'Face Cream', md: '11/16' } | null */
function reportSubject(subject) {
  const m = String(subject || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').match(/^particle\s+(.+?)\s+campaign\s+(\d{1,2}\/\d{1,2})/i);
  return m ? { product: productOf(m[1]) || m[1].trim(), md: m[2] } : null;
}

// header label → field
const SPOT_COLS = [
  [/^week of$/, 'week_of'], [/^station$/, 'station'], [/^creative aired$/, 'code'], [/^creative name$/, 'name'], [/^length$/, 'length'],
  [/^web orders?$/, 'orders'], [/^(ttl|total) rev/, 'revenue'], [/^mer$/, 'mer'], [/^cpo$/, 'cpo'], [/^aov$/, 'aov'], [/spent$/, 'spent'],
];
const PLACE_COLS = [
  [/^network/, 'network'], [/^time period$/, 'period'], [/^creative$/, 'creative'], [/^media cost$/, 'cost'], [/^orders$/, 'orders'],
  [/^revenue$/, 'revenue'], [/^mer$/, 'mer'], [/^visits$/, 'visits'], [/^cpv$/, 'cpv'],
];
const DAYPART_COLS = [
  [/daypart$/, 'daypart'], [/^creative$/, 'creative'], [/^media cost$/, 'cost'], [/^orders$/, 'orders'], [/^revenue$/, 'revenue'],
  [/^mer$/, 'mer'], [/^aov$/, 'aov'], [/^cpo$/, 'cpo'],
];
const RESULT_COLS = [
  [/^(week of|date)$/, 'date'], [/spend$/, 'spend'], [/^orders$/, 'orders'], [/^cpo$/, 'cpo'], [/^revenue$/, 'revenue'],
  [/^mer$/, 'mer'], [/^aov$/, 'aov'], [/^visits$/, 'visits'], [/^cpv$/, 'cpv'], [/^conv/, 'conv'],
];
function headerMap(row, cols) {
  const map = {};
  row.forEach((c, i) => {
    const h = norm(c);
    const hit = cols.find(([re]) => re.test(h));
    if (hit && map[hit[1]] == null) map[hit[1]] = i;
  });
  return map;
}
const NUMERIC = new Set(['orders', 'revenue', 'mer', 'cpo', 'aov', 'spent', 'cost', 'visits', 'cpv', 'spend', 'conv']);
function pick(row, map, year) {
  const o = {};
  for (const [k, i] of Object.entries(map)) {
    const v = row[i];
    if (k === 'week_of' || k === 'date') o[k] = ymd(v, year);
    else if (k === 'length') o[k] = num(v);
    else if (NUMERIC.has(k)) o[k] = num(v);
    else o[k] = String(v || '').trim() || null;
  }
  return o;
}

/** The commentary: the text before the first table (signature and quoted replies dropped). */
function noteOf(html) {
  const before = String(html || '').split(/<table\b/i)[0];
  return cleanReply(text(before.replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')));
}

/** A reply's own words: everything above "On <date> … wrote:" or the first quoted line, signature removed. */
function cleanReply(plain) {
  let s = String(plain || '').replace(/\r/g, '');
  const cut = s.search(/\n?On (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n]*\n?[^\n]*wrote:/i);
  if (cut >= 0) s = s.slice(0, cut);
  s = s.split('\n').filter(l => !/^\s*>/.test(l)).join('\n');
  // the signature: from the logo, or from the first line naming the agency; a "-Name-" sign-off line goes too
  s = s.replace(/\[image: Logo\][\s\S]*$/i, '').replace(/\n[^\n]*(lbd2c\.com|lifebrands)[\s\S]*$/i, '').replace(/\n\s*-[A-Z][a-z]+-\s*(\n[\s\S]*)?$/, '\n');
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * One report email → { product, report_date, note, spots, stations, spot_totals, placements, daily, daily_totals, weekly, lifetime }
 * year: the email's year (the subject only carries MM/DD).
 */
function parseReport({ html, subject, sentAt }) {
  const year = new Date(sentAt || Date.now()).getUTCFullYear();
  const sub = reportSubject(subject);
  const out = {
    product: sub?.product || productOf(subject),
    report_date: sub ? ymd(sub.md, year) : null,
    note: noteOf(html),
    spots: [], stations: [], spot_totals: null, placements: [], dayparts: [], daily: [], daily_totals: null, weekly: [], lifetime: null,
  };
  for (const rows of tablesOf(html)) {
    let mode = null, map = null, block = 'daily';
    for (const row of rows) {
      const h = row.map(norm);
      if (h.includes('creative aired') && h.includes('creative name')) { mode = h.includes('station') ? 'stations' : 'spots'; map = headerMap(row, SPOT_COLS); continue; }
      if (h.some(x => /^network/.test(x)) && h.includes('media cost')) { mode = 'placements'; map = headerMap(row, PLACE_COLS); continue; }
      if (h.some(x => /daypart$/.test(x)) && h.includes('media cost')) { mode = 'dayparts'; map = headerMap(row, DAYPART_COLS); continue; }
      if (/^(date|week of)$/.test(h[0] || '') && h.some(x => /spend$/.test(x))) { mode = 'results'; map = headerMap(row, RESULT_COLS); continue; }
      const title = h.filter(Boolean);
      if (title.length && title.length <= 2 && title.some(x => /results$/.test(x)) && !title.some(x => /\d/.test(x))) { block = title.some(x => /weekly/.test(x)) ? 'weekly' : 'daily'; mode = null; continue; }
      if (!mode || !map) continue;
      const o = pick(row, map, year);
      if (mode === 'spots' || mode === 'stations') {
        const isTotal = /^total$/i.test(String(o.code || '')) || (!o.code && /total/i.test(row.join(' ')));
        if (isTotal) { if (mode === 'spots') out.spot_totals = { orders: o.orders, revenue: o.revenue, mer: o.mer, cpo: o.cpo, aov: o.aov, spent: o.spent }; continue; }
        if (!o.code || !/^[A-Z0-9]{4,16}$/i.test(o.code)) continue;
        o.code = o.code.toUpperCase();
        (mode === 'spots' ? out.spots : out.stations).push(o);
      } else if (mode === 'placements') {
        if (!o.network) continue;
        const dm = o.network.match(/\s[-–]\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*$/);
        out.placements.push({ ...o, network: dm ? o.network.slice(0, dm.index).trim() : o.network, date: dm ? ymd(dm[1], year) : null });
      } else if (mode === 'dayparts') {
        if (!o.daypart || !o.creative) continue;
        out.dayparts.push(o);
      } else if (mode === 'results') {
        if (o.spend == null && o.orders == null) continue;
        const r = { date: o.date, spend: o.spend, orders: o.orders, cpo: o.cpo, revenue: o.revenue, mer: o.mer, aov: o.aov, visits: o.visits, cpv: o.cpv, conv: o.conv };
        if (!o.date) { if (block === 'weekly') out.lifetime = r; else out.daily_totals = r; continue; }
        (block === 'weekly' ? out.weekly : out.daily).push(r);
      }
    }
  }
  return out;
}

// Networks the agency names in replies ("Already sent to Fox News, CNN, MSNow, ABC, NBC, CBS and Fox Broadcast.")
const NETWORKS = ['Fox News', 'Fox Business', 'Fox Weather', 'Fox Broadcast', 'Fox Sports', 'CNN', 'HLN', 'MSNBC', 'MSNow', 'Newsmax', 'ABC', 'NBC', 'CBS', 'ESPN', 'TNT', 'TBS', 'USA', 'AMC', 'History', 'Discovery', 'HGTV', 'Golf Channel', 'Weather Channel', 'Hallmark', 'OTT', 'Roku', 'Hulu', 'YouTube TV'];
function networksIn(s) {
  const t = String(s || '');
  const found = [];
  for (const n of [...NETWORKS].sort((a, b) => b.length - a.length)) {
    const m = new RegExp(`(^|[^A-Za-z])${n.replace(/ /g, '\\s+')}(?=[^A-Za-z]|$)`, 'i').exec(t);
    if (m && !found.some(f => f.n.toLowerCase().includes(n.toLowerCase()))) found.push({ n, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.n);   // in the order the email names them
}

/** Links worth showing from a "here's a new creative" email: Dropbox, Frame.io, Drive, Vimeo, YouTube. */
function creativeLinks(s) {
  const urls = String(s || '').match(/https?:\/\/[^\s<>"')\]]+/g) || [];
  return [...new Set(urls.map(u => u.replace(/[.,;]+$/, '')))].filter(u => /dropbox\.com|frame\.io|f\.io\/|drive\.google|vimeo\.com|youtu\.?be/i.test(u)).slice(0, 8);
}

/** A new creative for the agency (not a meeting, a bus shelter or a contract): its subject or file says commercial / spot /
 *  a length / a cut — or a link is a video file. */
function isCreativeMail(subject, links = []) {
  const s = String(subject || '');
  if (/commercial|\bspot\b|\btv\b|\b\d{2}\s?s\b|:\d{2}\b|\b(cut|master|version|edit|pdp|teaser|bumper)\b/i.test(s)) return true;
  return links.some(u => /\.(mov|mp4|m4v|mxf)(\?|$)/i.test(u));
}

/** "Re: Fwd: Blindfolded 30s 2026 Commercial" → "Blindfolded 30s 2026 Commercial" */
const cleanSubject = (s) => String(s || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim();

module.exports = { plainOf, isCreativeMail, parseReport, reportSubject, cleanReply, networksIn, creativeLinks, cleanSubject, productOf, tablesOf, num, ymd };
