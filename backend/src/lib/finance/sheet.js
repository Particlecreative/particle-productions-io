/**
 * The finance Google Sheet — two-way.
 *
 * CP pushes every production's budget into its sheet (Budget tab + Summary + Change log), and reads it back:
 * before every push, and every few minutes. A hidden "cp-id" column ties each row to its CP line, and
 * finance_sheet_rows remembers what CP last wrote, so CP can tell which side changed what:
 *   - payment fields (Status, Actual, Invoice, Payment method, Bank, Business type): an edit in the sheet wins
 *   - budget fields (Name, Job, Budget): CP wins when both changed; a sheet edit to an approved or closed budget
 *     is put back and Omer is told (the budget only moves in CP, with a reason)
 *   - a new row typed in the sheet becomes a CP line; a deleted row is never deleted in CP (it comes back)
 * Columns finance adds to the right of the CP columns are kept, moving with their row.
 */
const db = require('../../db');
const B = require('./budget');
const E = require('./events');
const fx = require('./fx');
const T = require('./totals');
const { companyOf, companyLine } = require('./company');
const legacy = require('../financeSheet');

const HEADERS = ['Name', 'Job', 'Budget', 'Actual Spent', 'Invoice/Receipt', 'Status', 'Payment Method', 'Bank details', 'Business type', 'cp-id'];
const FIELDS = ['name', 'job', 'budget', 'actual', 'invoice', 'status', 'method', 'bank', 'business'];
const NCP = HEADERS.length;        // A..J belong to CP
const MAX_COL = 26;                // A..Z read; K..Z are finance's own columns
const PAYMENT = new Set(['actual', 'invoice', 'status', 'method', 'bank', 'business']);
const BUDGET = new Set(['name', 'job', 'budget']);
const STATUS_FILL = {
  Paid: { red: 0.85, green: 0.94, blue: 0.85 },
  'Not Paid': { red: 0.99, green: 0.89, blue: 0.89 },
  Pending: { red: 1.0, green: 0.96, blue: 0.83 },
};
const WHITE = { red: 1, green: 1, blue: 1 };
const FOOTER = 'cp-total';                                         // cp-id of CP's total rows
const FOOTER_RE = /^(total\b|total:|approved planned budget|planned budget \(usd)/i;
const NAVY = { red: 0.012, green: 0.043, blue: 0.18 };
const G = { timeout: 30000 };   // every Google call: a hung request must fail, not block the sync forever

const strip = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const colLetter = (i) => String.fromCharCode(65 + i);
const round2 = (n) => Math.round(n * 100) / 100;

function canonStatus(s) {
  const x = String(s || '').toLowerCase();
  if (/pend/.test(x)) return 'Pending';
  if (/not|unpaid/.test(x)) return 'Not Paid';
  if (/paid|payed/.test(x)) return 'Paid';
  return x ? 'Not Paid' : '';
}
function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return round2(v);
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? round2(n) : null;
}
function parseInvoice(v) {
  const s = String(v ?? '').trim();
  const m = /HYPERLINK\(\s*"([^"]+)"/i.exec(s);
  if (m) return m[1];
  return /^https?:\/\//i.test(s) ? s : '';
}

/** What CP writes for a line (also the snapshot it remembers). */
function sheetValuesOf(li, invoiceByLine = {}) {
  const st = /^paid$/i.test(li.payment_status || '') ? 'Paid' : /pending/i.test(li.payment_status || '') ? 'Pending' : 'Not Paid';
  return {
    name: String(li.full_name || li.supplier || '').trim(),
    job: strip(li.item) || li.type || '',
    budget: round2(B.num(li.planned_budget)),
    actual: round2(B.num(li.actual_spent)),
    invoice: li.invoice_url || invoiceByLine[li.id] || '',
    status: st,
    method: li.payment_method || '',
    bank: li.bank_details || '',
    business: li.business_type || li.supplier_type || '',
  };
}
function same(field, a, b) {
  if (field === 'budget' || field === 'actual') return round2(B.num(a)) === round2(B.num(b));
  if (field === 'status') return canonStatus(a) === canonStatus(b);
  return String(a ?? '').trim() === String(b ?? '').trim();
}
// ── locking: one sync per production at a time ──
const running = new Map();
function exclusive(productionId, fn) {
  const prev = running.get(productionId) || Promise.resolve();
  const next = prev.then(fn);
  const tail = next.catch(() => {});   // the chain never rejects (callers handle `next`)
  running.set(productionId, tail);
  tail.then(() => { if (running.get(productionId) === tail) running.delete(productionId); });
  return next;
}

async function clientsFor(brandId) { return legacy.getGoogleClients(brandId); }

