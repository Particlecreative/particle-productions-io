const test = require('node:test');
const assert = require('node:assert');
const { cpWeekFor } = require('../../src/lib/creative/cpWeekly');

test('a deck shows the following week’s CP weekly', () => {
  assert.strictEqual(cpWeekFor('2026-10-18'), '2026-10-25'); // Oct 18–22 deck → weekly of Oct 25 (across the DST change)
  assert.strictEqual(cpWeekFor('2026-12-27'), '2027-01-03');
});
