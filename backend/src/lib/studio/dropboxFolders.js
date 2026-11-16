/**
 * Studio — a new ticket's Dropbox folder, made where the studio's folders are made today (Tomer, 16 Nov 2026:
 * "when you create a new ticket … also create the Dropbox links").
 *
 * Research (16 Nov 2026 — the 692 links the old script wrote on both boards in 90 days, each matched to its ticket):
 *   <base>/<Department>/<Products|Bundles|Other>/<Product>/<Video|Image>/<Platform>/<MM_Month YYYY>/<Concept>
 *   · Department — "Marketing/Media" (video) and every design department except Website → Marketing Ads;
 *     Website → Website/…/<Product>/<Image|Video>/<website task: LP · PDP · Test Products · Other>/<Concept>
 *     (no platform, no month; video has no task level); TV → TV/Products/<Product>/<Month YYYY>/<Concept>;
 *     any other video department (Socials, SP, Creative, Amazon…) → Unknown/… — exactly as today.
 *   · Products | Bundles | Other — "Multiple Products" / "Not a Product Task" → Other; a bundle, kit or set → Bundles.
 *   · Month — when the folder is made (Israel time). Concept — the ticket name's last part (after the last " | "),
 *     without " ? * < > : and with "/" as "-" (the old script turned "before/after" into a sub-folder).
 *   · The ticket folder starts empty — the finished files go straight in (the column is "DropBox (For Uploading
 *     Finished Project)"); the link is public, view-only, download allowed — like today's.
 * The old script (a former employee's Monday account, about hourly) never touches a ticket that already has a link,
 * so a ticket the CP made a folder for is not made twice. On Design it hasn't run since 12 Nov.
 *
 * Needs its own Dropbox connection with Full Dropbox access: the CP's backup app is an App-folder app and can't reach
 * the studio's folders. Connected in Studio → Connections (PKCE — only the app key is stored, sealed).
 */
const crypto = require('crypto');
const secrets = require('./secrets');

const SECRET = 'dropbox_folders';
const PENDING = 'dropbox_folders_pending';
const DEFAULT_BASE = '/Creative Assets 2026 - MV Sync';
// what it does: look the folder up (metadata.read), make folders (content.write), make and read links (sharing.*)
const SCOPES = 'account_info.read files.metadata.read files.content.write sharing.read sharing.write';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── the path (pure — tested against the real folders) ─────────────────────────
/** A folder name Dropbox takes and the team would type: no " ? * < > :, "/" → "-", trimmed. */
function clean(s, max = 120) {
  return String(s || '').replace(/[\\/]+/g, '-').replace(/["?*<>:\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
    .slice(0, max).replace(/[. ]+$/, '').trim();
}

function monthOf(when = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: 'numeric' })
    .formatToParts(when).map(x => [x.type, x.value]));
  const m = Number(p.month);
  return { mm: String(m).padStart(2, '0'), name: MONTHS[m - 1], year: p.year };
}

function categoryOf(product) {
  if (/^(multiple products|not a product task)$/i.test(product)) return 'Other';
  if (/\b(bundle|kit|set)\b/i.test(product)) return 'Bundles';
  return 'Products';
}

/** The ticket's last name part — "Product | Campaign | Meta | The Last Spritz" → "The Last Spritz". */
const conceptOf = (itemName) => String(itemName || '').split(' | ').pop().trim();

/**
 * Where the ticket's folder goes.
 * { board: 'video'|'design', department, product, platform, websiteTask, concept, when, base } → "/Creative Assets…/…/Concept"
 */
function folderPath({ board, department, product, platform, websiteTask, concept, when = new Date(), base = DEFAULT_BASE }) {
  const prod = clean(product) && clean(product) !== '-' ? clean(product) : 'Unknown Product';
  const cat = categoryOf(prod);
  const kind = board === 'design' ? 'Image' : 'Video';
  const leaf = clean(concept) || 'Untitled';
  const m = monthOf(when);
  const dept = String(department || '').trim();
  let parts;
  if (/^website$/i.test(dept)) parts = ['Website', cat, prod, kind, ...(board === 'design' ? [clean(websiteTask) || 'Other'] : []), leaf];
  else if (board !== 'design' && /^tv$/i.test(dept)) parts = ['TV', 'Products', prod, `${m.name} ${m.year}`, leaf];
  else parts = [board === 'design' || /^marketing/i.test(dept) ? 'Marketing Ads' : 'Unknown', cat, prod, kind, clean(platform) || 'Other', `${m.mm}_${m.name} ${m.year}`, leaf];
  return [String(base || DEFAULT_BASE).replace(/\/+$/, ''), ...parts].join('/');
}

