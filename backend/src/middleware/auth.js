const jwt = require('jsonwebtoken');

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
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: requires role Admin (or higher).
 * Must be used after verifyJWT.
 */
function requireAdmin(req, res, next) {
  const RANK = { Viewer: 0, Accounting: 1, Editor: 2, Admin: 3 };
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

module.exports = { verifyJWT, requireAdmin, requireSuperAdmin };
