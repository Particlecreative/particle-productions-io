const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyDeliveries } = require('../../src/lib/creative/classify');

const FROM = Date.parse('2026-10-17T21:00:00Z');
const TO = Date.parse('2026-10-24T21:00:00Z');
const H = 3600000;
const opts = {
  statusColumn: 'status',
  delivered: ['Approved', 'Completed', 'Upload Complete'],
  fixes: ['Fixes Round'],
  fromMs: FROM, toMs: TO,
  rule: { count_intra_delivered: false, exclude_reopened_in_week: true, treat_is_done_as_delivered: true },
};
const lab = (text, is_done = false) => ({ text, is_done });
let seq = 0;
const ev = (pulse, at, prev, value, user = '1') => ({
  id: `e${++seq}`, pulse_id: pulse, column_id: 'status', at_ms: at, user_id: user,
  prev: prev ? lab(prev, prev === 'Completed') : null, value: lab(value, value === 'Completed'), pulse_name: `item ${pulse}`,
});

test('Pending → QC → Approved → Completed counts once (real item 13237256839 shape)', () => {
  const events = [
    ev('A', FROM + 50 * H, 'Pending', 'Quality Check'),
    ev('A', FROM + 60 * H, 'Quality Check', 'Approved'),
    ev('A', FROM + 61 * H, 'Approved', 'Completed'),
  ];
  const r = classifyDeliveries(events.reverse(), opts); // API returns newest first
  assert.deepEqual(Object.keys(r.delivered), ['A']);
  assert.equal(r.delivered.A.rounds, 1);
  assert.equal(r.delivered.A.delivered_at, FROM + 60 * H);
  assert.equal(r.delivered.A.delivered_status, 'Completed');
});

test('Approved last week, Completed this week → not a new delivery', () => {
  const r = classifyDeliveries([ev('B', FROM + 5 * H, 'Approved', 'Completed')], opts);
  assert.deepEqual(r.delivered, {});
});

test('Delivered then reopened within the week → excluded, listed as reopened', () => {
  const r = classifyDeliveries([
    ev('C', FROM + 10 * H, 'Working', 'Approved'),
    ev('C', FROM + 20 * H, 'Approved', 'Fixes Round'),
  ], opts);
  assert.deepEqual(r.delivered, {});
  assert.deepEqual(r.reopened, ['C']);
});

test('Delivered, reopened, re-delivered → counted once at the last delivery with fixes counted', () => {
  const r = classifyDeliveries([
    ev('D', FROM + 10 * H, 'Working', 'Approved'),
    ev('D', FROM + 20 * H, 'Approved', 'Fixes Round'),
    ev('D', FROM + 30 * H, 'Fixes Round', 'Approved'),
  ], opts);
  assert.equal(r.delivered.D.rounds, 2);
  assert.equal(r.delivered.D.delivered_at, FROM + 30 * H);
  assert.equal(r.delivered.D.fixes_in_week, 1);
});

test('Events outside the window are ignored', () => {
  const r = classifyDeliveries([
    ev('E', FROM - H, 'Working', 'Approved'),
    ev('F', TO + H, 'Working', 'Approved'),
  ], opts);
  assert.deepEqual(r.delivered, {});
});

test('Subitem and non-status events are ignored', () => {
  const sub = { ...ev('G', FROM + H, 'Working', 'Approved'), parent_item_id: '999' };
  const other = { ...ev('H', FROM + H, 'Working', 'Approved'), column_id: 'timeline' };
  assert.deepEqual(classifyDeliveries([sub, other], opts).delivered, {});
});

test('is_done label counts as delivered even if not configured', () => {
  const e = { ...ev('I', FROM + H, 'Working', 'Done'), value: { text: 'Done', is_done: true } };
  assert.ok(classifyDeliveries([e], opts).delivered.I);
});

test('Automation-driven delivery is flagged', () => {
  const r = classifyDeliveries([ev('J', FROM + H, 'Review', 'Approved', '-4')], opts);
  assert.equal(r.delivered.J.by_automation, true);
});

test('Bulk move guard warns when one user moves >15 items within 3 minutes', () => {
  const events = [];
  for (let i = 0; i < 17; i++) events.push(ev(`K${i}`, FROM + H + i * 5000, 'Working', 'Completed', '42'));
  const r = classifyDeliveries(events, opts);
  assert.equal(Object.keys(r.delivered).length, 17);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Bulk move/);
});

test('Sunday review: last week’s work approved on review Sunday counts for last week only', () => {
  const { sundayReview } = require('../../src/lib/creative/classify');
  const W = require('../../src/lib/creative/week');
  const at = (d, h) => W.zonedMidnightUtc(d) + h * 3600000;
  const delivered = {
    yael: { delivered_at: at('2026-10-25', 12) },   // timeline Oct 18–22, approved Sunday Oct 25
    kerry: { delivered_at: at('2026-10-25', 11) },  // timeline Oct 25 — new week's work
    mid: { delivered_at: at('2026-10-21', 15) },    // ordinary mid-week delivery
  };
  const ends = { yael: '2026-10-22', kerry: '2026-10-25', mid: '2026-10-21' };
  const last = sundayReview(delivered, { firstDay: '2026-10-18', lastDay: '2026-10-24', endOf: (id) => ends[id] });
  assert.deepStrictEqual(Object.keys(last).sort(), ['mid', 'yael']);
  const next = sundayReview(delivered, { firstDay: '2026-10-25', lastDay: '2026-10-31', endOf: (id) => ends[id] });
  assert.deepStrictEqual(Object.keys(next), ['kerry']); // yael was counted last week
});
