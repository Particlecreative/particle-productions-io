const router = require('express').Router();
const db     = require('../db');
const { logAction } = require('../lib/auditLog');
const { verifyJWT, requireEditor } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/casting?production_id=...
router.get('/', async (req, res) => {
  try {
    const { production_id } = req.query;
    let query  = 'SELECT * FROM casting';
    const vals = [];
    if (production_id) {
      query += ' WHERE production_id = $1';
      vals.push(production_id);
    }
    query += ' ORDER BY created_at DESC';
    const { rows } = await db.query(query, vals);
    res.json(rows);
  } catch (err) {
    console.error('GET /casting error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/casting
router.post('/', requireEditor, async (req, res) => {
  const {
    id, production_id, project_name, brand_id, name, photo_url,
    role, period, start_date, end_date, warning_date, contract_status,
    usage, signed_contract_url, contract_manager_name, notes, created_at,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO casting
         (id, production_id, project_name, brand_id, name, photo_url, role, period,
          start_date, end_date, warning_date, contract_status, usage,
          signed_contract_url, contract_manager_name, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        id || require('crypto').randomUUID(),
        production_id || '', project_name || '', brand_id || '', name,
        photo_url || '', role || 'Model', period || 'Perpetually',
        start_date || null, end_date || null, warning_date || null,
        contract_status || 'Running', usage || [],
        signed_contract_url || '', contract_manager_name || '',
        notes || '', created_at || new Date().toISOString(),
      ]
    );
    logAction({ production_id: rows[0].production_id, entity: "casting", action: "create", summary: `Added cast member "${rows[0].name || ''}"`, user_id: req.user?.id, user_name: req.user?.name });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /casting error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/casting/:id
router.patch('/:id', requireEditor, async (req, res) => {
  const allowed = [
    'production_id', 'project_name', 'brand_id', 'name', 'photo_url',
    'role', 'period', 'start_date', 'end_date', 'warning_date',
    'contract_status', 'usage', 'signed_contract_url',
    'contract_manager_name', 'notes',
  ];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);
  try {
    const { rows } = await db.query(
      `UPDATE casting SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cast member not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /casting error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/casting/:id
router.delete('/:id', requireEditor, async (req, res) => {
  try {
    await db.query('DELETE FROM casting WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /casting error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
