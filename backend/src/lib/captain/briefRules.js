/**
 * Captain Caption — the brief pre-flight checks that need no AI: reading speed, fit, offer facts, price math,
 * cross-version consistency, required elements, and the cross-brief checks of a Holiday Builder batch.
 * Pure functions (no database, no network) — tested in backend/test/captain.test.js.
 *
 * An issue: { line_id, found, fix, type, severity: must_fix | should_fix | info, rule, suggestion? }
 * line_id is null for issues about the whole brief (e.g. "no CTA").
 */
const L = require('./labels');

const ON_SCREEN = (l) => l.kind !== 'vo';
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v, max = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameName = (a, b) => String(a || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() === String(b || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fmtS = (n) => (Math.round(n * 10) / 10).toString();
const money = (n) => `$${Number(n).toFixed(2)}`;

// ── input ────────────────────────────────────────────────────────────────────
/** "V1", "v2", 3, "Version 2" → "V2"; empty or "all" → null (the line is on every version). */
function normVersion(v) {
  const m = String(v ?? '').match(/(\d{1,2})/);
  return m && !/^\s*(all|\*)\s*$/i.test(String(v)) ? `V${Number(m[1])}` : null;
}
/** "9:16", "9×16", "9X16", "1080x1920" → "9x16"; empty or "all" → null. */
function normSize(s) {
  const t = String(s ?? '').trim();
  if (!t || /^(all|\*)$/i.test(t)) return null;
  const m = t.match(/(\d{1,4}(?:\.\d+)?)\s*[x×:X]\s*(\d{1,4})/);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a > 50 && b > 50 ? L.sizeFromPixels(a, b) : `${a}x${b}`;
}
/** A date as YYYY-MM-DD, or null. */
function normDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}
/** 30, "30%", 0.3 → 30 */
function normTier(t) {
  const n = num(String(t ?? '').replace('%', ''));
  if (n === null) return null;
  return n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n);
}

const KIND_ALIASES = { voiceover: 'vo', 'voice-over': 'vo', voice: 'vo', caption: 'super', text: 'super', button: 'cta', 'cta button': 'cta', title: 'headline' };
function normKind(k) {
  const s = String(k || 'super').trim().toLowerCase();
  return KIND_ALIASES[s] || s.replace(/[^a-z_]/g, '') || 'super';
}

/** Validate and clean what Medium sends. Returns { errors, req }. */
function normalizeRequest(body = {}, cfg = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const max = cfg.max_lines || 300;
  const errors = [];
  const raw = Array.isArray(b.lines) ? b.lines : [];
  if (!raw.length) errors.push('lines[] is required — every word that will appear on screen or be spoken');
  if (raw.length > max) errors.push(`At most ${max} lines per brief`);
  const seen = new Set();
  const lines = raw.slice(0, max).map((l, n) => {
    let id = String(l?.id ?? `l${n + 1}`).slice(0, 60) || `l${n + 1}`;
    if (seen.has(id)) id = `${id}_${n + 1}`;
    seen.add(id);
    return {
      id, kind: normKind(l?.kind), text: String(l?.text ?? '').slice(0, 3000),
      version: normVersion(l?.version), size: normSize(l?.size),
      start: num(l?.start), end: num(l?.end), lang: String(l?.lang || 'en').toLowerCase().slice(0, 12),
    };
  });
  if (raw.length && !lines.some(l => l.text.trim())) errors.push('Every line is empty');
  const o = b.offer && typeof b.offer === 'object' ? b.offer : null;
  const offer = o && (o.code || o.tier || o.ends) ? { tier: normTier(o.tier), code: str(o.code, 40)?.toUpperCase().replace(/\s+/g, '') || null, ends: normDate(o.ends) } : null;
  return {
    errors,
    req: {
      brief_id: str(b.brief_id, 120), name: str(b.name, 300), brand: str(b.brand, 60), lane: str(b.lane, 40),
      product: str(b.product, 120), campaign: str(b.campaign, 120), board: ['video', 'design'].includes(b.board) ? b.board : null,
      offer, layout_ref: str(b.layout_ref, 120), article_text: b.article_text ? String(b.article_text).slice(0, 60000) : null,
      flags: { before_after: !!(b.flags?.before_after ?? b.before_after) },
      author: str(b.author || b.requested_by, 120), lines,
    },
  };
}

