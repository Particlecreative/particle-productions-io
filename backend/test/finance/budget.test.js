const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../../src/lib/finance/budget');
const R = require('../../src/lib/finance/rules');

const line = (o) => ({ id: o.id || Math.random().toString(36).slice(2), item: 'Line', currency_code: 'USD', planned_budget: 0, actual_spent: 0, ...o });
const RATE = 3.0;

test('autoPlanned: estimate + 10%, or + the explicit unexpected line', () => {
  assert.equal(B.autoPlanned([line({ planned_budget: 1000 }), line({ planned_budget: 3000, currency_code: 'ILS' })], RATE), 2200);
  assert.equal(B.autoPlanned([line({ planned_budget: 1000 }), line({ item: 'Unexpected', planned_budget: 50 })], RATE), 1050);
  assert.equal(B.autoPlanned([], RATE), null);
});

test('budgetState: after approval the buffer is Planned − lines at the approval rate', () => {
  const prod = { budget_approved_at: '2026-10-28', planned_budget_2026: 2200, approved_core: 2000, approved_fx_rate: 3.0 };
  const lines = [line({ planned_budget: 1000 }), line({ planned_budget: 4500, currency_code: 'ILS' })]; // 1000 + 1500
  const st = B.budgetState(prod, lines, 4.0); // today's rate is ignored once approved
  assert.equal(st.core, 2500);
  assert.equal(st.bufferTotal, 200);
  assert.equal(st.bufferLeft, -300);
  assert.equal(st.over, 300);
  assert.equal(st.usedPct, 250);
});

test('classifyChange: in the buffer vs over Planned; unexpected line edits have no impact', () => {
  const prod = { budget_approved_at: 'x', planned_budget_2026: 2200, approved_core: 2000, approved_fx_rate: RATE };
  const a = line({ id: 'a', planned_budget: 2000 });
  assert.deepEqual(B.classifyChange(prod, [a], [{ ...a, planned_budget: 2100 }], RATE).inBuffer, true);
  const over = B.classifyChange(prod, [a], [{ ...a, planned_budget: 2500 }], RATE);
  assert.equal(over.inBuffer, false);
  assert.equal(over.overBy, 300);
  const u = line({ id: 'u', item: 'Unexpected', planned_budget: 100 });
  assert.equal(B.classifyChange(prod, [a, u], [a, { ...u, planned_budget: 50 }], RATE).impact, false);
});

test('cutting costs while already over Planned is not "over Planned"; unexpected lines are word-bounded', () => {
  const prod = { budget_approved_at: 'x', planned_budget_2026: 10000, approved_core: 9000, approved_fx_rate: RATE };
  const a = line({ id: 'a', planned_budget: 12000 });
  const cut = B.classifyChange(prod, [a], [{ ...a, planned_budget: 11500 }], RATE);
  assert.equal(cut.inBuffer, true);
  assert.equal(B.isUnexpected(line({ item: 'קבלת ציוד' })), false);
  assert.equal(B.isUnexpected(line({ item: 'בלתי צפוי' })), true);
  assert.equal(B.isUnexpected(line({ item: 'בלת"מ' })), true);
  assert.equal(B.isUnexpected(line({ item: 'Contingency' })), true);
  // an unexpected line counts only what was spent on it
  assert.equal(B.financeCost(line({ item: 'Unexpected', planned_budget: 500, actual_spent: 0 })), 0);
  assert.equal(B.financeCost(line({ item: 'Unexpected', planned_budget: 500, actual_spent: 120 })), 120);
});

test('expectedCost: invoiced/paid lines use the actual, others the larger of planned and actual', () => {
  assert.equal(B.expectedCost(line({ planned_budget: 1000, actual_spent: 900, invoice_status: 'Received' })), 900);
  assert.equal(B.expectedCost(line({ planned_budget: 1000, actual_spent: 400 })), 1000);
  assert.equal(B.expectedCost(line({ planned_budget: 1000, actual_spent: 1300 })), 1300);
});

test('costAllocation: split by days across months; override wins; production dates as fallback', () => {
  const a = B.costAllocation(line({ timeline_start: '2026-10-25', timeline_end: '2026-11-05' }), {});
  assert.deepEqual(a.map(x => x.month), ['2026-10-01', '2026-11-01']);
  assert.ok(Math.abs(a[0].share - 7 / 12) < 1e-9);
  assert.deepEqual(B.costAllocation(line({ timeline_start: '2026-10-25', expense_month: '2026-12-01' }), {}), [{ month: '2026-12-01', share: 1 }]);
  assert.deepEqual(B.costAllocation(line({}), { planned_start: '2026-09-10', planned_end: '2026-09-20' }), [{ month: '2026-09-01', share: 1 }]);
  assert.deepEqual(B.costAllocation(line({}), {}), []);
  // pg DATE values come back as local-midnight Dates
  assert.equal(B.ymdOf(new Date(2026, 9, 1)), '2026-10-01');
});

