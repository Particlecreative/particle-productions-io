const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/cc-purchases?production_id=...
router.get('/', async (req, res) => {
  try {
    const { production_id } = req.query;
    let query  = 'SELECT * FROM cc_purchases';
    const vals = [];
    if (production_id) {
      query += ' WHERE production_id = $1';
      vals.push(production_id);
    }
    query += ' ORDER BY submitted_at DESC';
    const { rows } = await db.query(query, vals);
    res.json(rows);
  } catch (err) {
    console.error('GET /cc-purchases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/cc-purchases
router.post('/', async (req, res) => {
  const {
    id, production_id, store_name, description,
    amount_without_vat, total_amount, purchase_date,
    purchaser_name, receipt_url, approval_status,
    approved_by, parent_line_item_id, notes, submitted_at,
  } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO cc_purchases
         (id, production_id, store_name, description,
          amount_without_vat, total_amount, purchase_date,
          purchaser_name, receipt_url, approval_status,
          approved_by, parent_line_item_id, notes, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        id || require('crypto').randomUUID(),
        production_id   || '',
        store_name      || '',
        description     || '',
        amount_without_vat != null ? amount_without_vat : 0,
        total_amount       != null ? total_amount       : 0,
        purchase_date      || null,
        purchaser_name  || '',
        receipt_url     || '',
        approval_status || 'Pending',
        approved_by     || '',
        parent_line_item_id || '',
        notes           || '',
        submitted_at    || new Date().toISOString(),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /cc-purchases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/cc-purchases/:id
router.patch('/:id', async (req, res) => {
  const allowed = [
    'production_id', 'store_name', 'description',
    'amount_without_vat', 'total_amount', 'purchase_date',
    'purchaser_name', 'receipt_url', 'approval_status',
    'approved_by', 'parent_line_item_id', 'notes',
  ];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);
  try {
    const { rows } = await db.query(
      `UPDATE cc_purchases SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'CC purchase not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /cc-purchases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/cc-purchases/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM cc_purchases WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /cc-purchases error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
