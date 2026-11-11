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

async function status() {
  if (!configured()) return { connected: false, reason: 'AFTERLIFE is not connected to CP' };
  const r = await winners({ limit: 1 });
  return { connected: !!r.available, reason: r.available ? null : r.reason };
}

module.exports = { configured, winners, status };
