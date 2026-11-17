/**
 * /api/activity (admins) — Team activity: what the non-admin users did in CP and when (lib/activity.js).
 *   GET /?days=30[&user=<id>]  → { people: [stats per person], events: [latest lines], daily, monday: who connected Monday }
 */
const router = require('express').Router();
const { verifyJWT, requireAdmin } = require('../middleware/auth');
const activity = require('../lib/activity');

router.use(verifyJWT, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const out = await activity.overview({ days: req.query.days, userId: req.query.user || null });
    const monday = await require('../lib/mondayUser').connectedUsers().catch(() => []);
    res.json({ ...out, monday });
  } catch (err) {
    console.error('[activity]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
