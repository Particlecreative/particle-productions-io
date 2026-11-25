// Task time tracking — engine maths + the loader against a mocked Monday / BambooHR.   cd backend && node --test test/timetrack.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// No database, no Monday, no BambooHR: stub before anything reads them
const db = require('../src/db');
db.query = async () => ({ rows: [] });
const monday = require('../src/lib/monday');
const bamboo = require('../src/lib/studio/bamboohr');

const E = require('../src/lib/timetrack/engine');
const effort = require('../src/lib/studio/effort');
const { DEFAULTS } = require('../src/lib/creative/config');

const VIDEO = DEFAULTS.boards.video.statuses;
const DESIGN = DEFAULTS.boards.design.statuses;
const HOUR = 3600000;
const at = (date, h, m = 0) => E.zonedUtc(date, 0) + (h * 60 + m) * 60000;   // Israel local time → ms
const ev = (ms, prev, value, user = null, id = null) => ({ id: id || `${ms}-${value}`, at_ms: ms, prev: prev == null ? null : { text: prev }, value: { text: value }, user_id: user });
const pev = (ms, prev, value, user = null) => ({ id: `${ms}-p`, at_ms: ms, user_id: user, prev_raw: prev == null ? null : { personsAndTeams: prev.map(id => ({ id: /^\d+$/.test(id) ? Number(id) : id, kind: 'person' })) }, value_raw: { personsAndTeams: value.map(id => ({ id: /^\d+$/.test(id) ? Number(id) : id, kind: 'person' })) } });
const h = (ms) => Math.round((ms / HOUR) * 100) / 100;

// ── categories ──────────────────────────────────────────────────────────────
test('status → category follows the board config (case / spaces don’t matter); blank = queued, unknown = other', () => {
  assert.equal(E.categoryOf('Working', VIDEO), 'in_progress');
  assert.equal(E.categoryOf('  working ', VIDEO), 'in_progress');
  assert.equal(E.categoryOf('For Approval', VIDEO), 'review');
  assert.equal(E.categoryOf('Marketing Approval', VIDEO), 'review');
  assert.equal(E.categoryOf('Fixes Round', VIDEO), 'fixes');
  assert.equal(E.categoryOf('Upload Complete', VIDEO), 'delivered');
  assert.equal(E.categoryOf('Ready for Assignment', VIDEO), 'queued');
  assert.equal(E.categoryOf('Stuck', VIDEO), 'stuck');
  assert.equal(E.categoryOf('Paused', VIDEO), 'paused');
  assert.equal(E.categoryOf('', VIDEO), 'queued');
  assert.equal(E.categoryOf(null, VIDEO), 'queued');
  assert.equal(E.categoryOf('Something new', VIDEO), 'other');
  // Design: Freelance is work, Quality Check is review; "Upload Complete" isn't a design status
  assert.equal(E.categoryOf('Freelance', DESIGN), 'in_progress');
  assert.equal(E.categoryOf('Quality Check', DESIGN), 'review');
  assert.equal(E.categoryOf('Upload Complete', DESIGN), 'other');
  assert.equal(E.categoryOf('-', DESIGN), 'queued');
});

// ── segments ────────────────────────────────────────────────────────────────
test('segments start at the request; the status before the first move is that move’s previous status', () => {
  const created = at('2026-11-15', 9);
  const segs = E.segments({ created_at: new Date(created).toISOString(), status: 'Review' }, [
    ev(at('2026-11-16', 9), 'Ready for Assignment', 'Working', 'e1'),
    ev(at('2026-11-15', 10), 'Pending', 'Ready for Assignment', 'tomer'),   // any order
    ev(at('2026-11-16', 13), 'Working', 'Review', 'e1'),
  ], at('2026-11-16', 15), VIDEO);
  assert.deepEqual(segs.map(s => [s.status, s.category, h(s.to_ms - s.from_ms), s.by]), [
    ['Pending', 'queued', 1, null],
    ['Ready for Assignment', 'queued', 23, 'tomer'],
    ['Working', 'in_progress', 4, 'e1'],
    ['Review', 'review', 2, 'e1'],
  ]);
  assert.equal(segs[0].from_ms, created);
});

test('no moves: the current status from the request until now; same-status moves merge', () => {
  const segs = E.segments({ created_at: at('2026-11-20', 9), status: 'Pending' }, [], at('2026-11-20', 12), VIDEO);
  assert.deepEqual(segs.map(s => [s.status, h(s.to_ms - s.from_ms)]), [['Pending', 3]]);
  const merged = E.segments({ created_at: at('2026-11-20', 9) }, [
    ev(at('2026-11-20', 10), 'Pending', 'Working'), ev(at('2026-11-20', 11), 'Working', 'Working'), ev(at('2026-11-20', 12), 'Working', 'Review'),
  ], at('2026-11-20', 13), VIDEO);
  assert.deepEqual(merged.map(s => [s.status, h(s.to_ms - s.from_ms)]), [['Pending', 1], ['Working', 2], ['Review', 1]]);
});

