/**
 * The finance dashboard (live link for finance, one-time code) — what changed this month, the impact,
 * what's expected next, 30/60/90 days, missing invoices and every production's status. Never bank details.
 */
const db = require('../../db');
const B = require('./budget');
const ctx = require('./context');
const fx = require('./fx');
const config = require('./config');
const W = require('../creative/week');
const { companyOf, companyLine } = require('./company');

const MONEY_KINDS = ['budget_approved', 'budget_unapproved', 'budget_increase', 'line_added', 'line_removed', 'amount_changed', 'currency_changed',
  'historical_change', 'postponed', 'completed', 'paused', 'reopened', 'locked', 'unlocked', 'rights_renewed', 'finance_confirmed', 'invoice_flagged'];

const addMonths = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 10); };
const daysIn = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();

/** USD of a monthly allocation that falls inside [from, to] (dates), pro-rated by days. */
function windowUsd(months, from, to) {
  let sum = 0;
  for (const [m, v] of Object.entries(months)) {
    const mStart = m, mEnd = `${m.slice(0, 8)}${String(daysIn(m)).padStart(2, '0')}`;
    const s = from > mStart ? from : mStart, e = to < mEnd ? to : mEnd;
    if (s > e) continue;
    const days = (Date.parse(e) - Date.parse(s)) / 86400000 + 1;
    sum += v.usd * (days / daysIn(m));
  }
  return sum;
}

const safeLine = (li, prod) => ({
  id: li.id,
  label: String(li.item || '').replace(/<[^>]*>/g, ' ').trim() || li.type || 'Line',
  supplier: li.full_name || li.supplier || '',
  type: li.type || '',
  currency: li.currency_code || 'USD',
  planned: B.num(li.planned_budget),
  actual: B.num(li.actual_spent),
  expected: B.financeCost(li),
  unexpected: B.isUnexpected(li),
  invoice: /^received$/i.test(li.invoice_status || '') || !!li.invoice_url ? 'received' : /^(waived|no invoice needed)$/i.test(li.invoice_status || '') ? 'not needed' : 'missing',
  invoice_flags: li.invoice_flags || null,
  paid: /^paid$/i.test(li.payment_status || ''),
  paid_at: B.ymdOf(li.paid_at),
  method: li.payment_method || null,
  dates: [B.ymdOf(li.timeline_start), B.ymdOf(li.timeline_end)],
  month: B.primaryMonth(li, prod),
});

