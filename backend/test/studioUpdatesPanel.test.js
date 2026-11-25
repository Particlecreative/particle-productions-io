// Task updates, Monday-style (25 Nov 2026): the server's shape of an update / file / activity row, and the panel's
// helpers (status-change updates, file badges, links, search and order).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const U = require('../src/lib/studio/updates');
const { updateHtml } = require('../src/lib/studio/write');
const kit = () => import(pathToFileURL(path.join(__dirname, '../../src/components/studio/updatesKit.js')).href);

test('an update: author, likes, who saw it (not the author), files, pin', () => {
  const u = U.shape({
    id: 5752967412, body: '<p>Hi <a class="user_mention_editor" data-mention-type="User">@Mor Ben Tal</a></p>', text_body: 'Hi @Mor Ben Tal', created_at: '2026-11-25T10:02:41.000Z',
    creator: { id: '118504944', name: 'Kerry Bershtein' },
    likes: [{ creator_id: '80525812', reaction_type: '+1', creator: { id: '80525812', name: 'Mor Ben Tal' } }, { creator_id: null }],
    viewers: [{ user_id: '80525812', medium: 'web', user: { name: 'Mor Ben Tal' } }, { user_id: '118504944', medium: 'web' }, { user_id: '80525812', medium: 'email' }],
    assets: [{ id: 3410517798, name: 'Face Wash.ai', file_extension: '.ai', file_size: 1635471, public_url: 'https://s3/x', url_thumbnail: '', created_at: '2026-11-25T10:02:11Z', uploaded_by: { name: 'Kerry Bershtein' } }, null],
    pinned_to_top: [{ item_id: '1' }],
  });
  assert.equal(u.id, '5752967412');
  assert.deepEqual(u.by, { id: '118504944', name: 'Kerry Bershtein' });
  assert.deepEqual(u.likes, [{ id: '80525812', name: 'Mor Ben Tal', reaction: '+1' }]);
  assert.deepEqual(u.seen, [{ id: '80525812', name: 'Mor Ben Tal' }]);
  assert.deepEqual(u.files, [{ id: '3410517798', name: 'Face Wash.ai', ext: 'ai', size: 1635471, image: false, url: 'https://s3/x', thumb: null, at: '2026-11-25T10:02:11Z', by: 'Kerry Bershtein' }]);
  assert.equal(u.pinned, true);
  assert.equal(U.fileOf({ id: 1, name: 'Shot.JPG', file_extension: '' }).image, true, 'extension from the name');
});

test('activity: created, status moves, people on / off, timeline and deadline moves — newest first, no-ops and undos left out', () => {
  const cols = { status: 'status', people: 'person', timeline: 'timeline', deadline: 'date4' };
  const ev = (id, at, o) => ({ id, at_ms: Date.parse(at), user_id: '7', event: 'update_column_value', ...o });
  const rows = U.activityRows([
    ev('1', '2026-11-20T08:00:00Z', { event: 'create_pulse' }),
    ev('2', '2026-11-20T09:00:00Z', { column_id: 'status', prev: null, value: { text: 'Working on it' } }),
    ev('3', '2026-11-21T09:00:00Z', { column_id: 'person', prev_raw: { personsAndTeams: [{ id: 1, kind: 'person' }] }, value_raw: { personsAndTeams: [{ id: 2, kind: 'person' }, { id: 9, kind: 'team' }] } }),
    ev('4', '2026-11-22T09:00:00Z', { column_id: 'timeline', prev_raw: { from: '2026-11-20', to: '2026-11-21' }, value_raw: { from: '2026-11-24', to: '2026-11-26' } }),
    ev('5', '2026-11-23T09:00:00Z', { column_id: 'date4', prev_raw: { date: '2026-11-24' }, value_raw: { date: '2026-11-27' } }),
    ev('6', '2026-11-23T10:00:00Z', { column_id: 'status', prev: { text: 'Done' }, value: { text: 'Done' } }),
    ev('7', '2026-11-23T11:00:00Z', { column_id: 'status', prev: { text: 'Done' }, value: { text: 'Live' }, is_undo: true }),
    ev('8', '2026-11-23T12:00:00Z', { column_id: 'text0' }),
  ], cols, { 7: 'Avi Levi', 1: 'Dana', 2: 'Itai' });
  assert.deepEqual(rows.map(r => r.kind), ['deadline', 'timeline', 'people', 'status', 'created']);
  assert.deepEqual(rows[0], { id: '5', at: '2026-11-23T09:00:00.000Z', by: { id: '7', name: 'Avi Levi' }, kind: 'deadline', from: '2026-11-24', to: '2026-11-27' });
  assert.deepEqual(rows[2].added, [{ id: '2', name: 'Itai' }]);
  assert.deepEqual(rows[2].removed, [{ id: '1', name: 'Dana' }]);
  assert.deepEqual([rows[3].from, rows[3].to], ['', 'Working on it']);
});

