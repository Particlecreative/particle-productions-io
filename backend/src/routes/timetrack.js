/**
 * Task time tracking API (/api/timetrack) — how long Video / Design tasks take, from the request to delivery, split by
 * status, and the real working time (time in Working while the editor / designer was clocked in on BambooHR).
 *
 *   GET /overview      the management panel (Admin, Editor, super admin) — ?from=&to=&board=&person=&product=&type=&requester=&campaign=&force=1
 *   GET /overview.csv  the same task list as a spreadsheet
 *   GET /task/:board/:itemId   one task's timeline + numbers — Admin / Editor: any task; Growth: read; Creative: their own task only
 *
 * Creative and Growth reach /task only if middleware/auth.js lists it for them.
 */
const router = require('express').Router();
const { verifyJWT, RANK } = require('../middleware/auth');
const TT = require('../lib/timetrack/data');
const E = require('../lib/timetrack/engine');

const DEFAULT_BRAND = 'particle';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorJson(res, err, fallback = 'Something went wrong') {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[timetrack]', err?.stack || err);
  res.status(status).json({ error: status >= 500 && !err?.message ? fallback : (err?.message || fallback) });
}

const canManage = (u) => !!u?.super_admin || (RANK[u?.role] ?? -1) >= RANK.Editor;

router.use(verifyJWT);
router.use((req, res, next) => {
  const brandId = String(req.query.brand_id || DEFAULT_BRAND);
  const u = req.user || {};
  if (!(u.super_admin || u.brand_id === brandId || (u.brand_ids || []).includes(brandId))) return res.status(403).json({ error: 'No access to this brand' });
  req.brandId = brandId;
  next();
});

/** Range from the query (defaults to this month so far, Israel time). */
function rangeOf(q) {
  const today = E.localYmd(Date.now());
  const from = DATE_RE.test(q.from || '') ? q.from : `${today.slice(0, 8)}01`;
  const to = DATE_RE.test(q.to || '') ? q.to : today;
  return { from, to };
}
function filtersOf(q) {
  const f = {};
  for (const k of ['person', 'product', 'type', 'requester', 'campaign']) {
    const v = typeof q[k] === 'string' ? q[k].trim().slice(0, 200) : '';
    if (v) f[k] = v;
  }
  return f;
}
const boardOf = (q) => (['video', 'design'].includes(q.board) ? q.board : 'all');

function manageOnly(req, res, next) {
  if (!canManage(req.user)) return res.status(403).json({ error: 'Time tracking is for Editors and Admins' });
  next();
}

// My month (25 Nov 2026) — the person's own numbers for a month: delivered, worked per task, review rounds, on time
router.get('/me', async (req, res) => {
  try {
    const { mondayIdOf } = require('../lib/studio/myRequests');
    const me = await mondayIdOf(req.user);
    if (!me?.id) return res.json({ connected: false });
    const today = E.localYmd(Date.now());
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : today.slice(0, 7);
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const to = last < today ? last : today;
    if (`${month}-01` > today) return res.json({ connected: true, month, kpis: null, tasks: [] });
    const data = await TT.load({ from: `${month}-01`, to }, { brandId: req.brandId });
    const o = TT.overview(data, { person: String(me.id) });
    const done = o.tasks.filter(t => t.delivered_in_range);
    res.json({
      connected: true, month, from: `${month}-01`, to,
      kpis: { delivered: o.kpis.delivered, open: o.kpis.open, median_worked_ms: o.kpis.median_worked_ms, median_lead_ms: o.kpis.median_lead_ms,
        avg_review_rounds: o.kpis.avg_review_rounds, on_time_pct: o.kpis.on_time_pct, busy_ms: o.kpis.busy_ms, clocked_ms: o.kpis.clocked_ms, estimated: o.kpis.estimated },
      tasks: done.slice(0, 8).map(t => ({ id: t.id, board: t.board, name: t.name, worked_ms: t.worked_ms, review_rounds: t.review_rounds, delivered_at: t.delivered_at, estimated: t.estimated })),
    });
  } catch (err) { errorJson(res, err); }
});

router.get('/overview', manageOnly, async (req, res) => {
  try {
    const data = await TT.load(rangeOf(req.query), { brandId: req.brandId, board: boardOf(req.query), force: req.query.force === '1' });
    res.json({ ...TT.overview(data, filtersOf(req.query)), board: boardOf(req.query) });
  } catch (err) { errorJson(res, err); }
});

router.get('/overview.csv', manageOnly, async (req, res) => {
  try {
    const r = rangeOf(req.query);
    const data = await TT.load(r, { brandId: req.brandId, board: boardOf(req.query) });
    const name = `task-time_${boardOf(req.query)}_${data.range.from}_${data.range.to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(TT.toCsv(data, filtersOf(req.query)));
  } catch (err) { errorJson(res, err); }
});

router.get('/task/:board/:itemId', async (req, res) => {
  try {
    const u = req.user || {};
    const { board, itemId } = req.params;
    if (!['video', 'design'].includes(board) || !/^\d+$/.test(itemId)) return res.status(404).json({ error: 'Task not found' });
    if (!canManage(u)) {
      if (u.role === 'Creative') {
        const { isMine } = require('../lib/studio/myTasks');
        if (!(await isMine({ brandId: req.brandId, user: u, itemId }).catch(() => false))) return res.status(403).json({ error: 'You can see the time of your own tasks' });
      } else if (u.role !== 'Growth') {
        return res.status(403).json({ error: 'Time tracking is for Editors and Admins' });
      }
    }
    res.json(await TT.loadTask({ brandId: req.brandId, board, itemId, force: req.query.force === '1' }));
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
