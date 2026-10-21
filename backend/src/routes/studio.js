/**
 * Studio Control API — the studio management panel (dashboard, effort, TV ↔ productions, inspiration).
 * Editor+ with Particle brand access: it shows per-person effort and workload.
 */
const router = require('express').Router();
const { verifyJWT } = require('../middleware/auth');
const W = require('../lib/creative/week');
const { getStudio } = require('../lib/studio/data');
const { decide } = require('../lib/studio/tvLinks');
const { dailyInspiration, tmdbConfigured, testTmdb } = require('../lib/studio/inspiration');
const secrets = require('../lib/studio/secrets');
const monday = require('../lib/monday');
const bamboo = require('../lib/studio/bamboohr');

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const DEFAULT_BRAND = 'particle';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorJson(res, err, fallback = 'Server error') {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[studio]', err?.stack || err);
  res.status(status).json({ error: err?.message || fallback });
}

router.use(verifyJWT);
router.use((req, res, next) => {
  if ((RANK[req.user?.role] ?? -1) < RANK.Editor) return res.status(403).json({ error: 'Editor access required' });
  const brandId = String(req.query.brand_id || req.body?.brand_id || DEFAULT_BRAND);
  const u = req.user || {};
  if (!(u.super_admin || u.brand_id === brandId || (u.brand_ids || []).includes(brandId))) return res.status(403).json({ error: 'No access to this brand' });
  req.brandId = brandId;
  next();
});

/** Live dataset for a period (defaults to the current Israel week, Sun → today). */
router.get('/dashboard', async (req, res) => {
  try {
    const today = W.localDate(Date.now());
    const from = DATE_RE.test(req.query.from || '') ? req.query.from : W.sundayOf(Date.now());
    const to = DATE_RE.test(req.query.to || '') ? req.query.to : W.addDays(from, 6);
    if (W.daysBetween(from, to) > 120) return res.status(400).json({ error: 'Pick a period of 4 months or less' });
    const data = await getStudio({ brandId: req.brandId, from, to, force: req.query.force === '1' });
    res.json({ ...data, today });
  } catch (err) { errorJson(res, err); }
});

router.get('/inspiration', async (req, res) => {
  try {
    const date = DATE_RE.test(req.query.date || '') ? req.query.date : undefined;
    res.set('Cache-Control', 'private, max-age=600');
    res.json(await dailyInspiration(date));
  } catch (err) { errorJson(res, err); }
});

/** Human decision for a TV ticket: { production_id } links it, { decision: 'none' } = not a production, { decision: 'clear' } = back to auto. */
router.put('/tv-links/:itemId', async (req, res) => {
  try {
    const itemId = String(req.params.itemId);
    if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: 'Bad item id' });
    const decision = ['linked', 'none', 'clear'].includes(req.body?.decision) ? req.body.decision : 'linked';
    const productionId = req.body?.production_id ? String(req.body.production_id) : null;
    if (decision === 'linked' && !productionId) return res.status(400).json({ error: 'production_id required' });
    await decide(itemId, { productionId, decision, board: req.body?.board || null, user: req.user });
    monday.clearCache(`studio:${req.brandId}:`);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

// ── Connections (BambooHR / TMDB keys pasted here, sealed server-side, never sent back) ──
function requireAdmin(req, res, next) {
  if ((RANK[req.user?.role] ?? -1) < RANK.Admin && !req.user?.super_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/connections', async (req, res) => {
  try {
    const st = await secrets.secretStatus(req.brandId);
    const bc = await bamboo.creds().catch(() => null);
    res.json({
      monday: { connected: !!process.env.MONDAY_API_TOKEN },
      bamboohr: { connected: !!bc, source: bc?.source || null, subdomain: bc?.subdomain || null, ...(st.bamboohr || {}) },
      tmdb: { connected: await tmdbConfigured(), ...(st.tmdb || {}) },
    });
  } catch (err) { errorJson(res, err); }
});

router.put('/connections/bamboohr', requireAdmin, async (req, res) => {
  try {
    const subdomain = String(req.body?.subdomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\.bamboohr\.com.*$/, '');
    const apiKey = String(req.body?.api_key || '').trim();
    if (!/^[a-z0-9-]{2,63}$/.test(subdomain)) return res.status(400).json({ error: 'Company name looks wrong — use the part before .bamboohr.com' });
    if (!/^[A-Za-z0-9]{20,80}$/.test(apiKey)) return res.status(400).json({ error: 'That doesn’t look like a BambooHR API key' });
    const test = await bamboo.testConnection({ subdomain, api_key: apiKey });
    await secrets.setSecret('bamboohr', { subdomain, api_key: apiKey }, { brandId: req.brandId, user: req.user, meta: { subdomain, employees_visible: test.employees_visible } });
    bamboo.resetCache();
    monday.clearCache(`studio:${req.brandId}:`);
    res.json({ ok: true, ...test });
  } catch (err) { errorJson(res, err); }
});

router.delete('/connections/bamboohr', requireAdmin, async (req, res) => {
  try {
    await secrets.clearSecret('bamboohr', req.brandId);
    bamboo.resetCache();
    monday.clearCache(`studio:${req.brandId}:`);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

router.put('/connections/tmdb', requireAdmin, async (req, res) => {
  try {
    const key = String(req.body?.api_key || '').trim();
    if (!/^[A-Za-z0-9._-]{20,400}$/.test(key)) return res.status(400).json({ error: 'That doesn’t look like a TMDB key' });
    await testTmdb(key);
    await secrets.setSecret('tmdb', { api_key: key }, { brandId: req.brandId, user: req.user });
    monday.clearCache('tmdb:');
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

router.delete('/connections/tmdb', requireAdmin, async (req, res) => {
  try { await secrets.clearSecret('tmdb', req.brandId); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
});

module.exports = router;
