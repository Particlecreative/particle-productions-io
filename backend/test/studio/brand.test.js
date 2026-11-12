// Brand of a studio task — the Studio filters and colours by it (12 Nov 2026)
//   cd backend && node --test test/studio/brand.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/x';
const { brandOf, BRANDS } = require('../../src/lib/studio/brand');

const b = (x) => brandOf(x).label;

test('brand: the Brands column wins — even over a brand named in the task', () => {
  assert.deepEqual(brandOf({ column: 'Clearstep', name: 'Meta — Nail Split: Yellow vs Clear', product: 'Antifungal Nail Repair' }), { label: 'Clearstep', color: '#00c875', source: 'column' });
  // live: "Biomella Born Bare" tasks the team tagged Particle
  assert.equal(b({ column: 'Particle', name: 'Not a Product Task | Claude | Biomella Born Bare Tv commercial' }), 'Particle');
  assert.equal(b({ column: 'particle' }), 'Particle');
});

test('brand: a brand Monday has and we don\'t yet is kept, without a colour', () => {
  assert.deepEqual(brandOf({ column: 'Nordic Labs' }), { label: 'Nordic Labs', color: null, source: 'column' });
});

test('brand: the Design board\'s older free-text Brand column', () => {
  assert.equal(b({ text: 'ASHFORD FORMULARY & Co.' }), 'Ashford');
  assert.equal(b({ text: 'clearstep' }), 'Clearstep');
  assert.equal(brandOf({ text: 'PARTICLE' }).source, 'text');
});

test('brand: named in the task name or campaign', () => {
  assert.equal(b({ name: 'Test Product | Ashford | Meta | Clinical Scan Stats', product: 'Test Product' }), 'Ashford');
  assert.equal(b({ name: 'Hand Cream | Meta | Biomella Postbiotic Hand Cream Meta Script Science For You', product: 'Hand Cream' }), 'Biomella');
  assert.equal(b({ name: 'Dermatologist Hook', campaign: 'Levitas 1.0' }), 'Levitas');
  assert.equal(b({ name: 'Blurr | Meta | Launch' }), 'Blurr');
  // a brand named first beats Particle named later
  assert.equal(b({ name: 'Ashford | Bone & Joint | vs Particle' }), 'Ashford');
  assert.equal(brandOf({ name: "05.12.26 - Particle's Gift Guide" }).source, 'name');
  // a word that merely contains a brand doesn't count
  assert.equal(b({ name: 'Particles of light | Meta', product: 'Face Cream' }), 'Particle');   // falls through to the default
  assert.equal(brandOf({ name: 'Particles of light | Meta', product: 'Face Cream' }).source, 'default');
});

test('brand: products only one brand sells; never the shared creams', () => {
  assert.equal(b({ name: 'Meta — Renting Relief / 30 Days Later', product: 'Bone & Joint' }), 'Ashford');
  assert.equal(b({ name: 'Meta — Tired of Hiding Your Feet', product: 'Antifungal Foot Treatment' }), 'Clearstep');
  assert.equal(b({ name: 'Meta — Toenails Looking Like This', product: 'antifungal nail repair' }), 'Clearstep');
  assert.equal(brandOf({ name: 'Face Cream | Meta | Split Face', product: 'Face Cream' }).source, 'default');   // Particle and Biomella both sell it
  assert.equal(b({ name: 'Face Cream | Meta | Split Face', product: 'Face Cream' }), 'Particle');
});

test('brand: nothing to go on → Particle, the house brand', () => {
  assert.deepEqual(brandOf({}), { label: 'Particle', color: '#579bfc', source: 'default' });
  assert.equal(b({ column: '-', name: 'Website — Quiz', product: 'NeoRoot' }), 'Particle');
});

test('brand: colours are Monday\'s Brands-column colours', () => {
  const live = { Particle: '#579bfc', Ashford: '#fdab3d', Clearstep: '#00c875', Levitas: '#9d50dd', Biomella: '#037f4c', Blurr: '#a1e3f6' };
  assert.deepEqual(Object.fromEntries(BRANDS.map(x => [x.name, x.color])), live);
});

test('brand on a task: column colour from the live board, brand_colors override, inferred otherwise', () => {
  const { brandLabelColor } = require('../../src/lib/creative/snapshot');
  const cols = { brand_status: 'color_mm8q3pn9', brand: 'text_mkz3xf50' };
  const meta = { statusMaps: { color_mm8q3pn9: { byIndex: { 7: { label: 'Particle', color: '#123abc' }, 0: { label: 'Ashford', color: '#fdab3d' } }, byLabel: { particle: 7, ashford: 0 } } } };
  const cv = (status, text) => ({ color_mm8q3pn9: { id: 'color_mm8q3pn9', label: status, text: status }, text_mkz3xf50: { id: 'text_mkz3xf50', text } });
  assert.deepEqual(brandLabelColor(cv('Particle', ''), cols, meta, {}, { name: 'x' }), { label: 'Particle', color: '#123abc', source: 'column' });   // Monday's own colour
  assert.equal(brandLabelColor(cv('Ashford', ''), cols, meta, { Ashford: '#000000' }, {}).color, '#000000');
  assert.deepEqual(brandLabelColor(cv(null, 'clearstep'), cols, meta, {}, {}), { label: 'Clearstep', color: '#00c875', source: 'text' });
  assert.deepEqual(brandLabelColor({}, { brand_status: 'color_mm8q1bam' }, { statusMaps: {} }, {}, { name: 'Bone & Joint | Meta', product: 'Bone & Joint' }),
    { label: 'Ashford', color: '#fdab3d', source: 'product' });   // "Bone & Joint" isn't a brand token… but the product is Ashford's
});
