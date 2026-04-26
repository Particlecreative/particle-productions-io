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

    if (rows[0].share_expires_at && new Date(rows[0].share_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired' });
    }

    const report = rows[0];

    // Also fetch productions referenced in entries — include timeline + type
    const prodIds = (report.entries || []).map(e => e.production_id).filter(Boolean);
    let productions = [];
    if (prodIds.length > 0) {
      const { rows: prods } = await db.query(
        `SELECT id, project_name, stage, brand_id, production_type, planned_start, planned_end FROM productions WHERE id = ANY($1)`,
        [prodIds]
      );
      productions = prods;
    }

    // Fetch brand info (logo, colors) for the report
    let brand = null;
    if (report.brand_id) {
      const { rows: brandRows } = await db.query(
        `SELECT id, name, primary_color, secondary_color, accent_color, logo_url FROM brands WHERE id = $1`,
        [report.brand_id]
      );
      brand = brandRows[0] || null;
      // Also check settings table for uploaded logo override
      if (brand) {
        try {
          const { rows: sRows } = await db.query(
            `SELECT logo_url, colors FROM settings WHERE brand_id = $1`,
            [report.brand_id]
          );
          if (sRows[0]?.logo_url) brand.logo_url = sRows[0].logo_url;
          if (sRows[0]?.colors && typeof sRows[0].colors === 'object') {
            if (sRows[0].colors.primary) brand.primary_color = sRows[0].colors.primary;
            if (sRows[0].colors.accent) brand.accent_color = sRows[0].colors.accent;
          }
        } catch { /* settings table may not have rows */ }
      }
    }

    res.json({ report, productions, brand });
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
    }
    await db.query(
      "UPDATE weekly_reports SET share_token = $1, share_expires_at = NOW() + INTERVAL '90 days' WHERE id = $2",
      [token, req.params.id]
    );
    res.json({ share_token: token });
  } catch (err) {
    console.error('POST /weekly-reports/:id/share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/weekly-reports  — upsert by brand_id + week_start
router.put('/', async (req, res) => {
  const { id, brand_id, week_start, entries, general_updates, title, creative_link, weekly_files } = req.body;
  if (!brand_id || !week_start) {
    return res.status(400).json({ error: 'brand_id and week_start are required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO weekly_reports (id, brand_id, week_start, entries, general_updates, title, creative_link, weekly_files, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (brand_id, week_start)
       DO UPDATE SET entries = EXCLUDED.entries, general_updates = EXCLUDED.general_updates,
                     title = EXCLUDED.title, creative_link = EXCLUDED.creative_link,
                     weekly_files = EXCLUDED.weekly_files, updated_at = NOW()
       RETURNING *`,
      [
        id || crypto.randomUUID(),
        brand_id,
        week_start,
        JSON.stringify(entries || []),
        JSON.stringify(general_updates || []),
        title || '',
        JSON.stringify(creative_link || null),
        JSON.stringify(weekly_files || []),
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
