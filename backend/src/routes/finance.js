/**
 * /api/finance — the CP × Finance features: approving budgets, the finance log, shifting dates, re-edits,
 * accrual reports, the Finance page (settings, outbox, cleanup) and the finance dashboard (public, one-time code).
 */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { verifyJWT, requireEditor, requireAdmin } = require('../middleware/auth');
const B = require('../lib/finance/budget');
const E = require('../lib/finance/events');
const fx = require('../lib/finance/fx');
const config = require('../lib/finance/config');
const ctx = require('../lib/finance/context');
const fin = require('../lib/finance/service');
const access = require('../lib/finance/access');
const dashboard = require('../lib/finance/dashboard');
const { afterLines } = require('../lib/finance/after');
const { parseFlow } = require('../lib/finance/rules');
const { companyOf, companyLine } = require('../lib/finance/company');
const W = require('../lib/creative/week');

const AI_ROUTES = new Set(['quick-note', 'read invoice']);
const fail = (res, err, where) => {
  if (err?.status && err.status < 500) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err instanceof fin.FinanceError) return fin.sendFinanceError(res, err, where);
  console.error(`[finance] ${where}:`, err);
  if (AI_ROUTES.has(where)) return res.status(502).json({ error: /ANTHROPIC|api key/i.test(err?.message || '') ? 'Claude isn’t connected on this server' : (err?.message || 'Claude couldn’t do that — try again') });
  return res.status(500).json({ error: 'Something went wrong — try again' });
};

// ═════════════ Public: the finance dashboard (one-time code by email) ═════════════
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries — wait a few minutes' } });

router.post('/public/request-code', codeLimiter, async (req, res) => {
  try { res.json(await access.requestCode(req.body?.email, req.ip)); } catch (err) { fail(res, err, 'request-code'); }
});
router.post('/public/verify-code', codeLimiter, async (req, res) => {
  try {
    const s = await access.verifyCode(req.body?.email, req.body?.code, req.headers['user-agent']);
    if (!s) return res.status(401).json({ error: 'That code didn’t work — check it or ask for a new one' });
    res.json(s);
  } catch (err) { fail(res, err, 'verify-code'); }
});
router.get('/public/dashboard', access.requireSession, async (req, res) => {
  try { res.json({ ...(await dashboard.build({ brandId: req.query.brand || null })), you: req.financeUser.email }); } catch (err) { fail(res, err, 'dashboard'); }
});
router.get('/public/production/:id', access.requireSession, async (req, res) => {
  try {
    const p = await dashboard.production(req.params.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) { fail(res, err, 'dashboard production'); }
});
router.post('/public/production/:id/confirm', access.requireSession, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE productions SET finance_confirmed_at = NOW(), finance_confirmed_by = $2 WHERE id = $1 AND locked = TRUE RETURNING id, brand_id, project_name`,
      [req.params.id, req.financeUser.email]);
    if (!rows[0]) return res.status(400).json({ error: 'Only a closed production can be confirmed' });
    await E.record(db, [{ brand_id: rows[0].brand_id, production_id: rows[0].id, kind: 'finance_confirmed', label: rows[0].project_name, user_name: req.financeUser.email, source: 'finance' }]);
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'confirm'); }
});
router.post('/public/sign-out', access.requireSession, async (req, res) => {
  await access.signOut(req.financeUser.token_hash).catch(() => {});
  res.json({ ok: true });
});

// ═════════════ Everything below needs a CP login ═════════════
router.use(verifyJWT);

// Who can approve budgets (for the reason prompt)
router.get('/approvers', async (req, res) => {
  try { res.json({ approvers: (await config.get()).approvers }); } catch (err) { fail(res, err, 'approvers'); }
});

// ── A production's finance view (header card, approve, log) ──
router.get('/productions/:id', async (req, res) => {
  try {
    const loaded = await ctx.loadProduction(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Not found' });
    const { prod, lines, state } = loaded;
    const cfg = await config.get();
    const { rows: evs } = await db.query('SELECT * FROM finance_events WHERE production_id = $1 ORDER BY created_at DESC LIMIT 300', [prod.id]);
    const { rows: kids } = await db.query('SELECT id, project_name, stage FROM productions WHERE parent_id = $1 ORDER BY id', [prod.id]);
    const rate = fx.latest();
    const usdTotal = lines.reduce((s, li) => s + B.toUsd(li.planned_budget, li.currency_code || 'USD', rate.rate), 0);
    res.json({
      id: prod.id, code: B.financeCode(prod.id), company: companyOf(prod.brand_id), company_line: companyLine(prod.brand_id),
      state, approved: state.approved,
      approved_at: prod.budget_approved_at, approved_by: prod.budget_approved_by, approved_user: prod.budget_approved_user, approved_fx_rate: prod.approved_fx_rate,
      locked: !!prod.locked, locked_at: prod.locked_at, locked_by: prod.locked_by,
      confirmed_at: prod.finance_confirmed_at, confirmed_by: prod.finance_confirmed_by,
      parent_id: prod.parent_id, children: kids,
      dates_from_lines: !!B.spanFromLines(lines),
      totals: { per_currency: ctx.perCurrency(lines), usd: B.round2(usdTotal), rate: fx.quote() },
      payment_plan: ctx.paymentPlan(prod, lines, cfg),
      missing_invoices: ctx.missingInvoiceLines(prod, lines, `${W.localDate(Date.now()).slice(0, 7)}-01`),
      approvers: cfg.approvers,
      events: evs,
      sheet: { url: prod.finance_sheet_url, mode: prod.finance_sheet_mode, legacy_url: prod.finance_sheet_legacy_url, synced_at: prod.finance_sheet_synced_at },
    });
  } catch (err) { fail(res, err, 'GET finance production'); }
});

// Approve the budget: freezes the Planned Budget, emails finance
router.post('/productions/:id/approve', requireAdmin, async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`${ctx.PROD_SELECT} WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const prod = rows[0];
    if (!prod) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (prod.locked) { await client.query('ROLLBACK'); return res.status(423).json({ error: 'This production is closed', code: 'locked' }); }
    const by = String(req.body.approved_by || '').trim();
    if (!by) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Who approved the budget?' }); }
    const lines = (await client.query('SELECT * FROM production_line_items WHERE production_id = $1', [prod.id])).rows;
    if (!lines.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Add the budget lines first' }); }
    const rate = fx.latest().rate;
    const planned = req.body.planned != null && Number(req.body.planned) > 0 ? B.round2(Number(req.body.planned)) : B.autoPlanned(lines, rate);
    const s = B.sums(lines, rate);
    if (planned < s.core) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'The Planned Budget can’t be below the lines' }); }
    const at = /^\d{4}-\d{2}-\d{2}$/.test(req.body.approved_at || '') ? `${req.body.approved_at}T12:00:00Z` : new Date().toISOString();
    await client.query(
      `UPDATE productions SET budget_approved_at = $2, budget_approved_by = $3, budget_approved_user = $4, approved_fx_rate = $5,
              approved_core = $6, planned_budget_2026 = $7, buffer_warned_at = NULL, updated_at = NOW() WHERE id = $1`,
      [prod.id, at, by, req.user.name || req.user.email, rate, s.core, planned]);
    await E.record(client, [{
      brand_id: prod.brand_id, production_id: prod.id, kind: 'budget_approved', label: prod.project_name, field: 'planned_budget_2026',
      new_value: planned, currency: 'USD', approved_by: by, approved_at: at.slice(0, 10), note: req.body.note || null, ...E.actor(req),
      meta: { core: s.core, rate },
    }]);
    await client.query('COMMIT');
    require('../lib/financeSheet').triggerFinanceSync(prod.id);
    require('../lib/finance/notify').run().catch(e => console.error('[finance] notify:', e.message));
    res.json({ ok: true, planned });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err, 'approve');
  } finally { client.release(); }
});

