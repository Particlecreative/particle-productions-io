const router = require('express').Router();
const db     = require('../db');
const { logAction } = require('../lib/auditLog');
const { verifyJWT, requireEditor } = require('../middleware/auth');

router.use(verifyJWT);

// ── Platform notification helper (cross-user insert, mirrors castingAutomation) ──
async function createNotification(userId, type, message, productionId) {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, message, production_id) VALUES ($1, $2, $3, $4)`,
      [userId, type, message, productionId || null]
    );
  } catch (err) {
    console.error('Notification insert error:', err.message);
  }
}

const TASK_SELECT = `
  SELECT t.*, u.name AS assignee_name, u.avatar_url AS assignee_avatar, p.project_name
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN productions p ON p.id = t.production_id
`;

// GET /api/tasks?brand_id=particle
router.get('/', async (req, res) => {
  const { brand_id } = req.query;
  try {
    const q = brand_id
      ? `${TASK_SELECT} WHERE t.brand_id = $1 ORDER BY t.status, t."order" ASC, t.created_at ASC`
      : `${TASK_SELECT} ORDER BY t.status, t."order" ASC, t.created_at ASC`;
    const { rows } = await db.query(q, brand_id ? [brand_id] : []);
    res.json(rows);
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks
router.post('/', requireEditor, async (req, res) => {
  const {
    brand_id, title, description, status, priority,
    due_date, assignee_id, production_id,
  } = req.body;
  if (!brand_id || !title || !title.trim()) {
    return res.status(400).json({ error: 'brand_id and title required' });
  }
  try {
    const taskStatus = status || 'Not Started';
    // auto-assign order within (brand, status) column
    const orderRes = await db.query(
      'SELECT COALESCE(MAX("order"), -1) + 1 AS next FROM tasks WHERE brand_id = $1 AND status = $2',
      [brand_id, taskStatus]
    );
    const order = orderRes.rows[0]?.next ?? 0;
    const { rows } = await db.query(
      `INSERT INTO tasks (brand_id, title, description, status, priority, due_date, assignee_id, production_id, created_by, "order")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [brand_id, title.trim(), description || '', taskStatus, priority || 'Medium',
       due_date || null, assignee_id || null, production_id || null, req.user?.id || null, order]
    );
    const { rows: full } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [rows[0].id]);
    const task = full[0];

    logAction({ production_id: production_id || null, entity: 'task', action: 'create', summary: `Created task "${title.trim()}"`, user_id: req.user?.id, user_name: req.user?.name });

    if (assignee_id && assignee_id !== req.user?.id) {
      createNotification(assignee_id, 'task_assigned', `${req.user?.name || 'Someone'} assigned you a task: "${title.trim()}"`, production_id);
    }
    res.status(201).json(task);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/reorder — silent batch reindex after drag
router.post('/reorder', requireEditor, async (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders) || !orders.length) {
    return res.status(400).json({ error: 'orders array required' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const { id, order } of orders) {
      await client.query('UPDATE tasks SET "order" = $2, updated_at = NOW() WHERE id = $1', [id, order]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('POST /tasks/reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id
router.patch('/:id', requireEditor, async (req, res) => {
  const allowed = ['title', 'description', 'status', 'priority', 'due_date', 'assignee_id', 'production_id', 'order'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const setClause = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values    = updates.map(([, v]) => v === '' ? null : v);

  try {
    // fetch old row first for notification diffing
    const { rows: oldRows } = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    const old = oldRows[0];
    if (!old) return res.status(404).json({ error: 'Not found' });

    const { rows } = await db.query(
      `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: full } = await db.query(`${TASK_SELECT} WHERE t.id = $1`, [req.params.id]);
    const task = full[0];

    // Notify assignee on assignment / status change (not for self-actions)
    const changed = Object.fromEntries(updates);
    if ('assignee_id' in changed && changed.assignee_id && changed.assignee_id !== old.assignee_id && changed.assignee_id !== req.user?.id) {
      createNotification(changed.assignee_id, 'task_assigned', `${req.user?.name || 'Someone'} assigned you a task: "${task.title}"`, task.production_id);
    }
    if ('status' in changed && changed.status !== old.status && task.assignee_id && task.assignee_id !== req.user?.id) {
      createNotification(task.assignee_id, 'task_status', `Task "${task.title}" moved to ${changed.status} by ${req.user?.name || 'someone'}`, task.production_id);
    }
    if ('status' in changed && changed.status !== old.status) {
      logAction({ production_id: task.production_id, entity: 'task', action: 'update', field: 'status', old_value: old.status, new_value: changed.status, summary: `Task "${task.title}" → ${changed.status}`, user_id: req.user?.id, user_name: req.user?.name });
    }
    res.json(task);
  } catch (err) {
    console.error('PATCH /tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', requireEditor, async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /tasks/:id/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks/:id/comments — any logged-in user can comment
router.post('/:id/comments', async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO task_comments (task_id, user_id, author, body) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, req.user?.id || null, req.user?.name || 'Unknown', body.trim()]
    );
    // Notify the assignee about the new comment (unless they wrote it)
    const { rows: taskRows } = await db.query('SELECT title, assignee_id, production_id FROM tasks WHERE id = $1', [req.params.id]);
    const task = taskRows[0];
    if (task?.assignee_id && task.assignee_id !== req.user?.id) {
      createNotification(task.assignee_id, 'task_comment', `${req.user?.name || 'Someone'} commented on task "${task.title}"`, task.production_id);
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /tasks/:id/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
