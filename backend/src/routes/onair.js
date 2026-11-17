/**
 * /api/onair — On Air (17 Nov 2026): what's running now on TV (the agency's daily reports, read from Gmail) and on
 * Meta (AfterLife). Particle only. Everyone signed in with Particle access may read it — the Growth team sees TV only
 * (Meta ads aren't theirs; middleware/auth.js GROWTH_ALLOW); refreshing the TV mail now is Editor+.
 *   GET  /tv            → lib/onair/tv.js buildTv
 *   POST /tv/refresh    → read the mailbox now, then the same as GET /tv
 *   GET  /media         → lib/onair/media.js (AfterLife on-air export, cached 10 min; ?force=1 skips the cache)
 *   GET  /t?p&e&s       → an AfterLife thumbnail through a signed URL (public: img tags can't send the login header)
 *   GET  /v?ad&asset&e&s → a creative's real file: signed → AfterLife hands a fresh link (Dropbox file, else Meta) → 302 (public, like /t)
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

router.get('/v', async (req, res) => {
  const ad = String(req.query.ad || ''), asset = String(req.query.asset || '');
  if (!Media.verifyVideo(ad, asset, req.query.e, req.query.s)) return res.status(403).end();
  try {
    const url = await Media.playableUrl(ad, asset);
    if (!url) return res.status(404).json({ error: 'Meta didn’t return a playable link' });
    res.set('Cache-Control', 'no-store').redirect(302, url);
  } catch { res.status(502).end(); }
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
    if (sync.ok) Mail.backfillOnce().then(() => TV.clearLive());   // months of history, once, in the background
    res.json({ ...(await TV.buildTv('particle')), refreshed: sync });
  } catch (err) { fail(res, err, 'tv refresh'); }
});

router.get('/media', async (req, res) => {
  if (req.user?.role === 'Growth') return res.status(403).json({ error: 'Not part of the Growth Studio', code: 'growth_only' });
  try { res.set('Cache-Control', 'no-store').json(await Media.getMedia({ force: req.query.force === '1' })); } catch (err) { fail(res, err, 'media'); }
});

module.exports = router;
