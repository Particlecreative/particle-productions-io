const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/lib/studio/campaignGroups');
const C = require('../src/lib/medium/campaign');
const M = require('../src/lib/medium/monday');

// The live Campaign labels (17 Nov 2026), a sample
const VIDEO_LABELS = ["Father's Day", 'Black Friday 2026', 'Black Friday 2026 Social Media', 'NeoRoot Launch', 'Ulta Launch', 'Amazon UK Social Media Launch', 'Rocco Mediate', 'Phil Simms',
  'Groin Wash Smoke Test', 'Levitas 1.0', 'Skeptic Videos', 'Proof-First Videos', 'Product Motion Videos', 'AI Product Videos', 'David & Goliath', 'Science For You', 'Applovin PARTICLEDEAL',
  'Creators Aug \'26', '5 Bucks 5 Problems'];

test('groups: every live campaign lands in the group you would expect', () => {
  const { of } = G.classify(VIDEO_LABELS);
  const want = {
    "Father's Day": 'holidays', 'Black Friday 2026': 'holidays', 'Black Friday 2026 Social Media': 'holidays', 'Applovin PARTICLEDEAL': 'holidays',
    'NeoRoot Launch': 'launches', 'Ulta Launch': 'launches', 'Amazon UK Social Media Launch': 'launches',
    'Rocco Mediate': 'faces', 'Phil Simms': 'faces', "Creators Aug '26": 'faces',
    'Groin Wash Smoke Test': 'tests', 'Levitas 1.0': 'tests',
    'Skeptic Videos': 'concepts', 'Proof-First Videos': 'concepts',
    'Product Motion Videos': 'img2video', 'AI Product Videos': 'img2video',
    'David & Goliath': 'evergreen', 'Science For You': 'evergreen', '5 Bucks 5 Problems': 'evergreen',
  };
  for (const [label, g] of Object.entries(want)) assert.equal(of[label], g, label);
  assert.equal(G.groupOf('Higgsfield Micro Dramas'), 'higgsfield');
  assert.equal(G.groupOf('Statics to Video'), 'img2video');
  assert.equal(G.groupOf('Medium Concepts'), 'concepts');
});

test('groups: a campaign placed by hand stays there; an unknown group is ignored', () => {
  const cfg = { assign: { 'david & goliath': 'concepts', 'science for you': 'nope' }, custom: [], renamed: { evergreen: 'Always on' } };
  assert.equal(G.groupOf('David & Goliath', cfg), 'concepts');
  assert.equal(G.groupOf('Science For You', cfg), 'evergreen');
  const gs = G.groupsOf(cfg);
  assert.equal(gs[gs.length - 1].name, 'Always on');
  assert.ok(gs.every(g => !g.match), 'no regexes go to the browser');
  const withCustom = { assign: { 'tv to meta': 'g_retargeting' }, custom: [{ key: 'g_retargeting', name: 'Retargeting' }] };
  assert.equal(G.groupOf('TV to Meta', withCustom), 'g_retargeting');
});

const brief = (over = {}) => ({ format: 'video', lane: 'Particle', move: 'NEW_ANGLE', product: 'Face Cream', ticket_name: 'Face Cream | Meta | Medium | Something', fields: {}, request: {}, ...over });

test('Medium campaign: Higgsfield, statics → video, layout, SFY, family, fallback — and a person’s choice wins', () => {
  assert.equal(C.campaignFor(brief({ move: 'HIGGSFIELD_DRAMA' })).name, 'Higgsfield Micro Dramas');
  assert.equal(C.campaignFor(brief({ move: 'HEADLINE_HOOK' })).name, 'Statics to Video');
  assert.equal(C.campaignFor(brief({ move: 'TRANSFER_FORMAT', request: { source_format: 'static' } })).name, 'Statics to Video');
  assert.notEqual(C.campaignFor(brief({ move: 'TRANSFER_FORMAT', format: 'design', request: { source_format: 'video' } })).name, 'Statics to Video');
  assert.equal(C.campaignFor(brief({ format: 'design', fields: { template: '5 Bucks. 5 Problems.' } }), { labels: VIDEO_LABELS }).name, '5 Bucks 5 Problems');
  assert.equal(C.campaignFor(brief({ lane: 'SFY' }), { labels: VIDEO_LABELS }).name, 'Science For You');
  // the brief Tomer approved on 11 Nov: skeptic, proof-first and demo all named — the first named wins
  assert.equal(C.campaignFor(brief({ ticket_name: 'Face Cream | Meta | Medium | The Skeptic Test — Proof-First Demo' }), { labels: VIDEO_LABELS }).name, 'Skeptic Videos');
  assert.equal(C.campaignFor(brief({ format: 'design', ticket_name: 'Neck Cream | Meta | She Noticed', fields: { copy: 'My wife noticed first' } })).name, 'Wife Witness Statics');
  assert.equal(C.campaignFor(brief({ format: 'design', fields: { hook: 'Unboxing day' } })).name, 'Medium Concepts', 'video-only families are not used for statics');
  assert.equal(C.campaignFor(brief()).name, 'Medium Concepts');
  assert.equal(C.campaignFor(brief({ move: 'HIGGSFIELD_DRAMA', request: { campaign: 'black friday 2026' } }), { labels: VIDEO_LABELS }).name, 'Black Friday 2026', 'Monday’s spelling');
});

test('ticket name: Lilian’s "Product | Campaign | Meta | Name", no near-copies, lanes still in', () => {
  assert.equal(C.withCampaign('Face Cream | Meta | Higgsfield Micro drama | The Birthday Sink', 'Higgsfield Micro Dramas'), 'Face Cream | Higgsfield Micro Dramas | Meta | The Birthday Sink');
  assert.equal(C.withCampaign('Face Cream | Skeptic Videos | Meta | X', 'Skeptic Videos'), 'Face Cream | Skeptic Videos | Meta | X');
  assert.equal(M.ticketName(brief({ ticket_name: 'Gravité | Meta | Gift' , lane: 'WAC' }), 'Wife Witness Statics'), 'Gravité | Wife Witness Statics | WAC | Meta | Gift');
  assert.equal(M.ticketName(brief({ lane: 'SFY', ticket_name: 'Face Cream | Meta | Medium | Why' }), 'Science For You'), 'Face Cream | Science For You | Meta | Medium | Why');
  assert.equal(M.ticketName(brief({ ticket_name: 'A | Meta | B' })), 'A | Meta | B', 'no campaign → unchanged');
});

test('Monday columns: an existing campaign goes in the create; a new one is added after', () => {
  const labels = { dropdown_mm3n9vjc: ['Skeptic Videos'], label9: ['Face Cream'] };
  const a = M.columnValues(brief({ fields: { hook: 'x' } }), { labels, campaign: 'skeptic videos' });
  assert.deepEqual(a.values.dropdown_mm3n9vjc, { labels: ['Skeptic Videos'] });
  assert.equal(a.campaignNew, null);
  const b = M.columnValues(brief({ fields: { hook: 'x' } }), { labels, campaign: 'Higgsfield Micro Dramas' });
  assert.equal(b.values.dropdown_mm3n9vjc, undefined);
  assert.equal(b.campaignNew, 'Higgsfield Micro Dramas');
});
