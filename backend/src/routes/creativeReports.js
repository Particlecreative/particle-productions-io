/**
 * Creative Weekly — /api/creative-reports
 *
 * Public (declared before verifyJWT):
 *   GET  /share/:token                         public deck (pruned server-side) + media token + brand theme
 *   GET  /m/:reportId/:refId/:key/:variant     media (token-gated, allowlisted per report & audience)
 *   GET  /frameio/callback                     Adobe IMS OAuth callback (signed state)
 * Protected (Editor+, Particle access): config, integrations, list, generate, get, refresh, save, versions,
 *   finalize, share, media listings, warm-up, narrative, re-import CP weekly, delete (Admin).
 */
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const monday = require('../lib/monday');
const W = require('../lib/creative/week');
const { getCreativeConfig, saveCreativeConfig, validateTemplate, validateConfig } = require('../lib/creative/config');
const service = require('../lib/creative/service');
const media = require('../lib/creative/media');
const { publicReport, allowedMediaRefs, visibleTicketIds, coverSummary } = require('../lib/creative/deck');
const { importCpWeekly, cpWeeklyUpdatedAt, cpWeekFor, saveCpWeekly } = require('../lib/creative/cpWeekly');
const { canonicalUrl, linkKind } = require('../lib/creative/snapshot');

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const DEFAULT_BRAND = 'particle';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');

function errorJson(res, err, fallback = 'Server error') {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[creative-reports]', err?.stack || err);
  res.status(status).json({ error: err?.message || fallback, code: err?.code || undefined });
}

// ── Brand / logo for share pages (same source as weekly share) ─────────────
async function brandInfo(brandId) {
  try {
    const { rows } = await db.query('SELECT id, name, primary_color, secondary_color, accent_color, logo_url FROM brands WHERE id = $1', [brandId]);
    const brand = rows[0] || { id: brandId, name: brandId };
    const s = await db.query('SELECT logo_url, colors FROM settings WHERE brand_id = $1', [brandId]).catch(() => ({ rows: [] }));
    if (s.rows[0]?.logo_url) brand.logo_url = s.rows[0].logo_url;
    return { id: brand.id, name: brand.name, logo_url: brand.logo_url || null };
  } catch { return { id: brandId, name: brandId, logo_url: null }; }
}

// ── Report cache for media requests (avoid a DB hit per thumbnail) ─────────
const mediaReportCache = new Map();
async function reportForMedia(id) {
  const hit = mediaReportCache.get(id);
  if (hit && Date.now() - hit.at < 60000) return hit.row;
  const row = await service.getReport(id);
  mediaReportCache.set(id, { at: Date.now(), row });
  if (mediaReportCache.size > 200) mediaReportCache.delete(mediaReportCache.keys().next().value);
  return row;
}
function invalidateMedia(id) { mediaReportCache.delete(id); }

/**
 * Stream a credentialed upstream URL to the browser with Range passthrough (video seeking works),
 * without ever exposing the upstream URL. Aborts upstream when the client disconnects.
 */
async function streamProxy(req, res, { proxy, contentType }) {
  const { Readable } = require('stream');
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  let up;
  try {
    up = await fetch(proxy, { headers, signal: ac.signal });
  } catch (e) {
    if (!res.headersSent) res.status(502).end();
    return undefined;
  }
  if (!up.ok && up.status !== 206) { res.status(up.status === 409 ? 404 : 502).end(); return undefined; }
  res.status(up.status);
  res.set('Content-Type', contentType || up.headers.get('content-type') || 'application/octet-stream');
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = up.headers.get(h);
    if (v) res.set(h, v);
  }
  if (!up.headers.get('accept-ranges')) res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'private, max-age=300');
  res.set('X-Accel-Buffering', 'no'); // stream through nginx instead of spooling the whole file first
  if (!up.body) return res.end();
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  return undefined;
}

