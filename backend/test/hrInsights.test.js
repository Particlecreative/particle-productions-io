// My employees — reading a day, vacation vs sick, workdays in a request, who may call what.
//   cd backend && node --test test/hrInsights.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/lib/hr/insights');
const { creativeMay, growthMay } = require('../src/middleware/auth');

test('a day read in words: length, from–to, the tickets, the gap, the moves, a forgotten clock-out', () => {
  const s = I.readDay({ date: '2026-11-24', workday: true, hours: 8.5, in: '2026-11-24T07:10:00Z', out: '2026-11-24T15:40:00Z',
    tasks: [{ name: 'Face Cream | Hook test', ms: 5 * 3.6e6 }, { name: 'NeoRoot | Cut v2', ms: 1 * 3.6e6 }, { name: 'tiny', ms: 5 * 60000 }],
    moves: [{ name: 'Face Cream | Hook test', to: 'Review', at: Date.parse('2026-11-24T13:20:00Z') }] }, 9);
  assert.match(s, /^Full day: 8h 30m \(09:10–17:40\)\./);
  assert.match(s, /Worked on Face Cream \| Hook test \(5h\), NeoRoot \| Cut v2 \(1h\)\./);
  assert.doesNotMatch(s, /tiny/);                                   // under 10 minutes isn't worth a line
  assert.match(s, /2h 30m not in Working on any task/);
  assert.match(s, /Moved: Face Cream \| Hook test → Review at 15:20/);
  assert.match(I.readDay({ workday: true, hours: 3, in: null, tasks: [], moves: [], no_out: true }, 9), /^A few hours: 3h\. No task in Working.*Forgot to clock out/);
  assert.equal(I.readDay({ workday: true, hours: 0 }), 'No clock-in.');
  assert.equal(I.readDay({ workday: false, hours: 0 }), 'Weekend.');
  assert.equal(I.readDay({ off: 'Vacation' }), 'Vacation — off.');
});

test('vacation, sick or other — from BambooHR’s type names (English or Hebrew)', () => {
  assert.equal(I.kindOf('Vacation'), 'vacation');
  assert.equal(I.kindOf('PTO'), 'vacation');
  assert.equal(I.kindOf('חופשה'), 'vacation');
  assert.equal(I.kindOf('Sick Leave'), 'sick');
  assert.equal(I.kindOf('מחלה'), 'sick');
  assert.equal(I.kindOf('Reserve duty'), 'other');
});

test('workdays a request covers inside a month (Sun–Thu only)', () => {
  assert.equal(I.workdaysIn('2026-11-26', '2026-12-02', '2026-11-01', '2026-11-30'), 3);   // Thu 26, Sun 29, Mon 30 (Fri/Sat out, Dec cut)
  assert.equal(I.workdaysIn('2026-11-22', '2026-11-26', '2026-11-01', '2026-11-30'), 5);
});

test('who may call: everyone sees who’s out and their own month; My employees stays admin-only', () => {
  for (const may of [creativeMay, growthMay]) {
    assert.equal(may('GET', '/api/hr/out'), true);
    assert.equal(may('GET', '/api/hr/me/month'), true);
    assert.equal(may('GET', '/api/hr/team/month'), false);
    assert.equal(may('GET', '/api/hr/team/person/123'), false);
  }
});
