/**
 * Studio Control API — the studio management panel (dashboard, effort, TV ↔ productions, inspiration).
 * Editor+ with Particle brand access: it shows per-person effort and workload.
 */
const router = require('express').Router();
const { verifyJWT } = require('../middleware/auth');
const W = require('../lib/creative/week');
const { getStudio } = require('../lib/studio/data');
const { getCampaigns } = require('../lib/studio/campaigns');
const hot = require('../lib/studio/hotProjects');
const { decide } = require('../lib/studio/tvLinks');
const { dailyInspiration, tmdbConfigured, testTmdb } = require('../lib/studio/inspiration');
const secrets = require('../lib/studio/secrets');
const { getCreativeConfig } = require('../lib/creative/config');
const { updateTask, archiveTask } = require('../lib/studio/write');
const tickets = require('../lib/studio/tickets');
const monday = require('../lib/monday');
const bamboo = require('../lib/studio/bamboohr');
const sources = require('../lib/studio/sources');
const multer = require('multer');

// Ticket creator files: one per request, kept in memory then stored in Postgres
const ticketUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const DEFAULT_BRAND = 'particle';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorJson(res, err, fallback = 'Server error') {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[studio]', err?.stack || err);
  res.status(status).json({ error: err?.message || fallback });
}

// ── Dropbox (ticket folders) sign-in callback — public: Dropbox sends the browser here; the state check protects it ──
router.get('/dropbox/callback', async (req, res) => {
  const back = `${appBase(req)}/studio?tab=connections`;
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error).slice(0, 200));
    await require('../lib/studio/dropboxFolders').finishConnect({ code: String(req.query.code || ''), state: String(req.query.state || '') });
    res.redirect(`${back}&dropbox=connected`);
  } catch (e) {
    res.redirect(`${back}&dropbox_error=${encodeURIComponent(e.message)}`);
  }
});
function appBase(req) { return (process.env.APP_URL || `https://${req.get('host')}`).replace(/\/$/, ''); }

