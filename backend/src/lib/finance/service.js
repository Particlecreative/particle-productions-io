/**
 * One transactional path for every budget-line change — from the CP, the finance sheet, or the system.
 * Applies the change, works out the finance consequences (reason needed? past month? postponed?),
 * logs them to finance_events and recomputes totals + dates. Anything that needs a human answer
 * rolls back and comes back as `needs` (HTTP 409 for the browser).
 */
const db = require('../../db');
const B = require('./budget');
const R = require('./rules');
const E = require('./events');
const T = require('./totals');
const fx = require('./fx');
const W = require('../creative/week');

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };

const LINE_COLUMNS = [
  'item', 'full_name', 'type', 'status', 'planned_budget', 'actual_spent', 'payment_status', 'payment_method',
  'bank_details', 'business_type', 'supplier_type', 'invoice_status', 'invoice_url', 'invoice_type',
  'timeline_start', 'timeline_end', 'receipt_required', 'paid_at', 'payment_note', 'paid_by', 'payment_due',
  'notes', 'supplier', 'id_number', 'currency_code', 'custom_fields', 'cc_purchase_id',
  'drive_url', 'dropbox_url', 'payment_proof_url', 'payment_proof_drive_url', 'payment_proof_dropbox_url',
  'photo_url', 'additional_files', 'expense_month',
];
const ALIASES = { date_paid: 'paid_at', payment_screenshot_url: 'payment_proof_url' };
const DATE_COLS = new Set(['timeline_start', 'timeline_end', 'paid_at']);

class FinanceError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const todayIL = () => W.localDate(Date.now());
const thisMonth = () => `${todayIL().slice(0, 7)}-01`;

/** Clean an incoming line update: aliases, custom columns, types, and the Paid ⇄ unpaid rules. */
function normalizeUpdates(body, oldRow, actorName) {
  const out = {};
  const custom = {};
  for (const [k0, v] of Object.entries(body || {})) {
    if (k0.startsWith('_')) continue;
    const k = ALIASES[k0] || k0;
    if (k.startsWith('custom_') && k !== 'custom_fields') { custom[k] = v; continue; }
    if (!LINE_COLUMNS.includes(k)) continue;
    out[k] = v;
  }
  if (Object.keys(custom).length) out.custom_fields = { ...(oldRow?.custom_fields || {}), ...(out.custom_fields || {}), ...custom };
  for (const k of ['planned_budget', 'actual_spent']) if (k in out) { const n = parseFloat(out[k]); out[k] = Number.isFinite(n) ? n : 0; }
  for (const k of DATE_COLS) if (k in out) out[k] = B.ymdOf(out[k]) || null;
  if ('payment_due' in out) out.payment_due = out.payment_due ? new Date(out.payment_due).toISOString() : null;
  if ('expense_month' in out) { const d = B.ymdOf(/^\d{4}-\d{2}$/.test(out.expense_month || '') ? `${out.expense_month}-01` : out.expense_month); out.expense_month = d ? `${d.slice(0, 7)}-01` : null; }
  if ('currency_code' in out) out.currency_code = String(out.currency_code || 'USD').toUpperCase() === 'ILS' ? 'ILS' : 'USD';
  if ('custom_fields' in out && typeof out.custom_fields !== 'string') out.custom_fields = JSON.stringify(out.custom_fields || {});
  if ('additional_files' in out && out.additional_files != null && typeof out.additional_files !== 'string') out.additional_files = JSON.stringify(out.additional_files);

  // Paid stamps the date and who; leaving Paid clears them (the sheet used to keep showing "Paid")
  if ('payment_status' in out) {
    const isPaid = /^paid$/i.test(out.payment_status || '');
    const wasPaid = /^paid$/i.test(oldRow?.payment_status || '');
    if (isPaid && !wasPaid) {
      if (!out.paid_at && !oldRow?.paid_at) out.paid_at = todayIL();
      if (!out.paid_by && !oldRow?.paid_by && actorName) out.paid_by = actorName;
    } else if (!isPaid && wasPaid) {
      if (!('paid_at' in body)) out.paid_at = null;
      if (!('paid_by' in body)) out.paid_by = null;
      if (!('payment_note' in body)) out.payment_note = null;
    }
  }
  return out;
}

function checkRole(actor, ops) {
  const rank = RANK[actor?.role] ?? (actor?.system ? 99 : -1);
  if (rank >= RANK.Editor) return;
  if (rank === RANK.Accounting && actor?.role === 'Accounting') {
    const keys = (v) => Object.keys(v || {}).filter(k => !k.startsWith('_')).map(k => ALIASES[k] || k).filter(k => LINE_COLUMNS.includes(k) || (k.startsWith('custom_') && k !== 'custom_fields'));
    const onlyPayments = ops.every(o => o.op === 'update' && keys(o.values).every(k => R.PAYMENT_FIELDS.has(k)));
    if (onlyPayments) return;
    throw new FinanceError(403, 'Accounting can update payments and invoices, not the budget.');
  }
  throw new FinanceError(403, 'Editor access required');
}

/**
 * Run budget-line ops for one production.
 * ops: [{ op: 'create', values, after_id? } | { op: 'update', id, values } | { op: 'delete', id }]
 * actor: { id, name, role } or { system: true, name }
 * @returns { rows, events, needs }  — needs set ⇒ nothing was written
 */
