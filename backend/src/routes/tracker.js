/**
 * /api/tracker — Production Tracker: every production with its stage, the deadline we chose, notes, links,
 * internal + external team, CP facts and the Monday TV tickets linked to it.
 * Editor+ with access to the brand (it shows budgets). Stage changes go through PATCH /api/productions/:id.
 */
const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { buildTracker } = require('../lib/tracker/data');
const { decide } = require('../lib/studio/tvLinks');
const monday = require('../lib/monday');
const { logAction } = require('../lib/auditLog');

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEALTH = ['on_track', 'at_risk', 'blocked'];

function errorJson(res, err, fallback = 'Server error') {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  console.error('[tracker]', err?.stack || err);
  res.status(status).json({ error: err?.message || fallback });
}
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

router.use(verifyJWT);
router.use((req, res, next) => {
  if ((RANK[req.user?.role] ?? -1) < RANK.Editor) return res.status(403).json({ error: 'Editor access required' });
  const brandId = String(req.query.brand_id || req.body?.brand_id || '');
  if (!brandId) return res.status(400).json({ error: 'brand_id required' });
  const u = req.user || {};
  if (!(u.super_admin || u.brand_id === brandId || (u.brand_ids || []).includes(brandId))) return res.status(403).json({ error: 'No access to this brand' });
  req.brandId = brandId;
  next();
});

router.get('/', async (req, res) => {
  try {
    res.json(await buildTracker({ brandId: req.brandId, force: req.query.force === '1' }));
  } catch (err) { errorJson(res, err); }
});

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const httpUrl = (u) => {
  try { const x = new URL(String(u).trim()); return /^https?:$/.test(x.protocol) ? x.toString() : null; } catch { return null; }
};

/** Clean a tracker patch; only the keys sent are changed. */
function cleanPatch(body) {
  const out = {};
  if ('deadline' in body) {
    if (body.deadline && !DATE_RE.test(body.deadline)) throw bad('Deadline must be a date');
    out.deadline = body.deadline || null;
  }
  if ('deadline_label' in body) out.deadline_label = str(body.deadline_label, 120);
  if ('notes' in body) out.notes = str(body.notes, 8000);
  if ('health' in body) {
    if (body.health && !HEALTH.includes(body.health)) throw bad('Unknown health');
    out.health = body.health || null;
  }
  if ('links' in body) {
    if (!Array.isArray(body.links) || body.links.length > 40) throw bad('Links must be a list (max 40)');
    out.links = body.links.map((l) => {
      const url = httpUrl(l?.url);
      if (!url) throw bad(`Not a web link: ${str(l?.url, 80)}`);
      return { id: str(l.id, 40) || crypto.randomUUID(), title: str(l.title, 160) || url, url };
    });
  }
  if ('team' in body) {
    if (!Array.isArray(body.team) || body.team.length > 60) throw bad('Team must be a list (max 60)');
    out.team = body.team.map((m) => {
      const name = str(m?.name, 120);
      if (!name) throw bad('Every team member needs a name');
      return {
        id: str(m.id, 40) || crypto.randomUUID(),
        kind: m.kind === 'external' ? 'external' : 'internal',
        name,
        role: str(m.role, 80),
        ...(m.user_id ? { user_id: str(m.user_id, 40) } : {}),
        ...(m.supplier_id ? { supplier_id: str(m.supplier_id, 40) } : {}),
        ...(m.monday_id ? { monday_id: str(m.monday_id, 20) } : {}),
      };
    });
  }
  return out;
}

router.put('/:productionId', async (req, res) => {
  try {
    const pid = String(req.params.productionId);
    const { rows } = await db.query('SELECT id, project_name FROM productions WHERE id = $1 AND brand_id = $2', [pid, req.brandId]);
    if (!rows[0]) return res.status(404).json({ error: 'Production not found' });
    const patch = cleanPatch(req.body || {});
    const keys = Object.keys(patch);
    if (!keys.length) return res.status(400).json({ error: 'Nothing to save' });

    const before = (await db.query('SELECT deadline::text AS deadline, health FROM production_tracker WHERE production_id = $1', [pid])).rows[0] || {};
    const who = req.user?.name || req.user?.email || null;
    const json = new Set(['links', 'team']);
    const vals = keys.map(k => (json.has(k) ? JSON.stringify(patch[k]) : patch[k]));
    const cols = keys.map(k => `"${k}"`).join(', ');
    const params = keys.map((k, i) => `$${i + 3}${json.has(k) ? '::jsonb' : ''}`).join(', ');
    const sets = keys.map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
    const saved = await db.query(
      `INSERT INTO production_tracker (production_id, updated_by, ${cols}) VALUES ($1, $2, ${params})
       ON CONFLICT (production_id) DO UPDATE SET ${sets}, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *, deadline::text AS deadline`,
      [pid, who, ...vals]
    );

    // The production's History shows deadline and health changes
    const name = rows[0].project_name || pid;
    if ('deadline' in patch && (before.deadline || null) !== patch.deadline) {
      logAction({ production_id: pid, action: 'update', entity: 'tracker', field: 'tracker_deadline', old_value: before.deadline || '', new_value: patch.deadline || '', summary: `Tracker deadline of ${name} → ${patch.deadline || 'none'}`, user_id: req.user?.id, user_name: who });
    }
    if ('health' in patch && (before.health || null) !== patch.health) {
      logAction({ production_id: pid, action: 'update', entity: 'tracker', field: 'tracker_health', old_value: before.health || '', new_value: patch.health || '', summary: `Tracker health of ${name} → ${patch.health || 'none'}`, user_id: req.user?.id, user_name: who });
    }
    res.json({ ok: true, tracker: saved.rows[0] });
  } catch (err) { errorJson(res, err); }
});

/** Link a Monday TV ticket: { production_id } links it, { decision: 'none' } = not a production, { decision: 'clear' } = back to auto. */
router.put('/tickets/:itemId', async (req, res) => {
  try {
    const itemId = String(req.params.itemId);
    if (!/^\d+$/.test(itemId)) return res.status(400).json({ error: 'Bad item id' });
    const decision = ['linked', 'none', 'clear'].includes(req.body?.decision) ? req.body.decision : 'linked';
    const productionId = req.body?.production_id ? String(req.body.production_id) : null;
    if (decision === 'linked') {
      if (!productionId) return res.status(400).json({ error: 'production_id required' });
      const { rows } = await db.query('SELECT 1 FROM productions WHERE id = $1 AND brand_id = $2', [productionId, req.brandId]);
      if (!rows[0]) return res.status(404).json({ error: 'Production not found' });
    }
    await decide(itemId, { productionId, decision, board: req.body?.board || null, user: req.user });
    monday.clearCache(`studio:${req.brandId}:`);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;
module.exports.cleanPatch = cleanPatch;
