/**
 * Studio passwords — the Access Passwords boards on Monday, live (lib/studio/passwords.js).
 * Who: the creative team, the studio, producers (Editor) and admins. Money columns: producers and admins only.
 * A password only leaves the server on Reveal / Copy, and each one is logged.
 */
const express = require('express');
const router = express.Router();
const { verifyJWT } = require('../middleware/auth');
const P = require('../lib/studio/passwords');

const ALLOWED = new Set(['Creative', 'Studio', 'Editor', 'Admin']);
const errorJson = (res, err) => res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });

router.use(verifyJWT, (req, res, next) => {
  if (req.user?.super_admin || ALLOWED.has(req.user?.role)) return next();
  res.status(403).json({ error: 'Studio passwords are for the creative team, producers and admins', code: 'passwords_only' });
});
const withMoney = (req) => !!(req.user?.super_admin || ['Editor', 'Admin'].includes(req.user?.role));
const isAdmin = (req) => !!(req.user?.super_admin || req.user?.role === 'Admin');
// no browser / proxy keeps a copy of anything here
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/', async (req, res) => {
  try { res.json(await P.list(req.query.board, { withMoney: withMoney(req), force: req.query.force === '1' })); } catch (err) { errorJson(res, err); }
});
router.post('/:board/:id/reveal', async (req, res) => {
  try { res.json(await P.reveal(req.params.board, req.params.id, { user: req.user, action: req.body?.action === 'copy' ? 'copy' : 'reveal' })); } catch (err) { errorJson(res, err); }
});
router.patch('/:board/:id', async (req, res) => {
  try { res.json(await P.update(req.params.board, req.params.id, req.body || {}, { user: req.user, withMoney: withMoney(req) })); } catch (err) { errorJson(res, err); }
});
router.post('/:board', async (req, res) => {
  try { res.json(await P.create(req.params.board, req.body || {}, { user: req.user, withMoney: withMoney(req) })); } catch (err) { errorJson(res, err); }
});
router.get('/history', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admins only' });
    res.json({ history: await P.history({ limit: Number(req.query.limit) || 100, itemId: req.query.item || null }) });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
