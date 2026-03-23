const router = require('express').Router();
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/call-sheets?production_id=...
router.get('/', async (req, res) => {
  try {
    const { production_id } = req.query;
    let query = 'SELECT * FROM call_sheets';
    const vals = [];
    if (production_id) {
      query += ' WHERE production_id = $1';
      vals.push(production_id);
    }
    query += ' ORDER BY created_at DESC';
    const { rows } = await db.query(query, vals);
    res.json(rows);
  } catch (err) {
    console.error('GET /call-sheets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/call-sheets
router.post('/', async (req, res) => {
  const {
    id, production_id, title, shoot_date, created_by, recipients,
    custom_recipient_ids, sections, overview, location, project_details,
    technical, primary_contacts, crew_contacts, selected_link_ids,
    extra_fields, created_at,
  } = req.body;
  if (!id) return res.status(400).json({ error: 'id is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO call_sheets
         (id, production_id, title, shoot_date, created_by, recipients,
          custom_recipient_ids, sections, overview, location, project_details,
          technical, primary_contacts, crew_contacts, selected_link_ids,
          extra_fields, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        id, production_id || '', title || '', shoot_date || null,
        created_by || '', recipients || 'all',
        JSON.stringify(custom_recipient_ids || []),
        JSON.stringify(sections || {}),
        JSON.stringify(overview || {}),
        JSON.stringify(location || {}),
        JSON.stringify(project_details || {}),
        JSON.stringify(technical || {}),
        JSON.stringify(primary_contacts || []),
        JSON.stringify(crew_contacts || []),
        JSON.stringify(selected_link_ids || []),
        JSON.stringify(extra_fields || []),
        created_at || new Date().toISOString(),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /call-sheets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/call-sheets/:id
router.patch('/:id', async (req, res) => {
  const allowed = [
    'title', 'shoot_date', 'recipients', 'custom_recipient_ids', 'sections',
    'overview', 'location', 'project_details', 'technical', 'primary_contacts',
    'crew_contacts', 'selected_link_ids', 'extra_fields',
  ];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const set    = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values = updates.map(([, v]) => typeof v === 'object' ? JSON.stringify(v) : v);
  try {
    const { rows } = await db.query(
      `UPDATE call_sheets SET ${set} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Call sheet not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /call-sheets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/call-sheets/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM call_sheets WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /call-sheets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
