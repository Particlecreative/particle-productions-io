const jwt = require('jsonwebtoken');

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Growth: 1, Editor: 2, Admin: 3 };

/**
 * Growth team (Tomer, 17 Nov 2026): one Growth Studio — productions as timelines (no money), the TV + Ads Library,
 * Medium (their own briefs), New ticket, Campaigns and a read-only Workload. Enforced HERE, for every API call,
 * not only by hiding pages: anything not on this list answers 403 — budgets, line items, payments, invoices,
 * contracts, suppliers, finance, Captain HQ, settings, user admin… even if someone types the URL.
 * [method regex, path regex] against the path without the query string. Pure — tested (test/growthAccess.test.js).
 */
const GROWTH_ALLOW = [
  [/^GET$/, /^\/api\/auth\/me$/],
  [/^(GET|POST|PATCH|DELETE)$/, /^\/api\/notifications(\/[^/]+(\/read)?|\/read-all)?$/],
  [/^GET$/, /^\/api\/brands$/],
  [/^GET$/, /^\/api\/settings\/[a-z0-9_]+$/i],                  // a brand's logo / colours / fonts only (settings.js strips the rest; no "monday-config" etc.)
  // Productions — timelines, no money (productions.js strips every money field for Growth)
  [/^GET$/, /^\/api\/productions\/?$/],
  [/^GET$/, /^\/api\/productions\/[^/]+$/],
  // Library — TV Library (read) + the Ads Library hand-off
  [/^GET$/, /^\/api\/library(\/.*)?$/],
  // Studio — the live dashboard data, campaigns, the ticket creator; nothing that moves or schedules
  [/^GET$/, /^\/api\/studio\/?$/],
  [/^GET$/, /^\/api\/studio\/(campaigns|campaign-groups|my-requests)$/],
  [/^GET$/, /^\/api\/studio\/(ticket-form|ticket-link)$/],
  [/^GET$/, /^\/api\/studio\/items\/\d+\/updates$/],               // read a task's brief & updates (posting stays closed)
  [/^POST$/, /^\/api\/studio\/ticket\/(draft|files|submit)$/],
  // Medium — their own briefs: write, edit, approve, reject, submit. No settings, sources, keys, corpus, autopilot
  // the full Medium to read (Today, Market Watch, Behind the scenes — nothing secret in these: keys are sealed elsewhere)
  [/^GET$/, /^\/api\/medium\/(overview|briefs|briefs\/[0-9a-f-]{36}|holiday\/campaigns|holiday\/[0-9a-f-]{36}|holiday\/preflight\/[0-9a-f-]{36}|static-hooks|affinity|beliefs|higgsfield|scorecard|market|corpus|corpus\/exemplars|config|surveys|buyer-signal|upspring|brand-sites)$/],
  [/^POST$/, /^\/api\/medium\/(generate|freeform|static-hooks\/generate|static-hooks\/read|higgsfield\/briefs|holiday\/plan|holiday\/generate|holiday\/[0-9a-f-]{36}\/(preflight|approve|derivatives))$/],
  [/^PUT$/, /^\/api\/medium\/briefs\/[0-9a-f-]{36}$/],
  [/^POST$/, /^\/api\/medium\/briefs\/[0-9a-f-]{36}\/(approve|reject|submit|regenerate|improve|static-version)$/],
  // Their own Monday connection, and the Growth Studio's own endpoints
  [/^(GET|POST|DELETE)$/, /^\/api\/me\/monday(\/(token|connect))?$/],
  [/^POST$/, /^\/api\/me\/activity$/],
  [/^GET$/, /^\/api\/growth\/[a-z-]+$/],
  [/^GET$/, /^\/api\/onair\/(tv|media)$/],             // On Air (TV + Meta), read-only
];
const growthMay = (method, path) => GROWTH_ALLOW.some(([m, p]) => m.test(method) && p.test(path));

/**
 * Middleware: verifies JWT from Authorization: Bearer <token>
 * Attaches decoded payload to req.user.
 */
function verifyJWT(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  try { require('../lib/activity').watch(req, res); } catch { /* the activity log never blocks a request */ }
  if (req.user?.role === 'Growth') {
    const path = String(req.originalUrl || '').split('?')[0].replace(/\/+$/, '') || '/';
    if (!growthMay(req.method, path)) return res.status(403).json({ error: 'Not part of the Growth Studio', code: 'growth_only' });
  }
  next();
}

/**
 * Middleware: requires role Editor or Admin.
 * Must be used after verifyJWT.
 */
function requireEditor(req, res, next) {
  if ((RANK[req.user?.role] ?? -1) < RANK.Editor) {
    return res.status(403).json({ error: 'Editor access required' });
  }
  next();
}

/**
 * Middleware: requires role Admin (or higher).
 * Must be used after verifyJWT.
 */
function requireAdmin(req, res, next) {
  if ((RANK[req.user?.role] ?? -1) < RANK.Admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Middleware: requires super_admin flag.
 * Must be used after verifyJWT.
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user?.super_admin) {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
}

const isGrowth = (req) => req.user?.role === 'Growth';

module.exports = { verifyJWT, requireEditor, requireAdmin, requireSuperAdmin, growthMay, isGrowth, RANK, GROWTH_ALLOW };
