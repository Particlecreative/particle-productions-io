const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/change-history?production_id=PRD26-01  OR all
router.get('/', async (req, res) => {
  const { production_id } = req.query;
  try {
    const q = production_id
      ? 'SELECT * FROM change_history WHERE production_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM change_history ORDER BY created_at DESC LIMIT 500';
    const { rows } = await db.query(q, production_id ? [production_id] : []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/change-history  (internal — called by productions route)
router.post('/', async (req, res) => {
  const { production_id, field, old_value, new_value, user_name } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO change_history (production_id, field, old_value, new_value, user_id, user_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [production_id, field, old_value ?? null, new_value ?? null, req.user.id, user_name || req.user.name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
