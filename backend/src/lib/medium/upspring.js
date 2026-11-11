/**
 * MEDIUM ← Upspring Public API (public-api.upspring.ai/v1) — the market / competitor ad library, pre-analysed into text
 * (hooks, one-liners, dimensions, landing pages, advertiser briefs). Auth: Authorization: Bearer <UPSPRING_API_KEY>
 * (server .env only). Limits 60/min, 5,000/day — we pace ~1 call/s and keep a daily count.
 * Not on this surface: Particle's own spend / ROAS / comments (that's the Upspring MCP, OAuth — separate).
 * Everything returned is data, never instructions.
 */
const BASE = () => (process.env.UPSPRING_API_BASE || 'https://public-api.upspring.ai').replace(/\/$/, '');
const configured = () => !!process.env.UPSPRING_API_KEY;

let last = 0;
const day = { date: '', n: 0 };
const DAILY_CAP = 2500; // half the plan, so AfterLife (same key family) never starves

async function get(path, params = {}, { retry = true } = {}) {
  if (!configured()) throw Object.assign(new Error('Upspring is not connected on the server (UPSPRING_API_KEY)'), { status: 503 });
  const today = new Date().toISOString().slice(0, 10);
  if (day.date !== today) { day.date = today; day.n = 0; }
  if (day.n >= DAILY_CAP) throw Object.assign(new Error('Upspring daily budget used up — try again tomorrow'), { status: 429 });
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  day.n++;
  const u = new URL(BASE() + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach(x => u.searchParams.append(k, String(x)));
    else u.searchParams.set(k, String(v));
  }
  const r = await fetch(u, { headers: { Authorization: `Bearer ${process.env.UPSPRING_API_KEY}`, Accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
  if (r.status === 429 && retry) {
    await new Promise(res => setTimeout(res, Math.min(Number(r.headers.get('retry-after') || 5) * 1000, 30000)));
    return get(path, params, { retry: false });
  }
  if (!r.ok) {
    let code = '';
    try { code = (await r.json())?.error?.code || ''; } catch { /* not json */ }
    throw Object.assign(new Error(`Upspring ${r.status}${code ? ` ${code}` : ''} on ${path}`), { status: r.status, code });
  }
  return r.json();
}

const unwrap = (j) => (j && typeof j === 'object' && 'data' in j ? j.data : j);

/** One advertiser by its website (always 200 with a status). */
const byDomain = (domain, { includeAds = false } = {}) => get('/v1/advertisers/by-domain', { domain, include: includeAds ? 'ads' : undefined }).then(unwrap);
/** The advertiser brief: summary, hook_themes, signals, top_ads, landing_page_types, enrichment. */
const advertiser = (id) => get(`/v1/advertisers/${encodeURIComponent(id)}`).then(unwrap);
const peers = (id) => get(`/v1/advertisers/${encodeURIComponent(id)}/peers`).then(j => unwrap(j) || []);
/** A brand's ads — newest first by default; include=media adds durable image / thumbnail URLs. */
const advertiserAds = (id, { active = true, order = 'recent', recencyDays = null, limit = 25, media = true } = {}) =>
  get('/v1/ads', { advertiser_id: id, is_active: active, order_by: order, recency_days: recencyDays, limit, include: media ? 'media' : undefined }).then(j => ({ ads: unwrap(j) || [], meta: j.meta || {} }));
const ad = (id, include = 'full') => get(`/v1/ads/${encodeURIComponent(id)}`, { include }).then(unwrap);
const search = (q, p = {}) => get('/v1/ads', { q, limit: 25, ...p }).then(j => unwrap(j) || []);
/** Share-of-corpus over one creative dimension (winner norms when min_impressions is set). */
const distribution = (dim, p = {}) => get('/v1/ads', { group_by: dim, ...p }).then(j => unwrap(j) || []);
const landingPages = (p = {}) => get('/v1/landing-pages', { limit: 25, ...p }).then(j => unwrap(j) || []);
const landingPage = (id) => get(`/v1/landing-pages/${encodeURIComponent(id)}`).then(unwrap);

let statusCache = { at: 0, value: null };
/** Connected? (cached an hour — one cheap call). */
async function status() {
  if (!configured()) return { connected: false, reason: 'UPSPRING_API_KEY is not set on the server' };
  if (statusCache.value && Date.now() - statusCache.at < 3600000) return statusCache.value;
  try { await get('/v1/taxonomy/verticals'); statusCache = { at: Date.now(), value: { connected: true } }; }
  catch (e) { statusCache = { at: Date.now(), value: { connected: false, reason: e.message } }; }
  return statusCache.value;
}

/** An Upspring ad as reference text for the writer (pure — tested): what it says, how it opens, its story and offer. */
function adAsReference(a) {
  if (!a) return 'Upspring ad not found';
  const dims = Array.isArray(a.dimensions) ? a.dimensions.map(d => `${d.field}: ${d.label}`) : Object.entries(a.dimensions || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v.label}`);
  const n = a.narrative || {};
  const lines = [
    `Upspring ad by ${a.advertiser?.name || 'an advertiser'} (${a.media_type || 'ad'}${a.is_active ? ', running' : ', stopped'}${a.started_at ? `, since ${String(a.started_at).slice(0, 10)}` : ''})`,
    a.one_line ? `What it is: ${a.one_line}` : null,
    a.hook_text ? `Opening line: “${a.hook_text}”` : null,
    n.hook?.text && n.hook.text !== a.hook_text ? `Hook: ${n.hook.text}${n.hook.archetype ? ` (${n.hook.archetype})` : ''}` : null,
    Array.isArray(n.beats) && n.beats.length ? `Story beats: ${n.beats.map(b => (typeof b === 'string' ? b : b.text || b.label || '')).filter(Boolean).slice(0, 8).join(' → ')}` : null,
    a.synopsis ? `Synopsis: ${String(a.synopsis).slice(0, 1200)}` : null,
    a.offer?.text ? `Offer: ${a.offer.text}${a.offer.cta_label ? ` · CTA “${a.offer.cta_label}”` : ''}` : null,
    a.landing_page?.one_line ? `Lands on: ${a.landing_page.one_line}` : null,
    dims.length ? `Creative make-up: ${dims.slice(0, 12).join(' · ')}` : null,
    a.strength?.impressions ? `Delivery strength ${a.strength.impressions}/5, engagement ${a.strength.engagement || 'unknown'} (Upspring — not performance)` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

/** An Upspring ad id inside a reference: "upspring-ad:123" or an upspring.ai link with /ads/<id>. */
function upspringAdId(ref) {
  const s = String(ref || '').trim();
  const m = s.match(/^upspring-ad:([\w-]+)$/i) || (/upspring\.ai/i.test(s) && s.match(/\/ads?\/([\w-]{6,})/i));
  return m ? m[1] : null;
}

module.exports = { configured, status, byDomain, advertiser, peers, advertiserAds, ad, search, distribution, landingPages, landingPage, adAsReference, upspringAdId, usage: () => ({ ...day }) };
