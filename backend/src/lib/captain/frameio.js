/**
 * The Captain's own Frame.io V4 connection — the Adobe ID "Captain Caption" (tomer@blurrskin.com), so every comment
 * shows the Captain as author. Stored in settings.captain_frameio_tokens; Creative Weekly's connection
 * (settings.frameio_tokens) is never touched.
 *
 * It reuses CP's Adobe OAuth app and its registered redirect (/api/creative-reports/frameio/callback); the signed
 * state's purpose ('frameio-captain') tells that callback to store the tokens here.
 *
 * How the team uses Frame.io (verified 2026-11-09):
 *   Monday task → one folder · each deliverable (version × size) → a version stack · each revision round → a version in the stack.
 *   Comments: integer `timestamp` = frame number (1-based, ±1 vs. the timecode), `duration` in frames.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../../db');
const { resolveShortLink, parseLink } = require('../creative/providers/frameio');
const L = require('./labels');

const IMS = 'https://ims-na1.adobelogin.com/ims';
const API = 'https://api.frame.io/v4';
const SCOPES = 'openid,AdobeID,email,profile,offline_access,additional_info.roles';
const PURPOSE = 'frameio-captain';

const configured = () => !!(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET && process.env.FRAMEIO_REDIRECT_URI);

async function loadTokens() {
  const { rows } = await db.query("SELECT captain_frameio_tokens FROM settings WHERE brand_id = 'particle'");
  const t = rows[0]?.captain_frameio_tokens;
  return t ? (typeof t === 'string' ? JSON.parse(t) : t) : null;
}
async function saveTokens(t) {
  await db.query("UPDATE settings SET captain_frameio_tokens = $1 WHERE brand_id = 'particle'", [t ? JSON.stringify(t) : null]);
}

// ── OAuth ────────────────────────────────────────────────────────────────────
function authorizeUrl(userId) {
  if (!configured()) throw new Error('Frame.io is not configured on the server');
  const state = jwt.sign({ uid: userId, purpose: PURPOSE, n: crypto.randomBytes(8).toString('hex') }, process.env.JWT_SECRET, { expiresIn: '10m' });
  const q = new URLSearchParams({
    client_id: process.env.FRAMEIO_CLIENT_ID,
    redirect_uri: process.env.FRAMEIO_REDIRECT_URI,
    scope: process.env.FRAMEIO_SCOPES || SCOPES,
    response_type: 'code',
    state,
    prompt: 'login',              // always ask which Adobe ID — it must be the Captain's, not whoever is signed in
  });
  return `${IMS}/authorize/v2?${q.toString()}`;
}

/** Returns the decoded state when it belongs to the Captain, otherwise null (it's Creative Weekly's). */
function captainState(state) {
  try { const p = jwt.verify(state, process.env.JWT_SECRET); return p.purpose === PURPOSE ? p : null; } catch { return null; }
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
  await saveTokens({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + (Number(d.expires_in) || 86400) * 1000 - 60000,
    connected_by: connectedBy || null,
    connected_at: new Date().toISOString(),
    last_refresh_at: new Date().toISOString(),
    account_id: null, account_name: null, user_name: null, last_error: null,
  });
  try {
    const me = await api('/me');
    const acct = await pickAccount();
    await saveTokens({ ...(await loadTokens()), user_name: me?.data?.name || null, user_email: me?.data?.email || null, account_id: acct?.id || null, account_name: acct?.display_name || acct?.name || null });
  } catch (e) {
    await saveTokens({ ...(await loadTokens()), last_error: e.message });
  }
  return loadTokens();
}

