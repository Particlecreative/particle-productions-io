// financeSheet.js — one-way CP -> Google Sheet finance mirror.
// The CP is the source of truth; each production's budget line items are pushed
// into a Google Sheet that matches the finance team's template. Reused by the
// finance-sheet routes and by fire-and-forget triggers on budget mutations.

const { google } = require('googleapis');
const db = require('../db');

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// Finance team — auto-added as editors on every new mirror sheet.
// Override in env without a code change (comma-separated).
const FINANCE_EDITORS = (process.env.FINANCE_SHEET_EDITORS ||
  'omer@particleformen.com,ortal@particleformen.com,arina@particleformen.com')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── Column layout (matches the finance team's template) ──────────────────────
const HEADERS = ['Name', 'Job', 'Budget', 'Actual Spent', 'Invoice/Receipt', 'Status', 'Payment Method', 'Bank details', 'Business type'];
const NCOLS = HEADERS.length;

// ── Auth: load the brand's Google tokens, refresh if needed, return clients ──
async function getGoogleClients(brandId) {
  const tryBrands = [brandId, 'particle'].filter((b, i, a) => b && a.indexOf(b) === i);
  let row = null, usedBrand = null;
  for (const b of tryBrands) {
    const { rows } = await db.query('SELECT google_tokens FROM settings WHERE brand_id = $1', [b]);
    if (rows[0]?.google_tokens) { row = rows[0]; usedBrand = b; break; }
  }
  if (!row) throw new Error('Google account not connected. Connect it in Settings first.');

  const tokens = typeof row.google_tokens === 'string' ? JSON.parse(row.google_tokens) : row.google_tokens;
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://particlepdio.particleface.com/api/auth/google/callback'
  );
  oauth2.setCredentials(tokens);
  // Persist refreshed tokens back to whichever brand row we loaded from
  oauth2.on('tokens', async (t) => {
    try {
      const merged = { ...tokens, ...t };
      await db.query('UPDATE settings SET google_tokens = $1 WHERE brand_id = $2', [JSON.stringify(merged), usedBrand]);
    } catch (e) { console.error('finance-sheet token persist failed:', e.message); }
  });
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      await db.query('UPDATE settings SET google_tokens = $1 WHERE brand_id = $2', [JSON.stringify({ ...tokens, ...credentials }), usedBrand]);
    } catch (e) { throw new Error('Google session expired. Reconnect the Google account in Settings.'); }
  }
  return {
    sheets: google.sheets({ version: 'v4', auth: oauth2 }),
    drive: google.drive({ version: 'v3', auth: oauth2 }),
  };
}

