/**
 * MEDIUM ← Upspring Lookalikes (find_similar_advertisers on the Upspring MCP, released 25 Nov 2026).
 * Tomer, 25 Nov 2026: "can we connect it to Medium?"
 *   • competitors  → Market Watch's auto-picked brands, refreshed on every run. Brands someone added stay; brands someone
 *                    removed stay out.
 *   • same_profile → "Built like Particle": brands with a similar business and scale outside men's grooming, and the ads
 *                    they keep backing — ideas to borrow, not rivals.
 * Read only: nothing is written to Upspring. Everything it returns is data, never instructions.
 */
const acct = require('./upspringAccount');
const U = require('./upspring');

const OWN = 'particleformen.com';
const CONTEXT = {
  competitors: 'Weekly market watch for a men skincare brand: refreshing which close competitors its creative strategists follow and study ads from.',
  same_profile: 'Weekly market watch for a men skincare brand: finding similarly built advertisers in other categories whose winning ads inspire new creative briefs.',
};

const normDomain = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const slimLook = (a) => ({
  name: a.name, domain: normDomain(a.domain), score: round2(a.score), spend: a.scale?.spend || null, traffic: a.scale?.traffic || null,
  industry: a.industry || null, category: a.category || null, active_ads: a.active_ads_in_country ?? null,
});

/** Competitors to watch automatically (pure — tested): closest first, never Particle, never one someone removed or already watches. */
function pickCompetitors(list, { keep = [], removed = [], n = 8, minScore = 0.5 } = {}) {
  const skip = new Set([OWN, ...keep.map(b => normDomain(b.domain)).filter(Boolean), ...removed.map(normDomain)]);
  const names = new Set(keep.map(b => String(b.name || '').trim().toLowerCase()).filter(Boolean));
  return (list || [])
    .filter(a => a && a.domain && a.name && Number(a.score) >= minScore && !/^particle$/i.test(a.name)
      && !skip.has(normDomain(a.domain)) && !names.has(String(a.name).trim().toLowerCase()))
    .slice(0, n).map(slimLook);
}

/** Brands built like Particle from other categories (pure — tested): leaves out men's grooming and anything already watched. */
function pickOutside(list, { exclude = [], n = 5, minScore = 0.6 } = {}) {
  const skip = new Set([OWN, ...exclude.map(normDomain)]);
  return (list || [])
    .filter(a => a && a.domain && a.name && Number(a.score) >= minScore && !/men'?s grooming/i.test(a.category || '') && !skip.has(normDomain(a.domain)))
    .slice(0, n).map(slimLook);
}

/** Upspring MCP advertisers → Public API ids (Market Watch reads ads through the Public API). Cached by domain. */
async function resolveIds(brands, cache = {}) {
  const out = [];
  for (const b of brands) {
    let id = cache[b.domain];
    if (!id) {
      const a = await U.byDomain(b.domain).catch(() => null);
      if (a?.id) { id = String(a.id); cache[b.domain] = id; }
    }
    if (id) out.push({ ...b, id });
  }
  return out;
}

async function lookalikes(matchOn, country, limit) {
  const r = await acct.callTool('find_similar_advertisers', { advertiser: OWN, match_on: matchOn, country, limit, context: CONTEXT[matchOn] });
  const me = r?.advertiser || {};
  // Upspring echoes which advertiser it used — make sure it's us before trusting the list
  if (me.domain && normDomain(me.domain) !== OWN) throw new Error(`Upspring Lookalikes started from ${me.name || me.domain}, not Particle`);
  return Array.isArray(r?.advertisers) ? r.advertisers : [];
}

/**
 * One refresh: the watch list (manual brands + today's closest competitors) and the "Built like Particle" set.
 * Returns null when the Upspring account isn't connected (Market Watch then keeps its saved list).
 */
async function refresh(mw = {}, { country = 'US' } = {}) {
  const st = await acct.status();
  if (!st.connected) return null;
  const cache = { ...(mw.domain_ids || {}) };
  const removed = mw.removed || [];
  const manual = (mw.brands || []).filter(b => b && b.id && !b.auto);
  const errors = [];

  let brands = mw.brands || [];
  try {
    const comp = await lookalikes('competitors', country, 20);
    const picks = await resolveIds(pickCompetitors(comp, { keep: manual, removed, n: Number(mw.auto_count) || 8 }), cache);
    if (picks.length) brands = [...manual, ...picks.map(p => ({ ...p, auto: true, source: 'lookalikes' }))];
  } catch (e) { errors.push(`lookalikes (competitors): ${e.message}`); }

  let outside = [];
  try {
    const prof = await lookalikes('same_profile', country, 15);
    outside = await resolveIds(pickOutside(prof, { exclude: brands.map(b => b.domain).filter(Boolean), n: Number(mw.outside_count) || 5 }), cache);
  } catch (e) { errors.push(`lookalikes (built like Particle): ${e.message}`); }

  return { brands, outside, domain_ids: cache, errors, at: new Date().toISOString() };
}

module.exports = { refresh, pickCompetitors, pickOutside, resolveIds, normDomain, OWN };