// ── text helpers ─────────────────────────────────────────────────────────────
const wordsOf = (text) => String(text || '').trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
const charsOf = (text) => [...String(text || '').trim()].length;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const pad = (n) => String(n).padStart(2, '0');

/**
 * Dates written in copy: "Dec 1", "December 21st", "21 December", "Ends 12/21", "until 21.12". US month/day for numbers.
 * The year comes from the text, else from `year`. Returns [{ raw, iso, style }].
 */
function datesIn(text, year = new Date().getUTCFullYear()) {
  const s = String(text || '');
  const out = [];
  const push = (raw, m, d, y, style, index) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const yy = y ? (y < 100 ? 2000 + y : y) : year;
    out.push({ raw, iso: `${yy}-${pad(m)}-${pad(d)}`, style, index });
  };
  const monthNum = (w) => MONTHS.indexOf(w.toLowerCase().slice(0, 3)) + 1;
  let m;
  const a = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi');
  while ((m = a.exec(s))) push(m[0], monthNum(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, m[1].length > 4 && !/^sept$/i.test(m[1]) ? 'long' : 'short', m.index);
  const b = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b\\.?(?:,?\\s+(\\d{4}))?`, 'gi');
  while ((m = b.exec(s))) if (!out.some(x => Math.abs(x.index - m.index) < 4)) push(m[0], monthNum(m[2]), Number(m[1]), m[3] ? Number(m[3]) : null, 'day_first', m.index);
  const c = /\b(?:ends?|ending|until|till|thru|through|by|on|before)\s+(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/gi;
  while ((m = c.exec(s))) push(m[0].replace(/^\S+\s+/, ''), Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, 'numeric', m.index);
  return out;
}
/** Write `iso` the way the brief wrote the date it replaces. */
function fmtDateLike(iso, style = 'short') {
  const [, mo, d] = String(iso).split('-').map(Number);
  const long = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mo - 1];
  const short = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][mo - 1];
  if (style === 'long') return `${long} ${d}`;
  if (style === 'day_first') return `${d} ${long}`;
  if (style === 'numeric') return `${mo}/${d}`;
  return `${short} ${d}`;
}

/** Discount codes in copy: any code from the offer calendar, plus whatever follows "code" ("USE CODE: XMAS30"). */
function codesIn(text, known = []) {
  const s = String(text || '');
  const out = new Set();
  for (const k of known) if (k && new RegExp(`(^|[^A-Za-z0-9])${esc(k)}([^A-Za-z0-9]|$)`, 'i').test(s)) out.add(k.toUpperCase());
  const re = /\bcode\b\s*[:\-–]?\s*["“']?([A-Z][A-Z0-9]{2,19})\b/gi;
  let m;
  while ((m = re.exec(s))) if (/\d/.test(m[1]) || m[1] === m[1].toUpperCase()) out.add(m[1].toUpperCase());
  return [...out];
}
const hasCode = (text, code) => new RegExp(`(^|[^A-Za-z0-9])${esc(code)}([^A-Za-z0-9]|$)`, 'i').test(String(text || ''));

/** Money amounts: "$41.30", "$59" → [41.3, 59]. */
function amountsIn(text) {
  return [...String(text || '').matchAll(/\$\s?(\d{1,5}(?:[.,]\d{3})*(?:\.\d{1,2})?)/g)].map(m => ({ raw: m[0], value: Number(m[1].replace(/,/g, '')) }));
}
/** "30% OFF", "save 25%" → 30 / 25 (a discount, not a stat like "97% of users"). */
function discountsIn(text) {
  const s = String(text || '');
  const out = [];
  for (const m of s.matchAll(/(\d{1,2})\s?%\s*(?:off|discount)\b/gi)) out.push({ raw: m[0], value: Number(m[1]) });
  for (const m of s.matchAll(/\b(?:save|get|take|extra)\s+(?:an?\s+)?(?:extra\s+)?(\d{1,2})\s?%/gi)) if (!out.some(x => x.value === Number(m[1]))) out.push({ raw: m[0], value: Number(m[1]) });
  return out;
}
/** "30-Day Money-Back Guarantee" → 30 */
function guaranteeDays(text) {
  const m = String(text || '').match(/(\d{1,3})[\s-]*days?\s+(?:money[\s-]*back\s+|risk[\s-]*free\s+|satisfaction\s+)?guarantee/i);
  return m ? Number(m[1]) : null;
}

const PLACEHOLDER_RE = /\[(?:[A-Z][A-Z0-9 _/-]{1,30})\]|\bX{2,}\s?%|\$\s?0{2,}\b|\$X+\b|\bTBD\b|\bTBC\b|lorem ipsum|\b(?:headline|copy|text) (?:here|goes here)\b/i;
// A call to action in the copy — including the magazine lanes' "See The Full List" / "Read The Article"
const CTA_RE = /\b(?:shop now|buy now|order now|shop the (?:sale|set|bundle)|get (?:yours|it|started|\d+% off)|try (?:it|now|particle|risk[- ]free)|claim (?:yours|your|the offer)|learn more|read more|see more|find out|take the .{0,20}quiz|tap|click|discover more|(?:see|read|view|check out) (?:the )?(?:full |whole )?(?:list|ranking|rankings|winners?|article|story|guide|top \d+)|see (?:why|which|who|how)|(?:see|read) (?:it|now))\b|[→➜➔»]/i;
const BA_RE = /\bbefore\s*(?:&|and|\/|\+|-)\s*after\b|\bB\s?&\s?A\b/i;
const DISCLAIMER_RE = /results (?:may )?vary|individual results|not typical|results not guaranteed|unretouched|unedited|real (?:customer|user) results?|actual results/i;
const CURRENCY_RE = /[$€£₪¥]|\b(?:USD|EUR|GBP|ILS|dollars?|euros?|pounds? sterling)\b/i;

// ── per-brief checks ─────────────────────────────────────────────────────────
function readingSpeed(lines, bc = {}) {
  const maxOn = bc.max_words_per_second || 3, maxVo = bc.vo_max_words_per_second || 3.5;
  const issues = [];
  for (const l of lines) {
    if (l.start === null || l.end === null) continue;
    const dur = l.end - l.start;
    if (dur <= 0) {
      issues.push({ line_id: l.id, found: `${fmtS(l.start)}–${fmtS(l.end)}s`, fix: 'The end time must be after the start time', type: 'timing', severity: 'must_fix', rule: 'Timing' });
      continue;
    }
    const words = wordsOf(l.text);
    const wps = words.length / dur;
    if (l.kind === 'vo') {
      if (wps > maxVo + 1e-9) {
        issues.push({ line_id: l.id, found: `${words.length} words in ${fmtS(dur)}s (${wps.toFixed(1)}/s)`, fix: `Give it ${fmtS(words.length / maxVo)}s, or cut to ${Math.floor(maxVo * dur)} words`, type: 'vo_speed', severity: 'should_fix', rule: `VO at most ~${maxVo} words/second` });
      }
      continue;
    }
    if (wps <= maxOn + 1e-9) continue;
    const per = Math.max(1, Math.floor(maxOn * dur));
    const parts = Math.ceil(words.length / per);
    const chunk = Math.ceil(words.length / parts);
    const split = [];
    for (let k = 0; k < parts; k++) {
      const w = words.slice(k * chunk, (k + 1) * chunk);
      if (w.length) split.push({ start: Number((l.start + k * dur).toFixed(2)), end: Number((l.start + (k + 1) * dur).toFixed(2)), text: w.join(' ') });
    }
    const span = split.map(p => `${fmtS(p.start)}–${fmtS(p.end)}s`).join(' / ');
    issues.push({
      line_id: l.id, found: `${words.length} words in ${fmtS(dur)}s`, fix: `Split across ${span} (≤${per} words each), or cut to ${per} words`,
      type: 'reading_speed', severity: 'must_fix', rule: `Max ~${maxOn} words/second`, suggestion: { split },
    });
  }
  return issues;
}

/** "headline 9x16: 32" / "subtitle, 4x5, 60" / "9x16 32" (no element = headline) / "cta * 18" → [{ kind, size, max }]. */
function parseLimits(input) {
  if (Array.isArray(input)) {
    return input.map(x => ({ kind: normKind(x.kind || 'headline'), size: x.size === '*' ? '*' : normSize(x.size) || '*', max: Math.round(num(x.max)) }))
      .filter(x => x.max > 0);
  }
  const out = [];
  for (const line of String(input || '').split(/\n|;/)) {
    const m = line.trim().match(/^(?:([a-z][a-z _-]*?)\s*[,:·]?\s+)?(\*|all|\d{1,4}\s*[x×:X]\s*\d{1,4})\s*[,:·=]?\s*(\d{1,4})\s*(?:chars?|characters)?\.?$/i);
    if (!m) continue;
    const size = /^(\*|all)$/i.test(m[2]) ? '*' : normSize(m[2]);
    out.push({ kind: normKind(m[1] || 'headline'), size: size || '*', max: Number(m[3]) });
  }
  return out;
}
function pickLimit(limits, kind, size) {
  const rank = (x) => (x.kind === kind ? 0 : 2) + (x.size === size ? 0 : 1);
  const fits = (limits || []).filter(x => (x.kind === kind || x.kind === '*' || x.kind === 'any') && (x.size === '*' || !size || x.size === size));
  if (!fits.length) return null;
  if (!size) return fits.filter(x => x.kind === kind || x.kind === '*').sort((a, b) => a.max - b.max)[0] || null;   // a line on every size must fit the tightest
  return fits.sort((a, b) => rank(a) - rank(b))[0];
}
function fit(lines, req, facts) {
  if (!req.layout_ref) return { issues: [], notes: [] };
  const entry = (facts.layoutLimits || []).find(x => sameName(x.title, req.layout_ref));
  const limits = entry ? parseLimits(entry.data?.limits || entry.content) : [];
  if (!limits.length) return { issues: [], notes: [`No layout limits stored for “${req.layout_ref}” — fit not checked (add them in Brain → Layout limits)`] };
  const issues = [];
  for (const l of lines.filter(ON_SCREEN)) {
    const lim = pickLimit(limits, l.kind, l.size);
    const n = charsOf(l.text);
    if (lim && n > lim.max) {
      const where = l.size || (lim.size !== '*' ? lim.size : null);
      issues.push({ line_id: l.id, found: `${n} characters`, fix: `At most ${lim.max} for the ${l.kind}${where ? ` in ${where}` : ''} — cut ${n - lim.max}`, type: 'fit', severity: 'must_fix', rule: `Layout limit: ${entry.title}` });
    }
  }
  return { issues, notes: [] };
}

/** The offer-calendar entry for this brief: by campaign name; only when no campaign is given, by the offer code. */
function offerEntry(req, facts) {
  const offers = facts.offers || [];
  if (req.campaign) return offers.find(x => sameName(x.title, req.campaign) || (x.data?.aliases || []).some(a => sameName(a, req.campaign))) || null;
  return (req.offer?.code && offers.find(x => x.data?.code && x.data.code.toUpperCase() === req.offer.code)) || null;
}

function offerFacts(lines, req, facts, { today = new Date().toISOString().slice(0, 10), bc = {} } = {}) {
  const issues = [], notes = [];
  const offers = facts.offers || [];
  const o = req.offer;
  const entry = offerEntry(req, facts);
  const ed = entry?.data || {};
  if (o) {
    if (!entry) {
      notes.push(req.campaign ? `No offer-calendar entry for “${req.campaign}” — code and end date not verified (add it in Brain → Offer calendar)` : `${o.code ? `Code ${o.code} isn't` : "This offer isn't"} in the offer calendar — not verified`);
      const other = req.campaign && o.code && offers.find(x => x.data?.code?.toUpperCase() === o.code);
      if (other) issues.push({ line_id: null, found: o.code, fix: `the ${req.campaign} code`, type: 'leftover_code', severity: 'must_fix', rule: `${o.code} is the ${other.title} code` });
    } else {
      if (ed.code && o.code && o.code !== ed.code.toUpperCase()) {
        const other = offers.find(x => x !== entry && x.data?.code?.toUpperCase() === o.code);
        issues.push({ line_id: null, found: o.code, fix: ed.code.toUpperCase(), type: 'offer_code', severity: 'must_fix', rule: `Offer calendar: ${entry.title}${other ? ` (${o.code} is the ${other.title} code)` : ''}` });
      }
      if (ed.ends && o.ends && o.ends !== ed.ends) issues.push({ line_id: null, found: o.ends, fix: ed.ends, type: 'offer_date', severity: 'must_fix', rule: `Offer calendar: ${entry.title} ends ${ed.ends}` });
      if ((ed.tiers || []).length && o.tier !== null && !ed.tiers.includes(o.tier)) issues.push({ line_id: null, found: `${o.tier}%`, fix: ed.tiers.map(t => `${t}%`).join(' or '), type: 'offer_tier', severity: 'must_fix', rule: `Offer calendar: ${entry.title} tiers` });
      if (ed.ends && ed.ends < today) issues.push({ line_id: null, found: entry.title, fix: `This campaign ended ${ed.ends} — check the campaign`, type: 'offer_date', severity: 'should_fix', rule: 'Offer calendar' });
    }
  }
  const code = o?.code || ed.code?.toUpperCase() || null;
  const ends = o?.ends || ed.ends || null;
  const tier = o?.tier ?? ((ed.tiers || []).length === 1 ? ed.tiers[0] : null);
  const known = offers.map(x => x.data?.code).filter(Boolean).map(c => c.toUpperCase());
  const year = Number((ends || today).slice(0, 4));
  const otherEnds = new Map(offers.filter(x => x !== entry && x.data?.ends && (!ends || x.data.ends !== ends)).map(x => [x.data.ends, x.title]));

  for (const l of lines) {
    // codes and dates left over from another campaign, or simply different from this one
    for (const c of codesIn(l.text, known)) {
      if (code && c !== code) {
        const other = offers.find(x => x.data?.code?.toUpperCase() === c);
        issues.push({ line_id: l.id, found: c, fix: code, type: other ? 'leftover_code' : 'offer_code', severity: 'must_fix', rule: other ? `Leftover code from ${other.title}` : 'The code must match the campaign', suggestion: { replace: [c, code] } });
      } else if (!code) {
        const other = offers.find(x => x.data?.code?.toUpperCase() === c && x.data?.ends && x.data.ends < today);
        if (other) issues.push({ line_id: l.id, found: c, fix: 'the current campaign code', type: 'leftover_code', severity: 'must_fix', rule: `${c} is the ${other.title} code (ended ${other.data.ends})` });
      }
    }
    for (const d of datesIn(l.text, year)) {
      if (ends && d.iso !== ends) {
        const fixText = fmtDateLike(ends, d.style);
        issues.push({ line_id: l.id, found: d.raw, fix: fixText, type: otherEnds.has(d.iso) ? 'leftover_date' : 'offer_date', severity: 'must_fix', rule: otherEnds.has(d.iso) ? `Leftover date from ${otherEnds.get(d.iso)}` : `The sale ends ${ends}`, suggestion: { replace: [d.raw, fixText] } });
      }
    }
    // the discount percentage in the copy must be the offer's tier
    if (tier !== null) {
      for (const d of discountsIn(l.text)) if (d.value !== tier) issues.push({ line_id: l.id, found: d.raw, fix: d.raw.replace(String(d.value), String(tier)), type: 'offer_tier', severity: 'must_fix', rule: `This offer is ${tier}% off`, suggestion: { replace: [d.raw, d.raw.replace(String(d.value), String(tier))] } });
    }
  }

  // price math: sale = list × (1 − tier); the list price itself (strikethrough) and the saving are fine too
  const priceItem = req.product && (facts.prices || []).find(p => sameName(p.title, req.product) || (p.data?.aliases || []).some(a => sameName(a, req.product)));
  const list = num(priceItem?.data?.list_price);
  const tol = bc.price_tolerance ?? 0.01;
  const priced = lines.filter(isPriceLine);
  if (priced.length) {
    if (!list) notes.push(req.product ? `No list price for ${req.product} in the Brain — prices not checked (add it in Brain → Price list)` : 'No product given — prices not checked');
    else if (tier === null) notes.push('No discount tier given — only the list price could be checked');
    for (const l of priced) {
      if (!list) break;
      const sale = Math.round(list * (100 - (tier ?? 0))) / 100;
      for (const a of amountsIn(l.text)) {
        const ok = [list, ...(tier !== null ? [sale, Math.round((list - sale) * 100) / 100] : [])].some(v => Math.abs(v - a.value) <= tol + 1e-9);
        if (!ok) issues.push({ line_id: l.id, found: a.raw, fix: tier !== null ? money(sale) : money(list), type: 'price', severity: 'must_fix', rule: tier !== null ? `List ${money(list)} × (1 − ${tier}%) = ${money(sale)}` : `List price ${money(list)}`, suggestion: { replace: [a.raw, tier !== null ? money(sale) : money(list)] } });
      }
    }
  }
  return { issues, notes, entry, expected: { code, ends, tier, list } };
}

const NOT_A_PRICE_RE = /\b(?:over|above|orders? (?:of|over)|free shipping|minimum|min\.|worth|value)\b/i;
/** A line that states a price ("Now $41.30", a price element) — not "Free shipping over $50". */
const isPriceLine = (l) => !(l.lang && l.lang !== 'en') && amountsIn(l.text).length > 0 && !NOT_A_PRICE_RE.test(l.text)
  && (l.kind === 'price' || /\b(?:now|only|just|for|was|reg(?:ular)?\.?|price)\b/i.test(l.text));

function translations(lines) {
  const issues = [];
  for (const l of lines) {
    if (!((l.lang && l.lang !== 'en') || l.kind === 'translation')) continue;
    const m = String(l.text).match(CURRENCY_RE);
    if (m) issues.push({ line_id: l.id, found: m[0], fix: 'Use the percentage only', type: 'translation_currency', severity: 'must_fix', rule: 'Translations show percentages only — no currency' });
  }
  return issues;
}

function placeholders(lines) {
  const issues = [];
  for (const l of lines) {
    const m = String(l.text).match(PLACEHOLDER_RE);
    if (m) issues.push({ line_id: l.id, found: m[0], fix: /price/i.test(m[0]) ? 'Fill in the price' : 'Replace with the real copy', type: 'placeholder', severity: 'must_fix', rule: 'No placeholders' });
  }
  return issues;
}

/** Code, end date and guarantee identical on every version and size; a code/date for every version × size. */
function crossVersion(lines, req, facts, expected = {}) {
  const issues = [];
  const known = (facts.offers || []).map(x => x.data?.code).filter(Boolean);
  const majority = (vals) => { const c = {}; for (const v of vals) c[v] = (c[v] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
  const year = Number((expected.ends || new Date().toISOString()).slice(0, 4));

  // codes / dates differing between lines — only when there is no expected value (otherwise offerFacts reports them)
  if (!expected.code) {
    const found = lines.flatMap(l => codesIn(l.text, known).map(c => ({ l, c })));
    const want = majority(found.map(x => x.c));
    for (const x of found) if (want && x.c !== want) issues.push({ line_id: x.l.id, found: x.c, fix: want, type: 'inconsistent_code', severity: 'must_fix', rule: 'The same code on every version and size', suggestion: { replace: [x.c, want] } });
  }
  if (!expected.ends) {
    const found = lines.flatMap(l => datesIn(l.text, year).map(d => ({ l, d })));
    const want = majority(found.map(x => x.d.iso));
    for (const x of found) if (want && x.d.iso !== want) issues.push({ line_id: x.l.id, found: x.d.raw, fix: fmtDateLike(want, x.d.style), type: 'inconsistent_date', severity: 'must_fix', rule: 'The same end date on every version and size' });
  }
  const g = lines.map(l => ({ l, days: guaranteeDays(l.text) })).filter(x => x.days);
  const gWant = Number(majority(g.map(x => x.days)));
  for (const x of g) if (gWant && x.days !== gWant) issues.push({ line_id: x.l.id, found: `${x.days}-day guarantee`, fix: `${gWant}-day guarantee`, type: 'inconsistent_guarantee', severity: 'must_fix', rule: 'The same guarantee on every version and size' });

  // every version × size of a sale brief carries the code and the end date
  if (req.offer && (expected.code || expected.ends)) {
    const versions = [...new Set(lines.map(l => l.version).filter(Boolean))];
    const sizes = [...new Set(lines.map(l => l.size).filter(Boolean))];
    const combos = (versions.length ? versions : [null]).flatMap(v => (sizes.length ? sizes : [null]).map(s => [v, s]));
    const missing = { code: [], ends: [] };
    for (const [v, s] of combos) {
      const scope = lines.filter(l => (!l.version || !v || l.version === v) && (!l.size || !s || l.size === s));
      const label = [v, s].filter(Boolean).join(' · ') || 'The brief';
      if (expected.code && !scope.some(l => hasCode(l.text, expected.code))) missing.code.push(label);
      if (expected.ends && !scope.some(l => datesIn(l.text, year).some(d => d.iso === expected.ends))) missing.ends.push(label);
    }
    if (missing.code.length) issues.push({ line_id: null, found: `No code on ${missing.code.join(', ')}`, fix: `Add “USE CODE: ${expected.code}”`, type: 'missing_code', severity: 'must_fix', rule: 'Code + end date on every asset' });
    if (missing.ends.length) issues.push({ line_id: null, found: `No end date on ${missing.ends.join(', ')}`, fix: `Add “Ends ${fmtDateLike(expected.ends)}”`, type: 'missing_end_date', severity: 'must_fix', rule: 'Code + end date on every asset' });
  }
  return issues;
}

function requiredElements(lines, req, lane = null) {
  const issues = [];
  const hasCta = lines.some(l => l.kind === 'cta' && l.text.trim()) || lines.some(l => CTA_RE.test(l.text));
  if (!hasCta) {
    // Science For You videos end on the article rather than a shop CTA (Brain: "No CTA in … Science For You videos")
    const soft = lane && lane !== 'Particle' && req.board === 'video';
    issues.push({ line_id: null, found: 'No CTA', fix: lane === 'SFY' ? 'Add a CTA line, e.g. “SEE WHY IT WON →”' : lane && lane !== 'Particle' ? 'Add a CTA that leads to the article' : 'Add a CTA line, e.g. “Shop Now”', type: 'missing_cta', severity: soft ? 'should_fix' : 'must_fix', rule: 'Every ad needs a CTA' });
  }
  const labels = lines.map(l => l.text.trim().toLowerCase());
  const ba = req.flags?.before_after || lines.some(l => BA_RE.test(l.text)) || (labels.includes('before') && labels.includes('after'));
  if (ba && !lines.some(l => l.kind === 'disclaimer' && l.text.trim()) && !lines.some(l => DISCLAIMER_RE.test(l.text))) {
    issues.push({ line_id: null, found: 'Before & after with no disclaimer', fix: 'Add the B&A disclaimer line (e.g. “Results may vary”)', type: 'missing_disclaimer', severity: 'must_fix', rule: 'B&A needs its disclaimer' });
  }
  return issues;
}

/** Same line + same text + same kind of problem → one issue. */
function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter(i => {
    const k = `${i.line_id || '-'}|${String(i.found || '').toLowerCase()}|${String(i.type).replace(/^(leftover|inconsistent|offer)_/, '')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Everything the code checks for one brief. */
function ruleChecks(req, facts = {}, { bc = {}, today, lane = null } = {}) {
  const lines = req.lines.filter(l => l.text.trim());
  const notes = [];
  const f = fit(lines, req, facts);
  const o = offerFacts(lines, req, facts, { today, bc });
  notes.push(...f.notes, ...o.notes);
  const issues = dedupeIssues([
    ...placeholders(lines),
    ...readingSpeed(lines, bc),
    ...f.issues,
    ...o.issues,
    ...translations(lines),
    ...crossVersion(lines, req, facts, o.expected),
    ...requiredElements(lines, req, lane),
  ]);
  return { issues, notes, expected: o.expected, offer_entry: o.entry ? { id: o.entry.id, title: o.entry.title } : null };
}

// ── Holiday Builder: checks only a batch can do ──────────────────────────────
/**
 * briefs: [{ brief_id, req, issues }] (normalised requests + the issues already found for each).
 * Returns [{ brief_id, issue }] — new issues only (anything already reported on that line is skipped).
 */
function crossBrief(briefs, facts = {}, { campaign = null } = {}) {
  const out = [];
  const known = (facts.offers || []).map(x => x.data?.code).filter(Boolean);
  const majority = (vals) => { const c = {}; for (const v of vals) c[v] = (c[v] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
  const already = (b, lineId, found) => (b.issues || []).some(i => (i.line_id || null) === (lineId || null) && String(i.found || '').toLowerCase() === String(found || '').toLowerCase());
  const add = (b, issue) => { if (!already(b, issue.line_id, issue.found)) { out.push({ brief_id: b.brief_id, issue }); (b.issues ||= []).push(issue); } };

  // 1. one code and one end date for the whole campaign
  const codeOf = (b) => b.req.offer?.code || majority(b.req.lines.flatMap(l => codesIn(l.text, known)));
  const campaignCode = majority(briefs.map(codeOf).filter(Boolean));
  const endsOf = (b) => b.req.offer?.ends || majority(b.req.lines.flatMap(l => datesIn(l.text).map(d => d.iso)));
  const campaignEnds = majority(briefs.map(endsOf).filter(Boolean));
  for (const b of briefs) {
    if (campaignCode) {
      for (const l of b.req.lines) for (const c of codesIn(l.text, known)) if (c !== campaignCode) add(b, { line_id: l.id, found: c, fix: campaignCode, type: 'campaign_code', severity: 'must_fix', rule: `Every ticket in ${campaign || 'the campaign'} uses ${campaignCode}`, suggestion: { replace: [c, campaignCode] } });
      if (b.req.offer?.code && b.req.offer.code !== campaignCode) add(b, { line_id: null, found: b.req.offer.code, fix: campaignCode, type: 'campaign_code', severity: 'must_fix', rule: `Every ticket in ${campaign || 'the campaign'} uses ${campaignCode}` });
    }
    if (campaignEnds) {
      const year = Number(campaignEnds.slice(0, 4));
      for (const l of b.req.lines) for (const d of datesIn(l.text, year)) if (d.iso !== campaignEnds) add(b, { line_id: l.id, found: d.raw, fix: fmtDateLike(campaignEnds, d.style), type: 'campaign_date', severity: 'must_fix', rule: `Every ticket in ${campaign || 'the campaign'} ends ${campaignEnds}` });
    }
  }

  // 2. the same price for the same product and tier across templates (each ticket's sale price = its lowest price shown)
  const groups = {};
  for (const b of briefs) {
    const tier = b.req.offer?.tier;
    if (!b.req.product || tier === null || tier === undefined) continue;
    const shown = b.req.lines.filter(isPriceLine).flatMap(l => amountsIn(l.text).map(a => ({ l, a })));
    if (!shown.length) continue;
    const low = shown.reduce((m, x) => (x.a.value < m.a.value ? x : m));
    (groups[`${b.req.product.toLowerCase()}|${tier}`] ||= []).push({ b, ...low });
  }
  for (const list of Object.values(groups)) {
    if (new Set(list.map(x => x.a.value)).size < 2) continue;
    const want = Number(majority(list.map(x => x.a.value)));
    for (const x of list) if (x.a.value !== want) add(x.b, { line_id: x.l.id, found: x.a.raw, fix: money(want), type: 'campaign_price', severity: 'must_fix', rule: `${x.b.req.product} at ${x.b.req.offer.tier}% is ${money(want)} on the other tickets`, suggestion: { replace: [x.a.raw, money(want)] } });
  }
  return out;
}

// ── Brain facts: structured fields for the new item types ────────────────────
/** Validate the structured part of a fact item; returns { data, content } or throws a 400. */
function factData(type, data = {}, content = null) {
  const bad = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
  const d = data && typeof data === 'object' ? data : {};
  if (type === 'layout_limit') {
    const limits = parseLimits(d.limits ?? content);
    if (!limits.length) bad('Add at least one limit, e.g. “headline 9x16: 32”');
    return { data: { limits }, content: limits.map(x => `${x.kind} · ${x.size === '*' ? 'every size' : x.size} · ${x.max} chars`).join('\n') };
  }
  if (type === 'offer') {
    const code = str(d.code, 30)?.toUpperCase().replace(/\s+/g, '') || null;
    if (code && !/^[A-Z0-9]{3,30}$/.test(code)) bad('The code may only use letters and numbers');
    const tiers = [].concat(d.tiers ?? []).flatMap(t => String(t).split(/[,\s/]+/)).map(normTier).filter(t => t > 0 && t < 100);
    const starts = normDate(d.starts), ends = normDate(d.ends);
    if (!code && !ends) bad('An offer needs at least a code or an end date');
    if (starts && ends && starts > ends) bad('The sale starts after it ends');
    const aliases = [].concat(d.aliases ?? []).map(a => str(a, 80)).filter(Boolean);
    return { data: { code, tiers, starts, ends, aliases }, content: [code && `Code ${code}`, tiers.length && `${tiers.join(' / ')}% off`, (starts || ends) && `${starts || '…'} → ${ends || '…'}`].filter(Boolean).join(' · ') };
  }
  if (type === 'price') {
    const list = num(String(d.list_price ?? '').replace(/[$,\s]/g, ''));
    if (!list || list <= 0) bad('Enter the list price, e.g. 59');
    const aliases = [].concat(d.aliases ?? []).map(a => str(a, 80)).filter(Boolean);
    return { data: { list_price: list, currency: str(d.currency, 3)?.toUpperCase() || 'USD', aliases }, content: `List price ${money(list)}` };
  }
  return { data: null, content };
}

module.exports = {
  normalizeRequest, normVersion, normSize, normDate, normTier, wordsOf, charsOf, datesIn, fmtDateLike, codesIn, amountsIn, discountsIn, guaranteeDays,
  readingSpeed, parseLimits, pickLimit, fit, offerEntry, offerFacts, translations, placeholders, crossVersion, requiredElements, dedupeIssues,
  ruleChecks, crossBrief, factData, sameName,
};
