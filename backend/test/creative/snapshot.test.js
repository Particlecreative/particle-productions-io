const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/x';
const { parseItemName, canonicalUrl, linkKind, trackedInWindow } = require('../../src/lib/creative/snapshot');

const known = new Set(['face cream', 'gravité', 'test product', 'neoroot']);

test('parseItemName: product | campaign | concept', () => {
  assert.deepEqual(parseItemName('Face Cream | Claude | The Hunt TV commercial Offline', 'Face Cream', known),
    { title: 'The Hunt TV commercial Offline', subtitle: 'Claude' });
});

test('parseItemName: product | campaign | platform | concept', () => {
  assert.deepEqual(parseItemName('Gravité | The Line Up | Meta | Line Up Digital Versions', 'Gravité', known),
    { title: 'Line Up Digital Versions', subtitle: 'The Line Up · Meta' });
});

test('parseItemName: deep names join the last two segments', () => {
  assert.deepEqual(parseItemName('Test Product | Ashford | Meta | Heart & Longevity Support | Product in Setting', 'Test Product', known),
    { title: 'Heart & Longevity Support — Product in Setting', subtitle: 'Ashford · Meta' });
});

test('parseItemName: short trailing segment merges with predecessor', () => {
  assert.deepEqual(parseItemName('Face Cream | Meta | COPYCAT Campaign | SAVE MONEY', 'Face Cream', known),
    { title: 'COPYCAT Campaign — SAVE MONEY', subtitle: 'Meta' });
});

test('parseItemName: no pipes / unknown first segment kept', () => {
  assert.deepEqual(parseItemName('Hero banner refresh', '', known), { title: 'Hero banner refresh', subtitle: '' });
  assert.equal(parseItemName('Levitas | Meta | Dermatologist Hook', '-', known).subtitle, 'Levitas · Meta');
});

test('canonicalUrl keeps Dropbox rlkey and drops tracking params', () => {
  const u = canonicalUrl('https://www.dropbox.com/scl/fo/abc/XYZ?rlkey=k1&st=tracking&dl=0');
  assert.equal(u, 'https://www.dropbox.com/scl/fo/abc/XYZ?rlkey=k1');
});

test('linkKind', () => {
  assert.equal(linkKind('https://next.frame.io/project/p/f'), 'frameio');
  assert.equal(linkKind('https://f.io/ZUTl7yW8'), 'frameio');
  assert.equal(linkKind('https://www.dropbox.com/scl/fo/abc/XYZ?rlkey=k'), 'dropbox_folder');
  assert.equal(linkKind('https://www.dropbox.com/scl/fi/abc/file.mp4?rlkey=k'), 'dropbox_file');
  assert.equal(linkKind('https://www.figma.com/file/abc'), 'figma');
  assert.equal(linkKind('https://example.com'), 'link');
});

test('trackedInWindow clips a forgotten running timer to work hours', () => {
  const from = Date.parse('2026-10-17T21:00:00Z'); // Sun 00:00 IDT
  const to = Date.parse('2026-10-24T21:00:00Z');
  const now = Date.parse('2026-10-20T13:00:00Z');  // Tue 16:00 IDT
  // Running since Mon 13:19 IDT
  const r = trackedInWindow({ history: [{ started_at: '2026-10-19T10:19:36+00:00', ended_at: null }], running: true }, from, to, now);
  // Mon 13:19→19:00 (5h41m) + Tue 09:00→16:00 (7h)
  assert.equal(Math.round(r.seconds / 60), 5 * 60 + 41 + 7 * 60 - 1);
  assert.deepEqual(r.days.sort(), ['2026-10-19', '2026-10-20']);
});

test('trackedInWindow merges overlapping sessions instead of double-counting', () => {
  const from = Date.parse('2026-10-17T21:00:00Z');
  const to = Date.parse('2026-10-24T21:00:00Z');
  const now = Date.parse('2026-10-26T00:00:00Z');
  const r = trackedInWindow({ history: [
    { started_at: '2026-10-19T07:00:00Z', ended_at: '2026-10-19T09:00:00Z' }, // Mon 10:00–12:00 IDT
    { started_at: '2026-10-19T08:00:00Z', ended_at: '2026-10-19T10:00:00Z' }, // overlaps → 10:00–13:00 total
  ] }, from, to, now);
  assert.equal(r.seconds, 3 * 3600);
});

test('trackedInWindow ignores Friday/Saturday and out-of-window sessions', () => {
  const from = Date.parse('2026-10-17T21:00:00Z');
  const to = Date.parse('2026-10-24T21:00:00Z');
  const now = Date.parse('2026-10-26T00:00:00Z');
  const r = trackedInWindow({ history: [
    { started_at: '2026-10-23T07:00:00Z', ended_at: '2026-10-23T12:00:00Z' }, // Friday
    { started_at: '2026-10-10T07:00:00Z', ended_at: '2026-10-10T12:00:00Z' }, // previous week
  ] }, from, to, now);
  assert.equal(r.seconds, 0);
});

