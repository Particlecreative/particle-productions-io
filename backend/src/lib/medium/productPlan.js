/**
 * MEDIUM — the weekly autopilot plan by product (Tomer, 11 Nov 2026): 20 videos + 20 statics for Particle direct
 * (no SFY / GT / WAC), spread across the top products by spend over the last 30 days (Upspring), each built on that
 * product's best-performing ads. Pure — tested.
 */

/** Hand out n slots round-robin over products in spend order, at most `cap` each (pure). → [{ product, k }] */
function allocate(products, n, cap = 4) {
  const out = [], count = new Map();
  let progress = true;
  while (out.length < n && progress) {
    progress = false;
    for (const p of products) {
      if (out.length >= n) break;
      const k = count.get(p) || 0;
      if (k >= cap) continue;
      count.set(p, k + 1);
      out.push({ product: p, k });
      progress = true;
    }
  }
  return out;
}

const good = (w) => w.winner || Number(w.percentile) >= 60;
const byStrength = (a, b) => (b.percentile ?? -1) - (a.percentile ?? -1) || b.spend - a.spend;

/**
 * products: [{ product, spend }] sorted by last-30-day spend; winners: Upspring-ranked rows (lane, product, format,
 * percentile, winner, key, headline?); recent: { source_key → briefs in the last 30 days }.
 * → [{ lane, format, move, product, winner, headline?, headline_from?, spend30 }]
 */
function planProducts({ products = [], winners = [], recent = {}, video = 20, design = 20, cap = 4, lanes = ['Particle'], perWinner = 3 } = {}) {
  const names = products.map(p => p.product);
  const spend = Object.fromEntries(products.map(p => [p.product, p.spend]));
  const pool = winners.filter(w => lanes.includes(w.lane) && w.product);
  const used = { ...recent };
  const pick = (product, format) => {
    const w = pool.filter(x => x.product === product && x.format === format && good(x) && (used[x.key] || 0) < perWinner).sort(byStrength)[0];
    if (w) used[w.key] = (used[w.key] || 0) + 1;
    return w || null;
  };
  const plan = [];
  for (const { product, k } of allocate(names, video, cap)) {
    const vw = pick(product, 'video');
    if (vw) { plan.push({ lane: 'Particle', format: 'video', move: k % 2 === 0 ? 'ITERATE' : 'REFRESH', product, winner: vw, spend30: spend[product] }); continue; }
    const sw = pool.filter(x => x.product === product && x.format === 'static' && good(x) && x.headline && (used[`hl:${x.key}`] || 0) < 1).sort(byStrength)[0];
    if (sw) { used[`hl:${sw.key}`] = 1; plan.push({ lane: 'Particle', format: 'video', move: 'HEADLINE_HOOK', product, winner: sw, headline: sw.headline, headline_from: sw.headline_from, spend30: spend[product] }); continue; }
    plan.push({ lane: 'Particle', format: 'video', move: 'NEW_ANGLE', product, winner: null, spend30: spend[product] });
  }
  for (const { product, k } of allocate(names, design, cap)) {
    const sw = pick(product, 'static');
    if (sw) { plan.push({ lane: 'Particle', format: 'design', move: k % 2 === 0 ? 'ITERATE' : 'REFRESH', product, winner: sw, spend30: spend[product] }); continue; }
    const vw = pool.filter(x => x.product === product && x.format === 'video' && good(x) && (used[x.key] || 0) < perWinner).sort(byStrength)[0];
    if (vw) { used[vw.key] = (used[vw.key] || 0) + 1; plan.push({ lane: 'Particle', format: 'design', move: 'TRANSFER_FORMAT', product, winner: vw, source_format: 'video', spend30: spend[product] }); continue; }
    plan.push({ lane: 'Particle', format: 'design', move: 'NEW_ANGLE', product, winner: null, spend30: spend[product] });
  }
  return plan;
}

/** Product spend over a set of Upspring rows, one lane (pure). → [{ product, spend, video, static, creatives }] sorted */
function productSpend(rows, lanes = ['Particle']) {
  const m = new Map();
  for (const r of rows) {
    if (!r.product || !lanes.includes(r.lane)) continue;
    const x = m.get(r.product) || { product: r.product, spend: 0, video: 0, static: 0, creatives: 0 };
    x.spend += Number(r.spend) || 0; x[r.format === 'static' ? 'static' : 'video'] += Number(r.spend) || 0; x.creatives += 1;
    m.set(r.product, x);
  }
  return [...m.values()].map(x => ({ ...x, spend: Math.round(x.spend), video: Math.round(x.video), static: Math.round(x.static) })).sort((a, b) => b.spend - a.spend);
}

module.exports = { allocate, planProducts, productSpend };
