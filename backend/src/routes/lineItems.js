const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

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
        item || '', full_name || '', type || 'Crew', status || 'Not Started',
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
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /line-items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/line-items/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM production_line_items WHERE id = $1 RETURNING production_id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await syncTotals(rows[0].production_id);
    res.json({ success: true });
  } catch (err) {
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

module.exports = router;
