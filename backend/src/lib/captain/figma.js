/**
 * The Captain's Figma connection: personal access token of the "Captain Caption" Figma user (CAPTAIN_FIGMA_TOKEN),
 * view access — viewers can comment, so comments show the Captain as author.
 *
 * How the team works (verified 2026-11-09): big shared files (e.g. "MEDIA Products 2026"); each Monday task links to
 * ONE node — usually a SECTION named like the task, holding one frame per copy variant × size (all frames may share
 * the same name). Designers edit the same frames; versions come from the file's version history + a content hash.
 * The Captain checks only the linked node and its children — never a whole page/file.
 */
const crypto = require('crypto');
const L = require('./labels');

const API = 'https://api.figma.com';
const configured = () => !!process.env.CAPTAIN_FIGMA_TOKEN;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(path, { method = 'GET', body = null, tries = 4, timeoutMs = 90000 } = {}) {
  if (!configured()) throw Object.assign(new Error("The Captain's Figma token isn't set (CAPTAIN_FIGMA_TOKEN)"), { code: 'NOT_CONFIGURED' });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'X-Figma-Token': process.env.CAPTAIN_FIGMA_TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 : 5000 * attempt);
      continue;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(`Figma ${res.status}: ${data?.err || data?.message || 'request failed'}`), { status: res.status });
    return data;
  }
}

/** figma.com/design/<key>/<name>?node-id=1-18 → { fileKey, nodeId: '1:18' }. Handles %3A, /file/, /proto/, /board/, /branch/. */
function parseUrl(url) {
  const s = String(url || '').match(/https?:\/\/\S+/)?.[0] || String(url || '');
  const m = s.match(/figma\.com\/(?:design|file|proto|board)\/([A-Za-z0-9]+)(?:\/[^/?#]*)?(?:\/branch\/([A-Za-z0-9]+))?/);
  if (!m) return null;
  let nodeId = null;
  try {
    const raw = new URL(s).searchParams.get('node-id');
    if (raw) nodeId = decodeURIComponent(raw).replace(/-/g, ':');
  } catch { /* not a full URL */ }
  return { fileKey: m[2] || m[1], nodeId };
}

const box = (n) => n?.absoluteBoundingBox || null;
const TOP_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

function textsOf(node) {
  const out = [];
  (function walk(x) {
    if (x.visible === false) return;                       // hidden layers aren't part of the design
    if (x.type === 'TEXT') out.push({ id: x.id, name: x.name, text: x.characters || '', box: box(x) });
    for (const c of x.children || []) walk(c);
  })(node);
  return out;
}

/**
 * The linked node → the frames to check. A FRAME is checked as itself; a SECTION/GROUP → its top-level frames
 * (size variants of the same task); a CANVAS (a whole page) → refused, the task should link its own section.
 */
function framesOf(node) {
  if (!node) return { kind: 'missing', frames: [] };
  if (node.type === 'CANVAS' || node.type === 'DOCUMENT') return { kind: 'page', frames: [] };
  const tops = TOP_TYPES.has(node.type) ? [node] : (node.children || []).filter(c => TOP_TYPES.has(c.type) && c.visible !== false);
  const frames = tops.map(f => {
    const b = box(f);
    return { id: f.id, name: f.name, width: b?.width || null, height: b?.height || null, size: L.sizeFromPixels(b?.width, b?.height), box: b, texts: textsOf(f) };
  });
  return { kind: node.type.toLowerCase(), name: node.name, frames };
}

/** Same copy across sizes? Normalised, concatenated text per frame (copy may be split over several layers). */
const normCopy = (frame) => frame.texts.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** A content hash: only what the Captain checks (text + frame sizes), so unrelated edits elsewhere in the file don't re-trigger. */
function contentHash(frames) {
  const sig = frames.map(f => [f.id, Math.round(f.width || 0), Math.round(f.height || 0), f.texts.map(t => [t.id, t.text])]);
  return crypto.createHash('sha1').update(JSON.stringify(sig)).digest('hex').slice(0, 16);
}

async function file(key, { depth = 1 } = {}) { return api(`/v1/files/${key}?depth=${depth}`); }
async function node(key, nodeId, { version = null } = {}) {
  const q = new URLSearchParams({ ids: nodeId });
  if (version) q.set('version', version);
  const d = await api(`/v1/files/${key}/nodes?${q}`);
  return { doc: d?.nodes?.[nodeId]?.document || null, fileName: d?.name, lastModified: d?.lastModified, version: d?.version };
}
async function renderUrls(key, ids, { scale = 1, format = 'png', version = null } = {}) {
  const q = new URLSearchParams({ ids: ids.join(','), scale: String(scale), format });
  if (version) q.set('version', version);
  return (await api(`/v1/images/${key}?${q}`, { timeoutMs: 120000 }))?.images || {};
}
async function versions(key) { return (await api(`/v1/files/${key}/versions`))?.versions || []; }

/**
 * A file's version history back to `sinceIso`, newest first. Follows Figma's own pagination.next_page links —
 * the `before=<id>` cursor is ignored by the API (it returned page 1 again and again).
 */
async function versionsSince(key, sinceIso, { maxPages = 400, pauseMs = 500 } = {}) {
  const out = [];
  const seen = new Set();
  let path = `/v1/files/${key}/versions?page_size=50`;
  for (let page = 0; page < maxPages && path; page++) {
    const d = await api(path).catch(() => null);
    const vs = d?.versions || [];
    let fresh = 0;
    for (const v of vs) if (!seen.has(v.id)) { seen.add(v.id); fresh++; out.push({ id: v.id, at: v.created_at, label: v.label || null, by: v.user?.handle || null }); }
    if (!vs.length || !fresh || String(vs[vs.length - 1].created_at) < String(sinceIso)) break;
    const next = d?.pagination?.next_page;
    path = next ? next.replace(/^https?:\/\/[^/]+/, '') : null;
    if (pauseMs) await sleep(pauseMs);
  }
  return out.sort((x, y) => String(y.at).localeCompare(String(x.at)));
}
async function comments(key) { return (await api(`/v1/files/${key}/comments`))?.comments || []; }

/** Pin a comment to a layer: client_meta { node_id, node_offset } puts it exactly on the text. */
async function postComment(key, { message, nodeId, offset = { x: 8, y: 8 } }) {
  return api(`/v1/files/${key}/comments`, { method: 'POST', body: { message, client_meta: { node_id: nodeId, node_offset: offset } } });
}

async function me() { return api('/v1/me'); }
async function status() {
  if (!configured()) return { configured: false, connected: false };
  try { const m = await me(); return { configured: true, connected: true, user_name: m?.handle || null }; } catch (e) { return { configured: true, connected: false, error: e.message }; }
}

module.exports = { configured, api, parseUrl, framesOf, textsOf, normCopy, contentHash, file, node, renderUrls, versions, versionsSince, comments, postComment, me, status };
