/**
 * Budget rules (pure, no DB) — the approved budget, the 10% unexpected buffer, cost months.
 *
 * Planned Budget (productions.planned_budget_2026):
 *   - before approval: core × 1.10, or core + the explicit "unexpected" line(s) when one exists
 *   - after approval:  frozen. New lines / increases eat the buffer; going over Planned is a budget increase.
 * "core" = every budget line except an explicit unexpected/contingency line, in USD.
 * Buffer math after approval uses the ₪/$ rate frozen at approval, so the shekel moving never eats the buffer.
 */

// "Unexpected" / contingency lines (Hebrew: בלתי צפוי / בלתי מתוכנן / בלת"מ) — word-bounded, so קבלת… doesn't match
const UNEXPECTED_RE = /unexpected|contingenc|בלתי[\s\-־]*(צפוי|מתוכנן)|בלת["״']?מ(?![א-ת])/i;
const DONE_STAGE_RE = /^(completed|cancel)/i;
const DEFAULT_RATE = 3.7; // only when no Bank of Israel rate has ever been loaded

/** "YYYY-MM-DD" from a pg DATE (a local-midnight Date), a timestamp, or a string. */
function ymdOf(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
const monthOf = (d) => (d ? `${d.slice(0, 7)}-01` : null);

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function round2(n) { return Math.round(n * 100) / 100; }

/** Amount in a line's currency → USD. */
function toUsd(amount, currency, rate) {
  const n = num(amount);
  return currency === 'ILS' ? n / (rate || DEFAULT_RATE) : n;
}

function isUnexpected(li) {
  return UNEXPECTED_RE.test(`${li.item || ''} ${li.type || ''} ${li.full_name || ''}`);
}

/** core (USD, no unexpected lines), unexpected (USD), est (both) — planned amounts. */
function sums(lines, rate) {
  let core = 0, unexpected = 0;
  for (const li of lines || []) {
    const usd = toUsd(li.planned_budget, li.currency_code || 'USD', rate);
    if (isUnexpected(li)) unexpected += usd; else core += usd;
  }
  return { core: round2(core), unexpected: round2(unexpected), est: round2(core + unexpected), hasUnexpected: (lines || []).some(isUnexpected) };
}

/** Planned Budget before approval. null = no lines (keep whatever was typed by hand). */
function autoPlanned(lines, rate) {
  if (!lines || !lines.length) return null;
  const s = sums(lines, rate);
  return round2(s.hasUnexpected ? s.core + s.unexpected : s.core * 1.10);
}

const isApproved = (prod) => !!prod?.budget_approved_at;

/**
 * Where a production stands against its Planned Budget.
 * rate = today's ₪/$ (used before approval); after approval the frozen approval rate is used.
 */
function budgetState(prod, lines, rate) {
  const approved = isApproved(prod);
  const r = approved ? (num(prod.approved_fx_rate) || rate) : rate;
  const s = sums(lines, r);
  if (!approved) {
    const planned = autoPlanned(lines, r) ?? num(prod?.planned_budget_2026);
    return { approved, rate: r, ...s, planned, bufferTotal: round2(planned - s.core), bufferLeft: round2(planned - s.core), usedPct: 0, over: 0 };
  }
  const planned = num(prod.planned_budget_2026);
  const approvedCore = prod.approved_core != null ? num(prod.approved_core) : s.core;
  const bufferTotal = round2(Math.max(0, planned - approvedCore));
  const bufferLeft = round2(planned - s.core);
  const used = bufferTotal > 0 ? (bufferTotal - bufferLeft) / bufferTotal : (bufferLeft < 0 ? 1 : 0);
  return {
    approved, rate: r, ...s, planned, approvedCore, bufferTotal, bufferLeft,
    usedPct: Math.max(0, Math.round(used * 100)),
    over: round2(Math.max(0, s.core - planned)),
  };
}

/**
 * What a change does to an approved budget.
 * → { impact: false } when the core doesn't move, else
 *   { impact: true, inBuffer, coreBefore, coreAfter, delta, planned, leftAfter, overBy }
 */
function classifyChange(prod, before, after, rate) {
  const r = num(prod?.approved_fx_rate) || rate;
  const a = sums(before, r).core, b = sums(after, r).core;
  const delta = round2(b - a);
  // After approval the unexpected line is just a label: only the core eats or gives back the buffer
  if (Math.abs(delta) < 0.005) return { impact: false };
  const planned = num(prod?.planned_budget_2026);
  const overBy = round2(Math.max(0, b - planned));
  // Cutting costs is never "over Planned", even when the production already is
  return { impact: true, inBuffer: delta <= 0 || overBy === 0, coreBefore: a, coreAfter: b, delta, planned, leftAfter: round2(planned - b), overBy };
}

/**
 * The cost of a line as finance expects to pay it, in the line's currency:
 * an invoiced / paid line is its actual; otherwise the larger of planned and actual so far.
 */
function expectedCost(li) {
  const planned = num(li.planned_budget), actual = num(li.actual_spent);
  const settled = /^paid$/i.test(li.payment_status || '') || /^received$/i.test(li.invoice_status || '');
  if (settled && actual > 0) return actual;
  return Math.max(planned, actual);
}

/**
 * What finance counts for a line: an unexpected/contingency line only counts what was actually spent on it
 * (its planned amount is the buffer, not a cost); every other line its expected cost.
 */
function financeCost(li) {
  return isUnexpected(li) ? Math.max(0, num(li.actual_spent)) : expectedCost(li);
}

/** Line or production dates → [{ month: 'YYYY-MM-01', share }] (by days; an override puts it all in one month). */
function costAllocation(li, prod) {
  const override = ymdOf(li?.expense_month);
  if (override) return [{ month: monthOf(override), share: 1 }];
  let start = ymdOf(li?.timeline_start), end = ymdOf(li?.timeline_end);
  if (!start && !end) { start = ymdOf(prod?.planned_start); end = ymdOf(prod?.planned_end); }
  start = start || end; end = end || start;
  if (!start) return [];
  if (end < start) [start, end] = [end, start];
  const t0 = Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const t1 = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  const days = Math.round((t1 - t0) / 86400000) + 1;
  const counts = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(t0 + i * 86400000);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  return [...counts].map(([month, n]) => ({ month, share: n / days }));
}

/** The month a line's cost is reported in when one month is needed (the month with most of its days). */
function primaryMonth(li, prod) {
  const a = costAllocation(li, prod);
  if (!a.length) return null;
  return a.reduce((best, x) => (x.share > best.share ? x : best)).month;
}

/** Production span from its dated lines → { start, end } or null when no line has dates. */
function spanFromLines(lines) {
  let start = null, end = null;
  for (const li of lines || []) {
    const s = ymdOf(li.timeline_start) || ymdOf(li.timeline_end);
    const e = ymdOf(li.timeline_end) || ymdOf(li.timeline_start);
    if (!s) continue;
    if (!start || s < start) start = s;
    if (!end || e > end) end = e;
  }
  return start ? { start, end } : null;
}

/** PRD26-37 → "26-37", PRD26-37-01 → "26-37-01" (the code finance uses, with dashes). */
function financeCode(id) {
  const m = /^PRD(\d{2})-(\d+)(?:-(\d+))?$/i.exec(String(id || ''));
  if (!m) return String(id || '');
  return `${m[1]}-${m[2].padStart(2, '0')}${m[3] ? `-${m[3].padStart(2, '0')}` : ''}`;
}

/** One spelling per stage (the dashboard used "Pre-Production" / "Post Production" in places). */
const STAGE_ALIASES = {
  'pre-production': 'Pre Production', 'pre production': 'Pre Production', 'preproduction': 'Pre Production',
  'post production': 'Post', 'post-production': 'Post', 'post': 'Post',
  'in production': 'Production', 'production': 'Production',
  'delivered': 'Completed', 'completed': 'Completed', 'done': 'Completed',
  'pending': 'Pending', 'paused': 'Paused', 'on hold': 'Paused',
};
function normalizeStage(s) {
  if (s == null) return s;
  return STAGE_ALIASES[String(s).trim().toLowerCase()] || String(s).trim();
}
const ACTIVE_STAGES = new Set(['Production', 'Post', 'Completed', 'Paused']);
const isDone = (stage) => DONE_STAGE_RE.test(String(stage || ''));

/** Finance already knows this production: approved, closed, or past planning. */
function financeKnows(prod) {
  return isApproved(prod) || !!prod?.locked || ACTIVE_STAGES.has(normalizeStage(prod?.stage));
}

module.exports = {
  UNEXPECTED_RE, DEFAULT_RATE,
  ymdOf, monthOf, num, round2, toUsd, isUnexpected, sums, autoPlanned, isApproved, budgetState, classifyChange,
  expectedCost, financeCost, costAllocation, primaryMonth, spanFromLines, financeCode, normalizeStage, isDone, financeKnows,
};