test('an automation that sets the status at creation: the first segment is that status', () => {
  const c = at('2026-11-20', 9);
  const segs = E.segments({ created_at: c }, [ev(c, null, 'Task Created', 'bot'), ev(at('2026-11-20', 10), 'Task Created', 'Working', 'e1')], at('2026-11-20', 11), VIDEO);
  assert.deepEqual(segs.map(s => [s.status, s.category, h(s.to_ms - s.from_ms), s.by]), [['Task Created', 'queued', 1, 'bot'], ['Working', 'in_progress', 1, 'e1']]);
});

test('segments are the Studio’s status spans (same rebuild as the Time tab)', () => {
  const evs = [ev(at('2026-11-16', 9), 'Pending', 'Working'), ev(at('2026-11-16', 12), 'Working', 'Paused'), ev(at('2026-11-17', 10), 'Paused', 'Working'), ev(at('2026-11-17', 16), 'Working', 'Approved')];
  const from = at('2026-11-15', 8);
  const to = at('2026-11-18', 8);
  const ours = E.segments({ created_at: from }, evs, to, VIDEO).map(s => [s.status, s.from_ms, s.to_ms]);
  const studio = effort.statusSpans(evs, { fromMs: from, toMs: to, initialLabel: '' }).map(s => [s.label, s.a, s.b]);
  assert.deepEqual(ours, studio);
});

test('history window: segments start where the log starts (fromMs)', () => {
  const segs = E.segments({ created_at: at('2025-01-01', 9) }, [ev(at('2026-11-16', 9), 'Pending', 'Working')], at('2026-11-16', 10), VIDEO, { fromMs: at('2026-11-10', 0) });
  assert.equal(segs[0].from_ms, at('2026-11-10', 0));
  assert.equal(segs[0].status, 'Pending');
});

// ── intervals & working hours ───────────────────────────────────────────────
test('overlap across days, any interval shape; overlapping inputs never double count', () => {
  const clock = [
    { start_ms: at('2026-11-16', 9, 30), end_ms: at('2026-11-16', 17, 30) },
    [at('2026-11-17', 9), at('2026-11-17', 18)],
    { start_ms: at('2026-11-17', 17), end_ms: at('2026-11-17', 19) },   // overlaps the one before → 09–19
  ];
  const seg = [{ from_ms: at('2026-11-16', 15), to_ms: at('2026-11-17', 12) }];   // overnight
  assert.equal(h(E.overlap(clock, seg)), 2.5 + 3);
  assert.equal(E.overlap([], seg), 0);
  assert.equal(h(E.overlap(clock, [[at('2026-11-16', 0), at('2026-11-18', 0)]])), 8 + 10);
});

test('working hours fallback: Sun–Thu 09:00–19:00 Israel; Friday and Saturday never count', () => {
  // Thu 19 Nov 08:00 → Sun 22 Nov 12:00: Thu 09–19 + Sun 09–12
  const iv = E.workingHoursFallback(at('2026-11-19', 8), at('2026-11-22', 12));
  assert.equal(h(iv.reduce((s, x) => s + x.end_ms - x.start_ms, 0)), 13);
  assert.ok(iv.every(x => ![5, 6].includes(E.dow(E.localYmd(x.start_ms)))));
  // A whole Sun–Sat week = 5 × 10h
  assert.equal(h(E.overlap(E.workingHoursFallback(at('2026-11-15', 0), at('2026-11-22', 0)), [[0, at('2027-01-01', 0)]])), 50);
  // Only Fri + Sat → nothing
  assert.deepEqual(E.workingHoursFallback(at('2026-11-20', 0), at('2026-11-22', 0)), []);
  // Winter time (UTC+2): 09:00 local = 07:00Z
  assert.equal(new Date(iv[0].start_ms).toISOString(), '2026-11-19T07:00:00.000Z');
});

test('working hours follow Israel’s clock change (summer time ends Sun 25 Oct 2026)', () => {
  const thu = E.workingHoursFallback(at('2026-10-22', 0), at('2026-10-23', 0))[0];
  const sun = E.workingHoursFallback(E.zonedUtc('2026-10-25', 0), E.zonedUtc('2026-10-26', 0))[0];
  assert.equal(new Date(thu.start_ms).toISOString(), '2026-10-22T06:00:00.000Z');   // 09:00 summer time
  assert.equal(new Date(sun.start_ms).toISOString(), '2026-10-25T07:00:00.000Z');   // 09:00 winter time
  assert.equal(h(sun.end_ms - sun.start_ms), 10);
  assert.equal(E.localYmd(Date.parse('2026-10-24T21:30:00Z')), '2026-10-25');
});

