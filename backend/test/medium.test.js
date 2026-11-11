// MEDIUM — pure-logic tests:  cd backend && node --test test/medium.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/lib/medium/classify');
const { styleCheck, composeBrief } = require('../src/lib/medium/style');
const calendar = require('../src/lib/medium/calendar');

test('corpus: the kind of job comes from the opening line', () => {
  assert.equal(C.kindOf({ brief: 'Please look at attached reference (IEFC derma sticker static), copy style, apply to Particle design.' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Copy the layout exactly, swap the product to Hand Cream, refresh the background tone for fall.' }), 'template_swap');
  assert.equal(C.kindOf({ name: 'Ab Firming Cream | Black Friday 2026 | Meta | Extra 30 GIF', brief: 'Turn the approved Extra 30 static into a GIF design' }), 'static_gif');
  assert.equal(C.kindOf({ brief: 'FOOTAGE: https://dropbox.com/x\nEDIT: Go through the raw footage…' }), 'creator_edit');
  assert.equal(C.kindOf({ name: 'IEFC | Meta | Hooks for Ticker Hook', brief: 'We need 3–4 additional hooks we will add to the existing videos here' }), 'new_hooks');
  assert.equal(C.kindOf({ name: 'Face Cream | Meta | Italian translation', brief: 'Translate the approved static' }), 'translation');
  assert.equal(C.kindOf({ brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled.' }), 'original');
  // the team's real variants
  assert.equal(C.kindOf({ brief: 'REFERENCE — REPLICATE: app.upspring.ai/public/intelligence/ad/4036 (DADFUEL). Copy the reference exactly: shot types…' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Copy the attached reference beat for beat (Smileactives, https://app.upspring.ai/…): unboxing top-down…' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Same concept as reference just for neck cream' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Black Friday extra static for Shampoo, 30% offer, built on the phone-notification layout (reference: https://…)' }), 'reference_adaptation');
  assert.equal(C.kindOf({ brief: 'Same layout and fall background as the set. Product: Gravité.' }), 'template_swap');
  assert.equal(C.kindOf({ brief: 'Take the existing July 4th lineup design (attached reference) and rework for Labor Day: swap headline block and code pill.' }), 'template_swap');
  assert.equal(C.kindOf({ brief: 'Please turn assets into motion 7-10 seconds, no CTA needed' }), 'static_gif');
});

test('corpus: donor brands as written, not the ingredient', () => {
  const { donorPattern } = require('../src/lib/medium/corpus');
  assert.equal(donorPattern('Seed').test('Strikethrough price like the Seed ad'), true);
  assert.equal(donorPattern('Seed').test('Hyaluronic Acid, Coffee Seed Extract, caffeine'), false);
  assert.equal(donorPattern('Seed').test('seedless'), false);
  assert.equal(donorPattern('Mars Men').test('Mars Men multi-product layout'), true);
});

test('corpus: test brands are excluded — the campaign token beats a Particle product label', () => {
  assert.equal(C.testBrandOf({ name: 'Face Cream | Levitas 1.0 | Meta | Face Map', product: 'Face Cream' }), 'Levitas');
  assert.equal(C.testBrandOf({ name: 'Test Product | Ashford | Meta | Would You Date Him' }), 'Ashford');
  assert.equal(C.testBrandOf({ name: 'Joint support static', product: 'Bone & Joint' }), 'Ashford');
  assert.equal(C.testBrandOf({ name: 'Test Product | NeoRoot Launch | Meta | Comparison Series', product: 'Test Product' }), null);   // "Test Product" is not a brand signal
  assert.equal(C.testBrandOf({ name: 'x', brandColumn: 'Biomella' }), 'Biomella');
  assert.equal(C.testBrandOf({ name: 'x', brandColumn: 'Particle' }), null);
});

test('corpus: thin briefs, templates, personas, tool tokens, lanes', () => {
  assert.equal(C.isThin({ brief: 'tbd' }), true);
  assert.equal(C.isThin({ brief: 'see reference' }), true);
  assert.equal(C.isThin({ brief: 'https://dropbox.com/very/long/link/to/a/file/that/is/not/a/brief.png' }), true);
  assert.equal(C.isThin({ brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled. He is heading to a family event.' }), false);
  assert.equal(C.templateOf('Face Cream | Fall Flash Sale | Meta | Fall Flash Sale Static, Receipt Vertical, Face Cream'), 'Receipt Vertical');
  assert.equal(C.personaOf('Test Product | NeoRoot Launch | Meta | Comparison Series | 4 Executions - Younger'), 'Younger');
  assert.deepEqual(C.toolTokensOf('Gravité | Meta | Claude | Gravité Meta His Side'), ['Claude']);
  const c = C.classifyTicket({ name: 'Face Cream | Science For You | Meta | Understand the Why', brief: 'Ad leads to: https://scienceforyou.co/x\nA 55–65 man at the mirror, real not styled, native iPhone look. Fast 2s beats, five warning signs.' });
  assert.equal(c.lane, 'SFY');
  assert.equal(c.excluded, false);
});

const videoBrief = {
  format: 'video', kind: 'original', move: 'NEW_ANGLE', lane: 'Particle',
  fields: {
    brief: 'A 55–60 man at his bathroom mirror, getting ready. Real, not styled. Kizik structure carries it. Vertical 9:16, 30s. Reference attached.',
    script: '0–4s — THE HOOK\nSCRIPT: "Honestly — this is the fastest fix I could find."\nVISUALS: He holds the tube up.\n4–10s — THE CONTEXT\nSCRIPT: "…"\nVISUALS: …\nVO style: Conversational male, first person, native UGC.',
    why: 'Iterates the IEFC ticker winner [AfterLife]; the hook is the weak link.', test: 'Hook only — 3 versions, same body. Win = hook rate above 30% at $1k spend.',
    donts: ['no music'], hook: '"Honestly — this is the fastest fix I could find."',
  },
};

test('style: a house-style video brief passes', () => {
  assert.deepEqual(styleCheck(videoBrief), { passed: true, failures: [] });
});

test('style: each house rule fails on its own', () => {
  const f = (patch, opts) => styleCheck({ ...videoBrief, ...patch, fields: { ...videoBrief.fields, ...(patch.fields || {}) } }, opts).failures.join(' | ');
  assert.match(f({ fields: { brief: 'This ad shows a man using the cream. 9:16.' } }), /Opening/);
  assert.match(f({ fields: { script: 'He talks to camera and then shows the tube.' } }), /time-coded/);
  assert.match(f({ fields: { script: '0–4s — THE HOOK\nSCRIPT: "Hi"\nVISUALS: x\n4–8s\nSCRIPT: "Yo"\nVISUALS: y' } }), /VO style/);
  assert.match(f({ fields: { donts: [] } }), /Don’ts/);
  assert.match(f({ fields: { brief: `${videoBrief.fields.brief} I want this to feel luxurious.` } }), /first-person/);
  assert.match(f({ fields: { why: '' } }), /Why/);
  assert.match(f({ fields: { brief: `${videoBrief.fields.brief} Sizes 4x5 and 9x16.` } }), /house notation/);
  assert.match(f({ lane: 'SFY' }, { laneFirst: 'Ad leads to:' }), /first line must be “Ad leads to:/);
  const sfy = styleCheck({ ...videoBrief, lane: 'SFY', fields: { ...videoBrief.fields, brief: `Ad leads to: https://scienceforyou.co/neck\n${videoBrief.fields.brief}` } }, { laneFirst: 'Ad leads to:' });
  assert.equal(sfy.passed, true);
});

test('style: design copy must be labelled per element, in versions', () => {
  const d = {
    format: 'design', kind: 'reference_adaptation', move: 'REFRESH', lane: 'Particle',
    fields: { brief: 'Please look at attached reference (the "Respect Your Face" split-face static), copy style, apply to Particle design.\nSizes 4×5 · 1×1 · 9×16.', why: 'x', test: 'y', donts: ['no badges'],
      copy: 'On all versions: USE CODE XMAS30\n\nV1\nHeadline: Your neck ages first.\nCTA button: Shop Now\n\nV2\nHeadline: Nobody treats their neck.' },
  };
  assert.equal(styleCheck(d).passed, true);
  assert.match(styleCheck({ ...d, fields: { ...d.fields, copy: 'Your neck ages first. Shop now.' } }).failures.join(' | '), /versions.*\|.*Label/);
  assert.equal(composeBrief({ ...d.fields }).split('\n\n')[1], 'Why: x');
  assert.match(composeBrief(d.fields), /Don't:?s?:\n- no badges\n\nTest: y$/);
});

test('calendar: US sale holidays and brief-by dates', () => {
  const h = Object.fromEntries(calendar.holidaysOf(2026).map(x => [x.name, x.date.toISOString().slice(0, 10)]));
  assert.equal(h['Memorial Day'], '2026-05-25');
  assert.equal(h['Labor Day'], '2026-09-07');
  assert.equal(h["Father's Day"], '2026-06-21');
  assert.equal(h['Black Friday'], '2026-11-27');
  const up = calendar.upcoming(new Date('2026-11-11T09:00:00Z'), 3);
  assert.deepEqual(up.map(x => x.name), ['Black Friday 2026', 'Christmas 2026', "Valentine's Day 2027"]);
  assert.equal(up[1].brief_by, '2026-12-04');
  assert.equal(up[1].days_to_brief_by, 23);
});

test('writer: kinds per move, lane first lines, output cleaning', () => {
  const W = require('../src/lib/medium/writer');
  assert.equal(W.kindFor('ITERATE', 'video'), 'new_hooks');
  assert.equal(W.kindFor('TRANSFER_PRODUCT', 'design'), 'template_swap');
  assert.equal(W.kindFor('NEW_ANGLE', 'design', 'original'), 'original');
  assert.equal(W.laneFirstFor('WAC', 'design'), 'Page:');
  assert.equal(W.laneFirstFor('Particle', 'video'), null);
  const o = W.normalizeOut({ ticket_name: ' X ', kind: 'original', why: 'Why: because', test: 'Test: hook', hook: '', vo_style: '', brief: 'b', script: 's', copy: 'c', donts: ['a', ''], sizes: ['9x16'], duration: 30, video_type: 'UGC', template: '', persona: '', donor: '', evidence: [],
    lines: [{ id: 'l1', kind: 'Super', text: 'Hi', version: '', size: '9x16', start: -1, end: -1, lang: '' }, { id: 'l2', kind: 'vo', text: ' ', version: '', size: '', start: 0, end: 2, lang: 'en' }] }, 'video');
  assert.equal(o.fields.why, 'because');
  assert.equal(o.fields.copy, '');
  assert.deepEqual(o.fields.donts, ['a']);
  assert.deepEqual(o.lines, [{ id: 'l1', kind: 'super', text: 'Hi', version: null, size: '9x16', start: null, end: null, lang: 'en' }]);
});

test('writer: database parameters — Postgres arrays stay arrays, JSONB becomes JSON text', () => {
  const { toParam } = require('../src/lib/medium/writer');
  assert.deepEqual(toParam('exemplar_ids', [353, 364, 17]), [353, 364, 17]);   // INT[] — the bug that lost the first two test briefs
  assert.deepEqual(toParam('exemplar_ids', null), []);
  assert.equal(toParam('lines', [{ id: 'l1' }]), '[{"id":"l1"}]');
  assert.equal(toParam('fields', { why: 'x' }), '{"why":"x"}');
  assert.equal(toParam('status', 'PENDING_REVIEW'), 'PENDING_REVIEW');
});

test('score gate: only "block" violations block; warnings never do', () => {
  const { gate } = require('../src/lib/medium/writer');
  assert.equal(gate({ passed: false, violations: [{ text: 'Claim not in a claims sheet yet', severity: 'warn' }] }).passed, true);
  const g = gate({ passed: true, violations: [{ text: 'Reveals the #1 product', severity: 'block' }, { text: 'Article URL missing', severity: 'warn' }] });
  assert.equal(g.passed, false);
  assert.deepEqual(g.blocks, ['Reveals the #1 product']);
  assert.deepEqual(g.warnings, ['Article URL missing']);
  assert.equal(gate({ violations: ['old-style string'] }).passed, false);
  assert.equal(gate({}).passed, true);
});

test('Captain brief check: AI findings that change nothing are dropped; an empty fix means remove', () => {
  const { cleanAiIssues } = require('../src/lib/captain/brief');
  const ids = new Set(['l1']);
  const out = cleanAiIssues([
    { line_id: 'l1', found: '"My wife said I look younger." It\'s', fix: 'My wife said I look younger. It\'s', type: 'rule', severity: 'must_fix', rule: 'x' },
    { line_id: 'l1', found: 'Free Shipping', fix: 'null', type: 'rule', severity: 'should_fix', rule: 'y' },
    { line_id: 'zz', found: 'recieve', fix: 'receive', type: 'spelling', severity: 'must_fix', rule: 'Spelling' },
  ], ids);
  assert.equal(out.length, 2);
  assert.equal(out[0].fix, 'Remove it');
  assert.equal(out[1].line_id, null);
});

test('corpus: a Monday item becomes an exemplar row', () => {
  const { toRow } = require('../src/lib/medium/corpus');
  const { DEFAULTS } = require('../src/lib/medium/config');
  const row = toRow('design', { id: 1, name: 'Neck Cream | Meta | Respect Your Face V2', created_at: '2026-05-01T10:00:00Z', column_values: [
    { id: 'people_Mjj2RrZM', text: 'Lilian Krumholz' }, { id: 'label9', text: 'Neck Cream' }, { id: 'long_textpvqldjpg', text: 'Please look at attached reference (the "Respect Your Face" split-face static), copy style, apply to Particle design.' },
    { id: 'long_text_mkngjytf', text: 'V1\nHeadline: Respect your neck.' }], updates: [] }, DEFAULTS);
  assert.equal(row.kind, 'reference_adaptation');
  assert.equal(row.template, 'Respect Your Face');
  assert.equal(row.requester, 'Lilian Krumholz');
  assert.equal(row.excluded, false);
});
