/**
 * MEDIUM 🔮 API — /api/medium/*  (signed-in Editor and up; settings and imports are Admin)
 *
 *   GET  /overview                     Strategy Room: queue, beliefs, tests, sources, next holidays
 *   GET  /corpus · /corpus/exemplars   what it learns from: corpus mix, templates, donors · the briefs themselves
 *   POST /corpus/ingest                (admin) re-read the corpus from Monday — read-only, on the worker
 *   POST /generate                     Brief Generator: { lane, product, format, move, kind?, count, note?, template?, campaign?, offer?, article_url? }
 *   POST /freeform                     Freeform Brief: { idea, references[], lane?, product?, format?, campaign? }
 *   GET  /briefs · /briefs/:id         the queue
 *   PUT  /briefs/:id                   edit (stored as a diff) → style check + Captain pre-flight again
 *   POST /briefs/:id/approve|reject|regenerate
 *   GET|PUT /config · GET /affinity · GET /beliefs · PUT /beliefs/:id
 *
 * Nothing reaches Monday without an approve click, and nothing reaches Monday at all while monday_submit is off
 * (shadow mode, the default).
 */
const express = require('express');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { getConfig, saveConfig, seed, LANES, MOVES, PRODUCTS, LANE_RULES } = require('../lib/medium/config');
const { enqueue } = require('../lib/captain/queue');
const { KINDS, KIND_LABEL } = require('../lib/medium/classify');
const calendar = require('../lib/medium/calendar');

const router = express.Router();
const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANE_NAMES = LANES.map(l => l.name);
const actorOf = (req) => req.user?.name || req.user?.email || String(req.user?.id || 'unknown');
const isAdmin = (req) => (RANK[req.user?.role] ?? -1) >= RANK.Admin || req.user?.super_admin;
function errorJson(res, err) {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[medium]', err.message);
  res.status(status).json({ error: err.message || 'Server error' });
}
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

router.use(verifyJWT);
router.use((req, res, next) => ((RANK[req.user?.role] ?? -1) >= RANK.Editor || req.user?.super_admin ? next() : res.status(403).json({ error: 'Editor access required' })));
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: 'Admin access required' }));

// ── Strategy Room ────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    await seed().catch(() => null);
    const cfg = await getConfig();
    const [counts, beliefs, tests, donors, corpusRow, afterlife, worker, recent] = await Promise.all([
      db.query(`SELECT status, lane, COUNT(*)::int AS n FROM medium_briefs GROUP BY status, lane`),
      db.query(`SELECT * FROM medium_beliefs WHERE status <> 'retired' ORDER BY CASE status WHEN 'proven' THEN 0 WHEN 'testing' THEN 1 ELSE 2 END, id`),
      db.query(`SELECT * FROM medium_tests WHERE status IN ('idea', 'running') ORDER BY created_at DESC LIMIT 20`),
      db.query(`SELECT brand, takes, usage_count FROM medium_donors ORDER BY usage_count DESC, brand LIMIT 8`),
      db.query(`SELECT COUNT(*) FILTER (WHERE NOT excluded)::int AS used, COUNT(*)::int AS total, MAX(ingested_at) AS at FROM medium_exemplars`),
      require('../lib/medium/afterlife').status(),
      db.query("SELECT captain_worker FROM settings WHERE brand_id = 'particle'").then(r => r.rows[0]?.captain_worker || null).catch(() => null),
      db.query(`SELECT id, status, source, lane, product, format, move, ticket_name, score->>'total' AS score, preflight->>'verdict' AS preflight, created_at FROM medium_briefs ORDER BY created_at DESC LIMIT 8`),
    ]);
    res.json({
      counts: counts.rows, beliefs: beliefs.rows, tests: tests.rows, donors: donors.rows, recent: recent.rows,
      sources: {
        afterlife, upspring: { connected: false, snapshot: !!cfg.upspring_snapshot }, corpus: corpusRow.rows[0],
        monday: { submit: !!cfg.monday_submit }, worker: { alive: !!(worker?.at && Date.now() - new Date(worker.at).getTime() < 120000) },
      },
      language_bank: cfg.language_bank || [], holidays: calendar.upcoming(new Date(), 3),
      autopilot: { ...(cfg.autopilot || {}), last_run: cfg.state?.autopilot_at || null }, outcomes_at: cfg.state?.outcomes_at || null, monday_submit: !!cfg.monday_submit,
      options: { lanes: LANE_NAMES, moves: MOVES, products: PRODUCTS, kinds: KINDS.map(k => ({ id: k, label: KIND_LABEL[k] })), lane_rules: LANE_RULES },
    });
  } catch (err) { errorJson(res, err); }
});

