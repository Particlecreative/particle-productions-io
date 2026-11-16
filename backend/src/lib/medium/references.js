/**
 * MEDIUM — the reference a brief is written from (Tomer, 16 Nov 2026: "when briefs are written by reference, make
 * sure it's uploaded to Monday, and show the reference in HQ").
 *
 *   • the winner a move builds on (REFRESH / ITERATE / TRANSFER / HEADLINE_HOOK …): request.source_key → the
 *     Upspring row in evidence.winners — its original image (1200 px, not a thumbnail) and, for a video, the video;
 *   • Freeform references: images, Upspring ads (with their media), Monday tickets and web pages (links).
 *
 * referencesOf() is pure (tested) and feeds the brief view; download() fetches the media for the Monday ticket.
 */

const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_VIDEO = 90 * 1024 * 1024;
// media hosts we fetch directly (Upspring's own storage, Meta's CDN) — anything else goes through the SSRF-safe fetch
const TRUSTED = /(^|\.)storage\.googleapis\.com$|(^|\.)upspring\.ai$|(^|\.)fbcdn\.net$/i;

const linkFor = (pattern, id) => (pattern && /\{id\}/.test(pattern) && id ? pattern.replace('{id}', encodeURIComponent(id)) : null);
const fileLabel = (url) => { try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'Reference image'; } catch { return 'Reference image'; } };
const num = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

/** The brief's references, best first: [{ kind, label, image, video, link, format, stats, headline, note }]. */
function referencesOf(b, { upspringLink = '' } = {}) {
  const req = b?.request || {};
  const ev = b?.evidence || {};
  const out = [];
  const winners = Array.isArray(ev.winners) ? ev.winners : [];
  const w = req.source_key ? winners.find(x => String(x.key) === String(req.source_key)) : null;
  if (w && (w.image || w.video)) {
    out.push({
      kind: 'winner', key: String(w.key), label: w.label || 'The winner it builds on', image: w.image || null, video: w.video || null,
      format: w.format || null, link: linkFor(upspringLink, w.key),
      headline: w.on_image || (w.headlines || [])[0] || null,
      stats: { roas: num(w.roas), spend: num(w.spend), purchases: num(w.purchases), percentile: num(w.percentile), account: w.account || null, campaign: w.campaign || null },
    });
  }
  for (const r of Array.isArray(ev.references) ? ev.references : []) {
    const url = String(r?.url || '');
    const web = /^https?:\/\//i.test(url) ? url : null;
    if (r.kind === 'image' && web) out.push({ kind: 'image', label: r.label || fileLabel(url), image: url, video: null, link: url });
    else if (r.kind === 'upspring') out.push({ kind: 'upspring', label: r.label || 'Upspring ad', image: r.image || null, video: r.video || null, link: r.link || web, format: r.video ? 'video' : r.image ? 'static' : null });
    else if (r.kind === 'monday' || r.kind === 'web') out.push({ kind: r.kind, label: r.label || url, image: null, video: null, link: web });
  }
  return out.slice(0, 8);
}

/** The ones that become files on the Monday ticket. */
const attachable = (refs) => (refs || []).filter(r => r.image || r.video).slice(0, 4);

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
/** "Reference 1 — Gravite Deodorant product shoot….jpg" (pure — tested) */
function fileName(i, label, mime, url) {
  const ext = EXT[mime] || (String(url || '').match(/\.(jpe?g|png|webp|gif|mp4|mov|webm)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const base = String(label || 'reference').replace(/\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i, '').replace(/[^\p{L}\p{N} &()+,.'_-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'reference';
  return `Reference ${i} — ${base}.${ext}`;
}

async function fetchMedia(url, maxBytes) {
  const host = new URL(url).hostname;
  if (!TRUSTED.test(host)) return require('../studio/sources').safeFetch(url, { maxBytes });
  const r = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CP-Medium/1.0)' } });
  if (!r.ok) throw new Error(`the file answered ${r.status}`);
  if (Number(r.headers.get('content-length') || 0) > maxBytes) throw new Error(`too large (${Math.round(Number(r.headers.get('content-length')) / 1048576)} MB)`);
  const chunks = [];
  let total = 0;
  for await (const c of r.body) { total += c.length; if (total > maxBytes) throw new Error('too large'); chunks.push(c); }
  return { buffer: Buffer.concat(chunks), mime: (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
}

/**
 * The reference media as Monday files: a video's video (≤ 90 MB, else its still), an image's original.
 * → { files: [{ name, mime, buffer, ref }], failed: [why] }
 */
async function download(refs) {
  const files = [], failed = [];
  let i = 0;
  for (const ref of attachable(refs)) {
    i += 1;
    const tries = [ref.video && ['video', ref.video, MAX_VIDEO], ref.image && ['image', ref.image, MAX_IMAGE]].filter(Boolean);
    let got = null, why = null;
    for (const [type, url, max] of tries) {
      try {
        const f = await fetchMedia(url, max);
        if (!f.mime.startsWith(`${type}/`) && !(type === 'image' && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) throw new Error(`not an ${type} (${f.mime || 'unknown type'})`);
        got = { name: fileName(i, ref.label, f.mime, url), mime: f.mime || (type === 'video' ? 'video/mp4' : 'image/jpeg'), buffer: f.buffer, ref };
        break;
      } catch (e) { why = `${type}: ${e.message}`; }
    }
    if (got) files.push(got); else failed.push(`${ref.label} (${why || 'no file'})`);
  }
  return { files, failed };
}

module.exports = { referencesOf, attachable, fileName, download, linkFor };
