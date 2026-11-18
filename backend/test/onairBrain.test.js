// On Air · TV from the Particle Brain platform API (18 Nov 2026). Made-up rows in Brain's documented shape.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/lib/onair/brain');
const TV = require('../src/lib/onair/tv');

const res = (status, body, headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

test('pageRequest: through AFTERLIFE by default, straight to Brain when CP has its own key', () => {
  const keep = { k: process.env.BRAIN_API_KEY, u: process.env.AFTERLIFE_URL, t: process.env.AFTERLIFE_EXPORT_TOKEN };
  try {
    delete process.env.BRAIN_API_KEY;
    process.env.AFTERLIFE_URL = 'https://afterlife.example/';
    process.env.AFTERLIFE_EXPORT_TOKEN = 'x'.repeat(40);
    let r = B.pageRequest('tv/daily', { from: '2026-11-01', to: '2026-11-17', limit: 10000, offset: 0 });
    assert.equal(r.url, 'https://afterlife.example/api/export/brain?from=2026-11-01&to=2026-11-17&limit=10000&offset=0&path=tv%2Fdaily');
    assert.equal(r.headers['X-Export-Token'], 'x'.repeat(40));
    assert.equal(r.headers.Authorization, undefined);
    assert.equal(B.configured(), true);
    process.env.BRAIN_API_KEY = 'test-key';
    r = B.pageRequest('tv/breakdown', { from: '2026-11-01', offset: null });
    assert.equal(r.url, 'https://pfm-ai-assistant.cloud/platform/v1/tv/breakdown?from=2026-11-01');
    assert.equal(r.headers.Authorization, 'Bearer test-key');
  } finally {
    for (const [k, v] of [['BRAIN_API_KEY', keep.k], ['AFTERLIFE_URL', keep.u], ['AFTERLIFE_EXPORT_TOKEN', keep.t]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});

test('fetchAll pages by next_offset and waits out a 429', async () => {
  process.env.BRAIN_API_KEY = 'test-key';
  const seen = [];
  let limited = false;
  const fetchImpl = async (url) => {
    const off = Number(new URL(url).searchParams.get('offset'));
    seen.push(off);
    if (off === 2 && !limited) { limited = true; return res(429, { error: 'Rate limit' }, { 'retry-after': '1' }); }
    const rows = off === 0 ? [{ a: 1 }, { a: 2 }] : [{ a: 3 }];
    return res(200, { data: rows, meta: { next_offset: off === 0 ? 2 : null } });
  };
  const rows = await B.fetchAll('tv/daily', '2026-11-01', '2026-11-02', { fetchImpl, gapMs: 0, retryUnitMs: 0 });
  assert.deepEqual(rows.map(r => r.a), [1, 2, 3]);
  assert.deepEqual(seen, [0, 2, 2]);
  await assert.rejects(B.fetchAll('tv/daily', '2026-11-01', '2026-11-02', { fetchImpl: async () => res(401, { error: 'Invalid or missing bearer token' }), gapMs: 0 }), /401: Invalid or missing bearer token/);
  delete process.env.BRAIN_API_KEY;
});

test('chunks keeps every request within 400 days', () => {
  const c = B.chunks('2024-01-16', '2026-11-18');
  assert.equal(c[0][0], '2024-01-16');
  assert.equal(c[0][1], '2025-02-18');
  assert.equal(c[1][0], '2025-02-19');
  assert.equal(c[c.length - 1][1], '2026-11-18');
  assert.deepEqual(B.chunks('2026-11-10', '2026-11-12', 2), [['2026-11-10', '2026-11-11'], ['2026-11-12', '2026-11-12']]);
});

test('sumRows adds the additive numbers and recomputes ratios', () => {
  const t = B.sumRows([{ product: 'gravite', spend: 100, orders: 4, revenue: 300, roas: 3, cpa: 25, estimated: false }, { spend: 50, orders: 1, revenue: 60, roas: 1.2, estimated: true }]);
  assert.deepEqual(t, { spend: 150, orders: 5, revenue: 360, estimated: true });
  const f = B.finish(t);
  assert.equal(f.mer, 360 / 150);
  assert.equal(f.cpo, 30);
  assert.equal(f.aov, 72);
  assert.equal(B.finish({ spend: 0, orders: 0 }), null);
});

test('displayName maps Brain products onto the names CP already uses', () => {
  const known = ['Face Cream', 'Gravité', 'Neck Cream'];
  assert.equal(B.displayName('gravite', 'Gravite', known), 'Gravité');
  assert.equal(B.displayName('PFC', 'Particle Face Cream', known), 'Face Cream');
  assert.equal(B.displayName('neck', 'Neck Cream', known), 'Neck Cream');
  assert.equal(B.displayName('x1', 'Beard Oil', known), 'Beard Oil');
  assert.equal(B.displayName('cream', 'Cream', known), 'Cream');    // too short to guess
});

const dayRows = (from, n, f) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.parse(`${from}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
  return { day: d, data: [{ report_date: d, product: 'gravite', product_name: 'Gravite', ...f(d, i) }] };
});

test('productFrom: Day / Week / Month, the same days last week, charts, estimates', () => {
  // 1 Oct → Wed 18 Nov 2026: $100 a day, 2 orders, $250 revenue; the pre-log has 19 Nov
  const daily = dayRows('2026-10-01', 49, () => ({ spots: 10, spend: 100, orders: 2, revenue: 250 }));
  const cost = [{ day: '2026-11-19', data: [{ report_date: '2026-11-19', product: 'gravite', spend: 120, estimated: true }] }];
  const v = B.productFrom({ name: 'Gravité', daily, cost, today: '2026-11-19' });
  assert.equal(v.last, '2026-11-18');
  assert.equal(v.periods.day.spend, 100);
  assert.equal(v.periods.day.prev.spend, 100);
  assert.equal(v.periods.week.label, '2026-11-16');               // Monday weeks, like the agency
  assert.equal(v.periods.week.spend, 300);                         // Mon–Wed
  assert.equal(v.periods.week.partial, true);
  assert.equal(v.periods.week.prev.spend, 700);
  assert.equal(v.periods.week.prev_same.spend, 300);               // last Mon–Wed
  assert.equal(v.periods.week.days, 3);
  assert.equal(v.periods.month.label, '2026-11');
  assert.equal(v.periods.month.spend, 1800);
  assert.equal(v.periods.month.prev.spend, 3100);
  assert.equal(v.periods.month.prev_same.spend, 1800);             // 1–18 Oct
  assert.equal(v.periods.month.mer, 2.5);
  assert.equal(v.history.daily.length, 42);
  assert.equal(v.history.weekly[v.history.weekly.length - 1].partial, true);
  assert.deepEqual(v.history.monthly.map(m => m.month), ['2026-10', '2026-11']);
  assert.deepEqual(v.estimated.after_last, [{ date: '2026-11-19', spend: 120 }]);
  assert.equal(v.estimated.spend_after_last, 120);
  assert.equal(B.productFrom({ name: 'x', daily: [] }), null);
});

test('airFrom: per creative / station / daypart per period, first airing, the same shape as the RBD view', () => {
  const rows = [];
  const add = (day, creative, name, station, dp, spend, orders, revenue) => rows.push({ day, creative, creative_name: name, station, station_name: station, day_part: dp, market: 'National', spots: '2', spend: String(spend), orders: String(orders), revenue: String(revenue) });
  add('2026-11-09', 'GC1WHYH', 'Chosen - Why Would You', 'FOXN', 'Prime', 400, 4, 1200);
  add('2026-11-16', 'GC1WHYH', 'Chosen - Why Would You', 'FOXN', 'Prime', 300, 3, 900);
  add('2026-11-17', 'GC1WHYH', 'Chosen - Why Would You', 'CNN', 'Daytime', 200, 1, 150);
  add('2026-11-17', 'GC1NEWH', 'Brand New Spot', 'FOXN', 'Early Morning', 100, 2, 500);
  const a = B.airFrom(rows, { GC1WHYH: { date: '2026-05-02', station: 'FOXN', market: 'National' } }, '2026-11-17');
  assert.equal(a.source, 'brain');
  const why = a.codes.GC1WHYH;
  assert.equal(why.name, 'Chosen - Why Would You');
  assert.equal(why.first.date, '2026-05-02');
  assert.equal(why.day.spend, 200);
  assert.equal(why.day_prev.spend, 300);
  assert.equal(why.week.spend, 500);
  assert.equal(why.week_prev.spend, 400);
  assert.equal(why.week.mer, 1050 / 500);
  assert.equal(why.week.spots, 4);
  assert.equal(a.codes.GC1NEWH.first, null);
  assert.deepEqual(a.stations.week.map(s => s.station), ['FOXN', 'CNN']);
  assert.equal(a.stations.week[0].market, 'National');
  assert.equal(a.stations.week[0].prev.spend, 400);
  assert.deepEqual(a.dayparts.week.map(d => d.daypart), ['Early Morning', 'Daytime', 'Prime']);   // clock order
  assert.equal(a.markets.month[0].market, 'National');

  // tv.js's withSheets reads it exactly like the RBD view
  const v = TV.withSheets(TV.blankView('Gravité'), a, null, { GC1WHYH: { title: 'Why Would You' } }, '2026-11-18');
  assert.equal(v.air.spots.week[0].code, 'GC1WHYH');
  assert.equal(v.air.spots.week[0].library.title, 'Why Would You');
  assert.equal(v.air.spots.week[0].first_seen, '2026-05-02');
  assert.equal(v.air.spots.day.find(s => s.code === 'GC1NEWH').is_new, false);   // no first airing known → not called new
});

test('withBrain puts Brain’s totals and charts on a product view', () => {
  const daily = dayRows('2026-10-01', 48, () => ({ spots: 10, spend: 100, orders: 2, revenue: 250 }));
  const b = { ...B.productFrom({ name: 'Gravité', daily, today: '2026-11-18' }), brain_products: ['gravite'] };
  const v = TV.withBrain(TV.blankView('Gravité'), b);
  assert.equal(v.source, 'brain');
  assert.equal(v.week_of, '2026-11-16');
  assert.equal(v.month.month, '2026-11');
  assert.equal(v.month.prev_month, '2026-10');
  assert.equal(v.periods.week.spend, 200);
  assert.equal(v.brain.last, '2026-11-17');
  assert.deepEqual(v.brain.products, ['gravite']);
});