// ── what it learns from ──────────────────────────────────────────────────────
router.get('/corpus', async (req, res) => {
  try {
    await seed().catch(() => null);
    const [stats, templates, donors, job, cfg] = await Promise.all([
      require('../lib/medium/corpus').corpusStats(),
      db.query(`SELECT * FROM medium_templates ORDER BY usage_count DESC, name`),
      db.query(`SELECT * FROM medium_donors ORDER BY usage_count DESC, brand`),
      db.query(`SELECT status, last_error, created_at, finished_at, result FROM captain_jobs WHERE kind = 'medium_ingest' ORDER BY id DESC LIMIT 1`),
      getConfig(),
    ]);
    res.json({ stats, templates: templates.rows, donors: donors.rows, ingest: job.rows[0] || null, style_guide_chars: String(cfg.style_guide || '').length, requesters: cfg.corpus.requesters, since: cfg.corpus.since });
  } catch (err) { errorJson(res, err); }
});

router.get('/corpus/exemplars', async (req, res) => {
  try {
    const where = [], params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.q) { params.push(String(req.query.q)); const i = params.length; where.push(`(search @@ plainto_tsquery('simple', $${i}) OR name ILIKE '%' || $${i} || '%')`); }
    if (req.query.kind) add('kind = ?', String(req.query.kind));
    if (req.query.lane) add('lane = ?', String(req.query.lane));
    if (req.query.format) add('format = ?', String(req.query.format));
    if (req.query.excluded !== '1') where.push('NOT excluded');
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { rows } = await db.query(
      `SELECT id, board_id, item_id, format, name, product, kind, lane, template, persona, tool_tokens, excluded, exclude_reason, monday_created, winner,
              left(coalesce(brief, first_update, ''), 600) AS brief, left(coalesce(script, copy, ''), 600) AS body
         FROM medium_exemplars ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY monday_created DESC NULLS LAST LIMIT ${limit}`, params);
    res.json({ exemplars: rows });
  } catch (err) { errorJson(res, err); }
});

router.post('/corpus/ingest', requireAdmin, async (req, res) => {
  try {
    const jobId = await enqueue('medium_ingest', { actor: actorOf(req) }, { dedupeKey: 'medium_ingest', priority: 4, maxAttempts: 2 });
    res.json({ queued: !!jobId, job_id: jobId, already_queued: !jobId });
  } catch (err) { errorJson(res, err); }
});

// ── writing briefs ───────────────────────────────────────────────────────────
function cleanRequest(b, actor) {
  const lane = LANE_NAMES.includes(b.lane) ? b.lane : 'Particle';
  const format = b.format === 'design' ? 'design' : 'video';
  const move = Object.keys(MOVES).includes(b.move) ? b.move : 'NEW_ANGLE';
  const str = (v, n = 300) => (v ? String(v).trim().slice(0, n) : null);
  const offer = b.offer && (b.offer.code || b.offer.tier || b.offer.ends) ? { code: str(b.offer.code, 30), tier: Number(b.offer.tier) || null, ends: str(b.offer.ends, 10) } : null;
  return {
    lane, format, move, kind: KINDS.includes(b.kind) ? b.kind : null, product: str(b.product, 120), note: str(b.note, 2000), template: str(b.template, 120),
    campaign: str(b.campaign, 120), offer, article_url: str(b.article_url, 500), source: str(b.source, 1000), author: actor,
    // transfers: where the concept comes from (one axis per test)
    source_product: str(b.source_product, 120), source_lane: LANE_NAMES.includes(b.source_lane) ? b.source_lane : null, source_format: ['video', 'design'].includes(b.source_format) ? b.source_format : null,
  };
}