// ── metrics ─────────────────────────────────────────────────────────────────
function taskA() {
  const created = at('2026-11-15', 9);
  const statusEvs = [
    ev(at('2026-11-15', 10), '', 'Ready for Assignment', 'tomer'),
    ev(at('2026-11-16', 9), 'Ready for Assignment', 'Working', 'e1'),
    ev(at('2026-11-16', 13), 'Working', 'Review', 'e1'),
    ev(at('2026-11-16', 14), 'Review', 'Creative Approval', 'tomer'),   // still the same review round
    ev(at('2026-11-17', 10), 'Creative Approval', 'Fixes Round', 'tomer'),
    ev(at('2026-11-17', 11), 'Fixes Round', 'Working', 'e1'),
    ev(at('2026-11-17', 15), 'Working', 'Approved', 'tomer'),
    ev(at('2026-11-18', 9), 'Approved', 'Upload Complete', 'e1'),       // done → done: not a new delivery
  ];
  const personEvs = [pev(at('2026-11-15', 11), [], ['1'], 'tomer')];
  return { created, statusEvs, personEvs };
}

test('metrics: lead, waiting, rounds, moves, delivered after the last work, on time, worked against the clock', () => {
  const { created, statusEvs, personEvs } = taskA();
  const now = at('2026-11-25', 12);
  const segs = E.segments({ created_at: created }, statusEvs, now, VIDEO);
  const assignees = E.assigneesOverTime({ created_at: created, people: ['1'] }, personEvs, now);
  const clock = { byPerson: { 1: E.pairs([[at('2026-11-16', 9, 30), at('2026-11-16', 17, 30)], [at('2026-11-17', 9), at('2026-11-17', 18)]]) }, since_ms: at('2026-11-01', 0) };
  const m = E.metrics({ created_at: created, deadline: '2026-11-18', people: ['1'] }, { segments: segs, assignees, clock, now, range: { from_ms: at('2026-11-15', 0), to_ms: at('2026-11-26', 0) } });
  assert.equal(m.delivered_at, at('2026-11-17', 15));
  assert.equal(m.open, false);
  assert.equal(h(m.lead_ms), 54);                    // Sun 09:00 → Tue 15:00
  assert.equal(h(m.waiting_ms), 24);                 // until the first Working
  assert.equal(m.first_started_at, at('2026-11-16', 9));
  assert.equal(h(m.worked_ms), 3.5 + 4);             // Working ∩ clocked in: Mon 09:30–13:00, Tue 11:00–15:00
  assert.deepEqual(Object.keys(m.worked_by_person), ['1']);
  assert.equal(m.estimated, false);
  assert.equal(h(m.fixes_worked_ms), 1);             // Tue 10–11 in Fixes Round, clocked in
  assert.equal(m.review_rounds, 1);                  // Review → Creative Approval is one round
  assert.equal(m.fix_rounds, 1);
  assert.equal(m.moves, 7);                          // Review → Creative Approval is a move; done → done after delivery isn't
  assert.deepEqual(m.movers, { tomer: 4, e1: 3 });
  assert.equal(m.on_time, true);
  assert.equal(h(m.by_category.queued), 24);
  assert.equal(h(m.by_category.in_progress), 8);
  assert.equal(h(m.by_category.review), 21);
  assert.equal(h(m.by_category.fixes), 1);
  assert.equal(m.by_category.delivered, 0);
  assert.equal(h(Object.values(m.by_category).reduce((a, b) => a + b, 0)), h(m.lead_ms));
  assert.equal(m.in_range.delivered, true);
  assert.equal(m.current.status, 'Upload Complete');
  // The Studio Time tab's life for the same task (effort.taskLife)
  assert.equal(m.life.completed_ms, at('2026-11-17', 15));
  assert.equal(m.life.fix_rounds, 1);
});

test('an approval that was reopened for fixes is not the delivery; late when delivered after the deadline', () => {
  const c = at('2026-11-15', 9);
  const segs = E.segments({ created_at: c }, [
    ev(at('2026-11-15', 10), 'Pending', 'Working'), ev(at('2026-11-15', 12), 'Working', 'Approved'),
    ev(at('2026-11-16', 9), 'Approved', 'Fixes Round'), ev(at('2026-11-16', 10), 'Fixes Round', 'Approved'),
  ], at('2026-11-20', 9), VIDEO);
  const m = E.metrics({ created_at: c, deadline: '2026-11-15' }, { segments: segs, now: at('2026-11-20', 9) });
  assert.equal(m.delivered_at, at('2026-11-16', 10));
  assert.equal(h(m.by_category.delivered), 21);     // approved, then reopened
  assert.equal(m.on_time, false);
  assert.equal(m.fix_rounds, 1);
});

