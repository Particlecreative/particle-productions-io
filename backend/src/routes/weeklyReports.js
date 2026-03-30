const router = require('express').Router();
const db     = require('../db');
const crypto = require('crypto');
const { verifyJWT } = require('../middleware/auth');

// ── PUBLIC: share endpoint (no auth) ────────────────────────────────────────
router.get('/share/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM weekly_reports WHERE share_token = $1',
      [req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Report not found or link expired' });

    const report = rows[0];

    // Also fetch productions referenced in entries
    const prodIds = (report.entries || []).map(e => e.production_id).filter(Boolean);
    let productions = [];
    if (prodIds.length > 0) {
      const { rows: prods } = await db.query(
        `SELECT id, project_name, stage, brand_id FROM productions WHERE id = ANY($1)`,
        [prodIds]
      );
      productions = prods;
    }

    // Fetch comments for selected_comment_ids
    const allCommentIds = (report.entries || []).flatMap(e => e.selected_comment_ids || []);
    let comments = [];
    if (allCommentIds.length > 0) {
      const { rows: cmts } = await db.query(
        `SELECT id, body, production_id FROM comments WHERE id = ANY($1)`,
        [allCommentIds]
      );
      comments = cmts;
    }

    res.json({ report, productions, comments });
  } catch (err) {
    console.error('GET /weekly-reports/share/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PROTECTED routes below ──────────────────────────────────────────────────
router.use(verifyJWT);

// GET /api/weekly-reports?brand_id=...&week_start=...
router.get('/', async (req, res) => {
  try {
    const { brand_id, week_start } = req.query;
    const vals  = [];
    const where = [];
    if (brand_id)   { where.push(`brand_id = $${vals.push(brand_id)}`); }
    if (week_start) { where.push(`week_start = $${vals.push(week_start)}`); }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM weekly_reports${clause} ORDER BY week_start DESC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /weekly-reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/weekly-reports/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM weekly_reports WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /weekly-reports/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/weekly-reports/:id/share — generate or return share token
router.post('/:id/share', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, share_token FROM weekly_reports WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    let token = rows[0].share_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      await db.query(
        'UPDATE weekly_reports SET share_token = $1 WHERE id = $2',
        [token, req.params.id]
      );
    }
    res.json({ share_token: token });
  } catch (err) {
    console.error('POST /weekly-reports/:id/share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/weekly-reports  — upsert by brand_id + week_start
router.put('/', async (req, res) => {
  const { id, brand_id, week_start, entries, general_updates, title, creative_link } = req.body;
  if (!brand_id || !week_start) {
    return res.status(400).json({ error: 'brand_id and week_start are required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO weekly_reports (id, brand_id, week_start, entries, general_updates, title, creative_link, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (brand_id, week_start)
       DO UPDATE SET entries = EXCLUDED.entries, general_updates = EXCLUDED.general_updates,
                     title = EXCLUDED.title, creative_link = EXCLUDED.creative_link, updated_at = NOW()
       RETURNING *`,
      [
        id || crypto.randomUUID(),
        brand_id,
        week_start,
        JSON.stringify(entries || []),
        JSON.stringify(general_updates || []),
        title || '',
        JSON.stringify(creative_link || null),
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /weekly-reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/weekly-reports/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM weekly_reports WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /weekly-reports error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