async function tabs(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties,protectedRanges)' }, G);
  const list = meta.data.sheets || [];
  const budget = list.find(s => s.properties.title === 'Budget') || list[0];
  return { list, budget };
}

/** Read the Budget tab → { header, idx, rows: [{ rowNum, id, values, extras, raw }], extrasHead } */
async function readGrid(sheets, spreadsheetId, title) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title}'!A1:Z2000`, valueRenderOption: 'FORMULA' }, G);
  const grid = resp.data.values || [];
  let h = grid.findIndex(r => (r || []).some(c => String(c).trim().toLowerCase() === 'name') && (r || []).some(c => /budget/i.test(String(c))));
  if (h < 0) return { header: null, rows: [], grid };
  const head = grid[h].map(c => String(c || '').trim().toLowerCase());
  const find = (pred) => head.findIndex(pred);
  const idx = {
    name: find(c => c === 'name'), job: find(c => c === 'job'), budget: find(c => c === 'budget'),
    actual: find(c => c.startsWith('actual')), invoice: find(c => c.startsWith('invoice')), status: find(c => c === 'status'),
    method: find(c => c.startsWith('payment method')), bank: find(c => c.startsWith('bank')), business: find(c => c.startsWith('business')),
    id: find(c => c === 'cp-id'),
  };
  const rows = [];
  for (let i = h + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    const name = String(r[idx.name] ?? '').trim();
    const id = idx.id >= 0 ? String(r[idx.id] ?? '').trim() : '';
    if (id === FOOTER || (!id && (FOOTER_RE.test(name) || FOOTER_RE.test(String(r[0] ?? ''))))) continue;   // CP's totals, never a line
    const has = FIELDS.some(f => idx[f] >= 0 && String(r[idx[f]] ?? '').trim() !== '');
    if (!has && !id) continue;
    const values = {
      name, job: String(r[idx.job] ?? '').trim(),
      budget: parseNum(r[idx.budget]), actual: parseNum(r[idx.actual]),
      invoice: idx.invoice >= 0 ? parseInvoice(r[idx.invoice]) : '',
      status: idx.status >= 0 ? canonStatus(r[idx.status]) : '',
      method: String(r[idx.method] ?? '').trim(), bank: String(r[idx.bank] ?? '').trim(), business: String(r[idx.business] ?? '').trim(),
    };
    rows.push({ rowNum: i + 1, id, values, extras: r.slice(NCP, MAX_COL) });
  }
  return { header: h, idx, rows, grid, extrasHead: (grid[h] || []).slice(NCP, MAX_COL), extrasTitle: (grid[0] || []).slice(NCP, MAX_COL) };
}

/**
 * Read the sheet and bring finance's edits into CP. Returns { applied, conflicts, created, skipped }.
 */