function shareActive(report) {
  return !!report?.share_token && (!report.share_expires_at || new Date(report.share_expires_at) > new Date());
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC
// ════════════════════════════════════════════════════════════════════════════

router.get('/share/:token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  try {
    const token = String(req.params.token || '');
    if (!/^[0-9a-f]{64}$/.test(token)) return res.status(404).json({ error: 'Link not found' });
    const { rows } = await db.query(`SELECT ${service.REPORT_COLS} FROM creative_reports WHERE share_token = $1`, [token]);
    const report = rows[0];
    if (!report) return res.status(404).json({ error: 'This link was revoked or does not exist' });
    if (report.share_expires_at && new Date(report.share_expires_at) < new Date()) return res.status(410).json({ error: 'This link has expired' });
    const m = media.mediaToken({ reportId: report.id, audience: 'public', shareToken: report.share_token, shareExpiresAt: report.share_expires_at });
    res.json({ report: publicReport(report), media: m, brand: await brandInfo(report.brand_id) });
  } catch (err) { errorJson(res, err); }
});

router.get('/m/:reportId/:refId/:key/:variant', async (req, res) => {
  try {
    const { reportId, variant } = req.params;
    let { refId, key } = req.params;
    if (!UUID_RE.test(reportId) || !['thumb', 'poster', 'play', 'full'].includes(variant)) return res.status(404).end();
    const tok = media.verifyMediaToken(String(req.query.mt || ''));
    if (!tok || tok.reportId !== reportId) return res.status(403).json({ error: 'Media link expired' });
    const report = await reportForMedia(reportId);
    if (!report) return res.status(404).end();
    if (tok.audience === 'public') {
      if (!shareActive(report) || media.shareTag(report.share_token) !== tok.shareTag) return res.status(403).json({ error: 'Share revoked' });
    }
    const snap = report.snapshot || {};
    const allowed = allowedMediaRefs(report, tok.audience);

    if (refId === 'item') {
      const item = snap.items?.[key];
      if (!item) return res.status(404).end();
      if (tok.audience === 'public' && !visibleTicketIds(report).has(String(item.id))) return res.status(403).end();
      const scoped = { ...item, media_refs: (item.media_refs || []).filter(r => allowed.has(r)) };
      const pick = await media.autoPick(scoped, snap.media_refs || {});
      if (!pick) return res.status(404).end();
      refId = pick.refId;
      key = pick.key;
    } else if (!allowed.has(refId)) {
      return res.status(403).end();
    }
    const ref = snap.media_refs?.[refId] || null;
    if (!ref) return res.status(404).end();

    if (variant === 'thumb' || variant === 'poster') {
      const out = await media.thumbBytes(ref, key);
      if (!out) return res.status(404).end();
      const etag = `"${crypto.createHash('sha1').update(out.bytes).digest('hex').slice(0, 20)}"`;
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.set('Content-Type', out.type || 'image/jpeg');
      res.set('Cache-Control', req.params.refId === 'item' ? 'private, max-age=3600' : 'private, max-age=86400');
      res.set('ETag', etag);
      return res.send(out.bytes);
    }
    const target = await media.freshUrl(ref, key, variant);
    if (!target) return res.status(404).end();
    res.set('Cache-Control', 'no-store');
    if (typeof target === 'string') return res.redirect(302, target);
    return streamProxy(req, res, target);
  } catch (err) {
    console.warn('[creative media]', err.message);
    res.status(502).end();
  }
});