router.use(verifyJWT);
router.use((req, res, next) => {
  // Growth reaches only what middleware/auth.js lists for it (dashboard, campaigns, the ticket creator)
  if ((RANK[req.user?.role] ?? -1) < RANK.Editor && req.user?.role !== 'Growth' && req.user?.role !== 'Creative') return res.status(403).json({ error: 'Editor access required' });
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

/** Every Video + Design ticket that has a Campaign (the Campaign Tracker), grouped in the browser. */
router.get('/campaigns', async (req, res) => {
  try {
    const data = await getCampaigns({ brandId: req.brandId, force: req.query.force === '1' });
    // Campaign groups (17 Nov 2026): which group each campaign is in — rules + hand-placed, kept in CP
    const G = require('../lib/studio/campaignGroups');
    const labels = [...new Set(data.items.flatMap(it => it.campaigns || []))];
    const groups = G.classify(labels, await G.getConfig(req.brandId));
    res.json({ ...data, campaign_groups: groups, today: W.localDate(Date.now()) });
  } catch (err) { errorJson(res, err); }
});

/** Creative Studio → My requests: the tickets the signed-in person asked for (their Monday user is the requester). */
router.get('/my-requests', async (req, res) => {
  try {
    const data = await require('../lib/studio/myRequests').getMyRequests({ brandId: req.brandId, user: req.user, force: req.query.force === '1' });
    res.json({ ...data, today: W.localDate(Date.now()) });
  } catch (err) { errorJson(res, err); }
});

// The Creative team's own tasks (25 Nov 2026): every ticket they're the editor / designer on — Board, My tasks, Home
router.get('/my-tasks', async (req, res) => {
  try {
    const data = await require('../lib/studio/myTasks').getMyTasks({ brandId: req.brandId, user: req.user, force: req.query.force === '1' });
    res.json({ ...data, today: W.localDate(Date.now()) });
  } catch (err) { errorJson(res, err); }
});

/**
 * The Creative team works their own tickets only (25 Nov 2026): the editor / designer on it, or the one who asked.
 * Admins, the Studio and editors are not limited. Answers false (and has replied 403) when it isn't theirs.
 */
async function creativeOwn(req, res, itemId) {
  if (req.user?.role !== 'Creative') return true;
  const ok = await require('../lib/studio/myTasks').isMine({ brandId: req.brandId, user: req.user, itemId }).catch(() => false);
  if (!ok) res.status(403).json({ error: 'That ticket isn’t yours — only its editor / designer or requester can change it here', code: 'not_yours' });
  return ok;
}

/** Every campaign label on both boards → its group (cheap: board settings only, no tickets) — the Workload's stats. */
router.get('/campaign-groups', async (req, res) => {
  try {
    const G = require('../lib/studio/campaignGroups');
    const { getCreativeConfig } = require('../lib/creative/config');
    const config = await getCreativeConfig(req.brandId);
    const labels = new Set();
    for (const bk of Object.keys(config.boards)) {
      const col = config.boards[bk].columns?.campaign;
      if (!col) continue;
      const meta = await monday.boardMeta(config.boards[bk].board_id).catch(() => null);
      for (const l of meta?.dropdowns?.[col] || []) labels.add(l);
    }
    res.json(G.classify([...labels].filter(Boolean), await G.getConfig(req.brandId)));
  } catch (err) { errorJson(res, err); }
});

/** Put a campaign in a group ({ campaign, group|null }), add a group ({ add: { name } }) or rename one ({ rename: { key, name } }). Editors. */
router.put('/campaign-groups', async (req, res) => {
  try {
    if ((RANK[req.user?.role] ?? -1) < RANK.Editor && !req.user?.super_admin) return res.status(403).json({ error: 'Editors can arrange campaign groups' });
    const G = require('../lib/studio/campaignGroups');
    const cfg = await G.saveConfig(req.body || {}, req.brandId);
    res.json({ ok: true, groups: G.groupsOf(cfg), config: cfg });
  } catch (err) { errorJson(res, err); }
});

// ── Hot Projects: the big projects the team pinned, with their Monday data and analytics ──
router.get('/hot-projects', async (req, res) => {
  try { res.json(await hot.getHotProjects({ brandId: req.brandId, force: req.query.force === '1' })); } catch (err) { errorJson(res, err); }
});

/** Candidates to pin, ranked (priority, who asked, size, urgency); q searches every open ticket. */
router.get('/hot-projects/suggestions', async (req, res) => {
  try {
    res.json(await hot.suggestHotProjects({ brandId: req.brandId, q: String(req.query.q || '').slice(0, 100), requester: /^\d+$/.test(req.query.requester || '') ? req.query.requester : '' }));
  } catch (err) { errorJson(res, err); }
});

router.post('/hot-projects', async (req, res) => {
  try {
    const itemId = String(req.body?.item_id || '');
    if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: 'Bad item id' });
    res.json(await hot.addPin(req.brandId, itemId, req.user));
  } catch (err) { errorJson(res, err); }
});

