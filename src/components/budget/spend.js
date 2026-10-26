/**
 * Budget dashboard model (pure). Same definitions as the Budget Overview KPIs, so the numbers match:
 *  - paid  = payment status Paid
 *  - owed  = not paid, but the invoice is in (committed) or an actual cost is entered
 *  - spent = paid + owed ("total exposure"); a line with only a planned amount isn't spent yet
 * A cost's month: when it was paid (paid_at → due date → work dates), else when the work happened
 * (work dates → due date); costs with no date of their own use their production's dates.
 */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Validated on the navy surface (dataviz validator, dark mode): fixed order, one per production, the rest is "Other"
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
export const OTHER = '#5c6596';

const num = (v) => parseFloat(v) || 0;
const ym = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 7) : null);
const isYm = (s) => /^\d{4}-\d{2}$/.test(s || '');
export const isDone = (stage) => /^(completed|cancel)/i.test(stage || '');

/** → { amount, kind: 'paid' | 'owed' } or null when nothing is spent yet */
export function costOf(li, getAmt) {
  if (li.payment_status === 'Paid') return { amount: getAmt(li), kind: 'paid' };
  if (li.invoice_status === 'Received') return { amount: getAmt(li), kind: 'owed' };
  if (num(li.actual_spent) > 0) return { amount: getAmt(li), kind: 'owed' };
  return null;
}

/** → { ym: 'YYYY-MM', own: whether the line had a date of its own } */
export function costMonth(li, kind, prod) {
  const own = kind === 'paid'
    ? [li.paid_at, li.payment_due, li.timeline_end, li.timeline_start]
    : [li.timeline_end, li.timeline_start, li.payment_due];
  for (const d of own) if (isYm(ym(d))) return { ym: ym(d), own: true };
  for (const d of [prod?.planned_end, prod?.planned_start, li.created_at]) if (isYm(ym(d))) return { ym: ym(d), own: false };
  return { ym: null, own: false };
}

/** Share of the year gone by `today` (1 for past years, 0 for future ones). */
export function yearElapsed(year, today) {
  const y = Number(today.slice(0, 4));
  if (y > year) return 1;
  if (y < year) return 0;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const t = Date.UTC(year, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1);
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

export function buildSpend({ productions, lineItems, getAmt, getPlanned, usd, year, budget, today }) {
  const prodById = Object.fromEntries(productions.map(p => [p.id, p]));
  const rows = {};
  const row = (p) => (rows[p.id] = rows[p.id] || {
    id: p.id, name: p.project_name || p.id, stage: p.stage || '', planned: 0, linePlanned: 0,
    spent: 0, paid: 0, owed: 0, months: MONTHS.map(() => ({ spent: 0, paid: 0 })), items: [],
  });
  for (const p of productions) row(p);

  let undated = 0;
  const outside = { before: 0, after: 0 };
  for (const li of lineItems) {
    const p = prodById[li.production_id];
    if (!p) continue;
    const r = row(p);
    r.linePlanned += getPlanned(li);
    const c = costOf(li, getAmt);
    if (!c || !c.amount) continue;
    r.spent += c.amount;
    r[c.kind] += c.amount;
    const m = costMonth(li, c.kind, p);
    if (!m.own) undated++;
    const y = m.ym ? Number(m.ym.slice(0, 4)) : null;
    if (y === year) {
      const cell = r.months[Number(m.ym.slice(5, 7)) - 1];
      cell.spent += c.amount;
      if (c.kind === 'paid') cell.paid += c.amount;
      cell.items = cell.items || [];
      cell.items.push(li);
    } else if (y != null) {
      outside[y < year ? 'before' : 'after'] += c.amount;
    }
    r.items.push(li);
  }

  const prods = Object.values(rows).map(r => {
    // The production's budget (as on its board, USD incl. contingency); else what its lines plan
    const planned = usd(num(prodById[r.id]?.planned_budget_2026)) || r.linePlanned;
    return { ...r, planned, left: planned - r.spent, over: planned > 0 && r.spent > planned + 0.5, pct: planned > 0 ? r.spent / planned : null };
  });
  // Colour follows the production: the six biggest spenders of the year get a hue, in order; the rest are "Other"
  const ranked = [...prods].filter(r => r.spent > 0).sort((a, b) => b.spent - a.spent);
  ranked.forEach((r, i) => { r.color = i < SERIES.length ? SERIES[i] : OTHER; r.series = i < SERIES.length ? r.id : 'other'; });
  for (const r of prods) if (!r.color) { r.color = OTHER; r.series = 'other'; }

  const months = MONTHS.map((label, i) => {
    const m = { label, i, spent: 0, paid: 0 };
    for (const r of prods) {
      const c = r.months[i];
      m.spent += c.spent;
      m.paid += c.paid;
      m[`s_${r.series}`] = (m[`s_${r.series}`] || 0) + c.spent;
      m[`p_${r.series}`] = (m[`p_${r.series}`] || 0) + c.paid;
    }
    return m;
  });

  const spent = prods.reduce((a, r) => a + r.spent, 0);
  const paid = prods.reduce((a, r) => a + r.paid, 0);
  const planned = prods.reduce((a, r) => a + r.planned, 0);
  // If every live production lands on its budget (or what it already cost, if more)
  const projected = prods.reduce((a, r) => a + (isDone(r.stage) ? r.spent : Math.max(r.spent, r.planned)), 0);
  const elapsed = yearElapsed(year, today);
  const curYear = Number(today.slice(0, 4));
  const curMonth = curYear === year ? Number(today.slice(5, 7)) - 1 : curYear > year ? 11 : -1;
  const monthsGone = curMonth + 1;

  let run = 0;
  const cumulative = months.map((m, i) => {
    run += m.spent;
    return {
      label: m.label,
      actual: i <= curMonth ? Math.round(run) : null,
      pace: Math.round((budget * (i + 1)) / 12),
      projected: i >= curMonth && curMonth >= 0 ? Math.round(run + ((projected - spent) * (i - curMonth)) / Math.max(1, 11 - curMonth)) : null,
    };
  });

  return {
    prods: prods.sort((a, b) => b.spent - a.spent || b.planned - a.planned),
    series: ranked.slice(0, SERIES.length).map(r => ({ key: r.id, name: r.name, color: r.color }))
      .concat(ranked.length > SERIES.length ? [{ key: 'other', name: `${ranked.length - SERIES.length} more`, color: OTHER }] : []),
    months,
    cumulative,
    outside,
    undated,
    totals: {
      spent, paid, owed: spent - paid, planned, budget, projected,
      pace: budget * elapsed, elapsed, curMonth,
      thisMonth: curMonth >= 0 ? months[curMonth].spent : 0,
      avgMonth: monthsGone > 0 ? months.slice(0, monthsGone).reduce((a, m) => a + m.spent, 0) / monthsGone : 0,
      withSpend: ranked.length,
      overCount: prods.filter(r => r.over).length,
    },
  };
}
