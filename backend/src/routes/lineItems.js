const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { logAction } = require('../lib/auditLog');

router.use(verifyJWT);

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
      `SELECT * FROM production_line_items${clause} ORDER BY created_at ASC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/line-items
router.post('/', async (req, res) => {
  const {
    production_id, item, full_name, type, status,
    planned_budget, actual_spent, payment_status, payment_method,
    bank_details, business_type, supplier_type, invoice_status, invoice_url,
    invoice_type, timeline_start, timeline_end, receipt_required,
    paid_at, notes, supplier, id_number, currency_code, custom_fields,
  } = req.body;

  if (!production_id) return res.status(400).json({ error: 'production_id required' });

  try {
    const { rows } = await db.query(
      `INSERT INTO production_line_items
        (production_id, item, full_name, type, status,
         planned_budget, actual_spent, payment_status, payment_method,
         bank_details, business_type, supplier_type, invoice_status, invoice_url,
         invoice_type, timeline_start, timeline_end, receipt_required,
         paid_at, notes, supplier, id_number, currency_code, custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        production_id,
        item || '', full_name || '', type || '', status || 'Not Started',
        planned_budget || 0, actual_spent || 0,
        payment_status || 'Not Paid', payment_method || null,
        bank_details || null, business_type || null,
        supplier_type || 'New Supplier', invoice_status || null, invoice_url || null,
        invoice_type || null, timeline_start || null, timeline_end || null,
        receipt_required || false, paid_at || null,
        notes || null, supplier || null, id_number || null,
        currency_code || 'USD',
        JSON.stringify(custom_fields || {}),
      ]
    );

    // Sync production totals
    await syncTotals(production_id);

    // Auto-create supplier if full_name provided (match by name, no duplicates)
    if (full_name && full_name.trim()) {
      try {
        await db.query(
          `INSERT INTO suppliers (name, brand_id, created_at)
           VALUES ($1, (SELECT brand_id FROM productions WHERE id = $2 LIMIT 1), NOW())
           ON CONFLICT DO NOTHING`,
          [full_name.trim(), production_id.split('_')[0] === production_id ? production_id : production_id]
        );
      } catch (supErr) {
        // Ignore — supplier may already exist or table may not have unique constraint
      }
    }

    logAction({ production_id, entity: 'line_item', action: 'create', summary: `Added line item "${item || full_name || 'item'}"`, new_value: `${item || ''} — ${type || ''}`, user_id: req.user?.id, user_name: req.user?.name });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /line-items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/line-items/:id
router.patch('/:id', async (req, res) => {
  const allowed = [
    'item','full_name','type','status','planned_budget','actual_spent',
    'payment_status','payment_method','bank_details','business_type',
    'supplier_type','invoice_status','invoice_url','invoice_type',
    'timeline_start','timeline_end','receipt_required','paid_at',
    'notes','supplier','id_number','currency_code','custom_fields','cc_purchase_id',
    'drive_url','dropbox_url','payment_proof_url','payment_proof_drive_url','payment_proof_dropbox_url',
  ];

  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const setClause = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values    = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE production_line_items SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    await syncTotals(rows[0].production_id);

    // Auto-create supplier when full_name is updated
    if (req.body.full_name && req.body.full_name.trim()) {
      try {
        await db.query(
          `INSERT INTO suppliers (name, brand_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING`,
          [req.body.full_name.trim(), rows[0].production_id?.split('_')[0] || 'particle']
        );
      } catch (_) {}
    }

    const changedFields = Object.keys(req.body).filter(k => k !== '_log').join(', ');
    logAction({ production_id: rows[0].production_id, entity: 'line_item', action: 'update', summary: `Updated line item "${rows[0].item || rows[0].full_name || ''}" — ${changedFields}`, user_id: req.user?.id, user_name: req.user?.name });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /line-items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/line-items/:id  — cascade delete with options
router.delete('/:id', async (req, res) => {
  try {
    // First fetch the item to get details before deleting
    const { rows: itemRows } = await db.query(
      'SELECT * FROM production_line_items WHERE id = $1', [req.params.id]
    );
    if (!itemRows[0]) return res.status(404).json({ error: 'Not found' });
    const item = itemRows[0];

    // Parse cascade options from query params (or body)
    const opts = {
      deleteContract: req.query.deleteContract !== 'false',
      deleteCast: req.query.deleteCast !== 'false',
      deleteDriveFiles: req.query.deleteDriveFiles === 'true',
    };

    const deleted = { lineItem: true, contract: false, cast: false, driveFiles: 0 };

    // Delete line item
    await db.query('DELETE FROM production_line_items WHERE id = $1', [req.params.id]);

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

    await syncTotals(item.production_id);
    logAction({ production_id: item.production_id, entity: 'line_item', action: 'delete', summary: `Deleted line item "${item.item || item.full_name || ''}"`, user_id: req.user?.id, user_name: req.user?.name });
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('Delete line item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: recalculate and update production estimated_budget + actual_spent
// Converts ILS amounts to USD using a default rate before summing
const DEFAULT_ILS_RATE = 3.7;
async function syncTotals(productionId) {
  try {
    await db.query(
      `UPDATE productions SET
         estimated_budget = (
           SELECT COALESCE(SUM(
             CASE WHEN currency_code = 'ILS' THEN planned_budget / ${DEFAULT_ILS_RATE}
                  ELSE planned_budget END
           ), 0) FROM production_line_items WHERE production_id = $1
         ),
         actual_spent = (
           SELECT COALESCE(SUM(
             CASE WHEN currency_code = 'ILS' THEN actual_spent / ${DEFAULT_ILS_RATE}
                  ELSE actual_spent END
           ), 0) FROM production_line_items WHERE production_id = $1
         ),
         updated_at = NOW()
       WHERE id = $1`,
      [productionId]
    );
  } catch { /* non-critical */ }
}

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