/** Best visual per ticket ({ refId, key, kind }) so slides know what can autoplay. */
async function computePicks(report, audience, itemIds = null) {
  const snap = report.snapshot || {};
  const allowed = allowedMediaRefs(report, audience);
  const visible = audience === 'public' ? visibleTicketIds(report) : null;
  const wanted = itemIds || [...new Set([
    ...(snap.sections?.delivered || []),
    ...(snap.sections?.review || []), ...(snap.sections?.in_progress || []), ...(snap.sections?.fixes || []),
    ...(snap.sections?.planned_next_week || []).slice(0, 30),
  ])];
  const ids = wanted.filter(id => snap.items?.[id] && (!visible || visible.has(String(id)))).slice(0, 150);
  const picks = {};
  const deadline = Date.now() + 25000;
  let i = 0;
  const worker = async () => {
    while (i < ids.length && Date.now() < deadline) {
      const item = snap.items[ids[i++]];
      try {
        const scoped = { ...item, media_refs: (item.media_refs || []).filter(r => allowed.has(r)) };
        const p = await media.autoPick(scoped, snap.media_refs || {});
        picks[item.id] = p || null;
      } catch { picks[item.id] = null; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { picks, complete: i >= ids.length };
}

/** Public file listing for the in-deck media viewer (only media of visible tickets). */
router.get('/share/:token/media/:refId', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const token = String(req.params.token || '');
    if (!/^[0-9a-f]{64}$/.test(token)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(`SELECT ${service.REPORT_COLS} FROM creative_reports WHERE share_token = $1`, [token]);
    const report = rows[0];
    if (!report || !shareActive(report)) return res.status(404).json({ error: 'Not found' });
    if (!allowedMediaRefs(report, 'public').has(req.params.refId)) return res.status(403).json({ error: 'Not available' });
    const ref = report.snapshot?.media_refs?.[req.params.refId];
    if (!ref) return res.status(404).json({ error: 'Unknown media source' });
    const { entries, error } = await media.getListing(ref);
    res.json({ ref: { id: req.params.refId, kind: ref.kind, item_id: ref.item_id }, entries, error });
  } catch (err) { errorJson(res, err); }
});

router.get('/share/:token/picks', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const token = String(req.params.token || '');
    if (!/^[0-9a-f]{64}$/.test(token)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(`SELECT ${service.REPORT_COLS} FROM creative_reports WHERE share_token = $1`, [token]);
    const report = rows[0];
    if (!report || !shareActive(report)) return res.status(404).json({ error: 'Not found' });
    res.json(await computePicks(report, 'public'));
  } catch (err) { errorJson(res, err); }
});

router.get('/frameio/callback', async (req, res) => {
  const back = (status, msg) => res.redirect(`${appUrl()}/creative-reports?frameio=${status}${msg ? `&msg=${encodeURIComponent(msg.slice(0, 160))}` : ''}`);
  try {
    const fio = require('../lib/creative/providers/frameio');
    if (req.query.error) return back('error', String(req.query.error_description || req.query.error));
    const st = fio.verifyState(String(req.query.state || ''));
    const t = await fio.exchangeCode(String(req.query.code || ''), st.uid);
    if (t?.last_error) return back('error', t.last_error);
    return back('connected');
  } catch (err) {
    console.error('[frameio callback]', err.message);
    return back('error', err.message);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PROTECTED
// ════════════════════════════════════════════════════════════════════════════
router.use(verifyJWT);

function canAccessBrand(user, brandId) {
  return !!(user?.super_admin || user?.brand_id === brandId || (user?.brand_ids || []).includes(brandId));
}
function requireCreative(req, res, next) {
  if ((RANK[req.user?.role] ?? -1) < RANK.Editor) return res.status(403).json({ error: 'Editor access required' });
  const brandId = String(req.query.brand_id || req.body?.brand_id || DEFAULT_BRAND);
  if (!canAccessBrand(req.user, brandId)) return res.status(403).json({ error: 'No access to this brand' });
  req.brandId = brandId;
  next();
}
function requireAdminRole(req, res, next) {
  if ((RANK[req.user?.role] ?? -1) < RANK.Admin && !req.user?.super_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}
router.use(requireCreative);

/** Load :id, enforce brand access, attach as req.report */
router.param('id', async (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Not found' });
  try {
    const report = await service.getReport(id);
    if (!report) return res.status(404).json({ error: 'Not found' });
    if (!canAccessBrand(req.user, report.brand_id)) return res.status(403).json({ error: 'No access to this brand' });
    req.report = report;
    next();
  } catch (err) { errorJson(res, err); }
});

function withMedia(report, extra = {}) {
  return { report, media: media.mediaToken({ reportId: report.id, audience: 'internal' }), ...extra };
}

// ── Config & integrations ──────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try { res.json({ config: await getCreativeConfig(req.brandId) }); } catch (err) { errorJson(res, err); }
});

router.put('/config', requireAdminRole, async (req, res) => {
  try {
    const patch = req.body?.config || {};
    if (patch.default_template) validateTemplate(patch.default_template);
    const next = await saveCreativeConfig(req.brandId, patch);
    res.json({ config: next, warnings: await validateConfig(next) });
  } catch (err) { err.status = err.status || 400; errorJson(res, err); }
});

router.put('/config/template', async (req, res) => {
  try {
    let tpl = req.body?.template;
    if (!tpl && req.body?.from_report_id && UUID_RE.test(req.body.from_report_id)) tpl = (await service.getReport(req.body.from_report_id))?.template;
    validateTemplate(tpl);
    const next = await saveCreativeConfig(req.brandId, { default_template: { version: (tpl.version || 1), slides: tpl.slides } });
    res.json({ template: next.default_template });
  } catch (err) { err.status = err.status || 400; errorJson(res, err); }
});

router.get('/integrations', async (req, res) => {
  const out = { monday: null, dropbox: null, frameio: null, anthropic: { configured: !!process.env.ANTHROPIC_API_KEY } };
  try {
    const config = await getCreativeConfig(req.brandId);
    try {
      await Promise.all(Object.values(config.boards).map(b => monday.boardMeta(b.board_id)));
      out.monday = { ok: true, warnings: await validateConfig(config) };
    } catch (e) { out.monday = { ok: false, error: e.message }; }
    // Sample a Dropbox folder link from the latest report to test shared-link scopes
    let sample = null;
    try {
      const { rows } = await db.query(
        `SELECT snapshot->'media_refs' AS refs FROM creative_reports WHERE brand_id = $1 ORDER BY week_start DESC LIMIT 1`, [req.brandId]);
      const refs = rows[0]?.refs || {};
      sample = Object.values(refs).find(r => r.kind === 'dropbox_folder')?.url || null;
    } catch { sample = null; }
    out.dropbox = await require('../lib/creative/providers/dropbox').health(sample);
    out.frameio = await require('../lib/creative/providers/frameio').status();
    out.figma = await require('../lib/creative/providers/figma').health();
    res.json(out);
  } catch (err) { errorJson(res, err); }
});

router.get('/frameio/connect', requireAdminRole, (req, res) => {
  try { res.json({ url: require('../lib/creative/providers/frameio').authorizeUrl(req.user.id) }); } catch (err) { err.status = 400; errorJson(res, err); }
});

router.delete('/frameio', requireAdminRole, async (req, res) => {
  try { await require('../lib/creative/providers/frameio').disconnect(); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
});

// ── List / lookup / generate ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const rows = await service.listReports(req.brandId);
    const current = W.sundayOf(Date.now());
    res.json({ reports: rows.map(coverSummary), current_week: current, review_week: W.reviewWeekOf(Date.now()) });
  } catch (err) { errorJson(res, err); }
});

router.get('/weeks/:weekStart', async (req, res) => {
  try {
    const ws = String(req.params.weekStart);
    W.weekBounds(ws);
    const report = await service.getReportByWeek(req.brandId, ws);
    res.json(report ? withMedia(report) : { report: null });
  } catch (err) { err.status = err.status || 400; errorJson(res, err); }
});

router.post('/generate', async (req, res) => {
  try {
    // Presented on Sunday about the Sun–Thu that just ended → default to the week the next Sunday reviews
    const weekStart = String(req.body?.week_start || W.reviewWeekOf(Date.now()));
    try { W.weekBounds(weekStart); } catch (e) { return res.status(400).json({ error: e.message }); }
    const { report, created } = await service.generateReport({ brandId: req.brandId, weekStart, user: req.user });
    if (!created) return res.status(409).json({ error: 'A deck already exists for this week', id: report.id });
    res.status(201).json(withMedia(report));
  } catch (err) { errorJson(res, err, 'Could not generate the deck'); }
});

// ── Single report ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const r = req.report;
    let cpStale = false;
    try {
      const cur = await cpWeeklyUpdatedAt(r.brand_id, cpWeekFor(r.week_start));
      cpStale = (cur || null) !== (r.snapshot?.cp_weekly?.updated_at || null);
    } catch { cpStale = false; }
    res.json(withMedia(r, { cp_weekly_stale: cpStale }));
  } catch (err) { errorJson(res, err); }
});

