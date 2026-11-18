// Captain QA rule — end punctuation in ad copy (the spec's worked examples and false positives, 17 Nov 2026)
const test = require('node:test');
const assert = require('node:assert/strict');
const EP = require('../src/lib/captain/endPunct');

const L = (id, text, extra = {}) => ({ id, frame_id: extra.frame || 'f1', frame_label: extra.label || `frame ${extra.frame || 1}`, name: extra.name || '', text, box: extra.box || { height: 20 } });
const run = (layers, opts = {}) => EP.check(layers, opts);
const one = (layers, opts) => { const r = run(layers, opts); assert.equal(r.length, 1, JSON.stringify(r.map(x => x.note))); return r[0]; };

test('worked example: "That\'s not dry skin." — brief has the period, same in every frame → pass silently', () => {
  const frames = ['1', '2', '7', '8'].map(n => L(`h${n}`, "That's not dry skin.", { name: 'Headline', frame: n }));
  assert.deepEqual(run(frames, { brief: "Headline: That's not dry skin." }), []);
});

test('worked examples: multi-sentence headline closed → pass; last sentence left open → please check', () => {
  assert.deepEqual(run([L('h', "Lotion not working on your heels? Here's why.", { name: 'Headline' })]), []);
  const f = one([L('h', "Lotion not working on your heels? Here's why", { name: 'Headline' })]);
  assert.equal(f.severity, 'check');
  assert.equal(f.fix, "Lotion not working on your heels? Here's why.");
  // the "?" variant is a different structure — never compared with the "." variant
  assert.deepEqual(run([L('a', "Lotion not working on your heels? Here's why.", { name: 'Headline', frame: 1 }), L('b', 'Lotion not working on your heels?', { name: 'Headline', frame: 2 })]), []);
});

test('worked examples: claim with a period → please check; CTA / URL with a period → must fix; Google "!" → must fix', () => {
  let f = one([L('c', 'Relief in just 2 days.', { name: 'Badge' })]);
  assert.equal(f.severity, 'check'); assert.equal(f.fix, 'Relief in just 2 days');
  f = one([L('b', 'Shop now.', { name: 'CTA button' })]);
  assert.equal(f.severity, 'must_fix'); assert.equal(f.fix, 'Shop now');
  f = one([L('u', 'clearstep.com.')]);
  assert.equal(f.severity, 'must_fix'); assert.equal(f.fix, 'clearstep.com'); assert.match(f.note, /URL/);
  f = one([L('g', 'Cracked heels? Fix them fast!', { name: 'Search headline 1' })]);
  assert.equal(f.severity, 'must_fix'); assert.equal(f.fix, 'Cracked heels? Fix them fast');
});

test('a question without "?" (any layer) → must fix; "??" / "?!" → must fix; "How to…" / "Why it works" are not questions', () => {
  let f = one([L('h', 'Is your neck giving away your age.', { name: 'Headline' })]);
  assert.equal(f.severity, 'must_fix'); assert.equal(f.fix, 'Is your neck giving away your age?');
  f = one([L('h', 'Are you ready??', { name: 'Headline' })]);
  assert.equal(f.fix, 'Are you ready?');
  assert.deepEqual(run([L('h', 'How to fix cracked heels', { name: 'Headline' }), L('s', 'Why it works', { name: 'Subhead' })]), []);
});

test('mixed within one group → ONE please-check naming the frames, aligned to the brief (or the majority)', () => {
  const layers = [
    L('a', 'Made for men.', { name: 'Headline', frame: 1, label: 'frame 1 (1x1)' }),
    L('b', 'Made for men', { name: 'Headline', frame: 2, label: 'frame 2 (4x5)' }),
    L('c', 'Made for men', { name: 'Headline', frame: 3, label: 'frame 3 (9x16)' }),
  ];
  let f = one(layers);
  assert.equal(f.severity, 'check'); assert.equal(f.rule, 'mixed');
  assert.equal(f.layer.id, 'a'); assert.equal(f.fix, 'Made for men');   // majority: no period
  assert.match(f.note, /frame 1 \(1x1\)/); assert.match(f.note, /frame 2 \(4x5\), frame 3 \(9x16\)/);
  f = one(layers, { brief: 'Headline: Made for men.' });             // the brief has the period → align to it
  assert.equal(f.fix, 'Made for men.'); assert.equal(f.layer.id, 'b'); assert.match(f.note, /Align to the brief/);
});

test('a line that only ends differently from the brief → no note (18 Nov 2026: the brief is read for intent, not 1:1)', () => {
  assert.deepEqual(run([L('h', 'Clinically proven results.', { name: 'Headline' })], { brief: 'Headline - Clinically proven results' }), []);
  assert.deepEqual(run([L('h', 'PROVE IT', { name: 'Headline' })], { brief: 'PROVE IT.' }), []);
  assert.deepEqual(run([L('h', 'Clinically proven results.', { name: 'Headline' })], { brief: 'Clinically proven results.' }), []);
  assert.deepEqual(run([L('h', 'Clinically proven results.', { name: 'Headline' })]), [], 'no brief → a period is a style choice');
});

