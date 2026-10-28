/**
 * The finance log (finance_events) — append-only. Every money / status / date change lands here,
 * written in the same transaction as the change. Emails, the decision log, accruals and the dashboard read it.
 */
const crypto = require('crypto');

const REASONS = ['scope_change', 'post_revision', 'rights_renewal', 'supplier_change', 'other'];
const REASON_LABEL = {
  scope_change: 'Scope change', post_revision: 'Post revision', rights_renewal: 'Rights renewal',
  supplier_change: 'Supplier change', other: 'Other',
};

// Which email an event belongs in. null = log only (digest / accrual / dashboard).
const KIND = {
  budget_approved: 'instant', budget_unapproved: 'instant', budget_increase: 'bundle',
  line_added: null, line_removed: null, amount_changed: null, currency_changed: null, line_moved: null,
  actual_changed: null, paid: null, unpaid: null, invoice_received: null, invoice_read: null, invoice_flagged: null,
  dates_changed: null, postponed: 'bundle', completed: 'bundle', paused: 'bundle', stage_changed: null,
  reopened: 'instant', locked: 'instant', unlocked: 'instant', historical_change: 'instant', rights_renewed: 'instant',
  sheet_edit: null, sync_conflict: null, sheet_row_deleted: null, finance_confirmed: null, sub_production: null,
  buffer_warning: null, note: null,
};

const COLS = ['brand_id', 'production_id', 'line_item_id', 'kind', 'label', 'field', 'old_value', 'new_value', 'currency',
  'delta', 'delta_usd', 'expense_month', 'reason', 'approved_by', 'approved_at', 'note', 'link', 'in_buffer',
  'user_id', 'user_name', 'source', 'batch_id', 'notify', 'meta'];

const str = (v) => (v === undefined || v === null ? null : (typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v)));

/** Insert events with `client` (a pool or a transaction client). Returns the inserted rows. */
async function record(client, events) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return [];
  const out = [];
  for (const e of list) {
    const row = {
      ...e,
      notify: e.notify !== undefined ? e.notify : (KIND[e.kind] ?? null),
      source: e.source || 'cp',
      old_value: str(e.old_value),
      new_value: str(e.new_value),
      meta: e.meta ? JSON.stringify(e.meta) : null,
      reason: e.reason && REASONS.includes(e.reason) ? e.reason : (e.reason ? 'other' : null),
    };
    const vals = COLS.map(c => (row[c] === undefined ? null : row[c]));
    const { rows } = await client.query(
      `INSERT INTO finance_events (${COLS.join(', ')}) VALUES (${COLS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, vals);
    out.push(rows[0]);
  }
  return out;
}

/** The decision metadata a producer gives (reason + approved by + date + note/link), validated. */
function parseDecision(body) {
  const d = body?._finance || body?._reason || null;
  if (!d || typeof d !== 'object') return null;
  const reason = REASONS.includes(d.reason) ? d.reason : (d.reason ? 'other' : null);
  if (!reason) return null;
  return {
    reason,
    approved_by: d.approved_by ? String(d.approved_by).slice(0, 120) : null,
    approved_at: /^\d{4}-\d{2}-\d{2}$/.test(d.approved_at || '') ? d.approved_at : null,
    note: d.note ? String(d.note).slice(0, 2000) : null,
    link: /^https?:\/\//i.test(d.link || '') ? String(d.link).slice(0, 1000) : null,
    work_this_month: d.work_this_month === true || d.work_this_month === 'yes' ? true : d.work_this_month === false || d.work_this_month === 'no' ? false : null,
    new_planned: Number.isFinite(Number(d.new_planned)) && Number(d.new_planned) > 0 ? Number(d.new_planned) : null,
  };
}

const newBatch = () => crypto.randomUUID();
const actor = (req) => ({ user_id: req?.user?.id || null, user_name: req?.user?.name || req?.user?.email || null });

module.exports = { record, parseDecision, newBatch, actor, REASONS, REASON_LABEL, KIND };
