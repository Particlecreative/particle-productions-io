const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/tickets
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM improvement_tickets ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tickets
router.post('/', async (req, res) => {
  const { title, body: ticketBody, status, priority } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO improvement_tickets (title, body, status, priority) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, ticketBody || '', status || 'open', priority || 'medium']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/tickets/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['title', 'body', 'status', 'priority'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE improvement_tickets SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tickets/:id  (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM improvement_tickets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
