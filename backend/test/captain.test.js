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
  assert.equal(L.variantFromName('Biomella_Cherry_Hook1_9x16.mp4'), 1);
  assert.equal(L.variantFromName('Biomella Cherry Hook 2 9x16.mp4'), 2);
  assert.equal(L.variantFromName('Hooked_On_Particle_9x16.mp4'), null);
  assert.equal(L.deliverableLabel({ variant: L.variantFromName('Biomella_Cherry_Hook2_9x16.mp4'), size: L.sizeFromName('Biomella_Cherry_Hook2_9x16.mp4') }), 'Version 2 · 9x16');
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

test('import: modules load and expose the job handlers', () => {
  const imp = require('../src/lib/captain/importer');
  for (const k of ['startImport', 'importFrameioItem', 'importFigmaFile', 'importStatus']) assert.equal(typeof imp[k], 'function');
  assert.equal(typeof require('../src/lib/captain/video').findItemForLink, 'function');
  assert.equal(typeof require('../src/lib/captain/monday').findItemByName, 'function');
});

test('re-runs never post the same Captain comment twice', () => {
  const { makeMatcher } = require('../src/lib/captain/dedupe');
  const m = makeMatcher([
    { id: 'a', text: '🧑‍✈️ Captain Caption: "CUSTUMER" → "CUSTOMER"', where: 181 },
    { id: 'b', text: '🧑‍✈️ Captain Caption: "CUSTUMER" → "CUSTOMER"', where: 637 },
  ]);
  assert.equal(m('🧑‍✈️ Captain Caption:  "CUSTUMER" → "CUSTOMER"', 185)?.id, 'a');   // same spot (±12 frames), whitespace ignored
  assert.equal(m('🧑‍✈️ Captain Caption: "CUSTUMER" → "CUSTOMER"', 640)?.id, 'b');
  assert.equal(m('🧑‍✈️ Captain Caption: "CUSTUMER" → "CUSTOMER"', 900), null);       // a third real occurrence still posts
  const f = makeMatcher([{ id: 'x', text: '🧑‍✈️ Captain Caption: "GAURANTEE" → "GUARANTEE"', where: '1:11' }]);
  assert.equal(f('🧑‍✈️ Captain Caption: "GAURANTEE" → "GUARANTEE"', ['1:12', '1:10']), null);  // different layer
  assert.equal(f('🧑‍✈️ Captain Caption: "GAURANTEE" → "GUARANTEE"', ['1:11', '1:10'])?.id, 'x');
});

// ── Brief pre-flight ─────────────────────────────────────────────────────────
const R = require('../src/lib/captain/briefRules');
const facts = {
  offers: [
    { id: 1, title: 'Christmas 2026', data: { code: 'XMAS30', tiers: [30], starts: '2026-12-10', ends: '2026-12-21' } },
    { id: 2, title: 'Black Friday 2026', data: { code: 'BLACK30', tiers: [25, 30], ends: '2026-12-01' } },
  ],
  prices: [{ id: 3, title: 'Neck Cream', data: { list_price: 59 } }],
  layoutLimits: [{ id: 4, title: '5 Bucks. 5 Problems.', data: { limits: R.parseLimits('headline 9x16: 32\nheadline 4x5: 40\nsubtitle * 60') } }],
  claims: [],
};
const brief = (lines, extra = {}) => R.normalizeRequest({ brief_id: 'mb_1', product: 'Neck Cream', lines, ...extra }).req;
const types = (issues) => issues.map(i => i.type).sort();

test('brief: request is cleaned (versions, sizes, tiers, dates)', () => {
  const { errors, req } = R.normalizeRequest({ lines: [{ text: 'Hi', version: 'v2', size: '9:16' }, { id: 'x', text: 'B', size: '1080x1350', kind: 'Voiceover' }], offer: { tier: 0.3, code: 'xmas30', ends: '2026-12-21T00:00:00Z' } });
  assert.deepEqual(errors, []);
  assert.equal(req.lines[0].id, 'l1');
  assert.equal(req.lines[0].version, 'V2');
  assert.equal(req.lines[0].size, '9x16');
  assert.equal(req.lines[1].size, '4x5');
  assert.equal(req.lines[1].kind, 'vo');
  assert.deepEqual(req.offer, { tier: 30, code: 'XMAS30', ends: '2026-12-21' });
  assert.match(R.normalizeRequest({}).errors[0], /lines/);
});

