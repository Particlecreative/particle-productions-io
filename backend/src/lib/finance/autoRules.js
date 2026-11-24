/**
 * Automatic payment rules for budget lines (Tomer, 24 Nov 2026):
 *  - "Any AI Credits / Higgsfield line should be automatically Paid / No invoice — no contract needed."
 *  - "Repeating suppliers — like Assaf Almog / Amit Bensangi — no contract automatically needed."
 *
 * They fire when a line is created, or when an edit makes it one (a name typed into an empty line) — never on lines
 * that already were, so a line someone set back to Not Paid (a reimbursement) stays as they left it. A field the edit
 * sets itself is never overridden, and an existing contract (sent, signed, waived) is never touched.
 */

// "AI Credits", "AI credits 2", "AI Platform", "AI Tools", "Higgsfield Inc" — not "AI Artist" (a person) or "AI video assets"
const AI_RE = /\bai\s*(?:credits?|tools?|platform)\b|higgsfield/i;
const textOf = (l) => [l?.item, l?.full_name, l?.supplier].filter(Boolean).join(' ');
const isAiCredits = (line) => AI_RE.test(textOf(line));

/** "Amit Ben Sangi" = "Amit Bensangi" = "amit bensangi" */
const supplierKey = (name) => String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const unpaid = (v) => !v || /^not paid$/i.test(String(v));
const noInvoice = (v) => !String(v || '').trim();

/**
 * Extra values for a create / update so an AI-credits line lands Paid with no invoice needed.
 * values: what the request sets; oldRow: the line before (null on create).
 */
function aiLineValues(values, oldRow) {
  const merged = { ...(oldRow || {}), ...(values || {}) };
  if (!isAiCredits(merged) || (oldRow && isAiCredits(oldRow))) return {};
  const set = (k) => Object.prototype.hasOwnProperty.call(values || {}, k);
  const out = {};
  if (!set('payment_status') && unpaid(oldRow?.payment_status)) {
    out.payment_status = 'Paid';
    if (!set('paid_by') && !oldRow?.paid_by) out.paid_by = 'Auto: AI credits';
    if (!set('payment_note') && !oldRow?.payment_note) out.payment_note = 'AI credits — paid by card, no invoice';
  }
  if (!set('invoice_status') && noInvoice(oldRow?.invoice_status)) out.invoice_status = 'Waived';
  return out;
}

/** Does this line's supplier need no contract? → the reason, or null. others: [{ production_id, full_name }] of other lines. */
function noContractReason(line, others = []) {
  if (!line) return null;
  if (isAiCredits(line)) return 'AI credits';
  if (line.cc_purchase_id) return null;                       // a card purchase, not a supplier
  if (/^cast$/i.test(String(line.type || ''))) return null;    // talent: usage rights always need a contract
  const key = supplierKey(line.full_name);
  if (key.length < 4) return null;
  if (/^worked with before$/i.test(String(line.supplier_type || ''))) return 'Worked with before';
  const elsewhere = others.some(o => o.production_id && o.production_id !== line.production_id && supplierKey(o.full_name) === key);
  return elsewhere ? 'Repeating supplier' : null;
}

/** Fields an edit must touch for the contract rule to look again (a name typed in, a type changed…). */
const CONTRACT_FIELDS = ['item', 'full_name', 'supplier', 'supplier_type', 'type'];

/**
 * Inside changeLines' transaction: mark "No contract needed" on the lines that qualify and have no contract yet.
 * Contract key = `${production_id}_li_${line id}` (the budget table's ContractModal "waive").
 */
async function waiveContracts(client, rows) {
  const cand = (rows || []).filter(r => r?.id && r.production_id && String(r.full_name || r.item || '').trim());
  if (!cand.length) return [];
  const keys = cand.map(r => `${r.production_id}_li_${r.id}`);
  const { rows: have } = await client.query('SELECT production_id FROM contracts WHERE production_id = ANY($1::text[])', [keys]);
  const exists = new Set(have.map(h => h.production_id));
  const todo = cand.filter(r => !exists.has(`${r.production_id}_li_${r.id}`));
  if (!todo.length) return [];
  let others = null;
  const done = [];
  for (const r of todo) {
    if (!isAiCredits(r) && others == null) {
      const { rows: o } = await client.query(`SELECT production_id, full_name FROM production_line_items WHERE coalesce(full_name, '') <> '' AND production_id IS NOT NULL`);
      others = o;
    }
    const why = noContractReason(r, others || []);
    if (!why) continue;
    const key = `${r.production_id}_li_${r.id}`;
    await client.query(
      `INSERT INTO contracts (production_id, provider_name, status, contract_type, events)
       VALUES ($1, $2, 'waived', 'crew', $3::jsonb) ON CONFLICT (production_id) DO NOTHING`,
      [key, r.full_name || r.item || '', JSON.stringify([{ type: 'auto_waived', reason: why, at: new Date().toISOString() }])]);
    done.push({ id: r.id, reason: why });
  }
  return done;
}

module.exports = { isAiCredits, supplierKey, aiLineValues, noContractReason, waiveContracts, CONTRACT_FIELDS, AI_RE };