router.put('/hot-projects/order', async (req, res) => {
  try { await hot.reorderPins(req.brandId, (req.body?.ids || []).map(String).filter(id => /^\d+$/.test(id))); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
});

router.patch('/hot-projects/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
    const { title, note, related } = req.body || {};
    await hot.updatePin(req.brandId, req.params.id, { title, note, related });
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

router.delete('/hot-projects/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
    await hot.removePin(req.brandId, req.params.id);
    res.json({ ok: true });
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

// Their own Monday when they connected it (Tomer, 18 Nov 2026): scheduling, assigning, archiving and comments from the
// Studio show on Monday as the person who did them, like New ticket and Medium briefs. Not connected → CP's account.
const mine = (req) => require('../lib/mondayUser').tokenFor(req.user?.id).catch(() => null);

// ── Workload: reschedule / reassign (writes the task's timeline + person columns on Monday) ──
router.patch('/items/:itemId', async (req, res) => {
  try {
    // The Creative team moves their own ticket's status — the schedule, people and deadline stay the studio's
    if (req.user?.role === 'Creative') {
      if (['timeline', 'people', 'deadline'].some(k => k in (req.body || {}))) return res.status(403).json({ error: 'The studio sets timelines, people and deadlines — you can move the status', code: 'status_only' });
      if (!(await creativeOwn(req, res, req.params.itemId))) return;
    }
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
    res.json(await updateTask(config, { board, itemId: req.params.itemId, timeline, people, status, deadline }, { token: (await mine(req))?.token }));
  } catch (err) { errorJson(res, err); }
});

// Archive a task — only after the user confirmed it in the CP
router.post('/items/:itemId/archive', async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirm the archive first' });
    const config = await getCreativeConfig(req.brandId);
    res.json(await archiveTask(config, req.params.itemId, { token: (await mine(req))?.token }));
  } catch (err) { errorJson(res, err); }
});

// Updates (comments), Monday-style (25 Nov 2026): formatting, files, likes, seen by, pins, replies — read, post, reply,
// like and edit your own without opening Monday. lib/studio/updates.js
const UPD = require('../lib/studio/updates');
const updateFiles = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 5 } });
router.get('/items/:itemId/updates', async (req, res) => {
  try {
    const config = await getCreativeConfig(req.brandId);
    res.json(await UPD.listUpdates(config, req.params.itemId, { page: req.query.page }));
  } catch (err) { errorJson(res, err); }
});

// JSON { text, mentions, parent_id } — or multipart with up to 5 "files" (mentions as a JSON string)
router.post('/items/:itemId/updates', (req, res) => {
  updateFiles.array('files', 5)(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Files can be up to 50 MB each' : err.code === 'LIMIT_FILE_COUNT' ? 'Up to 5 files at a time' : err.message });
      if (!(await creativeOwn(req, res, req.params.itemId))) return;
      const config = await getCreativeConfig(req.brandId);
      let mentions = req.body?.mentions;
      if (typeof mentions === 'string') { try { mentions = JSON.parse(mentions); } catch { mentions = []; } }
      // Browsers send UTF-8 names that multer reads as latin1 (Hebrew names, dashes…)
      const files = (req.files || []).map(f => ({ name: Buffer.from(f.originalname || 'file', 'latin1').toString('utf8'), mime: f.mimetype, buffer: f.buffer }));
      if (!String(req.body?.text || '').trim() && !files.length) return res.status(400).json({ error: 'Write something first' });
      res.json(await UPD.post(config, req.params.itemId, {
        text: req.body?.text, mentions, parentId: req.body?.parent_id || null, files,
        author: req.user?.name || req.user?.email || null, mine: await mine(req),
      }));
    } catch (e) { errorJson(res, e); }
  });
});

router.post('/items/:itemId/updates/:updateId/like', async (req, res) => {
  try {
    if (!(await creativeOwn(req, res, req.params.itemId))) return;
    const config = await getCreativeConfig(req.brandId);
    res.json(await UPD.like(config, req.params.itemId, req.params.updateId, req.body?.on !== false, await mine(req)));
  } catch (err) { errorJson(res, err); }
});

router.put('/items/:itemId/updates/:updateId', async (req, res) => {
  try {
    const config = await getCreativeConfig(req.brandId);
    res.json(await UPD.edit(config, req.params.itemId, req.params.updateId, req.body?.text, req.body?.mentions, await mine(req)));
  } catch (err) { errorJson(res, err); }
});

