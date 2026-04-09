const router = require('express').Router();
const db     = require('../db');
const { logAction } = require('../lib/auditLog');
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

// GET /api/comments?production_id=PRD26-01
router.get('/', async (req, res) => {
  const { production_id } = req.query;
  if (!production_id) return res.status(400).json({ error: 'production_id required' });
  try {
    const { rows } = await db.query(
      'SELECT * FROM comments WHERE production_id = $1 ORDER BY created_at ASC',
      [production_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/comments
router.post('/', async (req, res) => {
  const { production_id, body: commentBody, mentions } = req.body;
  if (!production_id || !commentBody) {
    return res.status(400).json({ error: 'production_id and body required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO comments (production_id, user_id, author, body, mentions)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [production_id, req.user.id, req.user.name, commentBody, mentions || []]
    );
    logAction({ production_id: req.body.production_id, entity: "comment", action: "create", summary: `Added comment on ${req.body.production_id || ''}`, user_id: req.user?.id, user_name: req.user?.name });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/comments/:id
router.patch('/:id', async (req, res) => {
  const { body: commentBody } = req.body;
  if (!commentBody) return res.status(400).json({ error: 'body required' });
  try {
    const { rows } = await db.query(
      'UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [commentBody, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found or not authorised' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/comments/:id
router.delete('/:id', async (req, res) => {
  try {
    const check = await db.query('SELECT user_id FROM comments WHERE id = $1', [req.params.id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
    // Allow own comments or admins
    const ADMIN_RANK = 3;
    const RANK = { Viewer: 0, Accounting: 1, Editor: 2, Admin: 3 };
    const isAdmin = (RANK[req.user?.role] ?? 0) >= ADMIN_RANK;
    if (check.rows[0].user_id !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
