// Captain Caption — pure-logic tests:  cd backend && node --test test/captain.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, merge } = require('../src/lib/captain/config');
const { inScope } = require('../src/lib/captain/scope');
const L = require('../src/lib/captain/labels');
const figma = require('../src/lib/captain/figma');
const { hookVariations } = require('../src/lib/captain/monday');
const { postingFor, commentText, normIssues, briefBlock } = require('../src/lib/captain/video');

const cfg = DEFAULTS;

test('scope: allowed departments per board', () => {
  assert.equal(inScope({ discipline: 'video', department: 'Marketing/Media', title: 'x' }, cfg).ok, true);
  assert.equal(inScope({ discipline: 'video', department: 'Retention', title: 'x' }, cfg).ok, true);
  assert.equal(inScope({ discipline: 'design', department: 'Marketing', title: 'x' }, cfg).ok, true);
  assert.equal(inScope({ discipline: 'design', department: 'Email', title: 'x' }, cfg).ok, true);
  assert.equal(inScope({ discipline: 'design', department: 'Marketing/Media', title: 'x' }, cfg).ok, false);
  assert.equal(inScope({ discipline: 'video', department: 'Creative', title: 'Easter header' }, cfg).ok, false);
});

test('scope: "Meta" in the title as a word, never TV', () => {
  assert.equal(inScope({ discipline: 'video', department: 'Creative', title: 'Face Cream | Meta | Claude | COPYCAT' }, cfg).ok, true);
  assert.equal(inScope({ discipline: 'video', department: 'Creative', title: 'Meta Ad – Face Cream' }, cfg).ok, true);
  assert.equal(inScope({ discipline: 'video', department: 'Creative', title: 'Metallic packaging' }, cfg).ok, false);
  assert.equal(inScope({ discipline: 'video', department: 'TV', title: 'Meta cut of the TV ad' }, cfg).ok, false);
  assert.equal(inScope({ discipline: 'video', department: 'Marketing/Media', type: 'TV', title: 'Meta' }, cfg).ok, false);
  assert.match(inScope({ discipline: 'video', department: 'TV', title: 'x' }, cfg).reason, /TV/);
});

test('labels: version vs size vs master order', () => {
  assert.equal(L.sizeFromName('FaceCream_BoughtParticle_16X9_V1.mp4'), '16x9');
  assert.equal(L.sizeFromName('FaceCream_SaveMoneyCopyCat_4X5_V2_Omri.mp4'), '4x5');
  assert.equal(L.variantFromName('FaceCream_SaveMoneyCopyCat_4X5_V2_Omri.mp4'), 2);
  assert.equal(L.variantFromName('Face_16x9_v1.mp4'), 1);
  assert.equal(L.variantFromName('Gravite_Video.mp4'), null);
  assert.equal(L.deliverableLabel({ variant: 1, size: '16x9' }), 'Version 1 · 16x9');
  assert.equal(L.sizeFromPixels(1200, 1200), '1x1');
  assert.equal(L.sizeFromPixels(900, 1600), '9x16');
  assert.equal(L.sizeFromPixels(1080, 1350), '4x5');
  assert.ok(L.sizeRank('16x9') < L.sizeRank('9x16') && L.sizeRank('9x16') < L.sizeRank('4x5'));
});

test('figma: link parsing', () => {
  assert.deepEqual(figma.parseUrl('https://www.figma.com/design/LKvGdgYJ7LT5UHqa69i6Uy/MEDIA-Products-2026?node-id=1-18&t=4Ukl1MDJmWcnj6w1-1'), { fileKey: 'LKvGdgYJ7LT5UHqa69i6Uy', nodeId: '1:18' });
  assert.deepEqual(figma.parseUrl('https://www.figma.com/design/LKvGdgYJ7LT5UHqa69i6Uy/X?node-id=20361%3A1602'), { fileKey: 'LKvGdgYJ7LT5UHqa69i6Uy', nodeId: '20361:1602' });
  assert.deepEqual(figma.parseUrl('Figma - https://www.figma.com/file/AbC123/Name'), { fileKey: 'AbC123', nodeId: null });
  assert.equal(figma.parseUrl('https://next.frame.io/project/x/y'), null);
});

