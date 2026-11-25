/**
 * The Creative team sees what runs, not what it costs (Tomer, 25 Nov 2026: "On Air without $$$ — just what runs when,
 * what starts, what ends"). Money is taken out on the SERVER, by key, at any depth — spend, orders, revenue, MER, CPO,
 * cost, ROAS… — so a field added to On Air later is stripped too unless it's named like one of these. Pure — tested.
 */
const MONEY_KEY = /^(spend|spent|orders|order_count|revenue|rev|mer|aov|cpo|cpv|cpa|cpm|cpc|cost|costs|price|budget|amount|roas|purchases|purchase_value|share|value|ltv|profit|margin|tv_orders|tv_revenue|tv_visits|visits|sessions|new_customers|promo_revenue|promo_orders|est|estimated|booked|totals|benchmarks|vs|periods|series|prev|week_prev|week|month|day)$/i;
const MONEY_PART = /(spend|spent|revenue|roas|cost|budget|price|_mer$|_cpo$|_aov$|^mer_|orders?_)/i;

function stripMoney(v, depth = 0) {
  if (depth > 12 || v == null) return v;
  if (Array.isArray(v)) return v.map(x => stripMoney(x, depth + 1));
  if (typeof v !== 'object') return v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (MONEY_KEY.test(k) || MONEY_PART.test(k)) continue;
    out[k] = stripMoney(x, depth + 1);
  }
  return out;
}

/** On Air → TV, for the Creative team: products, spots and when they air, the booked schedule — no money, no agency mail. */
function tvForCreative(tv) {
  const t = stripMoney({ ...tv, notes: undefined, brain: undefined, google: undefined, sync: undefined });
  delete t.notes; delete t.brain; delete t.google; delete t.sync;
  return t;
}

/** On Air → Meta, for the Creative team: which creatives run, since when, who made them — no spend, no ROAS, no Ads Manager. */
function mediaForCreative(m) {
  if (!m) return m;
  return {
    connected: m.connected, ready: m.ready, last_day: m.last_day, since: m.since, days: m.days, error: m.error, fetched_at: m.fetched_at,
    creatives: (m.creatives || []).map(c => ({
      key: c.key, label: c.label, format: c.format, lane: c.lane, product: c.product, campaign: c.campaign, maker: c.maker, team: c.team,
      asset_id: c.asset_id, first_spend: c.first_spend, last_spend: c.last_spend, live: !!c.live, new: !!c.new, ads: c.ads,
      thumb: c.thumb, video_url: c.video_url, file_url: c.file_url,
    })),
  };
}

module.exports = { stripMoney, tvForCreative, mediaForCreative };
