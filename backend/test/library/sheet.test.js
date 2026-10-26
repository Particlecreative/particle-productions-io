const test = require('node:test');
const assert = require('node:assert');
const { parseTab, sheetEntries, parseLanding, sheetIdOf, matchProduction } = require('../../src/lib/librarySheet');

const row = (...vals) => vals.map(v => (typeof v === 'object' && v ? v : { text: v ?? '', link: null }));
const HEADER = row('NAME', 'US', 'LINK', 'URL', 'CREATIVE CODE', 'CA', 'LINK', 'URL', 'CREATIVE CODE', 'AUS', 'LINK', 'URL', 'PROMO CODE', 'NOTES');
const faceCream = [
  HEADER,
  row('Most Men 60s', 'TRUE', 'https://www.dropbox.com/scl/fi/t6d/script-2-most-men_ProResXQ444.mov?rlkey=7r3&dl=0', 'particlemen.com - https://www.particleformen.com/lpage/particle-face-cream-el-tv/ ', 'PM1MMH',
    'FALSE', 'https://drive.google.com/file/d/1URGdDSmuj5Fq1j7XfAaZjpQjWdSl98OW/view', 'particlemen.ca - https://www.particleformen.com/lpage/particle-face-cream-el-tv-ca/', 'PM1MMCAH',
    'FALSE', 'https://www.dropbox.com/scl/fi/3h7/MOST-MEN_60sec_AUS.mov?rlkey=abc', 'particlecream.com - https://www.particleformen.com/lpage/particle-face-cream-el-tv-aus/', 'AUSSIE25', ''),
  row('Most Men 60s', 'FALSE', 'https://drive.google.com/file/d/17MrwZ0RdxnU--AJZdW65O24gGRKh13hv/view', '', 'PM1MMDH', '', '', '', '', '', '', '', '', 'Results may vary disclaimer'),
  row('Most Men 60s v2', 'TRUE', { text: 'final file', link: 'https://drive.google.com/file/d/1r86QIW0FMqN5SriDX5PmANZ_mLs86pUv/view' }, '', 'PM1MM13H'),
  row('No link yet 30s', 'FALSE', '', '', ''),
  row(''),
];

test('a tab becomes rows with markets', () => {
  const rows = parseTab(faceCream);
  assert.strictEqual(rows.length, 3, 'rows without a link are skipped');
  assert.deepStrictEqual(rows[0].markets.map(m => [m.market, m.on_air, m.code]), [['US', true, 'PM1MMH'], ['CA', false, 'PM1MMCAH'], ['AUS', false, 'AUSSIE25']]);
  assert.strictEqual(rows[0].markets[0].vanity, 'particlemen.com');
  assert.strictEqual(rows[0].markets[0].landing_url, 'https://www.particleformen.com/lpage/particle-face-cream-el-tv/');
  assert.strictEqual(rows[1].notes, 'Results may vary disclaimer');
  assert.strictEqual(rows[2].markets[0].link, 'https://drive.google.com/file/d/1r86QIW0FMqN5SriDX5PmANZ_mLs86pUv/view', 'a real hyperlink beats the cell text');
});

test('the same name twice stays two commercials, and keys are stable', () => {
  const tabs = [{ title: 'Face Cream', cells: faceCream }, { title: 'All Products', cells: [row('NAME', 'US', 'LINK', 'URL', 'CREATIVE CODE', 'NOTES'), row('Black Friday Sale 30s (BEST)', 'FALSE', 'https://www.dropbox.com/scl/fi/vdd/Black-Friday-Ad_HQ.mov?rlkey=z6', 'particlesale.com - https://www.particleformen.com/?utm_source=best30', 'PS3BFSALEH')] }];
  const a = sheetEntries('SHEET', tabs);
  const b = sheetEntries('SHEET', tabs);
  assert.strictEqual(a.length, 6);
  assert.deepStrictEqual(a.map(e => e.source_key), b.map(e => e.source_key));
  assert.strictEqual(new Set(a.map(e => e.source_key)).size, 6);
  const mm = a.filter(e => e.title === 'Most Men 60s');
  assert.strictEqual(new Set(mm.map(e => e.specs.group)).size, 2);
  assert.strictEqual(mm[0].specs.duration, 60);
  assert.strictEqual(a.find(e => e.tab === 'All Products').product, null);
  assert.ok(!a[0].url.includes('dl=0'), 'Dropbox links are cleaned');
});

test('links and ids', () => {
  assert.deepStrictEqual(parseLanding('trygravite.ca - https://www.particleformen.com/lpage/x/'), { vanity: 'trygravite.ca', url: 'https://www.particleformen.com/lpage/x/' });
  assert.deepStrictEqual(parseLanding('https://www.particleformen.com/lpage/y/'), { vanity: null, url: 'https://www.particleformen.com/lpage/y/' });
  assert.strictEqual(sheetIdOf('https://docs.google.com/spreadsheets/d/1OBtG4TVAGNY5j5oaKDDZDBhxL3Nkqia0jYaSAAI26BM/edit?usp=sharing'), '1OBtG4TVAGNY5j5oaKDDZDBhxL3Nkqia0jYaSAAI26BM');
  assert.strictEqual(sheetIdOf('not a sheet'), null);
});

test('a row joins a production only by a clear name and the right time', () => {
  const prods = [
    { id: 'PRD26-74', name: 'Black Friday 2026', product_type: [], planned_start: '2026-10-01', planned_end: '2026-11-30' },
    { id: 'PRD26-20', name: 'The Hunt', product_type: ['Face Cream'], planned_start: '2026-09-01', planned_end: '2026-10-30' },
  ];
  const e = (title, product = null) => ({ title, product });
  assert.strictEqual(matchProduction(e('Black Friday Sale 30s (BEST)'), prods, '2025-11-10T00:00:00Z'), null, 'last year’s Black Friday');
  assert.strictEqual(matchProduction(e('Black Friday 2026 30s'), prods, '2026-11-02T00:00:00Z'), 'PRD26-74');
  assert.strictEqual(matchProduction(e('The Hunt 30s', 'Face Cream'), prods, '2026-10-20T00:00:00Z'), 'PRD26-20');
  assert.strictEqual(matchProduction(e('The Hunt 30s', 'Face Cream'), prods, null), null, 'no file date → Before 2026');
  assert.strictEqual(matchProduction(e('Most Men 60s', 'Face Cream'), prods, '2026-10-20T00:00:00Z'), null);
});