async function pull(productionId, { force = false } = {}) {
  const { rows: pr } = await db.query('SELECT * FROM productions WHERE id = $1', [productionId]);
  const prod = pr[0];
  if (!prod?.finance_sheet_id || prod.finance_sheet_mode !== 'mirror') return { skipped: 'no-mirror' };
  const { sheets, drive } = await clientsFor(prod.brand_id);
  const file = await drive.files.get({ fileId: prod.finance_sheet_id, fields: 'modifiedTime,trashed,lastModifyingUser(displayName,emailAddress)' }, G);
  if (file.data.trashed) return { skipped: 'trashed' };
  const modified = file.data.modifiedTime;
  if (!force && prod.finance_sheet_seen_modified && new Date(modified) <= new Date(prod.finance_sheet_seen_modified) && prod.finance_sheet_synced_at) {
    // Unchanged since our last write — unless that write never finished (no snapshot yet while there are lines)
    const { rows: st } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM finance_sheet_rows WHERE production_id = $1) AS snap, EXISTS (SELECT 1 FROM production_line_items WHERE production_id = $1) AS lines`, [productionId]);
    if (st[0].snap || !st[0].lines) return { skipped: 'unchanged' };
  }
  const editor = file.data.lastModifyingUser || {};
  const editorName = editor.displayName || editor.emailAddress || 'finance sheet';

  const { budget } = await tabs(sheets, prod.finance_sheet_id);
  const g = await readGrid(sheets, prod.finance_sheet_id, budget.properties.title);
  const lines = await T.loadLines(db, productionId);
  const byId = new Map(lines.map(l => [l.id, l]));
  const { rows: snapRows } = await db.query('SELECT line_item_id, sheet_values FROM finance_sheet_rows WHERE production_id = $1', [productionId]);
  const snap = new Map(snapRows.map(s => [s.line_item_id, s.sheet_values]));
  const { rows: inv } = await db.query('SELECT line_item_id, file_url FROM invoices WHERE production_id = $1 AND file_url IS NOT NULL', [productionId]);
  const invoiceByLine = {}; for (const i of inv) if (i.line_item_id && !invoiceByLine[i.line_item_id]) invoiceByLine[i.line_item_id] = i.file_url;

  // A sheet from before the cp-id column: adopt it by matching names (CP wrote these values, so differences are edits)
  let rows = g.rows;
  if (g.idx && g.idx.id < 0) {
    const used = new Set();
    rows = rows.map(r => {
      let best = null, score = 0;
      for (const l of lines) {
        if (used.has(l.id)) continue;
        const s = legacy.nameScore(r.values.name, sheetValuesOf(l).name);
        if (s > score) { score = s; best = l; }
      }
      if (best && score >= 0.82) { used.add(best.id); return { ...r, id: best.id, adopted: true }; }
      return { ...r, id: '' };
    });
  }

  const updates = new Map(); // line id → values
  const creates = [];
  const logs = [];
  const notifyOmer = [];
  const seenIds = new Set();
  const approved = B.isApproved(prod), locked = !!prod.locked;
  // Does the sheet need rewriting? Only if it differs from what CP last wrote, or CP changed since (Drive's
  // modified time lags, so CP's own write looks like an edit — comparing content stops needless rewrites)
  let differs = (g.idx && g.idx.id < 0) || (!snap.size && lines.length > 0);
  for (const r of rows) {
    if (r.id && byId.has(r.id)) {
      seenIds.add(r.id);
      const li = byId.get(r.id);
      const cpNow = sheetValuesOf(li, invoiceByLine);
      const last = snap.get(r.id) || cpNow;
      if (!snap.has(r.id) || FIELDS.some(f => !same(f, r.values[f] ?? '', last[f]) || !same(f, cpNow[f], last[f]))) differs = true;
      const vals = {};
      for (const f of FIELDS) {
        const sv = r.values[f];
        if (f === 'invoice' && !sv) continue;            // clearing a link in the sheet never removes the invoice
        if ((f === 'budget' || f === 'actual') && sv == null) continue;
        if (same(f, sv, last[f])) continue;              // the sheet didn't change this
        const cpChanged = !same(f, cpNow[f], last[f]);
        if (same(f, sv, cpNow[f])) continue;             // both sides already agree
        if (PAYMENT.has(f)) {
          if (cpChanged) logs.push({ kind: 'sync_conflict', line: li, field: f, sheet: sv, cp: cpNow[f], winner: 'sheet' });
          Object.assign(vals, toCp(f, sv));
          logs.push({ kind: 'sheet_edit', line: li, field: f, old: cpNow[f], value: sv });
        } else if (BUDGET.has(f)) {
          if (cpChanged) { logs.push({ kind: 'sync_conflict', line: li, field: f, sheet: sv, cp: cpNow[f], winner: 'cp' }); notifyOmer.push(`${strip(li.item) || li.full_name}: ${f} — sheet “${sv}”, CP “${cpNow[f]}” (kept CP)`); continue; }
          if (approved || locked) { logs.push({ kind: 'sync_conflict', line: li, field: f, sheet: sv, cp: cpNow[f], winner: 'cp', why: locked ? 'closed' : 'approved' }); notifyOmer.push(`${strip(li.item) || li.full_name}: ${f} changed in the sheet to “${sv}” — the budget is ${locked ? 'closed' : 'approved'}, so CP kept “${cpNow[f]}”. Change it in CP with a reason if it's right.`); continue; }
          Object.assign(vals, toCp(f, sv));
          logs.push({ kind: 'sheet_edit', line: li, field: f, old: cpNow[f], value: sv });
        }
      }
      if (Object.keys(vals).length) updates.set(r.id, vals);
    } else if (!r.id && r.values.name) {
      differs = true;
      if (locked) { notifyOmer.push(`A new row “${r.values.name}” was added in the sheet, but the production is closed — not added to CP.`); continue; }
      if (approved && B.num(r.values.budget) > 0) { notifyOmer.push(`A new row “${r.values.name}” (${r.values.budget}) was added in the sheet — the budget is approved, so add it in CP with a reason.`); continue; }
      creates.push(r);
    }
  }
  for (const id of snap.keys()) {
    if (byId.has(id) && !seenIds.has(id) && g.idx?.id >= 0) logs.push({ kind: 'sheet_row_deleted', line: byId.get(id) });
  }
  if (lines.some(l => !seenIds.has(l.id))) differs = true;   // a CP line missing from the sheet

  const fin = require('./service');
  const actor = { system: true, name: `${editorName} (finance sheet)`, role: 'Admin' };
  const ops = [...[...updates.entries()].map(([id, values]) => ({ op: 'update', id, values })),
    ...creates.map(r => ({ op: 'create', values: { full_name: r.values.name, item: r.values.job, planned_budget: r.values.budget || 0, actual_spent: r.values.actual || 0, payment_status: r.values.status || 'Not Paid', payment_method: r.values.method || null, bank_details: r.values.bank || null, business_type: r.values.business || null, invoice_url: r.values.invoice || null, invoice_status: r.values.invoice ? 'Received' : null } }))];
  let applied = 0;
  const createdExtras = {};
  if (ops.length) {
    const out = await fin.changeLines({ productionId, ops, actor, source: 'sheet', allowLocked: true, decision: { reason: 'other', approved_by: null, note: `Changed in the finance sheet by ${editorName}` } });
    if (out.needs) {
      console.warn(`[finance sheet] ${productionId}: sheet edits need a decision (${out.needs.code}) — left for CP`);
      notifyOmer.push(`Edits from the finance sheet couldn't be applied automatically (${out.needs.code}). Please check ${productionId}.`);
    } else {
      applied = ops.length;
      // New rows: write their cp-id into the sheet right away, so a later read never creates them twice
      const created = out.rows.slice(updates.size);
      const idWrites = [];
      creates.forEach((r, i) => {
        const id = created[i]?.id;
        if (!id) return;
        createdExtras[id] = r.extras;
        if (g.idx?.id >= 0) idWrites.push({ range: `'${budget.properties.title}'!${colLetter(g.idx.id)}${r.rowNum}`, values: [[id]] });
      });
      if (idWrites.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: prod.finance_sheet_id, requestBody: { valueInputOption: 'RAW', data: idWrites } }, G);
    }
  }
  const base = { brand_id: prod.brand_id, production_id: productionId, user_name: editorName, source: 'sheet' };
  await E.record(db, logs.filter(l => l.kind !== 'sheet_edit').map(l => ({
    ...base, kind: l.kind, line_item_id: l.line?.id || null, label: strip(l.line?.item) || l.line?.full_name || null, field: l.field || null,
    // bank details never go into the log (the log is shown on the finance dashboard)
    old_value: l.kind === 'sync_conflict' && l.field !== 'bank' ? l.cp : null, new_value: l.kind === 'sync_conflict' && l.field !== 'bank' ? l.sheet : null,
    meta: l.kind === 'sync_conflict' ? { winner: l.winner, why: l.why || null } : null,
  })));
  if (notifyOmer.length) await tellOmer(productionId, prod.project_name, notifyOmer);
  // Read; the write that follows sets synced_at again — if it fails, the next pass sees a NULL and retries
  // When a rewrite is due, synced_at goes NULL until it succeeds — a failed write is retried next pass
  await db.query(differs
    ? 'UPDATE productions SET finance_sheet_seen_modified = $2, finance_sheet_synced_at = NULL WHERE id = $1'
    : 'UPDATE productions SET finance_sheet_seen_modified = $2 WHERE id = $1', [productionId, modified]);
  return { applied, created: creates.length, conflicts: logs.filter(l => l.kind === 'sync_conflict').length, createdExtras, needsPush: differs };
}

