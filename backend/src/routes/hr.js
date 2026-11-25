/**
 * /api/hr — My HR (everyone, their own BambooHR) and the HR panel (admins, the company BambooHR). 25 Nov 2026.
 *   GET    /me                          everything My HR shows (or { connected: false, company_subdomain })
 *   GET    /me/clock                    the header pill: clocked in? since when? today's hours
 *   POST   /me/connect                  { api_key, subdomain? } — a personal BambooHR API key (sealed, never sent back)
 *   DELETE /me                          disconnect
 *   POST   /me/clock-in                 { note? }
 *   POST   /me/clock-out                { date?, end? } — date/end only to close an entry left open on an earlier day
 *   POST   /me/time-off                 { type_id, start, end, amount?, note?, half_day? }
 *   POST   /me/time-off/:id/cancel      a pending request of mine
 *   GET    /team?week=YYYY-MM-DD        (admins) today board, week grid, requests, who's out, connections
 *   POST   /team/time-off/:id/approve   (admins) { note? }
 *   POST   /team/time-off/:id/deny      (admins) { note? }
 * Errors: { error, code? }. Never 401 (the app would sign the person out) and never 502–504 (it would say "updating").
 */
const router = require('express').Router();
const { verifyJWT, requireAdmin } = require('../middleware/auth');
const P = require('../lib/hr/personal');
const T = require('../lib/hr/team');
const I = require('../lib/hr/insights');

function errorJson(res, err) {
  let status = Number(err?.status) || 500;
  if (status === 401 || (status >= 502 && status <= 504)) status = 424;
  if (status < 400 || status > 599) status = 500;
  const known = !!err?.status;
  if (!known || status >= 500) console.error('[hr]', err?.message);
  res.status(status).json({ error: known ? err.message : 'Something went wrong on our side — try again in a moment', ...(err?.code ? { code: err.code } : {}) });
}
const uid = (req) => String(req.user.id);
const wrap = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (err) { errorJson(res, err); } };

// A few wrong keys in a row make BambooHR lock the key out for a while — keep people from tripping it
const tries = new Map(); // user id → [timestamps]
function connectAllowed(userId) {
  const now = Date.now();
  const list = (tries.get(userId) || []).filter(t => now - t < 10 * 60000);
  if (list.length >= 5) { tries.set(userId, list); return false; }
  list.push(now);
  tries.set(userId, list);
  return true;
}

router.use(verifyJWT);

// ── My HR ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
router.get('/me', wrap((req) => P.me(uid(req), { force: req.query.fresh === '1' })));
router.get('/me/clock', wrap((req) => P.clockState(uid(req))));
router.get('/me/month', wrap((req) => P.monthFor(uid(req), typeof req.query.month === 'string' ? req.query.month : undefined)));
// The team's days off (vacation / sick / other) — My Studio shows who's out (everyone signed in)
router.get('/out', wrap((req) => I.teamOut({ from: req.query.from, to: req.query.to })));
router.post('/me/connect', async (req, res) => {
  if (!connectAllowed(uid(req))) return res.status(429).json({ error: 'Too many tries — wait 10 minutes, then paste the key again', code: 'busy' });
  try {
    const r = await P.connect(uid(req), req.body?.api_key, req.body?.subdomain);
    tries.delete(uid(req));
    res.json(r);
  } catch (err) { errorJson(res, err); }
});
router.delete('/me', wrap((req) => P.disconnect(uid(req))));
router.post('/me/clock-in', wrap((req) => P.clockIn(uid(req), { note: req.body?.note })));
router.post('/me/clock-out', wrap((req) => P.clockOut(uid(req), { date: req.body?.date, end: req.body?.end })));
router.post('/me/time-off', wrap((req) => P.requestTimeOff(uid(req), req.body || {})));
router.post('/me/time-off/:id/cancel', wrap((req) => P.cancelTimeOff(uid(req), req.params.id)));

// ── HR panel (admins) ─────────────────────────────────────────────────────────────────────────────────────────────────
router.get('/team', requireAdmin, wrap((req) => T.team({ week: typeof req.query.week === 'string' ? req.query.week : undefined })));
// My employees (25 Nov 2026): the month dashboard (hours vs expected, %, vacation left) and one person's days read for you + tickets
router.get('/team/month', requireAdmin, wrap((req) => I.month({ month: typeof req.query.month === 'string' ? req.query.month : undefined })));
router.get('/team/person/:employeeId', requireAdmin, wrap((req) => I.person({ employeeId: req.params.employeeId, from: req.query.from, to: req.query.to })));
router.post('/team/time-off/:id/approve', requireAdmin, wrap((req) => T.approve(req.params.id, { note: req.body?.note, actor: req.user?.name || null })));
router.post('/team/time-off/:id/deny', requireAdmin, wrap((req) => T.deny(req.params.id, { note: req.body?.note, actor: req.user?.name || null })));

module.exports = router;
