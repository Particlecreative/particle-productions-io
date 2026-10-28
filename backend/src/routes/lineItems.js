const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireEditor } = require('../middleware/auth');
const { logAction } = require('../lib/auditLog');
const fin = require('../lib/finance/service');
const { parseDecision } = require('../lib/finance/events');
const { parseFlow } = require('../lib/finance/rules');
const { afterLines } = require('../lib/finance/after');

router.use(verifyJWT);

// Every write goes through the finance service: role + lock checks, the approved-budget rules,
// the finance log, totals at Bank of Israel rates, and dates that follow the lines.
const decisionOf = (body) => parseDecision(body);
const flowOf = (body) => parseFlow(body);

// GET /api/line-items?production_id=PRD26-01&cc_purchase_id=...
router.get('/', async (req, res) => {
  const { production_id, cc_purchase_id } = req.query;
  try {
    const vals  = [];
    const where = [];
    if (production_id)  { where.push(`production_id = $${vals.push(production_id)}`); }
    if (cc_purchase_id) { where.push(`cc_purchase_id = $${vals.push(cc_purchase_id)}`); }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM production_line_items${clause} ORDER BY production_id, sort_order NULLS LAST, created_at ASC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/line-items  (optional after_id: insert right below that line)
router.post('/', async (req, res) => {
  const { production_id, after_id } = req.body;
  if (!production_id) return res.status(400).json({ error: 'production_id required' });
  try {
    const out = await fin.changeLines({
      productionId: production_id,
      ops: [{ op: 'create', values: req.body, after_id }],
      actor: fin.actorOf(req), decision: decisionOf(req.body), flow: flowOf(req.body),
    });
    if (fin.sendFinanceOutcome(res, out)) return;
    const row = out.rows[0];
    logAction({ production_id, entity: 'line_item', action: 'create', summary: `Added line item "${row.item || row.full_name || 'item'}"`, new_value: `${row.item || ''} — ${row.type || ''}`, user_id: req.user?.id, user_name: req.user?.name });
    afterLines(production_id, out);
    res.status(201).json(row);
  } catch (err) {
    fin.sendFinanceError(res, err, 'POST /line-items error');
  }
});

// PUT /api/line-items/order — save the order of a production's lines (drag & drop)
router.put('/order', requireEditor, async (req, res) => {
  const { production_id, ids } = req.body;
  if (!production_id || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'production_id and ids required' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id FROM production_line_items WHERE production_id = $1', [production_id]);
    const known = new Set(rows.map(r => r.id));
    const ordered = ids.filter(id => known.has(id));
    const rest = rows.map(r => r.id).filter(id => !ordered.includes(id)); // anything the browser didn't send keeps its place at the end
    const all = [...ordered, ...rest];
    for (let i = 0; i < all.length; i++) {
      await client.query('UPDATE production_line_items SET sort_order = $2 WHERE id = $1', [all[i], i + 1]);
    }
    await client.query('COMMIT');
    afterLines(production_id, { rows: [], events: [] }, { order: true });
    res.json({ ok: true, count: all.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('PUT /line-items/order error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/line-items/bulk — the same change on several lines of one production, one reason for all
router.patch('/bulk', async (req, res) => {
  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || !ids.length || !updates || typeof updates !== 'object') return res.status(400).json({ error: 'ids and updates required' });
  try {
    const { rows } = await db.query('SELECT id, production_id FROM production_line_items WHERE id = ANY($1::uuid[])', [ids]);
    const prods = [...new Set(rows.map(r => r.production_id))];
    if (prods.length !== 1) return res.status(400).json({ error: 'Bulk edits must be on one production' });
    const out = await fin.changeLines({
      productionId: prods[0],
      ops: rows.map(r => ({ op: 'update', id: r.id, values: updates })),
      actor: fin.actorOf(req), decision: decisionOf(req.body), flow: flowOf(req.body),
    });
    if (fin.sendFinanceOutcome(res, out)) return;
    logAction({ production_id: prods[0], entity: 'line_item', action: 'update', summary: `Bulk-updated ${rows.length} lines — ${Object.keys(updates).join(', ')}`, user_id: req.user?.id, user_name: req.user?.name });
    afterLines(prods[0], out);
    res.json(out.rows);
  } catch (err) {
    fin.sendFinanceError(res, err, 'PATCH /line-items/bulk error');
  }
});

// PATCH /api/line-items/:id
router.patch('/:id', async (req, res) => {
  try {
    const { rows: cur } = await db.query('SELECT * FROM production_line_items WHERE id = $1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Not found' });
    const old = cur[0];
    const out = await fin.changeLines({
      productionId: old.production_id,
      ops: [{ op: 'update', id: old.id, values: req.body }],
      actor: fin.actorOf(req), decision: decisionOf(req.body), flow: flowOf(req.body),
    });
    if (fin.sendFinanceOutcome(res, out)) return;
    const row = out.rows[0];
    const changed = Object.keys(req.body).filter(k => !k.startsWith('_') && String(old[k] ?? '') !== String(row[k] ?? ''));
    if (changed.length) {
      const detail = changed.slice(0, 4).map(k => `${k}: ${fmtVal(old[k])} → ${fmtVal(row[k])}`).join('; ');
      logAction({ production_id: row.production_id, entity: 'line_item', action: 'update', summary: `Updated line item "${row.item || row.full_name || ''}" — ${detail}`, user_id: req.user?.id, user_name: req.user?.name });
    }
    afterLines(row.production_id, out, { invoiceChanged: String(old.invoice_url || '') !== String(row.invoice_url || '') ? [row.id] : [] });
    res.json(row);
  } catch (err) {
    fin.sendFinanceError(res, err, 'PATCH /line-items error');
  }
});

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

// DELETE /api/line-items/:id  — cascade delete with options (a reason may be needed once the budget is approved:
// send it as JSON body `_finance` or ?_finance=<json>)
router.delete('/:id', async (req, res) => {
  try {
    const { rows: itemRows } = await db.query('SELECT * FROM production_line_items WHERE id = $1', [req.params.id]);
    if (!itemRows[0]) return res.status(404).json({ error: 'Not found' });
    const item = itemRows[0];

    let body = req.body || {};
    if (!body._finance && req.query._finance) { try { body = { _finance: JSON.parse(req.query._finance) }; } catch { /* ignore */ } }
    const out = await fin.changeLines({
      productionId: item.production_id,
      ops: [{ op: 'delete', id: item.id }],
      actor: fin.actorOf(req), decision: decisionOf(body), flow: flowOf(body),
    });
    if (fin.sendFinanceOutcome(res, out)) return;

    const opts = {
      deleteContract: req.query.deleteContract !== 'false',
      deleteCast: req.query.deleteCast !== 'false',
      deleteDriveFiles: req.query.deleteDriveFiles === 'true',
    };
    const deleted = { lineItem: true, contract: false, cast: false, driveFiles: 0 };

    // Clean up contract + signatures
    if (opts.deleteContract) {
      const contractKey = `${item.production_id}_li_${req.params.id}`;
      try {
        const { rows: cRows } = await db.query('SELECT id, drive_url FROM contracts WHERE production_id = $1', [contractKey]);
        if (cRows[0]) {
          await db.query('DELETE FROM contract_signatures WHERE contract_id = $1', [cRows[0].id]);
          await db.query('DELETE FROM contracts WHERE id = $1', [cRows[0].id]);
          deleted.contract = true;
        }
      } catch (_) {}
    }

    // Clean up cast member
    if (opts.deleteCast && item.full_name) {
      try {
        const { rowCount } = await db.query(
          'DELETE FROM production_cast WHERE production_id = $1 AND name = $2',
          [item.production_id, item.full_name]
        );
        if (rowCount > 0) deleted.cast = true;
      } catch (_) {}
    }

    // Delete files from Google Drive
    if (opts.deleteDriveFiles) {
      const driveUrls = [item.invoice_url, item.drive_url, item.receipt_url, item.photo_url].filter(Boolean);
      for (const url of driveUrls) {
        const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
        if (m) {
          try {
            const { rows: settRows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
            if (settRows[0]?.google_tokens) {
              const { google } = require('googleapis');
              const tokens = typeof settRows[0].google_tokens === 'string' ? JSON.parse(settRows[0].google_tokens) : settRows[0].google_tokens;
              const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
              oauth2.setCredentials(tokens);
              const drive = google.drive({ version: 'v3', auth: oauth2 });
              await drive.files.delete({ fileId: m[1], supportsAllDrives: true });
              deleted.driveFiles++;
            }
          } catch (e) { console.error('Drive file delete:', e.message); }
        }
      }
    }

    logAction({ production_id: item.production_id, entity: 'line_item', action: 'delete', summary: `Deleted line item "${item.item || item.full_name || ''}"`, user_id: req.user?.id, user_name: req.user?.name });
    afterLines(item.production_id, out);
    res.json({ success: true, deleted });
  } catch (err) {
    fin.sendFinanceError(res, err, 'Delete line item error');
  }
});

// GET /api/line-items/gsheet-csv?url=... — proxy-fetch a public Google Sheet as CSV
// Needed to avoid CORS when the frontend tries to load a Google Sheets URL directly.
router.get('/gsheet-csv', verifyJWT, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url param required' });

    // Extract spreadsheet ID and gid from any Google Sheets URL variant
    const idMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return res.status(400).json({ error: 'Not a valid Google Sheets URL' });
    const sheetId = idMatch[1];

    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';

    // Export as XLSX (not CSV) so hyperlinks in cells are preserved
    const xlsxUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx&gid=${gid}`;

    const response = await fetch(xlsxUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: response.status === 401 || response.status === 403
          ? 'Sheet is not publicly accessible. Please share it as "Anyone with the link can view".'
          : `Google Sheets returned ${response.status}`,
      });
    }

    const buf = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);
  } catch (err) {
    console.error('GET /line-items/gsheet-csv error:', err);
    res.status(500).json({ error: 'Failed to fetch Google Sheet' });
  }
});

module.exports = router;
