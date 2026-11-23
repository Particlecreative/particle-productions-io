// A correction shows only the words that change (Tomer, 23 Nov 2026).   cd backend && node --test test/captainChanged.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { changedPart } = require('../src/lib/captain/changed');
const video = require('../src/lib/captain/video');
const design = require('../src/lib/captain/design');

const pair = (a, b) => { const c = changedPart(a, b); return [c.found, c.fix]; };

test('only the changed words of a long line', () => {
  assert.deepEqual(pair("Yes, he's mine Keep walking", "Yes, he's mine, keep walking"), ['mine Keep', 'mine, keep']);
  assert.deepEqual(pair("37% less joint stiffness in 12 weeks,¹ from a mineral found in Iceland's Arctic waters.", "37% less joint stiffness in 12 weeks,¹ from a mineral found in Iceland's Arctic waters"), ['waters.', 'waters']);
  assert.deepEqual(pair('WHERE HAVE I SMELT—', 'WHERE HAVE I SMELT—?'), ['SMELT—', 'SMELT—?']);
  assert.deepEqual(pair("Clear athlete's foot in 1 week.*", "Clear athlete's foot in just a few weeks.*"), ['1 week.*', 'just a few weeks.*']);
});

test('a dropped or added word keeps its neighbour; a repeated word grows until it points at one place', () => {
  assert.deepEqual(pair('I love love him so much', 'I love him so much'), ['love love', 'love']);
  assert.deepEqual(pair('Get it now at the store today', 'Get it now at the online store today'), ['the', 'the online']);
  assert.deepEqual(pair('the cream that fits the man', 'the cream that fits a man'), ['fits the', 'fits a']);
});

test('short lines, rewrites and same-but-for-quotes stay whole', () => {
  assert.equal(changedPart('CUSTUMER', 'CUSTOMER').shortened, false);
  assert.equal(changedPart('Before/After labels in a different weight than in frame 2', 'Keep the label style consistent').shortened, false);
  assert.equal(changedPart('It’s the best cream for men', "It's the best cream for men").shortened, false);
  assert.deepEqual(pair('It’s the best cream for men', "It's the best creme for men"), ['cream', 'creme']);
});

test('comments use the short form; comparisons and the "full" form keep whole lines', () => {
  const i = { type: 'punctuation', found: "Yes, he's mine Keep walking", fix: "Yes, he's mine, keep walking", severity: 'must_fix' };
  assert.equal(video.commentText(i), '🧑‍✈️ Captain Caption: "mine Keep" → "mine, keep"');
  assert.equal(video.commentText(i, { full: true }), `🧑‍✈️ Captain Caption: "Yes, he's mine Keep walking" → "Yes, he's mine, keep walking"`);
  assert.match(video.commentText({ ...i, type: 'size_mismatch', severity: 'check' }), /copy differs from the master: "Yes, he's mine Keep walking"/);
  assert.equal(design.commentText({ type: 'spelling', found: 'Free shipping on every single ordre today', fix: 'Free shipping on every single order today', severity: 'must_fix' }), '🧑‍✈️ Captain Caption: "ordre" → "order"');
  assert.match(design.commentText({ type: 'brief_mismatch', found: 'Save 10% on your first order', fix: 'Save 15% on your first order', severity: 'check' }), /Here: "Save 10% on your first order"/);
});