test('open tasks: lead runs until now, still waiting when never started, late once past the deadline', () => {
  const c = at('2026-11-20', 9);
  const now = at('2026-11-24', 9);
  const m = E.metrics({ created_at: c, deadline: '2026-11-22' }, { segments: E.segments({ created_at: c, status: 'Pending' }, [], now, VIDEO), now });
  assert.equal(m.open, true);
  assert.equal(m.delivered_at, null);
  assert.equal(h(m.lead_ms), 96);
  assert.equal(m.still_waiting, true);
  assert.equal(h(m.waiting_ms), 96);
  assert.equal(m.on_time, false);
  const notDue = E.metrics({ created_at: c, deadline: '2026-11-30' }, { segments: E.segments({ created_at: c, status: 'Pending' }, [], now, VIDEO), now });
  assert.equal(notDue.on_time, null);
});

test('worked time goes to whoever was assigned at the time — each against their own clock', () => {
  const c = at('2026-11-15', 8);
  const now = at('2026-11-17', 20);
  // Working Sun 09:00 → Tue 19:00; Dana until Mon 12:00, then Eli
  const segs = E.segments({ created_at: c }, [ev(at('2026-11-15', 9), 'Pending', 'Working')], now, VIDEO);
  const assignees = E.assigneesOverTime({ created_at: c, people: ['eli'] }, [
    pev(at('2026-11-15', 8, 30), [], ['dana']), pev(at('2026-11-16', 12), ['dana'], ['eli']),
  ], now);
  assert.deepEqual(assignees.map(a => a.people), [[], ['dana'], ['eli']]);
  const clock = {
    byPerson: {
      dana: E.pairs([[at('2026-11-15', 9), at('2026-11-15', 17)], [at('2026-11-16', 9), at('2026-11-16', 17)]]),   // Sun 8h, Mon 9–12 counts
      // eli is not on BambooHR → working hours (estimated): Mon 12–19 + Tue 09–19
    },
    since_ms: at('2026-11-01', 0),
  };
  const m = E.metrics({ created_at: c, people: ['eli'] }, { segments: segs, assignees, clock, now });
  assert.equal(h(m.worked_by_person.dana), 8 + 3);
  assert.equal(h(m.worked_by_person.eli), 7 + 10);
  assert.equal(h(m.worked_ms), 28);
  assert.equal(m.estimated, true);
  assert.equal(h(m.estimated_ms), 17);
});

test('two people on a task at once count once for the task; time before the team clocked in is estimated', () => {
  const c = at('2026-11-16', 9);
  const now = at('2026-11-16', 13);
  const segs = E.segments({ created_at: c, status: 'Working' }, [], now, VIDEO);
  const assignees = [{ from_ms: c, to_ms: now, people: ['a', 'b'] }];
  const clock = { byPerson: { a: E.pairs([[c, now]]), b: E.pairs([[c, at('2026-11-16', 11)]]) }, since_ms: at('2026-11-01', 0) };
  const m = E.metrics({ created_at: c }, { segments: segs, assignees, clock, now });
  assert.equal(h(m.worked_ms), 4);
  assert.deepEqual({ a: h(m.worked_by_person.a), b: h(m.worked_by_person.b) }, { a: 4, b: 2 });
  // BambooHR only from 11:00 that day: 09–11 falls back to working hours
  const late = { byPerson: { a: E.pairs([[at('2026-11-16', 11), now]]) }, since_ms: at('2026-11-16', 11) };
  const m2 = E.metrics({ created_at: c }, { segments: segs, assignees: [{ from_ms: c, to_ms: now, people: ['a'] }], clock: late, now });
  assert.equal(h(m2.worked_ms), 4);
  assert.equal(h(m2.estimated_ms), 2);
});

test('nobody assigned while Working: working hours, nobody’s share; clocked in but never Working → 0', () => {
  const c = at('2026-11-16', 9);
  const now = at('2026-11-16', 21);
  const m = E.metrics({ created_at: c }, { segments: E.segments({ created_at: c, status: 'Working' }, [], now, VIDEO), assignees: [{ from_ms: c, to_ms: now, people: [] }], now });
  assert.equal(h(m.worked_ms), 10);
  assert.deepEqual(m.worked_by_person, {});
  assert.equal(m.estimated, true);
  const r = E.metrics({ created_at: c }, { segments: E.segments({ created_at: c, status: 'Review' }, [], now, VIDEO), assignees: [{ from_ms: c, to_ms: now, people: ['a'] }], clock: { byPerson: { a: [[c, now]] } }, now });
  assert.equal(r.worked_ms, 0);
});