// Remove the approval (Planned follows the lines again) — finance is told
router.post('/productions/:id/unapprove', requireAdmin, async (req, res) => {
  const flow = parseFlow(req.body);
  if (!flow?.note) return res.status(409).json({ error: 'Removing the approval needs a reason — finance is told.', code: 'unapprove_reason' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`${ctx.PROD_SELECT} WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const prod = rows[0];
    if (!prod?.budget_approved_at) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'The budget isn’t approved' }); }
    await client.query(`UPDATE productions SET budget_approved_at = NULL, budget_approved_by = NULL, budget_approved_user = NULL, approved_fx_rate = NULL, approved_core = NULL WHERE id = $1`, [prod.id]);
    await E.record(client, [{ brand_id: prod.brand_id, production_id: prod.id, kind: 'budget_unapproved', label: prod.project_name, old_value: prod.planned_budget_2026, note: flow.note, ...E.actor(req) }]);
    await require('../lib/finance/totals').syncTotals(client, prod.id);
    await client.query('COMMIT');
    require('../lib/finance/notify').run().catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err, 'unapprove');
  } finally { client.release(); }
});

// Shift every dated line of a production by N days (a postponement asks why)
router.post('/productions/:id/shift', requireEditor, async (req, res) => {
  try {
    const days = parseInt(req.body.days, 10);
    if (!days || Math.abs(days) > 730) return res.status(400).json({ error: 'How many days?' });
    const { rows: lines } = await db.query(
      `SELECT id, timeline_start::text AS s, timeline_end::text AS e, expense_month::text AS m FROM production_line_items WHERE production_id = $1`, [req.params.id]);
    // A cost-month override moves with the dates (else the cost would stay in the month the work left)
    const shiftMonth = (m) => `${W.addDays(m, days).slice(0, 7)}-01`;
    const ops = lines.filter(l => l.s || l.e || l.m).map(l => ({ op: 'update', id: l.id, values: {
      ...(l.s ? { timeline_start: W.addDays(l.s, days) } : {}), ...(l.e ? { timeline_end: W.addDays(l.e, days) } : {}),
      ...(l.m ? { expense_month: shiftMonth(l.m) } : {}),
    } }));
    if (!ops.length) {
      // No dated lines: move the production's own dates
      const { rows } = await db.query(`${ctx.PROD_SELECT} WHERE id = $1`, [req.params.id]);
      const p = rows[0];
      if (!p?.planned_start && !p?.planned_end) return res.status(400).json({ error: 'This production has no dates to shift' });
      const flow = parseFlow(req.body);
      const before = { start: p.planned_start, end: p.planned_end };
      const after = { start: p.planned_start ? W.addDays(p.planned_start, days) : null, end: p.planned_end ? W.addDays(p.planned_end, days) : null };
      const d = require('../lib/finance/rules').evaluateDates({ prod: p, before, after, flow, todayMonth: fin.thisMonth(), base: { brand_id: p.brand_id, production_id: p.id, ...E.actor(req) } });
      if (d.needs) return fin.sendFinanceOutcome(res, { needs: { ...d.needs, production_id: p.id, production: p.project_name } });
      await db.query('UPDATE productions SET planned_start = $2, planned_end = $3, updated_at = NOW() WHERE id = $1', [p.id, after.start, after.end]);
      await E.record(db, d.events.length ? d.events : [{ brand_id: p.brand_id, production_id: p.id, kind: 'dates_changed', label: p.project_name, old_value: `${before.start} → ${before.end}`, new_value: `${after.start} → ${after.end}`, ...E.actor(req) }]);
      afterLines(p.id, { events: d.events });
      return res.json({ ok: true, moved: 0 });
    }
    const out = await fin.changeLines({ productionId: req.params.id, ops, actor: fin.actorOf(req), decision: E.parseDecision(req.body), flow: parseFlow(req.body) });
    if (fin.sendFinanceOutcome(res, out)) return;
    afterLines(req.params.id, out);
    res.json({ ok: true, moved: ops.length });
  } catch (err) { fail(res, err, 'shift'); }
});

// A re-edit / sub-production: PRD26-37 → PRD26-37-01 (finance code 263701), with its own budget and sheet
router.post('/productions/:id/sub', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`${ctx.PROD_SELECT} WHERE id = $1`, [req.params.id]);
    const parent = rows[0];
    if (!parent) return res.status(404).json({ error: 'Not found' });
    if (parent.parent_id) return res.status(400).json({ error: 'Make the re-edit under the main production' });
    const { rows: kids } = await db.query('SELECT id FROM productions WHERE id LIKE $1', [`${parent.id}-%`]);
    let n = 1;
    while (kids.some(k => k.id === `${parent.id}-${String(n).padStart(2, '0')}`)) n++;
    const id = `${parent.id}-${String(n).padStart(2, '0')}`;
    const name = String(req.body.name || `${parent.project_name} — re-edit`).trim().slice(0, 200);
    const { rows: created } = await db.query(
      `INSERT INTO productions (id, brand_id, project_name, product_type, producer, planned_start, planned_end, stage, production_type, production_year, parent_id, planned_budget_2026, estimated_budget, actual_spent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9, $10, 0, 0, 0) RETURNING *`,
      [id, parent.brand_id, name, parent.product_type || [], parent.producer, req.body.start || null, req.body.end || null, parent.production_type || '', parent.production_year, parent.id]);
    await E.record(db, [{ brand_id: parent.brand_id, production_id: id, kind: 'sub_production', label: name, old_value: parent.id, new_value: id, ...E.actor(req) }]);
    require('../lib/finance/sheet').create(id).catch(e => console.error(`[finance] sheet for ${id}:`, e.message));
    res.status(201).json(created[0]);
  } catch (err) { fail(res, err, 'sub-production'); }
});

// Move lines between a production and its re-edits (e.g. the 263701 costs out of 2637).
// Same rules as any budget change: an approved side needs a reason (and an approver when it goes over Planned).
router.post('/lines/move', requireEditor, async (req, res) => {
  const { ids, to_production_id: to } = req.body;
  if (!Array.isArray(ids) || !ids.length || !to) return res.status(400).json({ error: 'ids and to_production_id required' });
  const decision = E.parseDecision(req.body);
  const T = require('../lib/finance/totals');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: pre } = await client.query('SELECT DISTINCT production_id FROM production_line_items WHERE id = ANY($1::uuid[])', [ids]);
    if (pre.length !== 1) throw Object.assign(new Error('Move lines from one production at a time'), { status: 400 });
    // Productions first (the order changeLines locks in), then the lines
    const { rows: ps } = await client.query(`${ctx.PROD_SELECT} WHERE id = ANY($1) ORDER BY id FOR UPDATE`, [[pre[0].production_id, to]]);
    const src = ps.find(p => p.id === pre[0].production_id), dst = ps.find(p => p.id === to);
    if (!src || !dst || src.id === dst.id) throw Object.assign(new Error('Production not found'), { status: 404 });
    const family = dst.parent_id === src.id || src.parent_id === dst.id || (src.parent_id && src.parent_id === dst.parent_id);
    if (!family) throw Object.assign(new Error('Lines can only move between a production and its re-edits'), { status: 400 });
    if (src.locked || dst.locked) throw Object.assign(new Error('One of the productions is closed (locked)'), { status: 423 });
    const { rows: lines } = await client.query('SELECT * FROM production_line_items WHERE id = ANY($1::uuid[]) AND production_id = $2 FOR UPDATE', [ids, src.id]);
    const srcBefore = await T.loadLines(client, src.id), dstBefore = await T.loadLines(client, dst.id);
    const moving = new Set(lines.map(l => l.id));
    const sides = [[src, srcBefore, srcBefore.filter(l => !moving.has(l.id))], [dst, dstBefore, [...dstBefore, ...lines]]];
    const rate = fx.latest().rate;
    const raises = [];
    for (const [p, before, after] of sides) {
      if (!B.isApproved(p)) continue;
      const cls = B.classifyChange(p, before, after, rate);
      if (!cls.impact) continue;
      const line = `${lines.length} line${lines.length === 1 ? '' : 's'} moved ${p.id === src.id ? `to ${dst.id}` : `from ${src.id}`}`;
      if (!decision?.reason || (!cls.inBuffer && !decision.approved_by)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The budget is approved — moving lines needs a reason.', code: 'reason_required', mode: cls.inBuffer ? 'in_buffer' : 'over_planned', need_approver: !cls.inBuffer, impact: cls, production_id: p.id, production: p.project_name, line });
      }
      if (!cls.inBuffer) raises.push({ p, cls, to: Math.max(B.round2(cls.coreAfter), decision.new_planned || 0) });
    }
    const { rows: m } = await client.query('SELECT COALESCE(MAX(sort_order), 0) AS n FROM production_line_items WHERE production_id = $1', [dst.id]);
    let order = m[0].n;
    for (const l of lines) await client.query('UPDATE production_line_items SET production_id = $2, sort_order = $3, updated_at = NOW() WHERE id = $1', [l.id, dst.id, ++order]);
    for (const r of raises) await client.query('UPDATE productions SET planned_budget_2026 = $2 WHERE id = $1', [r.p.id, r.to]);
    await T.syncTotals(client, src.id); await T.syncTotals(client, dst.id);
    const why = decision ? { reason: decision.reason, approved_by: decision.approved_by, approved_at: decision.approved_at, note: decision.note || req.body.note || null } : { note: req.body.note || null };
    const thisMonth = fin.thisMonth();
    const evs = [];
    for (const l of lines) {
      const usdAmt = B.toUsd(B.financeCost(l), l.currency_code || 'USD', rate);
      const month = B.primaryMonth(l, src);
      const label = String(l.item || l.full_name || '').replace(/<[^>]*>/g, ' ').trim();
      evs.push({ brand_id: src.brand_id, production_id: src.id, line_item_id: l.id, kind: 'line_moved', label, old_value: src.id, new_value: dst.id, currency: l.currency_code, delta: -B.num(l.planned_budget), delta_usd: -B.round2(usdAmt), expense_month: month, ...why, ...E.actor(req) });
      evs.push({ brand_id: dst.brand_id, production_id: dst.id, line_item_id: l.id, kind: 'line_moved', label, old_value: src.id, new_value: dst.id, currency: l.currency_code, delta: B.num(l.planned_budget), delta_usd: B.round2(usdAmt), expense_month: month, ...why, ...E.actor(req) });
      // Costs finance already booked under one code now belong to another → tell them now
      if (month && month < thisMonth && usdAmt >= 1 && (B.financeKnows(src) || B.financeKnows(dst))) {
        evs.push({ brand_id: src.brand_id, production_id: src.id, line_item_id: l.id, kind: 'historical_change', label, field: 'expected_cost', old_value: B.round2(usdAmt), new_value: 0, currency: 'USD', delta_usd: -B.round2(usdAmt), expense_month: month, ...why, meta: { moved_to: dst.id }, ...E.actor(req) });
        evs.push({ brand_id: dst.brand_id, production_id: dst.id, line_item_id: l.id, kind: 'historical_change', label, field: 'expected_cost', old_value: 0, new_value: B.round2(usdAmt), currency: 'USD', delta_usd: B.round2(usdAmt), expense_month: month, ...why, meta: { moved_from: src.id }, ...E.actor(req) });
      }
    }
    for (const r of raises) {
      evs.push({ brand_id: r.p.brand_id, production_id: r.p.id, kind: 'budget_increase', field: 'planned_budget_2026', label: r.p.project_name, old_value: r.cls.planned, new_value: r.to, currency: 'USD', delta_usd: B.round2(r.to - r.cls.planned), ...why, meta: { trigger: 'lines moved' }, ...E.actor(req) });
    }
    await E.record(client, evs);
    await client.query('COMMIT');
    afterLines(src.id, { events: evs }); afterLines(dst.id, { events: [] });
    res.json({ ok: true, moved: lines.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err, 'move lines');
  } finally { client.release(); }
});

// Quick note → reason / approved by / date / note (Claude)
router.post('/quick-note', requireEditor, async (req, res) => {
  try {
    const cfg = await config.get();
    res.json(await require('../lib/finance/quickNote').parse({ text: req.body.text, context: req.body.context || {}, approvers: cfg.approvers }));
  } catch (err) { fail(res, err, 'quick-note'); }
});

// Read a line's invoice now (Claude)
router.post('/lines/:id/read-invoice', requireEditor, async (req, res) => {
  try { res.json(await require('../lib/finance/invoiceReader').readLine(req.params.id)); } catch (err) { fail(res, err, 'read invoice'); }
});

// Renew cast rights → a cost line in the original production (reopens it if closed; finance is told)
router.post('/rights/:castingId/renew', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT *, end_date::text AS end_date, start_date::text AS start_date FROM casting WHERE id = $1', [req.params.castingId]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'Not found' });
    const cost = Number(req.body.cost ?? c.renewal_cost);
    const currency = (req.body.currency || c.renewal_currency || 'USD') === 'ILS' ? 'ILS' : 'USD';
    const term = parseInt(req.body.term_months ?? c.term_months, 10) || 3;
    if (!(cost > 0)) return res.status(400).json({ error: 'What does the renewal cost?' });
    const start = c.end_date && c.end_date >= W.localDate(Date.now()) ? W.addDays(c.end_date, 1) : W.localDate(Date.now());
    const endD = new Date(`${start}T00:00:00Z`); endD.setUTCMonth(endD.getUTCMonth() + term); endD.setUTCDate(endD.getUTCDate() - 1);
    const newEnd = endD.toISOString().slice(0, 10);
    const out = await fin.changeLines({
      productionId: c.production_id,
      ops: [{ op: 'create', values: { item: `Rights renewal — ${c.name} (${term} months)`, full_name: c.name, type: 'Cast', planned_budget: cost, currency_code: currency, timeline_start: start, timeline_end: start } }],
      actor: fin.actorOf(req), allowLocked: true,
      decision: { reason: 'rights_renewal', approved_by: req.body.approved_by || req.user.name, approved_at: W.localDate(Date.now()), note: req.body.note || `Rights for ${c.name} renewed to ${newEnd}` },
    });
    if (fin.sendFinanceOutcome(res, out)) return;
    await db.query(`UPDATE casting SET end_date = $2, warning_date = ($2::date - INTERVAL '1 month')::date, contract_status = 'Running', renewal_cost = $3, renewal_currency = $4, term_months = $5,
                    renewed_at = NOW(), renewal_alert_sent_at = NULL WHERE id = $1`, [c.id, newEnd, cost, currency, term]);
    const { rows: pr } = await db.query('SELECT brand_id, project_name, locked FROM productions WHERE id = $1', [c.production_id]);
    await E.record(db, [{ brand_id: pr[0]?.brand_id, production_id: c.production_id, kind: 'rights_renewed', label: c.name, new_value: `${cost} ${currency}`, currency, reason: 'rights_renewal', note: `Rights renewed until ${newEnd}${pr[0]?.locked ? ' — the production is closed, this reopens its cost' : ''}`, approved_by: req.body.approved_by || req.user.name, ...E.actor(req) }]);
    afterLines(c.production_id, { events: [{ notify: 'instant' }] });
    res.json({ ok: true, end_date: newEnd });
  } catch (err) { fail(res, err, 'renew rights'); }
});

// ── The finance log ──
router.get('/events', requireEditor, async (req, res) => {
  try {
    const vals = [];
    const where = [];
    if (req.query.production_id) where.push(`production_id = $${vals.push(req.query.production_id)}`);
    if (req.query.kind) where.push(`kind = $${vals.push(req.query.kind)}`);
    if (req.query.since) where.push(`created_at >= $${vals.push(req.query.since)}`);
    const { rows } = await db.query(`SELECT * FROM finance_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ${Math.min(parseInt(req.query.limit, 10) || 300, 2000)}`, vals);
    res.json(rows);
  } catch (err) { fail(res, err, 'events'); }
});

// ── Finance page (admin): settings, outbox, cleanup, accruals, year budgets ──
router.get('/config', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT value FROM app_config WHERE key = 'db_backup_last'");
    res.json({ config: await config.get({ fresh: true }), defaults: config.DEFAULTS, rate: fx.quote(), backup: rows[0] ? JSON.parse(rows[0].value) : null });
  } catch (err) { fail(res, err, 'config'); }
});
router.put('/config', requireAdmin, async (req, res) => {
  try { res.json({ config: await config.set(req.body || {}) }); } catch (err) { fail(res, err, 'config'); }
});
router.get('/outbox', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, created_at, kind, production_id, to_addr, cc, subject, shadow, original_to, original_cc, status, attempts, last_error, sent_at
                                       FROM email_outbox ORDER BY id DESC LIMIT 200`);
    res.json(rows);
  } catch (err) { fail(res, err, 'outbox'); }
});
router.get('/outbox/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM email_outbox WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...rows[0], attachments: (rows[0].attachments || []).map(a => ({ filename: a.filename, mime: a.mime })) });
  } catch (err) { fail(res, err, 'outbox item'); }
});
router.post('/outbox/:id/retry', requireAdmin, async (req, res) => {
  try {
    await db.query(`UPDATE email_outbox SET status = 'queued', next_attempt_at = NOW(), attempts = 0 WHERE id = $1 AND status <> 'sent'`, [req.params.id]);
    require('../lib/finance/mailer').processOutbox().catch(() => {});
    res.json({ ok: true });
  } catch (err) { fail(res, err, 'retry'); }
});

