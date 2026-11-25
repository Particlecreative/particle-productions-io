// The Creative team's Kanban (25 Nov 2026): smart order (late / today first, then priority, start, deadline),
// Monday's status columns, the by-deadline view, the one-click next step.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '../../src/components/studio/kanban.js')).href);
const T = '2026-11-25';
const it = (id, o = {}) => ({ id, name: `Task ${id}`, open: true, status: { label: 'Working', category: 'in_progress' }, ...o });

test('priority labels rank Critical → Low, emoji and case ignored', async () => {
  const { priorityRank } = await load();
  assert.deepEqual(['Critical ⚠️️', 'High', 'medium', 'Low', '', 'Whatever'].map(priorityRank), [0, 1, 2, 3, 4, 4]);
});

test('smart order: overdue and today first, then priority, then the nearest deadline and start', async () => {
  const { smartSort, urgency } = await load();
  const list = [
    it('a', { priority: 'Low', deadline: '2026-11-30' }), it('b', { priority: 'Critical', deadline: '2026-12-04' }),
    it('c', { priority: 'Medium', deadline: '2026-11-24' }), it('d', { priority: 'Low', deadline: T }),
    it('e', { priority: 'High' }), it('f', { priority: 'High', timeline: { from: '2026-11-26', to: '2026-11-27' } }),
  ];
  assert.deepEqual(smartSort(list, T).map(x => x.id), ['c', 'd', 'b', 'f', 'e', 'a']);
  assert.equal(urgency(it('x', { deadline: '2026-11-26' }), T), 'soon');
  assert.equal(urgency(it('x', { open: false, deadline: '2026-11-20' }), T), 'done');
});

test('status columns run the way work moves (waiting → working → review → done), merge boards by label, keep the main flow even when empty', async () => {
  const { statusColumns } = await load();
  const boards = {
    video: { statuses: [{ label: 'Pending', color: '#e2445c', category: 'queued' }, { label: 'Working', color: '#579bfc', category: 'in_progress' }, { label: 'Review', color: '#9cd326', category: 'review' }, { label: 'Done', color: '#00c875', category: 'delivered' }] },
    design: { statuses: [{ label: 'Working', color: '#579bfc', category: 'in_progress' }, { label: 'Paused', color: '#9d99b9', category: 'paused' }] },
  };
  const cols = statusColumns([it('a'), it('b', { status: { label: 'Done', category: 'delivered' } }), it('c', { status: { label: 'Odd', category: 'queued', color: '#111' } })], boards);
  assert.deepEqual(cols.map(c => [c.label, c.items.length]), [['Pending', 0], ['Odd', 1], ['Working', 1], ['Review', 0], ['Done', 1]]);   // the way work moves
  assert.deepEqual(statusColumns([it('a')], boards, { hideDone: true }).map(c => c.label), ['Pending', 'Working', 'Review']);
});

test('by deadline, next step, card words, search', async () => {
  const { dueColumns, nextStatus, dueWords, matchTask } = await load();
  const cols = dueColumns([it('a', { deadline: '2026-11-20' }), it('b', { deadline: T }), it('c'), it('d', { open: false, deadline: T })], T);
  assert.deepEqual(cols.map(c => c.items.map(x => x.id).join('')), ['a', 'b', '', '', '', 'c']);
  const sts = [{ label: 'Pending', category: 'queued' }, { label: 'Working', category: 'in_progress' }, { label: 'Review', category: 'review' }];
  assert.equal(nextStatus(it('a', { status: { category: 'queued' } }), sts).label, 'Working');
  assert.equal(nextStatus(it('a'), sts).label, 'Review');
  assert.equal(nextStatus(it('a', { status: { category: 'review' } }), sts), null);
  assert.equal(dueWords(it('a', { deadline: '2026-11-22' }), T), 'Overdue 3d');
  assert.equal(dueWords(it('a', { deadline: '2026-11-26' }), T), 'Tomorrow');
  assert.equal(dueWords(it('a', { deadline: '2026-12-10' }), T), 'Dec 10');
  assert.ok(matchTask(it('a', { product: { label: 'Gravité' }, requested_by: ['9'] }), 'grav'));
  assert.ok(matchTask(it('a', { requested_by: ['9'] }), 'lilian', { 9: 'Lilian Krumholz' }));
  assert.ok(!matchTask(it('a'), 'neck'));
});