test('brief: reading speed — supers must fix (with a split), VO only a warning', () => {
  const words = Array.from({ length: 24 }, (_, i) => `w${i}`).join(' ');
  const [i] = R.readingSpeed(brief([{ id: 'l1', kind: 'super', text: words, start: 0, end: 3 }]).lines, { max_words_per_second: 3 });
  assert.equal(i.type, 'reading_speed');
  assert.equal(i.severity, 'must_fix');
  assert.equal(i.suggestion.split.length, 3);                       // 9 words per 3 s window
  assert.deepEqual(i.suggestion.split.map(p => [p.start, p.end]), [[0, 3], [3, 6], [6, 9]]);
  assert.equal(R.readingSpeed(brief([{ kind: 'super', text: 'Your neck ages first', start: 0, end: 2 }]).lines).length, 0);
  const vo = R.readingSpeed(brief([{ kind: 'vo', text: words, start: 0, end: 6 }]).lines, { vo_max_words_per_second: 3.5 });
  assert.equal(vo[0].type, 'vo_speed');
  assert.equal(vo[0].severity, 'should_fix');
});

test('brief: fit against the layout limits stored in the Brain', () => {
  assert.deepEqual(R.parseLimits('headline 9x16: 32\n4x5 40\nsubtitle, *, 60 chars'), [
    { kind: 'headline', size: '9x16', max: 32 }, { kind: 'headline', size: '4x5', max: 40 }, { kind: 'subtitle', size: '*', max: 60 }]);
  const req = brief([
    { id: 'h1', kind: 'headline', size: '9x16', text: 'Your neck ages faster than your face — fix it' },   // 45 chars
    { id: 'h2', kind: 'headline', size: '4x5', text: 'Your neck ages faster than your face' },            // 36 chars, fits 40
    { id: 'h3', kind: 'headline', text: 'Your neck ages faster than your face' },                     // every size → tightest (32)
  ], { layout_ref: '5 Bucks 5 Problems' });
  const r = R.fit(req.lines, req, facts);
  assert.deepEqual(r.issues.map(i => i.line_id), ['h1', 'h3']);
  assert.match(r.issues[0].found, /45 characters/);
  assert.match(R.fit(req.lines, { ...req, layout_ref: 'Receipt Vertical' }, facts).notes[0], /No layout limits/);
});

test('brief: offer facts — code, end date, tier, leftovers and price math', () => {
  const req = brief([
    { id: 'l1', kind: 'super', text: 'Christmas Sale — 25% OFF' },
    { id: 'l2', kind: 'code', text: 'USE CODE: BLACK30' },
    { id: 'l3', kind: 'super', text: 'Ends Dec 1' },
    { id: 'l4', kind: 'price', text: '$59 → $41.30' },
    { id: 'l5', kind: 'price', text: 'Now only $42' },
    { id: 'l6', kind: 'super', text: 'Free shipping on orders over $50' },
  ], { campaign: 'Christmas 2026', offer: { tier: 30, code: 'XMAS30', ends: '2026-12-21' } });
  const r = R.offerFacts(req.lines, req, facts, { today: '2026-11-11' });
  const by = Object.fromEntries(r.issues.map(i => [i.line_id, i]));
  assert.equal(by.l1.type, 'offer_tier');
  assert.equal(by.l1.fix, '30% OFF');
  assert.equal(by.l2.type, 'leftover_code');
  assert.equal(by.l2.fix, 'XMAS30');
  assert.equal(by.l3.type, 'leftover_date');                        // Dec 1 is Black Friday's end date
  assert.equal(by.l3.fix, 'Dec 21');
  assert.equal(by.l4, undefined);                                  // $59 list, $41.30 = 59 × 0.7
  assert.equal(by.l5.type, 'price');
  assert.equal(by.l5.fix, '$41.30');
  assert.equal(by.l6, undefined);                                  // a shipping threshold isn't a price
  // the brief's own offer vs the calendar
  const wrong = brief([{ text: 'x' }], { campaign: 'Christmas 2026', offer: { tier: 25, code: 'BLACK30', ends: '2026-12-01' } });
  assert.deepEqual(types(R.offerFacts(wrong.lines, wrong, facts, { today: '2026-11-11' }).issues), ['offer_code', 'offer_date', 'offer_tier']);
  const val = R.offerFacts(wrong.lines, { ...wrong, campaign: 'Valentines 2027' }, facts, { today: '2026-11-11' });
  assert.match(val.notes[0], /No offer-calendar entry/);
  assert.equal(val.issues.find(i => i.line_id === null).type, 'leftover_code');   // BLACK30 belongs to Black Friday
});