router.post('/generate', async (req, res) => {
  try {
    const actor = actorOf(req);
    const r = cleanRequest(req.body || {}, actor);
    if (!r.product) throw bad('Pick a product');
    const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 6);
    const batch = count > 1 ? require('crypto').randomUUID() : null;
    const ids = [];
    for (let k = 0; k < count; k++) {
      const { rows } = await db.query(
        `INSERT INTO medium_briefs (status, source, author, lane, product, format, move, request) VALUES ('QUEUED', 'generator', $1, $2, $3, $4, $5, $6) RETURNING id`,
        [actor, r.lane, r.product, r.format, r.move, JSON.stringify({ ...r, batch_id: batch, variant: k + 1, of: count })]);
      ids.push(rows[0].id);
      await enqueue('medium_generate', { brief_id: rows[0].id }, { dedupeKey: `medium_generate:${rows[0].id}`, priority: 8, maxAttempts: 1 });
    }
    res.json({ queued: ids.length, ids });
  } catch (err) { errorJson(res, err); }
});

router.post('/freeform', async (req, res) => {
  try {
    const actor = actorOf(req);
    const idea = String(req.body?.idea || '').trim();
    if (idea.length < 12) throw bad('Write the idea in a sentence or two');
    const refs = (Array.isArray(req.body?.references) ? req.body.references : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 8);
    const base = cleanRequest(req.body || {}, actor);
    const request = { idea: idea.slice(0, 6000), references: refs, lane: req.body?.lane ? base.lane : null, product: base.product, format: req.body?.format ? base.format : null, campaign: base.campaign, author: actor };
    const { rows } = await db.query(
      `INSERT INTO medium_briefs (status, source, author, lane, product, format, move, request) VALUES ('QUEUED', 'freeform', $1, $2, $3, $4, 'FREEFORM', $5) RETURNING id`,
      [actor, request.lane, request.product, request.format, JSON.stringify(request)]);
    await enqueue('medium_freeform', { brief_id: rows[0].id }, { dedupeKey: `medium_freeform:${rows[0].id}`, priority: 8, maxAttempts: 1 });
    res.json({ queued: 1, id: rows[0].id });
  } catch (err) { errorJson(res, err); }
});

// ── the queue ────────────────────────────────────────────────────────────────
router.get('/briefs', async (req, res) => {
  try {
    const where = [], params = [];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.status) add('status = ANY(?)', String(req.query.status).split(','));
    if (req.query.lane) add('lane = ?', String(req.query.lane));
    if (req.query.source) add('source = ?', String(req.query.source));
    if (req.query.ids) add('id = ANY(?::uuid[])', String(req.query.ids).split(',').filter(x => UUID_RE.test(x)));
    const { rows } = await db.query(
      `SELECT id, status, source, author, lane, product, format, move, kind, ticket_name, fields->>'hook' AS hook, fields->>'why' AS why,
              (score->>'total')::int AS score, score->>'band' AS band, preflight->>'verdict' AS preflight, (preflight->>'must_fix')::int AS must_fix,
              style->'passed' AS style_passed, error, cost_usd, reviewer, review_reason, created_at, updated_at
         FROM medium_briefs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 200`, params);
    res.json({ briefs: rows });
  } catch (err) { errorJson(res, err); }
});

