const router = require('express').Router();
const db = require('../db');
const { verifyJWT, requireEditor } = require('../middleware/auth');
const fs = require('../lib/financeSheet');

router.use(verifyJWT);

// GET /api/finance-sheet/:productionId — current link state
router.get('/:productionId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT finance_sheet_id, finance_sheet_url, finance_sheet_mode, finance_sheet_synced_at FROM productions WHERE id = $1',
      [req.params.productionId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Production not found' });
    res.json({
      linked: !!rows[0].finance_sheet_id,
      url: rows[0].finance_sheet_url || null,
      mode: rows[0].finance_sheet_mode || null,
      synced_at: rows[0].finance_sheet_synced_at || null,
    });
  } catch (err) {
    console.error('GET /finance-sheet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/finance-sheet/:productionId/create — create a new CP-owned mirror sheet
router.post('/:productionId/create', requireEditor, async (req, res) => {
  try {
    const existing = await db.query('SELECT finance_sheet_url FROM productions WHERE id = $1', [req.params.productionId]);
    if (existing.rows[0]?.finance_sheet_url) return res.json({ url: existing.rows[0].finance_sheet_url, already: true });
    const { url } = await fs.createFinanceSheet(req.params.productionId);
    res.status(201).json({ url });
  } catch (err) {
    console.error('POST /finance-sheet/create error:', err);
    res.status(400).json({ error: err.message || 'Failed to create sheet' });
  }
});

// POST /api/finance-sheet/:productionId/sync — push CP data now (mirror sheets only)
router.post('/:productionId/sync', requireEditor, async (req, res) => {
  try {
    const result = await fs.syncFinanceSheet(req.params.productionId);
    res.json(result);
  } catch (err) {
    console.error('POST /finance-sheet/sync error:', err);
    res.status(400).json({ error: err.message || 'Sync failed' });
  }
});

// POST /api/finance-sheet/:productionId/link — link an existing external sheet (read-only, no overwrite)
router.post('/:productionId/link', requireEditor, async (req, res) => {
  try {
    const id = fs.extractSheetId(req.body.url);
    if (!id) return res.status(400).json({ error: 'Could not read a spreadsheet ID from that URL' });
    const url = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    const { rows } = await db.query(
      "UPDATE productions SET finance_sheet_id = $1, finance_sheet_url = $2, finance_sheet_mode = 'linked' WHERE id = $3 RETURNING id",
      [id, url, req.params.productionId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Production not found' });
    res.json({ url, mode: 'linked' });
  } catch (err) {
    console.error('POST /finance-sheet/link error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/finance-sheet/:productionId/link — unlink (does not delete the sheet)
router.delete('/:productionId/link', requireEditor, async (req, res) => {
  try {
    await db.query(
      'UPDATE productions SET finance_sheet_id = NULL, finance_sheet_url = NULL, finance_sheet_mode = NULL, finance_sheet_synced_at = NULL WHERE id = $1',
      [req.params.productionId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /finance-sheet/link error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/finance-sheet/:productionId/mismatches — diff a linked sheet vs CP (non-destructive)
router.get('/:productionId/mismatches', async (req, res) => {
  try {
    const result = await fs.findMismatches(req.params.productionId);
    res.json(result);
  } catch (err) {
    console.error('GET /finance-sheet/mismatches error:', err);
    res.status(400).json({ error: err.message || 'Could not read the sheet' });
  }
});

// POST /api/finance-sheet/:productionId/share — (re)grant finance-team editor access
router.post('/:productionId/share', requireEditor, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT brand_id, finance_sheet_id FROM productions WHERE id = $1', [req.params.productionId]);
    if (!rows[0]?.finance_sheet_id) return res.status(400).json({ error: 'No sheet linked' });
    const { drive } = await fs.getGoogleClients(rows[0].brand_id);
    await fs.shareFinanceSheet(drive, rows[0].finance_sheet_id);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /finance-sheet/share error:', err);
    res.status(400).json({ error: err.message || 'Share failed' });
  }
});

module.exports = router;
