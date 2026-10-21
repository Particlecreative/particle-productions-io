const test = require('node:test');
const assert = require('node:assert');
const W = require('../../src/lib/creative/week');
const { workSlices, statusSpans, activeWork, splitEffort } = require('../../src/lib/studio/effort');

const at = (date, h, m = 0) => W.zonedMidnightUtc(date) + (h * 60 + m) * 60000;
const H = (s) => Math.round((s / 3600) * 100) / 100;
const ev = (ms, prev, value) => ({ at_ms: ms, prev: prev ? { text: prev } : null, value: { text: value } });
const isActive = (l) => ['Working', 'Fixes Round'].includes(l);

test('work slices skip nights and Fri/Sat', () => {
  // Thu 2026-10-22 08:00 → Sun 2026-10-25 12:00 (Fri/Sat skipped)
  const s = workSlices(at('2026-10-22', 8), at('2026-10-25', 12));
  const total = s.reduce((x, [a, b]) => x + (b - a), 0) / 3600000;
  assert.strictEqual(total, 10 + 3); // Thu 09–19, Sun 09–12
});

test('status spans: paused and review do not count', () => {
  const from = at('2026-10-18', 0);
  const to = at('2026-10-19', 0);
  const spans = statusSpans([
    ev(at('2026-10-18', 10), 'Pending', 'Working'),
    ev(at('2026-10-18', 12), 'Working', 'Paused'),
    ev(at('2026-10-18', 14), 'Paused', 'Working'),
    ev(at('2026-10-18', 16), 'Working', 'Review'),
  ], { fromMs: from, toMs: to, initialLabel: 'Pending' });
  const iv = activeWork(spans, isActive);
  assert.strictEqual(iv.reduce((x, [a, b]) => x + (b - a), 0) / 3600000, 4); // 10–12 + 14–16
});

test('no events in window: current status applies to the whole window', () => {
  const spans = statusSpans([], { fromMs: at('2026-10-18', 0), toMs: at('2026-10-19', 0), initialLabel: 'Working' });
  assert.strictEqual(activeWork(spans, isActive).reduce((x, [a, b]) => x + (b - a), 0) / 3600000, 10);
});

test('parallel tasks share the person’s time; totals never double count', () => {
  const day = '2026-10-18';
  const r = splitEffort([
    { id: 'A', people: ['u1'], iv: [[at(day, 9), at(day, 19)]] },   // all day
    { id: 'B', people: ['u1'], iv: [[at(day, 9), at(day, 14)]] },   // morning only
  ]);
  assert.strictEqual(H(r.person.u1), 10);
  assert.strictEqual(H(r.task.A), 7.5); // 2.5 (shared morning) + 5 (alone)
  assert.strictEqual(H(r.task.B), 2.5);
  assert.strictEqual(H(r.personDay.u1[day]), 10);
});

test('a task with two people gets both shares', () => {
  const day = '2026-10-19';
  const r = splitEffort([{ id: 'A', people: ['u1', 'u2'], iv: [[at(day, 10), at(day, 12)]] }]);
  assert.strictEqual(H(r.task.A), 4);
  assert.strictEqual(H(r.taskPerson.A.u2), 2);
});

test('clock-ins limit effort: active but not clocked in does not count', () => {
  const { activeSpans } = require('../../src/lib/studio/effort');
  const day = '2026-10-20';
  const spans = statusSpans([], { fromMs: at(day, 0), toMs: at(day, 24), initialLabel: 'Working' });
  const r = splitEffort([{ id: 'A', people: ['u1'], iv: activeSpans(spans, isActive) }], {
    presence: { u1: [[at(day, 10), at(day, 13)], [at(day, 14), at(day, 18, 30)]] },
    fallback: workSlices(at(day, 0), at(day, 24)),
  });
  assert.strictEqual(H(r.task.A), 7.5);
  // someone without clock data falls back to 09–19
  const r2 = splitEffort([{ id: 'B', people: ['u2'], iv: activeSpans(spans, isActive) }], { presence: {}, fallback: workSlices(at(day, 0), at(day, 24)) });
  assert.strictEqual(H(r2.task.B), 10);
});
