/**
 * Budget dashboard model (pure). Same definitions as the Budget Overview KPIs, so the numbers match:
 *  - paid  = payment status Paid
 *  - owed  = not paid, but the invoice is in (committed) or an actual cost is entered
 *  - plan  = a line with only a planned amount (nothing paid or invoiced yet)
 *  - est   = a live production's budget beyond its lines (an estimated budget not broken into lines yet)
 * Views ("lenses"): everything planned = all four · spent = paid + owed · not paid yet = owed + plan + est · paid.
 * A cost's month: when it was paid (paid_at → due date → work dates), else when the work happened
 * (work dates → due date); costs with no date of their own use their production's dates; the estimate is spread
 * over the production's months.
 */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Validated on the navy surface (dataviz validator, dark mode): fixed order, one per production, the rest is "Other"
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
export const OTHER = '#5c6596';

const num = (v) => parseFloat(v) || 0;
const ym = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 7) : null);
const isYm = (s) => /^\d{4}-\d{2}$/.test(s || '');
export const isDone = (stage) => /^(completed|cancel)/i.test(stage || '');

export const LENSES = [
  ['planned', 'Everything planned', 'paid + owed + planned lines + budgets not broken into lines yet'],
  ['spent', 'Spent', 'paid + owed'],
  ['unpaid', 'Not paid yet', 'owed + planned + estimated'],
  ['paid', 'Paid only', 'paid'],
];
const PARTS = { planned: ['paid', 'owed', 'plan', 'est'], spent: ['paid', 'owed'], unpaid: ['owed', 'plan', 'est'], paid: ['paid'] };
/** A cell / production / month's value in a view */
export const lensOf = (lens, c) => (PARTS[lens] || PARTS.spent).reduce((a, k) => a + (c?.[k] || 0), 0);
export const LENS_KINDS = PARTS;

/** → { amount, kind: 'paid' | 'owed' | 'plan' } or null for an empty line */
export function costOf(li, getAmt, getPlanned) {
  if (li.payment_status === 'Paid') return { amount: getAmt(li), kind: 'paid' };
  if (li.invoice_status === 'Received') return { amount: getAmt(li), kind: 'owed' };
  if (num(li.actual_spent) > 0) return { amount: getAmt(li), kind: 'owed' };
  const planned = getPlanned ? getPlanned(li) : 0;
  return planned > 0 ? { amount: planned, kind: 'plan' } : null;
}