// ── aggregation ─────────────────────────────────────────────────────────────
function fakeTask(id, o) {
  const delivered = o.delivered ?? true;
  return {
    id, name: `Task ${id}`, board: o.board || 'video', type: 'type' in o ? o.type : 'UGC', product: { label: o.product || 'Face Cream' },
    requesters: o.requesters || ['req1'], campaigns: o.campaigns || [], people: o.people || ['p1'],
    metrics: {
      open: !delivered, delivered_at: delivered ? o.at : null, requested_at: o.at - (o.lead || 10) * HOUR,
      lead_ms: (o.lead || 10) * HOUR, waiting_ms: HOUR, worked_ms: (o.worked ?? 2) * HOUR,
      worked_by_person: o.byPerson || { [o.people?.[0] || 'p1']: (o.worked ?? 2) * HOUR },
      worked_pieces: o.pieces || {}, review_rounds: o.rr ?? 1, fix_rounds: o.fr ?? 0, on_time: o.onTime ?? null, estimated: !!o.est,
      by_category: { queued: HOUR, in_progress: (o.worked ?? 2) * HOUR }, people: o.people || ['p1'],
      in_range: { delivered, created: true, worked_by_person: o.byPerson || { [o.people?.[0] || 'p1']: (o.worked ?? 2) * HOUR } },
    },
  };
}

test('aggregate by person / type / product / requester / campaign', () => {
  const t0 = at('2026-11-17', 12);
  const tasks = [
    fakeTask('1', { at: t0, worked: 2, people: ['p1'], rr: 1, onTime: true, campaigns: ['Black Friday'] }),
    fakeTask('2', { at: t0, worked: 4, people: ['p1'], rr: 3, onTime: false }),
    fakeTask('3', { at: t0, worked: 6, people: ['p2'], type: 'Motion', product: 'Hair Serum', requesters: ['req2'], campaigns: ['Black Friday'] }),
    fakeTask('4', { at: t0, worked: 1, people: ['p1'], delivered: false }),
  ];
  const byPerson = E.aggregate(tasks, 'person', { clocked: { p1: 10 * HOUR }, busy: { p1: 5 * HOUR } });
  const p1 = byPerson.find(r => r.key === 'p1');
  assert.equal(p1.tasks, 3);
  assert.equal(p1.delivered, 2);
  assert.equal(p1.open, 1);
  assert.equal(h(p1.worked_median_ms), 3);
  assert.equal(p1.review_rounds_avg, 2);
  assert.equal(p1.on_time_pct, 50);
  assert.equal(p1.utilization, 0.5);
  assert.equal(byPerson.find(r => r.key === 'p2').utilization, null);    // not on BambooHR
  assert.deepEqual(E.aggregate(tasks, 'type').map(r => [r.key, r.delivered]), [['UGC', 2], ['Motion', 1]]);
  assert.deepEqual(E.aggregate(tasks, 'product').map(r => r.key), ['Face Cream', 'Hair Serum']);
  assert.deepEqual(E.aggregate(tasks, 'requester').map(r => [r.key, r.tasks]), [['req1', 3], ['req2', 1]]);
  assert.deepEqual(E.aggregate(tasks, 'campaign').map(r => [r.key, r.tasks]), [['Black Friday', 2]]);
  assert.deepEqual(E.aggregate([fakeTask('5', { at: t0, type: null, board: 'design' })], 'type').map(r => r.key), ['Design · no type']);
});

test('utilization uses each person’s busy time (two tasks in Working at once count once) and never passes 100%', () => {
  const t0 = at('2026-11-17', 12);
  const R = { from_ms: at('2026-11-15', 0), to_ms: at('2026-11-22', 0) };
  const iv = [[at('2026-11-16', 9), at('2026-11-16', 13)]];
  const tasks = [
    fakeTask('a', { at: t0, worked: 4, pieces: { p1: iv } }),
    fakeTask('b', { at: t0, worked: 4, pieces: { p1: iv } }),     // the same four hours
  ];
  const busy = E.busyByPerson(tasks, R);
  assert.equal(h(busy.p1), 4);
  const k = E.kpis(tasks, { clocked: { p1: 8 * HOUR }, busy });
  assert.equal(k.utilization, 0.5);
  assert.equal(k.delivered, 2);
  assert.equal(E.kpis(tasks, { clocked: { p1: 2 * HOUR }, busy }).utilization, 1);
});