router.put('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) return res.status(413).json({ error: 'Deck edits too large' });
    const base = Number(body.base_revision);
    if (!Number.isInteger(base)) return res.status(400).json({ error: 'base_revision required' });
    const patch = {};
    for (const k of ['overrides', 'template', 'narrative', 'title']) if (k in body) patch[k] = body[k];
    if (req.report.status === 'final' && ('overrides' in patch || 'template' in patch || 'narrative' in patch)) {
      return res.status(423).json({ error: 'This deck is marked final — unlock it to edit', revision: req.report.revision });
    }
    if (patch.template) validateTemplate(patch.template);
    if (patch.overrides && (typeof patch.overrides !== 'object' || Array.isArray(patch.overrides))) return res.status(400).json({ error: 'overrides must be an object' });
    const r = await service.updateReport(req.report.id, base, patch);
    if (r.conflict != null) return res.status(409).json({ error: 'Edited elsewhere', revision: r.conflict, report: r.report });
    invalidateMedia(req.report.id);
    res.json({ revision: r.report.revision, updated_at: r.report.updated_at });
  } catch (err) { err.status = err.status || 400; errorJson(res, err); }
});

router.post('/:id/refresh', async (req, res) => {
  try {
    if (req.report.status === 'final' && !req.body?.force) return res.status(423).json({ error: 'This deck is marked final — unlock it to refresh' });
    const { report, diff } = await service.refreshReport(req.report, { user: req.user, dryRun: !!req.body?.dry_run });
    invalidateMedia(req.report.id);
    res.json(withMedia(report, { diff }));
  } catch (err) { errorJson(res, err, 'Refresh failed'); }
});

