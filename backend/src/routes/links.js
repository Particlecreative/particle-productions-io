const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/links?production_id=PRD26-01
router.get('/', async (req, res) => {
  const { production_id } = req.query;
  try {
    const q = production_id
      ? 'SELECT * FROM links WHERE production_id = $1 ORDER BY category, "order" ASC'
      : 'SELECT * FROM links ORDER BY production_id, category, "order" ASC';
    const { rows } = await db.query(q, production_id ? [production_id] : []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/links
router.post('/', async (req, res) => {
  const { production_id, category, title, url } = req.body;
  if (!production_id || !category || !title || !url) {
    return res.status(400).json({ error: 'production_id, category, title, url required' });
  }
  try {
    // auto-assign order within category
    const orderRes = await db.query(
      'SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM links WHERE production_id = $1 AND category = $2',
      [production_id, category]
    );
    const order = orderRes.rows[0]?.next ?? 0;
    const { rows } = await db.query(
      'INSERT INTO links (production_id, category, title, url, "order") VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [production_id, category, title, url, order]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/links/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['category', 'title', 'url', 'order'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const setClause = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values    = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE links SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/links/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM links WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/links/categories/:production_id
router.get('/categories/:production_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT categories FROM link_categories WHERE production_id = $1',
      [req.params.production_id]
    );
    res.json(rows[0]?.categories ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/links/categories/:production_id
router.put('/categories/:production_id', async (req, res) => {
  const { categories } = req.body;
  try {
    await db.query(
      `INSERT INTO link_categories (production_id, categories) VALUES ($1, $2)
       ON CONFLICT (production_id) DO UPDATE SET categories = EXCLUDED.categories`,
      [req.params.production_id, JSON.stringify(categories)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
