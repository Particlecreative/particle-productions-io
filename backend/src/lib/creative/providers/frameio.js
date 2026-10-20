/**
 * Frame.io V4 (Adobe IMS OAuth, "User Authentication → OAuth Web App" credential).
 *
 * Tokens live in settings.frameio_tokens on the 'particle' row:
 *   { access_token, refresh_token, expires_at, account_id, account_name, connected_by, connected_at, last_error }
 * Env: FRAMEIO_CLIENT_ID, FRAMEIO_CLIENT_SECRET, FRAMEIO_REDIRECT_URI, optional FRAMEIO_SCOPES.
 *
 * media_links expire — never store them; thumbnails are cached as bytes by media.js.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../../../db');

const IMS = 'https://ims-na1.adobelogin.com/ims';
const API = 'https://api.frame.io/v4';
const DEFAULT_SCOPES = 'openid,AdobeID,email,profile,offline_access,additional_info.roles';

const configured = () => !!(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET && process.env.FRAMEIO_REDIRECT_URI);

async function loadTokens() {
  const { rows } = await db.query("SELECT frameio_tokens FROM settings WHERE brand_id = 'particle'");
  const t = rows[0]?.frameio_tokens;
  return t ? (typeof t === 'string' ? JSON.parse(t) : t) : null;
}
async function saveTokens(t) {
  await db.query("UPDATE settings SET frameio_tokens = $1 WHERE brand_id = 'particle'", [t ? JSON.stringify(t) : null]);
}

// ── OAuth ────────────────────────────────────────────────────────────────────
function authorizeUrl(userId) {
  if (!configured()) throw new Error('Frame.io is not configured (FRAMEIO_CLIENT_ID / FRAMEIO_CLIENT_SECRET / FRAMEIO_REDIRECT_URI)');
  const state = jwt.sign({ uid: userId, purpose: 'frameio', n: crypto.randomBytes(8).toString('hex') }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const q = new URLSearchParams({
    client_id: process.env.FRAMEIO_CLIENT_ID,
    redirect_uri: process.env.FRAMEIO_REDIRECT_URI,
    scope: process.env.FRAMEIO_SCOPES || DEFAULT_SCOPES,
    response_type: 'code',
    state,
  });
  return `${IMS}/authorize/v2?${q.toString()}`;
}

function verifyState(state) {
  const p = jwt.verify(state, process.env.JWT_SECRET);
  if (p.purpose !== 'frameio') throw new Error('Bad state');
  return p;
}

async function tokenRequest(params) {
  const res = await fetch(`${IMS}/token/v3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.FRAMEIO_CLIENT_ID, client_secret: process.env.FRAMEIO_CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Adobe IMS ${res.status}: ${data.error_description || data.error || 'token request failed'}`);
  return data;
}

async function exchangeCode(code, connectedBy) {
  const d = await tokenRequest({ grant_type: 'authorization_code', code });
  const t = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (Number(d.expires_in) || 86400) * 1000 - 60000,
    connected_by: connectedBy || null,
    connected_at: new Date().toISOString(),
    last_refresh_at: new Date().toISOString(),
    account_id: null,
    account_name: null,
    last_error: null,
  };
  await saveTokens(t);
  // Resolve the account right away so a missing Frame.io ↔ Adobe ID link surfaces immediately
  try { await resolveAccount(true); } catch (e) { t.last_error = e.message; await saveTokens({ ...(await loadTokens()), last_error: e.message }); }
  return loadTokens();
}

let refreshing = null;
async function accessToken({ forceRefresh = false } = {}) {
  const t = await loadTokens();
  if (!t?.access_token) throw Object.assign(new Error('Frame.io is not connected'), { code: 'NOT_CONNECTED' });
  if (!forceRefresh && t.expires_at && t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw Object.assign(new Error('Frame.io session expired — reconnect'), { code: 'EXPIRED' });
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const d = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
        const next = {
          ...t,
          access_token: d.access_token,
          refresh_token: d.refresh_token || t.refresh_token,
          expires_at: Date.now() + (Number(d.expires_in) || 86400) * 1000 - 60000,
          last_refresh_at: new Date().toISOString(),
          last_error: null,
        };
        await saveTokens(next);
        return next.access_token;
      } catch (e) {
        await saveTokens({ ...t, last_error: e.message });
        throw Object.assign(e, { code: 'REFRESH_FAILED' });
      } finally { refreshing = null; }
    })();
  }
  return refreshing;
}

// ── API ──────────────────────────────────────────────────────────────────────
let legacyHeader = false;
function setLegacyHeader(v) { legacyHeader = !!v; }

async function api(pathAndQuery, { retry = true } = {}) {
  const tk = await accessToken();
  const headers = { Authorization: `Bearer ${tk}`, Accept: 'application/json' };
  if (legacyHeader) headers['x-frameio-legacy-token-auth'] = 'true';
  const res = await fetch(`${API}${pathAndQuery}`, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 && retry) {
    await accessToken({ forceRefresh: true }).catch(() => null);
    return api(pathAndQuery, { retry: false });
  }
  if (res.status === 429 && retry) {
    const ra = Number(res.headers.get('retry-after')) || 2;
    await new Promise(r => setTimeout(r, Math.min(ra, 10) * 1000));
    return api(pathAndQuery, { retry: false });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || data?.message || `HTTP ${res.status}`;
    const err = new Error(`Frame.io ${res.status}: ${msg}`);
    err.status = res.status;
    if (res.status === 401) err.hint = 'Your Adobe ID may not be linked to the Frame.io account. Sign in to next.frame.io with the same Adobe ID, then reconnect.';
    throw err;
  }
  return data;
}

async function resolveAccount(force = false) {
  const t = await loadTokens();
  if (!force && t?.account_id) return t.account_id;
  const d = await api('/accounts');
  const accounts = d?.data || [];
  if (!accounts.length) throw new Error('No Frame.io accounts visible to this Adobe ID');
  const acct = accounts[0];
  await saveTokens({ ...(await loadTokens()), account_id: acct.id, account_name: acct.display_name || acct.name || null, accounts: accounts.map(a => ({ id: a.id, name: a.display_name || a.name })) });
  return acct.id;
}

/** Follow f.io short links to their next.frame.io destination (only *.frame.io hosts). */
async function resolveShortLink(url) {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const u = new URL(current);
    if (!/(^|\.)f\.io$/i.test(u.hostname)) return current;
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const loc = res.headers.get('location');
    if (!loc) return current;
    const next = new URL(loc, current);
    if (!/(^|\.)frame\.io$/i.test(next.hostname) && !/(^|\.)f\.io$/i.test(next.hostname)) return current;
    current = next.toString();
  }
  return current;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
