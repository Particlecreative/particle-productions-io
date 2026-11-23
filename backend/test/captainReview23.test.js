// Captain, reviewed as the editor / designer (23 Nov 2026).   cd backend && node --test test/captainReview23.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { tidy, onApprovedCopy, norm } = require('../src/lib/captain/briefed');
const EP = require('../src/lib/captain/endPunct');
const { matchVideo } = require('../src/lib/captain/briefMatch');
const { shortNote } = require('../src/lib/captain/changed');

test('copy approved on the ticket: no "please check" on it — real mistakes in it still reported', () => {
  const item = { brief: { supporting_text: 'Headline: Clear athlete\'s foot in 1 week.*\nByline: Reviewed by a podiatrist (to confirm)\nHeadline 2: Last chance for 15% off [date]\nGet his gift before Christmas. Choose expedited shipping.' } };
  const out = tidy([
    { type: 'wrong_word', severity: 'check', found: "Clear athlete's foot in 1 week.*", fix: "Clear athlete's foot in just a few weeks.*", note: "House rule: don't promise results in 1 week." },
    { type: 'inconsistent', severity: 'check', found: 'Get his gift before Christmas. Choose expedited shipping.', fix: 'Choose expedited shipping.', note: 'The subline repeats the headline.' },
    { type: 'placeholder', severity: 'check', found: 'Reviewed by a podiatrist (to confirm)', fix: 'Reviewed by a podiatrist', note: "'(to confirm)' is an internal note." },
    { type: 'placeholder', severity: 'must_fix', found: '[date]', fix: 'the end date', note: 'Placeholder date left in.' },
    { type: 'script_mismatch', severity: 'check', found: '15% off first order', fix: '15% off', note: "The brief's arrow says '15% OFF' — the design adds 'first order' (offer)." },
  ], item);
  assert.deepEqual(out.map(i => i.type), ['placeholder', 'placeholder', 'script_mismatch']);
  assert.match(out[0].note, /\(the brief has it too\)$/);
  assert.equal(onApprovedCopy({ type: 'spelling', severity: 'must_fix', found: 'Clear in 1 week' }, norm('Clear in 1 week')), false);   // a must-fix isn't a "please check"
});

test('no "subtitles missing" for the end card', () => {
  const out = tidy([
    { type: 'caption_vs_voiceover', severity: 'check', found: '', fix: 'VISIT PARTICLEFORMEN.COM AND CLAIM YOURS TODAY.' },
    { type: 'caption_vs_voiceover', severity: 'check', found: '', fix: 'We offer free shipping and a 30-day money-back guarantee.' },
    { type: 'caption_vs_voiceover', severity: 'check', found: '', fix: 'It took me ten years to notice.' },
  ], null);
  assert.equal(out.length, 1);
});

test('"needs a ?" only on a question that ends there — not a caption broken mid-sentence or cut off with a dash', () => {
  const v = (lines) => EP.forVideo({ onScreen: lines.map((text, n) => ({ start: n * 2, end: n * 2 + 2, text })) }).issues.filter(i => /question/.test(i.note || ''));
  assert.equal(v(['WHICH IS WHY IT', 'WORKS']).length, 0);
  assert.equal(v(['WHICH IS THE', 'BEST PART']).length, 0);
  assert.equal(v(['DID YOU BATHE IN', 'IT?']).length, 0);
  assert.equal(v(['WHERE HAVE I SMELT—']).length, 0);
  assert.equal(v(['WHICH IS WHY IT WORKS']).length, 0);
  assert.equal(v(['IS YOUR SKIN DRY']).length, 1);              // a real question still needs its "?"
  assert.equal(v(['WHY DOES IT WORK']).length, 1);
});

test('design: only the SAME line is compared for period / no period; abbreviations aren\'t sentence ends', () => {
  const f = (texts) => texts.map((t, n) => ({ id: `t${n}`, name: t[1] || 'Subhead', text: t[0] }));
  const frames = [{ id: 'f1', size: '1x1', texts: f([['“Best cream I ever used.”'], ['Verified buyer'], ['Batch No: 240615 | Mfg. Date: 06/2026']]) },
                  { id: 'f2', size: '9x16', texts: f([['“Best cream I ever used.”'], ['Verified buyer'], ['Batch No: 240615 | Mfg. Date: 06/2026']]) }];
  assert.equal(EP.forDesign({ frames }).issues.length, 0);       // was "Verified buyer." and "…06/2026."
  const mixed = [{ id: 'f1', size: '1x1', texts: f([['She Noticed Before I Did.', 'Headline']]) }, { id: 'f2', size: '9x16', texts: f([['She Noticed Before I Did', 'Headline']]) }];
  const out = EP.forDesign({ frames: mixed }).issues;
  assert.equal(out.length, 1);
  assert.match(out[0].note, /The same headline ends with “\.” in frame 1 \(1x1\) and with no mark in frame 2 \(9x16\) — use one/);
  assert.deepEqual(EP.units('Batch No: 240615 | Mfg. Date: 06/2026'), ['Batch No: 240615 | Mfg. Date: 06/2026']);
});

test('video: the money-back guarantee line is never asked for (Brain #265)', () => {
  const lines = [{ kind: 'on_screen', text: 'Try it risk-free with a 30-day money-back guarantee', size: '9x16' }, { kind: 'on_screen', text: '*Results may vary', size: '9x16' }];
  const out = matchVideo(lines, { onScreen: [{ start: 1, end: 2, text: 'GRAVITÉ' }], voiceover: [] }, { size: '9x16' });
  assert.ok(!out.some(i => /guarantee/i.test(i.fix || '')));
  assert.ok(out.some(i => /Results may vary/.test(i.fix || '')));  // a disclaimer still is
});

test('notes on the frame: one sentence, "(the brief has it too)" and "(also in …)" kept', () => {
  assert.equal(shortNote("The shampoo label is cut off and reads 'PARABEN FRI'. Frames 5, 10 and 11 have the same problem."), "The shampoo label is cut off and reads 'PARABEN FRI'");
  assert.equal(shortNote("'(to confirm)' is an internal note. Remove it (the brief has it too) (also in 2 more frames)"), "'(to confirm)' is an internal note (the brief has it too) (also in 2 more frames)");
});