// ── Product: the new Product dropdown first, "Product (old)" (label9) as the fallback; colours by name (12 Nov 2026) ──
const { normalizeItem, productLabelColor, knownProductsOf } = require('../../src/lib/creative/snapshot');
const { DEFAULTS: CREATIVE_DEFAULTS } = require('../../src/lib/creative/config');

const DESIGN_COLS = CREATIVE_DEFAULTS.boards.design.columns;
const productMeta = {
  columns: {},
  statusMaps: { label9: {
    byIndex: { 3: { label: 'Gravité', color: '#037f4c' }, 9: { label: 'Hair Gummies', color: '#225091' }, 5: { label: '-', color: '#c4c4c4' }, 105: { label: 'Face Cream', color: '#579bfc' } },
    byLabel: { 'gravité': 3, 'hair gummies': 9, '-': 5, 'face cream': 105 },
  } },
  dropdowns: { dropdown_mm8q7ysv: ['Gravité', 'Hair Gummies', 'Face Cream', 'Bone & Joint', 'Antifungal Foot Treatment'] },
};
const cvs = (oldLabel, oldIndex, ddLabel) => ({
  label9: { id: 'label9', type: 'status', text: oldLabel, label: oldLabel, index: oldIndex },
  dropdown_mm8q7ysv: { id: 'dropdown_mm8q7ysv', type: 'dropdown', text: ddLabel, values: ddLabel ? [{ id: '1', label: ddLabel }] : [] },
});

test('product: label from the dropdown, colour from Product (old) by NAME — never its index', () => {
  // live case: dropdown Gravité, old column Hair Gummies (index 9) → Gravité's green, not Hair Gummies' navy
  assert.deepEqual(productLabelColor(cvs('Hair Gummies', 9, 'Gravité'), DESIGN_COLS, productMeta, {}), { label: 'Gravité', color: '#037f4c' });
  assert.deepEqual(productLabelColor(cvs('Face Cream', 105, null), DESIGN_COLS, productMeta, {}), { label: 'Face Cream', color: '#579bfc' });
  assert.deepEqual(productLabelColor(cvs('-', null, null), DESIGN_COLS, productMeta, {}), { label: '-', color: '#c4c4c4' });
  assert.deepEqual(productLabelColor({}, DESIGN_COLS, productMeta, {}), { label: '', color: null });
});

test('product: a product only the dropdown has — no colour unless product_colors sets one', () => {
  assert.deepEqual(productLabelColor(cvs('-', null, 'Bone & Joint'), DESIGN_COLS, productMeta, {}), { label: 'Bone & Joint', color: null });
  assert.equal(productLabelColor(cvs('-', null, 'Bone & Joint'), DESIGN_COLS, productMeta, { 'Bone & Joint': '#123456' }).color, '#123456');
});

test('product: known products include the dropdown-only ones (item-name parsing)', () => {
  const k = knownProductsOf(productMeta, DESIGN_COLS);
  assert.ok(k.has('gravité') && k.has('bone & joint') && k.has('antifungal foot treatment'));
  const into = new Set(['neoroot']);
  assert.equal(knownProductsOf(productMeta, DESIGN_COLS, into), into);
  assert.ok(into.has('neoroot') && into.has('face cream'));
  assert.equal(knownProductsOf({ statusMaps: {} }, { product: 'label9' }).size, 0);   // no dropdown, no labels
});

test('normalizeItem: the item carries the dropdown product, its colour by name, and the name parses around it', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  const ctx = {
    boardKey: 'design', board: { columns: DESIGN_COLS }, meta: productMeta, config: CREATIVE_DEFAULTS, now,
    bounds: { fromMs: now - 7 * 86400000, toMs: now }, knownProducts: knownProductsOf(productMeta, DESIGN_COLS), statusCategory: () => 'other',
  };
  const raw = (name, c) => ({ id: 7, name, column_values: Object.values(c) });
  const g = normalizeItem(raw('Gravité | Ulta Launch | Meta | Ulta Launch Static 4 – Bottle on Curb', cvs('Hair Gummies', 9, 'Gravité')), ctx);
  assert.deepEqual(g.product, { label: 'Gravité', color: '#037f4c' });
  assert.equal(g.title, 'Ulta Launch Static 4 – Bottle on Curb');
  const a = normalizeItem(raw('Bone & Joint | Meta | Would You Date Him', cvs('-', null, 'Bone & Joint')), ctx);
  assert.deepEqual(a.product, { label: 'Bone & Joint', color: null });
  assert.equal(a.title, 'Would You Date Him');
  assert.equal(a.subtitle, 'Meta');
});