function parseLink(url) {
  const u = String(url);
  let m = u.match(new RegExp(`/project/(${UUID})/view/(${UUID})`, 'i'));
  if (m) return { project_id: m[1], id: m[2], hint: 'file' };
  m = u.match(new RegExp(`/project/(${UUID})/(${UUID})`, 'i'));
  if (m) return { project_id: m[1], id: m[2], hint: 'folder' };
  m = u.match(new RegExp(`/project/(${UUID})`, 'i'));
  if (m) return { project_id: m[1], id: null, hint: 'project' };
  m = u.match(new RegExp(`/share/(${UUID})(?:/view/(${UUID}))?`, 'i'));
  if (m) return { share_id: m[1], id: m[2] || null, hint: m[2] ? 'file' : 'share' };
  return null;
}

function mediaUrl(entity, variant) {
  const ml = entity?.media_links || {};
  const pick = (o) => (o && (o.download_url || o.url || o.href || (typeof o === 'string' ? o : null))) || null;
  if (variant === 'thumb') return pick(ml.thumbnail) || pick(ml.thumbnail_high_quality) || null;
  // `efficient` is the small web proxy (fast start on a TV); fall back to the bigger renditions
  if (variant === 'play') return pick(ml.efficient) || pick(ml.high_quality) || pick(ml.original) || null;
  return pick(ml.high_quality) || pick(ml.original) || pick(ml.efficient) || null;
}

function entryFromFile(f) {
  const mt = String(f.media_type || f.filetype || '').toLowerCase();
  const kind = mt.startsWith('video') ? 'video' : mt.startsWith('image') ? 'image' : mt.includes('pdf') ? 'pdf' : 'other';
  return {
    key: f.id,
    name: f.name,
    ext: (String(f.name).split('.').pop() || '').toLowerCase(),
    kind,
    size: f.file_size || null,
    modified: f.updated_at || f.created_at || null,
    version: f.version_number || null,
    status: f.status || null,
    preferred: true,
  };
}

async function listChildren(accountId, folderId) {
  const out = [];
  let path = `/accounts/${accountId}/folders/${folderId}/children?page_size=50`;
  for (let i = 0; i < 4 && path; i++) {
    const d = await api(path);
    out.push(...(d?.data || []));
    const next = d?.links?.next;
    path = next ? next.replace(/^https?:\/\/[^/]+\/v4/, '') : null;
  }
  return out;
}

async function latestInStack(accountId, stackId) {
  const d = await api(`/accounts/${accountId}/version_stacks/${stackId}/children?page_size=50`);
  const files = (d?.data || []).filter(x => x.type === 'file' || x.media_type);
  files.sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  return files[0] || null;
}

/**
 * Listing for a Frame.io link → [{ key (file id), name, kind, version, … }], newest first, ≤ 24.
 */