// A Frame.io / Dropbox link added by hand (e.g. the cut for a production slide). Stored as a media ref in the
// snapshot (marked custom, kept on refresh) so it plays through the same signed media route as ticket media.
router.post('/:id/link-media', async (req, res) => {
  try {
    const url = canonicalUrl(String(req.body?.url || '').trim());
    const kind = linkKind(url);
    if (!url || !['frameio', 'dropbox_file', 'dropbox_folder'].includes(kind)) return res.status(400).json({ error: 'Paste a Frame.io or Dropbox link' });
    const refId = crypto.createHash('sha1').update(`${kind}|${url}`).digest('hex').slice(0, 16);
    let report = req.report;
    if (!report.snapshot?.media_refs?.[refId]) {
      const snapshot = { ...report.snapshot, media_refs: { ...(report.snapshot?.media_refs || {}), [refId]: { kind, url, item_id: null, custom: true } } };
      const r = await service.updateReport(report.id, report.revision, { snapshot });
      if (r.conflict != null) return res.status(409).json({ error: 'Edited elsewhere — reload and try again', revision: r.conflict });
      report = r.report;
    }
    const { entries, error } = await media.getListing(report.snapshot.media_refs[refId]);
    res.json({ ...withMedia(report), refId, entries, error: error || null });
  } catch (err) { errorJson(res, err); }
});

