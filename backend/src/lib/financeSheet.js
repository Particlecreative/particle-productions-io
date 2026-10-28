// financeSheet.js — Google auth for the finance sheets, sharing, and the old-format ("linked") sheet comparison.
// The two-way sheet itself (push, pull, Summary / Change log tabs) lives in finance/sheet.js.

const { google } = require('googleapis');
const db = require('../db');

// Finance team — auto-added as editors on every new mirror sheet.
// Override in env without a code change (comma-separated).
const FINANCE_EDITORS = (process.env.FINANCE_SHEET_EDITORS ||
  'omer@particleformen.com,ortal@particleformen.com,arina@particleformen.com')
  .split(',').map(s => s.trim()).filter(Boolean);


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

// ── Create / sync: the two-way sheet lives in finance/sheet.js (kept here so existing callers don't change) ──
function createFinanceSheet(productionId) { return require('./finance/sheet').create(productionId); }
function syncFinanceSheet(productionId) { return require('./finance/sheet').sync(productionId); }

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
    id: li.id,
    name: (li.full_name || li.supplier || '').trim(),
    budget: li.planned_budget != null ? Number(li.planned_budget) : null,
    actual: li.actual_spent != null ? Number(li.actual_spent) : null,
    status: statusLabel(li),
  }));

  // Greedy fuzzy match: names match across spelling variants, diacritics,
  // and Hebrew<->English transliteration — not literal string equality.
  const MATCH_THRESHOLD = 0.82;
  const usedCp = new Set();
  const diffs = [];
  for (const s of sheetRows) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < cpRows.length; i++) {
      if (usedCp.has(i) || !cpRows[i].name) continue;
      const sc = nameScore(s.name, cpRows[i].name);
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best >= 0 && bestScore >= MATCH_THRESHOLD) {
      usedCp.add(best);
      const cp = cpRows[best];
      const fieldDiffs = [];
      if (s.budget != null && cp.budget != null && Math.abs(s.budget - cp.budget) > 0.5) fieldDiffs.push({ field: 'Budget', sheet: s.budget, cp: cp.budget });
      if (s.actual != null && cp.actual != null && Math.abs(s.actual - cp.actual) > 0.5) fieldDiffs.push({ field: 'Actual', sheet: s.actual, cp: cp.actual });
      if (s.status && cp.status && normStatus(s.status) !== normStatus(cp.status)) fieldDiffs.push({ field: 'Status', sheet: s.status, cp: cp.status });
      // Note the spelling variant itself if the names weren't identical
      if (normName(s.name) !== normName(cp.name)) fieldDiffs.push({ field: 'Name spelling', sheet: s.name, cp: cp.name });
      if (fieldDiffs.length) diffs.push({ type: 'changed', name: cp.name, line_id: cp.id, fields: fieldDiffs });
    } else {
      diffs.push({ type: 'only_in_sheet', name: s.name });
    }
  }
  for (let i = 0; i < cpRows.length; i++) {
    if (!usedCp.has(i) && cpRows[i].name) diffs.push({ type: 'only_in_cp', name: cpRows[i].name, line_id: cpRows[i].id });
  }
  return { diffs, sheetRowCount: sheetRows.length, cpRowCount: cpRows.length };
}
function parseMoney(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v.toString().replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ── Fuzzy name matching (transliteration + spelling variants) ────────────────
const HEBREW_TRANSLIT = {
  'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'o','ז':'z','ח':'h','ט':'t','י':'i',
  'כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s','ע':'a','פ':'f','ף':'f',
  'צ':'ts','ץ':'ts','ק':'k','ר':'r','ש':'sh','ת':'t',
};
function translitHebrew(s) {
  // Strip niqqud/marks, map letters phonetically to Latin
  return s.replace(/[֑-ׇ]/g, '').replace(/[א-ת]/g, ch => (HEBREW_TRANSLIT[ch] ?? ''));
}
function normName(s) {
  let x = translitHebrew((s || '').toString());
  x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');   // strip Latin diacritics
  return x.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
function looseToken(t) {
  // Drop vowels + h and collapse doubled letters → "assaf"/"asaf" both become "sf"
  let out = '';
  for (const ch of t) { if (VOWELS.has(ch) || ch === 'h') continue; if (out[out.length - 1] !== ch) out += ch; }
  return out || t;
}
function looseKey(s) {
  return normName(s).split(' ').filter(Boolean).map(looseToken).sort().join(' ');
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}
function nameScore(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (looseKey(a) === looseKey(b)) return 0.95; // spelling/transliteration variants
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}
function normStatus(s) {
  const x = normName(s);
  if (/pending/.test(x)) return 'pending';
  if (/not|unpaid/.test(x)) return 'notpaid';       // "not paid" / "not payed"
  if (/paid|payed/.test(x)) return 'paid';
  return x;
}

// ── Fire-and-forget debounced trigger (used by budget mutations) ─────────────
function triggerFinanceSync(productionId, delayMs = 2500) { require('./finance/sheet').trigger(productionId, delayMs); }

module.exports = {
  getGoogleClients, createFinanceSheet, syncFinanceSheet,
  findMismatches, triggerFinanceSync, extractSheetId, shareFinanceSheet, nameScore,
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