router.get('/briefs/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query('SELECT * FROM medium_briefs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const b = rows[0];
    const examples = b.exemplar_ids?.length ? (await db.query('SELECT id, board_id, item_id, name, kind, lane, product FROM medium_exemplars WHERE id = ANY($1::int[])', [b.exemplar_ids])).rows : [];
    res.json({ brief: { ...b, brief_text: require('../lib/medium/style').composeBrief(b.fields || {}) }, examples });
  } catch (err) { errorJson(res, err); }
});

function diffFields(before = {}, after = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}

router.put('/briefs/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = (await db.query('SELECT * FROM medium_briefs WHERE id = $1', [req.params.id])).rows[0];
    if (!b) return res.status(404).json({ error: 'Not found' });
    if (!['PENDING_REVIEW', 'DROPPED'].includes(b.status)) throw bad(`A ${b.status.toLowerCase()} brief can't be edited`, 409);
    const actor = actorOf(req);
    const W = require('../lib/medium/writer');
    const { styleCheck } = require('../lib/medium/style');
    let fields = b.fields || {}, ticket = b.ticket_name, extra = {};
    // freeform: pick which version becomes the brief
    if (req.body?.version && b.versions?.[req.body.version]) {
      const v = b.versions[req.body.version];
      fields = v.fields; ticket = v.ticket_name;
      extra = { lines: v.lines, score: v.score, preflight: v.preflight, style: v.style, kind: v.kind };
    }
    if (req.body?.fields) fields = { ...fields, ...Object.fromEntries(Object.entries(req.body.fields).filter(([k]) => ['why', 'test', 'hook', 'vo_style', 'brief', 'script', 'copy', 'donts', 'sizes', 'duration', 'video_type', 'template', 'persona', 'donor'].includes(k))) };
    if (req.body?.ticket_name) ticket = String(req.body.ticket_name).slice(0, 300);
    const diff = diffFields(b.fields, fields);
    if (ticket !== b.ticket_name) diff.ticket_name = { from: b.ticket_name, to: ticket };
    const textChanged = ['brief', 'script', 'copy', 'hook'].some(k => diff[k]);
    const style = styleCheck({ format: b.format, kind: extra.kind || b.kind, move: b.move, lane: b.lane, fields }, { laneFirst: W.laneFirstFor(b.lane, b.format) });
    let lines = extra.lines || b.lines, preflight = extra.preflight || b.preflight, score = extra.score || b.score, cost = Number(b.cost_usd) || 0;
    // Words changed (or "Check again") → new line list, Captain pre-flight AND the score + guardrails gate again,
    // so fixing a blocked line by hand actually unblocks the brief
    if (textChanged || req.body?.recheck) {
      const cfg = await getConfig();
      const r = await W.relines(fields, b.format);
      lines = r.lines; cost += r.cost;
      const out = { ticket_name: ticket, fields, lines, evidence: b.evidence?.items || [] };
      const [pf, ctx] = await Promise.all([W.preflight(b, out), W.buildContext({ ...(b.request || {}), lane: b.lane, format: b.format, product: b.product, move: b.move === 'FREEFORM' ? 'NEW_ANGLE' : b.move, kind: extra.kind || b.kind }, cfg)]);
      preflight = pf; cost += pf.cost || 0;
      const s = await W.score(out, ctx, cfg, { selfId: b.id });
      score = s.score; cost += s.cost;
    }
    const edits = [...(b.edits || []), ...(Object.keys(diff).length ? [{ at: new Date().toISOString(), by: actor, diff, version: req.body?.version || null }] : [])];
    await W.setRow(b.id, { ...extra, fields, ticket_name: ticket, lines, preflight, score, style: { ...style, rewrites: b.style?.rewrites || 0, edited: Object.keys(diff).length > 0 || !!b.style?.edited }, edits, cost_usd: cost,
      status: b.status === 'DROPPED' && style.passed ? 'PENDING_REVIEW' : b.status });
    res.json({ ok: true, style, preflight, score });
  } catch (err) { errorJson(res, err); }
});