function toCp(f, v) {
  switch (f) {
    case 'name': return { full_name: v };
    case 'job': return { item: v };
    case 'budget': return { planned_budget: v };
    case 'actual': return { actual_spent: v };
    case 'invoice': return { invoice_url: v, invoice_status: 'Received' };
    case 'status': return { payment_status: v };
    case 'method': return { payment_method: v || null };
    case 'bank': return { bank_details: v || null };
    case 'business': return { business_type: v || null };
    default: return {};
  }
}

async function tellOmer(productionId, name, messages) {
  const { rows } = await db.query("SELECT id FROM users WHERE lower(email) = 'omer@particleformen.com' AND deleted_at IS NULL LIMIT 1");
  const uid = rows[0]?.id;
  if (!uid) return;
  for (const m of messages.slice(0, 10)) {
    await db.query('INSERT INTO notifications (user_id, type, message, production_id) VALUES ($1, $2, $3, $4)', [uid, 'finance_sheet', `${name}: ${m}`, productionId]).catch(() => {});
  }
}

/** Write CP's budget into the sheet (Budget + Summary + Change log). Keeps finance's own columns with their rows. */
async function push(productionId, { createdExtras = {} } = {}) {
  const { rows: pr } = await db.query('SELECT *, planned_start::text AS planned_start, planned_end::text AS planned_end FROM productions WHERE id = $1', [productionId]);
  const prod = pr[0];
  if (!prod?.finance_sheet_id) return { skipped: 'no-sheet' };
  if (prod.finance_sheet_mode !== 'mirror') return { skipped: 'linked-readonly' };
  const { sheets, drive } = await clientsFor(prod.brand_id);
  const spreadsheetId = prod.finance_sheet_id;
  const lines = await T.loadLines(db, productionId);
  const { rows: inv } = await db.query('SELECT line_item_id, file_url FROM invoices WHERE production_id = $1 AND file_url IS NOT NULL', [productionId]);
  const invoiceByLine = {}; for (const i of inv) if (i.line_item_id && !invoiceByLine[i.line_item_id]) invoiceByLine[i.line_item_id] = i.file_url;
  const t = await tabs(sheets, spreadsheetId);
  const title = t.budget.properties.title;
  const sheetId = t.budget.properties.sheetId;
  // Finance's own columns (K…Z) move with their row: read them now, keyed by cp-id
  const cur = await readGrid(sheets, spreadsheetId, title);
  const extras = { ...Object.fromEntries((cur.rows || []).filter(r => r.id).map(r => [r.id, r.extras])), ...createdExtras };
  const extrasHead = cur.extrasHead || [];
  const extrasTitle = cur.extrasTitle || [];

  const company = companyOf(prod.brand_id);
  const code = B.financeCode(prod.id);
  // CP's columns are written RAW (a bank number keeps its leading zero, "1/2" stays text);
  // invoice links and finance's own columns go in USER_ENTERED so formulas keep working
  const cpCols = (arr) => { const a = arr.slice(0, NCP); while (a.length < NCP) a.push(''); return a; };
  const titleRow = cpCols([company.short.toUpperCase(), '', '', `${company.short} — ${code} ${prod.project_name || prod.id} — Budget`, '', '', 'Updated:',
    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })]);
  const values = [titleRow, cpCols(HEADERS)];
  const formulas = [];   // { row (1-based), col (0-based), values: [...] }
  if (extrasTitle.some(v => v !== '' && v != null)) formulas.push({ row: 1, col: NCP, values: extrasTitle });
  if (extrasHead.some(v => v !== '' && v != null)) formulas.push({ row: 2, col: NCP, values: extrasHead });
  const snap = [];
  const currencies = [];
  for (const li of lines) {
    const v = sheetValuesOf(li, invoiceByLine);
    snap.push([li.id, v]);
    currencies.push(li.currency_code || 'USD');
    const rowNum = values.length + 1;
    values.push(cpCols([v.name, v.job, v.budget, v.actual, '', v.status, v.method, v.bank, v.business, li.id]));
    if (v.invoice) formulas.push({ row: rowNum, col: 4, values: [`=HYPERLINK("${v.invoice.replace(/"/g, '')}","Link")`] });
    if ((extras[li.id] || []).some(x => x !== '' && x != null)) formulas.push({ row: rowNum, col: NCP, values: extras[li.id] });
  }
  const dataCount = lines.length;
  // Totals: per currency, then one USD total with the Bank of Israel rate and date
  const rate = fx.quote();
  const byCur = {};
  for (const li of lines) {
    const c = li.currency_code || 'USD';
    byCur[c] = byCur[c] || { budget: 0, actual: 0 };
    byCur[c].budget += B.num(li.planned_budget); byCur[c].actual += B.num(li.actual_spent);
  }
  const totalRows = [];
  for (const [c, t2] of Object.entries(byCur)) totalRows.push([`Total ${c === 'ILS' ? '₪' : '$'}`, '', round2(t2.budget), round2(t2.actual), '', '', '', '', '', FOOTER]);
  const usdBudget = lines.reduce((s, li) => s + B.toUsd(li.planned_budget, li.currency_code || 'USD', rate.rate), 0);
  const usdActual = lines.reduce((s, li) => s + B.toUsd(li.actual_spent, li.currency_code || 'USD', li.paid_at ? fx.rateOn(li.paid_at) : rate.rate), 0);
  totalRows.push([`Total in USD (₪${rate.rate}/$, Bank of Israel ${rate.date || ''})`, '', round2(usdBudget), round2(usdActual), '', '', '', '', '', FOOTER]);
  totalRows.push([B.isApproved(prod) ? `Approved Planned Budget (USD)` : 'Planned Budget (USD, not approved yet)', '', round2(B.num(prod.planned_budget_2026)), '', '', '', '', '', '', FOOTER]);
  for (const r of totalRows) values.push(cpCols(r));

  // Few writes (Google allows 60 a minute): blanks over whatever was there before + CP's values + the side tabs
  // in one RAW batch, links and finance's own columns in one USER_ENTERED batch, then one formatting batch
  const oldRows = (cur.grid || []).length;
  const blank = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(''));
  const raw = [{ range: `'${title}'!A1`, values }];
  if (oldRows > values.length) raw.push({ range: `'${title}'!A${values.length + 1}`, values: blank(oldRows - values.length + 2, NCP) });
  const hadExtras = (cur.grid || []).some(r => (r || []).slice(NCP).some(v => v !== '' && v != null));
  if (hadExtras) raw.push({ range: `'${title}'!${colLetter(NCP)}1`, values: blank(Math.max(oldRows, values.length) + 2, MAX_COL - NCP) });
  raw.push(...await sideTabs(sheets, spreadsheetId, t.list, prod, lines, rate));
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: raw } }, G);
  if (formulas.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: formulas.map(f => ({ range: `'${title}'!${colLetter(f.col)}${f.row}`, values: [f.values] })) },
    }, G);
  }

  // Formatting: header, money formats per row currency, status fills, totals, hidden cp-id column
  const req = [];
  const navyHeader = { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: NCP }, cell: { userEnteredFormat: { backgroundColor: NAVY, horizontalAlignment: 'CENTER', textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)' } };
  req.push(navyHeader);
  req.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, foregroundColor: hexToRgb(company.color) } } }, fields: 'userEnteredFormat.textFormat' } });
  req.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } }, fields: 'userEnteredFormat.textFormat' } });
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } });
  for (let i = 0; i < dataCount; i++) {
    const row = 2 + i;
    const sym = currencies[i] === 'ILS' ? '₪' : '$';
    req.push({ repeatCell: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: NCP }, cell: { userEnteredFormat: { backgroundColor: STATUS_FILL[snap[i][1].status] || WHITE, textFormat: { bold: false } } }, fields: 'userEnteredFormat(backgroundColor,textFormat.bold)' } });
    req.push({ repeatCell: { range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: `"${sym}"#,##0.00` } } }, fields: 'userEnteredFormat.numberFormat' } });
  }
  const totalStart = 2 + dataCount;
  req.push({ repeatCell: { range: { sheetId, startRowIndex: totalStart, endRowIndex: totalStart + totalRows.length + 6, startColumnIndex: 0, endColumnIndex: NCP }, cell: { userEnteredFormat: { backgroundColor: WHITE, textFormat: { bold: false } } }, fields: 'userEnteredFormat(backgroundColor,textFormat.bold)' } });
  req.push({ repeatCell: { range: { sheetId, startRowIndex: totalStart, endRowIndex: totalStart + totalRows.length, startColumnIndex: 0, endColumnIndex: NCP }, cell: { userEnteredFormat: { backgroundColor: { red: 0.93, green: 0.93, blue: 0.96 }, textFormat: { bold: true } } }, fields: 'userEnteredFormat(backgroundColor,textFormat.bold)' } });
  Object.keys(byCur).forEach((c, i) => {
    req.push({ repeatCell: { range: { sheetId, startRowIndex: totalStart + i, endRowIndex: totalStart + i + 1, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: `"${c === 'ILS' ? '₪' : '$'}"#,##0.00` } } }, fields: 'userEnteredFormat.numberFormat' } });
  });
  req.push({ repeatCell: { range: { sheetId, startRowIndex: totalStart + Object.keys(byCur).length, endRowIndex: totalStart + totalRows.length, startColumnIndex: 2, endColumnIndex: 4 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } });
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: NCP - 1, endIndex: NCP }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
  const hasProtect = (t.budget.protectedRanges || []).some(p => p.description === 'cp-id');
  if (!hasProtect) req.push({ addProtectedRange: { protectedRange: { range: { sheetId, startColumnIndex: NCP - 1, endColumnIndex: NCP }, description: 'cp-id', warningOnly: true } } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: req } }, G);

  // Remember what we wrote, and the file's modified time after our write
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM finance_sheet_rows WHERE production_id = $1', [productionId]);
    for (const [id, v] of snap) {
      await client.query('INSERT INTO finance_sheet_rows (production_id, line_item_id, sheet_values, pushed_at) VALUES ($1, $2, $3, NOW())', [productionId, id, JSON.stringify(v)]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
  const f = await drive.files.get({ fileId: spreadsheetId, fields: 'modifiedTime' }, G);
  await db.query('UPDATE productions SET finance_sheet_synced_at = NOW(), finance_sheet_seen_modified = $2 WHERE id = $1', [productionId, f.data.modifiedTime]);
  return { synced: true, rows: dataCount };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? { red: parseInt(m[1], 16) / 255, green: parseInt(m[2], 16) / 255, blue: parseInt(m[3], 16) / 255 } : NAVY;
}

/** The Summary + Change log tabs (created once), as value ranges padded with blanks to a fixed size. */
async function sideTabs(sheets, spreadsheetId, list, prod, lines, rate) {
  const need = ['Summary', 'Change log'].filter(n => !list.some(s => s.properties.title === n));
  if (need.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: need.map(title => ({ addSheet: { properties: { title } } })) } }, G);
  }
  const st = B.budgetState(prod, lines, fx.latest().rate);
  const per = {};
  for (const li of lines) { const c = li.currency_code || 'USD'; per[c] = (per[c] || 0) + B.num(li.planned_budget); }
  const summary = [
    ['Company', companyOf(prod.brand_id).short.toUpperCase()],
    ['Legal entity', companyLine(prod.brand_id)],
    ['Finance code', B.financeCode(prod.id)],
    ['CP code', prod.id],
    ['Production', prod.project_name],
    ['Stage', B.normalizeStage(prod.stage) || ''],
    ['Status', prod.locked ? `Closed (${prod.locked_by || ''})` : 'Open'],
    ['Dates', `${prod.planned_start || '—'} → ${prod.planned_end || '—'}`],
    ['Planned Budget (USD)', round2(B.num(prod.planned_budget_2026))],
    ['Approved', st.approved ? `Yes — ${prod.budget_approved_by || ''} (${B.ymdOf(prod.budget_approved_at) || ''})` : 'Not yet'],
    ['Unexpected left (USD)', st.approved ? round2(st.bufferLeft) : ''],
    ...Object.entries(per).map(([c, a]) => [`Budget in ${c}`, round2(a)]),
    ['USD rate', `₪${rate.rate}/$ — Bank of Israel ${rate.date || ''}`],
    ['Open in CP', `${(process.env.APP_URL || 'https://particlepdio.particleface.com').replace(/\/$/, '')}/production/${encodeURIComponent(prod.id)}`],
    ['Updated', new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
  ];
  const { rows: evs } = await db.query('SELECT * FROM finance_events WHERE production_id = $1 ORDER BY created_at DESC LIMIT 500', [prod.id]);
  const log = [['When', 'What', 'Line', 'Old', 'New', 'USD change', 'Month', 'Reason', 'Approved by', 'Note', 'By', 'Source'],
    ...evs.map(e => [new Date(e.created_at).toISOString().slice(0, 16).replace('T', ' '), e.kind.replace(/_/g, ' '), e.label || '', e.old_value ?? '', e.new_value ?? '',
      e.delta_usd != null ? Number(e.delta_usd) : '', B.ymdOf(e.expense_month)?.slice(0, 7) || '', E.REASON_LABEL[e.reason] || '', e.approved_by || '', e.note || '', e.user_name || '', e.source || ''])];
  const pad = (rows, n, w) => [...rows.map(r => { const a = r.slice(0, w); while (a.length < w) a.push(''); return a; }), ...Array.from({ length: Math.max(0, n - rows.length) }, () => Array(w).fill(''))];
  return [
    { range: "'Summary'!A1", values: pad(summary, 40, 3) },
    { range: "'Change log'!A1", values: pad(log, 501, 12) },
  ];
}