/** The months (0–11) of `year` a production runs in, or where its dates fall outside the year. */
function productionMonths(p, year) {
  const from = ym(p.planned_start) || ym(p.delivery_date) || ym(p.air_date) || ym(p.created_at);
  const to = ym(p.planned_end) || from;
  if (!isYm(from)) return { months: [], side: null };
  const a = from <= to ? from : to;
  const b = from <= to ? to : from;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const k = `${year}-${String(i + 1).padStart(2, '0')}`;
    if (k >= a && k <= b) months.push(i);
  }
  return { months, side: months.length ? null : (b < `${year}-01` ? 'before' : 'after') };
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
  const emptyCell = () => ({ paid: 0, owed: 0, plan: 0, est: 0, items: { paid: [], owed: [], plan: [] } });
  const rows = {};
  const row = (p) => (rows[p.id] = rows[p.id] || {
    id: p.id, name: p.project_name || p.id, stage: p.stage || '', linePlanned: 0,
    paid: 0, owed: 0, plan: 0, est: 0, months: MONTHS.map(emptyCell), items: [],
  });
  for (const p of productions) row(p);

  let undated = 0;
  const outside = { before: emptyCell(), after: emptyCell() };
  for (const li of lineItems) {
    const p = prodById[li.production_id];
    if (!p) continue;
    const r = row(p);
    r.linePlanned += getPlanned(li);
    const c = costOf(li, getAmt, getPlanned);
    if (!c || !c.amount) continue;
    r[c.kind] += c.amount;
    const m = costMonth(li, c.kind, p);
    if (!m.own) undated++;
    const y = m.ym ? Number(m.ym.slice(0, 4)) : null;
    if (y === year) {
      const cell = r.months[Number(m.ym.slice(5, 7)) - 1];
      cell[c.kind] += c.amount;
      cell.items[c.kind].push(li);
    } else if (y != null) {
      outside[y < year ? 'before' : 'after'][c.kind] += c.amount;
    }
    r.items.push(li);
  }

  const prods = Object.values(rows).map(r => {
    const p = prodById[r.id] || {};
    // The production's budget (as on its board, USD incl. contingency); else its estimated budget; else what its lines plan
    const planned = usd(num(p.planned_budget_2026)) || usd(num(p.estimated_budget)) || r.linePlanned;
    // A live production's budget beyond its lines is still planned money — spread over its months
    const est = isDone(r.stage) ? 0 : Math.max(0, planned - (r.paid + r.owed + r.plan));
    if (est > 0) {
      const { months, side } = productionMonths(p, year);
      if (months.length) for (const i of months) r.months[i].est += est / months.length;
      else if (side) outside[side].est += est;
    }
    const spent = r.paid + r.owed;
    return { ...r, est, spent, all: spent + r.plan + est, planned, left: planned - spent, over: planned > 0 && spent > planned + 0.5, pct: planned > 0 ? spent / planned : null };
  });
  // Colour follows the production: the six biggest by everything planned get a hue, in order; the rest are "Other"
  const ranked = [...prods].filter(r => r.all > 0).sort((a, b) => b.all - a.all);
  ranked.forEach((r, i) => { r.color = i < SERIES.length ? SERIES[i] : OTHER; r.series = i < SERIES.length ? r.id : 'other'; });
  for (const r of prods) if (!r.color) { r.color = OTHER; r.series = 'other'; }

  const lensKeys = Object.keys(PARTS);
  const months = MONTHS.map((label, i) => {
    const m = { label, i, paid: 0, owed: 0, plan: 0, est: 0 };
    for (const r of prods) {
      const c = r.months[i];
      for (const k of ['paid', 'owed', 'plan', 'est']) m[k] += c[k];
      for (const lens of lensKeys) m[`${lens}_${r.series}`] = (m[`${lens}_${r.series}`] || 0) + lensOf(lens, c);
    }
    m.spent = m.paid + m.owed;
    return m;
  });

  const sum = (k) => prods.reduce((a, r) => a + r[k], 0);
  const paid = sum('paid');
  const owed = sum('owed');
  const plan = sum('plan');
  const est = sum('est');
  const spent = paid + owed;
  const planned = sum('planned');
  // If every live production lands on its budget (or what it already cost, if more)
  const projected = prods.reduce((a, r) => a + (isDone(r.stage) ? r.spent : Math.max(r.spent, r.planned)), 0);
  const elapsed = yearElapsed(year, today);
  const curYear = Number(today.slice(0, 4));
  const curMonth = curYear === year ? Number(today.slice(5, 7)) - 1 : curYear > year ? 11 : -1;
  const monthsGone = curMonth + 1;

  const run = { paid: 0, owed: 0, plan: 0, est: 0 };
  const cumulative = months.map((m, i) => {
    for (const k of Object.keys(run)) run[k] += m[k];
    const spentRun = run.paid + run.owed;
    return {
      label: m.label, i, ...Object.fromEntries(Object.entries(run).map(([k, v]) => [k, Math.round(v)])),
      pace: Math.round((budget * (i + 1)) / 12),
      projected: i >= curMonth && curMonth >= 0 ? Math.round(spentRun + ((projected - spent) * (i - curMonth)) / Math.max(1, 11 - curMonth)) : null,
    };
  });

  return {
    prods: prods.sort((a, b) => b.all - a.all || b.planned - a.planned),
    series: ranked.slice(0, SERIES.length).map(r => ({ key: r.id, name: r.name, color: r.color }))
      .concat(ranked.length > SERIES.length ? [{ key: 'other', name: `${ranked.length - SERIES.length} more`, color: OTHER }] : []),
    months,
    cumulative,
    outside,
    undated,
    totals: {
      spent, paid, owed, plan, est, notPaid: owed + plan + est, all: spent + plan + est,
      planned, budget, projected,
      pace: budget * elapsed, elapsed, curMonth,
      thisMonth: curMonth >= 0 ? months[curMonth].spent : 0,
      avgMonth: monthsGone > 0 ? months.slice(0, monthsGone).reduce((a, m) => a + m.spent, 0) / monthsGone : 0,
      withSpend: prods.filter(r => r.spent > 0).length,
      withAnything: ranked.length,
      overCount: prods.filter(r => r.over).length,
    },
  };
}
