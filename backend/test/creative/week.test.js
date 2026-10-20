const test = require('node:test');
const assert = require('node:assert/strict');
const w = require('../../src/lib/creative/week');

test('weekBounds: normal week (IDT, UTC+3)', () => {
  const b = w.weekBounds('2026-10-18', { now: Date.parse('2026-10-20T12:00:00Z') });
  assert.equal(b.fromIso, '2026-10-17T21:00:00.000Z');
  assert.equal(b.toIso, '2026-10-24T21:00:00.000Z');
  assert.deepEqual(b.workdays, ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
  assert.equal(b.next.start, '2026-10-25');
  assert.equal(b.prev.start, '2026-10-11');
  assert.equal(b.label, 'Oct 18 – Oct 22');
  assert.equal(b.partial, true);
});

test('weekBounds: DST ends Oct 25 2026 → week is 7 days + 1 hour', () => {
  const b = w.weekBounds('2026-10-25');
  assert.equal(b.fromIso, '2026-10-24T21:00:00.000Z');  // still IDT at Sunday 00:00
  assert.equal(b.toIso, '2026-10-31T22:00:00.000Z');    // IST (UTC+2) the next Sunday
  assert.equal(b.toMs - b.fromMs, 7 * 86400000 + 3600000);
});

test('weekBounds: winter week (IST, UTC+2)', () => {
  const b = w.weekBounds('2027-01-03');
  assert.equal(b.fromIso, '2027-01-02T22:00:00.000Z');
});

test('weekBounds rejects non-Sunday', () => {
  assert.throws(() => w.weekBounds('2026-10-19'), /not a Sunday/);
  assert.throws(() => w.weekBounds('2026-1-1'), /Invalid date/);
});

test('sundayOf / localDate in Israel time', () => {
  // Saturday 23:30 Israel (20:30Z) still belongs to the week starting Oct 18
  assert.equal(w.sundayOf(Date.parse('2026-10-24T20:30:00Z')), '2026-10-18');
  // Saturday 21:30Z is already Sunday 00:30 in Israel → next week
  assert.equal(w.sundayOf(Date.parse('2026-10-24T21:30:00Z')), '2026-10-25');
  assert.equal(w.localDate(Date.parse('2026-10-20T22:30:00Z')), '2026-10-21');
});

test('dateOnly / addDays / rangesOverlap', () => {
  assert.equal(w.dateOnly('2026-10-20T00:00:00+00:00'), '2026-10-20');
  assert.equal(w.dateOnly(null), null);
  assert.equal(w.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(w.rangesOverlap('2026-10-11', '2026-10-19', '2026-10-18', '2026-10-22'), true);
  assert.equal(w.rangesOverlap('2026-10-23', '2026-10-24', '2026-10-18', '2026-10-22'), false);
  assert.equal(w.rangesOverlap(null, '2026-10-20', '2026-10-18', '2026-10-22'), true);
});

test('weekNumber', () => {
  assert.equal(w.weekNumber('2026-10-18'), 43);
  assert.equal(w.weekNumber('2025-12-28'), 1);
});