async function listing(link) {
  const resolved = await resolveShortLink(link);
  const p = parseLink(resolved);
  if (!p) return { entries: [], unresolvable: true, resolved };
  const accountId = await resolveAccount();
  const tryFile = async (id) => { try { return (await api(`/accounts/${accountId}/files/${id}`))?.data || null; } catch (e) { if (e.status === 404 || e.status === 422) return null; throw e; } };
  const tryStack = async (id) => { try { return await latestInStack(accountId, id); } catch (e) { if (e.status === 404 || e.status === 422) return null; throw e; } };

  // Share links (what f.io short links resolve to): list the share's assets
  if (p.share_id) {
    if (p.id) {
      const f = (await tryFile(p.id)) || (await tryStack(p.id));
      return { entries: f ? [entryFromFile(f)] : [], resolved };
    }
    let assets = [];
    try {
      const d = await api(`/accounts/${accountId}/shares/${p.share_id}/assets?page_size=50`);
      assets = d?.data || [];
    } catch (e) {
      if (e.status === 404 || e.status === 403 || e.status === 422) return { entries: [], unresolvable: true, resolved };
      throw e;
    }
    const files = [];
    for (const a of assets) {
      const id = a.asset_id || a.file_id || a.id;
      if (a.type === 'version_stack') { const f = await latestInStack(accountId, id).catch(() => null); if (f) files.push(f); }
      else if (a.type === 'file' || a.media_type) files.push(a.media_type ? a : (await tryFile(id)) || a);
      else { const f = await tryFile(id); if (f) files.push(f); }
    }
    files.sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
    return { entries: files.slice(0, 24).map(entryFromFile), resolved };
  }
  if (!p.id) return { entries: [], unresolvable: true, resolved };

  if (p.hint === 'file') {
    const f = (await tryFile(p.id)) || (await tryStack(p.id));
    return { entries: f ? [entryFromFile(f)] : [], resolved };
  }
  let children = [];
  try { children = await listChildren(accountId, p.id); } catch (e) {
    if (e.status !== 404 && e.status !== 422) throw e;
    const f = (await tryFile(p.id)) || (await tryStack(p.id));
    return { entries: f ? [entryFromFile(f)] : [], resolved };
  }
  const files = [];
  for (const c of children) {
    if (c.type === 'version_stack') { const f = await latestInStack(accountId, c.id).catch(() => null); if (f) files.push(f); }
    else if (c.type === 'file' || c.media_type) files.push(c);
  }
  if (!files.length) {
    // One level down when the folder only holds subfolders
    for (const sub of children.filter(c => c.type === 'folder').slice(0, 4)) {
      const inner = await listChildren(accountId, sub.id).catch(() => []);
      for (const c of inner) {
        if (c.type === 'version_stack') { const f = await latestInStack(accountId, c.id).catch(() => null); if (f) files.push(f); }
        else if (c.type === 'file' || c.media_type) files.push(c);
      }
    }
  }
  files.sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  return { entries: files.slice(0, 24).map(entryFromFile), resolved };
}

/**
 * Fresh media URL for a file id: variant thumb | play | full.
 * V4 accepts media_links.{thumbnail, thumbnail_high_quality, efficient, high_quality, original,
 * video_h264_180, scrub_sheet} — anything else (e.g. video_h264_720) is a 422.
 */
async function fileMediaUrl(fileId, variant) {
  const accountId = await resolveAccount();
  const include = variant === 'thumb' ? 'media_links.thumbnail' : variant === 'play'
    ? 'media_links.efficient,media_links.high_quality,media_links.original'
    : 'media_links.high_quality,media_links.original,media_links.efficient';
  const d = await api(`/accounts/${accountId}/files/${fileId}?include=${encodeURIComponent(include)}`);
  return mediaUrl(d?.data, variant);
}

async function status() {
  const t = await loadTokens().catch(() => null);
  const out = {
    configured: configured(),
    connected: !!t?.access_token,
    account_id: t?.account_id || null,
    account_name: t?.account_name || null,
    connected_at: t?.connected_at || null,
    last_refresh_at: t?.last_refresh_at || null,
    error: t?.last_error || null,
  };
  if (out.connected) {
    // Always re-check live: a stale error (e.g. "not linked to an Adobe ID") must clear once the user fixes it
    try {
      await api('/me');
      out.error = null;
      if (t.last_error) await saveTokens({ ...(await loadTokens()), last_error: null });
      if (!t.account_id) {
        try {
          await resolveAccount(true);
          const fresh = await loadTokens();
          out.account_id = fresh?.account_id || null;
          out.account_name = fresh?.account_name || null;
        } catch (e) { out.error = e.message; }
      }
    } catch (e) {
      out.error = e.message;
      out.hint = e.hint || null;
    }
  }
  return out;
}

async function disconnect() { await saveTokens(null); }

/** Daily keepalive: Adobe refresh tokens lapse if unused for ~14 days. */
async function keepalive() {
  const t = await loadTokens().catch(() => null);
  if (!t?.refresh_token) return { skipped: true };
  await accessToken({ forceRefresh: true });
  return { ok: true };
}

module.exports = {
  configured, authorizeUrl, verifyState, exchangeCode, accessToken, resolveAccount,
  resolveShortLink, parseLink, listing, fileMediaUrl, status, disconnect, keepalive, setLegacyHeader,
};
