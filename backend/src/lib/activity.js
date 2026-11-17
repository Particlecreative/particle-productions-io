/**
 * Team activity (Tomer, 17 Nov 2026: "as an admin I want to see their use in CP — their actions, stats and when").
 * Every signed-in non-admin's meaningful actions are logged: sign-ins, pages opened, briefs written / edited /
 * approved / sent to Monday, tickets created, the TV + Ads Library, productions, Monday connected, and anything the
 * Growth gate refused. Reads ("opened X") are kept once per 10 minutes per person so the log stays readable.
 * labelFor is pure and tested (test/growthAccess.test.js). Writing never blocks or fails a request.
 */
const db = require('../db');

const ID = '([0-9a-f-]{36})';
const RULES = [
  ['POST', /^\/api\/medium\/generate$/, 'brief_write', 'Wrote briefs (Generator)'],
  ['POST', /^\/api\/medium\/freeform$/, 'brief_write', 'Wrote a brief from an idea'],
  ['POST', /^\/api\/medium\/static-hooks\/generate$/, 'brief_write', 'Wrote video hooks from a winning static'],
  ['POST', /^\/api\/medium\/higgsfield\/briefs$/, 'brief_write', 'Wrote Higgsfield dramas'],
  ['POST', /^\/api\/medium\/holiday\/generate$/, 'brief_write', 'Wrote holiday briefs'],
  ['PUT', new RegExp(`^/api/medium/briefs/${ID}$`), 'brief_edit', 'Edited a brief'],
  ['POST', new RegExp(`^/api/medium/briefs/${ID}/approve$`), 'brief_approve', 'Approved a brief'],
  ['POST', new RegExp(`^/api/medium/briefs/${ID}/submit$`), 'brief_submit', 'Sent a brief to Monday'],
  ['POST', new RegExp(`^/api/medium/briefs/${ID}/reject$`), 'brief_reject', 'Rejected a brief'],
  ['POST', new RegExp(`^/api/medium/briefs/${ID}/(regenerate|improve|static-version)$`), 'brief_edit', 'Asked Medium to rework a brief'],
  ['POST', /^\/api\/studio\/ticket\/submit$/, 'ticket_create', 'Created a Monday ticket'],
  ['POST', /^\/api\/studio\/ticket\/draft$/, 'ticket_draft', 'Drafted a ticket'],
  ['GET', /^\/api\/growth\/afterlife-pass$/, 'ads_library', 'Opened the Ads Library'],
  ['GET', /^\/api\/library\/?$/, 'tv_library', 'Opened the TV Library'],
  ['GET', /^\/api\/productions\/?$/, 'productions', 'Looked at productions'],
  ['GET', /^\/api\/productions\/([^/]+)$/, 'production', 'Opened a production'],
  ['GET', /^\/api\/studio\/?$/, 'workload', 'Looked at the studio workload'],
  ['GET', /^\/api\/studio\/campaigns$/, 'campaigns', 'Looked at campaigns'],
  ['GET', /^\/api\/medium\/briefs\/?$/, 'briefs', 'Looked at their briefs'],
  ['POST', /^\/api\/me\/monday\/token$/, 'monday_connect', 'Connected Monday'],
  ['DELETE', /^\/api\/me\/monday$/, 'monday_disconnect', 'Disconnected Monday'],
];
const READS = new Set(['tv_library', 'productions', 'production', 'workload', 'campaigns', 'briefs', 'ads_library', 'page']);

/** { kind, label, ref } for a request, or null when it isn't worth a line. */
function labelFor(method, path) {
  for (const [m, re, kind, label] of RULES) {
    if (m !== method) continue;
    const hit = re.exec(path);
    if (hit) return { kind, label, ref: hit[1] || null };
  }
  return null;
}

let ready = null;
function ensure() {
  ready = ready || db.query(`CREATE TABLE IF NOT EXISTS cp_activity (
      id BIGSERIAL PRIMARY KEY, user_id TEXT, user_name TEXT, role TEXT, kind TEXT NOT NULL, label TEXT, ref TEXT,
      method TEXT, path TEXT, status INT, meta JSONB, at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS idx_cp_activity_user ON cp_activity (user_id, at DESC);
    CREATE INDEX IF NOT EXISTS idx_cp_activity_at ON cp_activity (at DESC);`).catch((e) => { ready = null; throw e; });
  return ready;
}