/** Pull finance's edits, then push CP's state. The one entry point for a sync. */
function sync(productionId) {
  return exclusive(productionId, async () => {
    // If the sheet can't be read, don't write it — finance's unread edits would be lost
    const carry = await pull(productionId, { force: true });
    if (carry?.skipped === 'trashed') return carry;
    return push(productionId, carry || {});
  });
}

/** Cron: read every open mirror sheet that changed since we last looked. */
async function pullAll() {
  const { rows } = await db.query(
    `SELECT id FROM productions WHERE finance_sheet_mode = 'mirror' AND finance_sheet_id IS NOT NULL
       AND (locked IS NOT TRUE OR locked_at > NOW() - INTERVAL '60 days')`);
  let changed = 0, failed = 0;
  for (const { id } of rows) {
    try {
      // Read and write back in one go (ids for new rows, budget cells put back) — nothing can run in between
      const r = await exclusive(id, async () => {
        const p = await pull(id);
        if (p && !p.skipped && p.needsPush) await push(id, p);
        return p;
      });
      if (r && !r.skipped && r.needsPush) changed++;
    } catch (e) {
      failed++;
      if (/quota|rate limit|429/i.test(`${e.message} ${e.code || ''}`)) { console.warn('[finance sheet] Google write quota reached — the next pass continues'); break; }
      console.error(`[finance sheet] pull ${id}:`, e.message);
    }
  }
  if (changed || failed) console.log(`[finance sheet] checked ${rows.length} sheets: ${changed} updated, ${failed} failed`);
  return { checked: rows.length, changed, failed };
}