test('outliers: more than 2× the median worked time of their type (types with 3+ tasks)', () => {
  const t0 = at('2026-11-17', 12);
  const tasks = [
    fakeTask('1', { at: t0, worked: 2 }), fakeTask('2', { at: t0, worked: 3 }), fakeTask('3', { at: t0, worked: 2.5 }),
    fakeTask('4', { at: t0, worked: 9 }),                                   // median 2.75 → 3.3×
    fakeTask('5', { at: t0, worked: 20, type: 'TV' }), fakeTask('6', { at: t0, worked: 2, type: 'TV' }),   // too few TV tasks
    fakeTask('7', { at: t0, worked: 50, delivered: false }),               // open — not judged yet
  ];
  const out = E.outliers(tasks);
  assert.deepEqual(out.map(o => [o.id, o.ratio]), [['4', 3.3]]);
  assert.equal(h(out[0].median_ms), 2.75);
});

test('weekly trend: delivered tasks by Israel week (Sunday start)', () => {
  const tasks = [
    fakeTask('1', { at: at('2026-11-15', 10), lead: 10, worked: 2 }),
    fakeTask('2', { at: at('2026-11-21', 23), lead: 20, worked: 4 }),   // Saturday night — same week
    fakeTask('3', { at: at('2026-11-22', 10), lead: 30, worked: 6 }),
    fakeTask('4', { at: at('2026-11-22', 10), delivered: false }),
  ];
  const w = E.weekly(tasks, { from: '2026-11-17', to: '2026-11-25' });
  assert.deepEqual(w.map(x => [x.week, x.delivered, x.median_lead_ms && h(x.median_lead_ms)]), [['2026-11-15', 2, 15], ['2026-11-22', 1, 30]]);
  assert.equal(w[0].label, 'Nov 15');
});

// ── the loader, against a mocked Monday + BambooHR ──────────────────────────
const NOW = at('2026-11-25', 12);
const BOARD = DEFAULTS.boards.video.board_id;
const VC = DEFAULTS.boards.video.columns;
const STATUS_LABELS = ['Pending', 'Ready for Assignment', 'Task Created', 'Working', 'Review', 'Creative Approval', 'Fixes Round', 'Approved', 'Completed', 'Upload Complete', 'Paused', 'Stuck'];
const META = {
  id: BOARD, name: 'Video', groups: [], dropdowns: {},
  columns: Object.fromEntries(Object.values(VC).map(id => [id, { id, title: id, type: 'text' }])),
  statusMaps: {
    [VC.status]: {
      byIndex: Object.fromEntries(STATUS_LABELS.map((l, i) => [i, { label: l, color: '#579bfc', deactivated: false }])),
      byLabel: Object.fromEntries(STATUS_LABELS.map((l, i) => [l.toLowerCase(), i])),
    },
  },
};
const raw = (id, name, createdMs, status, o = {}) => ({
  id, name, url: `https://particle.monday.com/boards/${BOARD}/pulses/${id}`, created_at: new Date(createdMs).toISOString(), state: 'active', board: { id: BOARD }, group: { id: 'g', title: 'Tasks' },
  column_values: [
    { id: VC.status, type: 'status', text: status, label: status, index: STATUS_LABELS.indexOf(status) },
    { id: VC.person, type: 'people', text: '', persons_and_teams: (o.people || []).map(p => ({ id: p, kind: 'person' })) },
    { id: VC.type, type: 'status', text: o.type || 'UGC', label: o.type || 'UGC' },
    { id: VC.product, type: 'status', text: 'Face Cream', label: 'Face Cream' },
    { id: VC.deadline, type: 'date', text: o.deadline || '', date: o.deadline || null },
    { id: VC.campaign, type: 'dropdown', text: (o.campaigns || []).join(', '), values: (o.campaigns || []).map((l, i) => ({ id: i, label: l })) },
  ],
});
const log = (item, ms, col, prev, value, user, n) => ({
  id: `${item}-${n}`, event: 'update_column_value', board_id: BOARD, pulse_id: item, pulse_name: '', column_id: col, group_id: 'g', parent_item_id: null, is_undo: false,
  at_ms: ms, user_id: user,
  prev: col === VC.status ? (prev == null ? null : { text: prev }) : null,
  value: col === VC.status ? { text: value } : null,
  prev_raw: col === VC.person ? (prev == null ? null : { personsAndTeams: prev.map(p => ({ id: Number(p), kind: 'person' })) }) : null,
  value_raw: col === VC.person ? { personsAndTeams: value.map(p => ({ id: Number(p), kind: 'person' })) } : null,
});
const S = VC.status;
const P = VC.person;
const ITEMS = {
  // A: requested and delivered in the range, worked by Maya (on BambooHR)
  101: raw('101', 'Face Cream | UGC hook test', at('2026-11-15', 9), 'Upload Complete', { people: ['11'], deadline: '2026-11-18', campaigns: ['Black Friday'] }),
  // B: requested before the range, still Working — Dan isn't on BambooHR (estimated)
  102: raw('102', 'Face Cream | Static set', at('2026-11-01', 10), 'Working', { people: ['12'], type: 'Static' }),
  // C: delivered before the range, only renamed done → done inside it → left out
  103: raw('103', 'Old one', at('2026-10-20', 10), 'Completed', { people: ['11'] }),
  // D: requested + approved in the range without ever being in Working
  104: raw('104', 'Quick resize', at('2026-11-18', 10), 'Approved', { people: ['11'] }),
};
const LOGS = [
  log('101', at('2026-11-15', 10), S, '', 'Ready for Assignment', '9', 1),
  log('101', at('2026-11-15', 11), P, [], ['11'], '9', 2),
  log('101', at('2026-11-16', 9), S, 'Ready for Assignment', 'Working', '11', 3),
  log('101', at('2026-11-16', 13), S, 'Working', 'Review', '11', 4),
  log('101', at('2026-11-17', 10), S, 'Review', 'Fixes Round', '9', 5),
  log('101', at('2026-11-17', 11), S, 'Fixes Round', 'Working', '11', 6),
  log('101', at('2026-11-17', 15), S, 'Working', 'Approved', '9', 7),
  log('101', at('2026-11-18', 9), S, 'Approved', 'Upload Complete', '11', 8),
  log('102', at('2026-11-01', 10, 5), S, '', 'Pending', '9', 1),
  log('102', at('2026-11-01', 10, 6), P, [], ['12'], '9', 2),
  log('102', at('2026-11-24', 9), S, 'Pending', 'Working', '12', 3),
  log('103', at('2026-10-21', 10), S, 'Pending', 'Working', '11', 1),
  log('103', at('2026-11-05', 10), S, 'Working', 'Approved', '9', 2),
  log('103', at('2026-11-20', 10), S, 'Approved', 'Completed', '9', 3),
  log('104', at('2026-11-18', 10, 1), S, '', 'Pending', '9', 1),
  log('104', at('2026-11-19', 10), S, 'Pending', 'Approved', '9', 2),
];
const MAYA_CLOCK = [[at('2026-11-16', 9, 30), at('2026-11-16', 17, 30)], [at('2026-11-17', 9), at('2026-11-17', 18)]];
const calls = { logs: [], byIds: [] };

