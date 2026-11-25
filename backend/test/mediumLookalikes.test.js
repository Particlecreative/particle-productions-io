// Upspring Lookalikes → Medium's Market Watch (25 Nov 2026): competitors refresh the auto-picked brands (brands added
// by hand stay, removed ones stay out); "Built like Particle" = similar business and scale in other categories.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/lib/medium/lookalikes');
const acct = require('../src/lib/medium/upspringAccount');
const U = require('../src/lib/medium/upspring');

const A = (name, domain, score, extra = {}) => ({ advertiser_id: `id-${domain}`, name, domain, score, industry: 'Skincare', category: "Men's grooming", scale: { spend: 'A', traffic: 'C' }, active_ads_in_country: 10, ...extra });
const COMP = [A('Caldera + Lab', 'calderalab.com', 0.884), A('SerlinoLab', 'serlinolab.com', 0.802), A('Lumin', 'luminskin.com', 0.781),
  A('Brickell Men\'s Products', 'brickellmensproducts.com', 0.637), A('Particle', 'particleformen.com', 0.99), A('Tiny Brand', 'tiny.com', 0.31)];
const PROFILE = [A("Harry's", 'harrys.com', 0.901, { industry: 'Personal care', category: 'Shaving & grooming' }), A('Intake Breathing', 'intakebreathing.com', 0.864, { industry: 'Telehealth', category: 'Sleep health' }),
  A('Forge Men', 'try-forge.com', 0.845), A('Filterbuy, Inc.', 'filterbuy.com', 0.841, { industry: 'Household cleaning', category: 'Air care' }), A('Caldera + Lab', 'calderalab.com', 0.83)];

test('competitors: closest first; never Particle, a weak match, a removed brand or one already watched', () => {
  const picks = L.pickCompetitors(COMP, { keep: [{ name: 'Lumin', domain: 'https://www.luminskin.com/' }], removed: ['serlinolab.com'], n: 8 });
  assert.deepEqual(picks.map(p => p.domain), ['calderalab.com', 'brickellmensproducts.com']);
  assert.deepEqual(picks[0], { name: 'Caldera + Lab', domain: 'calderalab.com', score: 0.88, spend: 'A', traffic: 'C', industry: 'Skincare', category: "Men's grooming", active_ads: 10 });
  assert.equal(L.pickCompetitors(COMP, { n: 2 }).length, 2);
});

test('built like Particle: other categories only, nothing already watched', () => {
  assert.deepEqual(L.pickOutside(PROFILE, { exclude: ['harrys.com'] }).map(p => p.name), ['Intake Breathing', 'Filterbuy, Inc.']);
});

test('refresh: hand-added brands stay, removed stay out, ids come from the Public API (cached), and it checks Upspring started from Particle', async (t) => {
  const calls = [];
  t.mock.method(acct, 'status', async () => ({ connected: true }));
  t.mock.method(acct, 'callTool', async (name, args) => { calls.push([name, args.match_on, args.advertiser]); return { advertiser: { name: 'Particle', domain: 'particleformen.com' }, advertisers: args.match_on === 'competitors' ? COMP : PROFILE }; });
  const lookups = [];
  t.mock.method(U, 'byDomain', async (d) => { lookups.push(d); return d === 'brickellmensproducts.com' ? { status: 'pending' } : { id: `pub-${d}`, name: d }; });
  const mw = { brands: [{ id: 'm1', name: 'Duke Cannon', domain: 'dukecannon.com' }, { id: 'old', name: 'Old Auto', domain: 'old.com', auto: true }], removed: ['serlinolab.com'], domain_ids: { 'calderalab.com': 'cached-cl' } };
  const r = await L.refresh(mw, { country: 'US' });
  assert.deepEqual(calls.map(c => c[1]), ['competitors', 'same_profile']);
  assert.ok(calls.every(c => c[0] === 'find_similar_advertisers' && c[2] === 'particleformen.com'));
  assert.deepEqual(r.brands.map(b => [b.id, b.name, !!b.auto]), [['m1', 'Duke Cannon', false], ['cached-cl', 'Caldera + Lab', true], ['pub-luminskin.com', 'Lumin', true]]);
  assert.ok(!lookups.includes('calderalab.com'), 'cached id is reused');
  assert.deepEqual(r.outside.map(b => b.name), ["Harry's", 'Intake Breathing', 'Filterbuy, Inc.']);
  assert.equal(r.domain_ids['harrys.com'], 'pub-harrys.com');
  assert.deepEqual(r.errors, []);

  acct.callTool.mock.mockImplementation(async () => ({ advertiser: { name: 'Particle Women', domain: 'particleforwomen.com' }, advertisers: COMP }));
  const wrong = await L.refresh(mw);
  assert.deepEqual(wrong.brands, mw.brands, 'a list for the wrong brand changes nothing');
  assert.equal(wrong.errors.length, 2);

  acct.status.mock.mockImplementation(async () => ({ connected: false }));
  assert.equal(await L.refresh(mw), null, 'not connected → Market Watch keeps its saved list');
});
