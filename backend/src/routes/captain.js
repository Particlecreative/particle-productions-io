/**
 * Captain Caption HQ API — /api/captain/*
 *
 * Public (before verifyJWT):
 *   GET  /thumb/:id?exp&sig            a check's still (HMAC-signed, short-lived URL from the list endpoints)
 *
 * Brief pre-flight — Medium with the service token (Authorization: Bearer $CAPTAIN_SERVICE_TOKEN), or a signed-in Editor:
 *   POST /check-brief                  one brief → { verdict, lines_checked, check_id, issues[], notes[], claims[] }
 *   POST /check-brief/:id/attach       { item_id, board_id?, override?: { by, reason } } → approved text + Monday update
 *   POST /check-brief/batch            Holiday Builder: { campaign?, offer?, …shared, briefs: [≤200] } → { batch_id }
 *   GET  /check-brief/batch/:id        status → verdict per brief + campaign summary
 *
 * Signed-in, Editor and up (everyone can view and give feedback):
 *   GET  /status                       connections, worker heartbeat, posting switch, queue
 *   POST /check                        manual check: { link } — Frame.io / Figma link, or a Monday item URL
 *   GET  /checks                       activity (search q, discipline, status, item_id, from, to, limit, offset)
 *   GET  /checks/:id                   one check + issues + its events
 *   POST /checks/:id/rerun             re-run (bypasses "already checked"; logs who)
 *   POST /issues/:id/feedback          { feedback: good_catch | not_a_typo }
 *   GET  /events                       raw event log
 *   GET  /brain                        Brain items
 *   GET  /import                       history import progress + report (counts, AI estimate)
 *   GET  /insights?days=90             caught before production (brief) vs after (video + design)
 * Admin:
 *   GET  /frameio/connect · DELETE /frameio    the Captain's own Frame.io sign-in
 *   GET|PUT /settings
 *   POST /brain · PUT /brain/:id · DELETE /brain/:id · POST /brain/bulk (approve / reject many)
 *   POST /import/start                 start the read-only history import (Brain bootstrap)
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { getConfig, saveConfig, BOARDS, disciplineOfBoard } = require('../lib/captain/config');
const { enqueue } = require('../lib/captain/queue');
const { logEvent } = require('../lib/captain/log');

const router = express.Router();
const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorJson(res, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[captain]', err.message);
  res.status(status).json({ error: err.message || 'Server error' });
}
const actorOf = (req) => req.user?.name || req.user?.email || String(req.user?.id || 'unknown');

// ── signed thumbnail URLs ────────────────────────────────────────────────────
const sign = (id, exp) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'x').update(`captain-thumb:${id}:${exp}`).digest('hex').slice(0, 32);
function thumbUrl(id) {
  const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
  return `/api/captain/thumb/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

router.get('/thumb/:id', async (req, res) => {
  const { id } = req.params;
  const exp = Number(req.query.exp);
  if (!UUID_RE.test(id) || !exp || exp < Date.now() / 1000) return res.status(404).end();
  const want = sign(id, exp), got = String(req.query.sig || '');
  if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.status(404).end();
  const { rows } = await db.query('SELECT thumb FROM captain_checks WHERE id = $1', [id]).catch(() => ({ rows: [] }));
  if (!rows[0]?.thumb) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=21600' }).send(rows[0].thumb);
});

// ── Brief pre-flight (Medium) ────────────────────────────────────────────────
// Medium calls these from inside CP with the service token, not a user session. A signed-in Editor can use them too
// (HQ → Check a link → "Check brief text").
const brief = () => require('../lib/captain/brief');
function serviceToken(req) {
  const h = String(req.get('authorization') || '');
  const m = h.match(/^Bearer\s+(.+)$/i);
  return req.get('x-captain-service-token') || (m ? m[1].trim() : null);
}
function isService(req) {
  const want = process.env.CAPTAIN_SERVICE_TOKEN || '';
  const got = serviceToken(req);
  if (want.length < 32 || !got) return false;
  const a = Buffer.from(String(got)), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function serviceOrEditor(req, res, next) {
  if (isService(req)) { req.service = 'medium'; return next(); }
  return verifyJWT(req, res, () => ((RANK[req.user?.role] ?? -1) >= RANK.Editor || req.user?.super_admin ? next() : res.status(403).json({ error: 'Editor access required' })));
}
const callerOf = (req) => (req.service ? `Medium${req.body?.author ? ` · ${String(req.body.author).slice(0, 80)}` : ''}` : actorOf(req));

router.post('/check-brief', serviceOrEditor, async (req, res) => {
  try {
    res.json(await brief().runBriefCheck(req.body, { trigger: req.service ? 'medium' : 'manual', actor: callerOf(req), force: !!req.body?.force }));
  } catch (err) {
    if (err.check_id) return res.status(err.status || 502).json({ error: err.message, check_id: err.check_id, verdict: 'error' });
    errorJson(res, err);
  }
});

router.post('/check-brief/batch', serviceOrEditor, async (req, res) => {
  try { res.status(202).json(await brief().startBatch(req.body, { actor: callerOf(req) })); } catch (err) { errorJson(res, err); }
});

router.get('/check-brief/batch/:id', serviceOrEditor, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = await brief().batchStatus(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    res.json(b);
  } catch (err) { errorJson(res, err); }
});

router.post('/check-brief/:id/attach', serviceOrEditor, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const isAdmin = (RANK[req.user?.role] ?? -1) >= RANK.Admin || req.user?.super_admin;
    const override = req.body?.override && (req.service || isAdmin) ? req.body.override : null;   // Medium logs which admin overrode
    res.json(await brief().attachApproved(req.params.id, { item_id: req.body?.item_id, board_id: req.body?.board_id, actor: callerOf(req), override }));
  } catch (err) { errorJson(res, err); }
});

// ════════════════════════════════════════════════════════════════════════════
router.use(verifyJWT);
router.use((req, res, next) => ((RANK[req.user?.role] ?? -1) >= RANK.Editor || req.user?.super_admin ? next() : res.status(403).json({ error: 'Editor access required' })));
const requireAdmin = (req, res, next) => ((RANK[req.user?.role] ?? -1) >= RANK.Admin || req.user?.super_admin ? next() : res.status(403).json({ error: 'Admin access required' }));

// ── status ───────────────────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const [frameio, figma, monday, cfg, worker, queue] = await Promise.all([
      require('../lib/captain/frameio').status().catch(e => ({ error: e.message })),
      require('../lib/captain/figma').status().catch(e => ({ error: e.message })),
      require('../lib/captain/monday').status().catch(e => ({ error: e.message })),
      getConfig(),
      db.query("SELECT captain_worker FROM settings WHERE brand_id = 'particle'").then(r => r.rows[0]?.captain_worker || null).catch(() => null),
      db.query(`SELECT status, COUNT(*)::int AS n FROM captain_jobs WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY status`).then(r => Object.fromEntries(r.rows.map(x => [x.status, x.n]))).catch(() => ({})),
    ]);
    const alive = worker?.at && Date.now() - new Date(worker.at).getTime() < 120000;
    res.json({
      frameio, figma, monday,
      gemini: { configured: !!process.env.GEMINI_API_KEY },
      anthropic: { configured: !!process.env.ANTHROPIC_API_KEY },
      worker: { ...(worker || {}), alive: !!alive },
      posting: cfg.posting, engines: cfg.engines, queue,
    });
  } catch (err) { errorJson(res, err); }
});

// ── manual check ─────────────────────────────────────────────────────────────
function parseMondayUrl(s) {
  const m = String(s || '').match(/monday\.com\/boards\/(\d+)(?:\/[^/]+)*?\/pulses\/(\d+)/);
  return m ? { board_id: m[1], item_id: m[2] } : null;
}

router.post('/check', async (req, res) => {
  try {
    const raw = String(req.body?.link || '').trim();
    if (!raw) return res.status(400).json({ error: 'Paste a Frame.io, Figma or Monday link' });
    const isAdmin = (RANK[req.user?.role] ?? -1) >= RANK.Admin || req.user?.super_admin;
    const override_scope = !!req.body?.override_scope && isAdmin;
    const force = !!req.body?.force;
    const actor = actorOf(req);
    const mon = parseMondayUrl(raw);
    const figma = require('../lib/captain/figma');
    let discipline, payload;
    if (mon) {
      discipline = disciplineOfBoard(mon.board_id);
      if (!discipline) return res.status(400).json({ error: "That Monday item isn't on the Video or Design board" });
      payload = { item_id: mon.item_id, trigger: 'manual', actor, force, override_scope };
    } else if (figma.parseUrl(raw)) {
      discipline = 'design';
      payload = { link: raw, trigger: 'manual', actor, force, override_scope };
    } else if (/frame\.io|f\.io\//i.test(raw)) {
      discipline = 'video';
      payload = { link: raw, trigger: 'manual', actor, force, override_scope };
    } else {
      return res.status(400).json({ error: "That doesn't look like a Frame.io, Figma or Monday link" });
    }
    const jobId = await enqueue(`${discipline}_check`, payload, { dedupeKey: `manual:${raw}:${force ? 'force' : ''}` });
    await logEvent({ kind: 'check', discipline, item_id: payload.item_id || null, message: `Manual check queued by ${actor}`, data: { link: raw, job_id: jobId, force, override_scope }, actor });
    res.json({ queued: !!jobId, job_id: jobId, discipline, already_queued: !jobId });
  } catch (err) { errorJson(res, err); }
});

router.get('/jobs', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, kind, status, attempts, last_error, payload, created_at, finished_at FROM captain_jobs ORDER BY id DESC LIMIT 20`);
    res.json({ jobs: rows });
  } catch (err) { errorJson(res, err); }
});

// ── activity ─────────────────────────────────────────────────────────────────
function prefixQuery(q) {
  const words = String(q || '').normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 6).map(w => `${w.toLowerCase()}:*`).join(' & ') || null;
}

router.get('/checks', async (req, res) => {
  try {
    const where = [], params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    const tq = prefixQuery(req.query.q);
    if (tq) {
      params.push(tq, `%${String(req.query.q).trim()}%`);
      const a = params.length - 1, b = params.length;
      where.push(`(c.search @@ to_tsquery('simple', $${a}) OR c.item_name ILIKE $${b}
                   OR EXISTS (SELECT 1 FROM captain_issues i WHERE i.check_id = c.id AND (i.search @@ to_tsquery('simple', $${a}) OR i.found ILIKE $${b} OR i.fix ILIKE $${b})))`);
    }
    if (req.query.discipline) add('c.discipline = ?', String(req.query.discipline));
    if (req.query.status) add('c.status = ANY(?)', String(req.query.status).split(','));
    if (req.query.item_id) add('c.item_id = ?', String(req.query.item_id));
    if (req.query.trigger) add('c.trigger = ?', String(req.query.trigger));
    if (req.query.department) add('c.department = ?', String(req.query.department));
    if (req.query.product) add('c.product = ?', String(req.query.product));
    if (req.query.person) add('c.person ILIKE ?', `%${req.query.person}%`);
    if (req.query.from) add('c.created_at >= ?::date', String(req.query.from));
    if (req.query.to) add("c.created_at < (?::date + INTERVAL '1 day')", String(req.query.to));
    const limit = Math.min(Number(req.query.limit) || 50, 200), offset = Math.max(Number(req.query.offset) || 0, 0);
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT c.id, c.discipline, c.status, c.skip_reason, c.trigger, c.board_id, c.item_id, c.item_name, c.department, c.product, c.campaign, c.person,
              c.scope_reason, c.deliverable, c.round, c.asset, c.engine, c.model, c.issue_count, c.cost_usd, c.duration_ms, c.error, c.posting, c.posted_at,
              c.requested_by, c.created_at, c.finished_at, (c.thumb IS NOT NULL) AS has_thumb,
              (SELECT json_agg(x ORDER BY x.idx) FROM (SELECT idx, found, fix, type, severity FROM captain_issues WHERE check_id = c.id ORDER BY idx LIMIT 4) x) AS top_issues
         FROM captain_checks c ${sqlWhere} ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const total = (await db.query(`SELECT COUNT(*)::int AS n FROM captain_checks c ${sqlWhere}`, params)).rows[0].n;
    res.json({ total, checks: rows.map(r => ({ ...r, thumb_url: r.has_thumb ? thumbUrl(r.id) : null, monday_url: r.item_id && r.board_id ? `https://particle-for-men.monday.com/boards/${r.board_id}/pulses/${r.item_id}` : null })) });
  } catch (err) { errorJson(res, err); }
});

router.get('/checks/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query('SELECT *, (thumb IS NOT NULL) AS has_thumb FROM captain_checks WHERE id = $1', [req.params.id]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });
    delete c.thumb; delete c.search;
    const issues = (await db.query('SELECT * FROM captain_issues WHERE check_id = $1 ORDER BY idx', [c.id])).rows.map(({ search, ...i }) => i);
    const events = (await db.query('SELECT id, kind, message, data, actor, created_at FROM captain_events WHERE check_id = $1 ORDER BY id', [c.id])).rows;
    res.json({ check: { ...c, thumb_url: c.has_thumb ? thumbUrl(c.id) : null, monday_url: c.item_id && c.board_id ? `https://particle-for-men.monday.com/boards/${c.board_id}/pulses/${c.item_id}` : null }, issues, events });
  } catch (err) { errorJson(res, err); }
});

router.post('/checks/:id/rerun', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const c = (await db.query('SELECT discipline, item_id, asset FROM captain_checks WHERE id = $1', [req.params.id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });
    const actor = actorOf(req);
    if (c.discipline === 'brief') {
      const jobId = await enqueue('brief_check', { check_id: req.params.id, actor }, { dedupeKey: `rerun:${req.params.id}`, maxAttempts: 1 });
      await logEvent({ kind: 'check', discipline: 'brief', check_id: req.params.id, message: `Re-run requested by ${actor}`, actor });
      return res.json({ queued: !!jobId, job_id: jobId });
    }
    const link = c.discipline === 'design' ? c.asset?.link : (c.asset?.view_url || c.asset?.link);
    if (!link && !c.item_id) return res.status(400).json({ error: 'Nothing to re-run — this check has no link' });
    const payload = c.discipline === 'design'
      ? { link, item_id: c.item_id || null, trigger: 'manual', actor, force: true }
      : { link, item_id: c.item_id || null, trigger: 'manual', actor, force: true, only_file_id: c.asset?.file_id || null };
    const jobId = await enqueue(`${c.discipline}_check`, payload, { dedupeKey: `rerun:${req.params.id}` });
    await logEvent({ kind: 'check', discipline: c.discipline, item_id: c.item_id, check_id: req.params.id, message: `Re-run requested by ${actor}`, actor });
    res.json({ queued: !!jobId, job_id: jobId });
  } catch (err) { errorJson(res, err); }
});

// ── feedback → teach the Captain ─────────────────────────────────────────────
// Findings from the brief pre-flight's code checks (measurements, offer facts) aren't words to whitelist — the feedback is
// recorded but nothing goes to the Brain. Claims marked "not an issue" are suggested for the claims sheet instead.
const CLAIM_TYPES = new Set(['claim', 'claim_unverified', 'claim_article']);
const RULE_TYPES = new Set(['reading_speed', 'vo_speed', 'timing', 'fit', 'missing_cta', 'missing_disclaimer', 'missing_code', 'missing_end_date', 'offer_code', 'offer_date',
  'offer_tier', 'price', 'leftover_code', 'leftover_date', 'campaign_code', 'campaign_date', 'campaign_price', 'inconsistent_code', 'inconsistent_date', 'inconsistent_guarantee',
  'translation_currency', 'brief_mismatch', 'brief_missing']);
router.post('/issues/:id/feedback', async (req, res) => {
  try {
    const fb = String(req.body?.feedback || '');
    if (!['good_catch', 'not_a_typo', ''].includes(fb)) return res.status(400).json({ error: 'feedback must be good_catch or not_a_typo' });
    const actor = actorOf(req);
    const { rows } = await db.query(
      `UPDATE captain_issues SET feedback = NULLIF($2, ''), feedback_by = $3, feedback_at = NOW() WHERE id = $1
       RETURNING id, check_id, found, fix, type, note`, [Number(req.params.id), fb, actor]);
    const issue = rows[0];
    if (!issue) return res.status(404).json({ error: 'Not found' });
    let learned = null;
    if (fb === 'not_a_typo' && issue.found && CLAIM_TYPES.has(issue.type)) {
      // "Not an issue" on a claim = it's an approved claim → suggest it for the claims sheet (review queue)
      const r = await db.query(
        `INSERT INTO captain_brain (type, title, content, discipline, scope, status, source, evidence, added_by)
         SELECT 'claim', $1, $2, 'both', CASE WHEN c.product IS NOT NULL THEN jsonb_build_object('product', c.product) ELSE '{}'::jsonb END, 'pending', 'feedback', $3, $4
           FROM captain_checks c WHERE c.id = $5
         ON CONFLICT DO NOTHING RETURNING id`,
        [String(issue.found).slice(0, 300), 'Marked "not an issue" on a brief claim', JSON.stringify({ issue_id: issue.id, check_id: issue.check_id }), actor, issue.check_id]);
      learned = r.rows[0]?.id || null;
    } else if (fb === 'not_a_typo' && issue.found && !RULE_TYPES.has(issue.type)) {
      // Goes to the review queue — nothing reaches the Captain's instructions until an admin approves it
      const r = await db.query(
        `INSERT INTO captain_brain (type, title, content, discipline, status, source, evidence, added_by)
         SELECT 'do_not_flag', $1, $2, CASE WHEN c.discipline IN ('video', 'design') THEN c.discipline ELSE 'both' END, 'pending', 'feedback', $3, $4 FROM captain_checks c WHERE c.id = $5
         ON CONFLICT DO NOTHING RETURNING id`,
        [String(issue.found).slice(0, 200), `Marked "not a typo" (Captain suggested "${issue.fix || ''}")`, JSON.stringify({ issue_id: issue.id, check_id: issue.check_id }), actor, issue.check_id]);
      learned = r.rows[0]?.id || null;
    }
    await logEvent({ kind: 'feedback', check_id: issue.check_id, message: `${actor}: ${fb === 'good_catch' ? '✅ Good catch' : fb === 'not_a_typo' ? '❌ Not a typo' : 'cleared feedback'} on "${issue.found}"`, data: { issue_id: issue.id, learned }, actor });
    res.json({ ok: true, learned });
  } catch (err) { errorJson(res, err); }
});

router.get('/events', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await db.query('SELECT * FROM captain_events ORDER BY id DESC LIMIT $1', [limit]);
    res.json({ events: rows });
  } catch (err) { errorJson(res, err); }
});

// Caught before production (brief pre-flight) vs after (video + design)
router.get('/insights', async (req, res) => {
  try { res.json(await brief().insights(req.query.days)); } catch (err) { errorJson(res, err); }
});

// ── the Brain ────────────────────────────────────────────────────────────────
const BRAIN_TYPES = ['term', 'do_not_flag', 'rule', 'reference_image', 'document', 'learned', 'insight', 'layout_limit', 'offer', 'price', 'claim'];
const LANES = ['Particle', 'SFY', 'GT', 'WAC'];
/** scope as sent by HQ → only known keys; lane must be one of the four. */
function cleanScope(scope = {}) {
  const out = {};
  for (const k of ['brand', 'product', 'campaign', 'department']) if (scope?.[k] && (!Array.isArray(scope[k]) || scope[k].length)) out[k] = scope[k];
  const lane = [].concat(scope?.lane || []).filter(l => LANES.includes(l));
  if (lane.length) out.lane = lane.length === 1 ? lane[0] : lane;
  return out;
}

