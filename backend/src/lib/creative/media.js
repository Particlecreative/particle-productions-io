/**
 * Creative Weekly media layer.
 *
 * - Snapshot stores media REFS (kind + source url / asset id), never expiring URLs.
 * - Browsers can't send the JWT on <img>/<video>, so every report response carries a
 *   report-scoped media token (HMAC, 12h; public tokens are bound to the current share token).
 *   URL: /api/creative-reports/m/:reportId/:refId/:key/:variant?mt=TOKEN
 *     refId = snapshot media ref id, or "item" (key = ticket id → best auto cover)
 *     key   = file key inside the ref listing ("_" for single-file refs)
 *     variant = thumb | poster (cached bytes) | play | full (302 → freshly resolved URL)
 * - Every request is re-checked against the report's allowlist (no open proxy).
 */
const crypto = require('crypto');
const db = require('../../db');
const dbx = require('./providers/dropbox');
const mondayAssets = require('./providers/mondayAssets');
const frameio = require('./providers/frameio');
const figma = require('./providers/figma');
const ff = require('./providers/ffmpeg');

const LISTING_TTL_MS = 15 * 60 * 1000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_THUMB_BYTES = 300 * 1024;

const secret = () => process.env.CREATIVE_MEDIA_SECRET || `${process.env.JWT_SECRET || 'dev'}:creative-media`;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const shareTag = (shareToken) => (shareToken ? sha256(shareToken).slice(0, 10) : null);

// ── Media tokens ────────────────────────────────────────────────────────────
function mediaToken({ reportId, audience = 'internal', shareToken = null, shareExpiresAt = null }) {
  let exp = Date.now() + TOKEN_TTL_MS;
  if (shareExpiresAt) exp = Math.min(exp, new Date(shareExpiresAt).getTime());
  const payload = { r: String(reportId), a: audience === 'public' ? 'p' : 'i', e: exp };
  if (payload.a === 'p') payload.st = shareTag(shareToken);
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return { token: `${body}.${sig}`, expires_at: new Date(exp).toISOString() };
}

function verifyMediaToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p.e !== 'number' || p.e < Date.now()) return null;
  return { reportId: p.r, audience: p.a === 'p' ? 'public' : 'internal', shareTag: p.st || null, exp: p.e };
}

// ── Listings ────────────────────────────────────────────────────────────────
const refKey = (ref) => sha256(`${ref.kind}|${ref.url || ref.asset_id}`).slice(0, 32);

async function readIndex(key) {
  try {
    const { rows } = await db.query('SELECT listing, error, resolved_at FROM creative_media_index WHERE ref_key = $1', [key]);
    return rows[0] || null;
  } catch { return null; }
}
async function writeIndex(key, ref, listing, error) {
  try {
    await db.query(
      `INSERT INTO creative_media_index (ref_key, kind, source_url, listing, error, resolved_at) VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (ref_key) DO UPDATE SET listing = EXCLUDED.listing, error = EXCLUDED.error, resolved_at = NOW()`,
      [key, ref.kind, ref.url || ref.asset_id || null, JSON.stringify(listing || []), error || null]
    );
  } catch { /* best-effort */ }
}

/**
 * Files available behind a media ref → { entries, error, resolved }
 * entries: [{ key, name, kind: image|video|pdf|other, ext, size, modified, version, preferred }]
 */
async function getListing(ref, { force = false } = {}) {
  if (!ref) return { entries: [], error: 'unknown ref' };
  const key = refKey(ref);
  if (!force) {
    const hit = await readIndex(key);
    if (hit && Date.now() - new Date(hit.resolved_at).getTime() < LISTING_TTL_MS) return { entries: hit.listing || [], error: hit.error || null };
  }
  let entries = [];
  let error = null;
  let resolved = null;
  try {
    switch (ref.kind) {
      case 'dropbox_folder': entries = await dbx.listSharedFolder(ref.url); break;
      case 'dropbox_file': entries = await dbx.sharedFileEntry(ref.url); break;
      case 'monday_asset': entries = await mondayAssets.listing(ref); break;
      case 'frameio': {
        const r = await frameio.listing(ref.url);
        entries = r.entries;
        resolved = r.resolved || null;
        if (r.unresolvable) error = 'Frame.io link could not be resolved to files';
        break;
      }
      case 'figma': {
        const r = await figma.listing(ref.url);
        entries = r.entries || [];
        if (r.error) error = r.error;
        else if (r.unresolvable) error = 'Figma link could not be read';
        break;
      }
      default: entries = [];
    }
  } catch (e) {
    error = e.code === 'NOT_CONNECTED' ? 'Frame.io is not connected' : e.message;
  }
  await writeIndex(key, ref, entries, error);
  return { entries, error, resolved };
}

// ── Auto cover per ticket ───────────────────────────────────────────────────
const autoCache = new Map(); // itemId|refsHash → { at, pick }

const COMPLETED_RE = /^(completed|upload complete)$/i;

/**
 * Best visual for a ticket.
 *   Design, Completed      → Dropbox finals, then Figma
 *   Design, not Completed  → Figma (work in progress lives there), then Dropbox
 *   Video                  → Frame.io, then Dropbox (playable formats first)
 * Monday file attachments are briefs/references — never auto-picked (still choosable in the picker).
 */
