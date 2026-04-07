const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireEditor, requireAdmin } = require('../middleware/auth');

// All production routes require authentication
router.use(verifyJWT);

// GET /api/productions?brand_id=particle&year=2026
router.get('/', async (req, res) => {
  const { brand_id, year } = req.query;
  try {
    const vals  = [];
    const where = [];
    if (brand_id) { where.push(`brand_id = $${vals.push(brand_id)}`); }
    if (year)     { where.push(`EXTRACT(YEAR FROM planned_start) = $${vals.push(parseInt(year, 10))}`); }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM productions${clause} ORDER BY planned_start ASC NULLS LAST, id ASC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /productions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/productions/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM productions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/productions
router.post('/', requireAdmin, async (req, res) => {
  const {
    id, brand_id, project_name, product_type, producer,
    planned_start, planned_end, planned_budget_2026,
    estimated_budget, actual_spent, payment_date,
    stage, production_type, production_category,
    timeline_sync, shoot_dates, delivery_date, air_date,
    custom_columns, custom_fields,
  } = req.body;

  if (!id || !brand_id || !project_name) {
    return res.status(400).json({ error: 'id, brand_id, project_name required' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO productions
        (id, brand_id, project_name, product_type, producer,
         planned_start, planned_end, planned_budget_2026, estimated_budget, actual_spent,
         payment_date, stage, production_type, production_category,
         timeline_sync, shoot_dates, delivery_date, air_date,
         custom_columns, custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        id, brand_id, project_name,
        product_type || [],
        producer,
        planned_start || null, planned_end || null,
        planned_budget_2026 || 0, estimated_budget || 0, actual_spent || 0,
        payment_date || null,
        stage || 'Pending',
        production_type || '', production_category || null,
        timeline_sync || false,
        shoot_dates || [],
        delivery_date || null, air_date || null,
        JSON.stringify(custom_columns || []),
        JSON.stringify(custom_fields || {}),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /productions error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Production ID already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/productions/:id/lock — lock/unlock a production (admin only)
router.post('/:id/lock', requireAdmin, async (req, res) => {
  try {
    const { locked } = req.body;
    const { rows } = await db.query(
      `UPDATE productions SET locked = $1, locked_at = CASE WHEN $1 THEN NOW() ELSE NULL END, locked_by = CASE WHEN $1 THEN $2 ELSE NULL END, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [!!locked, req.user?.name || req.user?.email || 'Admin', req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /productions/:id/lock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/productions/:id
router.patch('/:id', requireEditor, async (req, res) => {
  // Check if production is locked — only admins can edit locked productions
  const RANK = { Viewer: 0, Accounting: 1, Editor: 2, Admin: 3 };
  const isAdmin = (RANK[req.user?.role] ?? 0) >= RANK.Admin;
  try {
    const { rows: lockCheck } = await db.query('SELECT locked FROM productions WHERE id = $1', [req.params.id]);
    if (lockCheck[0]?.locked && !isAdmin) {
      return res.status(403).json({ error: 'This production is locked. Only admins can edit locked productions.' });
    }
  } catch {}

  const allowed = [
    'project_name','product_type','producer','planned_start','planned_end',
    'planned_budget_2026','estimated_budget','actual_spent','payment_date',
    'stage','production_type','production_category','timeline_sync',
    'shoot_dates','delivery_date','air_date','custom_columns','custom_fields',
  ];

  const updates = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k));

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values    = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE productions SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Log changes to change_history
    for (const [field, newVal] of updates) {
      if (req.body._log !== false) {
        await db.query(
          `INSERT INTO change_history (production_id, field, new_value, user_id, user_name)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.id, field, String(newVal), req.user.id, req.user.name]
        );
      }
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /productions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/productions/:id  (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM productions WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('DELETE /productions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
