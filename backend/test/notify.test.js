// Notifications (25 Nov 2026): settings merge and cleaning, the Creative team's money-free On Air, and the watcher's helpers.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/lib/notify/store');
const W = require('../src/lib/notify/watch');
const M = require('../src/lib/team/noMoney');

test('settings: defaults on, a person’s choices win, only known keys and booleans are kept', () => {
  assert.equal(N.merged(null).types.comment, true);
  assert.equal(N.merged({ types: { comment: false } }).types.comment, false);
  assert.equal(N.merged({ types: { comment: false } }).types.status, true);
  assert.deepEqual(N.clean({ types: { comment: false, hack: true, status: 'yes' }, toast: false, desktop: 1, other: 2 }), { types: { comment: false }, toast: false });
});

test('On Air for the Creative team: every money number is gone, what runs and when stays', () => {
  const tv = { today: '2026-11-25', notes: [{ text: '$40k booked' }], brain: { x: 1 }, products: [{ name: 'Face Cream', week: { spent: 9000, orders: 40 }, periods: { week: { spend: 1 } },
    spots: [{ code: 'FC15', name: 'Hunt 15s', first_seen: '2026-11-20', is_new: true, spent: 5000, orders: 30, mer: 2.1, cpo: 33, first: { date: '2026-11-20', station: 'FOX' } }],
    plan: { total: { cost: 40000 }, creatives: [{ code: 'FC15', name: 'Hunt 15s', cost: 3000, markets: ['NY'] }] } }] };
  const out = M.tvForCreative(tv);
  assert.equal(out.notes, undefined);
  assert.equal(out.brain, undefined);
  const s = out.products[0].spots[0];
  assert.deepEqual(s, { code: 'FC15', name: 'Hunt 15s', first_seen: '2026-11-20', is_new: true, first: { date: '2026-11-20', station: 'FOX' } });
  assert.equal(out.products[0].week, undefined);
  assert.deepEqual(out.products[0].plan, { total: {}, creatives: [{ code: 'FC15', name: 'Hunt 15s', markets: ['NY'] }] });
  assert.ok(!JSON.stringify(out).match(/9000|5000|40000|3000|spent|orders|mer|cpo/));
  const media = M.mediaForCreative({ connected: true, ready: true, totals: { spend: 1 }, benchmarks: {}, creatives: [{ key: 'k', label: 'Ad', maker: 'Itai Cohen', first_spend: '2026-11-24', live: true, periods: { w: { spend: 5 } }, series: [1], vs: {}, ads_manager: 'x', afterlife: 'y', thumb: '/t' }] });
  assert.deepEqual(media.creatives[0], { key: 'k', label: 'Ad', format: undefined, lane: undefined, product: undefined, campaign: undefined, maker: 'Itai Cohen', team: undefined, asset_id: undefined, first_spend: '2026-11-24', last_spend: undefined, live: true, new: false, ads: undefined, thumb: '/t', video_url: undefined, file_url: undefined });
  assert.equal(media.totals, undefined);
});

test('watcher helpers: short task titles and people from a people column', () => {
  assert.equal(W.itemTitle('Gravité | Meta | Claude | Gravité Meta His Side My Wife Said'), 'Claude · Gravité Meta His Side My Wife Said');
  assert.deepEqual(W.personIds('{"personsAndTeams":[{"id":1,"kind":"person"},{"id":9,"kind":"team"}]}'), ['1']);
  assert.deepEqual(W.personIds(null), []);
});
