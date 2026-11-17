const test = require('node:test');
const assert = require('node:assert/strict');
const { trackerForGrowth } = require('../src/lib/growth/productions');
const { growthMay } = require('../src/middleware/auth');

const tracker = {
  brand_id: 'particle', today: '2026-11-17', generated_at: '2026-11-17T10:00:00Z', monday: true,
  people: { 101: { id: '101', name: 'Omer Ben Simon', photo: 'p.jpg' }, 999: { id: '999', name: 'Not on a ticket', photo: null } },
  productions: [{
    id: 'PRD26-37', name: 'Bending Time', stage: 'Post', stage_since: '2026-11-01T00:00:00Z', stage_days: 16,
    production_type: 'Studio Shoot', category: 'TV', product_type: ['Gravité'], producer: 'Tomer Wilf Lezmy', locked: true,
    dates: { planned_start: '2026-10-01', planned_end: '2026-11-30', delivery: '2026-11-25', air: '2026-12-01' },
    shoot: { days: ['2026-10-20'], next: null },
    tracker: { deadline: '2026-11-25', deadline_label: 'TV master', notes: 'Paid the DOP $4,000', links: [{ url: 'x' }], team: [], health: 'on_track' },
    team: { internal: [{ kind: 'internal', name: 'Omer Ben Simon', role: 'Studio', monday_id: '101', photo: 'p.jpg', source: 'monday' }], external: [{ kind: 'external', name: 'Gal Production House', role: 'Service', source: 'budget' }] },
    budget: { planned: 50000, actual: 61000, unpaid: 2, lines: 9, wrap: { overdue: 1 } },
    contract: { status: 'signed', provider: 'Gal Production House' },
    cp_links: [{ title: 'Budget sheet', url: 'y' }],
    latest_update: { author: 'Tomer', body: 'Invoice from Gal is $12k' },
    tasks: { open: 2, overdue: 1, next: [] },
    milestone: { current: { title: 'Online', start: '2026-11-15', end: '2026-11-22' }, next: null },
    casting: { count: 3, warnings: 1 },
    tickets: [{ id: '1', board: 'video', name: 'Gravité | Bending Time | TV', title: 'Gravité', status: { label: 'Working on it', color: '#fdab3d', category: 'working' }, open: true, people: ['101'], requested_by: ['104'], timeline: { from: '2026-11-10', to: '2026-11-24' }, monday_url: 'https://m', links: { frame: 'f' } }],
    signals: [{ kind: 'over_budget', level: 'amber', text: 'Over budget by 22%' }, { kind: 'payment_overdue', level: 'red', text: '1 payment overdue' }, { kind: 'due_soon', level: 'amber', text: 'Due in 8d' }],
  }],
};

test('Growth productions: no money, suppliers, contracts, notes or updates', () => {
  const out = trackerForGrowth(tracker);
  const json = JSON.stringify(out);
  for (const word of ['budget', 'contract', 'Gal Production House', '4,000', '12k', 'external', 'cp_links', 'latest_update', 'casting', 'notes', 'requested_by', 'over_budget', 'payment']) {
    assert.ok(!json.includes(word), `"${word}" must not reach the Growth team`);
  }
  const p = out.productions[0];
  assert.equal(p.name, 'Bending Time');
  assert.deepEqual(p.deadline, { date: '2026-11-25', label: 'TV master' });
  assert.equal(p.team[0].name, 'Omer Ben Simon');
  assert.equal(p.tickets[0].board, 'video');
  assert.deepEqual(p.signals.map(s => s.kind), ['due_soon']);
});

test('Growth productions: only the people on the tickets are sent', () => {
  const out = trackerForGrowth(tracker);
  assert.deepEqual(Object.keys(out.people), ['101']);
});

test('Growth gate: TV Productions endpoint open, the full tracker closed', () => {
  assert.ok(growthMay('GET', '/api/growth/productions'));
  assert.ok(!growthMay('GET', '/api/tracker'));
});