router.post('/briefs/:id/approve', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = (await db.query('SELECT * FROM medium_briefs WHERE id = $1', [req.params.id])).rows[0];
    if (!b) return res.status(404).json({ error: 'Not found' });
    if (b.status !== 'PENDING_REVIEW') throw bad(`This brief is ${b.status.toLowerCase().replace('_', ' ')}`, 409);
    const reason = String(req.body?.override_reason || '').trim();
    const mustFix = Number(b.preflight?.must_fix) || 0;
    const needsReason = [];
    if (b.preflight?.verdict === 'error' || b.preflight?.verdict == null) needsReason.push("Captain Caption couldn't check it");
    if (mustFix) needsReason.push(`${mustFix} must-fix from Captain Caption`);
    if (b.score?.band === 'blocked') needsReason.push(`guardrails: ${(b.score.guardrails?.blocks || (b.score.guardrails?.violations || []).map(v => (typeof v === 'string' ? v : v.text))).join('; ')}`);
    else if (b.score?.band === 'below_bar') needsReason.push(`score ${b.score.total} is below the bar (65)`);
    if (needsReason.length && (!reason || !isAdmin(req))) throw bad(`Approval locked — ${needsReason.join(' · ')}. ${isAdmin(req) ? 'Approve with an override reason (logged).' : 'An admin can approve with an override reason.'}`, 409);
    const cfg = await getConfig();
    const reviewReason = needsReason.length ? `Override: ${reason} (${needsReason.join(' · ')})` : null;
    await db.query(
      `UPDATE medium_briefs SET status = 'APPROVED', reviewer = $2, reviewed_at = NOW(), review_reason = $3, updated_at = NOW() WHERE id = $1`,
      [b.id, actorOf(req), reviewReason]);
    await require('../lib/medium/transfer').createTest(b).catch(e => console.warn('[medium] test row:', e.message));   // its Test: line, scored by AfterLife once it ships
    if (!cfg.monday_submit) return res.json({ ok: true, status: 'APPROVED', monday: 'Shadow mode — nothing was created on Monday' });
    const r = await submitToMonday({ ...b, review_reason: reviewReason }, req, cfg);
    res.json({ ok: true, status: r.ok ? 'SUBMITTED' : 'APPROVED', monday: r.message, item_id: r.item_id || null });
  } catch (err) { errorJson(res, err); }
});

/**
 * Approved brief → Monday ticket (CP's token, "Form Requests" group, lane in the name) + evidence update, then
 * Captain Caption locks the approved on-screen text to the new item. Never throws: a Monday failure leaves the brief
 * APPROVED with the reason, and "Create on Monday" can try again.
 */
async function submitToMonday(b, req, cfg) {
  try {
    const r = await require('../lib/medium/monday').submitBrief(b, { approver: actorOf(req), approverEmail: req.user?.email, cfg });
    let captain = '';
    if (b.preflight?.check_id) {
      const override = Number(b.preflight.must_fix) > 0 ? { by: actorOf(req), reason: b.review_reason || 'Approved in Medium' } : null;
      captain = await require('../lib/captain/brief').attachApproved(b.preflight.check_id, { item_id: r.item_id, board_id: r.board_id, actor: `Medium · ${actorOf(req)}`, override })
        .then(x => ` · approved text locked (Captain update ${x.monday_update})`).catch(e => ` · approved text not locked: ${e.message}`);
    }
    await db.query(`UPDATE medium_briefs SET status = 'SUBMITTED', monday_item_id = $2, error = NULL, updated_at = NOW() WHERE id = $1`, [b.id, r.item_id]);
    return { ok: true, item_id: r.item_id, message: `Created on Monday (item ${r.item_id})${captain}${r.skipped.length ? ` · not set: ${r.skipped.join('; ')}` : ''}` };
  } catch (e) {
    await db.query(`UPDATE medium_briefs SET error = $2, updated_at = NOW() WHERE id = $1`, [b.id, `Monday: ${String(e.message).slice(0, 500)}`]).catch(() => null);
    return { ok: false, message: `Approved, but Monday creation failed: ${e.message} — use "Create on Monday" to try again` };
  }
}