function mockMonday() {
  monday.boardMeta = async () => META;
  monday.fetchAllItems = async (boardId, { queryParams } = {}) => {
    const done = new Set(queryParams?.rules?.[0]?.compare_value || []);
    return { items: Object.values(ITEMS).filter(r => !done.has(r.column_values[0].index)), truncated: false };
  };
  monday.itemsByIds = async (ids) => { calls.byIds.push(ids); return ids.map(id => ITEMS[id]).filter(Boolean); };
  monday.activityLogs = async (boardId, { fromIso, toIso, columnIds, itemIds }) => {
    calls.logs.push({ fromIso, itemIds });
    const a = Date.parse(fromIso);
    const b = Date.parse(toIso);
    return { events: LOGS.filter(e => e.at_ms >= a && e.at_ms < b && (!itemIds || itemIds.includes(e.pulse_id)) && (!columnIds || columnIds.includes(e.column_id))), truncated: false };
  };
  monday.usersByIds = async (ids) => ids.map(id => ({ id, name: { 9: 'Tomer Test', 11: 'Maya Test', 12: 'Dan Test' }[id] || `U${id}`, email: `${id}@example.com`, photo_small: null }));
  bamboo.configured = async () => true;
  bamboo.entriesFor = async (people) => {
    const matched = {};
    const intervals = {};
    const clocked_ms = {};
    for (const p of people) {
      if (p.id !== '11') continue;
      matched['11'] = 'b11';
      intervals['11'] = MAYA_CLOCK.map(([s, e]) => ({ start_ms: s, end_ms: e }));
      clocked_ms['11'] = 17 * HOUR;
    }
    return { matched, unmatched: people.map(p => p.id).filter(id => !matched[id]), since: '2026-10-01', intervals, clocked_ms };
  };
}

