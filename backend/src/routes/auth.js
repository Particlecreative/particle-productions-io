const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const { verifyJWT } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE lower(email) = lower($1) AND active = true',
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Fetch brand access
    const accessRow = await db.query(
      'SELECT brand_ids FROM user_brand_access WHERE user_id = $1',
      [user.id]
    );
    const brandIds = accessRow.rows[0]?.brand_ids ?? ['particle'];

    const payload = {
      id:          user.id,
      email:       user.email,
      name:        user.name,
      role:        user.role,
      brand_id:    user.brand_id,
      super_admin: user.super_admin,
      brand_ids:   brandIds,
      must_change_password: user.must_change_password,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — validate token and return current user
router.get('/me', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, name, role, brand_id, super_admin, must_change_password, active FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0] || !rows[0].active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    const accessRow = await db.query(
      'SELECT brand_ids FROM user_brand_access WHERE user_id = $1',
      [req.user.id]
    );
    const brandIds = accessRow.rows[0]?.brand_ids ?? ['particle'];

    res.json({ ...rows[0], brand_ids: brandIds });
  } catch (err) {
    console.error('GET /me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', verifyJWT, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    if (current_password) {
      const valid = await bcrypt.compare(current_password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
