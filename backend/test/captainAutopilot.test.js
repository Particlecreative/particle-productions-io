// Captain on autopilot — the rules for moving a ticket on.   cd backend && node --test test/captainAutopilot.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, DEFAULT } = require('../src/lib/captain/autopilot');

test('a must-fix is a must: any left → back to Fixes Round', () => {
  assert.equal(decide({ review: 1, mustFix: 2 }).to, 'Fixes Round');
  assert.equal(decide({ review: 2, mustFix: 1, notes: 3 }).to, 'Fixes Round');
  assert.match(decide({ review: 2, mustFix: 1 }).why, /Review 2: 1 must-fix — back to the editor/);
});

test('nothing that must change → Approved; "please check" notes never block', () => {
  assert.equal(decide({ review: 2, mustFix: 0, notes: 4 }).to, 'Approved');
  assert.match(decide({ review: 2, mustFix: 0, notes: 4 }).why, /every must-fix is fixed \(4 “please check” notes left for the editor to judge\)/);
  assert.equal(decide({ review: 3, mustFix: 0 }).to, 'Approved');
});

test('a clean first review goes where Settings say (Approved by default, or For Approval for a person)', () => {
  assert.equal(decide({ review: 1, mustFix: 0 }).to, 'Approved');
  assert.equal(decide({ review: 1, mustFix: 0, settings: { first_clean_to: 'For Approval' } }).to, 'For Approval');
  assert.equal(decide({ review: 2, mustFix: 0, settings: { first_clean_to: 'For Approval' } }).to, 'Approved');   // only the 1st review
});

test('after max_rounds with must-fixes still there he stops and leaves it for a person', () => {
  const d = decide({ review: 3, mustFix: 2 });
  assert.equal(d.to, null);
  assert.equal(d.needs_person, true);
  assert.match(d.why, /after 3 rounds — left for a person/);
  assert.equal(decide({ review: 3, mustFix: 2, settings: { max_rounds: 5 } }).to, 'Fixes Round');
});

test('defaults: off until Tomer turns it on; the real status names', () => {
  assert.equal(DEFAULT.mode, 'off');
  assert.equal(DEFAULT.fixes_status, 'Fixes Round');
  assert.equal(DEFAULT.approved_status, 'Approved');
});
