/**
 * Each person's own Monday (Tomer, 17 Nov 2026). Once someone connects, the tickets and brief updates they create
 * from CP — Medium briefs and New ticket — are created AS them: Monday shows them as the creator, the notifications
 * and activity are theirs. Not connected → CP's account creates it and the brief says who submitted it.
 * Two ways in: "Connect Monday" (OAuth through the company's Monday app — its client id/secret pasted once by an admin
 * in Studio → Connections, sealed) or a personal API token pasted on the welcome page. Only the company's Monday
 * account is accepted. The token is sealed (AES-GCM, lib/studio/secrets) and never goes back to the browser.
 */
const crypto = require('crypto');
const db = require('../db');
const { seal, unseal, getSecret } = require('./studio/secrets');
const monday = require('./monday');

const ACCOUNT_SLUG = process.env.MONDAY_ACCOUNT_SLUG || 'particleformen';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

let ready = null;
function ensure() {
  ready = ready || db.query(`CREATE TABLE IF NOT EXISTS user_monday (
      user_id TEXT PRIMARY KEY, token_sealed TEXT NOT NULL, monday_user_id TEXT, name TEXT, email TEXT, account_slug TEXT,
      method TEXT, connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ)`).catch((e) => { ready = null; throw e; });
  return ready;
}

const call = (token, query, variables = {}) => monday.mondayQuery(query, variables, { token, retries: 1, timeoutMs: 20000 });

async function whoAmI(token) {
  const d = await call(token, 'query { me { id name email account { slug name } } }');
  if (!d?.me?.id) throw bad('Monday didn’t say who this is');
  return d.me;
}

function checkAccount(me) {
  if (ACCOUNT_SLUG && me.account?.slug && me.account.slug !== ACCOUNT_SLUG) {
    throw bad(`That's the “${me.account.name || me.account.slug}” Monday account — connect your Particle Monday (${ACCOUNT_SLUG}.monday.com)`);
  }
}

async function save(userId, token, me, method) {
  await ensure();
  await db.query(
    `INSERT INTO user_monday (user_id, token_sealed, monday_user_id, name, email, account_slug, method, connected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET token_sealed = EXCLUDED.token_sealed, monday_user_id = EXCLUDED.monday_user_id, name = EXCLUDED.name,
       email = EXCLUDED.email, account_slug = EXCLUDED.account_slug, method = EXCLUDED.method, connected_at = NOW()`,
    [String(userId), seal(token), String(me.id), me.name || null, me.email || null, me.account?.slug || null, method]);
}

/** The company's Monday app (OAuth) — set by an admin in Studio → Connections. */
const appCreds = () => getSecret('monday_app').catch(() => null);
const appBase = () => (process.env.APP_URL || 'https://particlepdio.particleface.com').replace(/\/$/, '');
const redirectUri = () => `${appBase()}/api/me/monday/callback`;

/** What the browser may know: connected as who, how, and whether one-click connect is available. Never the token. */
async function status(userId) {
  await ensure();
  const { rows } = await db.query('SELECT monday_user_id, name, email, account_slug, method, connected_at, last_used_at FROM user_monday WHERE user_id = $1', [String(userId)]);
  const app = await appCreds();
  const r = rows[0];
  return {
    connected: !!r, name: r?.name || null, email: r?.email || null, monday_user_id: r?.monday_user_id || null, account: r?.account_slug || null,
    method: r?.method || null, connected_at: r?.connected_at || null, last_used_at: r?.last_used_at || null,
    oauth: !!(app?.client_id && app?.client_secret), account_slug: ACCOUNT_SLUG,
  };
}

/** Paste a personal API token (Monday → avatar → Developers → My access tokens). */
async function connectToken(userId, token) {
  const t = String(token || '').trim();
  if (t.length < 30 || /\s/.test(t)) throw bad('That doesn’t look like a Monday token — copy the whole “Personal API token”');
  let me;
  try { me = await whoAmI(t); } catch { throw bad('Monday didn’t accept that token — copy it again from Monday → Developers → My access tokens'); }
  checkAccount(me);
  await save(userId, t, me, 'token');
  return status(userId);
}

// OAuth state: the user id + time, signed — the callback is public (Monday redirects the browser there)
const stateKey = () => crypto.createHash('sha256').update(`cp-monday-oauth:${process.env.JWT_SECRET || ''}`).digest();
function signState(userId) {
  const body = Buffer.from(JSON.stringify({ u: String(userId), t: Date.now(), n: crypto.randomBytes(6).toString('hex') })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', stateKey()).update(body).digest('base64url')}`;
}
function readState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  return Date.now() - s.t < 15 * 60 * 1000 ? s : null;
}

/** The Monday sign-in URL for this person (one click → back to CP connected). */
async function connectUrl(userId) {
  const app = await appCreds();
  if (!app?.client_id) throw bad('One-click connect isn’t set up yet — paste your personal Monday token instead', 409);
  const q = new URLSearchParams({ client_id: app.client_id, redirect_uri: redirectUri(), state: signState(userId) });
  return `https://auth.monday.com/oauth2/authorize?${q}`;
}

async function finishConnect({ code, state }) {
  const s = readState(state);
  if (!s) throw bad('This sign-in link expired — click “Connect Monday” again');
  const app = await appCreds();
  if (!app?.client_id || !app?.client_secret) throw bad('One-click connect isn’t set up');
  const r = await fetch('https://auth.monday.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: app.client_id, client_secret: app.client_secret, code: String(code || ''), redirect_uri: redirectUri() }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw bad(`Monday didn’t finish the sign-in (${j.error_description || j.error || r.status})`);
  const me = await whoAmI(j.access_token);
  checkAccount(me);
  await save(s.u, j.access_token, me, 'oauth');
  return { userId: s.u, name: me.name };
}

/** The person's token for creating things as them, or null (then CP's account is used). */
async function tokenFor(userId) {
  if (!userId) return null;
  await ensure();
  const { rows } = await db.query('SELECT token_sealed, name, monday_user_id FROM user_monday WHERE user_id = $1', [String(userId)]);
  if (!rows[0]) return null;
  try {
    db.query('UPDATE user_monday SET last_used_at = NOW() WHERE user_id = $1', [String(userId)]).catch(() => null);
    return { token: unseal(rows[0].token_sealed), name: rows[0].name, monday_user_id: rows[0].monday_user_id };
  } catch { return null; }
}

async function disconnect(userId) {
  await ensure();
  await db.query('DELETE FROM user_monday WHERE user_id = $1', [String(userId)]);
}

/** Who is connected (admin view) — names only. */
async function connectedUsers() {
  await ensure();
  const { rows } = await db.query('SELECT user_id, name, email, method, connected_at, last_used_at FROM user_monday');
  return rows;
}

module.exports = { status, connectToken, connectUrl, finishConnect, tokenFor, disconnect, connectedUsers, redirectUri, readState, signState, ACCOUNT_SLUG };