test('house style: every multi-sentence headline leaves the last sentence open → pass', () => {
  assert.deepEqual(run([L('a', "Dry heels? Here's why", { name: 'Headline', frame: 1 }), L('b', "Still itchy? Try this", { name: 'Headline', frame: 2 })]), []);
});

test('the same problem in several frames is one finding, not one per frame', () => {
  const r = run(['1', '2', '3'].map(n => L(`b${n}`, 'Shop now.', { name: 'CTA', frame: n })));
  assert.equal(r.length, 1); assert.match(r[0].note, /frame 1, frame 2, frame 3/);
});

test('classification by name, text and size', () => {
  const c = EP.classify([
    L('1', 'Your skin, upgraded', { box: { height: 80 } }), L('2', 'A daily cream for men who want more', { box: { height: 20 } }),
    L('3', 'Shop now'), L('4', 'particleformen.com'), L('5', 'Save 25%', { box: { height: 18 } }), L('6', 'anything', { name: 'Sub headline' }),
  ]);
  assert.deepEqual(c.map(x => x.type), ['headline', 'subhead', 'cta', 'url', 'claim', 'subhead']);
});

test('video: captions told from supers by the voiceover; "." dropped but "," kept → please check', () => {
  const r = EP.forVideo({
    onScreen: [{ start: 1, end: 2, text: 'I tried everything,' }, { start: 2, end: 3, text: 'nothing worked' }, { start: 9, end: 11, text: 'Shop now.' }],
    voiceover: [{ text: 'I tried everything, nothing worked.' }],
  });
  const sev = r.issues.map(i => [i.severity, i.found]);
  assert.deepEqual(sev.sort(), [['check', 'I tried everything,'], ['must_fix', 'Shop now.']].sort());
  assert.equal(r.issues.find(i => i.found === 'Shop now.').start, 9);
  assert.equal(r.covers('Shop now'), true);
});

test('AI notes that only add or remove the closing mark are recognised (code owns those)', () => {
  assert.equal(EP.endOnly({ found: 'Shop now.', fix: 'Shop now' }), true);
  assert.equal(EP.endOnly({ found: 'Made for men', fix: 'Made for men.' }), true);
  assert.equal(EP.endOnly({ found: 'recieve', fix: 'receive' }), false);
  assert.equal(EP.endOnly({ found: "Not working Here's why", fix: "Not working? Here's why" }), false, 'an unclosed internal sentence stays the AI’s');
});

test('design adapter: Captain issues pinned on the layer, frames named', () => {
  const out = EP.forDesign({ frames: [
    { id: 'F1', size: '1x1', texts: [{ id: 'T1', name: 'CTA', text: 'Get yours.', box: { height: 20 } }] },
    { id: 'F2', size: '9x16', texts: [{ id: 'T2', name: 'CTA', text: 'Get yours.', box: { height: 20 } }] },
  ] });
  assert.equal(out.issues.length, 1);
  assert.deepEqual([out.issues[0].node_id, out.issues[0].frame_id, out.issues[0].severity, out.issues[0].fix], ['T1', 'F1', 'must_fix', 'Get yours']);
  assert.match(out.issues[0].note, /frame 1 \(1x1\), frame 2 \(9x16\)/);
});

test('a caption that runs on with a comma is never told to end with a period (no "40,.")', () => {
  const caps = ['Most guys think skincare is extra.', 'If you\'re a guy over 40,', 'your skin needs more.', 'One cream does it all.'].map((t, n) => ({ id: `c${n}`, frame_id: 'video', frame_label: `0:0${n}`, name: 'Caption', text: t }));
  const out = run(caps, { kind: 'video' });
  assert.ok(!out.some(f => /,\.$/.test(f.fix)), JSON.stringify(out));
  assert.ok(!out.some(f => f.found === "If you're a guy over 40,"));
});

test('video: a caption broken mid-sentence (the next one starts lowercase) gets no period note', () => {
  const onScreen = ['there\'s your actual age', 'and there\'s the age people think you are.', 'Wrinkles and sagging skin', 'can easily add five years.', 'The math can hit double digits.', 'You don\'t have to accept this.']
    .map((text, n) => ({ start: n * 3, end: n * 3 + 2, text }));
  assert.deepEqual(EP.forVideo({ onScreen }).issues, []);
});

test('video: an end card read as one block, and a split caption before a stacked super, get no period note', () => {
  const onScreen = ["there's your actual age", '55\n50 YEARS OLD\nand there\'s the age\npeople think you are.', 'The math can hit double digits.', 'You don\'t have to accept this.',
    'PARTICLE\nTRY IT NOW\nAt\nParticleForMen.com\n30 DAY MONEY BACK GUARANTEE'].map((text, n) => ({ start: n * 3, end: n * 3 + 2, text }));
  assert.deepEqual(EP.forVideo({ onScreen }).issues, []);
});