router.get('/brain', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM captain_brain ORDER BY status = \'pending\' DESC, type, lower(title)');
    res.json({ items: rows });
  } catch (err) { errorJson(res, err); }
});

async function brainHistory(id, action, before, after, actor) {
  await db.query('INSERT INTO captain_brain_history (brain_id, action, before, after, actor) VALUES ($1,$2,$3,$4,$5)', [id, action, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, actor]);
}

router.post('/brain', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!BRAIN_TYPES.includes(b.type)) return res.status(400).json({ error: 'Unknown Brain type' });
    if (!String(b.title || '').trim()) return res.status(400).json({ error: 'A title is required' });
    const actor = actorOf(req);
    const fact = require('../lib/captain/briefRules').factData(b.type, b.data, b.content || null);
    const { rows } = await db.query(
      `INSERT INTO captain_brain (type, title, content, discipline, scope, active, status, source, added_by, data)
       VALUES ($1,$2,$3,$4,$5,true,'approved','manual',$6,$7) RETURNING *`,
      [b.type, String(b.title).trim().slice(0, 300), fact.content || null, ['video', 'design', 'both'].includes(b.discipline) ? b.discipline : 'both', JSON.stringify(cleanScope(b.scope)), actor, fact.data ? JSON.stringify(fact.data) : null]);
    await brainHistory(rows[0].id, 'create', null, rows[0], actor);
    await logEvent({ kind: 'brain', message: `${actor} added ${b.type} "${rows[0].title}"`, data: { id: rows[0].id }, actor });
    res.json({ item: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That item already exists' });
    errorJson(res, err);
  }
});

