const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/contracts — all contracts
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM contracts ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/contracts/:production_id
router.get('/:production_id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM contracts WHERE production_id = $1',
      [req.params.production_id]
    );
    res.json(rows[0] ?? null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/contracts/:production_id  (upsert)
router.put('/:production_id', async (req, res) => {
  const { provider_name, provider_email, status, sent_at, signed_at, pdf_url } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO contracts (production_id, provider_name, provider_email, status, sent_at, signed_at, pdf_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (production_id) DO UPDATE SET
         provider_name  = EXCLUDED.provider_name,
         provider_email = EXCLUDED.provider_email,
         status         = EXCLUDED.status,
         sent_at        = EXCLUDED.sent_at,
         signed_at      = EXCLUDED.signed_at,
         pdf_url        = EXCLUDED.pdf_url
       RETURNING *`,
      [req.params.production_id, provider_name, provider_email, status || 'none', sent_at || null, signed_at || null, pdf_url || null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