test('brief: dates in copy', () => {
  assert.deepEqual(R.datesIn('Sale ends December 21st', 2026).map(d => d.iso), ['2026-12-21']);
  assert.deepEqual(R.datesIn('Ends 12/21 · 21 December', 2026).map(d => d.iso), ['2026-12-21', '2026-12-21']);
  assert.deepEqual(R.datesIn('97% of users saw results in 4 weeks', 2026), []);
  assert.equal(R.fmtDateLike('2026-12-21', 'long'), 'December 21');
});

test('brief: translations, placeholders, cross-version and required elements', () => {
  const req = brief([
    { id: 'v1', version: 'V1', kind: 'headline', text: 'Before & After: 30-Day Money-Back Guarantee' },
    { id: 'v2', version: 'V2', kind: 'headline', text: 'Backed by a 60-day money-back guarantee' },
    { id: 'c', kind: 'code', version: 'V1', text: 'USE CODE: XMAS30 · Ends Dec 21' },
    { id: 'it', kind: 'translation', lang: 'it', text: 'Risparmia $18 oggi' },
    { id: 'p', kind: 'price', text: 'Only [PRICE]' },
  ], { offer: { code: 'XMAS30', ends: '2026-12-21' } });
  const all = R.ruleChecks(req, facts, { today: '2026-11-11' }).issues;
  const t = types(all);
  assert.ok(t.includes('translation_currency'));
  assert.ok(t.includes('placeholder'));
  assert.ok(t.includes('inconsistent_guarantee'));
  assert.ok(t.includes('missing_cta'));
  assert.ok(t.includes('missing_disclaimer'));
  const missing = all.filter(i => i.type === 'missing_code' || i.type === 'missing_end_date');
  assert.equal(missing.length, 2);
  assert.match(missing[0].found, /V2/);                             // V1 has the code, V2 doesn't
  // a clean brief passes the code checks
  const ok = brief([{ kind: 'headline', text: 'Your neck ages first' }, { kind: 'cta', text: 'Shop Now' }]);
  assert.deepEqual(R.ruleChecks(ok, facts, { today: '2026-11-11' }).issues, []);
  // magazine videos end on the article: a missing CTA is only a warning there
  const sfy = brief([{ kind: 'super', text: 'The skin on your neck thins first' }], { board: 'video' });
  assert.equal(R.requiredElements(sfy.lines, sfy, 'SFY')[0].severity, 'should_fix');
});

test('brief: Holiday Builder cross-brief checks', () => {
  const mk = (id, code, price) => ({ brief_id: id, req: brief([{ id: 'c', kind: 'code', text: `USE CODE: ${code}` }, { id: 'p', kind: 'price', text: `$59 → ${price}` }], { campaign: 'Christmas 2026', offer: { tier: 30 } }), issues: [] });
  const out = R.crossBrief([mk('a', 'XMAS30', '$41.30'), mk('b', 'XMAS30', '$41.30'), mk('c', 'XMAS25', '$42.00')], { offers: [] }, { campaign: 'Christmas 2026' });
  assert.deepEqual(out.map(x => [x.brief_id, x.issue.type, x.issue.fix]), [['c', 'campaign_code', 'XMAS30'], ['c', 'campaign_price', '$41.30']]);
});

test('brief: Brain facts are validated', () => {
  assert.deepEqual(R.factData('offer', { code: 'xmas 30', tiers: '25, 30', ends: '2026-12-21' }).data, { code: 'XMAS30', tiers: [25, 30], starts: null, ends: '2026-12-21', aliases: [] });
  assert.equal(R.factData('price', { list_price: '$59' }).content, 'List price $59.00');
  assert.throws(() => R.factData('layout_limit', {}, 'nothing'), /at least one limit/);
  assert.equal(R.factData('rule', null, 'Keep it').content, 'Keep it');
});

