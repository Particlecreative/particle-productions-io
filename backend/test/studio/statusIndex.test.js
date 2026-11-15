// "label has been deactivated": a status is written by its active index, never by a name a deactivated twin shares.
//   cd backend && node --test test/studio/statusIndex.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const monday = require('../../src/lib/monday');
const M = require('../../src/lib/medium/monday');

// Video Projects › Type: "TV" twice — index 7 deactivated, index 101 active
const TYPE = { byIndex: { 7: { label: 'TV', deactivated: true }, 101: { label: 'TV', deactivated: false }, 0: { label: 'Iterations/Cuts/Edits', deactivated: false } }, byLabel: { tv: 101, 'iterations/cuts/edits': 0 } };

test('statusValue: the active index, never the deactivated twin; text only when the label is unknown', () => {
  assert.deepEqual(monday.statusValue(TYPE, 'TV'), { index: 101 });
  assert.deepEqual(monday.statusValue(TYPE, ' tv '), { index: 101 });
  assert.deepEqual(monday.statusValue(TYPE, 'Iterations/Cuts/Edits'), { index: 0 });
  assert.deepEqual(monday.statusValue(TYPE, 'Blurr'), { label: 'Blurr' });                          // a new Brands label (created on the fly)
  assert.deepEqual(monday.statusValue(null, 'TV'), { label: 'TV' });                                // no board meta
  const onlyOff = { byIndex: { 4: { label: 'GT', deactivated: true } }, byLabel: { gt: 4 } };
  assert.deepEqual(monday.statusValue(onlyOff, 'GT'), { label: 'GT' });                            // never sends a deactivated index
});

test('Medium: statuses go by index when the board labels are known', () => {
  const labels = { label9: ['Face Cream'], label: ['Marketing/Media'], single_selectu06tevn: ['Meta'], label4: ['Iterations/Cuts/Edits'] };
  Object.defineProperty(labels, '__index', { value: { label9: { 'face cream': 105 }, label: { 'marketing/media': 105 }, single_selectu06tevn: { meta: 0 }, label4: { 'iterations/cuts/edits': 0 } }, enumerable: false });
  const { values } = M.columnValues({ format: 'video', product: 'Face Cream', fields: { video_type: 'creator edit' } }, { labels });
  assert.deepEqual(values.label9, { index: 105 });
  assert.deepEqual(values.label, { index: 105 });
  assert.deepEqual(values.single_selectu06tevn, { index: 0 });
  assert.deepEqual(values.label4, { index: 0 });
  // without the index (older callers / tests) it still writes the text
  const plain = M.columnValues({ format: 'video', product: 'Face Cream', fields: {} }, { labels: { label9: ['Face Cream'] } });
  assert.deepEqual(plain.values.label9, { label: 'Face Cream' });
});
