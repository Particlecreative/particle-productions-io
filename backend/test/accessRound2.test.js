// 25 Nov 2026 round 2 — who may call what: My HR for everyone, Team HR admins only, a task's time for its owner.
//   cd backend && node --test test/accessRound2.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { creativeMay, growthMay } = require('../src/middleware/auth');
const A = require('../src/lib/activity');

test('My HR: the creative team and Growth can clock in / out and ask for time off — Team HR stays admin-only', () => {
  for (const may of [creativeMay, growthMay]) {
    assert.equal(may('GET', '/api/hr/me'), true);
    assert.equal(may('GET', '/api/hr/me/clock'), true);
    assert.equal(may('POST', '/api/hr/me/connect'), true);
    assert.equal(may('POST', '/api/hr/me/clock-in'), true);
    assert.equal(may('POST', '/api/hr/me/clock-out'), true);
    assert.equal(may('POST', '/api/hr/me/time-off'), true);
    assert.equal(may('POST', '/api/hr/me/time-off/123/cancel'), true);
    assert.equal(may('DELETE', '/api/hr/me'), true);
    assert.equal(may('GET', '/api/hr/team'), false);
    assert.equal(may('POST', '/api/hr/team/time-off/123/approve'), false);
  }
});

test('Time tracking: a task’s time for Creative / Growth; the overview is not theirs', () => {
  assert.equal(creativeMay('GET', '/api/timetrack/task/video/123'), true);
  assert.equal(growthMay('GET', '/api/timetrack/task/design/123'), true);
  assert.equal(creativeMay('GET', '/api/timetrack/overview'), false);
  assert.equal(growthMay('GET', '/api/timetrack/overview.csv'), false);
});

test('Team activity: every move gets a line — task moves say where they went, other writes get a plain line, housekeeping none', () => {
  assert.deepEqual(A.labelFor('POST', '/api/hr/me/clock-in'), { kind: 'clock_in', label: 'Clocked in', ref: null });
  assert.equal(A.detail('task_move', { status: 'Review' }).label, 'Moved a task to Review');
  assert.equal(A.detail('task_move', { timeline: { from: 'x' } }).label, 'Changed a task’s dates');
  assert.equal(A.genericLabel('DELETE', '/api/invoices/9').label, 'Deleted something in Invoices');
  assert.equal(A.genericLabel('PUT', '/api/settings/view-order/sidebar'), null);
  assert.equal(A.genericLabel('POST', '/api/me/activity'), null);
  assert.equal(A.genericLabel('POST', '/api/passwords/particle/1/reveal'), null);   // logged by passwords.js itself
  assert.equal(A.genericLabel('GET', '/api/productions'), null);
});