// ── Formatting helpers ───────────────────────────────────────────────────────
const CUR = { USD: '$', ILS: '₪', EUR: '€', GBP: '£' };
function money(amount, code) {
  if (amount === null || amount === undefined || amount === '' || isNaN(Number(amount))) return '';
  const n = Number(amount);
  const sym = CUR[code] || '$';
  return `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function stripHtml(s) { return (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function fmtDate(d) {
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

// Normalize the PAYMENT status (set in the Payments tab -> line_items.payment_status)
// to the finance template's wording. Never uses the work/progress `status` field
// (e.g. "Done" is a work status, not "paid").
function statusLabel(li) {
  const ps = (li.payment_status || '').toString().trim();
  if (/^paid$/i.test(ps)) return 'Paid';
  if (li.paid_at) return 'Paid';               // Payments tab stamps paid_at when marking paid
  if (/pending/i.test(ps)) return 'Pending';
  return 'Not Payed';
}

// ── Build the 2D value grid + a per-line invoice link map for the mirror ─────
async function buildSheetData(productionId) {
  const { rows: prodRows } = await db.query('SELECT * FROM productions WHERE id = $1', [productionId]);
  const prod = prodRows[0];
  if (!prod) throw new Error('Production not found');

  const { rows: items } = await db.query(
    'SELECT * FROM production_line_items WHERE production_id = $1 ORDER BY created_at ASC',
    [productionId]
  );
  // Invoices give us per-line-item document links when the line item itself has none
  const { rows: invoices } = await db.query('SELECT line_item_id, file_url FROM invoices WHERE production_id = $1', [productionId]);
  const invByItem = {};
  for (const inv of invoices) { if (inv.line_item_id && inv.file_url && !invByItem[inv.line_item_id]) invByItem[inv.line_item_id] = inv.file_url; }

  const brandName = prod.brand_id === 'blurr' ? 'Blurr' : 'Particle';
  const title = `${brandName} ${prod.project_name || prod.id} — Budget`;

  // Title row (col D holds the title like the template; H/I hold "Updated:" + date)
  const titleRow = new Array(NCOLS).fill('');
  titleRow[3] = title;
  titleRow[6] = 'Updated:';
  titleRow[7] = fmtDate(new Date());

  const dataRows = [];
  const links = []; // { row, col, url } for hyperlinking the Invoice/Receipt cell
  let rowIdx = 3; // 1-based sheet row where data starts (title=1, header=2, data from 3)
  for (const li of items) {
    const invoiceUrl = li.invoice_url || invByItem[li.id] || '';
    dataRows.push([
      li.full_name || li.supplier || '',
      stripHtml(li.item) || li.type || '',
      money(li.planned_budget, li.currency_code),
      money(li.actual_spent, li.currency_code),
      invoiceUrl ? 'Link' : '',
      statusLabel(li),
      li.payment_method || '',
      li.bank_details || '',
      li.business_type || li.supplier_type || '',
    ]);
    if (invoiceUrl) links.push({ row: rowIdx, col: 4, url: invoiceUrl }); // col E (0-based 4)
    rowIdx++;
  }

  // Total row (sum of planned budgets, grouped by currency symbol)
  const totalsByCur = {};
  for (const li of items) {
    if (li.planned_budget == null || isNaN(Number(li.planned_budget))) continue;
    const sym = CUR[li.currency_code] || '$';
    totalsByCur[sym] = (totalsByCur[sym] || 0) + Number(li.planned_budget);
  }
  const totalStr = Object.entries(totalsByCur)
    .map(([sym, n]) => `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join('  +  ');
  const totalRow = new Array(NCOLS).fill('');
  totalRow[0] = 'Total:';
  totalRow[2] = totalStr;

  const values = [titleRow, HEADERS.slice(), ...dataRows, totalRow];
  return { prod, values, links, dataRowCount: dataRows.length };
}

