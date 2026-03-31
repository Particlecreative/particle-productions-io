const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/settings/:brand_id
router.get('/:brand_id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM settings WHERE brand_id = $1', [req.params.brand_id]);
    res.json(rows[0] ?? { brand_id: req.params.brand_id, logo_url: null, colors: {}, fonts: {} });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/settings/:brand_id
router.patch('/:brand_id', requireAdmin, async (req, res) => {
  const { logo_url, colors, fonts } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO settings (brand_id, logo_url, colors, fonts)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (brand_id) DO UPDATE SET
         logo_url   = COALESCE(EXCLUDED.logo_url, settings.logo_url),
         colors     = COALESCE(EXCLUDED.colors, settings.colors),
         fonts      = COALESCE(EXCLUDED.fonts, settings.fonts),
         updated_at = NOW()
       RETURNING *`,
      [req.params.brand_id, logo_url ?? null, JSON.stringify(colors ?? {}), JSON.stringify(fonts ?? {})]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/monday-config  (Admin only)
router.get('/monday-config', requireAdmin, async (req, res) => {
  const brand_id = req.user.brand_id || 'particle';
  try {
    const { rows } = await db.query(
      'SELECT monday_config FROM settings WHERE brand_id = $1',
      [brand_id]
    );
    res.json(rows[0]?.monday_config ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings/monday-config  (Admin)
// Migration note: requires `monday_config JSONB` column on settings table:
//   ALTER TABLE settings ADD COLUMN IF NOT EXISTS monday_config JSONB;
router.post('/monday-config', requireAdmin, async (req, res) => {
  const brand_id = req.user.brand_id || 'particle';
  const monday_config = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO settings (brand_id, monday_config)
       VALUES ($1, $2)
       ON CONFLICT (brand_id) DO UPDATE SET
         monday_config = EXCLUDED.monday_config,
         updated_at    = NOW()
       RETURNING monday_config`,
      [brand_id, JSON.stringify(monday_config)]
    );
    res.json(rows[0].monday_config);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/view-order/:view_key
router.get('/view-order/:view_key', async (req, res) => {
  try {
    // Personal first, then global
    const personal = await db.query(
      'SELECT "order" FROM view_orders WHERE view_key = $1 AND user_id = $2',
      [req.params.view_key, req.user.id]
    );
    if (personal.rows[0]) return res.json(personal.rows[0].order);

    const global = await db.query(
      'SELECT "order" FROM view_orders WHERE view_key = $1 AND for_all = true ORDER BY user_id LIMIT 1',
      [req.params.view_key]
    );
    res.json(global.rows[0]?.order ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/view-order/:view_key
router.put('/view-order/:view_key', async (req, res) => {
  const { order, for_all } = req.body;
  try {
    await db.query(
      `INSERT INTO view_orders (view_key, user_id, "order", for_all)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (view_key, user_id) DO UPDATE SET "order" = EXCLUDED."order", for_all = EXCLUDED.for_all`,
      [req.params.view_key, req.user.id, JSON.stringify(order), for_all || false]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