// Email previews (what finance would get) — nothing is sent
router.get('/preview/:kind', requireAdmin, async (req, res) => {
  try {
    const tpl = require('../lib/finance/templates');
    const cfg = await config.get();
    const id = req.query.production_id;
    const loaded = id ? await ctx.loadProduction(id) : null;
    let mail;
    if (req.params.kind === 'approved' && loaded) mail = tpl.approved({ prod: { ...loaded.prod, budget_approved_by: loaded.prod.budget_approved_by || 'Ayal Ebert' }, state: { ...loaded.state, planned: loaded.state.planned }, perCurrency: ctx.perCurrency(loaded.lines), rateQuote: fx.quote(), plan: ctx.paymentPlan(loaded.prod, loaded.lines, cfg), sheetUrl: loaded.prod.finance_sheet_url });
    else if (req.params.kind === 'closed' && loaded) mail = tpl.closed({ prod: loaded.prod, totals: ctx.totalsOf(loaded.lines), missing: ctx.missingInvoiceLines(loaded.prod, loaded.lines, '9999-12-01'), sheetUrl: loaded.prod.finance_sheet_url });
    else if (req.params.kind === 'missing') { const all = await ctx.allocationAll(); mail = tpl.missingInvoices({ groups: all.map(a => ({ prod: a.prod, items: ctx.missingInvoiceLines(a.prod, a.lines, fin.thisMonth()) })).filter(g => g.items.length), cutoff: cfg.invoice_cutoff_day, paymentDay: cfg.payment_day }); }
    else if (req.params.kind === 'events' && loaded) {
      const { rows: evs } = await db.query('SELECT * FROM finance_events WHERE production_id = $1 ORDER BY created_at DESC LIMIT 12', [id]);
      mail = (req.query.urgent ? tpl.reopen : tpl.changes)({ prod: loaded.prod, events: evs.reverse(), state: loaded.state, sheetUrl: loaded.prod.finance_sheet_url });
    } else return res.status(400).json({ error: 'Unknown preview (approved, closed, events, missing) or missing production_id' });
    res.json(mail);
  } catch (err) { fail(res, err, 'preview'); }
});

