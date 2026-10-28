/**
 * Finance dashboard sign-in: a 6-digit code emailed to an allow-listed address, then a 30-day session on that device.
 * Codes and session tokens are stored hashed. Sign-in codes always go to the person asking (never to test mode).
 */
const crypto = require('crypto');
const db = require('../../db');
const config = require('./config');
const mailer = require('./mailer');
const tpl = require('./templates');

const CODE_TTL_MIN = 10;
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const secret = () => process.env.FINANCE_ACCESS_SECRET || `${process.env.JWT_SECRET || 'dev'}:finance-access`;
const hash = (s) => crypto.createHmac('sha256', secret()).update(String(s)).digest('hex');
const norm = (e) => String(e || '').trim().toLowerCase();

async function allowed(email) {
  const cfg = await config.get();
  return cfg.dashboard_emails.map(norm).includes(norm(email));
}

/** Always answers the same way, so the page never reveals who is on the list. */
function requestCode(email, ip) {
  setImmediate(() => sendCode(email, ip).catch(err => console.error('[finance access]', err.message)));
  return Promise.resolve({ ok: true });
}

async function sendCode(email, ip) {
  const e = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || !(await allowed(e))) return { ok: true };
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM finance_access_codes WHERE email = $1 AND created_at > NOW() - INTERVAL '15 minutes'`, [e]);
  if (rows[0].n >= 3) return { ok: true };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.query(`INSERT INTO finance_access_codes (email, code_hash, expires_at, ip) VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4)`,
    [e, hash(`${e}:${code}`), String(CODE_TTL_MIN), ip || null]);
  const mail = tpl.accessCode({ code });
  await mailer.queue({ kind: 'access_code', to: e, subject: mail.subject, html: mail.html, noShadow: true });
  return { ok: true };
}

async function verifyCode(email, code, userAgent) {
  const e = norm(email);
  const { rows } = await db.query(
    `SELECT * FROM finance_access_codes WHERE email = $1 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [e]);
  if (!rows[0]) return null;
  // Count the attempt first, atomically — parallel guesses can't all slip under the limit
  const { rows: claimed } = await db.query(
    'UPDATE finance_access_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 AND used_at IS NULL RETURNING code_hash', [rows[0].id, MAX_ATTEMPTS]);
  if (!claimed[0]) return null;
  const ok = crypto.timingSafeEqual(Buffer.from(claimed[0].code_hash), Buffer.from(hash(`${e}:${String(code || '').trim()}`)));
  if (!ok) return null;
  const { rowCount } = await db.query('UPDATE finance_access_codes SET used_at = NOW() WHERE id = $1 AND used_at IS NULL', [rows[0].id]);
  if (!rowCount) return null;
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(`INSERT INTO finance_sessions (token_hash, email, expires_at, user_agent) VALUES ($1, $2, NOW() + ($3 || ' days')::interval, $4)`,
    [hash(token), e, String(SESSION_DAYS), String(userAgent || '').slice(0, 300)]);
  return { token, email: e, days: SESSION_DAYS };
}

/** Express middleware: Authorization: Finance <token> (or Bearer). Re-checks the allow-list on every request. */
async function requireSession(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.replace(/^(Finance|Bearer)\s+/i, '').trim();
    if (!/^[0-9a-f]{64}$/.test(token)) return res.status(401).json({ error: 'Sign in with your email code', code: 'signin' });
    const { rows } = await db.query(
      `SELECT * FROM finance_sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`, [hash(token)]);
    const s = rows[0];
    if (!s || !(await allowed(s.email))) return res.status(401).json({ error: 'Sign in with your email code', code: 'signin' });
    db.query('UPDATE finance_sessions SET last_seen_at = NOW() WHERE token_hash = $1', [s.token_hash]).catch(() => {});
    req.financeUser = { email: s.email, token_hash: s.token_hash };
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex');
    next();
  } catch (err) {
    console.error('[finance access]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
}

async function signOut(tokenHash) {
  await db.query('UPDATE finance_sessions SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
}

module.exports = { requestCode, verifyCode, requireSession, signOut, allowed };
