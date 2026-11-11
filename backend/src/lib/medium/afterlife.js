/**
 * MEDIUM ← AFTERLIFE (ranks): winners per lane / product / format since 1 Jan 2025, read from AFTERLIFE's export API.
 * The winners endpoint (`/api/export/winners`, spec §5.3) is built in the AFTERLIFE repo; until it is live this returns
 * { available: false } and every number in Medium shows as [AfterLife] — never as zero, never invented.
 */
const configured = () => !!(process.env.AFTERLIFE_URL && process.env.AFTERLIFE_EXPORT_TOKEN);
let down = { until: 0, reason: null };

function headers() {
  const h = { 'X-Export-Token': process.env.AFTERLIFE_EXPORT_TOKEN, Accept: 'application/json' };
  if (process.env.AFTERLIFE_BASIC_AUTH) h.Authorization = `Basic ${Buffer.from(process.env.AFTERLIFE_BASIC_AUTH).toString('base64')}`;
  return h;
}

async function call(path) {
  if (!configured()) return { available: false, reason: 'AFTERLIFE is not connected to CP' };
  if (Date.now() < down.until) return { available: false, reason: down.reason };
  try {
    const r = await fetch(`${process.env.AFTERLIFE_URL.replace(/\/$/, '')}${path}`, { headers: headers(), signal: AbortSignal.timeout(30000) });
    if (r.status === 404) { down = { until: Date.now() + 10 * 60000, reason: "AFTERLIFE's winners endpoint isn't live yet" }; return { available: false, reason: down.reason }; }
    if (!r.ok) return { available: false, reason: `AFTERLIFE ${r.status}` };
    return { available: true, ...(await r.json()) };
  } catch (e) { return { available: false, reason: `AFTERLIFE unreachable (${e.message})` }; }
}

/** { available, winners: [{ key, label, product, lane, format, percentile, spend, roas, hook, monday_item_id, ... }] } */
async function winners({ lane = null, product = null, format = null, since = '2025-01-01', limit = 20 } = {}) {
  const q = new URLSearchParams({ since, limit: String(limit) });
  if (lane) q.set('lane', lane);
  if (product) q.set('product', product);
  if (format) q.set('format', format === 'design' ? 'static' : format);
  return call(`/api/export/winners?${q}`);
}

/** One AfterLife media file (a creative's thumbnail, e.g. "/media/thumbs/…") as base64 — for reading a static's headline. */
async function media(p) {
  if (!configured()) return { ok: false, reason: 'AFTERLIFE is not connected to CP' };
  if (!/^\/media\/[\w./-]+$/.test(String(p || '')) || String(p).includes('..')) return { ok: false, reason: 'Not an AfterLife media path' };
  try {
    const r = await fetch(`${process.env.AFTERLIFE_URL.replace(/\/$/, '')}${p}`, { headers: { ...headers(), Accept: 'image/*' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 401 || r.status === 403) return { ok: false, reason: "AfterLife doesn't share images with CP yet" };
    if (!r.ok) return { ok: false, reason: `AfterLife image ${r.status}` };
    const type = String(r.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return { ok: false, reason: `Not an image (${type || 'unknown'})` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) return { ok: false, reason: 'Image too large' };
    return { ok: true, media_type: type, data: buf.toString('base64') };
  } catch (e) { return { ok: false, reason: `AfterLife unreachable (${e.message})` }; }
}

async function status() {
  if (!configured()) return { connected: false, reason: 'AFTERLIFE is not connected to CP' };
  const r = await winners({ limit: 1 });
  return { connected: !!r.available, reason: r.available ? null : r.reason };
}

module.exports = { configured, winners, media, status };