// Run a scheduled job now (for checking)
router.post('/run/:job', requireAdmin, async (req, res) => {
  try {
    const jobs = require('../lib/finance/jobs');
    const map = {
      reminders: () => jobs.missingInvoiceReminder({ force: true }), nudges: () => jobs.staleDateNudges({ force: true }),
      digest: () => jobs.weeklyDigest({ force: true }), rights: () => jobs.rightsExpiring(), accrual: () => jobs.accrualDraft({ force: true }),
      sheets: () => require('../lib/finance/sheet').pullAll(), fx: () => fx.refresh(), notify: () => require('../lib/finance/notify').run(),
      backup: () => require('../lib/finance/backup').run(),
    };
    if (!map[req.params.job]) return res.status(400).json({ error: 'Unknown job' });
    res.json(await map[req.params.job]());
  } catch (err) { fail(res, err, `run ${req.params.job}`); }
});

// ── Cleanup (before the first accrual report) ──
router.get('/cleanup', requireAdmin, async (req, res) => {
  try {
    const today = W.localDate(Date.now());
    const rate = fx.latest().rate;
    const { rows: paidNoDate } = await db.query(
      `SELECT li.id, li.production_id, li.item, li.full_name, li.actual_spent, li.planned_budget, li.currency_code, li.payment_method, li.timeline_end::text AS timeline_end, li.invoice_status,
              (SELECT MAX(created_at)::date::text FROM change_history ch WHERE ch.production_id = li.production_id AND ch.field ILIKE '%' || COALESCE(NULLIF(li.item, ''), li.full_name, '#') || '%' AND ch.field ILIKE '%payment_status%') AS guess
         FROM production_line_items li WHERE li.payment_status = 'Paid' AND li.paid_at IS NULL ORDER BY li.production_id`);
    const { rows: paidNoMethod } = await db.query(
      `SELECT id, production_id, item, full_name, actual_spent, currency_code FROM production_line_items WHERE payment_status = 'Paid' AND COALESCE(payment_method, '') = '' ORDER BY production_id`);
    const { rows: prods } = await db.query(`${ctx.PROD_SELECT} ORDER BY id`);
    const { rows: counts } = await db.query(`SELECT production_id, COUNT(*)::int AS n FROM production_line_items GROUP BY 1`);
    const lineCount = Object.fromEntries(counts.map(c => [c.production_id, c.n]));
    const stale = prods.filter(p => !p.locked && p.planned_end && p.planned_end < today && !B.isDone(B.normalizeStage(p.stage)) && B.normalizeStage(p.stage) !== 'Paused');
    const noSheet = prods.filter(p => !p.finance_sheet_url && (lineCount[p.id] || 0) > 0);
    const legacy = prods.filter(p => p.finance_sheet_mode === 'linked' && !p.locked);
    const all = await ctx.allocationAll();
    const unapproved = all.filter(a => !B.isApproved(a.prod) && !a.prod.locked && ['Pre Production', 'Production', 'Post'].includes(B.normalizeStage(a.prod.stage)) && a.lines.length)
      .map(a => ({ id: a.prod.id, name: a.prod.project_name, stage: B.normalizeStage(a.prod.stage), planned_stored: B.num(a.prod.planned_budget_2026), planned_now: B.autoPlanned(a.lines, rate), lines: a.lines.length }));
    const { rows: unread } = await db.query(`SELECT COUNT(*)::int AS n FROM production_line_items WHERE invoice_url IS NOT NULL AND invoice_read_at IS NULL`);
    const drift = all.filter(a => a.lines.length && Math.abs(B.num(a.prod.estimated_budget) - B.sums(a.lines, rate).est) > 1).length;
    res.json({
      rate: fx.quote(),
      paid_without_date: paidNoDate,
      paid_without_method: paidNoMethod,
      stale_dates: stale.map(p => ({ id: p.id, name: p.project_name, stage: p.stage, end: p.planned_end, producer: p.producer })),
      no_sheet: noSheet.map(p => ({ id: p.id, name: p.project_name, brand_id: p.brand_id, lines: lineCount[p.id] })),
      legacy_sheets: legacy.map(p => ({ id: p.id, name: p.project_name, url: p.finance_sheet_url, stage: p.stage })),
      unapproved_active: unapproved,
      unread_invoices: unread[0].n,
      totals_at_old_rate: drift,
    });
  } catch (err) { fail(res, err, 'cleanup'); }
});
router.post('/cleanup/recalc-all', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id FROM productions');
    const T = require('../lib/finance/totals');
    let n = 0;
    for (const { id } of rows) {
      const client = await db.connect();
      try { await client.query('BEGIN'); await T.syncTotals(client, id); await client.query('COMMIT'); n++; } catch (e) { await client.query('ROLLBACK').catch(() => {}); console.error('recalc', id, e.message); } finally { client.release(); }
    }
    res.json({ ok: true, productions: n, rate: fx.quote() });
  } catch (err) { fail(res, err, 'recalc'); }
});
router.post('/cleanup/lines', requireAdmin, async (req, res) => {
  // [{ id, paid_at?, payment_method? }] — payment fields only, so closed productions are fine
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const { rows } = await db.query('SELECT id, production_id FROM production_line_items WHERE id = ANY($1::uuid[])', [items.map(i => i.id)]);
    const byProd = new Map();
    for (const r of rows) {
      const it = items.find(i => i.id === r.id);
      const values = {};
      if (it.paid_at) values.paid_at = it.paid_at;
      if (it.payment_method) values.payment_method = it.payment_method;
      if (!Object.keys(values).length) continue;
      if (!byProd.has(r.production_id)) byProd.set(r.production_id, []);
      byProd.get(r.production_id).push({ op: 'update', id: r.id, values });
    }
    let n = 0;
    for (const [pid, ops] of byProd) {
      const out = await fin.changeLines({ productionId: pid, ops, actor: fin.actorOf(req), allowLocked: true });
      if (!out.needs) { n += ops.length; afterLines(pid, out); }
    }
    res.json({ ok: true, updated: n });
  } catch (err) { fail(res, err, 'cleanup lines'); }
});
router.post('/cleanup/read-invoices', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id FROM production_line_items WHERE invoice_url IS NOT NULL AND invoice_read_at IS NULL ORDER BY updated_at DESC NULLS LAST LIMIT $1`, [Math.min(parseInt(req.body.limit, 10) || 50, 300)]);
    require('../lib/finance/invoiceReader').queueLines(rows.map(r => r.id));
    res.json({ ok: true, queued: rows.length });
  } catch (err) { fail(res, err, 'read invoices'); }
});

// Old-format sheets: compare, then convert to a two-way sheet
router.get('/sheets/:id/compare', requireAdmin, async (req, res) => {
  try { res.json(await require('../lib/financeSheet').findMismatches(req.params.id)); } catch (err) { res.status(400).json({ error: err.message || 'Could not read the sheet' }); }
});
router.post('/sheets/:id/convert', requireAdmin, async (req, res) => {
  try { res.json(await require('../lib/finance/sheet').convertLegacy(req.params.id, { apply: req.body.apply || [], actor: fin.actorOf(req) })); } catch (err) { fail(res, err, 'convert sheet'); }
});
router.post('/sheets/:id/create', requireEditor, async (req, res) => {
  try { res.json(await require('../lib/finance/sheet').create(req.params.id)); } catch (err) { res.status(400).json({ error: err.message || 'Could not create the sheet' }); }
});
router.post('/sheets/:id/sync', requireEditor, async (req, res) => {
  try { res.json(await require('../lib/finance/sheet').sync(req.params.id)); } catch (err) { res.status(400).json({ error: err.message || 'Sync failed' }); }
});

// ── Accrual reports ──
router.get('/accruals', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, month::text AS month, status, approvals, built_at, sent_at, sent_by, data->'total_usd' AS total_usd, data->'production_count' AS production_count FROM accrual_reports ORDER BY month DESC LIMIT 36`);
    res.json({ reports: rows, approvers: (await config.get()).report_approvers });
  } catch (err) { fail(res, err, 'accruals'); }
});
router.get('/accruals/:month', requireAdmin, async (req, res) => {
  try {
    const m = `${String(req.params.month).slice(0, 7)}-01`;
    const { rows } = await db.query('SELECT *, month::text AS month FROM accrual_reports WHERE month = $1', [m]);
    if (!rows[0]) return res.status(404).json({ error: 'No report for that month yet' });
    res.json(rows[0]);
  } catch (err) { fail(res, err, 'accrual'); }
});
router.post('/accruals/build', requireAdmin, async (req, res) => {
  try {
    const accrual = require('../lib/finance/accrual');
    const { report } = await accrual.build(req.body.month || W.localDate(Date.now()), { by: req.user.name });
    if (req.body.send_draft && report.status === 'draft') await accrual.sendDraft(report);
    res.json(report);
  } catch (err) { fail(res, err, 'build accrual'); }
});
router.post('/accruals/:id/approve', requireAdmin, async (req, res) => {
  try { res.json(await require('../lib/finance/accrual').approve(req.params.id, req.user)); } catch (err) { fail(res, err, 'approve accrual'); }
});
router.get('/accruals/:id/csv', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT *, month::text AS month FROM accrual_reports WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const brand = req.query.brand || 'particle';
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="Accruals ${rows[0].month.slice(0, 7)} - ${companyOf(brand).short}.csv"`);
    res.send(require('../lib/finance/accrual').csv(rows[0], brand));
  } catch (err) { fail(res, err, 'csv'); }
});

// The finance dashboard, inside CP (same data finance sees)
router.get('/dashboard', requireEditor, async (req, res) => {
  try { res.json(await dashboard.build({ brandId: req.query.brand || null })); } catch (err) { fail(res, err, 'dashboard'); }
});

// ── Yearly budget per company (was saved in each browser) ──
router.get('/year-budgets', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT brand_id, year, amount_usd, updated_by, updated_at FROM finance_year_budgets WHERE ($1::int IS NULL OR year = $1)', [req.query.year ? parseInt(req.query.year, 10) : null]);
    res.json(rows);
  } catch (err) { fail(res, err, 'year budgets'); }
});
router.put('/year-budgets', requireEditor, async (req, res) => {
  try {
    const { brand_id, year, amount_usd } = req.body;
    if (!brand_id || !(parseInt(year, 10) > 2000) || !(Number(amount_usd) >= 0)) return res.status(400).json({ error: 'brand_id, year and amount_usd required' });
    const { rows } = await db.query(
      `INSERT INTO finance_year_budgets (brand_id, year, amount_usd, updated_by, updated_at) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (brand_id, year) DO UPDATE SET amount_usd = EXCLUDED.amount_usd, updated_by = EXCLUDED.updated_by, updated_at = NOW() RETURNING *`,
      [brand_id, parseInt(year, 10), Number(amount_usd), req.user.name]);
    res.json(rows[0]);
  } catch (err) { fail(res, err, 'year budget'); }
});

module.exports = router;
