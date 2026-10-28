/**
 * Recompute a production's derived numbers and dates from its budget lines (replaces the old fixed-3.7 syncTotals).
 *   estimated_budget = planned lines in USD at today's Bank of Israel rate
 *   actual_spent     = actuals in USD at the rate of the day they were paid (today when unpaid)
 *   planned_budget_2026 = estimate + 10% before approval; untouched once the budget is approved
 *   planned_start / planned_end = the span of the dated lines (a production's dates come from its lines)
 */
const fx = require('./fx');
const B = require('./budget');

async function loadLines(client, productionId) {
  const { rows } = await client.query(
    'SELECT * FROM production_line_items WHERE production_id = $1 ORDER BY sort_order NULLS LAST, created_at, id', [productionId]);
  return rows;
}

/**
 * @returns {{ before, after, datesChanged, plannedChanged }} or null when the production doesn't exist.
 */
async function syncTotals(client, productionId) {
  const { rows: pr } = await client.query(
    `SELECT id, planned_budget_2026, estimated_budget, actual_spent, budget_approved_at,
            planned_start::text AS planned_start, planned_end::text AS planned_end
       FROM productions WHERE id = $1`, [productionId]);
  const prod = pr[0];
  if (!prod) return null;
  const lines = await loadLines(client, productionId);
  const today = fx.latest().rate;

  let est = 0, spent = 0;
  for (const li of lines) {
    est += B.toUsd(li.planned_budget, li.currency_code || 'USD', today);
    const paidDay = B.ymdOf(li.paid_at);
    spent += B.toUsd(li.actual_spent, li.currency_code || 'USD', paidDay ? fx.rateOn(paidDay) : today);
  }
  est = B.round2(est); spent = B.round2(spent);

  let planned = B.num(prod.planned_budget_2026);
  if (!prod.budget_approved_at) {
    const auto = B.autoPlanned(lines, today);
    if (auto != null) planned = auto;
  }

  const span = B.spanFromLines(lines);
  const start = span ? span.start : prod.planned_start;
  const end = span ? span.end : prod.planned_end;

  await client.query(
    `UPDATE productions SET estimated_budget = $2, actual_spent = $3, planned_budget_2026 = $4,
            planned_start = $5, planned_end = $6, updated_at = NOW()
      WHERE id = $1`, [productionId, est, spent, planned, start, end]);

  return {
    before: { planned: B.num(prod.planned_budget_2026), start: prod.planned_start, end: prod.planned_end },
    after: { planned, start, end, est, spent },
    datesChanged: start !== prod.planned_start || end !== prod.planned_end,
    plannedChanged: Math.abs(planned - B.num(prod.planned_budget_2026)) > 0.004,
    lines,
  };
}

module.exports = { syncTotals, loadLines };