// A delivery link — Frame.io (video), Figma (design), Dropbox — pasted by the editor / designer (25 Nov 2026)
router.patch('/items/:itemId/link', async (req, res) => {
  try {
    if (!(await creativeOwn(req, res, req.params.itemId))) return;
    const config = await getCreativeConfig(req.brandId);
    const kind = String(req.body?.kind || '');
    if (!['frame', 'figma', 'dropbox', 'project_link'].includes(kind)) return res.status(400).json({ error: 'Unknown link' });
    // the ticket creator makes the Dropbox folder — editors / designers deliver Frame.io / Figma only (Tomer, 25 Nov 2026)
    if (req.user?.role === 'Creative' && !['frame', 'figma'].includes(kind)) return res.status(403).json({ error: 'The Dropbox folder comes with the ticket — paste your Frame.io or Figma link', code: 'delivery_only' });
    res.json(await require('../lib/studio/write').setLink(config, { itemId: req.params.itemId, kind, url: req.body?.url }, { token: (await mine(req))?.token }));
  } catch (err) { errorJson(res, err); }
});

// The task's history (status moves, people, timeline and deadline changes) from Monday's activity log
router.get('/items/:itemId/activity', async (req, res) => {
  try {
    const config = await getCreativeConfig(req.brandId);
    res.json(await UPD.activity(config, req.params.itemId));
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
    const { form, config } = await formFor(req);
    const out = await tickets.draftTicket({ form, config, messages: req.body?.messages, draft: req.body?.draft, board: req.body?.board, userName: req.user?.name, files: req.body?.files });
    res.json(out);
  } catch (err) { errorJson(res, err); }
});

// A file for the ticket: Claude can read it for the brief, and/or it's attached to the Monday ticket
router.post('/ticket/files', (req, res) => {
  ticketUpload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Files can be up to 50 MB' : err.message });
      if (!req.file) return res.status(400).json({ error: 'No file' });
      // Browsers send UTF-8 names that multer reads as latin1 (Hebrew names, dashes…)
      const name = Buffer.from(req.file.originalname || 'file', 'latin1').toString('utf8');
      res.json(await sources.saveUpload({ name, mime: req.file.mimetype, buffer: req.file.buffer, user: req.user }));
    } catch (e) { errorJson(res, e); }
  });
});

// ── the public request link (anyone with it can request a ticket; they say who they are) ──
const ticketLinks = require('../lib/studio/ticketLinks');
const linkJson = (l) => (l ? { url: `${(process.env.APP_URL || '').replace(/\/$/, '')}/request/${l.token}`, path: `/request/${l.token}`, created_by: l.created_by, created_at: l.created_at, uses: l.uses, last_used_at: l.last_used_at } : null);
router.get('/ticket-link', async (req, res) => {
  try { res.json({ link: linkJson(await ticketLinks.current(req.brandId)), can_manage: (RANK[req.user?.role] ?? -1) >= RANK.Admin || !!req.user?.super_admin }); } catch (err) { errorJson(res, err); }
});
router.post('/ticket-link', (req, res, next) => requireAdminTL(req, res, next), async (req, res) => {
  try { res.json({ link: linkJson(await ticketLinks.rotate(req.brandId, req.user?.name || req.user?.email)) }); } catch (err) { errorJson(res, err); }
});
router.delete('/ticket-link', (req, res, next) => requireAdminTL(req, res, next), async (req, res) => {
  try { res.json(await ticketLinks.disable(req.brandId)); } catch (err) { errorJson(res, err); }
});
function requireAdminTL(req, res, next) {
  if ((RANK[req.user?.role] ?? -1) < RANK.Admin && !req.user?.super_admin) return res.status(403).json({ error: 'Only an admin can change the request link' });
  next();
}

// Auto-plan: the timeline follows the work (lib/studio/autoplan.js) — its switch, lengths, what it did, Undo
router.get('/autoplan', async (req, res) => {
  try { const A = require('../lib/studio/autoplan'); res.json({ settings: await A.getSettings(req.brandId), recent: await A.recent() }); } catch (err) { errorJson(res, err); }
});
router.put('/autoplan', requireAdmin, async (req, res) => {
  try { res.json({ settings: await require('../lib/studio/autoplan').saveSettings(req.body || {}, req.brandId) }); } catch (err) { errorJson(res, err); }
});
router.post('/autoplan/:id/undo', async (req, res) => {
  try { res.json(await require('../lib/studio/autoplan').undo(Number(req.params.id), { actor: req.user?.name || req.user?.email, brandId: req.brandId })); } catch (err) { errorJson(res, err); }
});