router.post('/briefs/:id/submit', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const cfg = await getConfig();
    if (!cfg.monday_submit) throw bad('Monday submission is off (shadow mode) — an admin can turn it on in “What it learns from”', 409);
    const b = (await db.query('SELECT * FROM medium_briefs WHERE id = $1', [req.params.id])).rows[0];
    if (!b) return res.status(404).json({ error: 'Not found' });
    if (b.status !== 'APPROVED') throw bad(b.status === 'SUBMITTED' ? 'Already on Monday' : 'Approve it first', 409);
    const r = await submitToMonday(b, req, cfg);
    if (!r.ok) return res.status(502).json({ error: r.message });
    res.json({ ok: true, status: 'SUBMITTED', monday: r.message, item_id: r.item_id });
  } catch (err) { errorJson(res, err); }
});

router.post('/briefs/:id/reject', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw bad('Say why — Medium learns from rejections');
    const { rowCount } = await db.query(
      `UPDATE medium_briefs SET status = 'REJECTED', reviewer = $2, reviewed_at = NOW(), review_reason = $3, updated_at = NOW() WHERE id = $1 AND status IN ('PENDING_REVIEW', 'DROPPED', 'ERROR')`,
      [req.params.id, actorOf(req), reason.slice(0, 1000)]);
    if (!rowCount) throw bad('Only briefs waiting for review can be rejected', 409);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

router.post('/briefs/:id/regenerate', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = (await db.query('SELECT * FROM medium_briefs WHERE id = $1', [req.params.id])).rows[0];
    if (!b) return res.status(404).json({ error: 'Not found' });
    const request = { ...(b.request || {}), batch_id: null, regenerated_from: b.id, note: req.body?.note ? String(req.body.note).slice(0, 2000) : b.request?.note || null };
    const { rows } = await db.query(
      `INSERT INTO medium_briefs (status, source, author, lane, product, format, move, request) VALUES ('QUEUED', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [b.source, actorOf(req), b.lane, b.product, b.format, b.move, JSON.stringify(request)]);
    await enqueue(b.source === 'freeform' ? 'medium_freeform' : 'medium_generate', { brief_id: rows[0].id }, { dedupeKey: `medium_generate:${rows[0].id}`, priority: 8, maxAttempts: 1 });
    res.json({ queued: 1, id: rows[0].id });
  } catch (err) { errorJson(res, err); }
});

// ── settings, affinity, beliefs ──────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try { res.json({ config: await getConfig() }); } catch (err) { errorJson(res, err); }
});
router.put('/config', requireAdmin, async (req, res) => {
  try { res.json({ config: await saveConfig(req.body || {}) }); } catch (err) { errorJson(res, err); }
});
router.get('/affinity', async (req, res) => {
  try { await seed().catch(() => null); res.json({ affinity: (await db.query('SELECT * FROM medium_affinity ORDER BY cluster, source, target')).rows }); } catch (err) { errorJson(res, err); }
});
router.get('/beliefs', async (req, res) => {
  try { res.json({ beliefs: (await db.query('SELECT * FROM medium_beliefs ORDER BY id')).rows }); } catch (err) { errorJson(res, err); }
});
router.put('/beliefs/:id', requireAdmin, async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['proven', 'testing', 'assumption', 'retired'].includes(status)) throw bad('Status must be proven, testing, assumption or retired');
    const { rows } = await db.query(
      `UPDATE medium_beliefs SET status = $2, override = jsonb_build_object('by', $3::text, 'at', NOW(), 'from', status, 'reason', $4::text), last_reviewed = NOW() WHERE id = $1 RETURNING *`,
      [Number(req.params.id), status, actorOf(req), String(req.body?.reason || '').slice(0, 500)]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ belief: rows[0] });
  } catch (err) { errorJson(res, err); }
});

// ── improve loop ─────────────────────────────────────────────────────────────
router.post('/briefs/:id/improve', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = (await db.query('SELECT * FROM medium_briefs WHERE id = $1', [req.params.id])).rows[0];
    if (!b) return res.status(404).json({ error: 'Not found' });
    if (!require('../lib/medium/writer').canImprove(b)) throw bad(b.versions?.improved ? 'No more rounds — the last one gained less than 3 points, or 3 rounds are done' : 'Nothing to improve — the panel suggested no fixes', 409);
    const jobId = await enqueue('medium_improve', { brief_id: b.id }, { dedupeKey: `medium_improve:${b.id}`, priority: 8, maxAttempts: 1 });
    res.json({ queued: !!jobId });
  } catch (err) { errorJson(res, err); }
});

// ── Holiday Builder ──────────────────────────────────────────────────────────
const holiday = () => require('../lib/medium/holiday');
async function holidayPlan(body) {
  const facts = await require('../lib/captain/brain').loadFacts({ brand: 'Particle' });
  return holiday().planHoliday(body || {}, { prices: facts.prices });
}
router.post('/holiday/plan', async (req, res) => {
  try { res.json({ plan: await holidayPlan(req.body), templates: { static: holiday().STATIC_TEMPLATES, video: holiday().VIDEO_TEMPLATES } }); } catch (err) { errorJson(res, err); }
});
router.post('/holiday/generate', async (req, res) => {
  try {
    const plan = await holidayPlan(req.body);
    if (!plan.parents.length) throw bad('Pick at least one product and one template');
    if (plan.parents.length > 120) throw bad(`${plan.parents.length} parent briefs is too many in one go (120 at most) — split the campaign`);
    if (req.body?.confirm !== plan.parents.length) throw bad(`Confirm the number of parent briefs (${plan.parents.length}, about $${plan.est_cost})`, 409);
    res.json({ ...(await holiday().generateParents(plan, { actor: actorOf(req) })), plan: { holiday: plan.holiday, counts: plan.counts, est_cost: plan.est_cost } });
  } catch (err) { errorJson(res, err); }
});
router.get('/holiday/campaigns', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT request->>'holiday_batch' AS batch_id, MIN(request->'holiday'->>'name') AS holiday, COUNT(*)::int AS briefs,
              COUNT(*) FILTER (WHERE status IN ('QUEUED', 'WRITING'))::int AS writing, COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW')::int AS waiting,
              COUNT(*) FILTER (WHERE status IN ('APPROVED', 'SUBMITTED'))::int AS approved, MIN(created_at) AS created_at
         FROM medium_briefs WHERE request->>'holiday_batch' IS NOT NULL GROUP BY 1 ORDER BY MIN(created_at) DESC LIMIT 20`);
    res.json({ campaigns: rows });
  } catch (err) { errorJson(res, err); }
});
router.get('/holiday/:batch', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.batch)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(
      `SELECT id, status, source, lane, product, format, kind, ticket_name, (score->>'total')::int AS score, score->>'band' AS band, preflight->>'verdict' AS preflight,
              (preflight->>'must_fix')::int AS must_fix, request->'holiday' AS holiday, request->>'derivative' AS derivative, error, cost_usd, created_at
         FROM medium_briefs WHERE request->>'holiday_batch' = $1 ORDER BY source, product, created_at`, [req.params.batch]);
    res.json({ briefs: rows });
  } catch (err) { errorJson(res, err); }
});
// Captain Caption's campaign-wide pre-flight over every parent: one code, one end date, one price per product × tier
router.post('/holiday/:batch/preflight', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.batch)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(`SELECT * FROM medium_briefs WHERE request->>'holiday_batch' = $1 AND source = 'holiday' AND status IN ('PENDING_REVIEW', 'APPROVED') AND jsonb_array_length(lines) > 0`, [req.params.batch]);
    if (!rows.length) throw bad('No written parent briefs yet');
    const h = rows[0].request?.holiday || {};
    const r = await require('../lib/captain/brief').startBatch({
      campaign: h.name, briefs: rows.map(b => ({ brief_id: `medium:${b.id}`, name: b.ticket_name, lane: b.lane, product: b.product, board: b.format, offer: b.request?.offer || null, layout_ref: b.fields?.template || null, lines: b.lines, author: 'Medium' })),
    }, { actor: `Medium · ${actorOf(req)}` });
    res.json(r);
  } catch (err) { errorJson(res, err); }
});
router.get('/holiday/preflight/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const b = await require('../lib/captain/brief').batchStatus(req.params.id);
    if (!b) return res.status(404).json({ error: 'Not found' });
    res.json(b);
  } catch (err) { errorJson(res, err); }
});
// Bulk approve exists only here, only for parents, only 80+ with Captain passed (spec §16.2)
router.post('/holiday/:batch/approve', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.batch)) return res.status(404).json({ error: 'Not found' });
    const { rows } = await db.query(`SELECT * FROM medium_briefs WHERE request->>'holiday_batch' = $1 AND source = 'holiday' AND status = 'PENDING_REVIEW'`, [req.params.batch]);
    const ready = rows.filter(b => (b.score?.total ?? 0) >= 80 && b.score?.band === 'ready' && b.preflight?.verdict === 'passed');
    const cfg = await getConfig();
    const results = [];
    for (const b of ready) {
      await db.query(`UPDATE medium_briefs SET status = 'APPROVED', reviewer = $2, reviewed_at = NOW(), review_reason = 'Bulk approve (Holiday Builder, 80+ and Captain passed)', updated_at = NOW() WHERE id = $1`, [b.id, actorOf(req)]);
      await require('../lib/medium/transfer').createTest(b).catch(() => null);
      results.push(cfg.monday_submit ? await submitToMonday(b, req, cfg) : { ok: true, message: 'approved (shadow mode)' });
    }
    res.json({ approved: ready.length, left: rows.length - ready.length, monday: cfg.monday_submit ? `${results.filter(r => r.ok).length} created on Monday` : 'Shadow mode — nothing created on Monday' });
  } catch (err) { errorJson(res, err); }
});
router.post('/holiday/:batch/derivatives', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.batch)) return res.status(404).json({ error: 'Not found' });
    res.json(await holiday().proposeDerivatives(req.params.batch, { actor: actorOf(req) }));
  } catch (err) { errorJson(res, err); }
});

// ── autopilot + scorecard ────────────────────────────────────────────────────
router.post('/autopilot/run', requireAdmin, async (req, res) => {
  try { res.json(await require('../lib/medium/autopilot').runAutopilot({ actor: `Medium autopilot (run by ${actorOf(req)})`, force: true })); } catch (err) { errorJson(res, err); }
});
router.get('/scorecard', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT lane, source, move, COUNT(*)::int AS briefs,
              COUNT(*) FILTER (WHERE status IN ('APPROVED', 'SUBMITTED'))::int AS approved,
              COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
              COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS shipped,
              COUNT(*) FILTER (WHERE jsonb_array_length(edits) > 0)::int AS edited,
              ROUND(AVG((score->>'total')::numeric))::int AS avg_score, ROUND(SUM(cost_usd)::numeric, 2)::float AS cost
         FROM medium_briefs WHERE status NOT IN ('QUEUED', 'WRITING') GROUP BY 1, 2, 3 ORDER BY briefs DESC`);
    const tests = await db.query(`SELECT axis, status, COUNT(*)::int AS n FROM medium_tests GROUP BY 1, 2`);
    res.json({ rows, tests: tests.rows });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
