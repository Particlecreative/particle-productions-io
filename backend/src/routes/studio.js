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
const { getCreativeConfig } = require('../lib/creative/config');
const { updateTask, getUpdates, postUpdate } = require('../lib/studio/write');
const tickets = require('../lib/studio/tickets');
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
    const data = await getStudio({ brandId: req.brandId, from, to, force: req.query.force === '1', lite: req.query.lite === '1' });
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

// ── Workload: reschedule / reassign (writes the task's timeline + person columns on Monday) ──
router.patch('/items/:itemId', async (req, res) => {
  try {
    const { board, timeline, people, status, deadline } = req.body || {};
    const config = await getCreativeConfig(req.brandId);
    // Vacations layer: never schedule work onto someone's day off
    if (timeline && (await bamboo.configured().catch(() => false))) {
      const who = Array.isArray(people) ? people : (req.body.current_people || []);
      if (who.length) {
        // People's names / emails don't depend on the period — reuse this week's light build (usually cached)
        const week = W.sundayOf(Date.now());
        const studio = await getStudio({ brandId: req.brandId, from: week, to: W.addDays(week, 6), lite: true }).catch(() => null);
        const plist = who.map(id => studio?.people?.[id]).filter(Boolean).map(p => ({ id: p.id, name: p.name, email: p.email }));
        if (plist.length) {
          const wo = await bamboo.whosOut(plist, timeline.from, timeline.to);
          // A task can't start or end on someone's day off (crossing one is fine)
          const ends = [timeline.from, timeline.to];
          for (const p of plist) {
            const clash = [...(wo.byPerson[p.id] || []), ...wo.holidays].find(o => ends.some(d => d >= o.start && d <= o.end));
            if (clash) return res.status(409).json({ error: `${p.name.split(' ')[0]} is ${clash.type === 'holiday' ? `off (${clash.name || 'holiday'})` : 'on vacation'} ${clash.start === clash.end ? `on ${clash.start}` : `${clash.start} → ${clash.end}`}` });
          }
        }
      }
    }
    await updateTask(config, { board, itemId: req.params.itemId, timeline, people, status, deadline });
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

// Updates (comments) — read the brief and the conversation, and reply, without opening Monday
router.get('/items/:itemId/updates', async (req, res) => {
  try {
    const config = await getCreativeConfig(req.brandId);
    res.json({ updates: await getUpdates(config, req.params.itemId) });
  } catch (err) { errorJson(res, err); }
});

router.post('/items/:itemId/updates', async (req, res) => {
  try {
    const config = await getCreativeConfig(req.brandId);
    res.json(await postUpdate(config, req.params.itemId, req.body?.text, req.user?.name || req.user?.email || null));
  } catch (err) { errorJson(res, err); }
});

// ── AI ticket creator ───────────────────────────────────────────────────────
async function ticketPeople(brandId, user) {
  const data = await getStudio({ brandId, from: W.sundayOf(Date.now()), to: W.addDays(W.sundayOf(Date.now()), 6) });
  const studio = Object.values(data.people);
  const pool = (role) => studio.filter(p => p.role === role).map(p => ({ id: p.id, name: p.name }));
  const req = new Map(Object.values(data.requesters).map(r => [r.id, { id: r.id, name: r.name }]));
  for (const p of studio) req.set(p.id, { id: p.id, name: p.name });
  // The person typing is usually the requester — find their Monday account by email
  if (user?.email) {
    try {
      const me = await monday.cached(`me:${user.email}`, 6 * 3600000, async () =>
        (await monday.mondayQuery('query ($e: [String]) { users(emails: $e) { id name } }', { e: [user.email] }))?.users?.[0] || null);
      if (me) req.set(String(me.id), { id: String(me.id), name: me.name });
    } catch { /* optional */ }
  }
  return { requesters: [...req.values()].sort((a, b) => a.name.localeCompare(b.name)), video: pool('video'), design: pool('design') };
}

async function formFor(req) {
  const config = await getCreativeConfig(req.brandId);
  const people = await ticketPeople(req.brandId, req.user);
  return { config, people, form: await tickets.ticketForm(config, people) };
}

router.get('/ticket-form', async (req, res) => {
  try {
    const { form } = await formFor(req);
    res.json({ ...form, recent: await tickets.recentTickets(12), empty: tickets.emptyFields() });
  } catch (err) { errorJson(res, err); }
});

router.post('/ticket/draft', async (req, res) => {
  try {
    const { form } = await formFor(req);
    const out = await tickets.draftTicket({ form, messages: req.body?.messages, draft: req.body?.draft, board: req.body?.board, userName: req.user?.name });
    res.json(out);
  } catch (err) { errorJson(res, err); }
});

router.post('/ticket/submit', async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirm the ticket first' });
    const { config, people, form } = await formFor(req);
    const out = await tickets.submitTicket({ config, form, board: req.body.board, fields: req.body.fields, people, user: req.user, conversation: req.body.conversation });
    res.json({ ok: true, ...out });
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
