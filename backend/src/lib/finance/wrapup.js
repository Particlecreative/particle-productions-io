/**
 * Wrap-up — the stage between Post and Completed (Tomer, 17 Nov 2026): post is delivered, no more work is coming,
 * the suppliers are being paid. Completed is for productions with nothing left to pay.
 *   · Moving to Completed while money is still owed → the server stops and offers Wrap-up (or "complete anyway").
 *   · In Wrap-up, the moment the last line is paid (in CP or from finance's sheet) it completes itself and finance is told.
 *   · Completed → Wrap-up is not a "reopen" (no new work, nothing to accrue) — it's how an auto-complete is undone.
 * A line is still open when its invoice amount (actual) isn't Paid, or it has a budget but no invoice yet.
 * The pure parts are tested (test/finance/wrapup.test.js); the DB is required lazily.
 */
const B = require('./budget');

const STAGE = 'Wrap-up';
const isPaid = (li) => /^paid$/i.test(String(li?.payment_status || '').trim());
const isWrap = (s) => B.normalizeStage(s) === STAGE;
const ymd = (v) => B.ymdOf(v) || null;
const cur = (c) => (String(c || 'USD').toUpperCase() === 'ILS' ? 'ILS' : 'USD');

/** { unpaid: lines with an invoice amount not paid yet, noInvoice: lines with a budget but no invoice amount } */
function openLines(lines) {
  const unpaid = [], noInvoice = [];
  for (const li of lines || []) {
    if (isPaid(li)) continue;
    if (B.num(li.actual_spent) > 0) unpaid.push(li);
    else if (B.num(li.planned_budget) > 0) noInvoice.push(li);
  }
  return { unpaid, noInvoice };
}

/** What's still to pay, for the guard, the finance email and the board. today = 'YYYY-MM-DD' (Israel). */
function summary(lines, today) {
  const { unpaid, noInvoice } = openLines(lines);
  const row = (li, kind) => ({
    id: li.id || null, kind,
    supplier: String(li.full_name || li.supplier || '').trim(),
    label: String(li.item || li.type || '').trim(),
    amount: B.round2(kind === 'unpaid' ? B.num(li.actual_spent) : B.num(li.planned_budget)),
    currency: cur(li.currency_code),
    due: ymd(li.payment_due),
  });
  const list = [...unpaid.map(li => row(li, 'unpaid')), ...noInvoice.map(li => row(li, 'no_invoice'))];
  const rank = (r) => (r.due && r.due < today ? 0 : r.due ? 1 : 2);
  list.sort((a, b) => rank(a) - rank(b) || String(a.due || '').localeCompare(String(b.due || '')) || b.amount - a.amount);
  const owed = {};
  for (const r of list) if (r.kind === 'unpaid') owed[r.currency] = B.round2((owed[r.currency] || 0) + r.amount);
  const dues = list.map(r => r.due).filter(d => d && d >= today).sort();
  return {
    open: list.length,
    unpaid: unpaid.length,
    no_invoice: noInvoice.length,
    owed,
    overdue: list.filter(r => r.due && r.due < today).length,
    next_due: dues[0] || null,
    lines: list,
  };
}

/** Ready to complete by itself: in Wrap-up, has lines, and every line is paid (or has neither budget nor invoice). */
const settled = (lines) => (lines || []).length > 0 && openLines(lines).unpaid.length === 0 && openLines(lines).noInvoice.length === 0;

/**
 * The guard on a stage change. Returns the summary when moving to Completed should stop and ask, else null.
 * answer = the user's choice from the prompt: 'complete' (complete anyway) skips it.
 */
function guard({ from, to, lines, answer, today }) {
  if (B.normalizeStage(to) !== 'Completed' || B.isDone(B.normalizeStage(from))) return null;
  if (answer === 'complete') return null;
  const s = summary(lines, today);
  return s.open ? s : null;
}

/** Short money text per currency, e.g. "$4,200 + ₪1,300". */
function owedText(owed) {
  const parts = Object.entries(owed || {}).filter(([, v]) => v > 0)
    .map(([c, v]) => `${c === 'ILS' ? '₪' : '$'}${Math.round(v).toLocaleString('en-US')}`);
  return parts.join(' + ');
}

/**
 * Called after any line change on a Wrap-up production: when nothing is left to pay, move it to Completed
 * (one transaction: stage, history, finance event — finance gets it in the bundled email). Returns true when it completed.
 */
async function settle(productionId, { actor = null } = {}) {
  const db = require('../../db');
  const E = require('./events');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, brand_id, project_name, stage FROM productions WHERE id = $1 FOR UPDATE', [productionId]);
    const prod = rows[0];
    if (!prod || !isWrap(prod.stage)) { await client.query('ROLLBACK'); return false; }
    const { rows: lines } = await client.query(
      'SELECT id, actual_spent, planned_budget, payment_status FROM production_line_items WHERE production_id = $1', [productionId]);
    if (!settled(lines)) { await client.query('ROLLBACK'); return false; }
    await client.query("UPDATE productions SET stage = 'Completed', updated_at = NOW() WHERE id = $1", [productionId]);
    await client.query(
      `INSERT INTO change_history (production_id, field, old_value, new_value, user_id, user_name)
       VALUES ($1, 'stage', $2, 'Completed', NULL, $3)`, [productionId, prod.stage, 'CP — every supplier paid']);
    await E.record(client, [{
      brand_id: prod.brand_id, production_id: productionId, kind: 'completed', label: prod.project_name,
      field: 'stage', old_value: STAGE, new_value: 'Completed', source: 'system',
      user_name: actor?.name || null,
      note: 'Every supplier is paid — CP marked it Completed by itself.',
      meta: { auto: true, work_this_month: false },
    }]);
    // Completed = closed (25 Nov 2026): lock the budget in the same transaction (logged, no extra email)
    await require('./closeDone').closeOne(client, prod, { actor: actor?.name || 'CP', note: 'Closed automatically — every supplier is paid and it’s Completed.' });
    await client.query('COMMIT');
    try { require('../financeSheet').triggerFinanceSync(productionId); } catch { /* sheet is best-effort */ }
    console.log(`[wrap-up] ${productionId} — every supplier paid → Completed`);
    return true;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Fire-and-forget after a line change (never blocks or fails the save). */
function settleSoon(productionId, opts) {
  setImmediate(() => settle(productionId, opts).catch(e => console.error('[wrap-up] settle:', e.message)));
}

module.exports = { STAGE, isWrap, isPaid, openLines, summary, settled, guard, owedText, settle, settleSoon };
