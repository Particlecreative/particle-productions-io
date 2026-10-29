/**
 * Higgsfield connection for Settings → Integrations. Signing in happens on Higgsfield's own page;
 * see lib/higgsfield.js for why the admin pastes the address back.
 */
const router = require('express').Router();
const { verifyJWT, requireAdmin } = require('../middleware/auth');
const hf = require('../lib/higgsfield');

router.use(verifyJWT);

const fail = (res, err, what) => {
  if (!err.status) console.error(`Higgsfield ${what}:`, err);
  res.status(err.status || 500).json({ error: err.message || `Higgsfield ${what} failed`, code: err.code });
};

// GET /api/higgsfield/status[?live=1] — live also asks Higgsfield for the credit balance
router.get('/status', async (req, res) => {
  try { res.json(await hf.status({ live: !!req.query.live })); } catch (err) { fail(res, err, 'status'); }
});

// POST /api/higgsfield/connect → { url } of Higgsfield's sign-in page
router.post('/connect', requireAdmin, async (req, res) => {
  try { res.json(await hf.startConnect()); } catch (err) { fail(res, err, 'connect'); }
});

// POST /api/higgsfield/connect/finish { url } — the address the browser landed on after signing in
router.post('/connect/finish', requireAdmin, async (req, res) => {
  try { res.json(await hf.finishConnect(req.body?.url, req.user)); } catch (err) { fail(res, err, 'connect'); }
});

router.delete('/', requireAdmin, async (req, res) => {
  try { await hf.disconnect(); res.json({ ok: true }); } catch (err) { fail(res, err, 'disconnect'); }
});

module.exports = router;