async function autoPick(item, mediaRefs) {
  const refs = (item.media_refs || []).map(id => ({ id, ...mediaRefs[id] })).filter(r => r.kind);
  const completed = COMPLETED_RE.test(item.status?.label || '');
  const order = item.board === 'design' ? (completed ? ['dropbox', 'figma'] : ['figma', 'dropbox']) : ['frameio', 'dropbox'];
  const cacheKey = `${item.id}|${order.join('>')}|${refs.map(r => r.id).join(',')}`;
  const hit = autoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LISTING_TTL_MS) return hit.pick;

  const tryRefs = {
    frameio: async () => {
      for (const r of refs.filter(x => x.kind === 'frameio')) {
        const { entries } = await getListing(r);
        const e = entries.find(x => x.kind === 'video' || x.kind === 'image');
        if (e) return { refId: r.id, key: e.key, kind: e.kind, source: 'frameio' };
      }
      return null;
    },
    figma: async () => {
      if (!figma.configured()) return null;
      for (const r of refs.filter(x => x.kind === 'figma')) {
        const { entries } = await getListing(r);
        if (entries[0]) return { refId: r.id, key: entries[0].key, kind: 'image', source: 'figma' };
      }
      return null;
    },
    dropbox: async () => {
      for (const r of refs.filter(x => x.kind === 'dropbox_folder' || x.kind === 'dropbox_file')) {
        const { entries } = await getListing(r);
        const img = entries.find(x => x.kind === 'image' && dbx.THUMBABLE.has(x.ext));
        const vid = entries.find(x => x.kind === 'video' && ['mp4', 'm4v', 'webm'].includes(x.ext)) || entries.find(x => x.kind === 'video');
        const e = item.board === 'video' ? (vid || img) : (img || vid);
        if (e) return { refId: r.id, key: e.key, kind: e.kind, source: 'dropbox' };
      }
      return null;
    },
  };
  let pick = null;
  for (const src of order) {
    pick = await tryRefs[src]();
    if (pick) break;
  }
  autoCache.set(cacheKey, { at: Date.now(), pick });
  return pick;
}

// ── Bytes cache ─────────────────────────────────────────────────────────────
async function cacheGet(cacheKey) {
  try {
    const { rows } = await db.query(
      `UPDATE creative_media_cache SET last_access_at = NOW()
         WHERE cache_key = $1 AND last_access_at < NOW() - INTERVAL '1 day'
       RETURNING content_type, bytes`, [cacheKey]);
    if (rows[0]) return rows[0];
    const r2 = await db.query('SELECT content_type, bytes FROM creative_media_cache WHERE cache_key = $1', [cacheKey]);
    return r2.rows[0] || null;
  } catch { return null; }
}
async function cachePut(cacheKey, provider, contentType, bytes) {
  try {
    await db.query(
      `INSERT INTO creative_media_cache (cache_key, provider, content_type, bytes, size_bytes) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (cache_key) DO NOTHING`,
      [cacheKey, provider, contentType, bytes, bytes.length]
    );
  } catch { /* best-effort */ }
}

// Limit concurrent thumbnail generation; remember failures briefly
let genInFlight = 0;
const genWaiters = [];
async function withGenSlot(fn) {
  if (genInFlight >= 4) await new Promise(r => genWaiters.push(r));
  genInFlight++;
  try { return await fn(); } finally { genInFlight--; const n = genWaiters.shift(); if (n) n(); }
}
const failures = new Map(); // cacheKey → at
const FAILURE_TTL_MS = 10 * 60 * 1000;

async function entryFor(ref, key) {
  if (key === '_' || ref.kind === 'monday_asset') {
    const { entries } = await getListing(ref);
    return entries[0] || null;
  }
  const { entries } = await getListing(ref);
  const hit = entries.find(e => e.key === key);
  if (hit) return hit;
  if (ref.kind === 'dropbox_folder') {
    // Listing may have rotated; trust the key (base64url path)
    const p = dbx.unb64url(key);
    const name = p.split('/').pop();
    return { key, path: p, name, ext: dbx.extOf(name), kind: dbx.kindOf(name) };
  }
  if (ref.kind === 'frameio') return { key, kind: 'video' };
  if (ref.kind === 'figma') return { key, kind: 'image', modified: new Date().toISOString().slice(0, 10) };
  return null;
}