async function build({ brandId = null } = {}) {
  const cfg = await config.get();
  const today = W.localDate(Date.now());
  const thisM = `${today.slice(0, 7)}-01`, nextM = addMonths(thisM, 1);
  const all = await ctx.allocationAll({ brandId });

  // Changes this month (the finance log)
  const vals = [thisM, MONEY_KINDS];
  const brandSql = brandId ? ` AND brand_id = $${vals.push(brandId)}` : '';
  const { rows: evs } = await db.query(
    `SELECT * FROM finance_events WHERE created_at >= $1::date AND kind = ANY($2)${brandSql} ORDER BY created_at DESC LIMIT 300`, vals);
  const impact = { this_month: 0, past_months: 0, future_months: 0 };
  for (const e of evs) {
    // historical_change repeats a budget change in a past month (it feeds the surprise meter) — don't count it twice
    if (!['line_added', 'line_removed', 'amount_changed', 'currency_changed'].includes(e.kind) || e.delta_usd == null) continue;
    const m = B.ymdOf(e.expense_month);
    if (!m || m === thisM) impact.this_month += B.num(e.delta_usd);
    else if (m < thisM) impact.past_months += B.num(e.delta_usd);
    else impact.future_months += B.num(e.delta_usd);
  }

  // Surprise meter: changes to months already in a sent accrual report, since that report
  const { rows: lastSent } = await db.query("SELECT month::text AS month, sent_at FROM accrual_reports WHERE status = 'sent' ORDER BY month DESC LIMIT 1");
  let surprise = null;
  if (lastSent[0]) {
    const { rows: s } = await db.query(
      `SELECT COALESCE(SUM(delta_usd), 0) AS usd, COUNT(*) AS n FROM finance_events
        WHERE kind = 'historical_change' AND created_at > $1 AND expense_month <= $2::date${brandId ? ' AND brand_id = $3' : ''}`,
      brandId ? [lastSent[0].sent_at, lastSent[0].month, brandId] : [lastSent[0].sent_at, lastSent[0].month]);
    surprise = { since_report: lastSent[0].month, usd: B.round2(B.num(s[0].usd)), count: Number(s[0].n) };
  }

  const d30 = W.addDays(today, 30), d60 = W.addDays(today, 60), d90 = W.addDays(today, 90);
  const productions = [];
  const missing = [];
  const monthTotals = {};
  let thisMonthUsd = 0, nextMonthUsd = 0, f30 = 0, f60 = 0, f90 = 0;
  const pay30 = { usd: 0 }, pay60 = { usd: 0 }, pay90 = { usd: 0 };

  for (const { prod, lines, months, state } of all) {
    const totals = ctx.totalsOf(lines);
    const open = !prod.locked;
    const stage = B.normalizeStage(prod.stage);
    const hasActivity = lines.length || B.isApproved(prod) || ['Pre Production', 'Production', 'Post'].includes(stage);
    if (!hasActivity) continue;
    for (const [m, v] of Object.entries(months)) {
      const t = monthTotals[m] || (monthTotals[m] = { usd: 0, invoiced_usd: 0, not_invoiced_usd: 0 });
      t.usd += v.usd; t.invoiced_usd += v.invoiced_usd; t.not_invoiced_usd += v.not_invoiced_usd;
    }
    const tm = months[thisM]?.usd || 0, nm = months[nextM]?.usd || 0;
    thisMonthUsd += tm; nextMonthUsd += nm;
    f30 += windowUsd(months, today, d30); f60 += windowUsd(months, today, d60); f90 += windowUsd(months, today, d90);
    for (const run of ctx.paymentPlan(prod, lines, cfg)) {
      if (run.date <= d30) pay30.usd += run.usd;
      if (run.date <= d60) pay60.usd += run.usd;
      if (run.date <= d90) pay90.usd += run.usd;
    }
    const miss = ctx.missingInvoiceLines(prod, lines, thisM);
    if (miss.length) missing.push({ production_id: prod.id, code: B.financeCode(prod.id), name: prod.project_name, brand_id: prod.brand_id, items: miss });
    productions.push({
      id: prod.id, code: B.financeCode(prod.id), name: prod.project_name, brand_id: prod.brand_id, company: companyOf(prod.brand_id).short,
      parent_id: prod.parent_id || null, stage: B.normalizeStage(prod.stage), open, closed_at: prod.locked_at, closed_by: prod.locked_by,
      confirmed_at: prod.finance_confirmed_at, confirmed_by: prod.finance_confirmed_by,
      approved: B.isApproved(prod), approved_at: prod.budget_approved_at, approved_by: prod.budget_approved_by,
      planned_usd: B.num(prod.planned_budget_2026), expected_usd: totals.expectedUsd, actual_usd: totals.actualUsd, paid_usd: totals.paidUsd,
      buffer_left_usd: state.approved ? state.bufferLeft : null, buffer_total_usd: state.approved ? state.bufferTotal : null,
      this_month_usd: B.round2(tm), next_month_usd: B.round2(nm),
      start: prod.planned_start, end: prod.planned_end, sheet_url: prod.finance_sheet_url || null,
      missing_invoices: miss.length, lines: lines.length,
    });
  }

  const order = (p) => (p.open ? 0 : p.confirmed_at ? 2 : 1);
  productions.sort((a, b) => order(a) - order(b) || String(b.start || '').localeCompare(String(a.start || '')));
  const monthsOut = [-2, -1, 0, 1, 2, 3].map(n => addMonths(thisM, n)).map(m => ({ month: m, ...(monthTotals[m] || { usd: 0, invoiced_usd: 0, not_invoiced_usd: 0 }) }))
    .map(m => ({ ...m, usd: B.round2(m.usd), invoiced_usd: B.round2(m.invoiced_usd), not_invoiced_usd: B.round2(m.not_invoiced_usd) }));

  return {
    generated_at: new Date().toISOString(),
    today, this_month: thisM, next_month: nextM,
    rate: fx.quote(today),
    rules: { invoice_cutoff_day: cfg.invoice_cutoff_day, payment_day: cfg.payment_day, net_days: cfg.default_net_days },
    companies: [...new Set(productions.map(p => p.brand_id))].map(id => ({ id, short: companyOf(id).short, legal: companyLine(id), color: companyOf(id).color })),
    kpis: {
      this_month_usd: B.round2(thisMonthUsd), next_month_usd: B.round2(nextMonthUsd),
      forecast: { d30: B.round2(f30), d60: B.round2(f60), d90: B.round2(f90) },
      payments: { d30: B.round2(pay30.usd), d60: B.round2(pay60.usd), d90: B.round2(pay90.usd) },
      missing_invoices: missing.reduce((s, g) => s + g.items.length, 0),
      open_productions: productions.filter(p => p.open).length,
      to_confirm: productions.filter(p => !p.open && !p.confirmed_at).length,
    },
    impact: { this_month_usd: B.round2(impact.this_month), past_months_usd: B.round2(impact.past_months), future_months_usd: B.round2(impact.future_months) },
    surprise,
    months: monthsOut,
    changes: evs.map(e => ({
      id: e.id, at: e.created_at, kind: e.kind, production_id: e.production_id, code: e.production_id ? B.financeCode(e.production_id) : '',
      brand_id: e.brand_id, label: e.label, old_value: e.old_value, new_value: e.new_value, currency: e.currency, delta_usd: e.delta_usd,
      month: B.ymdOf(e.expense_month), reason: e.reason, approved_by: e.approved_by, note: e.note, link: e.link, in_buffer: e.in_buffer,
      by: e.user_name, source: e.source, meta: e.meta,
    })),
    missing,
    productions,
  };
}