router.put('/brain/:id', requireAdmin, async (req, res) => {
  try {
    const before = (await db.query('SELECT * FROM captain_brain WHERE id = $1', [Number(req.params.id)])).rows[0];
    if (!before) return res.status(404).json({ error: 'Not found' });
    const b = { ...before, ...req.body };
    const actor = actorOf(req);
    const fact = require('../lib/captain/briefRules').factData(before.type, req.body?.data !== undefined ? req.body.data : before.data, b.content || null);
    const { rows } = await db.query(
      `UPDATE captain_brain SET title = $2, content = $3, discipline = $4, scope = $5, active = $6, status = $7, data = $8, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [before.id, String(b.title).trim().slice(0, 300), fact.content || null, ['video', 'design', 'both'].includes(b.discipline) ? b.discipline : 'both', JSON.stringify(req.body?.scope !== undefined ? cleanScope(b.scope) : (before.scope || {})), !!b.active, ['approved', 'pending', 'rejected'].includes(b.status) ? b.status : before.status, fact.data ? JSON.stringify(fact.data) : null]);
    await brainHistory(before.id, 'update', before, rows[0], actor);
    await logEvent({ kind: 'brain', message: `${actor} updated ${rows[0].type} "${rows[0].title}"${before.status !== rows[0].status ? ` (${before.status} → ${rows[0].status})` : ''}`, data: { id: before.id }, actor });
    res.json({ item: rows[0] });
  } catch (err) { errorJson(res, err); }
});

// Review queue: approve or reject many learned items at once
router.post('/brain/bulk', requireAdmin, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger).slice(0, 2000);
    const status = req.body?.status;
    if (!ids.length || !['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Pick items and approve or reject' });
    const actor = actorOf(req);
    const { rows: before } = await db.query('SELECT * FROM captain_brain WHERE id = ANY($1::int[])', [ids]);
    const { rows } = await db.query(
      `UPDATE captain_brain SET status = $2, active = $3, updated_at = NOW() WHERE id = ANY($1::int[]) RETURNING *`,
      [ids, status, status !== 'rejected'],
    );
    const prev = Object.fromEntries(before.map(b => [b.id, b]));
    for (const r of rows) await brainHistory(r.id, 'update', prev[r.id], r, actor);
    await logEvent({ kind: 'brain', message: `${actor} ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'reopened'} ${rows.length} Brain item${rows.length === 1 ? '' : 's'}`, data: { ids: rows.map(r => r.id), status }, actor });
    res.json({ updated: rows.length });
  } catch (err) { errorJson(res, err); }
});

router.delete('/brain/:id', requireAdmin, async (req, res) => {
  try {
    const before = (await db.query('SELECT * FROM captain_brain WHERE id = $1', [Number(req.params.id)])).rows[0];
    if (!before) return res.status(404).json({ error: 'Not found' });
    const actor = actorOf(req);
    await db.query('DELETE FROM captain_brain WHERE id = $1', [before.id]);
    await brainHistory(before.id, 'delete', before, null, actor);
    await logEvent({ kind: 'brain', message: `${actor} removed ${before.type} "${before.title}"`, data: { id: before.id }, actor });
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

// ── Brain bootstrap: the read-only history import ────────────────────────────
router.get('/import', async (req, res) => {
  try { res.json(await require('../lib/captain/importer').importStatus()); } catch (err) { errorJson(res, err); }
});
router.post('/import/start', requireAdmin, async (req, res) => {
  try {
    const actor = actorOf(req);
    const sources = Array.isArray(req.body?.sources) ? req.body.sources.filter(x => ['frameio', 'figma'].includes(x)) : ['frameio', 'figma'];
    const jobId = await enqueue('import_start', { actor, sources, since: req.body?.since || null }, { dedupeKey: 'import_start', priority: 5 });
    await logEvent({ kind: 'brain', message: `${actor} started the history import`, data: { job_id: jobId, sources }, actor });
    res.json({ queued: !!jobId, job_id: jobId });
  } catch (err) { errorJson(res, err); }
});

// ── admin: connections + settings ────────────────────────────────────────────
router.get('/frameio/connect', requireAdmin, (req, res) => {
  try { res.json({ url: require('../lib/captain/frameio').authorizeUrl(req.user.id) }); } catch (err) { err.status = 400; errorJson(res, err); }
});
router.delete('/frameio', requireAdmin, async (req, res) => {
  try {
    await require('../lib/captain/frameio').disconnect();
    await logEvent({ kind: 'connect', message: `${actorOf(req)} disconnected the Captain's Frame.io`, actor: actorOf(req) });
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

router.get('/settings', async (req, res) => {
  try { res.json({ settings: await getConfig(), boards: BOARDS }); } catch (err) { errorJson(res, err); }
});
router.put('/settings', requireAdmin, async (req, res) => {
  try {
    const before = await getConfig();
    const settings = await saveConfig(req.body || {});
    const actor = actorOf(req);
    const changed = Object.keys(req.body || {}).filter(k => JSON.stringify(before[k]) !== JSON.stringify(settings[k]));
    await logEvent({ kind: 'settings', message: `${actor} changed ${changed.join(', ') || 'nothing'}`, data: { changed, posting: settings.posting.mode }, actor });
    res.json({ settings });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