test('lanes: name tokens, domains, and lane-scoped Brain items', () => {
  const { laneOf } = require('../src/lib/captain/brand');
  const { matchesScope } = require('../src/lib/captain/brain');
  assert.equal(laneOf({ names: ['Face Cream | Science For You | Meta | Understand the Why'] }).name, 'SFY');
  assert.equal(laneOf({ names: ['Gravité | META | GT | Top 5'] }).name, 'GT');
  assert.equal(laneOf({ names: ['Gravité | Meta | Winter'], text: 'Page: https://wearecolognes.com/cold' }).name, 'WAC');
  assert.equal(laneOf({ names: ['Face Cream | Meta | Hero 30'] }).name, 'Particle');
  assert.equal(laneOf({ lane: 'sfy' }).name, 'SFY');
  assert.equal(matchesScope({ lane: 'Particle' }, { lane: 'SFY' }), false);
  assert.equal(matchesScope({ lane: 'SFY' }, { lane: 'SFY' }), true);
  assert.equal(matchesScope({ lane: 'SFY' }, { brand: 'Ashford' }), false);   // no lane known → lane items stay out
  assert.equal(matchesScope({ brand: 'Particle' }, { brand: 'Particle', lane: 'GT' }), true);
});

test('brief-match on delivery: video and design', () => {
  const { matchVideo, matchDesign } = require('../src/lib/captain/briefMatch');
  const approved = [
    { id: 'l1', kind: 'super', version: 'V1', text: 'Your neck ages first', start: 0, end: 2 },
    { id: 'l2', kind: 'super', version: 'V2', text: 'Nobody treats their neck', start: 0, end: 2 },
    { id: 'l3', kind: 'super', text: 'Firms, lifts and moisturizes', start: 4, end: 6 },
    { id: 'l4', kind: 'cta', text: 'Shop Now', start: 8, end: 10 },
  ];
  const v = matchVideo(approved, { onScreen: [{ start: 0.5, text: 'YOUR NECK AGES FIRST!' }, { start: 4, text: 'Firms, lifts and hydrates' }] }, { variant: 1, size: '9x16' });
  assert.deepEqual(v.map(i => i.type), ['brief_mismatch', 'brief_missing']);   // l3 reworded, l4 missing; l2 is V2's line
  assert.equal(v[0].fix, 'Firms, lifts and moisturizes');
  assert.equal(v[0].start, 4);
  const frames = [
    { id: 'f1', size: '1x1', texts: [{ id: 't1', text: 'Your neck' }, { id: 't2', text: 'ages first' }, { id: 't3', text: 'Firms, lifts and moisturizes' }, { id: 't4', text: 'Shop Now' }] },
    { id: 'f2', size: '9x16', texts: [{ id: 't5', text: 'Your neck ages first' }, { id: 't6', text: 'Shop Now' }] },
  ];
  const d = matchDesign(approved.filter(l => l.id !== 'l2'), frames);
  assert.deepEqual(d.map(i => [i.type, i.frame_node_id]), [['brief_missing', 'f2']]);   // l3 missing in the 9x16 frame
});

// ── Product: the new Product dropdown first, "Product (old)" (label9) as the fallback (12 Nov 2026) ──
test('readItem: the product comes from the Product dropdown, then Product (old)', async () => {
  const mondayLib = require('../src/lib/monday');
  const real = mondayLib.mondayQuery;
  let item;
  mondayLib.mondayQuery = async () => ({ items: [item] });
  delete require.cache[require.resolve('../src/lib/captain/monday')];
  const { readItem } = require('../src/lib/captain/monday');   // a fresh copy that holds the stub
  mondayLib.mondayQuery = real;
  const base = (cvs, board = '8036329818') => ({ id: '1', name: 'Gravité | Ulta Launch | Meta | Static 1', state: 'active', board: { id: board, name: 'b' }, group: { id: 'g', title: 'g' }, updates: [], column_values: cvs });

  // live case: the dropdown says Gravité, the old column still says Hair Gummies
  item = base([{ id: 'label9', type: 'status', text: 'Hair Gummies' }, { id: 'dropdown_mm8q7ysv', type: 'dropdown', text: 'Gravité' }]);
  assert.equal((await readItem('1')).product, 'Gravité');
  // a product only the new dropdown has (Video board)
  item = base([{ id: 'label9', type: 'status', text: '-' }, { id: 'dropdown_mm8qh5b', type: 'dropdown', text: 'Bone & Joint' }], '5433027071');
  assert.equal((await readItem('1')).product, 'Bone & Joint');
  // an older task tagged only in Product (old)
  item = base([{ id: 'label9', type: 'status', text: 'Face Cream' }, { id: 'dropdown_mm8q7ysv', type: 'dropdown', text: '' }]);
  assert.equal((await readItem('1')).product, 'Face Cream');
  // neither set → null, as before
  item = base([{ id: 'label9', type: 'status', text: '' }, { id: 'dropdown_mm8q7ysv', type: 'dropdown', text: null }]);
  assert.equal((await readItem('1')).product, null);
});