async function produceThumb(ref, key, entry) {
  if (ref.kind === 'dropbox_folder' || ref.kind === 'dropbox_file') {
    const relPath = ref.kind === 'dropbox_file' ? '' : (entry.path || dbx.unb64url(key));
    if (entry.kind === 'image' && dbx.THUMBABLE.has(entry.ext)) return { type: 'image/jpeg', bytes: await dbx.thumbnail(ref.url, relPath) };
    if (entry.kind === 'video') {
      // Team-space files often can't get a temporary link; the shared-link download URL is range-capable,
      // so ffmpeg can seek straight to a frame without downloading the whole file.
      const src = (await dbx.temporaryLink(ref.url, relPath)) || (await dbx.sharedLinkFileUrl(ref.url, relPath));
      if (!src) return null;
      return { type: 'image/jpeg', bytes: await ff.posterFromUrl(src) };
    }
    return null;
  }
  if (ref.kind === 'monday_asset') {
    const a = await mondayAssets.asset(ref.asset_id);
    if (!a?.public_url) return null;
    if (a.kind === 'video') return { type: 'image/jpeg', bytes: await ff.posterFromUrl(a.public_url) };
    if (a.kind !== 'image') return null;
    const r = await fetch(a.public_url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const raw = Buffer.from(await r.arrayBuffer());
    if (raw.length <= MAX_THUMB_BYTES) return { type: r.headers.get('content-type') || 'image/jpeg', bytes: raw };
    return { type: 'image/jpeg', bytes: await ff.downscaleImage(raw) };
  }
  if (ref.kind === 'figma') {
    const u = await figma.imageUrl(key, { scale: 0.5 });
    if (!u) return null;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const raw = Buffer.from(await r.arrayBuffer());
    if (raw.length <= MAX_THUMB_BYTES) return { type: r.headers.get('content-type') || 'image/jpeg', bytes: raw };
    return { type: 'image/jpeg', bytes: await ff.downscaleImage(raw) };
  }
  if (ref.kind === 'frameio') {
    const u = await frameio.fileMediaUrl(key, 'thumb');
    if (!u) return null;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const raw = Buffer.from(await r.arrayBuffer());
    if (raw.length <= MAX_THUMB_BYTES) return { type: r.headers.get('content-type') || 'image/jpeg', bytes: raw };
    return { type: 'image/jpeg', bytes: await ff.downscaleImage(raw) };
  }
  return null;
}

async function thumbBytes(ref, key) {
  const entry = await entryFor(ref, key);
  if (!entry) return null;
  const version = entry.rev || entry.hash || entry.modified || entry.version || '';
  const cacheKey = sha256(`${ref.kind}|${ref.url || ref.asset_id}|${key}|thumb|${version}`);
  const hit = await cacheGet(cacheKey);
  if (hit) return { type: hit.content_type, bytes: hit.bytes, cached: true };
  const failedAt = failures.get(cacheKey);
  if (failedAt && Date.now() - failedAt < FAILURE_TTL_MS) return null;
  try {
    const out = await withGenSlot(() => produceThumb(ref, key, entry));
    if (!out?.bytes?.length) { failures.set(cacheKey, Date.now()); return null; }
    await cachePut(cacheKey, ref.kind, out.type, out.bytes);
    return out;
  } catch (e) {
    failures.set(cacheKey, Date.now());
    console.warn(`[creative media] thumb failed (${ref.kind}):`, e.message);
    return null;
  }
}

/**
 * Fresh URL for playback / full size. Returns a string (302 target) or { proxy, contentType } when the
 * bytes must be streamed through the server (the source URL carries a credential).
 */
async function freshUrl(ref, key, variant) {
  if (ref.kind === 'dropbox_folder' || ref.kind === 'dropbox_file') {
    const relPath = ref.kind === 'dropbox_file' || key === '_' ? '' : dbx.unb64url(key);
    const tl = await dbx.temporaryLink(ref.url, relPath);
    if (tl) return tl;
    const proxy = await dbx.sharedLinkFileUrl(ref.url, relPath);
    if (!proxy) return null;
    const name = relPath ? relPath.split('/').pop() : ((await entryFor(ref, key))?.name || '');
    return { proxy, contentType: dbx.mimeOf(name) };
  }
  if (ref.kind === 'monday_asset') return (await mondayAssets.asset(ref.asset_id))?.public_url || null;
  if (ref.kind === 'frameio') return frameio.fileMediaUrl(key, variant === 'play' ? 'play' : 'full');
  if (ref.kind === 'figma') return figma.imageUrl(key, { scale: 2 });
  return null;
}

/** Prune the bytes cache: drop entries unused for 120 days, then trim to ~1 GB. */
async function pruneCache() {
  const r1 = await db.query("DELETE FROM creative_media_cache WHERE last_access_at < NOW() - INTERVAL '120 days'");
  const { rows } = await db.query('SELECT COALESCE(SUM(size_bytes),0)::bigint AS total FROM creative_media_cache');
  let trimmed = 0;
  const cap = 1024 * 1024 * 1024;
  if (Number(rows[0].total) > cap) {
    const r2 = await db.query(
      `DELETE FROM creative_media_cache WHERE cache_key IN (
         SELECT cache_key FROM (
           SELECT cache_key, SUM(size_bytes) OVER (ORDER BY last_access_at DESC) AS running FROM creative_media_cache
         ) t WHERE running > $1)`, [cap]);
    trimmed = r2.rowCount;
  }
  await db.query("DELETE FROM creative_media_index WHERE resolved_at < NOW() - INTERVAL '30 days'").catch(() => null);
  return { expired: r1.rowCount, trimmed };
}

module.exports = {
  mediaToken, verifyMediaToken, shareTag, getListing, autoPick, thumbBytes, freshUrl, pruneCache, refKey,
};