/**
 * Old-format ("linked") sheet → a new two-way sheet. `apply`: [{ line_id, field, value }] from the comparison,
 * applied first (finance's edits in the old sheet). The old link is kept as finance_sheet_legacy_url.
 */
async function convertLegacy(productionId, { apply = [], actor } = {}) {
  const { rows } = await db.query('SELECT finance_sheet_url, finance_sheet_mode FROM productions WHERE id = $1', [productionId]);
  const prod = rows[0];
  if (!prod) throw new Error('Production not found');
  if (prod.finance_sheet_mode !== 'linked') throw new Error('This production already has a two-way sheet');
  if (apply.length) {
    const byLine = new Map();
    for (const a of apply) {
      if (!a.line_id || !FIELDS.includes(a.field)) continue;
      byLine.set(a.line_id, { ...(byLine.get(a.line_id) || {}), ...toCp(a.field, a.field === 'budget' || a.field === 'actual' ? parseNum(a.value) : a.field === 'status' ? canonStatus(a.value) : a.value) });
    }
    const fin = require('./service');
    const out = await fin.changeLines({ productionId, ops: [...byLine.entries()].map(([id, values]) => ({ op: 'update', id, values })), actor: actor || { system: true, name: 'Sheet conversion', role: 'Admin' }, source: 'sheet', allowLocked: true, decision: { reason: 'other', note: 'Taken from the old finance sheet when it was converted' } });
    if (out.needs) throw Object.assign(new Error('Some values change an approved budget — apply them in CP with a reason first'), { status: 409 });
  }
  await db.query(`UPDATE productions SET finance_sheet_legacy_url = finance_sheet_url, finance_sheet_id = NULL, finance_sheet_url = NULL, finance_sheet_mode = NULL WHERE id = $1`, [productionId]);
  try {
    return await create(productionId);
  } catch (e) {
    await db.query(`UPDATE productions SET finance_sheet_url = finance_sheet_legacy_url, finance_sheet_id = $2, finance_sheet_mode = 'linked', finance_sheet_legacy_url = NULL WHERE id = $1`, [productionId, legacy.extractSheetId(prod.finance_sheet_url)]);
    throw e;
  }
}

