// Automatic payment rules (24 Nov 2026): AI credits / Higgsfield → Paid, no invoice, no contract;
// repeating suppliers (Assaf Almog, Amit Bensangi…) → no contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/lib/finance/autoRules');

test('AI credits: the real line names', () => {
  for (const l of [{ item: 'AI Credits' }, { item: 'Ai credits 2' }, { item: 'AI Credits 1 Isaac', full_name: 'Higgsfield Inc' }, { item: 'AI Platform 2', full_name: 'Higgsfield Inc' },
    { item: 'AI Tools' }, { item: 'Higgsfield 3 PRD26-37/01', full_name: 'AI Credits for Ofri Margalit' }, { item: 'AI image assets', full_name: 'Higgsfield Inc.' }]) {
    assert.ok(A.isAiCredits(l), JSON.stringify(l));
  }
  for (const l of [{ item: 'AI Artist PRD26-37/01', full_name: 'Ofri Margalit' }, { item: 'AI video assets', full_name: 'Weavy.AI' }, { item: 'Online Editor', full_name: 'Amit Bensangi' },
    { item: 'Retail', full_name: 'Kaiser' }, { item: 'Hair & makeup', full_name: 'Aisha' }]) {
    assert.ok(!A.isAiCredits(l), JSON.stringify(l));
  }
});

test('AI credits: a new line lands Paid with no invoice needed', () => {
  assert.deepEqual(A.aiLineValues({ item: 'AI Credits', planned_budget: 5000 }, null),
    { payment_status: 'Paid', paid_by: 'Auto: AI credits', payment_note: 'AI credits — paid by card, no invoice', invoice_status: 'Waived' });
  // a name typed into an empty line
  assert.equal(A.aiLineValues({ full_name: 'Higgsfield Inc' }, { item: '', full_name: '', payment_status: 'Not Paid', invoice_status: null }).payment_status, 'Paid');
});

test('AI credits: never overrides what someone set, and leaves lines that already were AI credits alone', () => {
  assert.deepEqual(A.aiLineValues({ item: 'AI Credits', payment_status: 'Not Paid', invoice_status: 'Pending' }, null), {});
  assert.deepEqual(A.aiLineValues({ actual_spent: 900 }, { item: 'AI Credits', payment_status: 'Not Paid' }), {}, 'set back to Not Paid (a reimbursement) stays');
  assert.deepEqual(A.aiLineValues({ item: 'AI Credits 2' }, { item: 'AI Credits', payment_status: 'Not Paid' }), {});
  assert.deepEqual(A.aiLineValues({ item: 'AI Credits' }, { item: '', payment_status: 'Paid', invoice_status: 'Received' }), {}, 'already paid, invoice in');
  assert.deepEqual(A.aiLineValues({ item: 'Online Editor' }, null), {});
});

test('No contract: AI credits, repeating suppliers (any spelling), "Worked with before" — not cast, not card purchases, not first-timers', () => {
  const others = [{ production_id: 'PRD26-04', full_name: 'Amit Ben Sangi' }, { production_id: 'PRD26-08', full_name: 'Assaf Almog' }, { production_id: 'PRD26-50', full_name: 'Dana Newcomer' }];
  assert.equal(A.noContractReason({ production_id: 'PRD26-50', item: 'AI Credits' }, others), 'AI credits');
  assert.equal(A.noContractReason({ production_id: 'PRD26-50', full_name: 'Amit BenSangi', type: 'Post' }, others), 'Repeating supplier');
  assert.equal(A.noContractReason({ production_id: 'PRD26-50', full_name: 'assaf almog', type: 'Crew' }, others), 'Repeating supplier');
  assert.equal(A.noContractReason({ production_id: 'PRD26-50', full_name: 'Dana Newcomer', type: 'Crew' }, others), null, 'only this production');
  assert.equal(A.noContractReason({ production_id: 'PRD26-51', full_name: 'Someone New', supplier_type: 'Worked with before' }, others), 'Worked with before');
  assert.equal(A.noContractReason({ production_id: 'PRD26-50', full_name: 'Assaf Almog', type: 'Cast' }, others), null, 'talent always needs a contract');
  assert.equal(A.noContractReason({ production_id: 'PRD26-50', full_name: 'Assaf Almog', cc_purchase_id: 'cc-1' }, others), null);
  assert.equal(A.supplierKey('Amit Ben Sangi'), A.supplierKey('amit bensangi'));
});

test('No contract: written as waived only where there is no contract yet', async () => {
  const q = [];
  const client = { query: async (sql, params) => {
    q.push([sql.replace(/\s+/g, ' ').trim().slice(0, 40), params]);
    if (/FROM contracts/.test(sql)) return { rows: [{ production_id: 'PRD26-60_li_b' }] };
    if (/FROM production_line_items/.test(sql)) return { rows: [{ production_id: 'PRD26-04', full_name: 'Amit Bensangi' }] };
    return { rows: [] };
  } };
  const done = await A.waiveContracts(client, [
    { id: 'a', production_id: 'PRD26-60', item: 'AI Credits' },
    { id: 'b', production_id: 'PRD26-60', item: 'AI Credits 2' },            // already has a contract row
    { id: 'c', production_id: 'PRD26-60', full_name: 'Amit Ben Sangi' },
    { id: 'd', production_id: 'PRD26-60', full_name: 'First Timer' },
  ]);
  assert.deepEqual(done, [{ id: 'a', reason: 'AI credits' }, { id: 'c', reason: 'Repeating supplier' }]);
  const inserts = q.filter(([s]) => s.startsWith('INSERT INTO contracts'));
  assert.deepEqual(inserts.map(([, p]) => p[0]), ['PRD26-60_li_a', 'PRD26-60_li_c']);
});
