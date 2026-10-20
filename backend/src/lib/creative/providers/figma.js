/**
 * Figma provider (read-only personal access token in FIGMA_ACCESS_TOKEN, scope file_content:read).
 * Designers' work-in-progress lives in Figma; finished work lives in Dropbox — media.js only reaches
 * for Figma when a design ticket isn't Completed.
 *
 * Entries are the top-level frames of the linked node (or of the file's first page).
 * Image URLs from /v1/images expire — never stored; thumbnails are cached as bytes by media.js.
 */
const API = 'https://api.figma.com/v1';
const MAX_FRAMES = 24;

const configured = () => !!process.env.FIGMA_ACCESS_TOKEN;

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'X-Figma-Token': process.env.FIGMA_ACCESS_TOKEN },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`Figma ${res.status}: ${data?.err || data?.message || 'request failed'}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** figma.com/file|design|proto/<key>/...?node-id=1-23 → { key, nodeId } */
function parseUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)figma\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const raw = u.searchParams.get('node-id');
    return { key: m[1], nodeId: raw ? decodeURIComponent(raw).replace('-', ':') : null };
  } catch { return null; }
}

const FRAME_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'INSTANCE', 'GROUP']);

function framesOf(node) {
  const kids = node?.children || [];
  const frames = kids.filter(c => FRAME_TYPES.has(c.type) && c.visible !== false);
  // A SECTION usually wraps the real artboards — go one level deeper
  const flat = [];
  for (const f of frames) {
    if (f.type === 'SECTION' && f.children?.length) flat.push(...f.children.filter(c => FRAME_TYPES.has(c.type) && c.visible !== false));
    else flat.push(f);
  }
  return flat.slice(0, MAX_FRAMES);
}

/** Listing for a Figma link → { entries, resolved } */
async function listing(url) {
  if (!configured()) return { entries: [], error: 'Figma is not connected (needs a read-only access token)' };
  const p = parseUrl(url);
  if (!p) return { entries: [], unresolvable: true };
  let frames = [];
  if (p.nodeId) {
    const d = await api(`/files/${p.key}/nodes?ids=${encodeURIComponent(p.nodeId)}&depth=2`);
    const doc = d?.nodes?.[p.nodeId]?.document;
    frames = doc ? (FRAME_TYPES.has(doc.type) && !doc.children?.some(c => FRAME_TYPES.has(c.type)) ? [doc] : framesOf(doc)) : [];
  } else {
    const d = await api(`/files/${p.key}?depth=2`);
    const page = d?.document?.children?.[0];
    frames = framesOf(page);
  }
  return {
    entries: frames.map(f => ({
      key: `${p.key}~${f.id}`,
      name: f.name,
      ext: 'png',
      kind: 'image',
      size: null,
      // Work in progress changes daily: the date makes cached thumbnails refresh once a day
      modified: new Date().toISOString().slice(0, 10),
      version: null,
      preferred: true,
    })),
  };
}

/** Fresh rendered-image URL for a frame key "<fileKey>~<nodeId>". */
async function imageUrl(key, { scale = 0.5 } = {}) {
  const [fileKey, nodeId] = String(key).split('~');
  if (!fileKey || !nodeId) return null;
  const d = await api(`/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=jpg&scale=${scale}`);
  return d?.images?.[nodeId] || null;
}

async function health() {
  if (!configured()) return { configured: false, connected: false };
  try {
    const me = await api('/me');
    return { configured: true, connected: true, account: me?.handle || me?.email || null };
  } catch (e) {
    return { configured: true, connected: false, error: e.message };
  }
}

module.exports = { configured, parseUrl, listing, imageUrl, health };
