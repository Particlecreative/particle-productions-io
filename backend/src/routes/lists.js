const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/lists  — all lists
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT key, items FROM lists ORDER BY key');
    // Return as { key: items[] } map
    const map = Object.fromEntries(rows.map(r => [r.key, r.items]));
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/lists/:key
router.get('/:key', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT items FROM lists WHERE key = $1', [req.params.key]);
    res.json(rows[0]?.items ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/lists/:key  (Admin — full replacement)
router.put('/:key', requireAdmin, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
  try {
    await db.query(
      `INSERT INTO lists (key, items) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`,
      [req.params.key, JSON.stringify(items)]
    );
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/lists/:key  (Admin — reset to default would need re-insert)
router.delete('/:key', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM lists WHERE key = $1', [req.params.key]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/lists/budget-cols/global
router.get('/budget-cols/global', async (req, res) => {
  try {
    const { rows } = await db.query("SELECT cols FROM budget_custom_cols WHERE key = 'global'");
    res.json(rows[0]?.cols ?? []);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/lists/budget-cols/global  (Admin)
router.put('/budget-cols/global', requireAdmin, async (req, res) => {
  const { cols } = req.body;
  if (!Array.isArray(cols)) return res.status(400).json({ error: 'cols array required' });
  try {
    await db.query(
      `INSERT INTO budget_custom_cols (key, cols) VALUES ('global', $1)
       ON CONFLICT (key) DO UPDATE SET cols = EXCLUDED.cols`,
      [JSON.stringify(cols)]
    );
    res.json({ success: true, cols });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
