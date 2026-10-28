/**
 * Claude reads an invoice the moment it's attached to a budget line: supplier, number, date, currency,
 * amount before VAT, VAT, total, and the company it's billed to. Then CP:
 *   - fills the line's actual amount when it's still empty (same currency only)
 *   - flags: billed to the wrong company, a gap vs the budget, a duplicate invoice number, not an invoice at all
 */
const db = require('../../db');
const B = require('./budget');
const E = require('./events');
const fx = require('./fx');
const { getAnthropic } = require('../anthropic');
const { companyOf } = require('./company');

const MODEL = 'claude-opus-5-5';
const str = (description) => ({ anyOf: [{ type: 'string', ...(description ? { description } : {}) }, { type: 'null' }] });
const num = () => ({ anyOf: [{ type: 'number' }, { type: 'null' }] });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_invoice', 'document_type', 'supplier_name', 'supplier_tax_id', 'invoice_number', 'issue_date', 'currency',
    'amount_before_vat', 'vat_amount', 'total_amount', 'billed_to_name', 'billed_to_tax_id', 'notes'],
  properties: {
    is_invoice: { type: 'boolean', description: 'true for an invoice / tax invoice / receipt / bill from a supplier' },
    document_type: { type: 'string', enum: ['tax_invoice', 'tax_invoice_receipt', 'receipt', 'proforma', 'quote', 'other'] },
    supplier_name: str(),
    supplier_tax_id: str('ח.פ / ע.מ / VAT or company number of the supplier'),
    invoice_number: str(),
    issue_date: str('YYYY-MM-DD'),
    currency: { anyOf: [{ type: 'string', enum: ['USD', 'ILS', 'EUR', 'GBP', 'OTHER'] }, { type: 'null' }] },
    amount_before_vat: num(),
    vat_amount: num(),
    total_amount: num(),
    billed_to_name: str('The customer the invoice is issued to (לכבוד / Bill to)'),
    billed_to_tax_id: str(),
    notes: str('Anything finance should know, one short sentence, else null'),
  },
};
const SYSTEM = `You read supplier invoices for an Israeli company's production team. Documents may be in Hebrew or English.
Extract exactly what the document says — never guess. Amounts are plain numbers (no symbols). "לכבוד" / "Bill to" is who it is billed to.
חשבונית מס = tax_invoice, חשבונית מס/קבלה = tax_invoice_receipt, קבלה = receipt, חשבון עסקה / proforma = proforma, הצעת מחיר = quote.
If the file isn't an invoice or receipt, set is_invoice false and the rest to null.`;

const COMPANY_RE = { particle: /particle/i, blurr: /blurr/i, biomella: /biomella/i };
const COMPANY_IDS = { blurr: ['517208203'] };

function flagsFor({ data, li, prod, others }) {
  const flags = [];
  if (!data.is_invoice) { flags.push({ code: 'not_invoice', message: 'This file doesn’t look like an invoice or receipt' }); return flags; }
  if (data.document_type === 'quote' || data.document_type === 'proforma') flags.push({ code: 'not_tax_invoice', message: `This is a ${data.document_type === 'quote' ? 'quote' : 'proforma (חשבון עסקה)'} — a tax invoice is still needed` });
  // Billed to the right company?
  const billed = `${data.billed_to_name || ''} ${data.billed_to_tax_id || ''}`;
  const mine = prod.brand_id;
  const other = Object.keys(COMPANY_RE).find(k => k !== mine && (COMPANY_RE[k].test(billed) || (COMPANY_IDS[k] || []).some(id => billed.includes(id))));
  if (other) flags.push({ code: 'wrong_company', message: `Billed to ${companyOf(other).short} — this is a ${companyOf(mine).short} production` });
  else if (!data.billed_to_name && !data.billed_to_tax_id) flags.push({ code: 'no_company', message: 'The invoice doesn’t say which company it’s billed to' });
  // Amount vs the budget line
  const amount = data.amount_before_vat ?? data.total_amount;
  const lineCur = li.currency_code || 'USD';
  if (amount != null && B.num(li.planned_budget) > 0) {
    const invCur = data.currency === 'ILS' || data.currency === 'USD' ? data.currency : null;
    const inLineCur = !invCur || invCur === lineCur ? amount : (invCur === 'ILS' ? amount / fx.latest().rate : amount * fx.latest().rate);
    const gap = inLineCur - B.num(li.planned_budget);
    if (Math.abs(gap) > Math.max(50, B.num(li.planned_budget) * 0.05)) {
      flags.push({ code: gap > 0 ? 'over_budget' : 'under_budget', message: `Invoice ${gap > 0 ? 'is' : 'is'} ${lineCur === 'ILS' ? '₪' : '$'}${Math.round(Math.abs(gap)).toLocaleString('en-US')} ${gap > 0 ? 'over' : 'under'} the line’s budget` });
    }
    if (invCur && invCur !== lineCur) flags.push({ code: 'currency', message: `Invoice is in ${invCur}, the line is in ${lineCur}` });
  }
  // Duplicate invoice number from the same supplier
  if (data.invoice_number) {
    const dup = others.find(o => o.id !== li.id && o.invoice_data?.invoice_number === data.invoice_number
      && (!data.supplier_tax_id || !o.invoice_data?.supplier_tax_id || o.invoice_data.supplier_tax_id === data.supplier_tax_id));
    if (dup) flags.push({ code: 'duplicate', message: `Same invoice number as “${String(dup.item || dup.full_name || '').replace(/<[^>]*>/g, '')}” on ${dup.production_id}` });
  }
  return flags;
}