test('likes and edits need the person’s own Monday', async () => {
  await assert.rejects(U.like({}, '1', '2', true, null), /Connect your Monday/);
  await assert.rejects(U.edit({}, '1', '2', 'hi', [], { token: null }), /Connect your Monday/);
  assert.match(updateHtml('Thanks @Dana Levi', null, [{ id: '42', name: 'Dana Levi' }]).html, /data-mention-id="42"/);
});

test('panel: Monday’s automatic status update becomes a change — labels with " to " in them included', async () => {
  const { parseChange } = await kit();
  const name = 'Philadelphia Bus Station Poster Campaign for Gravité';
  assert.deepEqual(parseChange({ html: '', text: `${name} Status was changed from Working on it to Live` }, name, ['Working on it', 'Live']), { column: 'Status', from: 'Working on it', to: 'Live' });
  assert.deepEqual(parseChange({ html: '', text: `${name} Status was changed from Ready to go to Done` }, name, ['Ready to go', 'Done']), { column: 'Status', from: 'Ready to go', to: 'Done' });
  assert.deepEqual(parseChange({ html: '', text: 'Old name Status was changed from Stuck to Done' }, name, ['Stuck', 'Done']), { column: 'Status', from: 'Stuck', to: 'Done' });
  assert.deepEqual(parseChange({ html: '', text: `${name} Status was changed from  to Live` }, name, ['Live']), { column: 'Status', from: '', to: 'Live' });
  assert.equal(parseChange({ html: '<p>Status was changed from A to B — no, really</p>', text: 'Status was changed from A to B' }, name), null, 'a real update is never a change');
  assert.equal(parseChange({ html: '', text: 'Looks great' }, name), null);
});

test('panel: file badges, sizes, Monday links, search, pinned first', async () => {
  const { fileKind, fileSize, updateLink, filterUpdates, orderUpdates, dayLabel } = await kit();
  assert.deepEqual(fileKind('PDF'), { label: 'PDF', color: '#e2445c' });
  assert.equal(fileKind('mov').label, 'VIDEO');
  assert.equal(fileKind('xyz').label, 'XYZ');
  assert.equal(fileSize(1402831), '1.3 MB');
  assert.equal(fileSize(800), '800 B');
  assert.equal(updateLink('https://particle-for-men.monday.com/boards/1/pulses/2?x=1', '99'), 'https://particle-for-men.monday.com/boards/1/pulses/2/posts/99');
  assert.equal(updateLink('', '99'), '');
  const list = [{ id: 'a', at: '2026-11-20', text: 'brief', by: { name: 'Avi' }, files: [], replies: [] }, { id: 'b', at: '2026-11-24', text: 'cut is up', by: { name: 'Itai' }, files: [{ name: 'Poster.png' }], replies: [{ text: 'tighten the end card', by: { name: 'Avi' } }] }, { id: 'c', at: '2026-11-22', text: 'x', pinned: true, files: [], replies: [] }];
  assert.deepEqual(orderUpdates(list).map(u => u.id), ['c', 'b', 'a']);
  assert.deepEqual(filterUpdates(list, { q: 'poster' }).map(u => u.id), ['b']);
  assert.deepEqual(filterUpdates(list, { q: 'end card' }).map(u => u.id), ['b']);
  assert.deepEqual(filterUpdates(list, { filter: 'changes', isChange: u => u.id === 'a' }).map(u => u.id), ['a']);
  assert.equal(dayLabel('2026-11-25T08:00:00Z', Date.parse('2026-11-25T12:00:00Z')), 'Today');
  assert.equal(dayLabel('2026-11-24T08:00:00Z', Date.parse('2026-11-25T12:00:00Z')), 'Yesterday');
});