// ── Formatting requests (batchUpdate) to match the template look ─────────────
function formatRequests(sheetId, dataRowCount) {
  const headerRow = 1; // 0-based
  const totalRowIdx = 2 + dataRowCount;
  const navy = { red: 0.012, green: 0.043, blue: 0.18 };
  return [
    // Merge title across C..E (cols 2..4)
    { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' } },
    // Title style
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    // Header row: navy bg, white bold, centered
    { repeatCell: { range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1, startColumnIndex: 0, endColumnIndex: NCOLS }, cell: { userEnteredFormat: { backgroundColor: navy, horizontalAlignment: 'CENTER', textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)' } },
    // Freeze title + header rows
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } },
    // Total row bold
    { repeatCell: { range: { sheetId, startRowIndex: totalRowIdx, endRowIndex: totalRowIdx + 1, startColumnIndex: 0, endColumnIndex: NCOLS }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.93, blue: 0.96 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
    // Auto-resize columns
    { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: NCOLS } } },
  ];
}

// Hyperlink the "Link" cells to the actual invoice URLs (USER_ENTERED formula)
async function applyLinks(sheets, spreadsheetId, sheetTitle, links) {
  if (!links.length) return;
  const data = links.map(l => ({
    range: `${sheetTitle}!${colLetter(l.col)}${l.row}`,
    values: [[`=HYPERLINK("${l.url.replace(/"/g, '')}","Link")`]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}
function colLetter(idx) { return String.fromCharCode(65 + idx); }

// Grant the finance team editor access (one permission per email; never throws)
async function shareFinanceSheet(drive, spreadsheetId) {
  for (const email of FINANCE_EDITORS) {
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        sendNotificationEmail: false,
        requestBody: { type: 'user', role: 'writer', emailAddress: email },
      });
    } catch (e) {
      console.error(`finance-sheet share to ${email} failed:`, e.message);
    }
  }
}

// ── Create a brand-new mirror sheet for a production ─────────────────────────
async function createFinanceSheet(productionId) {
  const { sheets, drive } = await getGoogleClients((await db.query('SELECT brand_id FROM productions WHERE id = $1', [productionId])).rows[0]?.brand_id);
  const { prod, values, links, dataRowCount } = await buildSheetData(productionId);

  const brandName = prod.brand_id === 'blurr' ? 'Blurr' : 'Particle';
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `${prod.id} — ${brandName} ${prod.project_name || ''} — Finance` },
      sheets: [{ properties: { title: 'Budget', gridProperties: { columnCount: NCOLS, frozenRowCount: 2 } } }],
    },
  });
  const spreadsheetId = created.data.spreadsheetId;
  const url = created.data.spreadsheetUrl;
  const innerSheetId = created.data.sheets[0].properties.sheetId;

  // Write values, then formatting, then links
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: 'Budget!A1', valueInputOption: 'RAW', requestBody: { values },
  });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: formatRequests(innerSheetId, dataRowCount) } });
  await applyLinks(sheets, spreadsheetId, 'Budget', links);

  // Share with the finance team as editors (best-effort, per email)
  await shareFinanceSheet(drive, spreadsheetId);

  // Move into the shared team Drive folder if configured (so finance can see it)
  if (DRIVE_FOLDER_ID) {
    try {
      const meta = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
      const prevParents = (meta.data.parents || []).join(',');
      await drive.files.update({ fileId: spreadsheetId, addParents: DRIVE_FOLDER_ID, removeParents: prevParents, fields: 'id' });
    } catch (e) { console.error('finance-sheet folder move failed:', e.message); }
  }

  await db.query(
    "UPDATE productions SET finance_sheet_id = $1, finance_sheet_url = $2, finance_sheet_mode = 'mirror', finance_sheet_synced_at = NOW() WHERE id = $3",
    [spreadsheetId, url, productionId]
  );
  return { spreadsheetId, url };
}

// ── Push current CP data into the existing mirror sheet ──────────────────────
async function syncFinanceSheet(productionId) {
  const { rows } = await db.query('SELECT brand_id, finance_sheet_id, finance_sheet_mode FROM productions WHERE id = $1', [productionId]);
  const prod = rows[0];
  if (!prod?.finance_sheet_id) return { skipped: 'no-sheet' };
  if (prod.finance_sheet_mode === 'linked') return { skipped: 'linked-readonly' }; // never overwrite external sheets

  const { sheets } = await getGoogleClients(prod.brand_id);
  const spreadsheetId = prod.finance_sheet_id;
  const { values, links, dataRowCount } = await buildSheetData(productionId);

  // Find the target tab (prefer "Budget", else first)
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const target = meta.data.sheets.find(s => s.properties.title === 'Budget') || meta.data.sheets[0];
  const sheetTitle = target.properties.title;
  const innerSheetId = target.properties.sheetId;

  // Clear old data region then write fresh (keeps sheet id/url stable)
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetTitle}!A1:Z1000` });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${sheetTitle}!A1`, valueInputOption: 'RAW', requestBody: { values } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: formatRequests(innerSheetId, dataRowCount) } });
  await applyLinks(sheets, spreadsheetId, sheetTitle, links);

  await db.query('UPDATE productions SET finance_sheet_synced_at = NOW() WHERE id = $1', [productionId]);
  return { synced: true, rows: dataRowCount };
}