async function readFile(url) {
  const { fetchLink, claudeImage } = require('../studio/sources');
  const got = await fetchLink(url);
  if (!got?.ok || !got.bytes) throw new Error(got?.note || 'Couldn’t open the invoice file');
  if (got.kind === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: got.bytes.toString('base64') } }];
  if (got.kind === 'image') {
    const img = await claudeImage(got.bytes, got.mime);
    if (!img) throw new Error('Couldn’t read the image');
    return [{ type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data.toString('base64') } }];
  }
  throw new Error(`The invoice is a ${got.kind || 'file'} Claude can’t read`);
}

/** Read one line's invoice now. Returns { data, flags, filled }. */
async function readLine(lineId) {
  const { rows } = await db.query('SELECT * FROM production_line_items WHERE id = $1', [lineId]);
  const li = rows[0];
  if (!li?.invoice_url) throw Object.assign(new Error('This line has no invoice file'), { status: 400 });
  const { rows: pr } = await db.query('SELECT * FROM productions WHERE id = $1', [li.production_id]);
  const prod = pr[0];
  const content = await readFile(li.invoice_url);
  const client = getAnthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: [...content, { type: 'text', text: 'Read this document.' }] }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to read this file');
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Claude returned an unreadable answer'); }

  const { rows: others } = await db.query(
    `SELECT id, production_id, item, full_name, invoice_data FROM production_line_items
      WHERE invoice_data->>'invoice_number' = $1 AND id <> $2`, [data.invoice_number || '__none__', li.id]);
  const flags = flagsFor({ data, li, prod, others });
  await db.query('UPDATE production_line_items SET invoice_data = $2, invoice_flags = $3, invoice_read_at = NOW() WHERE id = $1',
    [li.id, JSON.stringify(data), JSON.stringify(flags)]);

  // Fill the actual amount if it's still empty and the currencies match
  let filled = false;
  const amount = data.amount_before_vat ?? data.total_amount;
  const lineCur = li.currency_code || 'USD';
  const { rows: fresh } = await db.query('SELECT actual_spent FROM production_line_items WHERE id = $1', [li.id]);  // someone may have typed it meanwhile
  if (data.is_invoice && amount != null && fresh[0] && B.num(fresh[0].actual_spent) === 0 && (!data.currency || data.currency === lineCur)) {
    const fin = require('./service');
    const out = await fin.changeLines({
      productionId: li.production_id, ops: [{ op: 'update', id: li.id, values: { actual_spent: amount } }],
      actor: { system: true, name: 'Invoice reader', role: 'Admin' }, source: 'system', allowLocked: true,
    });
    filled = !out.needs;
    if (filled) require('./after').afterLines(li.production_id, out);
  }
  await E.record(db, [{
    brand_id: prod.brand_id, production_id: li.production_id, line_item_id: li.id, kind: flags.length ? 'invoice_flagged' : 'invoice_read',
    label: String(li.item || li.full_name || '').replace(/<[^>]*>/g, ' ').trim(), source: 'system', user_name: 'Invoice reader',
    new_value: amount != null ? `${amount} ${data.currency || ''}`.trim() : null, currency: data.currency || null,
    meta: { invoice_number: data.invoice_number, supplier: data.supplier_name, billed_to: data.billed_to_name, flags: flags.map(f => f.code), filled },
  }]);
  return { data, flags, filled };
}

// A small queue so several invoices attached at once are read one by one
const queue = [];
let busy = false;
function queueLines(ids) {
  for (const id of ids) if (!queue.includes(id)) queue.push(id);
  if (!busy) drain();
}
async function drain() {
  busy = true;
  while (queue.length) {
    const id = queue.shift();
    if (!process.env.ANTHROPIC_API_KEY) break;
    try { await readLine(id); } catch (e) { console.error(`[invoice reader] ${id}:`, e.message); }
  }
  busy = false;
}

module.exports = { readLine, queueLines, flagsFor };
