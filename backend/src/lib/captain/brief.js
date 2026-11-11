/**
 * Captain Caption — brief pre-flight, the third check type next to Video (Frame.io) and Design (Figma).
 * Text errors are caught at the brief stage, where fixing them costs a keystroke, instead of in round 2 of a finished asset.
 *
 *   Medium → POST /api/captain/check-brief { brief_id, lane, product, campaign, offer, layout_ref, lines[], article_text? }
 *     → code checks: reading speed, fit, offer facts, price math, versions/sizes, required elements (briefRules.js)
 *     → Claude reads every line against the Brain, the claims sheet and (magazine lanes) the destination article
 *     → verdict "passed" when there are no must-fix issues
 *   Medium creates the Monday item → POST /check-brief/:id/attach → approved text locked to the item + a Monday update.
 *   When that item's video/design arrives, the normal check also compares it with the approved text (briefMatch.js).
 *   Holiday Builder → POST /check-brief/batch (≤200 briefs, run on the worker) → GET /check-brief/batch/:id.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../db');
const { getConfig, BOARDS } = require('./config');
const { loadBrain, loadFacts, brainStamp, brainText } = require('./brain');
const { brandOf, laneOf } = require('./brand');
const R = require('./briefRules');
const claude = require('./engines/claude');
const monday = require('./monday');
const { logEvent } = require('./log');
const { enqueue } = require('./queue');
const { postingFor } = require('./video');
const { insertCheck, updateCheck, insertIssue } = require('./store');

const PROMPT = fs.readFileSync(path.join(__dirname, 'prompts', 'qc-brief.txt'), 'utf8');
const SEV_IN = { must_fix: 'must_fix', should_fix: 'check', info: 'info' };     // Medium's words → how issues are stored
const SEV_OUT = { must_fix: 'must_fix', check: 'should_fix', info: 'info' };
const SHARED = ['campaign', 'offer', 'lane', 'brand', 'product', 'board', 'layout_ref', 'article_text', 'author'];
const MAX_BATCH = 200;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// ── prompt ───────────────────────────────────────────────────────────────────
function linesBlock(lines) {
  return lines.map(l => {
    const t = l.start !== null && l.end !== null ? ` · ${l.start}–${l.end}s` : '';
    return `${l.id} · ${l.kind} · ${l.version || 'all versions'} · ${l.size || 'all sizes'} · ${l.lang}${t}: ${String(l.text).replace(/\s+/g, ' ').trim()}`;
  }).join('\n');
}

function claimsBlock(claims, product) {
  const mine = (claims || []).filter(c => {
    const want = [].concat(c.scope?.product || []).filter(Boolean);
    return !want.length || (product && want.some(p => R.sameName(p, product)));
  });
  return mine.length ? mine.map(c => `- ${c.title}${c.content ? ` (${String(c.content).replace(/\s+/g, ' ').slice(0, 200)})` : ''}`).join('\n') : '(none stored for this product)';
}

// (function replacements: copy like "$&" or "$'" must never be read as a replacement pattern)
function buildPrompt({ req, brand, lane, brain, facts, hasArticle }) {
  return PROMPT
    .replaceAll('{{BRAND_ABOUT}}', () => brand.about)
    .replaceAll('{{LANE}}', () => lane.name).replace('{{LANE_ABOUT}}', () => lane.about || '')
    .replaceAll('{{PRODUCT}}', () => req.product || '(not given)')
    .replace('{{CAMPAIGN}}', () => req.campaign ? `Campaign: ${req.campaign}${req.offer ? ` — offer ${[req.offer.tier ? `${req.offer.tier}% off` : null, req.offer.code ? `code ${req.offer.code}` : null, req.offer.ends ? `ends ${req.offer.ends}` : null].filter(Boolean).join(', ')}` : ''}` : '')
    .replace('{{BOARD}}', () => req.board === 'video' ? 'video (supers and voiceover)' : req.board === 'design' ? 'static design' : 'not decided yet')
    .replace('{{ARTICLE_RULE}}', () => hasArticle ? '"in_article": is the claim stated in the destination article below? A ranking, panel, number or authority line must be in the article ("yes" / "no").' : '"in_article": always "n/a".')
    .replace('{{BRAIN}}', () => brainText(brain))
    .replace('{{CLAIMS}}', () => claimsBlock(facts.claims, req.product))
    .replace('{{ARTICLE}}', () => hasArticle ? `Destination article (${lane.destination || lane.name}) — the ad may only claim what this article states:\n"""\n${req.article_text.slice(0, 40000)}\n"""` : '')
    .replace('{{LINES}}', () => linesBlock(req.lines.filter(l => l.text.trim())));
}

function claimsToIssues(claims, { ids, product, lane, hasArticle }) {
  const out = [];
  for (const c of claims || []) {
    const line_id = ids.has(c.line_id) ? c.line_id : null;
    if (c.in_sheet === 'no') out.push({ line_id, found: c.claim, fix: 'Use an approved claim, or add this one to the claims sheet', type: 'claim', severity: 'must_fix', rule: `Claims sheet${c.note ? ` — ${c.note}` : ''}` });
    else if (c.in_sheet === 'no_sheet') out.push({ line_id, found: c.claim, fix: `No approved claims stored for ${product || 'this product'} — check it is substantiated`, type: 'claim_unverified', severity: 'should_fix', rule: 'Claims sheet' });
    if (hasArticle && c.in_article === 'no') out.push({ line_id, found: c.claim, fix: `Not stated in the ${lane.name} article — cut it or match the article`, type: 'claim_article', severity: 'must_fix', rule: 'Claims must appear in the destination article' });
  }
  return out;
}

// ── one brief ────────────────────────────────────────────────────────────────
/** What Medium gets back (and HQ shows): verdict, the issues per line, notes, the claims found. */
async function briefResult(checkId) {
  const c = (await db.query('SELECT id, status, asset, raw, cost_usd, finished_at, item_id, error FROM captain_checks WHERE id = $1', [checkId])).rows[0];
  if (!c) return null;
  const issues = (await db.query('SELECT id, line_id, found, fix, type, severity, rule, data FROM captain_issues WHERE check_id = $1 ORDER BY idx', [checkId])).rows;
  return {
    verdict: c.status === 'issues' || c.status === 'passed' ? c.status : c.status === 'error' ? 'error' : 'running',
    check_id: c.id, brief_id: c.asset?.brief_id || null, lane: c.asset?.lane || null, lines_checked: c.asset?.lines || 0,
    must_fix: issues.filter(i => i.severity === 'must_fix').length,
    issues: issues.map(i => ({ id: i.id, line_id: i.line_id, found: i.found, fix: i.fix, type: i.type, severity: SEV_OUT[i.severity] || i.severity, rule: i.rule, ...(i.data?.suggestion ? { suggestion: i.data.suggestion } : {}) })),
    notes: c.raw?.notes || [], claims: c.raw?.claims || [], cost_usd: c.cost_usd != null ? Number(c.cost_usd) : null,
    checked_at: c.finished_at, item_id: c.item_id || null, ...(c.error ? { error: c.error } : {}),
  };
}

