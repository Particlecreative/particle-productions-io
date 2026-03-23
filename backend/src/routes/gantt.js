const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// ── PHASES ──────────────────────────────────────────

// GET /api/gantt/phases
router.get('/phases', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM gantt_phases ORDER BY order_idx ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/gantt/phases  (replace all global phases)
router.put('/phases', async (req, res) => {
  const { phases } = req.body;
  if (!Array.isArray(phases)) return res.status(400).json({ error: 'phases array required' });
  try {
    // Delete global phases and re-insert
    await db.query('DELETE FROM gantt_phases WHERE production_id IS NULL');
    for (const p of phases) {
      await db.query(
        `INSERT INTO gantt_phases (id, name, color, order_idx) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color, order_idx = EXCLUDED.order_idx`,
        [p.id, p.name, p.color, p.order]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── EVENTS ──────────────────────────────────────────

// GET /api/gantt/events?production_id=PRD26-01
router.get('/events', async (req, res) => {
  const { production_id } = req.query;
  try {
    const q = production_id
      ? 'SELECT * FROM gantt_events WHERE production_id = $1 ORDER BY start_date ASC'
      : 'SELECT * FROM gantt_events ORDER BY start_date ASC';
    const { rows } = await db.query(q, production_id ? [production_id] : []);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/gantt/events
router.post('/events', async (req, res) => {
  const { production_id, phase_id, title, start_date, end_date, color } = req.body;
  if (!production_id || !title || !start_date || !end_date) {
    return res.status(400).json({ error: 'production_id, title, start_date, end_date required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO gantt_events (production_id, phase_id, title, start_date, end_date, color)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [production_id, phase_id || null, title, start_date, end_date, color || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/gantt/events/:id
router.patch('/events/:id', async (req, res) => {
  const allowed = ['phase_id', 'title', 'start_date', 'end_date', 'color'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => v);

  try {
    const { rows } = await db.query(
      `UPDATE gantt_events SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/gantt/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM gantt_events WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
