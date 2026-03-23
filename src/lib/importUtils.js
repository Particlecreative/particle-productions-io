/**
 * importUtils.js — CSV / Excel import helpers
 *
 * parseFile(file) → Promise<{ headers: string[], rows: object[], raw: any[][] }>
 * applyMapping(rows, mapping) → mappedRows (array of plain objects using target keys)
 */

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    return parseCSV(await file.text());
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return parseXLSX(file);
  }
  throw new Error(`Unsupported file type: .${ext}`);
}

async function parseCSV(text) {
  // Strip BOM
  const content = text.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], raw: [] };

  const raw = lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  });

  const headers = raw[0];
  const rows = raw.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  return { headers, rows, raw };
}

async function parseXLSX(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!raw.length) return { headers: [], rows: [], raw: [] };

  const headers = raw[0].map(String);
  const rows = raw.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });

  return { headers, rows, raw };
}

/**
 * Apply column mapping to parsed rows.
 * mapping: { [fileHeader]: targetKey | '' (skip) }
 * Returns array of objects with target keys.
 */
export function applyMapping(rows, mapping) {
  return rows.map(row => {
    const out = {};
    Object.entries(mapping).forEach(([fileHeader, targetKey]) => {
      if (targetKey && targetKey !== '__skip__') {
        out[targetKey] = row[fileHeader] ?? '';
      }
    });
    return out;
  }).filter(row => Object.values(row).some(v => v !== ''));
}
