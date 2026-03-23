const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const db      = require('../db');
const { verifyJWT, requireAdmin } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, name, role, brand_id, active, avatar_url, super_admin, must_change_password, created_at FROM users ORDER BY name'
    );

    // Attach brand access to each user
    const access = await db.query('SELECT user_id, brand_ids FROM user_brand_access');
    const accessMap = Object.fromEntries(access.rows.map(r => [r.user_id, r.brand_ids]));

    res.json(rows.map(u => ({ ...u, brand_ids: accessMap[u.id] ?? ['particle'] })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users  (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { email, name, role, brand_id, password, brand_ids, must_change_password, super_admin } = req.body;
  if (!email || !name || !role || !password) {
    return res.status(400).json({ error: 'email, name, role, password required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, name, role, brand_id, active, must_change_password, super_admin, password_hash)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7) RETURNING id, email, name, role, brand_id, active, super_admin, must_change_password`,
      [email, name, role, brand_id || null, must_change_password || false, super_admin || false, hash]
    );
    const user = rows[0];

    // Set brand access
    const bids = brand_ids ?? ['particle'];
    await db.query(
      `INSERT INTO user_brand_access (user_id, brand_ids) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET brand_ids = EXCLUDED.brand_ids`,
      [user.id, bids]
    );

    res.status(201).json({ ...user, brand_ids: bids });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/:id  (Admin only — or self for non-sensitive fields)
router.patch('/:id', async (req, res) => {
  const RANK = { Viewer: 0, Accounting: 1, Editor: 2, Admin: 3 };
  const isAdmin = (RANK[req.user?.role] ?? 0) >= RANK.Admin;
  const isSelf  = req.user.id === req.params.id;

  if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });

  const adminFields   = ['role', 'active', 'super_admin', 'must_change_password'];
  const allowedFields = isAdmin
    ? ['name', 'email', 'role', 'brand_id', 'active', 'super_admin', 'must_change_password', 'avatar_url']
    : ['name', 'avatar_url'];

  const updates = Object.entries(req.body).filter(([k]) => allowedFields.includes(k));

  // Handle password reset by admin
  if (isAdmin && req.body.password) {
    const hash = await bcrypt.hash(req.body.password, 10);
    updates.push(['password_hash', hash]);
  }

  if (!updates.length && !req.body.brand_ids) {
    return res.status(400).json({ error: 'No valid fields' });
  }

  try {
    if (updates.length) {
      const set    = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
      const values = updates.map(([, v]) => v);
      await db.query(
        `UPDATE users SET ${set}, updated_at = NOW() WHERE id = $1`,
        [req.params.id, ...values]
      );
    }

    // Update brand access
    if (isAdmin && req.body.brand_ids !== undefined) {
      await db.query(
        `INSERT INTO user_brand_access (user_id, brand_ids) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET brand_ids = EXCLUDED.brand_ids`,
        [req.params.id, req.body.brand_ids]
      );
    }

    const { rows } = await db.query(
      'SELECT id, email, name, role, brand_id, active, super_admin, must_change_password FROM users WHERE id = $1',
      [req.params.id]
    );
    const access = await db.query('SELECT brand_ids FROM user_brand_access WHERE user_id = $1', [req.params.id]);
    res.json({ ...rows[0], brand_ids: access.rows[0]?.brand_ids ?? ['particle'] });
  } catch (err) {
    console.error('PATCH /users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id  (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
