/**
 * Read models shared by emails, the accrual report and the finance dashboard.
 */
const db = require('../../db');
const B = require('./budget');
const T = require('./totals');
const fx = require('./fx');
const W = require('../creative/week');

const PROD_SELECT = `SELECT *, planned_start::text AS planned_start, planned_end::text AS planned_end FROM productions`;

async function loadProduction(id, client = db) {
  const { rows } = await client.query(`${PROD_SELECT} WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const prod = rows[0];
  const lines = await T.loadLines(client, id);
  return { prod, lines, state: B.budgetState(prod, lines, fx.latest().rate) };
}

/** Planned amounts per currency (native). */
function perCurrency(lines, field = 'planned_budget') {
  const m = {};
  for (const li of lines) { const c = li.currency_code || 'USD'; m[c] = (m[c] || 0) + B.num(li[field]); }
  return Object.entries(m).filter(([, a]) => Math.abs(a) > 0.004).map(([currency, amount]) => ({ currency, amount: B.round2(amount) }));
}

/** When unpaid lines will be paid: the run on `payment_day` of the month their net+N falls in. */
function paymentPlan(prod, lines, cfg) {
  const runs = new Map();
  const today = W.localDate(Date.now());
  for (const li of lines) {
    if (/^paid$/i.test(li.payment_status || '')) continue;
    const amount = B.financeCost(li);
    if (amount <= 0) continue;
    let due = B.ymdOf(li.payment_due);
    if (!due) {
      const m = B.primaryMonth(li, prod);
      if (!m) continue;
      const end = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)); // last day of the cost month
      end.setUTCDate(end.getUTCDate() + (cfg.default_net_days ?? 30));
      due = end.toISOString().slice(0, 10);
    }
    let run = `${due.slice(0, 7)}-${String(cfg.payment_day ?? 29).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(+due.slice(0, 4), +due.slice(5, 7), 0)).getUTCDate();
    if (+run.slice(8) > lastDay) run = `${due.slice(0, 7)}-${lastDay}`;
    if (run < today) run = today; // overdue → the next run
    const cur = li.currency_code || 'USD';
    const r = runs.get(run) || { date: run, usd: 0, byCur: {}, count: 0 };
    r.usd += B.toUsd(amount, cur, fx.latest().rate);
    r.byCur[cur] = (r.byCur[cur] || 0) + amount;
    r.count++;
    runs.set(run, r);
  }
  return [...runs.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(r => ({ date: r.date, usd: B.round2(r.usd), count: r.count, parts: Object.entries(r.byCur).map(([currency, amount]) => ({ currency, amount })) }));
}

/** Lines whose work is done (cost month ≤ this month) with no invoice yet. */
function missingInvoiceLines(prod, lines, todayMonth) {
  const out = [];
  for (const li of lines) {
    if (/^(received|waived|no invoice needed)$/i.test(li.invoice_status || '')) continue;
    if (li.invoice_url) continue;
    const amount = B.financeCost(li);
    if (amount <= 0) continue;
    const month = B.primaryMonth(li, prod);
    if (!month || month > todayMonth) continue;
    out.push({ id: li.id, label: String(li.item || '').replace(/<[^>]*>/g, ' ').trim() || li.type || 'Line', supplier: li.full_name || li.supplier || '', amount, currency: li.currency_code || 'USD', month, paid: /^paid$/i.test(li.payment_status || '') });
  }
  return out;
}

/** Expected / paid totals of a production (USD at today's rate for open amounts, payment-day rate for paid). */
function totalsOf(lines) {
  let expectedUsd = 0, paidUsd = 0;
  const parts = {};
  for (const li of lines) {
    const cur = li.currency_code || 'USD';
    const exp = B.financeCost(li);
    const paid = /^paid$/i.test(li.payment_status || '');
    const rate = paid && li.paid_at ? fx.rateOn(li.paid_at) : fx.latest().rate;
    expectedUsd += B.toUsd(exp, cur, rate);
    if (paid) paidUsd += B.toUsd(B.num(li.actual_spent) || exp, cur, rate);
    parts[cur] = (parts[cur] || 0) + exp;
  }
  return { expectedUsd: B.round2(expectedUsd), paidUsd: B.round2(paidUsd), parts: Object.entries(parts).filter(([, a]) => a).map(([currency, amount]) => ({ currency, amount: B.round2(amount) })) };
}

/** Expected cost per month (USD) for every production — the base of accruals, the dashboard and the forecast. */
async function allocationAll({ brandId = null } = {}) {
  const vals = [];
  const where = brandId ? `WHERE brand_id = $${vals.push(brandId)}` : '';
  const { rows: prods } = await db.query(`${PROD_SELECT} ${where}`, vals);
  const { rows: lines } = await db.query('SELECT * FROM production_line_items ORDER BY production_id, sort_order NULLS LAST, created_at');
  const byProd = new Map();
  for (const li of lines) { if (!byProd.has(li.production_id)) byProd.set(li.production_id, []); byProd.get(li.production_id).push(li); }
  return prods.map(prod => {
    const ls = byProd.get(prod.id) || [];
    const months = {};
    const lineMonths = [];
    for (const li of ls) {
      const cur = li.currency_code || 'USD';
      const exp = B.financeCost(li);   // an unexpected line counts only what was really spent on it
      if (!exp) continue;
      const paid = /^paid$/i.test(li.payment_status || '');
      const rate = paid && li.paid_at ? fx.rateOn(li.paid_at) : fx.latest().rate;
      const usdAmt = B.toUsd(exp, cur, rate);
      const invoiced = /^received$/i.test(li.invoice_status || '') || paid || !!li.invoice_url;
      for (const a of B.costAllocation(li, prod)) {
        const m = months[a.month] || (months[a.month] = { usd: 0, invoiced_usd: 0, not_invoiced_usd: 0 });
        m.usd += usdAmt * a.share;
        if (invoiced) m.invoiced_usd += usdAmt * a.share; else m.not_invoiced_usd += usdAmt * a.share;
        lineMonths.push({ line_id: li.id, month: a.month, usd: usdAmt * a.share });
      }
    }
    for (const m of Object.values(months)) { m.usd = B.round2(m.usd); m.invoiced_usd = B.round2(m.invoiced_usd); m.not_invoiced_usd = B.round2(m.not_invoiced_usd); }
    return { prod, lines: ls, months, lineMonths, state: B.budgetState(prod, ls, fx.latest().rate) };
  });
}

module.exports = { loadProduction, perCurrency, paymentPlan, missingInvoiceLines, totalsOf, allocationAll, PROD_SELECT };
