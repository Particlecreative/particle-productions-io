const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/people-on-set?production_id=PRD26-01
router.get('/', async (req, res) => {
  const { production_id } = req.query;
  if (!production_id) return res.status(400).json({ error: 'production_id required' });
  try {
    const { rows } = await db.query(
      'SELECT * FROM people_on_set WHERE production_id = $1 ORDER BY name',
      [production_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/people-on-set
router.post('/', async (req, res) => {
  const { production_id, name, role, phone } = req.body;
  if (!production_id || !name) return res.status(400).json({ error: 'production_id and name required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO people_on_set (production_id, name, role, phone) VALUES ($1,$2,$3,$4) RETURNING *',
      [production_id, name, role || null, phone || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/people-on-set/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'role', 'phone'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE people_on_set SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/people-on-set/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM people_on_set WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