async function runBriefCheck(body, { trigger = 'medium', actor = null, force = false, batchId = null, cfg = null } = {}) {
  const t0 = Date.now();
  cfg = cfg || await getConfig();
  const bc = cfg.brief || {};
  const { errors, req } = R.normalizeRequest(body, bc);
  if (errors.length) throw bad(errors.join(' · '));
  const brand = brandOf({ brand: req.brand, itemName: req.name, names: [req.product, req.campaign] }, cfg);
  const lane = laneOf({ lane: req.lane, names: [req.name, req.campaign] }, cfg);
  const engine = cfg.engines?.brief || { engine: 'claude', model: 'claude-sonnet-5-5' };
  if (engine.engine !== 'claude') throw bad(`Brief engine "${engine.engine}" isn't available — set Claude in Settings`, 503);
  if (!claude.configured()) throw bad("The Captain can't read briefs yet — no Anthropic key on the server", 503);

  const [brain, facts, stamp] = await Promise.all([
    loadBrain({ discipline: req.board || 'any', product: req.product, campaign: req.campaign, brand: brand.name, lane: lane.name }),
    loadFacts({ brand: brand.name, lane: lane.name }),
    brainStamp(),
  ]);

  // Same brief + same Brain → the same answer: Medium can ask again for free (e.g. after a page reload)
  const dedupeKey = `brief:${crypto.createHash('sha256').update(JSON.stringify([{ ...req, author: null, name: null }, stamp, engine.model, PROMPT.length])).digest('hex').slice(0, 40)}`;
  if (!force) {
    const prev = (await db.query(
      `SELECT id FROM captain_checks WHERE dedupe_key = $1 AND status IN ('passed','issues') AND created_at > NOW() - make_interval(hours => $2) ORDER BY created_at DESC LIMIT 1`,
      [dedupeKey, Math.max(Number(bc.cache_hours) || 24, 0)])).rows[0];
    if (prev) return { ...(await briefResult(prev.id)), cached: true };
  }

  const today = new Date().toISOString().slice(0, 10);
  const rules = R.ruleChecks(req, facts, { bc, today, lane: lane.name });
  const notes = [...rules.notes];
  const hasArticle = lane.name !== 'Particle' && !!req.article_text;
  if (lane.name !== 'Particle' && !req.article_text) notes.push(`No article text was sent with this ${lane.name} brief — claims weren't checked against the article`);

  const lineCount = req.lines.filter(l => l.text.trim()).length;
  const title = req.name || [req.product, req.campaign || (lane.name !== 'Particle' ? lane.name : null)].filter(Boolean).join(' · ') || 'Brief';
  const checkId = await insertCheck({
    discipline: 'brief', status: 'running', trigger, item_name: title, product: req.product, campaign: req.campaign, person: req.author,
    scope_reason: `Brief pre-flight · ${lane.name}${brand.name !== 'Particle' ? ` · ${brand.name}` : ''}`,
    deliverable: `${lineCount} line${lineCount === 1 ? '' : 's'}${req.layout_ref ? ` · ${req.layout_ref}` : ''}`,
    dedupe_key: dedupeKey, engine: engine.engine, model: engine.model, posting: 'off', requested_by: actor, started_at: new Date(),
    asset: { brief_id: req.brief_id, lane: lane.name, brand: brand.name, board: req.board, layout_ref: req.layout_ref, offer: req.offer, batch_id: batchId, lines: lineCount },
  });
  await logEvent({ kind: 'check', discipline: 'brief', check_id: checkId, message: `Checking brief “${title}” (${lineCount} lines)`, data: { brief_id: req.brief_id, trigger }, actor });

  try {
    const prompt = buildPrompt({ req, brand, lane, brain, facts, hasArticle });
    const r = await claude.checkBrief({ prompt, model: engine.model, prices: cfg.prices || {} });
    const ids = new Set(req.lines.map(l => l.id));
    const ai = r.issues
      .map(i => ({ line_id: ids.has(i.line_id) ? i.line_id : null, found: i.found || null, fix: i.fix || null, type: i.type || 'other', severity: SEV_IN[i.severity] ? i.severity : 'must_fix', rule: i.rule || null }))
      .filter(i => (i.found || i.fix) && i.found !== i.fix);
    const all = R.dedupeIssues([...rules.issues, ...ai, ...claimsToIssues(r.claims, { ids, product: req.product, lane, hasArticle })]);
    const mustFix = all.filter(i => i.severity === 'must_fix').length;
    const byId = Object.fromEntries(req.lines.map(l => [l.id, l]));
    for (const [idx, i] of all.entries()) {
      const line = i.line_id ? byId[i.line_id] : null;
      await insertIssue(checkId, {
        idx, line_id: i.line_id, start_s: line?.start ?? null, end_s: line?.end ?? null, found: i.found, fix: i.fix, type: i.type,
        severity: SEV_IN[i.severity] || 'must_fix', rule: i.rule, note: null, data: i.suggestion ? { suggestion: i.suggestion } : null,
      });
    }
    const verdict = mustFix ? 'issues' : 'passed';
    await updateCheck(checkId, {
      status: verdict, issue_count: all.length, cost_usd: r.cost_usd, duration_ms: Date.now() - t0, usage: r.usage, model: r.model, finished_at: new Date(),
      raw: { request: req, verdict, must_fix: mustFix, notes, claims: r.claims, ai_issues: r.issues, brain_ids: brain.ids, fact_ids: facts.ids, offer_entry: rules.offer_entry, expected: rules.expected, prompt_chars: prompt.length },
    });
    await logEvent({
      kind: 'check', discipline: 'brief', check_id: checkId, actor, data: { brief_id: req.brief_id, verdict },
      message: `Brief “${title}”: ${verdict === 'passed' ? `passed ✅${all.length ? ` (${all.length} to look at)` : ''}` : `${mustFix} must-fix issue${mustFix === 1 ? '' : 's'}`}`,
    });
    return briefResult(checkId);
  } catch (e) {
    await updateCheck(checkId, { status: 'error', error: String(e.message).slice(0, 1000), finished_at: new Date(), duration_ms: Date.now() - t0, raw: { request: req, notes } });
    await logEvent({ kind: 'error', discipline: 'brief', check_id: checkId, message: `Brief “${title}”: ${e.message}`, actor });
    throw Object.assign(new Error(`The brief check failed: ${e.message}`), { status: 502, check_id: checkId });
  }
}

