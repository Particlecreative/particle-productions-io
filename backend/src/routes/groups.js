const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/groups
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM user_groups ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups  (Admin)
router.post('/', requireAdmin, async (req, res) => {
  const { name, description, role, members } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO user_groups (name, description, role, members) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description || '', role || 'Viewer', members || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/groups/:id  (Admin)
router.patch('/:id', requireAdmin, async (req, res) => {
  const allowed = ['name', 'description', 'role', 'members'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE user_groups SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/groups/:id  (Admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM user_groups WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
