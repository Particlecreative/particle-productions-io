const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/form-configs/:production_id
router.get('/:production_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT config FROM form_configs WHERE production_id = $1',
      [req.params.production_id]
    );
    res.json(rows[0]?.config ?? { logoUrl: '', bgColor: '', bgImageUrl: '' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/form-configs/:production_id  (upsert)
router.put('/:production_id', async (req, res) => {
  const config = req.body;
  try {
    await db.query(
      `INSERT INTO form_configs (production_id, config) VALUES ($1, $2)
       ON CONFLICT (production_id) DO UPDATE SET config = EXCLUDED.config`,
      [req.params.production_id, JSON.stringify(config)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