/** HQ → Re-run: the same request again, ignoring the cache. */
async function rerunBriefCheck({ check_id, actor = null }) {
  const c = (await db.query(`SELECT raw FROM captain_checks WHERE id = $1 AND discipline = 'brief'`, [check_id])).rows[0];
  if (!c?.raw?.request) throw Object.assign(new Error('That brief check has nothing to re-run'), { noRetry: true });
  const r = await runBriefCheck(c.raw.request, { trigger: 'manual', actor, force: true });
  return { check_id: r.check_id, verdict: r.verdict };
}

// ── approved text ────────────────────────────────────────────────────────────
/**
 * Medium created the Monday item for a brief that passed → lock its lines to that item and say so on Monday.
 * override: { by, reason } — an admin approved despite open must-fix issues (logged here and in Medium).
 */
async function attachApproved(checkId, { item_id, board_id = null, actor = null, override = null } = {}) {
  const itemId = String(item_id || '').trim();
  if (!/^\d{5,15}$/.test(itemId)) throw bad('item_id must be the Monday item id');
  const c = (await db.query(`SELECT * FROM captain_checks WHERE id = $1 AND discipline = 'brief'`, [checkId])).rows[0];
  if (!c) throw bad('Brief check not found', 404);
  if (!['passed', 'issues'].includes(c.status) || !c.raw?.request) throw bad('This brief check has no result to approve', 409);
  const mustFix = (await db.query(`SELECT COUNT(*)::int AS n FROM captain_issues WHERE check_id = $1 AND severity = 'must_fix'`, [checkId])).rows[0].n;
  const ov = override && String(override.reason || '').trim() ? { by: String(override.by || actor || 'unknown').slice(0, 120), reason: String(override.reason).trim().slice(0, 1000) } : null;
  if (mustFix && !ov) throw bad(`This brief still has ${mustFix} must-fix issue${mustFix === 1 ? '' : 's'} — fix them and check again, or approve with an override reason`, 409);

  const req = c.raw.request;
  const lines = req.lines.filter(l => String(l.text || '').trim()).map(({ id, kind, text, version, size, start, end, lang }) => ({ id, kind, text, version, size, start, end, lang }));
  const board = board_id ? String(board_id) : req.board ? BOARDS[req.board]?.board_id || null : null;
  await db.query(
    `INSERT INTO captain_approved_text (board_id, item_id, brief_id, check_id, lane, product, campaign, offer, lines, override, approved_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (item_id) DO UPDATE SET board_id = EXCLUDED.board_id, brief_id = EXCLUDED.brief_id, check_id = EXCLUDED.check_id, lane = EXCLUDED.lane,
       product = EXCLUDED.product, campaign = EXCLUDED.campaign, offer = EXCLUDED.offer, lines = EXCLUDED.lines, override = EXCLUDED.override,
       approved_by = EXCLUDED.approved_by, updated_at = NOW()`,
    [board, itemId, req.brief_id, checkId, c.asset?.lane || null, req.product, req.campaign, req.offer ? JSON.stringify(req.offer) : null, JSON.stringify(lines), ov ? JSON.stringify(ov) : null, actor],
  );
  await updateCheck(checkId, { item_id: itemId, board_id: board });

  const cfg = await getConfig();
  const posting = postingFor(cfg, { itemId });
  const body = ov
    ? `${monday.PREFIX} brief approved with an override ⚠️ (${lines.length} lines, ${mustFix} must-fix open) — ${ov.by}: ${ov.reason}`
    : `${monday.PREFIX} brief passed pre-flight ✅ (${lines.length} lines)`;
  let mondayUpdate = `not posted (posting: ${posting.mode})`;
  if (posting.monday) {
    try { await monday.postUpdate(itemId, body); mondayUpdate = 'posted'; } catch (e) {
      mondayUpdate = `failed: ${e.message}`;
      await logEvent({ kind: 'error', discipline: 'brief', board_id: board, item_id: itemId, check_id: checkId, message: `Monday update failed: ${e.message}`, actor });
    }
  }
  await logEvent({
    kind: 'post', discipline: 'brief', board_id: board, item_id: itemId, check_id: checkId, actor, data: { body, override: ov, monday: mondayUpdate },
    message: `Approved text (${lines.length} lines) locked to Monday item ${itemId}${ov ? ` — override by ${ov.by}: ${ov.reason}` : ''} · Monday update ${mondayUpdate}`,
  });
  return { ok: true, item_id: itemId, lines: lines.length, override: !!ov, monday_update: mondayUpdate };
}

