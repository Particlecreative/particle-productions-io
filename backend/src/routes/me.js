/**
 * /api/me — things about the signed-in person themselves.
 *   GET    /monday            connected? as who (never the token)
 *   POST   /monday/token      { token } — a personal Monday API token
 *   GET    /monday/connect    → { url } one-click Monday sign-in (when the company's Monday app is set up)
 *   GET    /monday/callback   (public — Monday redirects the browser here; the signed state protects it)
 *   DELETE /monday            disconnect
 *   POST   /activity          { page } — a page opened (Team activity)
 */
const router = require('express').Router();
const { verifyJWT } = require('../middleware/auth');
const MU = require('../lib/mondayUser');
const activity = require('../lib/activity');

const appBase = (req) => (process.env.APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
function errorJson(res, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[me]', err.message);
  res.status(status).json({ error: err.message || 'Server error' });
}

router.get('/monday/callback', async (req, res) => {
  const back = `${appBase(req)}/welcome`;
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error).slice(0, 200));
    const r = await MU.finishConnect({ code: req.query.code, state: req.query.state });
    activity.record({ id: r.userId, name: r.name }, { kind: 'monday_connect', label: 'Connected Monday' });
    res.redirect(`${back}?monday=connected`);
  } catch (e) {
    res.redirect(`${back}?monday_error=${encodeURIComponent(e.message)}`);
  }
});

router.use(verifyJWT);

router.get('/monday', async (req, res) => {
  try { res.json(await MU.status(req.user.id)); } catch (err) { errorJson(res, err); }
});
router.post('/monday/token', async (req, res) => {
  try { res.json(await MU.connectToken(req.user.id, req.body?.token)); } catch (err) { errorJson(res, err); }
});
router.get('/monday/connect', async (req, res) => {
  try { res.json({ url: await MU.connectUrl(req.user.id) }); } catch (err) { errorJson(res, err); }
});
router.delete('/monday', async (req, res) => {
  try { await MU.disconnect(req.user.id); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
});

// A page opened in the Growth Studio (tab names only)
router.post('/activity', (req, res) => {
  const page = String(req.body?.page || '').replace(/[^\w &·→/-]/g, '').slice(0, 60);
  if (page && req.user?.role !== 'Admin' && !req.user?.super_admin) activity.record(req.user, { kind: 'page', label: `Opened ${page}`, ref: page });
  res.json({ ok: true });
});

module.exports = router;