/** A brand-new two-way sheet for a production (shared with finance, in the team folder). */
async function create(productionId) {
  const { rows } = await db.query('SELECT id, brand_id, project_name, finance_sheet_url FROM productions WHERE id = $1', [productionId]);
  const prod = rows[0];
  if (!prod) throw new Error('Production not found');
  if (prod.finance_sheet_url) return { url: prod.finance_sheet_url, already: true };
  const { sheets, drive } = await clientsFor(prod.brand_id);
  const company = companyOf(prod.brand_id).short;
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `${B.financeCode(prod.id)} — ${company} — ${prod.project_name || prod.id} — Finance` },
      sheets: [{ properties: { title: 'Budget', gridProperties: { columnCount: MAX_COL, frozenRowCount: 2 } } }],
    },
  }, G);
  const spreadsheetId = created.data.spreadsheetId;
  const url = created.data.spreadsheetUrl;
  await legacy.shareFinanceSheet(drive, spreadsheetId);
  if (process.env.DRIVE_FOLDER_ID) {
    try {
      const meta = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' }, G);
      await drive.files.update({ fileId: spreadsheetId, addParents: process.env.DRIVE_FOLDER_ID, removeParents: (meta.data.parents || []).join(','), fields: 'id' }, G);
    } catch (e) { console.error('finance-sheet folder move failed:', e.message); }
  }
  await db.query(`UPDATE productions SET finance_sheet_id = $1, finance_sheet_url = $2, finance_sheet_mode = 'mirror' WHERE id = $3`, [spreadsheetId, url, productionId]);
  await exclusive(productionId, () => push(productionId));
  try {
    const sheetsApi = (await clientsFor(prod.brand_id)).sheets;
    const meta = await sheetsApi.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' }, G);
    const sid = meta.data.sheets.find(x => x.properties.title === 'Budget').properties.sheetId;
    await sheetsApi.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ autoResizeDimensions: { dimensions: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: NCP - 1 } } }] } }, G);
  } catch { /* cosmetic */ }
  return { spreadsheetId, url };
}

// Debounced trigger used after every CP change
const pending = new Map();
function trigger(productionId, delayMs = 2500) {
  if (!productionId) return;
  if (pending.has(productionId)) clearTimeout(pending.get(productionId));
  pending.set(productionId, setTimeout(() => {
    pending.delete(productionId);
    sync(productionId).catch(e => {
      if (!/no-sheet|linked|not connected/i.test(e.message)) console.error(`[finance sheet] sync ${productionId}:`, e.message);
    });
  }, delayMs));
}

module.exports = { sync, pull, push, pullAll, create, convertLegacy, trigger, sheetValuesOf, readGrid, canonStatus, parseInvoice, parseNum, HEADERS };
