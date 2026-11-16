// MEDIUM — briefs written from a reference: shown full size, uploaded to Monday.   cd backend && node --test test/mediumReferences.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/lib/medium/references');
const M = require('../src/lib/medium/monday');
const monday = require('../src/lib/monday');

const WINNER = { key: '6994925e', label: 'Gravite Deodorant product shoot image 1', image: 'https://storage.googleapis.com/spring-assets-prod/images/a.jpg', format: 'static', roas: 4.947, spend: 2978, purchases: 159, percentile: 99, on_image: null, headlines: ['Smell Great, Feel Invincible'], account: 'Particle Body' };
const REFRESH = { format: 'design', product: 'Gravité Deodorant', request: { move: 'REFRESH', source_key: '6994925e' }, evidence: { winners: [{ key: 'other', image: 'https://x/o.jpg' }, WINNER] }, fields: { brief: 'Please look at attached reference (the Gravité Deodorant product shoot static), copy style, apply to Particle design.' } };

test('the winner a move builds on is its reference — original image, stats, Upspring link', () => {
  const [r, ...rest] = R.referencesOf(REFRESH, { upspringLink: 'https://app.upspring.ai/creative/{id}' });
  assert.equal(rest.length, 0);
  assert.equal(r.kind, 'winner');
  assert.equal(r.image, WINNER.image);
  assert.equal(r.link, 'https://app.upspring.ai/creative/6994925e');
  assert.equal(r.headline, 'Smell Great, Feel Invincible');
  assert.deepEqual(r.stats, { roas: 4.947, spend: 2978, purchases: 159, percentile: 99, account: 'Particle Body', campaign: null });
  // no source_key, or a winner without media → nothing to show
  assert.deepEqual(R.referencesOf({ ...REFRESH, request: {} }), []);
  assert.deepEqual(R.referencesOf({ ...REFRESH, evidence: { winners: [{ key: '6994925e' }] } }), []);
  assert.equal(R.referencesOf(REFRESH).at(0).link, null);   // no Upspring link pattern set
});

test('Freeform references: images and Upspring ads attach; Monday tickets and pages are links', () => {
  const b = { request: {}, evidence: { references: [
    { kind: 'image', url: 'https://cdn.example.com/boards/Mood%20board.png' },
    { kind: 'upspring', url: 'upspring-ad:abc', label: 'Hims — the 3am mirror', video: 'https://storage.googleapis.com/v.mp4', image: 'https://storage.googleapis.com/p.jpg', link: 'https://www.facebook.com/ads/library/?id=1' },
    { kind: 'monday', url: 'https://particle-for-men.monday.com/boards/1/pulses/2' },
    { kind: 'web', url: 'https://example.com/page' },
    { kind: 'note', url: 'just words' },
  ] } };
  const refs = R.referencesOf(b);
  assert.deepEqual(refs.map(r => [r.kind, r.label]), [['image', 'Mood board.png'], ['upspring', 'Hims — the 3am mirror'], ['monday', 'https://particle-for-men.monday.com/boards/1/pulses/2'], ['web', 'https://example.com/page']]);
  assert.equal(refs[1].format, 'video');
  assert.deepEqual(R.attachable(refs).map(r => r.kind), ['image', 'upspring']);
});

test('file names: numbered, readable, the right extension', () => {
  assert.equal(R.fileName(1, 'Gravite Deodorant product shoot image 1', 'image/jpeg'), 'Reference 1 — Gravite Deodorant product shoot image 1.jpg');
  assert.equal(R.fileName(2, 'Mood board.png', 'image/png'), 'Reference 2 — Mood board.png');
  assert.equal(R.fileName(1, 'Hims / "3am"', 'video/mp4'), 'Reference 1 — Hims 3am.mp4');
  assert.equal(R.fileName(3, '', '', 'https://x/y.webp?s=1'), 'Reference 3 — reference.webp');
});

test('the Monday update names the reference and where its file is, right under the header', () => {
  const [r] = R.referencesOf(REFRESH, { upspringLink: 'https://app.upspring.ai/creative/{id}' });
  const html = M.briefHtml(REFRESH, 'Tomer', [{ ...r, attached: 'column' }]);
  assert.match(html, /<p><strong>Reference<\/strong><\/p><ul><li>Gravite Deodorant product shoot image 1 — static winner \(ROAS 4\.95 · \$2,978 spend · 99th pct\) · 📎 in Relevant Files · <a href="https:\/\/app\.upspring\.ai\/creative\/6994925e">Open in Upspring<\/a><\/li><\/ul>/);
  assert.ok(html.indexOf('Reference') < html.indexOf('Concept / Idea'));
  assert.doesNotMatch(M.briefHtml(REFRESH, 'Tomer'), /Reference<\/strong>/);   // no refs → no section (as before)
});

test('upload: Relevant Files first, the update when the column refuses, and only what Monday shows counts', async (t) => {
  const calls = [];
  t.mock.method(R, 'download', async (refs) => ({ files: refs.map((r, i) => ({ name: `Reference ${i + 1}.jpg`, mime: 'image/jpeg', buffer: Buffer.from('x'), ref: r })), failed: [] }));
  t.mock.method(monday, 'addFileToColumn', async (item, col, f) => { calls.push(['column', item, col, f.name]); if (f.name === 'Reference 2.jpg') throw new Error('column full'); return { add_file_to_column: { id: '11' } }; });
  t.mock.method(monday, 'addFileToUpdate', async (upd, f) => { calls.push(['update', upd, f.name]); return { add_file_to_update: { id: '22' } }; });
  t.mock.method(monday, 'itemAssetIds', async () => new Set(['11', '22']));
  const refs = [{ label: 'A', image: 'https://x/a.jpg' }, { label: 'B', image: 'https://x/b.jpg' }];
  const up = await M.attachReferences('900', 'design', refs);
  assert.deepEqual(up.done.map(d => d.where), ['column']);
  assert.equal(up.later.length, 1);
  const res = await up.finish('u1');
  assert.deepEqual(calls, [['column', '900', 'upload_file3__1', 'Reference 1.jpg'], ['column', '900', 'upload_file3__1', 'Reference 2.jpg'], ['update', 'u1', 'Reference 2.jpg']]);
  assert.deepEqual(res.attached.map(a => [a.label, a.where]), [['A', 'column'], ['B', 'update']]);
  assert.deepEqual(res.failed, []);
  // video board → the "files" column; a file Monday doesn't show is reported, not counted
  t.mock.method(monday, 'itemAssetIds', async () => new Set());
  const v = await (await M.attachReferences('901', 'video', [refs[0]])).finish(null);
  assert.equal(calls.at(-1)[2], 'files');
  assert.equal(v.attached.length, 0);
  assert.match(v.failed[0], /Monday doesn't show it/);
});
