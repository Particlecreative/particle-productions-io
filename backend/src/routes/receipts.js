const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/receipts — all OR filter ?pending=true
router.get('/', async (req, res) => {
  const { pending, production_id } = req.query;
  try {
    let q, params = [];
    if (pending === 'true') {
      q = 'SELECT * FROM receipts WHERE receipt_url IS NULL ORDER BY created_at DESC';
    } else if (production_id) {
      q = 'SELECT * FROM receipts WHERE production_id = $1 ORDER BY created_at DESC';
      params = [production_id];
    } else {
      q = 'SELECT * FROM receipts ORDER BY created_at DESC';
    }
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/receipts
router.post('/', async (req, res) => {
  const { line_item_id, production_id, paid_at, receipt_url, reminder_sent } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO receipts (line_item_id, production_id, paid_at, receipt_url, reminder_sent)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [line_item_id || null, production_id || null, paid_at || null, receipt_url || null, reminder_sent || false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/receipts/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['paid_at', 'receipt_url', 'reminder_sent'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE receipts SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