test('spanFromLines, financeCode, normalizeStage', () => {
  assert.deepEqual(B.spanFromLines([line({ timeline_start: '2026-10-05', timeline_end: '2026-10-07' }), line({ timeline_end: '2026-11-02' }), line({})]), { start: '2026-10-05', end: '2026-11-02' });
  assert.equal(B.spanFromLines([line({})]), null);
  assert.equal(B.financeCode('PRD26-37'), '26-37');
  assert.equal(B.financeCode('PRD26-37-01'), '26-37-01');
  assert.equal(B.financeCode('PRD26-7'), '26-07');
  assert.equal(B.normalizeStage('Pre-Production'), 'Pre Production');
  assert.equal(B.normalizeStage('Post Production'), 'Post');
  assert.equal(B.normalizeStage('Something else'), 'Something else');
});

const base = { brand_id: 'particle', production_id: 'PRD26-37', source: 'cp' };
test('evaluateLine: approved budget — reason needed, then approver when over Planned', () => {
  const prod = { budget_approved_at: 'x', planned_budget_2026: 2200, approved_core: 2000, approved_fx_rate: RATE, stage: 'Post' };
  const a = line({ id: 'a', planned_budget: 2000, timeline_start: '2026-11-01', timeline_end: '2026-11-02' });
  const ctx = (newAmt, decision) => R.evaluateLine({ prod, before: [a], after: [{ ...a, planned_budget: newAmt }], oldLine: a, newLine: { ...a, planned_budget: newAmt }, op: 'update', decision, todayMonth: '2026-10-01', rate: RATE, base });
  assert.equal(ctx(2100).needs.mode, 'in_buffer');
  const ok = ctx(2100, { reason: 'post_revision' });
  assert.equal(ok.needs, null);
  assert.equal(ok.events[0].in_buffer, true);
  assert.equal(ok.events[0].notify, undefined); // log only (no email)
  assert.equal(ctx(2600, { reason: 'scope_change' }).needs.need_approver, true);
  const up = ctx(2600, { reason: 'scope_change', approved_by: 'Ayal Ebert', new_planned: 3000 });
  assert.equal(up.raisePlannedTo, 3000);
  assert.ok(up.events.some(e => e.kind === 'budget_increase' && e.new_value === 3000));
});

test('evaluateLine: a cost change in a past month alerts finance (not when finance made it in the sheet)', () => {
  const prod = { stage: 'Completed', planned_budget_2026: 0 };
  const a = line({ id: 'a', planned_budget: 1000, timeline_start: '2026-08-02', timeline_end: '2026-08-03' });
  const run = (source) => R.evaluateLine({ prod, before: [a], after: [{ ...a, actual_spent: 1300 }], oldLine: a, newLine: { ...a, actual_spent: 1300 }, op: 'update', todayMonth: '2026-10-01', rate: RATE, base: { ...base, source } });
  const h = run('cp').events.find(e => e.kind === 'historical_change');
  assert.equal(h.delta_usd, 300);
  assert.equal(h.expense_month, '2026-08-01');
  assert.equal(run('sheet').events.find(e => e.kind === 'historical_change').notify, null);
  // An invoice / actual coming in late is routine: small → log only; a big gap → bundled; a re-priced line → urgent (default)
  assert.equal(run('cp').events.find(e => e.kind === 'historical_change').notify, null);
  const big = R.evaluateLine({ prod, before: [a], after: [{ ...a, actual_spent: 3000 }], oldLine: a, newLine: { ...a, actual_spent: 3000 }, op: 'update', todayMonth: '2026-10-01', rate: RATE, base });
  assert.equal(big.events.find(e => e.kind === 'historical_change').notify, 'bundle');
  const repriced = R.evaluateLine({ prod, before: [a], after: [{ ...a, planned_budget: 1200 }], oldLine: a, newLine: { ...a, planned_budget: 1200 }, op: 'update', todayMonth: '2026-10-01', rate: RATE, base });
  assert.equal('notify' in repriced.events.find(e => e.kind === 'historical_change'), false);
  // Pending productions (still planning) don't alert
  assert.equal(R.evaluateLine({ prod: { stage: 'Pending' }, before: [a], after: [{ ...a, actual_spent: 1300 }], oldLine: a, newLine: { ...a, actual_spent: 1300 }, op: 'update', todayMonth: '2026-10-01', rate: RATE, base }).events.some(e => e.kind === 'historical_change'), false);
});

test('evaluateDates: start moving to a later month is a postponement (asks about work this month)', () => {
  const prod = { stage: 'Pre Production' };
  const before = { start: '2026-10-01', end: '2026-10-29' }, after = { start: '2026-11-05', end: '2026-12-03' };
  const n = R.evaluateDates({ prod, before, after, todayMonth: '2026-10-01', base });
  assert.equal(n.needs.code, 'postpone_required');
  assert.equal(n.needs.ask_work, true);
  const ok = R.evaluateDates({ prod, before, after, flow: { note: 'Client moved it', work_this_month: false }, todayMonth: '2026-10-01', base });
  assert.equal(ok.events[0].kind, 'postponed');
  assert.equal(ok.events[0].meta.work_this_month, false);
  // later end only (extension), same month, Pending, or closed: no prompt
  assert.equal(R.evaluateDates({ prod, before, after: { start: '2026-10-01', end: '2026-11-20' }, todayMonth: '2026-10-01', base }).needs, null);
  assert.equal(R.evaluateDates({ prod: { stage: 'Pending' }, before, after, todayMonth: '2026-10-01', base }).needs, null);
  assert.equal(R.evaluateDates({ prod: { ...prod, locked: true }, before, after, todayMonth: '2026-10-01', base }).needs, null);
});
