const test = require('node:test');
const assert = require('node:assert');
const { signalsFor } = require('../../src/lib/tracker/data');
const { cleanPatch } = require('../../src/routes/tracker');

const base = (over = {}) => ({
  stage: 'Production',
  tracker: null,
  shoot: { days: [], next: null },
  contract: null,
  budget: { planned: 0, actual: 0 },
  tasks: { overdue: 0 },
  tickets: [],
  casting: { warnings: 0 },
  last_activity: '2026-10-25T10:00:00Z',
  ...over,
});
const kinds = (p) => signalsFor(p, '2026-10-26').map(s => s.kind);

test('deadline: passed, due soon, missing', () => {
  assert.deepStrictEqual(kinds(base({ tracker: { deadline: '2026-10-20' } })), ['overdue']);
  assert.deepStrictEqual(kinds(base({ tracker: { deadline: '2026-10-30' } })), ['due_soon']);
  assert.deepStrictEqual(kinds(base({ tracker: { deadline: '2026-12-01' } })), []);
  assert.deepStrictEqual(kinds(base()), ['no_deadline']);
});

test('a shoot close by without a signed contract is red', () => {
  const s = signalsFor(base({ tracker: { deadline: '2026-12-01' }, shoot: { next: '2026-11-02' }, contract: { status: 'sent' } }), '2026-10-26');
  assert.strictEqual(s[0].kind, 'shoot_no_contract');
  assert.strictEqual(s[0].level, 'red');
  assert.deepStrictEqual(kinds(base({ tracker: { deadline: '2026-12-01' }, shoot: { next: '2026-11-02' }, contract: { status: 'signed' } })), []);
});

test('budget, tasks, stuck tickets, stale', () => {
  const p = base({
    tracker: { deadline: '2026-12-01' },
    budget: { planned: 1000, actual: 1200 },
    tasks: { overdue: 2 },
    tickets: [{ open: true, status: { category: 'stuck' } }, { open: false, status: { category: 'stuck' } }],
    last_activity: '2026-10-01T10:00:00Z',
  });
  assert.deepStrictEqual(kinds(p), ['over_budget', 'tasks_overdue', 'stuck_ticket', 'stale']);
});

test('completed productions raise nothing', () => {
  assert.deepStrictEqual(kinds(base({ stage: 'Completed', tracker: { deadline: '2026-01-01' } })), []);
});

test('tracker patch: only web links, named team, known health', () => {
  const p = cleanPatch({ deadline: '2026-11-03', links: [{ title: 'Offline', url: 'https://f.io/abc' }], team: [{ kind: 'external', name: ' Dana ', role: 'DOP' }], health: 'at_risk' });
  assert.strictEqual(p.deadline, '2026-11-03');
  assert.strictEqual(p.links[0].url, 'https://f.io/abc');
  assert.ok(p.links[0].id);
  assert.deepStrictEqual({ kind: p.team[0].kind, name: p.team[0].name, role: p.team[0].role }, { kind: 'external', name: 'Dana', role: 'DOP' });
  assert.throws(() => cleanPatch({ links: [{ url: 'javascript:alert(1)' }] }), /Not a web link/);
  assert.throws(() => cleanPatch({ health: 'great' }), /Unknown health/);
  assert.throws(() => cleanPatch({ deadline: 'soon' }), /date/);
  assert.deepStrictEqual(Object.keys(cleanPatch({ notes: 'x' })), ['notes']);
});

const { searchWord, inWindow } = require('../../src/lib/tracker/data');

test('a production is searched on Monday by its most distinctive word', () => {
  assert.strictEqual(searchWord({ project_name: 'The Bumper Project', product_type: ['Face Cream'] }), 'bumper');
  assert.strictEqual(searchWord({ project_name: 'Black Friday 2026', product_type: [] }), 'friday');
  assert.strictEqual(searchWord({ project_name: 'Face Cream', product_type: ['Face Cream'] }), null);
});

test('automatic matches must be from the production’s time', () => {
  const p = { stage: 'Production', planned_start: '2026-10-01', planned_end: '2026-11-30', created_at: '2026-09-20T10:00:00Z' };
  assert.ok(inWindow({ timeline: { from: '2026-10-25' } }, p, '2026-10-26'));
  assert.ok(!inWindow({ timeline: { from: '2025-11-20' } }, p, '2026-10-26'), 'last year’s Black Friday ticket');
  assert.ok(inWindow({ created_at: '2026-10-25T09:10:33Z' }, p, '2026-10-26'));
  // A live production past its planned end still collects new tickets
  assert.ok(inWindow({ timeline: { from: '2027-03-01' } }, { ...p, planned_end: '2026-12-01' }, '2027-02-15'));
});

test('a deadline that isn’t a date never breaks the tracker', () => {
  assert.doesNotThrow(() => signalsFor(base({ tracker: { deadline: 'Tue Dec 15' } }), '2026-10-26'));
});