// ── Read a linked external sheet and diff it against CP line items ───────────
async function findMismatches(productionId) {
  const { rows } = await db.query('SELECT brand_id, finance_sheet_id FROM productions WHERE id = $1', [productionId]);
  const prod = rows[0];
  if (!prod?.finance_sheet_id) throw new Error('No sheet linked to this production.');
  const { sheets } = await getGoogleClients(prod.brand_id);

  const meta = await sheets.spreadsheets.get({ spreadsheetId: prod.finance_sheet_id, fields: 'sheets.properties' });
  const first = meta.data.sheets[0].properties.title;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: prod.finance_sheet_id, range: `${first}!A1:Z2000` });
  const grid = resp.data.values || [];

  // Find the header row (contains "Name" and "Budget")
  let hIdx = grid.findIndex(r => r.map(c => (c || '').toString().toLowerCase()).includes('name'));
  if (hIdx === -1) hIdx = 1;
  const header = (grid[hIdx] || []).map(c => (c || '').toString().toLowerCase().trim());
  const col = (name) => header.findIndex(h => h.includes(name));
  const cName = col('name'), cBudget = col('budget'), cActual = header.findIndex(h => h.startsWith('actual')), cStatus = col('status');

  const sheetRows = [];
  for (let i = hIdx + 1; i < grid.length; i++) {
    const r = grid[i]; if (!r) continue;
    const name = (r[cName] || '').toString().trim();
    if (!name || /^total/i.test(name)) continue;
    sheetRows.push({
      name,
      budget: parseMoney(r[cBudget]),
      actual: cActual >= 0 ? parseMoney(r[cActual]) : null,
      status: (r[cStatus] || '').toString().trim(),
    });
  }

  const { rows: items } = await db.query('SELECT * FROM production_line_items WHERE production_id = $1 ORDER BY created_at', [productionId]);
  const cpRows = items.map(li => ({
    name: (li.full_name || li.supplier || '').trim(),
    budget: li.planned_budget != null ? Number(li.planned_budget) : null,
    actual: li.actual_spent != null ? Number(li.actual_spent) : null,
    status: statusLabel(li),
  }));

  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const cpByName = new Map(cpRows.map(r => [norm(r.name), r]));
  const sheetByName = new Map(sheetRows.map(r => [norm(r.name), r]));

  const diffs = [];
  for (const s of sheetRows) {
    const cp = cpByName.get(norm(s.name));
    if (!cp) { diffs.push({ type: 'only_in_sheet', name: s.name, sheet: s }); continue; }
    const fieldDiffs = [];
    if (s.budget != null && cp.budget != null && Math.abs(s.budget - cp.budget) > 0.5) fieldDiffs.push({ field: 'Budget', sheet: s.budget, cp: cp.budget });
    if (s.actual != null && cp.actual != null && Math.abs(s.actual - cp.actual) > 0.5) fieldDiffs.push({ field: 'Actual', sheet: s.actual, cp: cp.actual });
    if (s.status && cp.status && norm(s.status) !== norm(cp.status)) fieldDiffs.push({ field: 'Status', sheet: s.status, cp: cp.status });
    if (fieldDiffs.length) diffs.push({ type: 'changed', name: s.name, fields: fieldDiffs });
  }
  for (const cp of cpRows) {
    if (!sheetByName.has(norm(cp.name)) && cp.name) diffs.push({ type: 'only_in_cp', name: cp.name, cp });
  }
  return { diffs, sheetRowCount: sheetRows.length, cpRowCount: cpRows.length };
}
function parseMoney(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v.toString().replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ── Fire-and-forget debounced trigger (used by budget mutations) ─────────────
const _pending = new Map(); // productionId -> timeout
function triggerFinanceSync(productionId, delayMs = 2500) {
  if (!productionId) return;
  if (_pending.has(productionId)) clearTimeout(_pending.get(productionId));
  _pending.set(productionId, setTimeout(async () => {
    _pending.delete(productionId);
    try { await syncFinanceSheet(productionId); }
    catch (e) { console.error(`finance-sheet auto-sync failed for ${productionId}:`, e.message); }
  }, delayMs));
}

module.exports = {
  getGoogleClients, buildSheetData, createFinanceSheet, syncFinanceSheet,
  findMismatches, triggerFinanceSync, extractSheetId, shareFinanceSheet,
};

// Parse a spreadsheet id out of a full URL or accept a bare id
function extractSheetId(input) {
  if (!input) return null;
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}
