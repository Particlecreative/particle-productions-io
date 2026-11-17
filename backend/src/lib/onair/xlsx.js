/**
 * A small .xlsx reader — no dependency (18 Nov 2026). An .xlsx is a zip of XML files: this reads the zip's central
 * directory, inflates the first worksheet and the shared strings with Node's zlib, and returns the sheet as rows of
 * values (strings / numbers / booleans, empty cells as null). Enough for the media agency's Future and RBD sheets.
 * Dates come back as Excel serial numbers — excelDate() turns one into "YYYY-MM-DD".
 */
const zlib = require('zlib');

/** zip buffer → Map(name → { method, offset, csize, size }) */
function entries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not an .xlsx (no zip directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Broken zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.set(name, { method, offset, csize, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function readEntry(buf, e) {
  if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error('Broken zip entry');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.csize);
  if (e.method === 0) return data.toString('utf8');
  if (e.method === 8) return zlib.inflateRawSync(data).toString('utf8');
  throw new Error(`Unsupported zip compression (${e.method})`);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
const textOf = (xml) => { let t = ''; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; let m; while ((m = re.exec(xml))) t += m[1]; return decode(t); };

/** "AB" → 27 (0-based column index) */
function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** The first worksheet as rows of values. */
function readSheet(buf) {
  const zip = entries(buf);
  const shared = [];
  if (zip.has('xl/sharedStrings.xml')) {
    const xml = readEntry(buf, zip.get('xl/sharedStrings.xml'));
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) shared.push(textOf(m[1]));
  }
  const sheetName = [...zip.keys()].filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))[0];
  if (!sheetName) throw new Error('The workbook has no worksheet');
  const xml = readEntry(buf, zip.get(sheetName));
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const row = [];
    const body = rm[1] || '';
    let cm;
    cellRe.lastIndex = 0;
    while ((cm = cellRe.exec(body))) {
      const attrs = cm[1] || '', inner = cm[2] || '';
      const ref = (/\br="([A-Z]+)\d*"/.exec(attrs) || [])[1];
      const idx = ref ? colIndex(ref) : row.length;
      const t = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
      const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let val = null;
      if (t === 's') val = v != null ? shared[Number(v)] ?? null : null;
      else if (t === 'inlineStr') val = textOf(inner);
      else if (t === 'str' || t === 'e') val = v != null ? decode(v) : null;
      else if (t === 'b') val = v === '1';
      else if (v != null && v !== '') { const n = Number(v); val = Number.isFinite(n) ? n : decode(v); }
      while (row.length < idx) row.push(null);
      row[idx] = val;
    }
    rows.push(row);
  }
  return rows;
}

/** Excel serial (or a "11/16/2026" / "2026-11-16" string) → "YYYY-MM-DD" | null */
function excelDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  return null;
}

module.exports = { readSheet, excelDate, entries };
