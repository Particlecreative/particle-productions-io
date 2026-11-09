/**
 * AFTERLIFE (afterlife.particle-creative.cloud) — Particle's creative-performance platform: every Meta ad tied to
 * its Monday file and maker. The team deck reads one week of it from AFTERLIFE's export API.
 * Env: AFTERLIFE_URL, AFTERLIFE_EXPORT_TOKEN, and AFTERLIFE_BASIC_AUTH ("user:password") while the site
 * still sits behind nginx basic auth. Not configured → no performance slides (they hide themselves).
 */
const W = require('./week');

const configured = () => !!(process.env.AFTERLIFE_URL && process.env.AFTERLIFE_EXPORT_TOKEN);

function headers() {
  const h = { 'X-Export-Token': process.env.AFTERLIFE_EXPORT_TOKEN, Accept: 'application/json' };
  if (process.env.AFTERLIFE_BASIC_AUTH) h.Authorization = `Basic ${Buffer.from(process.env.AFTERLIFE_BASIC_AUTH).toString('base64')}`;
  return h;
}

async function call(path, { timeoutMs = 45000 } = {}) {
  const r = await fetch(`${process.env.AFTERLIFE_URL.replace(/\/$/, '')}${path}`, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`AFTERLIFE ${r.status}`);
  return r.json();
}

/** One review week (Sun → Sat) of Meta performance, credited to makers — null when AFTERLIFE isn't connected. */
async function weekPerformance({ weekStart }) {
  if (!configured()) return null;
  return call(`/api/export/team-week?from=${weekStart}&to=${W.addDays(weekStart, 6)}`);
}

/** A creative's thumbnail bytes by its AFTERLIFE media path (cached by the deck's media layer). */
async function thumbnail(path) {
  if (!configured()) throw new Error('AFTERLIFE is not connected');
  const r = await fetch(`${process.env.AFTERLIFE_URL.replace(/\/$/, '')}/api/export/thumb?path=${encodeURIComponent(path)}`, { headers: headers(), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`AFTERLIFE thumbnail ${r.status}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg' };
}

module.exports = { configured, weekPerformance, thumbnail };