test('loader: open + created in range + delivered in range; older history read per item; clock-in vs working hours', async (t) => {
  mockMonday();
  monday.clearCache('timetrack:');
  const realNow = Date.now;
  Date.now = () => NOW;
  t.after(() => { Date.now = realNow; });
  const TT = require('../src/lib/timetrack/data');
  const data = await TT.load({ from: '2026-11-15', to: '2026-11-30' }, { board: 'video', now: NOW });
  assert.equal(data.range.to, '2026-11-25');                 // never past today
  assert.deepEqual(data.tasks.map(x => x.id).sort(), ['101', '102', '104']);
  assert.equal(data.clock_source, 'mixed');
  // Older history: one per-item read for the tasks requested before the range
  const older = calls.logs.filter(c => c.itemIds);
  assert.equal(older.length, 1);
  assert.deepEqual(older[0].itemIds.sort(), ['102', '103']);

  const A = data.tasks.find(x => x.id === '101');
  assert.equal(h(A.metrics.worked_ms), 7.5);
  assert.equal(A.metrics.estimated, false);
  assert.equal(A.metrics.review_rounds, 1);
  assert.equal(A.metrics.on_time, true);
  assert.deepEqual(A.campaigns, ['Black Friday']);
  const B = data.tasks.find(x => x.id === '102');
  assert.equal(B.metrics.open, true);
  assert.equal(B.metrics.estimated, true);
  assert.equal(h(B.metrics.worked_ms), 13);                  // Tue 09–19 + Wed 09–12 working hours
  assert.equal(h(B.metrics.waiting_ms), 23 * 24 - 1);        // Sun 1 Nov 10:00 → Tue 24 Nov 09:00
  assert.equal(B.segments[0].status, '');                    // from the request, before the first status
  const D = data.tasks.find(x => x.id === '104');
  assert.equal(D.metrics.worked_ms, 0);
  assert.equal(D.metrics.first_started_at, null);
  assert.equal(h(data.clocked['11']), 17);

  const o = TT.overview(data, {});
  assert.equal(o.kpis.delivered, 2);
  assert.equal(o.kpis.open, 1);
  assert.equal(o.kpis.utilization, Math.round((7.5 / 17) * 100) / 100);
  assert.equal(o.tasks.length, 3);
  assert.ok(o.tasks.every(x => Array.isArray(x.strip) && !('worked_pieces' in x)));
  const maya = o.by_person.find(r => r.key === '11');
  assert.equal(maya.label, 'Maya Test');
  assert.equal(maya.matched, true);
  assert.equal(maya.delivered, 2);
  assert.equal(o.by_person.find(r => r.key === '12').matched, false);
  assert.deepEqual(o.filters.types.map(x => x.label).sort(), ['Static', 'UGC']);
  assert.equal(o.weekly.length, 2);

  // filters
  assert.deepEqual(TT.overview(data, { person: '12' }).tasks.map(x => x.id), ['102']);
  assert.deepEqual(TT.overview(data, { type: 'UGC' }).tasks.map(x => x.id).sort(), ['101', '104']);
  assert.deepEqual(TT.overview(data, { campaign: 'Black Friday' }).tasks.map(x => x.id), ['101']);
  assert.equal(TT.overview(data, { person: '12' }).kpis.utilization, null);   // Dan has no clock

  // CSV: header + 3 rows, Excel BOM, hours as numbers
  const csv = TT.toCsv(data, {});
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^Board,Task,Monday link/);
  assert.ok(lines.some(l => l.includes('UGC hook test') && l.includes(',7.5,no,')));

  // cached: a second call doesn't read Monday again
  const n = calls.logs.length;
  await TT.load({ from: '2026-11-15', to: '2026-11-25' }, { board: 'video', now: NOW });
  assert.equal(calls.logs.length, n);
});

test('loader: one task for the task panel — same numbers as the overview', async (t) => {
  mockMonday();
  const realNow = Date.now;
  Date.now = () => NOW;
  t.after(() => { Date.now = realNow; });
  const TT = require('../src/lib/timetrack/data');
  const r = await TT.loadTask({ board: 'video', itemId: '101' });
  assert.equal(h(r.task.metrics.worked_ms), 7.5);
  assert.equal(r.task.metrics.review_rounds, 1);
  assert.equal(r.people['11'].matched, true);
  assert.ok(!('worked_pieces' in r.task.metrics));
  await assert.rejects(TT.loadTask({ board: 'design', itemId: '101' }), /isn’t on that board/);
  await assert.rejects(TT.loadTask({ board: 'nope', itemId: '101' }), /video or design/);
});

test('range checks', () => {
  const TT = require('../src/lib/timetrack/data');
  assert.throws(() => TT.rangeBounds({ from: '2026-11-20', to: '2026-11-10' }, NOW), /start is after the end/);
  assert.throws(() => TT.rangeBounds({ from: '2026-01-01', to: '2026-11-10' }, NOW), /120 days or less/);
  assert.throws(() => TT.rangeBounds({ from: 'x', to: '2026-11-10' }, NOW), /start and an end/);
  assert.equal(TT.rangeBounds({ from: '2026-11-15', to: '2026-11-21' }, NOW).days, 7);
});