async function changeLines({ productionId, ops, actor, decision = null, flow = null, source = 'cp', allowLocked = false }) {
  if (!ops?.length) return { rows: [], events: [] };
  checkRole(actor, ops);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: pr } = await client.query(
      `SELECT *, planned_start::text AS planned_start, planned_end::text AS planned_end FROM productions WHERE id = $1 FOR UPDATE`, [productionId]);
    const prod = pr[0];
    if (!prod) throw new FinanceError(404, 'Production not found');

    if (prod.locked && !allowLocked) {
      const touchesBudget = ops.some(o => o.op !== 'update' || Object.keys(o.values).some(k => R.BUDGET_FIELDS.has(k)));
      if (touchesBudget) throw new FinanceError(423, 'This production is closed (locked). Unlock it to change the budget — payments stay open.', { code: 'locked' });
    }

    let lines = await T.loadLines(client, productionId);
    const spanBefore = B.spanFromLines(lines); // judge postponements on how the lines moved, not on stale production dates
    const rate = fx.latest().rate;
    const base = { brand_id: prod.brand_id, production_id: productionId, user_id: actor?.id || null, user_name: actor?.name || null, source, batch_id: E.newBatch() };
    const results = [], events = [];
    let raise = null;
    const tm = thisMonth();

    for (const o of ops) {
      let oldRow = null, newRow = null;
      if (o.op === 'create') {
        const vals = normalizeUpdates(o.values, null, actor?.name);
        let order;
        if (o.after_id) {
          const { rows: a } = await client.query('SELECT sort_order FROM production_line_items WHERE id = $1 AND production_id = $2', [o.after_id, productionId]);
          if (a[0]?.sort_order != null) {
            order = a[0].sort_order + 1;
            await client.query('UPDATE production_line_items SET sort_order = sort_order + 1 WHERE production_id = $1 AND sort_order >= $2', [productionId, order]);
          }
        }
        if (order == null) {
          const { rows: m } = await client.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM production_line_items WHERE production_id = $1', [productionId]);
          order = m[0].n;
        }
        const defaults = { item: '', full_name: '', type: '', status: 'Not Started', planned_budget: 0, actual_spent: 0, payment_status: 'Not Paid', supplier_type: 'New Supplier', currency_code: 'USD', custom_fields: '{}', receipt_required: false };
        const all = { ...defaults, ...vals };
        const keys = Object.keys(all);
        const { rows } = await client.query(
          `INSERT INTO production_line_items (production_id, sort_order, ${keys.map(k => `"${k}"`).join(', ')})
           VALUES ($1, $2, ${keys.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING *`,
          [productionId, order, ...keys.map(k => all[k])]);
        newRow = rows[0];
      } else {
        const { rows: cur } = await client.query('SELECT * FROM production_line_items WHERE id = $1 AND production_id = $2 FOR UPDATE', [o.id, productionId]);
        oldRow = cur[0];
        if (!oldRow) throw new FinanceError(404, 'Line not found');
        if (o.op === 'update') {
          const vals = normalizeUpdates(o.values, oldRow, actor?.name);
          const keys = Object.keys(vals);
          if (!keys.length) { results.push(oldRow); continue; }
          const { rows } = await client.query(
            `UPDATE production_line_items SET ${keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
            [o.id, ...keys.map(k => vals[k])]);
          newRow = rows[0];
        } else {
          await client.query('DELETE FROM production_line_items WHERE id = $1', [o.id]);
        }
      }
      const before = lines;
      const after = o.op === 'create' ? [...lines, newRow] : o.op === 'delete' ? lines.filter(l => l.id !== oldRow.id) : lines.map(l => (l.id === newRow.id ? newRow : l));
      const prodNow = raise != null ? { ...prod, planned_budget_2026: raise } : prod;
      const res = R.evaluateLine({ prod: prodNow, before, after, oldLine: oldRow, newLine: newRow, op: o.op, decision, todayMonth: tm, rate, base });
      if (res.needs) {
        await client.query('ROLLBACK');
        return { needs: { ...res.needs, production_id: productionId, production: prod.project_name, approvers: null } };
      }
      events.push(...res.events);
      if (res.raisePlannedTo != null) raise = Math.max(raise || 0, res.raisePlannedTo);
      lines = after;
      results.push(newRow || oldRow);
    }

    if (raise != null) await client.query('UPDATE productions SET planned_budget_2026 = $2 WHERE id = $1', [productionId, raise]);

    const sync = await T.syncTotals(client, productionId);
    const spanAfter = B.spanFromLines(sync?.lines || []);
    if (spanBefore && spanAfter && (spanBefore.start !== spanAfter.start || spanBefore.end !== spanAfter.end)) {
      const d = R.evaluateDates({ prod, before: spanBefore, after: spanAfter, flow, todayMonth: tm, base });
      if (d.needs) {
        await client.query('ROLLBACK');
        return { needs: { ...d.needs, production_id: productionId, production: prod.project_name } };
      }
      events.push(...d.events);
    }

    const saved = await E.record(client, events);
    await client.query('COMMIT');
    return { rows: results, events: saved, prod, sync };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Express glue: turn a FinanceError / needs into the HTTP response. Returns true when handled. */
function sendFinanceOutcome(res, out) {
  if (out?.needs) {
    const msg = out.needs.code === 'postpone_required'
      ? 'Moving this production to a later month needs a reason.'
      : out.needs.mode === 'over_planned' ? 'This goes over the approved Planned Budget — it needs a reason and who approved it.'
        : 'The budget is approved — changes need a reason.';
    res.status(409).json({ error: msg, ...out.needs });
    return true;
  }
  return false;
}
function sendFinanceError(res, err, fallback = 'Server error') {
  if (err instanceof FinanceError) return res.status(err.status).json({ error: err.message, ...err.extra });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

const actorOf = (req) => ({ id: req.user?.id || null, name: req.user?.name || req.user?.email || null, role: req.user?.role, email: req.user?.email });

module.exports = { changeLines, normalizeUpdates, sendFinanceOutcome, sendFinanceError, actorOf, FinanceError, todayIL, thisMonth, RANK };