// Edit the CP weekly from the deck: written back to weekly_reports (the old Weekly shows it), then re-imported here
router.put('/:id/cp-weekly', async (req, res) => {
  const reimport = async (report) => {
    const cp = await importCpWeekly(report.brand_id, cpWeekFor(report.week_start));
    const r = await service.updateReport(report.id, report.revision, { snapshot: { ...report.snapshot, cp_weekly: cp } });
    return r.conflict != null ? null : r.report;
  };
  try {
    const { production = null, general_updates: generalUpdates = null } = req.body || {};
    if (!production && !Array.isArray(generalUpdates)) return res.status(400).json({ error: 'Nothing to save' });
    try {
      await saveCpWeekly(req.report.brand_id, cpWeekFor(req.report.week_start), {
        baseUpdatedAt: req.report.snapshot?.cp_weekly?.updated_at || null, production, generalUpdates,
      });
    } catch (e) {
      if (e.code !== 'CP_WEEKLY_CHANGED') throw e;
      // Someone edited the weekly — bring the latest into the deck so the edit can be re-applied on top
      const fresh = await reimport(req.report);
      return res.status(409).json({ error: 'The CP weekly was edited elsewhere — I loaded the latest version; please re-apply your change', ...(fresh ? withMedia(fresh) : {}) });
    }
    const report = await reimport(req.report);
    if (!report) return res.status(409).json({ error: 'Edited elsewhere — reload and try again' });
    res.json(withMedia(report));
  } catch (err) { errorJson(res, err); }
});

router.post('/:id/import-weekly', async (req, res) => {
  try {
    const cp = await importCpWeekly(req.report.brand_id, cpWeekFor(req.report.week_start));
    const snapshot = { ...req.report.snapshot, cp_weekly: cp };
    const r = await service.updateReport(req.report.id, req.report.revision, { snapshot });
    if (r.conflict != null) return res.status(409).json({ error: 'Edited elsewhere — reload and try again', revision: r.conflict });
    res.json(withMedia(r.report));
  } catch (err) { errorJson(res, err); }
});

router.post('/:id/narrative', async (req, res) => {
  try {
    const { generateNarrative } = require('../lib/creative/narrative');
    const narrative = await generateNarrative(req.report, { previous: req.report.narrative, force: !!req.body?.force });
    let r = await service.updateReport(req.report.id, req.report.revision, { narrative });
    if (r.conflict != null) r = await service.updateReport(req.report.id, r.conflict, { narrative });
    res.json({ narrative, revision: r.report?.revision });
  } catch (err) { errorJson(res, err, 'Could not write the summary'); }
});

// ── Status / versions ──────────────────────────────────────────────────────
router.post('/:id/finalize', async (req, res) => {
  try { res.json(withMedia(await service.setStatus(req.report, 'final', req.user))); } catch (err) { errorJson(res, err); }
});
router.post('/:id/unfinalize', async (req, res) => {
  try { res.json(withMedia(await service.setStatus(req.report, 'draft', req.user))); } catch (err) { errorJson(res, err); }
});

router.get('/:id/versions', async (req, res) => {
  try { res.json({ versions: await service.listVersions(req.report.id) }); } catch (err) { errorJson(res, err); }
});
router.post('/:id/versions', async (req, res) => {
  try {
    const v = await service.saveVersion(req.report, { reason: 'manual', label: String(req.body?.label || '').slice(0, 80) || null, user: req.user });
    res.status(201).json({ version: v });
  } catch (err) { errorJson(res, err); }
});
router.get('/:id/versions/:vid', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.vid)) return res.status(404).json({ error: 'Not found' });
    const v = await service.getVersion(req.report.id, req.params.vid);
    if (!v) return res.status(404).json({ error: 'Not found' });
    res.json({ version: v });
  } catch (err) { errorJson(res, err); }
});
router.post('/:id/versions/:vid/restore', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.vid)) return res.status(404).json({ error: 'Not found' });
    const v = await service.getVersion(req.report.id, req.params.vid);
    if (!v) return res.status(404).json({ error: 'Not found' });
    const r = await service.restoreVersion(req.report, v, req.user);
    invalidateMedia(req.report.id);
    res.json(withMedia(r));
  } catch (err) { errorJson(res, err); }
});