test('figma: a section becomes its frames; a page is refused; hidden layers ignored', () => {
  const section = { type: 'SECTION', name: 'Task', children: [
    { type: 'FRAME', id: '1:1', name: 'A', absoluteBoundingBox: { width: 1200, height: 1200 }, children: [{ type: 'TEXT', id: '1:2', name: 't', characters: 'STRONGER HAIR' }, { type: 'TEXT', id: '1:3', visible: false, characters: 'old' }] },
    { type: 'FRAME', id: '1:4', name: 'A', absoluteBoundingBox: { width: 900, height: 1600 }, children: [{ type: 'TEXT', id: '1:5', characters: 'STRONGER' }, { type: 'TEXT', id: '1:6', characters: 'HAIR' }] },
  ] };
  const out = figma.framesOf(section);
  assert.equal(out.frames.length, 2);
  assert.deepEqual(out.frames.map(f => f.size), ['1x1', '9x16']);
  assert.equal(out.frames[0].texts.length, 1);
  assert.equal(figma.normCopy(out.frames[0]), figma.normCopy(out.frames[1]));          // same copy split over two layers
  assert.equal(figma.framesOf({ type: 'CANVAS', children: [] }).kind, 'page');
  assert.equal(figma.contentHash(out.frames), figma.contentHash(JSON.parse(JSON.stringify(out.frames))));
});

test('monday: hook variations from the request form', () => {
  const item = { brief: { hook: 'fallback', request_update: 'Hook Variations\n---------------\n\n1. Bought Particle from a reseller to save a few bucks?\n2. Save 10$ on Particle?\n\nScript / Message\n----------------\n\nHere’s the problem.' } };
  assert.deepEqual(hookVariations(item), ['Bought Particle from a reseller to save a few bucks?', 'Save 10$ on Particle?']);
  assert.deepEqual(hookVariations({ brief: { hook: 'Only hook', request_update: null } }), ['Only hook']);
});

test('video: posting switch', () => {
  const test = merge(DEFAULTS, { posting: { mode: 'test', test_monday_items: ['42'] } });
  assert.deepEqual(postingFor(test, { frameioFolderId: 'd2acf872-68a9-43bd-a0d4-81c64e6771b1', itemId: '42' }), { mode: 'test', comments: true, monday: true });
  assert.deepEqual(postingFor(test, { frameioFolderId: 'bf9644e6-real-folder', itemId: '12818442030' }), { mode: 'test', comments: false, monday: false });
  assert.deepEqual(postingFor(merge(DEFAULTS, { posting: { mode: 'off' } }), { frameioFolderId: 'd2acf872-68a9-43bd-a0d4-81c64e6771b1' }), { mode: 'off', comments: false, monday: false });
  assert.equal(postingFor(merge(DEFAULTS, { posting: { mode: 'live' } }), { frameioFolderId: 'any', itemId: '1' }).comments, true);
});

test('video: frames are 1-based and comments start with the Captain', () => {
  const [a] = normIssues([{ start: 7.5, end: 8.5, found: 'CUSTUMER', fix: 'CUSTOMER', type: 'spelling', severity: 'must_fix' }], 24);
  assert.equal(a.frame, 181);
  assert.equal(a.duration_frames, 24);
  assert.equal(commentText(a), '🧑‍✈️ Captain Caption: "CUSTUMER" → "CUSTOMER"');
  const [b] = normIssues([{ start: 0, end: 2, found: 'SAVE 10$ ON PARTICLE?', fix: 'Bought Particle…', type: 'script_mismatch', severity: 'check' }], 24);
  assert.equal(b.frame, 1);
  assert.match(commentText(b), /^🧑‍✈️ Captain Caption: please check — differs from the brief/);
  assert.match(commentText({ ...a, type: 'vo_wrong_word', found: 'loose', fix: 'lose' }), /voiceover says "loose" → "lose"/);
});

test('video: brief block mentions versions and script order', () => {
  const txt = briefBlock({ brief: { versions_needed: 2, script: 'Line one.\nLine two.', hook: 'Hook A', request_update: null } });
  assert.match(txt, /asked for 2 versions/);
  assert.match(txt, /in this order/);
  assert.match(briefBlock(null), /No Monday brief/);
});

test('design: layer list and pinned comment wording', () => {
  const { layersBlock, commentText } = require('../src/lib/captain/design');
  const txt = layersBlock([{ id: '1:10', name: 'Ad', width: 1200, height: 1200, size: '1x1', texts: [{ id: '1:11', text: 'STRONGER,\nHAIR' }] }]);
  assert.match(txt, /Frame 1 — id 1:10 — 1200×1200 \(1x1\)/);
  assert.match(txt, /\[1:11\] STRONGER, HAIR/);
  assert.equal(commentText({ type: 'spelling', found: 'GAURANTEE', fix: 'GUARANTEE', severity: 'must_fix' }), '🧑‍✈️ Captain Caption: "GAURANTEE" → "GUARANTEE"');
  assert.match(commentText({ type: 'placeholder', found: 'Lorem ipsum', severity: 'must_fix' }), /placeholder text left in: "Lorem ipsum"/);
  assert.match(commentText({ type: 'size_mismatch', found: 'A', fix: 'B', severity: 'check' }), /differs from the other size/);
});