let refreshing = null;
async function accessToken({ forceRefresh = false } = {}) {
  const t = await loadTokens();
  if (!t?.access_token) throw Object.assign(new Error("The Captain isn't connected to Frame.io yet"), { code: 'NOT_CONNECTED' });
  if (!forceRefresh && t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw Object.assign(new Error("The Captain's Frame.io session expired — reconnect"), { code: 'EXPIRED' });
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const d = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
        const next = { ...t, access_token: d.access_token, refresh_token: d.refresh_token || t.refresh_token, expires_at: Date.now() + (Number(d.expires_in) || 86400) * 1000 - 60000, last_refresh_at: new Date().toISOString(), last_error: null };
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function api(path, { method = 'GET', body = null, tries = 4 } = {}) {
  let forceRefresh = false;
  for (let attempt = 1; ; attempt++) {
    const tk = await accessToken({ forceRefresh });
    forceRefresh = false;
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 401 && attempt < 2) { forceRefresh = true; continue; }
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 2000 * attempt);
      continue;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.title || data?.message || `HTTP ${res.status}`;
      throw Object.assign(new Error(`Frame.io ${res.status}: ${msg}`), { status: res.status });
    }
    return data;
  }
}

/** The Captain may see several accounts; prefer the one Creative Weekly already works in (the team's account). */
async function pickAccount() {
  const accounts = (await api('/accounts'))?.data || [];
  if (!accounts.length) throw new Error('No Frame.io account is visible to the Captain');
  const { rows } = await db.query("SELECT frameio_tokens->>'account_id' AS id FROM settings WHERE brand_id = 'particle'").catch(() => ({ rows: [] }));
  return accounts.find(a => a.id === rows[0]?.id) || accounts[0];
}

async function accountId() {
  const t = await loadTokens();
  if (t?.account_id) return t.account_id;
  const acct = await pickAccount();
  await saveTokens({ ...t, account_id: acct.id, account_name: acct.display_name || acct.name || null });
  return acct.id;
}

const meta = (f, name) => (f?.metadata || []).find(m => m.field_definition_name === name)?.value ?? null;
const pick = (ml, key) => { const o = ml?.[key]; return (o && (o.download_url || o.url || (typeof o === 'string' ? o : null))) || null; };

async function tryGet(path) {
  try { return (await api(path))?.data || null; } catch (e) { if ([403, 404, 422].includes(e.status)) return null; throw e; }
}

/**
 * Any Frame.io link → what it points at.
 *   { kind: 'folder' | 'stack' | 'file' | 'share', id, name, project_id, folder_id }
 * f.io short links resolve to share links; a share of one asset is treated as that asset, a share of several is
 * checked as a whole (every video in it, each counted once).
 */
async function resolveTarget(link) {
  const a = await accountId();
  const url = await resolveShortLink(String(link).match(/https?:\/\/\S+/)?.[0] || link);
  const p = parseLink(url);
  if (!p) return null;
  let id = p.id;
  if (p.share_id && !id) {
    const assets = (await api(`/accounts/${a}/shares/${p.share_id}/assets?page_size=50`))?.data || [];
    if (!assets.length) return null;
    if (assets.length > 1) {
      // A review link of several assets — often the task folder plus the videos inside it. Its home folder (for the
      // posting switch) is the one shared folder, or the folder every shared file sits in.
      const sh = await tryGet(`/accounts/${a}/shares/${p.share_id}`);
      const folders = assets.filter(x => x.type === 'folder');
      const parents = [...new Set(assets.filter(x => x.type !== 'folder').map(x => x.parent_id).filter(Boolean))];
      const folderId = folders.length === 1 && parents.every(pid => pid === folders[0].id) ? folders[0].id : (!folders.length && parents.length === 1 ? parents[0] : null);
      return { kind: 'share', id: p.share_id, count: assets.length, name: sh?.name || folders[0]?.name || null, project_id: assets[0].project_id || null, folder_id: folderId, url };
    }
    id = assets[0].id;
  }
  if (!id) return p.project_id ? { kind: 'project', id: p.project_id, url } : null;
  const order = p.hint === 'folder' ? ['folders', 'version_stacks', 'files'] : ['files', 'version_stacks', 'folders'];
  for (const kind of order) {
    const x = await tryGet(`/accounts/${a}/${kind}/${id}`);
    if (!x) continue;
    const k = kind === 'folders' ? 'folder' : kind === 'files' ? 'file' : 'stack';
    let folderId = k === 'folder' ? x.id : x.parent_id;
    if (k === 'file') { const parentStack = await tryGet(`/accounts/${a}/version_stacks/${x.parent_id}`); if (parentStack) folderId = parentStack.parent_id; }
    return { kind: k, id: x.id, name: x.name, project_id: x.project_id, folder_id: folderId, url };
  }
  return null;
}

