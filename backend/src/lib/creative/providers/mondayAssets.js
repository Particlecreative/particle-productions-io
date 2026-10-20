/**
 * Monday file-column assets (finished statics are often attached to design tickets).
 * public_url is valid for ~1h — never stored; bytes are cached by media.js.
 */
const { assetsByIds } = require('../../monday');

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'm4v', 'webm']);

function kindOf(ext) {
  const e = String(ext || '').replace(/^\./, '').toLowerCase();
  if (IMAGE_EXT.has(e)) return 'image';
  if (VIDEO_EXT.has(e)) return 'video';
  if (e === 'pdf') return 'pdf';
  return 'other';
}

async function asset(assetId) {
  const [a] = await assetsByIds([assetId]);
  if (!a) return null;
  return { ...a, kind: kindOf(a.file_extension) };
}

async function listing(ref) {
  const a = await asset(ref.asset_id);
  if (!a) return [];
  return [{ key: '_', name: a.name, ext: String(a.file_extension || '').replace(/^\./, ''), kind: a.kind, size: a.file_size || null, preferred: true }];
}

module.exports = { asset, listing, kindOf };
