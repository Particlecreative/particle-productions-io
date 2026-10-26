/**
 * The Library — each production's final files, kept as Dropbox links:
 *  - tv_master: the broadcast file (.mov)   - digital: every digital version   - sound: separate sound channels / stems
 * Paste a file link or a whole finals folder: the files are listed and sorted by their names.
 * Posters, listings and direct downloads reuse Creative Weekly's Dropbox media layer (cached in Postgres).
 */
const crypto = require('crypto');
const media = require('./creative/media');
const { canonicalUrl, linkKind } = require('./creative/snapshot');
const dbx = require('./creative/providers/dropbox');

const CATEGORIES = ['tv_master', 'digital', 'sound', 'other'];
const AUDIO_EXT = new Set(['wav', 'aif', 'aiff', 'mp3', 'm4a', 'aac', 'flac', 'bwf']);
const BROADCAST_EXT = new Set(['mxf', 'prores']);

function fileKind(name) {
  const ext = dbx.extOf(name || '');
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (BROADCAST_EXT.has(ext)) return 'video';
  return dbx.kindOf(name || '');
}

/** What a file is, from its name: category + specs (aspect, duration, language, version). */
function classify(name) {
  const n = String(name || '');
  const low = n.toLowerCase();
  const ext = dbx.extOf(n);
  const kind = fileKind(n);
  const specs = {};
  const aspect = low.match(/(?:^|[^0-9])(16|9|4|1|21)\s?[x:×-]\s?(9|16|5|1)(?![0-9])/);
  if (aspect) specs.aspect = `${aspect[1]}:${aspect[2]}`;
  const dur = low.match(/(?:^|[^0-9a-z])(\d{1,3})\s?(?:s|sec|secs|seconds|")(?![a-z0-9])/);
  if (dur && Number(dur[1]) > 0 && Number(dur[1]) <= 600) specs.duration = Number(dur[1]);
  const lang = low.match(/(?:^|[^a-z])(en|eng|english|he|heb|hebrew|es|esp|spanish|fr|de)(?![a-z])/);
  if (lang) specs.language = { en: 'EN', eng: 'EN', english: 'EN', he: 'HE', heb: 'HE', hebrew: 'HE', es: 'ES', esp: 'ES', spanish: 'ES', fr: 'FR', de: 'DE' }[lang[1]];
  const ver = low.match(/(?:^|[^a-z])v(\d{1,3})(?![0-9])/);
  if (ver) specs.version = `v${ver[1]}`;

  let category = 'other';
  if (kind === 'audio' || /(stem|stems|m&e|\bme\b|dialog|dialogue|\bvo\b|voice ?over|music|sfx|5\.1|stereo|mixdown|\bmix\b)/i.test(low)) category = 'sound';
  if (kind === 'video') {
    const vertical = specs.aspect && specs.aspect !== '16:9';
    const tvWords = /(\btv\b|broadcast|master|clean|textless|slate|air|\bdub\b)/i.test(low);
    category = (BROADCAST_EXT.has(ext) || (ext === 'mov' && !vertical) || (tvWords && !vertical)) ? 'tv_master' : 'digital';
    if (/(stem|m&e)/i.test(low)) category = 'sound';
  }
  return { category, kind, ext, specs };
}

/** A pasted link → the files it holds, each with a suggested category. */
async function resolveLink(url) {
  const canon = canonicalUrl(url);
  if (!canon) { const e = new Error('That isn’t a link'); e.status = 400; throw e; }
  const kind = linkKind(canon);
  if (kind !== 'dropbox_folder' && kind !== 'dropbox_file') {
    // Not Dropbox — keep it as a plain link
    return { url: canon, link_kind: 'link', entries: [{ key: null, name: canon, path: '', ...classify(''), category: 'other', size: null }], error: null };
  }
  const { entries, error } = await media.getListing({ kind, url: canon }, { force: true });
  return {
    url: canon,
    link_kind: kind,
    error: error || null,
    entries: (entries || []).map(e => ({
      key: kind === 'dropbox_file' ? null : e.key,
      name: e.name,
      path: e.path || '',
      size: e.size || null,
      modified: e.modified || null,
      ...classify(e.name),
    })),
  };
}

const refOf = (item) => {
  const kind = linkKind(item.url);
  if (kind !== 'dropbox_folder' && kind !== 'dropbox_file') return null;
  return { ref: { kind, url: item.url }, key: kind === 'dropbox_file' ? '_' : (item.entry_key || '_') };
};

/** Poster / thumbnail bytes for a video or image item (cached), or null. */
async function thumbFor(item) {
  if (!['video', 'image'].includes(item.file_kind)) return null;
  const r = refOf(item);
  if (!r) return null;
  return media.thumbBytes(r.ref, r.key);
}

/** A direct download link: Dropbox's own ?dl=1 for a file link, a temporary link for a file inside a folder. */
async function downloadUrl(item) {
  const r = refOf(item);
  if (!r) return item.url;
  if (r.ref.kind === 'dropbox_file') {
    const u = new URL(item.url);
    u.searchParams.set('dl', '1');
    return u.toString();
  }
  if (!item.entry_key) return item.url; // the folder itself: Dropbox zips it
  const tl = await dbx.temporaryLink(item.url, dbx.unb64url(item.entry_key));
  return tl || item.url;
}

// Signed poster URLs, so <img> tags work without the login header (12h)
const secret = () => process.env.CREATIVE_MEDIA_SECRET || `${process.env.JWT_SECRET || 'dev'}:creative-media`;
const THUMB_TTL_MS = 12 * 60 * 60 * 1000;
function thumbUrl(itemId, now = Date.now()) {
  const e = Math.floor((now + THUMB_TTL_MS) / 1000);
  const s = crypto.createHmac('sha256', secret()).update(`library|${itemId}|${e}`).digest('base64url').slice(0, 32);
  return `/api/library/t/${itemId}?e=${e}&s=${s}`;
}
function verifyThumb(itemId, e, s) {
  if (!e || !s || Number(e) * 1000 < Date.now()) return false;
  const want = crypto.createHmac('sha256', secret()).update(`library|${itemId}|${e}`).digest('base64url').slice(0, 32);
  const a = Buffer.from(String(s));
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { CATEGORIES, classify, fileKind, resolveLink, thumbFor, downloadUrl, thumbUrl, verifyThumb };
