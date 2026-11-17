const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../../src/lib/finance/wrapup');
const B = require('../../src/lib/finance/budget');
const tpl = require('../../src/lib/finance/templates');
const { signalsFor } = require('../../src/lib/tracker/data');

const TODAY = '2026-11-17';
const line = (over = {}) => ({ id: Math.random().toString(36).slice(2), full_name: 'Supplier', item: 'Editor', planned_budget: 1000, actual_spent: 0, payment_status: 'Not Paid', currency_code: 'USD', payment_due: null, ...over });

test('Wrap-up is its own stage: spelled one way, not done, finance knows it', () => {
  for (const s of ['Wrap-up', 'wrap up', 'WRAPUP', 'Final payments']) assert.equal(B.normalizeStage(s), 'Wrap-up');
  assert.equal(B.isDone('Wrap-up'), false);
  assert.equal(B.financeKnows({ stage: 'Wrap-up' }), true);
  assert.equal(W.isWrap('wrap-up'), true);
  assert.equal(W.isWrap('Post'), false);
});

test('open lines: an unpaid invoice, or a budget with no invoice yet — paid and empty lines are done', () => {
  const lines = [
    line({ actual_spent: 500 }),                                  // invoice not paid
    line({ actual_spent: 0, planned_budget: 800 }),              // no invoice yet
    line({ actual_spent: 900, payment_status: 'Paid' }),         // paid
    line({ actual_spent: 0, planned_budget: 0 }),                // nothing on it
    line({ actual_spent: 300, payment_status: 'Pending' }),      // still owed
  ];
  const o = W.openLines(lines);
  assert.equal(o.unpaid.length, 2);
  assert.equal(o.noInvoice.length, 1);
  assert.equal(W.settled(lines), false);
  assert.equal(W.settled([line({ actual_spent: 1, payment_status: 'paid' }), line({ planned_budget: 0 })]), true);
  assert.equal(W.settled([]), false, 'no lines in CP → nothing to judge, never completes by itself');
});

test('summary: owed per currency, overdue first, next due date', () => {
  const s = W.summary([
    line({ full_name: 'Late', actual_spent: 1000, payment_due: '2026-11-10' }),
    line({ full_name: 'Soon', actual_spent: 2500, currency_code: 'ILS', payment_due: new Date('2026-11-29T00:00:00Z') }),
    line({ full_name: 'Later', actual_spent: 200, payment_due: '2026-12-20' }),
    line({ full_name: 'No invoice', planned_budget: 700 }),
    line({ full_name: 'Paid', actual_spent: 999, payment_status: 'Paid' }),
  ], TODAY);
  assert.equal(s.open, 4);
  assert.equal(s.unpaid, 3);
  assert.equal(s.no_invoice, 1);
  assert.deepEqual(s.owed, { USD: 1200, ILS: 2500 });
  assert.equal(s.overdue, 1);
  assert.equal(s.next_due, '2026-11-29');
  assert.deepEqual(s.lines.map(l => l.supplier), ['Late', 'Soon', 'Later', 'No invoice']);
  assert.equal(s.lines[3].kind, 'no_invoice');
  assert.equal(W.owedText(s.owed), '$1,200 + ₪2,500');
});

test('the guard: Completed while suppliers are owed asks — unless "complete anyway", or it was already done', () => {
  const owed = [line({ actual_spent: 400 })];
  const paid = [line({ actual_spent: 400, payment_status: 'Paid' })];
  assert.ok(W.guard({ from: 'Post', to: 'Completed', lines: owed, today: TODAY }));
  assert.ok(W.guard({ from: 'Wrap-up', to: 'Completed', lines: owed, today: TODAY }));
  assert.equal(W.guard({ from: 'Post', to: 'Completed', lines: owed, answer: 'complete', today: TODAY }), null);
  assert.equal(W.guard({ from: 'Post', to: 'Completed', lines: paid, today: TODAY }), null);
  assert.equal(W.guard({ from: 'Post', to: 'Wrap-up', lines: owed, today: TODAY }), null);
  assert.equal(W.guard({ from: 'Completed', to: 'Completed', lines: owed, today: TODAY }), null);
  assert.equal(W.guard({ from: 'Post', to: 'Completed', lines: [], today: TODAY }), null, 'no lines → nothing to ask about');
});

test('finance email: Wrap-up lists what is left to pay; an auto-complete says every supplier is paid', () => {
  const prod = { id: 'PRD26-20', project_name: 'The Hunt', brand_id: 'particle', stage: 'Wrap-up', planned_start: '2026-09-01', planned_end: '2026-09-30' };
  const s = W.summary([line({ full_name: 'Edit House', actual_spent: 1300, currency_code: 'ILS', payment_due: '2026-11-29' })], TODAY);
  const wrap = { kind: 'wrapup', old_value: 'Post', new_value: 'Wrap-up', label: 'The Hunt', created_at: '2026-11-17T10:00:00Z', meta: { ...s, lines: s.lines } };
  const a = tpl.changes({ prod, events: [wrap], state: null });
  assert.match(a.subject, /post finished — paying the suppliers/);
  assert.match(a.html, /no more work is coming/);
  assert.match(a.html, /Edit House/);
  assert.match(a.html, /₪1,300/);
  assert.match(a.html, /Moved to Wrap-up/);
  const done = { kind: 'completed', old_value: 'Wrap-up', new_value: 'Completed', label: 'The Hunt', created_at: '2026-11-20T10:00:00Z', meta: { auto: true, work_this_month: false } };
  const b = tpl.changes({ prod: { ...prod, stage: 'Completed' }, events: [wrap, done], state: null });
  assert.match(b.subject, /every supplier paid — Completed/);
  assert.match(b.html, /marked it <b>Completed<\/b> by itself/);
});

test('tracker: a Wrap-up production only signals payments (no deadline / stale noise)', () => {
  const p = {
    stage: 'Wrap-up', tracker: { deadline: '2026-10-01' }, shoot: { days: [], next: null }, contract: null,
    budget: { planned: 0, actual: 0, wrap: { open: 3, unpaid: 2, no_invoice: 1, overdue: 1, next_due: '2026-11-20', owed: { USD: 900 } } },
    tasks: { overdue: 2 }, tickets: [], casting: { warnings: 0 }, last_activity: '2026-09-01T10:00:00Z',
  };
  const kinds = signalsFor(p, TODAY).map(s => s.kind);
  assert.deepEqual(kinds, ['payment_overdue', 'payment_due', 'no_invoice']);
});
