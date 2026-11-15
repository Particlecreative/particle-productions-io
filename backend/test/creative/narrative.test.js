// The week in brief: the founders' version is for the CEOs, the Creative Team Weekly's is for the team.
//   cd backend && node --test test/creative/narrative.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { systemFor, compactInput } = require('../../src/lib/creative/narrative');

test('the team summary is told to the team — no names, no CEO asks; the founders one is unchanged', () => {
  const team = systemFor('team');
  const founders = systemFor('founders');
  assert.match(team, /to the whole creative team/);
  assert.match(team, /about the TEAM as one/);
  assert.match(team, /Never name, credit, rank or compare individual people/);
  assert.doesNotMatch(team, /needs CEO attention/);
  assert.match(founders, /to the two CEOs/);
  assert.match(founders, /needs CEO attention/);
  assert.equal(systemFor(undefined), founders);
});

test('the team deck sends its market numbers; the founders deck does not', () => {
  const snapshot = {
    week: { label: 'Nov 8 – Nov 12', next: { label: 'Nov 15 – Nov 19' } }, items: {}, sections: {}, people: {}, metrics: {},
    team: { performance: { totals: { spend: 1200, roas: 2.1, ctr: 0.012, hook: 0.31 }, prev: { roas: 1.8 }, creatives: [{}, {}, {}] } },
  };
  const team = compactInput({ deck: 'team', snapshot, overrides: {} });
  assert.deepEqual(team.market, { last_week: { spend: 1200, roas: 2.1, ctr: 0.012, thumbstop: 0.31 }, week_before: { spend: null, roas: 1.8, ctr: null, thumbstop: null }, creatives_in_market: 3 });
  assert.equal('market' in compactInput({ deck: 'founders', snapshot, overrides: {} }), false);
  assert.equal(compactInput({ deck: 'team', snapshot: { ...snapshot, team: {} }, overrides: {} }).market, null);
});