/** A folder's name (the team names a task's Frame.io folder after its Monday task). */
async function folderName(folderId) {
  if (!folderId) return null;
  const a = await accountId();
  return (await tryGet(`/accounts/${a}/folders/${folderId}`))?.name || null;
}

/** The rounds of one version stack, oldest first (round 1 = the first upload). */
async function stackRounds(stackId) {
  const a = await accountId();
  const list = (await api(`/accounts/${a}/version_stacks/${stackId}/children?page_size=50`))?.data || [];
  return list
    .filter(f => f.type === 'file' || f.media_type)
    .sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))
    .map((f, i) => ({ file_id: f.id, name: f.name, created_at: f.created_at, status: f.status, round: i + 1 }));
}

/**
 * A folder → its deliverables. Each video file or version stack is one deliverable (version × size); its newest
 * file is what gets checked. Sorted master-first (biggest size), then by version number.
 */
async function deliverablesOfFolder(folderId) {
  const a = await accountId();
  const out = [];
  let path = `/accounts/${a}/folders/${folderId}/children?page_size=50`;
  for (let page = 0; page < 6 && path; page++) {
    const d = await api(path);
    for (const c of d?.data || []) {
      if (c.type === 'version_stack') {
        const rounds = await stackRounds(c.id);
        if (rounds.length) out.push({ stack_id: c.id, name: c.name, rounds });
      } else if (c.type === 'file' && /^video\//.test(c.media_type || '')) {
        out.push({ stack_id: null, name: c.name, rounds: [{ file_id: c.id, name: c.name, created_at: c.created_at, status: c.status, round: 1 }] });
      }
    }
    const next = d?.links?.next;
    path = next ? next.replace(/^https?:\/\/[^/]+\/v4/, '').replace(/^\/v4/, '') + (next.includes('page_size') ? '' : '&page_size=50') : null;
  }
  return sortDeliverables(out.map(x => {
    const size = L.sizeFromName(x.name);
    const variant = L.variantFromName(x.name);
    const head = x.rounds[x.rounds.length - 1];
    return { ...x, size, variant, label: L.deliverableLabel({ variant, size }), head, first_upload: x.rounds[0].created_at };
  }));
}

/** Master first (biggest size), then by version number, then by name. */
const sortDeliverables = (list) => list.sort((p, q) => L.sizeRank(p.size) - L.sizeRank(q.size) || (p.variant || 0) - (q.variant || 0) || p.name.localeCompare(q.name));