// ── Share ──────────────────────────────────────────────────────────────────
router.post('/:id/share', async (req, res) => {
  try {
    const days = req.body?.expires_in_days === null ? null : Number(req.body?.expires_in_days ?? 30);
    if (days !== null && (!Number.isFinite(days) || days < 1 || days > 365)) return res.status(400).json({ error: 'expires_in_days must be 1–365 or null' });
    const rotate = !!req.body?.rotate;
    const token = (!rotate && req.report.share_token) ? req.report.share_token : crypto.randomBytes(32).toString('hex');
    const { rows } = await db.query(
      `UPDATE creative_reports SET share_token = $2,
              share_expires_at = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() + ($3::int * INTERVAL '1 day') END,
              share_created_at = COALESCE(CASE WHEN share_token = $2 THEN share_created_at END, NOW()), updated_at = NOW()
        WHERE id = $1 RETURNING share_token, share_expires_at, share_created_at`,
      [req.report.id, token, days]);
    invalidateMedia(req.report.id);
    res.json({ ...rows[0], path: `/creative-report/${rows[0].share_token}` });
  } catch (err) { errorJson(res, err); }
});

router.delete('/:id/share', async (req, res) => {
  try {
    await db.query('UPDATE creative_reports SET share_token = NULL, share_expires_at = NULL, share_created_at = NULL, updated_at = NOW() WHERE id = $1', [req.report.id]);
    invalidateMedia(req.report.id);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

// ── Media listings / warm-up ───────────────────────────────────────────────
router.get('/:id/picks', async (req, res) => {
  try {
    const ids = req.query.ids ? String(req.query.ids).split(',').filter(Boolean).slice(0, 150) : null;
    res.json(await computePicks(req.report, 'internal', ids));
  } catch (err) { errorJson(res, err); }
});

router.get('/:id/media/:refId', async (req, res) => {
  try {
    const ref = req.report.snapshot?.media_refs?.[req.params.refId];
    if (!ref) return res.status(404).json({ error: 'Unknown media source' });
    const { entries, error, resolved } = await media.getListing(ref, { force: req.query.refresh === '1' });
    res.json({ ref: { id: req.params.refId, kind: ref.kind, url: ref.url || null, item_id: ref.item_id }, entries, error, resolved: resolved || null });
  } catch (err) { errorJson(res, err); }
});

router.post('/:id/media/warm', async (req, res) => {
  try {
    const snap = req.report.snapshot || {};
    const ids = (Array.isArray(req.body?.item_ids) && req.body.item_ids.length ? req.body.item_ids : snap.sections?.delivered || [])
      .filter(id => snap.items?.[id]).slice(0, 120);
    const deadline = Date.now() + 50000;
    let warmed = 0, missing = 0, i = 0;
    const worker = async () => {
      while (i < ids.length && Date.now() < deadline) {
        const item = snap.items[ids[i++]];
        try {
          const pick = await media.autoPick(item, snap.media_refs || {});
          if (!pick) { missing++; continue; }
          const out = await media.thumbBytes(snap.media_refs[pick.refId], pick.key);
          if (out) warmed++; else missing++;
        } catch { missing++; }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    res.json({ warmed, missing, total: ids.length, done: i >= ids.length });
  } catch (err) { errorJson(res, err); }
});

router.delete('/:id', requireAdminRole, async (req, res) => {
  try {
    await db.query('DELETE FROM creative_reports WHERE id = $1', [req.report.id]);
    invalidateMedia(req.report.id);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
