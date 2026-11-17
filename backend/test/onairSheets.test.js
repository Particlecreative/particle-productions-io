// On Air · TV — the agency's Excel files (RBD = every airing, Future = this week's plan). Made-up rows; real layouts.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const X = require('../src/lib/onair/xlsx');
const S = require('../src/lib/onair/sheets');

/** A minimal .xlsx: a zip (deflated entries) with shared strings and one sheet. */
function xlsx(rows) {
  const strings = [];
  const si = (s) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const col = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v == null ? '' : typeof v === 'number'
    ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(String(v))}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const shared = `<?xml version="1.0"?><sst>${strings.map(s => `<si><t>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`;
  const files = [['xl/sharedStrings.xml', shared], ['xl/worksheets/sheet1.xml', sheet]];
  const locals = [], centrals = [];
  let off = 0;
  for (const [name, text] of files) {
    const raw = Buffer.from(text), data = zlib.deflateRawSync(raw), nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm);
    off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const serial = (ymd) => Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);

test('xlsx: shared strings, numbers, gaps and dates', () => {
  const rows = X.readSheet(xlsx([['Name', 'Value', null, 'Date'], ['Alpha', 12.5, null, serial('2026-11-16')], ['B&C', 3]]));
  assert.deepEqual(rows[0], ['Name', 'Value', null, 'Date']);
  assert.equal(rows[1][1], 12.5);
  assert.equal(X.excelDate(rows[1][3]), '2026-11-16');
  assert.equal(rows[2][0], 'B&C');
  assert.equal(X.excelDate('11/16/2026'), '2026-11-16');
});

test('RBD: one airing per row, time of day in minutes', () => {
  const head = ['Product', 'Week', 'Day', 'Date', 'Time Aired', 'Station Code', 'Station', 'Market', 'Length', 'Creative Aired', 'Creative Name', 'Promo Code', 'Cleared Spots', 'Spend', 'Web Order', 'Ttl Rev', 'MER', 'CPO', 'AOV'];
  const rows = X.readSheet(xlsx([head,
    ['Face Cream', serial('2026-11-09'), 'Monday', serial('2026-11-09'), '10:42P', 'FNC', 'FOX NEWS', 'National Cable', 60, 'pm1demoh', 'Demo :60', 'TV2', 1, 500, 3, 240, 0.48, 166.67, 80],
    ['Face Cream', serial('2026-11-09'), 'Monday', serial('2026-11-09'), '6:05A', 'WPHL', 'WPHL', 'Philadelphia', 60, 'PM3DEMOH', 'Demo :30', 'TV9', 1, 100, 0, 0, 0, 0, 0],
    ['Total', null, null, null, null, null, null, null, null, null, null, null, 2, 600, 3, 240],
  ]));
  const a = S.parseRbd(rows);
  assert.equal(a.length, 2);
  assert.deepEqual({ date: a[0].date, minute: a[0].minute, code: a[0].code, station: a[0].station, spend: a[0].spend, orders: a[0].orders, revenue: a[0].revenue },
    { date: '2026-11-09', minute: 22 * 60 + 42, code: 'PM1DEMOH', station: 'FOX NEWS', spend: 500, orders: 3, revenue: 240 });
  assert.equal(a[1].minute, 6 * 60 + 5);
  assert.equal(S.minuteOf('12:00A'), 0);
  assert.equal(S.minuteOf('12:30P'), 12 * 60 + 30);
});

test('Future: booked lines with the creatives rotating on each; totals skipped', () => {
  const head = ['Week', 'Product', 'Market', 'Station', 'Station Name', 'Length', 'Days', 'Times', 'Ord Spots', 'Ord. Buy Rate', 'Ordered Cost', null, 'Most Men', 'The Hunt'];
  const rows = X.readSheet(xlsx([head,
    [serial('2026-11-16'), 'Face Cream', 'National Cable', 'FNC', 'FOX NEWS', 60, 'MTWTFSaSu', '5A-6A', 7, 300, 2100, null, 'TV2', 'TV9'],
    [null, null, null, null, 'FOX NEWS Total', null, null, null, 7, null, 2100],
    [serial('2026-11-16'), 'Face Cream', 'Philadelphia', 'WPHL', 'WPHL', 60, '-----Sa--', '9P-10P', 2, 150, 300, null, null, 'PHIL1'],
    [serial('2026-11-16'), 'Face Cream', 'National OTT', 'OTT', 'OTT NEWS', 30, 'MTWTF----', '6A-9A', 10, 20, 200],
    ['11/16/2026 Total', null, null, null, null, null, null, null, 19, null, 2600],
  ]));
  const p = S.parseFuture(rows);
  assert.equal(p.week, '2026-11-16');
  assert.equal(p.lines.length, 3);
  assert.deepEqual(p.lines[0].creatives, [{ name: 'Most Men', promo: 'TV2' }, { name: 'The Hunt', promo: 'TV9' }]);
  assert.deepEqual(p.lines[1].creatives.map(c => c.name), ['The Hunt']);
  assert.equal(p.lines[2].creatives.length, 0);
  assert.equal(p.lines.reduce((a, l) => a + l.cost, 0), 2600);
});

test('Day / Week / Month ranges: the agency week starts on Monday', () => {
  const r = S.rangesOf('2026-11-15');   // a Sunday
  assert.deepEqual(r.day, ['2026-11-15', '2026-11-15']);
  assert.deepEqual(r.week, ['2026-11-09', '2026-11-15']);
  assert.deepEqual(r.week_prev, ['2026-11-02', '2026-11-08']);
  assert.deepEqual(r.month, ['2026-11-01', '2026-11-15']);
  assert.deepEqual(r.month_prev, ['2026-10-01', '2026-10-31']);
});