// ── the connection (Full Dropbox app, PKCE) ──────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Start connecting: remembers the app key + a PKCE verifier, returns Dropbox's consent URL. */
async function startConnect({ appKey, base, redirectUri, user, brandId = 'particle' }) {
  const key = String(appKey || '').trim();
  if (!/^[a-z0-9]{8,40}$/i.test(key)) throw Object.assign(new Error('That doesn’t look like a Dropbox app key'), { status: 400 });
  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(24));
  await secrets.setSecret(PENDING, { app_key: key, verifier, state, base: cleanBase(base), redirect_uri: redirectUri, at: Date.now() }, { brandId, user });
  const q = new URLSearchParams({
    client_id: key, response_type: 'code', token_access_type: 'offline', redirect_uri: redirectUri, state, scope: SCOPES,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  return `https://www.dropbox.com/oauth2/authorize?${q}`;
}

function cleanBase(base) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  if (!b) return DEFAULT_BASE;
  return b.startsWith('/') ? b : `/${b}`;
}

async function tokenCall(params) {
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Dropbox sign-in failed (${d.error_description || d.error || r.status})`);
  return d;
}

async function raw(token, endpoint, body, headers = {}) {
  const r = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: r.ok, status: r.status, data, text: data?.error_summary || text.slice(0, 200) };
}

const missingScope = (r) => (r.status === 401 && /missing_scope/.test(r.text) ? (r.data?.error?.required_scope || 'a permission') : null);
function needScope(scope) {
  return Object.assign(new Error(`The Dropbox app is missing the “${scope}” permission — on the app’s Permissions tab tick files.metadata.read, files.content.write, sharing.read and sharing.write, press Submit, then connect again`), { status: 400 });
}

/**
 * Where the studio's folder sits for this account. Tried in order: under the account's own folder (home), under the
 * team root (team spaces), then as a shared folder the account is in (by its name) — so it's found wherever it's mounted.
 * → { mode: 'home'|'root'|'ns', root_ns, ns, prefix, account, found }
 */
async function locate(token, base) {
  const acct = await raw(token, 'users/get_current_account', null);
  if (!acct.ok) throw new Error(`Dropbox: ${acct.text}`);
  const who = acct.data.name?.display_name || null;
  const ri = acct.data.root_info || {};
  const said = [];
  const tries = [{ mode: 'home', path: base, headers: {} }];
  if (ri.root_namespace_id && ri.root_namespace_id !== ri.home_namespace_id && ri.home_path) {
    tries.push({ mode: 'root', path: `${ri.home_path}${base}`, headers: { 'Dropbox-API-Path-Root': JSON.stringify({ '.tag': 'root', root: ri.root_namespace_id }) } });
  }
  for (const t of tries) {
    const r = await raw(token, 'files/get_metadata', { path: t.path }, t.headers);
    if (/sandbox app/i.test(r.text)) throw Object.assign(new Error('This Dropbox app has “App folder” access — it needs “Full Dropbox” to reach the studio’s folders. Create a new app with Full Dropbox access.'), { status: 400 });
    const scope = missingScope(r);
    if (scope) throw needScope(scope);
    if (r.ok && r.data?.['.tag'] === 'folder') {
      return { mode: t.mode, root_ns: t.mode === 'root' ? ri.root_namespace_id : null, ns: null, prefix: t.mode === 'root' ? ri.home_path : '', account: who, found: r.data.path_display };
    }
    said.push(`${t.mode}: ${r.text}`);
  }
  // a shared folder the account is in, by name
  const name = base.split('/').filter(Boolean).pop().toLowerCase();
  let page = await raw(token, 'sharing/list_folders', { limit: 1000 });
  for (let i = 0; i < 5 && page.ok; i++) {
    const hit = (page.data.entries || []).find(e => String(e.name || '').toLowerCase() === name);
    if (hit) return { mode: 'ns', root_ns: null, ns: String(hit.shared_folder_id), prefix: '', account: who, found: hit.path_lower || hit.name };
    if (!page.data.cursor) break;
    page = await raw(token, 'sharing/list_folders/continue', { cursor: page.data.cursor });
  }
  const scope = missingScope(page);
  if (scope) throw needScope(scope);
  if (!page.ok) said.push(`shared folders: ${page.text}`);
  throw Object.assign(new Error(`Couldn’t find “${base}” in ${who || 'this'}’s Dropbox — connect the account that has the studio’s folders, or change the folder name (Dropbox said: ${said.join(' · ') || 'not found'})`), { status: 400 });
}

/** Dropbox sent the browser back with a code: swap it, find the folder, keep the refresh token (sealed). */
async function finishConnect({ code, state, brandId = 'particle' }) {
  const p = await secrets.getSecret(PENDING, brandId);
  const okState = p?.state && state && p.state.length === String(state).length && crypto.timingSafeEqual(Buffer.from(p.state), Buffer.from(String(state)));
  if (!okState || Date.now() - (p.at || 0) > 15 * 60 * 1000) throw new Error('This sign-in link expired — start again from Studio → Connections');
  const t = await tokenCall({ grant_type: 'authorization_code', code, client_id: p.app_key, code_verifier: p.verifier, redirect_uri: p.redirect_uri });
  if (!t.refresh_token) throw new Error('Dropbox didn’t return a long-lived token');
  const where = await locate(t.access_token, p.base);
  const by = (await secrets.secretStatus(brandId))[PENDING]?.set_by || null;   // who clicked Connect
  await secrets.setSecret(SECRET, { app_key: p.app_key, refresh_token: t.refresh_token, base: p.base, ...where },
    { brandId, user: by ? { name: by } : null, meta: { account: where.account, folder: where.found, base: p.base } });
  await secrets.clearSecret(PENDING, brandId);
  memo = null;
  return where;
}

let memo = null;   // { conn, token, exp }
async function connection(brandId = 'particle') {
  if (memo && memo.exp > Date.now() + 60000) return memo;
  const conn = await secrets.getSecret(SECRET, brandId);
  if (!conn?.refresh_token) return null;
  const t = await tokenCall({ grant_type: 'refresh_token', refresh_token: conn.refresh_token, client_id: conn.app_key });
  memo = { conn, token: t.access_token, exp: Date.now() + (Number(t.expires_in) || 3600) * 1000 };
  return memo;
}
const reset = () => { memo = null; };

function rootHeader(conn) {
  if (conn.mode === 'root') return { 'Dropbox-API-Path-Root': JSON.stringify({ '.tag': 'root', root: conn.root_ns }) };
  if (conn.mode === 'ns') return { 'Dropbox-API-Path-Root': JSON.stringify({ '.tag': 'namespace_id', namespace_id: conn.ns }) };
  return {};
}
async function api(c, endpoint, body) { return raw(c.token, endpoint, body, rootHeader(c.conn)); }
/** The path Dropbox wants (ns: inside the studio's folder itself) and back to the path the team reads. */
const apiPath = (conn, rel) => (conn.mode === 'ns' ? rel.slice(String(conn.base).length) : `${conn.prefix || ''}${rel}`);
const shownPath = (conn, made) => (conn.mode === 'ns' ? `${conn.base}${made}` : made.slice((conn.prefix || '').length));

/** A public, view-only link to the folder (the existing one when there is one). */
async function linkFor(c, path) {
  let r = await api(c, 'sharing/create_shared_link_with_settings', { path, settings: { audience: 'public', access: 'viewer', allow_download: true } });
  if (r.ok) return r.data.url;
  const existing = r.data?.error?.shared_link_already_exists?.metadata?.url;
  if (existing) return existing;
  if (/settings_error|not_authorized|access_denied/i.test(r.text)) {   // a team policy that forbids public links → the team default
    r = await api(c, 'sharing/create_shared_link_with_settings', { path });
    if (r.ok) return r.data.url;
    if (r.data?.error?.shared_link_already_exists?.metadata?.url) return r.data.error.shared_link_already_exists.metadata.url;
  }
  throw new Error(`the link: ${r.text}`);
}

/**
 * Make the ticket's folder and its link. → { url, path } (path from the base, for showing), or null when Dropbox
 * isn't connected. Throws with a readable reason otherwise.
 */
async function createTicketFolder({ board, department, product, platform, websiteTask, itemName, when = new Date(), brandId = 'particle' }) {
  const c = await connection(brandId);
  if (!c) return null;
  const rel = folderPath({ board, department, product, platform, websiteTask, concept: conceptOf(itemName), when, base: c.conn.base });
  const r = await api(c, 'files/create_folder_v2', { path: apiPath(c.conn, rel), autorename: true });   // a second ticket with the same name gets "… (1)"
  if (!r.ok) throw new Error(`the folder: ${r.text}`);
  const made = r.data.metadata.path_display;
  const url = await linkFor(c, made);
  return { url, path: shownPath(c.conn, made) };
}

async function status(brandId = 'particle') {
  const st = (await secrets.secretStatus(brandId))[SECRET];
  return { connected: !!st, set_at: st?.set_at || null, set_by: st?.set_by || null, account: st?.meta?.account || null, folder: st?.meta?.folder || null, base: st?.meta?.base || DEFAULT_BASE };
}

async function disconnect(brandId = 'particle') {
  await secrets.clearSecret(SECRET, brandId);
  await secrets.clearSecret(PENDING, brandId).catch(() => null);
  memo = null;
}

module.exports = { folderPath, conceptOf, clean, categoryOf, monthOf, startConnect, finishConnect, createTicketFolder, status, disconnect, reset, DEFAULT_BASE, SCOPES, _locate: locate };
