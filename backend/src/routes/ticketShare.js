/**
 * /api/ticket-share/:token — the ticket creator behind a public request link (no CP login).
 * The person says who they are first; that person is the ticket's "Requested by" (never the CP account owner), and
 * the brief ends with their name. Assigning an editor / designer stays with the studio. Writing a draft uses Claude,
 * so drafts, uploads and tickets are capped per link + visitor.
 */
const router = require('express').Router();
const multer = require('multer');
const links = require('../lib/studio/ticketLinks');
const tickets = require('../lib/studio/tickets');
const sources = require('../lib/studio/sources');
const { getCreativeConfig } = require('../lib/creative/config');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
const HIDDEN = new Set(['assignee', 'requested_by']);   // the studio assigns; the requester is who's filling it in

function errorJson(res, err) {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[ticket-share]', err?.message);
  res.status(status).json({ error: err?.message || 'Something went wrong' });
}
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// per link + visitor caps (in memory; reset on restart)
const buckets = new Map();
function limit(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= max) return false;
  b.push(now); buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some(t => now - t < 86400000)) buckets.delete(k);
  return true;
}
const visitor = (req) => `${req.params.token}:${req.ip}`;

/** Everyone on the studio's Monday account (people, not guests) — the requester is picked from these. Cached 6 h. */
async function mondayUsers() {
  const monday = require('../lib/monday');
  return monday.cached('ticket-share:users', 6 * 3600000, async () => {
    const d = await monday.mondayQuery('query { users(kind: non_guests, limit: 1000) { id name enabled photo_thumb_small } }');
    return (d?.users || []).filter(u => u.enabled !== false && u.name).map(u => ({ id: String(u.id), name: u.name, photo: u.photo_thumb_small || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Who's asking (validated): a Monday user { id, name } — or, for someone not on Monday, { name, email } */
async function requesterOf(body) {
  const id = String(body?.requester?.id || '').trim();
  if (id) {
    if (!/^\d{1,20}$/.test(id)) throw bad('Pick yourself from the list');
    const u = (await mondayUsers()).find(x => x.id === id);
    if (!u) throw bad('That person isn’t on Monday any more — pick again');
    return { id: u.id, name: u.name, email: null };
  }
  return requesterFromText(body);
}

function requesterFromText(body) {
  const name = String(body?.requester?.name || '').replace(/\s+/g, ' ').trim();
  const email = String(body?.requester?.email || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw bad('Tell us who the request is from');
  if (email && !/^[^@\s]{1,64}@[^@\s]{1,120}\.[a-z]{2,}$/i.test(email)) throw bad('That email doesn’t look right');
  return { id: null, name, email: email || null };
}

/** The requester's Monday person: by work email first, else an exact name, else the one name that starts with what they typed. */
async function requesterOnMonday(requester, pool) {
  if (requester.id) return pool.find(p => String(p.id) === requester.id) || { id: requester.id, name: requester.name };
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (requester.email) {
    try {
      const monday = require('../lib/monday');
      const me = await monday.cached(`me:${requester.email}`, 6 * 3600000, async () =>
        (await monday.mondayQuery('query ($e: [String]) { users(emails: $e) { id name } }', { e: [requester.email] }))?.users?.[0] || null);
      if (me) return pool.find(p => String(p.id) === String(me.id)) || { id: String(me.id), name: me.name };
    } catch { /* fall back to the name */ }
  }
  const exact = pool.find(p => fold(p.name) === fold(requester.name));
  if (exact) return exact;
  const starts = pool.filter(p => fold(p.name).startsWith(`${fold(requester.name)} `));
  return starts.length === 1 ? starts[0] : null;
}

router.use('/:token', async (req, res, next) => {
  try {
    const link = await links.resolve(req.params.token);
    if (!link) return res.status(404).json({ error: 'This request link isn’t active any more — ask the studio for the current one' });
    req.link = link; req.brandId = link.brand_id;
    next();
  } catch (err) { errorJson(res, err); }
});

async function shareForm(req, requester) {
  const config = await getCreativeConfig(req.brandId);
  const people = await require('./studio').ticketPeople(req.brandId, requester ? { name: requester.name, email: requester.email } : null);
  const full = await tickets.ticketForm(config, people);
  const form = { boards: Object.fromEntries(Object.entries(full.boards).map(([k, b]) => [k, { ...b, fields: b.fields.filter(f => !HIDDEN.has(f.key)) }])) };
  return { config, people, full, form };
}

router.get('/:token', async (req, res) => {
  try {
    const { form, people } = await shareForm(req, null);
    res.json({ ...form, requesters: await mondayUsers().catch(() => (people.requesters || []).map(p => ({ id: String(p.id), name: p.name, photo: null }))), empty: tickets.emptyFields(), brand: req.brandId });
  } catch (err) { errorJson(res, err); }
});

router.post('/:token/draft', async (req, res) => {
  try {
    if (!limit(`d:${visitor(req)}`, 30, 3600000)) throw bad('That’s a lot of drafts in an hour — take a breather and try again soon', 429);
    const requester = await requesterOf(req.body);
    const { form, config } = await shareForm(req, requester);
    const files = (req.body?.files || []).map(f => links.readFile(f, req.params.token)).filter(Boolean);
    const out = await tickets.draftTicket({ form, config, messages: req.body?.messages, draft: req.body?.draft, board: req.body?.board, userName: requester.name, files });
    res.json(out);
  } catch (err) { errorJson(res, err); }
});

router.post('/:token/files', (req, res) => {
  if (!limit(`f:${visitor(req)}`, 30, 3600000)) return res.status(429).json({ error: 'Too many files for now — try again in a while' });
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Files can be up to 25 MB here' : err.message });
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const name = Buffer.from(req.file.originalname || 'file', 'latin1').toString('utf8');
      const saved = await sources.saveUpload({ name, mime: req.file.mimetype, buffer: req.file.buffer, user: { name: 'request link' } });
      res.json({ ...saved, id: links.signFile(saved.id, req.params.token) });
    } catch (e) { errorJson(res, e); }
  });
});

router.post('/:token/submit', async (req, res) => {
  try {
    if (req.body?.confirm !== true) throw bad('Confirm the ticket first');
    if (!limit(`s:${visitor(req)}`, 10, 86400000)) throw bad('That’s the limit of tickets from here today — contact the studio directly', 429);
    const requester = await requesterOf(req.body);
    const { config, people, full } = await shareForm(req, requester);
    // "Requested by" = the person who filled it in (matched to their Monday account by email, or by name)
    const match = await requesterOnMonday(requester, people.requesters || []);
    if (match && !(people.requesters || []).some(p => p.name === match.name)) people.requesters = [...(people.requesters || []), match];
    const fields = { ...(req.body?.fields || {}), requested_by: match ? [match.name] : [], assignee: [] };
    const files = (req.body?.files || []).map(f => links.readFile(f, req.params.token)).filter(Boolean);
    const signature = `${requester.name}${requester.email ? ` (${requester.email})` : ''} — via the request link`;
    const out = await tickets.submitTicket({ config, form: full, board: req.body.board, fields, people, user: { name: signature }, conversation: req.body?.conversation, files });
    await links.used(req.params.token);
    res.json({ ok: true, ...out, requester: requester.name, tagged: !!match });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
