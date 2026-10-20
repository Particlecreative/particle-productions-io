/**
 * Dropbox provider for Creative Weekly media.
 * Works from the SHARED LINKS on Monday tickets (folder links /scl/fo/…, file links /scl/fi/…):
 *   - list a shared folder (2 levels, ≤ 60 files, deliverable folders first)
 *   - image thumbnails via get_thumbnail_v2 (link resource)
 *   - playable temporary link when the team account can resolve the path
 */
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv']);
const THUMBABLE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'bmp']);
const PREFERRED_DIR = /(final|export|deliver|output|upload|ready)/i;

let tokenFn = null;
function token() {
  if (!tokenFn) tokenFn = require('../../../routes/drive').getDropboxToken;
  return tokenFn();
}

/** Dropbox-API-Arg header values must be ASCII: escape everything else as \uXXXX (file names with "–", Hebrew…). */
function headerJson(obj) {
  return JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();
function kindOf(name) {
  const e = extOf(name);
  if (IMAGE_EXT.has(e)) return 'image';
  if (VIDEO_EXT.has(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  return 'other';
}
const b64url = (s) => Buffer.from(String(s), 'utf8').toString('base64url');
const unb64url = (s) => Buffer.from(String(s), 'base64url').toString('utf8');

async function rpc(endpoint, body, { headers = {}, timeoutMs = 15000 } = {}) {
  const tk = await token();
  if (!tk) throw Object.assign(new Error('Dropbox is not connected'), { code: 'NO_TOKEN' });
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const summary = data?.error_summary || text.slice(0, 200);
    const err = new Error(`Dropbox ${endpoint}: ${res.status} ${summary}`);
    err.status = res.status;
    err.summary = summary;
    if (/missing_scope/.test(summary)) err.code = 'MISSING_SCOPE';
    throw err;
  }
  return data;
}

let rootNs = null;
async function rootNamespaceId() {
  if (rootNs !== null) return rootNs;
  try {
    const acct = await rpc('users/get_current_account', null);
    rootNs = acct?.root_info?.root_namespace_id || '';
  } catch { rootNs = ''; }
  return rootNs;
}

/**
 * List files under a shared folder link. Returns [{ key, name, path, ext, kind, size, modified, rev, hash }]
 */
async function listSharedFolder(url, { maxDepth = 2, maxFiles = 60 } = {}) {
  const files = [];
  const queue = [{ path: '', depth: 0 }];
  while (queue.length && files.length < maxFiles) {
    const { path, depth } = queue.shift();
    let res = await rpc('files/list_folder', { path, shared_link: { url }, limit: 200 });
    const entries = [...(res.entries || [])];
    while (res.has_more && entries.length < 1000) {
      res = await rpc('files/list_folder/continue', { cursor: res.cursor });
      entries.push(...(res.entries || []));
    }
    const subdirs = [];
    for (const e of entries) {
      if (e['.tag'] === 'folder') {
        if (depth + 1 <= maxDepth) subdirs.push({ path: `${path}/${e.name}`, depth: depth + 1 });
        continue;
      }
      if (e['.tag'] !== 'file') continue;
      if (e.name.startsWith('.')) continue;
      const rel = `${path}/${e.name}`;
      files.push({
        key: b64url(rel),
        name: e.name,
        path: rel,
        ext: extOf(e.name),
        kind: kindOf(e.name),
        size: e.size || null,
        modified: e.server_modified || e.client_modified || null,
        rev: e.rev || null,
        hash: e.content_hash || null,
        preferred: PREFERRED_DIR.test(path),
      });
      if (files.length >= maxFiles) break;
    }
    // Deliverable-looking folders first
    subdirs.sort((a, b) => Number(PREFERRED_DIR.test(b.path)) - Number(PREFERRED_DIR.test(a.path)));
    queue.push(...subdirs);
  }
  const rank = { image: 0, video: 1, pdf: 2, other: 3 };
  // Browser-playable, fast-to-poster formats first (ProRes .mov masters are huge and don't play in Chrome)
  const extRank = (f) => (f.kind !== 'video' ? 0 : ['mp4', 'm4v', 'webm'].includes(f.ext) ? 0 : 1);
  files.sort((a, b) => (Number(b.preferred) - Number(a.preferred)) || (rank[a.kind] - rank[b.kind]) ||
    (extRank(a) - extRank(b)) || String(b.modified || '').localeCompare(String(a.modified || '')));
  return files;
}

/** Metadata for a shared FILE link → single listing entry. */
async function sharedFileEntry(url) {
  const m = await rpc('sharing/get_shared_link_metadata', { url });
  return [{
    key: '_',
    name: m.name,
    path: '',
    ext: extOf(m.name),
    kind: kindOf(m.name),
    size: m.size || null,
    modified: m.server_modified || null,
    rev: m.rev || null,
    hash: null,
    preferred: true,
  }];
}

/** JPEG thumbnail bytes for an image inside a shared link (or a shared file link when relPath is ''). */
async function thumbnail(url, relPath, { size = 'w640h480' } = {}) {
  const tk = await token();
  if (!tk) throw Object.assign(new Error('Dropbox is not connected'), { code: 'NO_TOKEN' });
  const resource = { '.tag': 'link', url };
  if (relPath) resource.path = relPath;
  const res = await fetch(`${CONTENT}/files/get_thumbnail_v2`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tk}`,
      'Dropbox-API-Arg': headerJson({ resource, format: 'jpeg', size, mode: 'fitone_bestfit' }),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Dropbox thumbnail ${res.status} ${t.slice(0, 160)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Temporary (4h) direct link to a file inside a shared link, or null if the path can't be resolved. */
async function temporaryLink(url, relPath) {
  let meta;
  try {
    meta = await rpc('sharing/get_shared_link_metadata', relPath ? { url, path: relPath } : { url });
  } catch { return null; }
  const p = meta?.path_lower;
  if (!p) return null;
  const tryWith = async (headers) => {
    try { return (await rpc('files/get_temporary_link', { path: p }, { headers }))?.link || null; } catch { return null; }
  };
  const direct = await tryWith({});
  if (direct) return direct;
  const ns = await rootNamespaceId();
  if (!ns) return null;
  return tryWith({ 'Dropbox-API-Path-Root': headerJson({ '.tag': 'root', root: ns }) });
}

/**
 * Range-capable GET URL for a file inside a shared link (Dropbox content endpoints accept GET with
 * ?arg=…&authorization=…). Works even when the file lives in someone else's Dropbox.
 * SERVER-SIDE ONLY: the URL embeds the access token — feed it to ffmpeg or stream it through the
 * media proxy, never send it to a browser.
 */
async function sharedLinkFileUrl(url, relPath) {
  const tk = await token();
  if (!tk) return null;
  const arg = relPath ? { url, path: relPath } : { url };
  return `${CONTENT}/sharing/get_shared_link_file?arg=${encodeURIComponent(JSON.stringify(arg))}&authorization=${encodeURIComponent(`Bearer ${tk}`)}`;
}

const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
function mimeOf(name) { return MIME[extOf(name)] || 'application/octet-stream'; }

/** Health check used by /integrations (scopes + connectivity). */
async function health(sampleFolderUrl) {
  const out = { connected: false, can_list_shared: null, error: null };
  try {
    const tk = await token();
    if (!tk) return { ...out, error: 'Dropbox is not connected (Settings → Integrations)' };
    await rpc('users/get_current_account', null);
    out.connected = true;
    if (sampleFolderUrl) {
      try { await rpc('files/list_folder', { path: '', shared_link: { url: sampleFolderUrl }, limit: 1 }); out.can_list_shared = true; } catch (e) {
        out.can_list_shared = false;
        out.error = e.code === 'MISSING_SCOPE'
          ? 'The Dropbox app is missing a scope (needs files.metadata.read, files.content.read, sharing.read). Enable it in the Dropbox App Console, then reconnect Dropbox in Settings.'
          : e.message;
      }
    }
  } catch (e) {
    out.error = e.code === 'MISSING_SCOPE' ? 'Dropbox app missing account_info.read scope' : e.message;
  }
  return out;
}

// Test hook: inject a token source without the DB-backed drive router
function _setTokenSource(fn) { tokenFn = fn; rootNs = null; }

module.exports = { listSharedFolder, sharedFileEntry, thumbnail, temporaryLink, sharedLinkFileUrl, mimeOf, health, kindOf, extOf, b64url, unb64url, THUMBABLE, _setTokenSource };
