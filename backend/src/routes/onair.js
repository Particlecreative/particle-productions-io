/**
 * /api/onair — On Air (17 Nov 2026): what's running now on TV (the agency's daily reports, read from Gmail) and on
 * Meta (AfterLife). Particle only. Everyone signed in with Particle access may read it (the Growth team too);
 * refreshing the TV mail now is Editor+.
 *   GET  /tv            → lib/onair/tv.js buildTv
 *   POST /tv/refresh    → read the mailbox now, then the same as GET /tv
 *   GET  /media         → lib/onair/media.js (AfterLife on-air export, cached 10 min; ?force=1 skips the cache)
 *   GET  /t?p&e&s       → an AfterLife thumbnail through a signed URL (public: img tags can't send the login header)
 */
const router = require('express').Router();
const { verifyJWT, RANK } = require('../middleware/auth');
const TV = require('../lib/onair/tv');
const Mail = require('../lib/onair/tvMail');
const Media = require('../lib/onair/media');

const fail = (res, err, label) => {
  console.error(`[onair] ${label}`, err?.stack || err);
  res.status(err?.status || 500).json({ error: err?.message || 'Server error' });
};

router.get('/t', async (req, res) => {
  const p = String(req.query.p || '');
  if (!Media.verifyThumb(p, req.query.e, req.query.s)) return res.status(403).end();
  try {
    const out = await Media.thumbnail(p);
    res.set('Content-Type', out.mime || 'image/jpeg').set('Cache-Control', 'private, max-age=43200').send(out.bytes);
  } catch { res.status(404).end(); }
});

router.use(verifyJWT);
router.use((req, res, next) => {
  const u = req.user || {};
  if (!(u.super_admin || u.role === 'Admin' || u.brand_id === 'particle' || (u.brand_ids || []).includes('particle'))) return res.status(403).json({ error: 'On Air is for Particle' });
  next();
});

router.get('/tv', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await TV.buildTv('particle')); } catch (err) { fail(res, err, 'tv'); }
});

router.post('/tv/refresh', async (req, res) => {
  if ((RANK[req.user?.role] ?? -1) < RANK.Editor && !req.user?.super_admin) return res.status(403).json({ error: 'Editor access required' });
  try {
    const sync = await Mail.sync({ days: 21 });
    TV.clearLive();
    res.json({ ...(await TV.buildTv('particle')), refreshed: sync });
  } catch (err) { fail(res, err, 'tv refresh'); }
});

router.get('/media', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json(await Media.getMedia({ force: req.query.force === '1' })); } catch (err) { fail(res, err, 'media'); }
});

module.exports = router;
