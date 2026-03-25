const router = require('express').Router();
const db     = require('../db');

// Public endpoints for unauthenticated forms (CC payment, supplier form)
// NO verifyJWT — these are intentionally public

// GET /api/public/production/:id — limited fields for form display
router.get('/production/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, project_name, brand_id, product_type, producer, planned_start, planned_end
       FROM productions WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Production not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /public/production error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/public/line-items/:productionId — for linking CC purchase to line item
router.get('/line-items/:productionId', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, item, full_name, type FROM production_line_items
       WHERE production_id = $1 ORDER BY created_at ASC`,
      [req.params.productionId]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /public/line-items error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/public/cc-purchase — submit a CC purchase from public form
router.post('/cc-purchase', async (req, res) => {
  const {
    production_id, store_name, description,
    amount_without_vat, total_amount, purchase_date,
    purchaser_name, receipt_url, parent_line_item_id,
    category, notes,
  } = req.body;

  if (!production_id || !store_name) {
    return res.status(400).json({ error: 'production_id and store_name required' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO cc_purchases
        (production_id, store_name, description, amount_without_vat, total_amount,
         purchase_date, purchaser_name, receipt_url, parent_line_item_id,
         category, notes, approval_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pending')
       RETURNING *`,
      [
        production_id, store_name, description || '',
        parseFloat(amount_without_vat) || 0, parseFloat(total_amount) || 0,
        purchase_date || null, purchaser_name || '',
        receipt_url || '', parent_line_item_id || null,
        category || 'Office', notes || '',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /public/cc-purchase error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
