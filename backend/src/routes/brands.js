const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/brands
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM brands ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/brands  (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { id, name, tagline, primary_color, secondary_color, accent_color, bg_color } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO brands (id, name, tagline, primary_color, secondary_color, accent_color, bg_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, name, tagline || '', primary_color || '#000000', secondary_color || '#000000', accent_color || '#000000', bg_color || '#ffffff']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Brand ID already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/brands/:id  (Admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const allowed = ['name', 'tagline', 'primary_color', 'secondary_color', 'accent_color', 'bg_color', 'logo_url', 'colors'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE brands SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Brand not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/brands/:id  (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM brands WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