// Who fits each ticket on "To schedule" — learned from 6 months of finished tickets (lib/studio/fit.js)
router.post('/fit', async (req, res) => {
  try {
    const items = (Array.isArray(req.body?.items) ? req.body.items : []).map(i => ({
      key: String(i.key || ''), board: i.board === 'design' ? 'design' : i.board === 'video' ? 'video' : null,
      type: i.type || '', product: i.product || '', brand: i.brand || '', platform: i.platform || '', department: i.department || '',
      requested_by: (Array.isArray(i.requested_by) ? i.requested_by : []).map(String).slice(0, 5),
    })).filter(i => i.key && i.board);
    res.json(await require('../lib/studio/fit').fitFor(items, { brandId: req.brandId }));
  } catch (err) { errorJson(res, err); }
});

router.post('/ticket/submit', async (req, res) => {
  try {
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirm the ticket first' });
    const { config, people, form } = await formFor(req);
    const out = await tickets.submitTicket({ config, form, board: req.body.board, fields: req.body.fields, people, user: req.user, conversation: req.body.conversation, files: req.body.files, brandId: req.brandId });
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
      dropbox: { ...(await require('../lib/studio/dropboxFolders').status(req.brandId)), redirect_uri: `${appBase(req)}/api/studio/dropbox/callback` },
      // the company's Monday app — lets each person connect their own Monday in one click (lib/mondayUser.js)
      monday_app: { connected: !!st.monday_app, ...(st.monday_app || {}), redirect_uri: require('../lib/mondayUser').redirectUri(),
        people: (await require('../lib/mondayUser').connectedUsers().catch(() => [])).map(u => ({ name: u.name, method: u.method, connected_at: u.connected_at })) },
    });
  } catch (err) { errorJson(res, err); }
});

router.put('/connections/monday-app', requireAdmin, async (req, res) => {
  try {
    const clientId = String(req.body?.client_id || '').trim();
    const clientSecret = String(req.body?.client_secret || '').trim();
    if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) return res.status(400).json({ error: 'That doesn’t look like a Monday Client ID' });
    if (!/^[A-Za-z0-9]{16,128}$/.test(clientSecret)) return res.status(400).json({ error: 'That doesn’t look like a Monday Client Secret' });
    await secrets.setSecret('monday_app', { client_id: clientId, client_secret: clientSecret }, { brandId: 'particle', user: req.user, meta: { client_id_end: clientId.slice(-4) } });
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});
router.delete('/connections/monday-app', requireAdmin, async (req, res) => {
  try { await secrets.clearSecret('monday_app', 'particle'); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
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

// Dropbox for ticket folders: the admin pastes the app key (Full Dropbox app), then signs in at Dropbox
router.post('/connections/dropbox', requireAdmin, async (req, res) => {
  try {
    const url = await require('../lib/studio/dropboxFolders').startConnect({ appKey: req.body?.app_key, base: req.body?.base, redirectUri: `${appBase(req)}/api/studio/dropbox/callback`, user: req.user, brandId: req.brandId });
    res.json({ url });
  } catch (err) { errorJson(res, err); }
});
router.delete('/connections/dropbox', requireAdmin, async (req, res) => {
  try { await require('../lib/studio/dropboxFolders').disconnect(req.brandId); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
});

router.delete('/connections/tmdb', requireAdmin, async (req, res) => {
  try { await secrets.clearSecret('tmdb', req.brandId); res.json({ ok: true }); } catch (err) { errorJson(res, err); }
});

module.exports = router;
module.exports.ticketPeople = ticketPeople;   // the public request link uses the same people lists