const recent = new Map();   // user|kind|ref → ms (reads are kept once per 10 min)
function seenRecently(key) {
  const now = Date.now();
  if (recent.size > 5000) for (const [k, t] of recent) if (now - t > 600000) recent.delete(k);
  if (recent.has(key) && now - recent.get(key) < 600000) return true;
  recent.set(key, now);
  return false;
}

/** Write one line (fire-and-forget). user = { id, name, role }. */
function record(user, { kind, label = null, ref = null, method = null, path = null, status = null, meta = null }) {
  if (!user?.id || !kind) return;
  if (READS.has(kind) && seenRecently(`${user.id}|${kind}|${ref || label || ''}`)) return;
  ensure()
    .then(() => db.query('INSERT INTO cp_activity (user_id, user_name, role, kind, label, ref, method, path, status, meta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [String(user.id), user.name || user.email || null, user.role || null, kind, label, ref, method, path ? String(path).slice(0, 300) : null, status, meta ? JSON.stringify(meta) : null]))
    .catch(e => console.warn('[activity]', e.message));
}

/** After a signed-in request finishes: log it when it's a meaningful action (non-admins only). */
function watch(req, res) {
  const u = req.user;
  if (!u || u.role === 'Admin' || u.super_admin || req._activityWatched) return;
  req._activityWatched = true;   // some routes verify the JWT twice — one line per request
  const path = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '') || '/';
  res.on('finish', () => {
    if (res.statusCode === 403 && u.role === 'Growth') return record(u, { kind: 'blocked', label: `Tried to open ${path}`, method: req.method, path, status: 403 });
    if (res.statusCode >= 400) return;
    const l = labelFor(req.method, path);
    if (l) record(u, { ...l, method: req.method, path, status: res.statusCode });
  });
}

/** Admin view: per person (stats, last seen, days active) + the latest lines. */
async function overview({ days = 30, userId = null, limit = 300 } = {}) {
  await ensure();
  const d = Math.min(Math.max(Number(days) || 30, 1), 365);
  const [people, events, daily] = await Promise.all([
    db.query(`WITH a AS (SELECT * FROM cp_activity WHERE at > NOW() - make_interval(days => $1)),
                k AS (SELECT user_id, kind, COUNT(*)::int AS n FROM a GROUP BY 1, 2),
                u AS (SELECT user_id, MAX(user_name) AS name, MAX(role) AS role, MAX(at) AS last_seen, MIN(at) AS first_seen,
                             COUNT(DISTINCT (at AT TIME ZONE 'Asia/Jerusalem')::date)::int AS days_active FROM a GROUP BY 1)
         SELECT u.*, (SELECT jsonb_object_agg(kind, n) FROM k WHERE k.user_id = u.user_id) AS kinds FROM u ORDER BY u.last_seen DESC`, [d]),
    db.query(`SELECT a.id, a.user_id, a.user_name, a.role, a.kind, a.label, a.ref, a.at,
                COALESCE(b.ticket_name, p.project_name) AS ref_name
           FROM cp_activity a
           LEFT JOIN medium_briefs b ON a.kind LIKE 'brief_%' AND a.ref ~ '^[0-9a-f-]{36}$' AND b.id::text = a.ref
           LEFT JOIN productions p ON a.kind = 'production' AND p.id = a.ref
          WHERE a.at > NOW() - make_interval(days => $1) ${userId ? 'AND a.user_id = $3' : ''}
          ORDER BY a.at DESC LIMIT $2`, userId ? [d, limit, String(userId)] : [d, limit]),
    db.query(`SELECT (at AT TIME ZONE 'Asia/Jerusalem')::date::text AS day, user_id, COUNT(*)::int AS n
           FROM cp_activity WHERE at > NOW() - make_interval(days => $1) GROUP BY 1, 2 ORDER BY 1`, [d]),
  ]);
  return { days: d, people: people.rows, events: events.rows, daily: daily.rows };
}

module.exports = { labelFor, record, watch, overview, READS };