/** A share link holding several assets (what some f.io short links point to) → the deliverables inside it. */
async function deliverablesOfShare(shareId) {
  const a = await accountId();
  const assets = (await api(`/accounts/${a}/shares/${shareId}/assets?page_size=50`))?.data || [];
  const out = [];
  const seen = new Set();
  for (const x of assets) {
    const id = x.asset_id || x.file_id || x.id;
    let found = [];
    if (x.type === 'folder') found = await deliverablesOfFolder(id);
    else if (x.type === 'version_stack') found = await deliverablesForTarget({ kind: 'stack', id, name: x.name });
    else if (!x.media_type || /^video\//.test(x.media_type)) found = await deliverablesForTarget({ kind: 'file', id, name: x.name });
    // A share often holds the task folder AND the videos inside it — count each video once
    for (const d of found) { const k = d.stack_id || d.head?.file_id; if (!seen.has(k)) { seen.add(k); out.push(d); } }
  }
  return sortDeliverables(out);
}

/** Deliverables for any link: folder → all of them; share → everything shared; stack or file → just that one. */
async function deliverablesForTarget(target) {
  if (target.kind === 'folder') return deliverablesOfFolder(target.id);
  if (target.kind === 'share') return deliverablesOfShare(target.id);
  if (target.kind === 'stack') {
    const rounds = await stackRounds(target.id);
    const size = L.sizeFromName(target.name), variant = L.variantFromName(target.name);
    return rounds.length ? [{ stack_id: target.id, name: target.name, rounds, size, variant, label: L.deliverableLabel({ variant, size }), head: rounds[rounds.length - 1] }] : [];
  }
  if (target.kind === 'file') {
    const a = await accountId();
    const f = await tryGet(`/accounts/${a}/files/${target.id}`);
    const parentStack = f ? await tryGet(`/accounts/${a}/version_stacks/${f.parent_id}`) : null;
    if (parentStack) {
      const rounds = await stackRounds(parentStack.id);
      const mine = rounds.find(r => r.file_id === target.id) || rounds[rounds.length - 1];
      const size = L.sizeFromName(parentStack.name), variant = L.variantFromName(parentStack.name);
      return [{ stack_id: parentStack.id, name: parentStack.name, rounds, size, variant, label: L.deliverableLabel({ variant, size }), head: mine }];
    }
    const size = L.sizeFromName(target.name), variant = L.variantFromName(target.name);
    return [{ stack_id: null, name: target.name, rounds: [{ file_id: target.id, name: target.name, round: 1, created_at: f?.created_at }], size, variant, label: L.deliverableLabel({ variant, size }), head: { file_id: target.id, round: 1 } }];
  }
  return [];
}

/** Everything a check needs about one file: frame rate, length, the 720/1080p copy to download. */
async function fileInfo(fileId) {
  const a = await accountId();
  const f = (await api(`/accounts/${a}/files/${fileId}?include=metadata,media_links.high_quality,media_links.efficient,media_links.thumbnail`))?.data;
  return {
    id: f.id, name: f.name, status: f.status, parent_id: f.parent_id, project_id: f.project_id, view_url: f.view_url,
    fps: Number(meta(f, 'Frame Rate')) || null,
    duration: Number(meta(f, 'Duration')) || null,
    width: Number(meta(f, 'Resolution - Width')) || null,
    height: Number(meta(f, 'Resolution - Height')) || null,
    comment_count: Number(meta(f, 'Comment Count')) || 0,
    video_url: pick(f.media_links, 'high_quality') || pick(f.media_links, 'efficient'),
    thumb_url: pick(f.media_links, 'thumbnail'),
    ready: f.status === 'transcoded',
  };
}

async function listComments(fileId) {
  const a = await accountId();
  const out = [];
  let after = null;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ page_size: '100', include: 'owner,replies' });
    if (after) q.set('after', after);
    const d = await api(`/accounts/${a}/files/${fileId}/comments?${q}`);
    out.push(...(d?.data || []));
    const next = d?.links?.next;
    after = next ? new URL(next, 'https://x').searchParams.get('after') : null;
    if (!after) break;
  }
  return out;
}

/** Post one comment on one file version. timestamp = frame number (1-based); duration in frames. */
async function createComment(fileId, { text, timestamp = null, duration = null }) {
  const a = await accountId();
  const data = { text };
  if (timestamp != null) { data.timestamp = Math.max(1, Math.round(timestamp)); if (duration) data.duration = Math.max(1, Math.round(duration)); }
  const d = await api(`/accounts/${a}/files/${fileId}/comments`, { method: 'POST', body: { data } });
  return d?.data;
}

async function status() {
  const t = await loadTokens().catch(() => null);
  const out = { configured: configured(), connected: !!t?.access_token, user_name: t?.user_name || null, account_name: t?.account_name || null, connected_at: t?.connected_at || null, error: t?.last_error || null };
  if (out.connected) {
    try { const me = await api('/me'); out.user_name = me?.data?.name || out.user_name; out.error = null; } catch (e) { out.error = e.message; }
  }
  return out;
}

async function disconnect() { await saveTokens(null); }
async function keepalive() { const t = await loadTokens().catch(() => null); if (!t?.refresh_token) return { skipped: true }; await accessToken({ forceRefresh: true }); return { ok: true }; }

module.exports = {
  configured, authorizeUrl, captainState, exchangeCode, status, disconnect, keepalive,
  api, accountId, resolveTarget, folderName, deliverablesOfFolder, deliverablesOfShare, deliverablesForTarget, stackRounds, fileInfo, listComments, createComment,
};
