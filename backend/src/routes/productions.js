const router = require('express').Router();
const db     = require('../db');
const { verifyJWT, requireEditor, requireAdmin } = require('../middleware/auth');
const { createFinanceSheet, triggerFinanceSync } = require('../lib/financeSheet');
const B = require('../lib/finance/budget');
const Events = require('../lib/finance/events');
const { parseFlow, decisionFields, evaluateDates } = require('../lib/finance/rules');

const PROD_SELECT = 'SELECT *, planned_start::text AS planned_start, planned_end::text AS planned_end FROM productions';

// All production routes require authentication
router.use(verifyJWT);

// GET /api/productions?brand_id=particle&year=2026
router.get('/', async (req, res) => {
  const { brand_id, year } = req.query;
  try {
    const vals  = [];
    const where = [];
    if (brand_id) { where.push(`brand_id = $${vals.push(brand_id)}`); }
    if (year) {
      const y = parseInt(year, 10);
      // Match by production_year column, OR planned_start year, OR ID prefix (PRD26- → 2026)
      where.push(`(production_year = $${vals.push(y)} OR EXTRACT(YEAR FROM planned_start) = $${vals.push(y)} OR id LIKE $${vals.push(`PRD${String(y).slice(2)}-%`)})`);
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM productions${clause} ORDER BY planned_start ASC NULLS LAST, id ASC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /productions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/productions/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM productions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/productions
router.post('/', requireAdmin, async (req, res) => {
  const {
    id, brand_id, project_name, product_type, producer,
    planned_start, planned_end, planned_budget_2026,
    estimated_budget, actual_spent, payment_date,
    stage, production_type, production_category,
    timeline_sync, shoot_dates, delivery_date, air_date,
    custom_columns, custom_fields, production_year, parent_id,
  } = req.body;

  if (!id || !brand_id || !project_name) {
    return res.status(400).json({ error: 'id, brand_id, project_name required' });
  }

  // Derive year from explicit field, or from ID prefix (PRD26- → 2026), or from planned_start
  const derivedYear = production_year
    || (id.match(/^PRD(\d{2})-/) ? 2000 + parseInt(id.match(/^PRD(\d{2})-/)[1], 10) : null)
    || (planned_start ? new Date(planned_start).getFullYear() : null);

  try {
    const { rows } = await db.query(
      `INSERT INTO productions
        (id, brand_id, project_name, product_type, producer,
         planned_start, planned_end, planned_budget_2026, estimated_budget, actual_spent,
         payment_date, stage, production_type, production_category,
         timeline_sync, shoot_dates, delivery_date, air_date,
         custom_columns, custom_fields, production_year, parent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        id, brand_id, project_name,
        product_type || [],
        producer,
        planned_start || null, planned_end || null,
        planned_budget_2026 || 0, estimated_budget || 0, actual_spent || 0,
        payment_date || null,
        B.normalizeStage(stage) || 'Pending',
        production_type || '', production_category || null,
        timeline_sync || false,
        shoot_dates || [],
        delivery_date || null, air_date || null,
        JSON.stringify(custom_columns || []),
        JSON.stringify(custom_fields || {}),
        derivedYear,
        parent_id || null,
      ]
    );
    res.status(201).json(rows[0]);
    // Best-effort: auto-create the finance mirror sheet for the new production
    // (non-blocking; safe no-op if Google isn't connected)
    createFinanceSheet(id).catch(e => console.error(`finance-sheet auto-create failed for ${id}:`, e.message));
  } catch (err) {
    console.error('POST /productions error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Production ID already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/productions/:id/lock — lock (= closed for finance) / unlock (= reopened) a production (admin only).
// Closing emails finance; reopening needs a reason (`_finance.note`) and alerts finance straight away.
router.post('/:id/lock', requireAdmin, async (req, res) => {
  try {
    const locked = !!req.body.locked;
    const { rows: cur } = await db.query('SELECT id, brand_id, project_name, locked FROM productions WHERE id = $1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Not found' });
    const old = cur[0];
    const flow = parseFlow(req.body);
    if (!locked && old.locked && !flow?.note) {
      return res.status(409).json({ error: 'Reopening a closed production needs a reason — finance is told straight away.', code: 'unlock_reason', production_id: old.id, production: old.project_name });
    }
    const { rows } = await db.query(
      `UPDATE productions SET locked = $1, locked_at = CASE WHEN $1 THEN NOW() ELSE NULL END, locked_by = CASE WHEN $1 THEN $2 ELSE NULL END, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [locked, req.user?.name || req.user?.email || 'Admin', req.params.id]
    );
    if (!!old.locked !== locked) {
      await db.query(
        `INSERT INTO change_history (production_id, field, old_value, new_value, user_id, user_name) VALUES ($1, 'locked', $2, $3, $4, $5)`,
        [old.id, old.locked ? 'Closed' : 'Open', locked ? 'Closed' : 'Open', req.user.id, req.user.name]);
      await Events.record(db, [{
        brand_id: old.brand_id, production_id: old.id, kind: locked ? 'locked' : 'unlocked', label: old.project_name,
        old_value: old.locked ? 'closed' : 'open', new_value: locked ? 'closed' : 'open', note: flow?.note || null, ...Events.actor(req),
      }]);
      require('../lib/finance/notify').run().catch(e => console.error('[finance] notify:', e.message));
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /productions/:id/lock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/productions/:id
router.patch('/:id', requireEditor, async (req, res) => {
  // Check if production is locked — only admins can edit locked productions
  const RANK = { Viewer: 0, Accounting: 1, Editor: 2, Admin: 3 };
  const isAdmin = (RANK[req.user?.role] ?? 0) >= RANK.Admin;
  let old;
  try {
    const { rows: cur } = await db.query(`${PROD_SELECT} WHERE id = $1`, [req.params.id]);
    old = cur[0];
    if (!old) return res.status(404).json({ error: 'Not found' });
    if (old.locked && !isAdmin) {
      return res.status(403).json({ error: 'This production is locked. Only admins can edit locked productions.' });
    }
  } catch (err) {
    console.error('PATCH /productions lookup error:', err);
    return res.status(500).json({ error: 'Server error' });
  }

  const allowed = [
    'id','project_name','product_type','producer','planned_start','planned_end',
    'planned_budget_2026','estimated_budget','actual_spent','payment_date',
    'stage','production_type','production_category','timeline_sync',
    'shoot_dates','delivery_date','air_date','custom_columns','custom_fields',
    'production_year','taxi_plan','timeline_mode','parent_id',
  ];

  let updates = Object.entries(req.body)
    .filter(([k]) => allowed.includes(k))
    .map(([k, v]) => (k === 'stage' ? [k, B.normalizeStage(v)] : [k, v]));

  // ── Finance rules ──
  const events = [];
  const base = { brand_id: old.brand_id, production_id: old.id, label: old.project_name, ...Events.actor(req) };
  const same = (k, v) => String(B.ymdOf(v) ?? v ?? '') === String(B.ymdOf(old[k]) ?? old[k] ?? '');
  // Dates come from the budget lines once any line has dates
  const dateEdits = updates.filter(([k, v]) => (k === 'planned_start' || k === 'planned_end') && !same(k, v));
  updates = updates.filter(([k, v]) => !((k === 'planned_start' || k === 'planned_end') && same(k, v)));
  if (dateEdits.length) {
    let dl;
    try { ({ rows: dl } = await db.query('SELECT 1 FROM production_line_items WHERE production_id = $1 AND (timeline_start IS NOT NULL OR timeline_end IS NOT NULL) LIMIT 1', [old.id])); }
    catch (err) { console.error('PATCH /productions dates check error:', err); return res.status(500).json({ error: 'Server error' }); }
    if (dl.length) return res.status(409).json({ error: 'This production’s dates come from its budget lines — change the line dates, or use Shift dates.', code: 'dates_from_lines' });
    if (old.locked) return res.status(423).json({ error: 'This production is closed (locked). Unlock it to change its dates.', code: 'locked' });
    // Undated lines take the production's dates, so moving them to a later month is a postponement too
    const next = { start: B.ymdOf(dateEdits.find(([k]) => k === 'planned_start')?.[1]) || old.planned_start, end: B.ymdOf(dateEdits.find(([k]) => k === 'planned_end')?.[1]) || old.planned_end };
    if (old.planned_start && next.start) {
      const W = require('../lib/creative/week');
      const d = evaluateDates({ prod: old, before: { start: old.planned_start, end: old.planned_end }, after: next, flow: parseFlow(req.body), todayMonth: `${W.localDate(Date.now()).slice(0, 7)}-01`, base: { brand_id: old.brand_id, production_id: old.id, ...Events.actor(req) } });
      if (d.needs) return res.status(409).json({ error: 'Moving this production to a later month needs a reason.', ...d.needs, production_id: old.id, production: old.project_name });
      events.push(...d.events);
    }
  }
  // The approved Planned Budget only moves with a reason and who approved it
  const plannedEdit = updates.find(([k]) => k === 'planned_budget_2026');
  if (plannedEdit && Math.abs(B.num(plannedEdit[1]) - B.num(old.planned_budget_2026)) > 0.004) {
    if (old.locked) return res.status(423).json({ error: 'This production is closed (locked). Unlock it to change the budget.', code: 'locked' });
    if (B.isApproved(old)) {
      const { rows: ls } = await db.query('SELECT * FROM production_line_items WHERE production_id = $1', [old.id]).catch(() => ({ rows: [] }));
      const core = B.sums(ls, B.num(old.approved_fx_rate) || 3.7).core;
      if (B.num(plannedEdit[1]) < core - 0.5) return res.status(400).json({ error: `The Planned Budget can’t be below the lines ($${Math.round(core).toLocaleString('en-US')}) — lower the lines first.` });
      const d = Events.parseDecision(req.body);
      if (!d?.reason || !d.approved_by) {
        return res.status(409).json({ error: 'The Planned Budget is approved — changing it needs a reason and who approved it.', code: 'reason_required', mode: 'planned_change', need_approver: true, production_id: old.id, production: old.project_name, impact: { planned: B.num(old.planned_budget_2026), newPlanned: B.num(plannedEdit[1]) } });
      }
      events.push({ ...base, kind: 'budget_increase', field: 'planned_budget_2026', old_value: B.num(old.planned_budget_2026), new_value: B.num(plannedEdit[1]), currency: 'USD', delta_usd: B.round2(B.num(plannedEdit[1]) - B.num(old.planned_budget_2026)), ...decisionFields(d) });
    }
  }
  // Completing, pausing or reopening a production finance knows about asks why (and if work happened this month)
  const stageEdit = updates.find(([k]) => k === 'stage');
  if (stageEdit && stageEdit[1] !== B.normalizeStage(old.stage)) {
    const to = stageEdit[1], from = B.normalizeStage(old.stage);
    const kind = to === 'Completed' && !B.isDone(from) ? 'completed'
      : to === 'Paused' && from !== 'Paused' ? 'paused'
        : (B.isDone(from) || from === 'Paused') && !B.isDone(to) && to !== 'Paused' ? 'reopened' : null;
    if (kind && B.financeKnows(old)) {
      const flow = parseFlow(req.body);
      const askWork = kind !== 'reopened';
      if (!flow?.note || (askWork && flow.work_this_month == null)) {
        return res.status(409).json({
          error: kind === 'reopened' ? 'Reopening a production needs a reason — finance is told straight away.' : `Marking it ${to} tells finance — add a short note and whether any work or cost happened this month.`,
          code: 'stage_prompt', kind, stage: to, from, ask_work: askWork, production_id: old.id, production: old.project_name,
        });
      }
      events.push({ ...base, kind, field: 'stage', old_value: from, new_value: to, note: flow.note, meta: { work_this_month: askWork ? flow.work_this_month : null } });
    } else {
      events.push({ ...base, kind: 'stage_changed', field: 'stage', old_value: from, new_value: to });
    }
  }

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  const setClause = updates.map(([k], i) => `"${k}" = $${i + 2}`).join(', ');
  const values    = updates.map(([, v]) => v);

  const oldId   = req.params.id;
  const newId   = req.body.id;
  const renaming = updates.some(([k]) => k === 'id') && newId && newId !== oldId;

  // Tables that store production_id as plain TEXT (no FK), so ON UPDATE CASCADE
  // does not reach them. They must be updated explicitly when renaming a PRD code.
  const NON_FK_TABLES = ['cc_purchases', 'call_sheets', 'casting', 'notifications', 'gantt_phases', 'supplier_submissions', 'studio_ticket_links', 'finance_events', 'finance_sheet_rows', 'email_outbox'];

  try {
    let rows;
    if (renaming) {
      // Renaming the primary key. FK tables cascade automatically; the plain-text
      // tables above are updated in the same transaction so nothing is orphaned.
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE productions SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [oldId, ...values]
        );
        if (!upd.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Not found' });
        }
        for (const t of NON_FK_TABLES) {
          await client.query(`UPDATE ${t} SET production_id = $1 WHERE production_id = $2`, [newId, oldId]);
        }
        await client.query('UPDATE productions SET parent_id = $1 WHERE parent_id = $2', [newId, oldId]);
        await client.query('COMMIT');
        rows = upd.rows;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } else {
      const r = await db.query(
        `UPDATE productions SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [oldId, ...values]
      );
      rows = r.rows;
    }
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Log changes to change_history (with the old value)
    for (const [field, newVal] of updates) {
      if (req.body._log !== false && String(B.ymdOf(old[field]) ?? old[field] ?? '') !== String(newVal ?? '')) {
        await db.query(
          `INSERT INTO change_history (production_id, field, old_value, new_value, user_id, user_name)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [rows[0].id, field, old[field] == null ? null : (typeof old[field] === 'object' && !(old[field] instanceof Date) ? JSON.stringify(old[field]) : String(B.ymdOf(old[field]) ?? old[field])), String(newVal), req.user.id, req.user.name]
        );
      }
    }
    if (events.length) {
      await Events.record(db, events.map(e => ({ ...e, production_id: rows[0].id })));
      if (events.some(e => (Events.KIND[e.kind] ?? null) === 'instant')) require('../lib/finance/notify').run().catch(e => console.error('[finance] notify:', e.message));
    }

    triggerFinanceSync(rows[0].id); // refresh sheet title/status if one is linked
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /productions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/productions/:id  (admin only — cascades all related data)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const prodId = req.params.id;
    // Check production exists
    const { rows: check } = await db.query('SELECT id, project_name, locked FROM productions WHERE id = $1', [prodId]);
    if (!check[0]) return res.status(404).json({ error: 'Not found' });
    if (check[0].locked) return res.status(403).json({ error: 'Cannot delete a locked production. Unlock it first.' });

    // Explicitly clean up tables without FK CASCADE (orphan-prone)
    await db.query('DELETE FROM casting WHERE production_id = $1', [prodId]).catch(() => {});
    await db.query('DELETE FROM change_history WHERE production_id = $1', [prodId]).catch(() => {});
    await db.query('DELETE FROM cc_purchases WHERE production_id = $1', [prodId]).catch(() => {});
    // Unlink contracts (set production_id to null, don't delete contracts themselves)
    await db.query('UPDATE contracts SET production_id = NULL WHERE production_id = $1', [prodId]).catch(() => {});
    // Unlink suppliers (remove from production association)
    await db.query('DELETE FROM supplier_productions WHERE production_id = $1', [prodId]).catch(() => {});
    // Unlink scripts (set production_id null, don't delete scripts)
    await db.query('UPDATE scripts SET production_id = NULL WHERE production_id = $1', [prodId]).catch(() => {});

    // Delete production (cascades: line_items, comments, links, gantt_events, invoices, receipts, call_sheets, weekly entries, people_on_set, etc.)
    const { rows } = await db.query('DELETE FROM productions WHERE id = $1 RETURNING id, project_name', [prodId]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    console.log(`[ADMIN] Production deleted: ${rows[0].project_name} (${rows[0].id}) by ${req.user?.name || req.user?.email}`);
    res.json({ success: true, id: rows[0].id, name: rows[0].project_name });
  } catch (err) {
    console.error('DELETE /productions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
