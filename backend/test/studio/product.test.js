// Product on the studio boards — the new Product dropdown first, "Product (old)" (label9) as the fallback (12 Nov 2026)
//   cd backend && node --test test/studio/product.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/lib/studio/product');

const VIDEO = { product: 'label9', product_dropdown: 'dropdown_mm8qh5b' };
// column values as Monday returns them (ITEM_FIELDS shape: StatusValue label/index, DropdownValue values)
const dd = (label) => ({ id: 'dropdown_mm8qh5b', type: 'dropdown', text: label || null, values: label ? [{ id: '5', label }] : [] });
const old = (label, index = 1) => ({ id: 'label9', type: 'status', text: label, label, index: label === '-' ? null : index });

test('product: the dropdown wins over Product (old) — the two can disagree', () => {
  // live case: design items tagged Gravité in the new column, Hair Gummies in the old one
  assert.equal(P.productOf({ dropdown_mm8qh5b: dd('Gravité'), label9: old('Hair Gummies') }, VIDEO), 'Gravité');
});

test('product: an empty or "-" dropdown falls back to Product (old)', () => {
  assert.equal(P.productOf({ dropdown_mm8qh5b: dd(null), label9: old('Face Cream') }, VIDEO), 'Face Cream');
  assert.equal(P.productOf({ dropdown_mm8qh5b: dd('-'), label9: old('Hand Cream') }, VIDEO), 'Hand Cream');
  assert.equal(P.productOf({ label9: old('Neck Cream') }, VIDEO), 'Neck Cream');               // dropdown not fetched
  assert.equal(P.productOf({ dropdown_mm8qh5b: dd('NeoRoot'), label9: old('-') }, VIDEO), 'NeoRoot');
});

test('product: "-" only when nothing better; "" when neither is set', () => {
  assert.equal(P.productOf({ dropdown_mm8qh5b: dd(null), label9: old('-') }, VIDEO), '-');
  assert.equal(P.productOf({}, VIDEO), '');
  assert.equal(P.productOf({ label9: old('Face Cream') }, { product: 'label9' }), 'Face Cream');  // a config without the dropdown
  assert.equal(P.productOf(null, null), '');
});

test('product: dropdown values come back as text when the query asks only for text', () => {
  // Captain's readItem and Medium's corpus fetch { id type text value } — no `values`
  assert.equal(P.productOf({ dropdown_mm8qh5b: { id: 'dropdown_mm8qh5b', type: 'dropdown', text: 'Bone & Joint' }, label9: { text: '' } }, VIDEO), 'Bone & Joint');
  assert.equal(P.labelText({ text: '  Face Cream ' }), 'Face Cream');
  assert.equal(P.labelText({ values: [] , text: null }), '');
});

test('product write: each column only gets a label it already has', () => {
  const lists = { label9: ['Face Cream', 'Neck Cream'], dropdown_mm8qh5b: ['Face Cream', 'Neck Cream', 'Bone & Joint'] };
  const has = (col, v) => (lists[col] ? lists[col].includes(v) : null);
  assert.deepEqual(P.productValues('Face Cream', VIDEO, has).values, { label9: { label: 'Face Cream' }, dropdown_mm8qh5b: { labels: ['Face Cream'] } });
  // only in the new dropdown → only the dropdown
  assert.deepEqual(P.productValues('Bone & Joint', VIDEO, has).values, { dropdown_mm8qh5b: { labels: ['Bone & Joint'] } });
  // on neither → nothing (the caller reports it)
  assert.deepEqual(P.productValues('Mystery Serum', VIDEO, has), { values: {}, written: [] });
  assert.deepEqual(P.productValues('', VIDEO, has).written, []);
});

test('product write: unknown labels — the old column as before, unless the dropdown is known to have it', () => {
  const unknown = () => null;
  assert.deepEqual(P.productValues('Face Cream', VIDEO, unknown).values, { label9: { label: 'Face Cream' } });
  const onlyDropdownKnown = (col, v) => (col === 'dropdown_mm8qh5b' ? v === 'Face Cream' : null);
  assert.deepEqual(P.productValues('Face Cream', VIDEO, onlyDropdownKnown).values, { dropdown_mm8qh5b: { labels: ['Face Cream'] } });
  assert.deepEqual(P.productValues('Face Cream', { product: 'label9' }, () => true).values, { label9: { label: 'Face Cream' } });
});

test('product: every board config names the new dropdown next to label9', () => {
  const captain = require('../../src/lib/captain/config').BOARDS;
  const medium = require('../../src/lib/medium/config').BOARDS;
  const creative = require('../../src/lib/creative/config').DEFAULTS.boards;
  for (const boards of [captain, medium, creative]) {
    assert.equal(boards.video.columns.product, 'label9');
    assert.equal(boards.video.columns.product_dropdown, 'dropdown_mm8qh5b');
    assert.equal(boards.design.columns.product, 'label9');
    assert.equal(boards.design.columns.product_dropdown, 'dropdown_mm8q7ysv');
  }
});
