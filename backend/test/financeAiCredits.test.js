// AI credits before Wrap-up (24 Nov 2026): how many credits → actual = credits × $0.065 on each AI line.
const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../src/lib/finance/aiCredits');

const LINES = [
  { id: 'a', item: 'AI Credits 1 Isaac', full_name: 'Higgsfield Inc', planned_budget: '5000.00', actual_spent: '613.00', currency_code: 'USD', custom_fields: {} },
  { id: 'b', item: 'AI image assets', full_name: 'Higgsfield Inc.', planned_budget: '2000.00', actual_spent: '0', currency_code: 'ILS', custom_fields: {} },
  { id: 'c', item: 'Online Editor', full_name: 'Amit Bensangi', planned_budget: '1650', currency_code: 'ILS', custom_fields: {} },
  { id: 'd', item: 'AI Credits 2', full_name: 'Higgsfield', planned_budget: '1500', currency_code: 'USD', custom_fields: { custom_ai_credits: 12000 } },
];

test('AI credits: which lines ask, and which were already answered', () => {
  assert.deepEqual(AI.aiLines(LINES).map(l => l.id), ['a', 'b', 'd']);
  assert.deepEqual(AI.pending(LINES).map(l => l.id), ['a', 'b']);
  assert.deepEqual(AI.pending([{ item: 'AI Artist', full_name: 'Ofri Margalit' }]), []);
});

test('AI credits: the cost — $0.065 a credit, ILS lines at today’s rate', () => {
  assert.deepEqual(AI.costOf(12400, { price: 0.065 }), { usd: 806, amount: 806 });
  assert.deepEqual(AI.costOf(10000, { price: 0.065, currency: 'ILS', rate: 3.25 }), { usd: 650, amount: 2112.5 });
  assert.deepEqual(AI.costOf(-5), { usd: 0, amount: 0 });
});

test('AI credits: the question carries every AI line with its plan and what was entered', () => {
  const p = AI.prompt({ prod: { id: 'PRD26-18', project_name: 'Gravité' }, lines: LINES, to: 'Wrap-up', price: 0.065, rate: 3.2 });
  assert.equal(p.code, 'ai_credits');
  assert.equal(p.stage, 'Wrap-up');
  assert.deepEqual(p.lines.map(l => [l.id, l.planned, l.currency, l.credits, l.done]), [['a', 5000, 'USD', null, false], ['b', 2000, 'ILS', null, false], ['d', 1500, 'USD', 12000, true]]);
});

test('AI credits: the answer becomes each line’s actual, only for AI lines, whole non-negative numbers', () => {
  const ans = AI.parseAnswer({ a: '12,400', b: 10000, c: 999, x: 5, d: -3 }, LINES);
  assert.deepEqual(ans, { a: 12400, b: 10000 });
  assert.deepEqual(AI.updatesFor(ans, LINES, { price: 0.065, rate: 3.25 }), [
    { op: 'update', id: 'a', values: { actual_spent: 806, custom_ai_credits: 12400, custom_ai_credit_price: 0.065 } },
    { op: 'update', id: 'b', values: { actual_spent: 2112.5, custom_ai_credits: 10000, custom_ai_credit_price: 0.065 } },
  ]);
});

// The budget table's credits editor (src/lib/aiCredits.js) must agree with the server on which lines are AI lines,
// what's saved, and the cost — or a typed-in line would still be asked at Wrap-up, or show a different number.
test('AI credits: the budget table works it out the same way as the server', async () => {
  const path = require('path');
  const { pathToFileURL } = require('url');
  const AUTO = require('../src/lib/finance/autoRules');
  const W = await import(pathToFileURL(path.join(__dirname, '../../src/lib/aiCredits.js')).href);
  const more = [...LINES,
    { id: 'e', item: 'Higgsfield subscription' }, { id: 'f', item: 'AI tools', full_name: '' }, { id: 'g', item: 'Hair & makeup', full_name: 'Aimee Cohen' },
    { id: 'h', item: 'Editing', supplier: 'higgsfield.ai' }, { id: 'i', item: 'Paid AI platform' }, { id: 'j', item: 'Retail' },
    { id: 'k', item: 'AI credits', custom_fields: JSON.stringify({ custom_ai_credits: 500 }) }, { id: 'l', item: 'AI credits', custom_fields: { custom_ai_credits: null } }];
  for (const l of more) {
    assert.equal(W.isAiCredits(l), AUTO.isAiCredits(l), `isAiCredits ${l.id}`);
    if (typeof l.custom_fields !== 'string') assert.equal(W.creditsOf(l), AI.creditsOf(l), `creditsOf ${l.id}`);
  }
  assert.equal(W.creditsOf(more.find(l => l.id === 'k')), 500);
  for (const [n, cur] of [[12400, 'USD'], [10000, 'ILS'], [0, 'USD'], [7, 'ILS'], [123457, 'USD']]) {
    assert.deepEqual(W.creditCost(n, { price: 0.065, currency: cur, rate: 3.25 }), AI.costOf(n, { price: 0.065, currency: cur, rate: 3.25 }));
  }
  assert.equal(W.DEFAULT_PRICE, AI.DEFAULT_PRICE);
});
