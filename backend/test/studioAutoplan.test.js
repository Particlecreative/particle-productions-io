// Studio auto-plan — the timeline follows the work.   cd backend && node --test test/studioAutoplan.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/lib/studio/autoplan');
const C = require('../src/lib/studio/capacity');

// Mon 16 Nov 2026 is a working day (Sun–Thu week); Fri 20 / Sat 21 are the weekend
const TODAY = '2026-11-16';
const task = (id, o = {}) => ({ id, board: o.board || 'design', name: o.name || `Task ${id}`, open: true, people: o.people || ['natalie'], status: { category: o.cat || 'queued', label: o.status || 'Pending' },
  timeline: o.tl === null ? null : (o.tl || { from: '2026-11-18', to: '2026-11-18' }), deadline: o.deadline || null, priority: o.priority ? { label: o.priority } : null, division: o.division || o.board || 'design' });

test('started early: Natalie works today on a design set for Wednesday → today, one day', () => {
  const p = A.planStart({ it: task('a', { tl: { from: '2026-11-18', to: '2026-11-20' } }), day: TODAY });
  assert.deepEqual({ from: p.from, to: p.to, len: p.len }, { from: TODAY, to: TODAY, len: 1 });
  assert.match(p.why, /started 2 working days early/);
});

test('video gets 2 working days now (no review wait); a shorter timeline stays short; already right → nothing', () => {
  const v = A.planStart({ it: task('v', { board: 'video', tl: { from: '2026-11-16', to: '2026-11-22' } }), day: TODAY });
  assert.deepEqual([v.from, v.to], [TODAY, '2026-11-17']);
  assert.match(v.why, /shortened to 2 working days/);
  assert.equal(A.planStart({ it: task('s', { board: 'video', tl: { from: TODAY, to: TODAY } }), day: TODAY }), null);
  const none = A.planStart({ it: task('n', { tl: null }), day: TODAY });
  assert.deepEqual([none.from, none.to], [TODAY, TODAY]);
  // a Thursday start for a 2-day video runs into Sunday (the weekend is skipped)
  const thu = A.planStart({ it: task('t', { board: 'video', tl: null }), day: '2026-11-19' });
  assert.deepEqual([thu.from, thu.to], ['2026-11-19', '2026-11-22']);
});

test('a TV production keeps its length; it is the only thing on its days', () => {
  const tv = task('tv', { board: 'video', division: 'tv', name: 'Gravité TV Black Friday 30s Commercial', tl: { from: '2026-11-18', to: '2026-11-24' } });
  const p = A.planStart({ it: tv, day: TODAY });
  assert.equal(p.len, 5);
  assert.equal(C.isTvProduction(tv), true);
  assert.equal(C.isTvProduction({ ...tv, name: 'Heart Rate TV Commercial 30s Cut Down x2 Versions' }), false);
  assert.equal(C.isTvProduction({ ...tv, name: 'The Hunt Digital Versions' }), false);
  const load = C.loadByDay([{ ...tv, timeline: { from: TODAY, to: '2026-11-17' } }], 'natalie', 2);
  assert.equal(load[TODAY], 2);   // the whole day
});

test('over capacity → the low-priority task with the most slack moves to the first day with room; critical and due-soon stay', () => {
  // designer: 4 a day. Today: the started one + 4 waiting = 5
  const items = [
    task('started', { cat: 'in_progress', status: 'Working', tl: { from: TODAY, to: TODAY } }),
    task('crit', { tl: { from: TODAY, to: TODAY }, priority: 'Critical' }),
    task('soon', { tl: { from: TODAY, to: TODAY }, deadline: '2026-11-17' }),
    task('low', { tl: { from: TODAY, to: TODAY }, priority: 'Low', deadline: '2026-11-30' }),
    task('med', { tl: { from: TODAY, to: TODAY }, priority: 'Medium' }),
  ];
  const r = A.makeRoom({ person: 'natalie', items, cap: 4, today: TODAY, days: [TODAY], protect: new Set(['started']) });
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].it.id, 'low');
  assert.deepEqual(r.moves[0].after, { from: '2026-11-17', to: '2026-11-17' });
  assert.equal(C.loadByDay(items, 'natalie', 4)[TODAY], 4);
  assert.deepEqual(r.notes, []);
});

test('never past a deadline: when nothing can move in time, it stays and it is noted', () => {
  const full = (id, d) => task(id, { tl: { from: d, to: d } });
  const items = [
    task('started', { cat: 'in_progress', tl: { from: TODAY, to: TODAY } }),
    task('x', { tl: { from: TODAY, to: TODAY }, deadline: TODAY, priority: 'Low' }),   // due today → can't move
    full('a', TODAY), full('b', TODAY), full('c', TODAY),
    ...['2026-11-17', '2026-11-18', '2026-11-19'].flatMap(d => [full(`${d}1`, d), full(`${d}2`, d), full(`${d}3`, d), full(`${d}4`, d)]),
  ].map(t => (['a', 'b', 'c'].includes(t.id) ? { ...t, deadline: '2026-11-19' } : t));
  const r = A.makeRoom({ person: 'natalie', items, cap: 4, today: TODAY, days: [TODAY], protect: new Set(['started']) });
  assert.equal(r.moves.length, 0);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0].why, /left as it is/);
});

test('time off is skipped when finding room; started work never moves', () => {
  const items = [
    task('started', { cat: 'in_progress', tl: { from: TODAY, to: TODAY } }),
    task('w', { cat: 'in_progress', status: 'Working', tl: { from: TODAY, to: TODAY } }),
    task('q1', { tl: { from: TODAY, to: TODAY } }), task('q2', { tl: { from: TODAY, to: TODAY } }), task('q3', { tl: { from: TODAY, to: TODAY } }),
  ];
  const r = A.makeRoom({ person: 'natalie', items, cap: 4, today: TODAY, days: [TODAY], protect: new Set(['started']), out: [{ start: '2026-11-17', end: '2026-11-17' }] });
  assert.equal(r.moves.length, 1);
  assert.notEqual(r.moves[0].it.id, 'w');
  assert.deepEqual(r.moves[0].after, { from: '2026-11-18', to: '2026-11-18' });   // Tuesday is off
});

test('carry-overs from an earlier week don\'t count toward this week', () => {
  const load = C.loadByDay([task('old', { tl: { from: '2026-11-12', to: '2026-11-17' } })], 'natalie', 4);
  assert.equal(load['2026-11-12'] > 0, true);
  assert.equal(load[TODAY], undefined);
});