/** One production for the dashboard (lines without bank / ID details, its finance log). */
async function production(id) {
  const loaded = await ctx.loadProduction(id);
  if (!loaded) return null;
  const { prod, lines, state } = loaded;
  const cfg = await config.get();
  const { rows: evs } = await db.query("SELECT * FROM finance_events WHERE production_id = $1 AND kind <> 'sync_conflict' ORDER BY created_at DESC LIMIT 200", [id]);
  const { rows: kids } = await db.query('SELECT id, project_name FROM productions WHERE parent_id = $1 ORDER BY id', [id]);
  return {
    id: prod.id, code: B.financeCode(prod.id), name: prod.project_name, brand_id: prod.brand_id, company: companyOf(prod.brand_id).short, company_legal: companyLine(prod.brand_id),
    parent_id: prod.parent_id, children: kids, stage: B.normalizeStage(prod.stage), open: !prod.locked, closed_at: prod.locked_at, closed_by: prod.locked_by,
    confirmed_at: prod.finance_confirmed_at, confirmed_by: prod.finance_confirmed_by,
    approved: state.approved, approved_at: prod.budget_approved_at, approved_by: prod.budget_approved_by,
    state, totals: ctx.totalsOf(lines), per_currency: ctx.perCurrency(lines),
    start: prod.planned_start, end: prod.planned_end, producer: prod.producer, type: prod.production_type,
    sheet_url: prod.finance_sheet_url, legacy_sheet_url: prod.finance_sheet_legacy_url,
    payment_plan: ctx.paymentPlan(prod, lines, cfg),
    lines: lines.map(li => safeLine(li, prod)),
    events: evs.map(e => ({ id: e.id, at: e.created_at, kind: e.kind, label: e.label, old_value: e.old_value, new_value: e.new_value, currency: e.currency, delta_usd: e.delta_usd, month: B.ymdOf(e.expense_month), reason: e.reason, approved_by: e.approved_by, note: e.note, link: e.link, in_buffer: e.in_buffer, by: e.user_name, source: e.source, meta: e.meta })),
    rate: fx.quote(),
  };
}

module.exports = { build, production, MONEY_KINDS, addMonths };
