/**
 * One-time pass of the automatic payment rules (lib/finance/autoRules.js) over lines that existed before them.
 * Only productions that aren't Completed. Dry run by default — prints what it would do.
 *
 *   node src/scripts/paymentAutoRules.js                 → dry run
 *   node src/scripts/paymentAutoRules.js --apply         → "No contract needed" + AI lines' invoice → No invoice needed
 *   node src/scripts/paymentAutoRules.js --apply --paid  → also marks unpaid AI-credit lines Paid
 *   --skip=<line id>,<line id>                           → leave these lines alone (e.g. a reimbursement)
 */
const db = require('../db');
const AUTO = require('../lib/finance/autoRules');
const fin = require('../lib/finance/service');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const PAID = args.includes('--paid');
const SKIP = new Set((args.find(a => a.startsWith('--skip=')) || '').slice(7).split(',').filter(Boolean));
const actor = { system: true, name: 'Auto rules' };

(async () => {
  const { rows: lines } = await db.query(
    `SELECT l.* FROM production_line_items l JOIN productions p ON p.id = l.production_id
      WHERE coalesce(p.stage, '') NOT ILIKE 'completed%' ORDER BY l.production_id, l.sort_order NULLS LAST`);
  const todo = lines.filter(l => !SKIP.has(l.id));

  // 1. No contract needed
  const keys = todo.map(l => `${l.production_id}_li_${l.id}`);
  const { rows: have } = await db.query('SELECT production_id FROM contracts WHERE production_id = ANY($1::text[])', [keys]);
  const exists = new Set(have.map(h => h.production_id));
  const { rows: others } = await db.query(`SELECT production_id, full_name FROM production_line_items WHERE coalesce(full_name, '') <> '' AND production_id IS NOT NULL`);
  const noContract = todo.filter(l => !exists.has(`${l.production_id}_li_${l.id}`) && AUTO.noContractReason(l, others));
  console.log(`No contract needed: ${noContract.length} line(s)`);
  for (const l of noContract) console.log(`  ${l.production_id} | ${l.item || ''} | ${l.full_name || ''} → ${AUTO.noContractReason(l, others)}`);

  // 2. AI credits: no invoice needed (and Paid, with --paid)
  const ai = todo.filter(l => AUTO.isAiCredits(l));
  const inv = ai.filter(l => !String(l.invoice_status || '').trim());
  const unpaid = ai.filter(l => !l.payment_status || /^not paid$/i.test(l.payment_status));
  console.log(`AI credits → No invoice needed: ${inv.length} line(s)`);
  for (const l of inv) console.log(`  ${l.production_id} | ${l.item || ''} | ${l.full_name || ''}`);
  console.log(`AI credits still Not Paid: ${unpaid.length} line(s)${PAID ? ' → Paid' : ' (left as they are — add --paid to mark them Paid)'}`);
  for (const l of unpaid) console.log(`  ${l.id} | ${l.production_id} | ${l.item || ''} | ${l.full_name || ''} | spent ${l.actual_spent} ${l.currency_code}`);

  if (!APPLY) { console.log('\nDry run — nothing written. Add --apply to write.'); await db.end(); return; }

  const done = await AUTO.waiveContracts(db, noContract);
  console.log(`Wrote "No contract needed" on ${done.length} line(s)`);
  const byProd = new Map();
  for (const l of inv) (byProd.get(l.production_id) || byProd.set(l.production_id, new Map()).get(l.production_id)).set(l.id, { invoice_status: 'Waived' });
  if (PAID) for (const l of unpaid) {
    const m = byProd.get(l.production_id) || byProd.set(l.production_id, new Map()).get(l.production_id);
    m.set(l.id, { ...(m.get(l.id) || {}), payment_status: 'Paid', paid_by: 'Auto: AI credits', payment_note: 'AI credits — paid by card, no invoice' });
  }
  for (const [productionId, m] of byProd) {
    const out = await fin.changeLines({ productionId, ops: [...m].map(([id, values]) => ({ op: 'update', id, values })), actor, source: 'system' });
    console.log(`  ${productionId}: ${out.needs ? `needs a decision — skipped (${out.needs.kind || 'approval'})` : `${out.rows.length} line(s) updated`}`);
    if (!out.needs) require('../lib/finance/after').afterLines(productionId, out);
  }
  setTimeout(() => db.end().then(() => process.exit(0)), 3000);   // let the sheet sync start
})().catch(async (e) => { console.error('ERR', e.message); await db.end().catch(() => {}); process.exit(1); });
