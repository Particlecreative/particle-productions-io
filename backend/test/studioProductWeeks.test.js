// By product (24 Nov 2026): the week-by-week grouping behind the Studio / Growth "By product" tab.
// The module lives in the frontend (ESM, no JSX) — loaded with a dynamic import.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const load = () => import(pathToFileURL(path.join(__dirname, '../../src/components/studio/byProduct.js')).href);
const t = (id, board, product, due, category = 'in_progress', platform = 'Meta', extra = {}) => ({
  id: String(id), board, product: product ? { label: product, color: '#123456' } : { label: '' },
  timeline: due ? { from: due, to: due } : null, status: { label: category, category }, platform, ...extra,
});

test('By product: tickets land in the week of their delivery date, video and design apart', async () => {
  const { productWeeks } = await load();
  const items = [
    t(1, 'video', 'Shampoo', '2026-11-24'), t(2, 'design', 'Shampoo', '2026-11-27'), t(3, 'design', 'Shampoo', '2026-12-02'),
    t(4, 'video', 'NeoRoot', '2026-11-29'), t(5, 'email', 'Shampoo', '2026-11-24'),
  ];
  const v = productWeeks(items, { start: '2026-11-25', weeks: 2 });   // a Wednesday — weeks start on the Sunday before
  assert.deepEqual(v.cols.map(c => c.key), ['2026-11-22', '2026-11-29']);
  const shampoo = v.rows.find(r => r.label === 'Shampoo');
  assert.equal(shampoo.total, 3);
  assert.deepEqual(shampoo.cells['2026-11-22'].video.map(i => i.id), ['1']);
  assert.deepEqual(shampoo.cells['2026-11-22'].design.map(i => i.id), ['2']);
  assert.deepEqual(shampoo.cells['2026-11-29'].design.map(i => i.id), ['3']);
  assert.equal(v.rows[0].label, 'Shampoo', 'most tickets first');
  assert.deepEqual(v.totals['2026-11-29'], { video: 1, design: 1, meta: 2, done: 0 });
});

test('By product: overdue and undated open tickets get their own columns; finished ones only inside the weeks', async () => {
  const { productWeeks } = await load();
  const items = [
    t(1, 'video', 'Shampoo', '2026-11-10'), t(2, 'video', 'Shampoo', '2026-11-10', 'delivered'),
    t(3, 'design', 'Shampoo', null), t(4, 'design', 'Shampoo', null, 'delivered'),
    t(5, 'design', 'Shampoo', '2026-11-24', 'delivered'), t(6, 'video', 'Shampoo', '2027-01-20'),
    { ...t(7, 'video', 'Shampoo', null), deadline: '2026-11-25' },
  ];
  const v = productWeeks(items, { start: '2026-11-22', weeks: 1 });
  assert.deepEqual(v.cols.map(c => c.kind), ['late', 'week', 'none']);
  const c = v.rows[0].cells;
  assert.deepEqual(c.late.video.map(i => i.id), ['1']);
  assert.deepEqual(c.none.design.map(i => i.id), ['3']);
  assert.deepEqual(c['2026-11-22'].design.map(i => i.id), ['5']);
  assert.deepEqual(c['2026-11-22'].video.map(i => i.id), ['7'], 'no timeline → the deadline');
  assert.equal(v.totals['2026-11-22'].done, 1);
});

test('By product: Meta / Not Meta and Video / Design filters, products without a label last', async () => {
  const { productWeeks, isMeta } = await load();
  assert.ok(isMeta('Meta') && isMeta('Facebook') && isMeta('Instagram Reels') && !isMeta('Google') && !isMeta('') && !isMeta('Metamucil'));
  const items = [
    t(1, 'video', 'Shampoo', '2026-11-24', 'review', 'Meta'), t(2, 'video', 'Shampoo', '2026-11-24', 'review', 'Google'),
    t(3, 'design', '', '2026-11-24', 'queued', ''), t(4, 'design', 'NeoRoot', '2026-11-24', 'queued', 'Meta'),
  ];
  const meta = productWeeks(items, { start: '2026-11-22', weeks: 1, platform: 'meta' });
  assert.deepEqual(meta.rows.flatMap(r => Object.values(r.cells).flatMap(c => [...c.video, ...c.design])).map(i => i.id).sort(), ['1', '4']);
  const other = productWeeks(items, { start: '2026-11-22', weeks: 1, platform: 'other' });
  assert.deepEqual(other.rows.map(r => r.label), ['Shampoo', 'No product']);
  assert.equal(other.noPlatform, 1);
  const design = productWeeks(items, { start: '2026-11-22', weeks: 1, board: 'design' });
  assert.deepEqual(design.rows.map(r => r.label), ['NeoRoot', 'No product']);
});
