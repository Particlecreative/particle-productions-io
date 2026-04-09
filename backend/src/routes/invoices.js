const router = require('express').Router();
const db     = require('../db');
const { logAction } = require('../lib/auditLog');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/invoices?line_item_id=uuid  OR  all
router.get('/', async (req, res) => {
  const { line_item_id, production_id } = req.query;
  try {
    let q, params;
    if (line_item_id) {
      q = 'SELECT * FROM invoices WHERE line_item_id = $1 ORDER BY created_at DESC';
      params = [line_item_id];
    } else if (production_id) {
      q = 'SELECT * FROM invoices WHERE production_id = $1 ORDER BY created_at DESC';
      params = [production_id];
    } else {
      q = 'SELECT * FROM invoices ORDER BY created_at DESC';
      params = [];
    }
    const { rows } = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/invoices
router.post('/', async (req, res) => {
  const { line_item_id, production_id, file_url, amount, date_received, payment_due, status, mismatch } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO invoices (line_item_id, production_id, file_url, amount, date_received, payment_due, status, mismatch)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [line_item_id || null, production_id || null, file_url || null, amount || null, date_received || null, payment_due || null, status || 'pending', mismatch || false]
    );
    logAction({ production_id: rows[0].production_id, entity: "invoice", action: "create", summary: `Created invoice for "${rows[0].item || ''}" — ${rows[0].invoice_status || ''}`, user_id: req.user?.id, user_name: req.user?.name });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/invoices/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['file_url', 'amount', 'date_received', 'payment_due', 'status', 'mismatch'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE invoices SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