// ── Holiday Builder batch ────────────────────────────────────────────────────
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined && o?.[k] !== null).map(k => [k, o[k]]));

async function startBatch(body, { actor = null } = {}) {
  const briefs = Array.isArray(body?.briefs) ? body.briefs : [];
  if (!briefs.length) throw bad('briefs[] is required');
  if (briefs.length > MAX_BATCH) throw bad(`At most ${MAX_BATCH} briefs per batch`);
  const cfg = await getConfig();
  const shared = pick(body, SHARED);
  const problems = briefs.map((b, k) => ({ k, b, errors: R.normalizeRequest({ ...shared, ...b }, cfg.brief || {}).errors })).filter(x => x.errors.length);
  if (problems.length) throw bad(problems.slice(0, 5).map(x => `${x.b?.brief_id || `brief #${x.k + 1}`}: ${x.errors.join(', ')}`).join(' · '));
  const campaign = body.campaign ? String(body.campaign).slice(0, 120) : null;
  const { rows } = await db.query(
    `INSERT INTO captain_brief_batches (campaign, total, request, requested_by) VALUES ($1,$2,$3,$4) RETURNING id`,
    [campaign, briefs.length, JSON.stringify(body), actor]);
  const id = rows[0].id;
  await enqueue('brief_batch', { batch_id: id }, { dedupeKey: `brief_batch:${id}`, priority: 9, maxAttempts: 1 });
  await logEvent({ kind: 'check', discipline: 'brief', message: `Batch of ${briefs.length} briefs queued${campaign ? ` (${campaign})` : ''}`, data: { batch_id: id }, actor });
  return { batch_id: id, status: 'queued', total: briefs.length };
}

async function runBriefBatch({ batch_id }) {
  const b = (await db.query('SELECT * FROM captain_brief_batches WHERE id = $1', [batch_id])).rows[0];
  if (!b || b.status === 'done') return { skipped: true };
  await db.query(`UPDATE captain_brief_batches SET status = 'running', done_count = 0 WHERE id = $1`, [b.id]);
  try {
    const cfg = await getConfig();
    const shared = pick(b.request, SHARED);
    const items = (b.request.briefs || []).map(x => ({ ...shared, ...x }));
    const results = new Array(items.length);
    let next = 0, done = 0;
    const conc = Math.min(Math.max(Number(cfg.brief?.batch_concurrency) || 4, 1), 6);
    const worker = async () => {
      while (next < items.length) {
        const k = next++;
        try { results[k] = await runBriefCheck(items[k], { trigger: 'batch', actor: b.requested_by, batchId: b.id, cfg }); }
        catch (e) { results[k] = { brief_id: items[k].brief_id || null, verdict: 'error', error: e.message, check_id: e.check_id || null, issues: [] }; }
        done++;
        if (done % 5 === 0 || done === items.length) await db.query('UPDATE captain_brief_batches SET done_count = $2 WHERE id = $1', [b.id, done]).catch(() => null);
      }
    };
    await Promise.all(Array.from({ length: conc }, worker));

    // Checks only a batch can do: one code + end date for the campaign, one price per product × tier, no leftovers
    const first = R.normalizeRequest(items[0], cfg.brief || {}).req;
    const facts = await loadFacts({ brand: brandOf({ brand: first.brand, names: [first.product, first.campaign] }, cfg).name });
    const normed = items.map((x, k) => ({ k, brief_id: results[k]?.brief_id || x.brief_id || `#${k + 1}`, req: R.normalizeRequest(x, cfg.brief || {}).req, issues: [...(results[k]?.issues || [])], result: results[k] }))
      .filter(n => n.result && n.result.verdict !== 'error' && n.result.check_id);
    const cross = R.crossBrief(normed, facts, { campaign: b.campaign });
    const touched = new Set();
    for (const { brief_id, issue } of cross) {
      const n = normed.find(x => x.brief_id === brief_id);
      if (!n) continue;
      const checkId = n.result.check_id;
      const { rows } = await db.query('SELECT COALESCE(MAX(idx), -1) + 1 AS idx FROM captain_issues WHERE check_id = $1', [checkId]);
      const line = issue.line_id ? n.req.lines.find(l => l.id === issue.line_id) : null;
      await insertIssue(checkId, { idx: rows[0].idx, line_id: issue.line_id, start_s: line?.start ?? null, end_s: line?.end ?? null, found: issue.found, fix: issue.fix, type: issue.type, severity: SEV_IN[issue.severity] || 'must_fix', rule: issue.rule, note: 'Found by the campaign-wide check', data: issue.suggestion ? { suggestion: issue.suggestion } : null });
      touched.add(n.k);
    }
    for (const k of touched) {
      const checkId = results[k].check_id;
      await db.query(
        `UPDATE captain_checks SET issue_count = (SELECT COUNT(*) FROM captain_issues WHERE check_id = $1),
           status = CASE WHEN EXISTS (SELECT 1 FROM captain_issues WHERE check_id = $1 AND severity = 'must_fix') THEN 'issues' ELSE status END WHERE id = $1`, [checkId]);
      results[k] = { ...(await briefResult(checkId)), ...(results[k].cached ? { cached: true } : {}) };
    }

    const byType = {};
    for (const r of results) for (const i of r?.issues || []) byType[i.type] = (byType[i.type] || 0) + 1;
    const summary = {
      briefs: items.length,
      passed: results.filter(r => r?.verdict === 'passed').length,
      with_issues: results.filter(r => r?.verdict === 'issues').length,
      errors: results.filter(r => r?.verdict === 'error').length,
      lines_checked: results.reduce((a, r) => a + (r?.lines_checked || 0), 0),
      must_fix: results.reduce((a, r) => a + (r?.must_fix || 0), 0),
      issues_by_type: byType,
      cross_brief: cross.map(x => ({ brief_id: x.brief_id, type: x.issue.type, line_id: x.issue.line_id, found: x.issue.found, fix: x.issue.fix, rule: x.issue.rule })),
      cost_usd: Number(results.reduce((a, r) => a + (r?.cached ? 0 : r?.cost_usd || 0), 0).toFixed(4)),
    };
    const compact = results.map((r, k) => ({ brief_id: r?.brief_id || items[k].brief_id || null, check_id: r?.check_id || null, verdict: r?.verdict || 'error', lines_checked: r?.lines_checked || 0, must_fix: r?.must_fix || 0, issues: r?.issues || [], notes: r?.notes || [], ...(r?.error ? { error: r.error } : {}) }));
    await db.query(`UPDATE captain_brief_batches SET status = 'done', done_count = total, results = $2, summary = $3, finished_at = NOW() WHERE id = $1`, [b.id, JSON.stringify(compact), JSON.stringify(summary)]);
    await logEvent({ kind: 'check', discipline: 'brief', message: `Batch${b.campaign ? ` ${b.campaign}` : ''}: ${summary.passed}/${summary.briefs} briefs passed, ${summary.must_fix} must-fix, ${cross.length} campaign-wide finding${cross.length === 1 ? '' : 's'}`, data: { batch_id: b.id, summary: { ...summary, cross_brief: undefined } }, actor: b.requested_by });
    return { batch_id: b.id, summary: { ...summary, cross_brief: cross.length } };
  } catch (e) {
    await db.query(`UPDATE captain_brief_batches SET status = 'error', error = $2, finished_at = NOW() WHERE id = $1`, [b.id, String(e.message).slice(0, 1000)]);
    await logEvent({ kind: 'error', discipline: 'brief', message: `Batch ${b.id} failed: ${e.message}`, data: { batch_id: b.id } });
    return { batch_id: b.id, error: e.message };
  }
}

async function batchStatus(id) {
  const b = (await db.query('SELECT id, status, campaign, total, done_count, results, summary, error, created_at, finished_at FROM captain_brief_batches WHERE id = $1', [id])).rows[0];
  if (!b) return null;
  return { batch_id: b.id, status: b.status, campaign: b.campaign, total: b.total, done: b.done_count, verdicts: b.status === 'done' ? b.results : [], summary: b.summary, error: b.error, created_at: b.created_at, finished_at: b.finished_at };
}

// ── insights: caught before production vs after ──────────────────────────────
async function insights(days = 90) {
  const d = Math.min(Math.max(Number(days) || 90, 7), 730);
  const [stages, types, approved] = await Promise.all([
    db.query(`SELECT discipline, COUNT(*)::int AS checks, COUNT(*) FILTER (WHERE status = 'issues')::int AS with_issues, COALESCE(SUM(issue_count), 0)::int AS issues, COALESCE(SUM(cost_usd), 0)::float AS cost
                FROM captain_checks WHERE status IN ('passed','issues') AND created_at > NOW() - make_interval(days => $1) GROUP BY discipline`, [d]),
    db.query(`SELECT c.discipline, i.type, i.severity, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE i.feedback = 'good_catch')::int AS good, COUNT(*) FILTER (WHERE i.feedback = 'not_a_typo')::int AS wrong
                FROM captain_issues i JOIN captain_checks c ON c.id = i.check_id
               WHERE c.status IN ('passed','issues') AND c.created_at > NOW() - make_interval(days => $1) GROUP BY 1, 2, 3`, [d]),
    db.query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE override IS NOT NULL)::int AS overrides FROM captain_approved_text WHERE created_at > NOW() - make_interval(days => $1)`, [d]),
  ]);
  return { days: d, stages: stages.rows, types: types.rows, approved_items: approved.rows[0].n, overrides: approved.rows[0].overrides };
}

module.exports = { runBriefCheck, rerunBriefCheck, briefResult, attachApproved, startBatch, runBriefBatch, batchStatus, insights, buildPrompt, linesBlock, claimsToIssues };
