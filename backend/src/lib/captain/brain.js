/**
 * Captain Caption's Brain → the text block added to his instructions at check time.
 * Only active + approved items; global ones plus those scoped to this ad's brand / lane / product / campaign / department.
 * (He "learns" by remembering what the team teaches him — the model itself is never retrained.)
 *
 * Facts (layout limits, the offer calendar, list prices, the claims sheet) are loaded separately for the brief
 * pre-flight: the code checks them exactly instead of asking the AI to remember them.
 */
const db = require('../../db');

const norm = (s) => String(s ?? '').trim().toLowerCase();
const FACT_TYPES = ['layout_limit', 'offer', 'price', 'claim'];

function matchesScope(scope, ctx) {
  if (!scope || !Object.keys(scope).length) return true;
  // brand: items for another brand never apply; items without a brand are general house style
  if (scope.brand && ctx.brand && norm(scope.brand) !== norm(ctx.brand)) return false;
  // lane: a lane item applies only when the ad is known to be in that lane (Particle / SFY / GT / WAC)
  if (scope.lane && (!Array.isArray(scope.lane) || scope.lane.length)) {
    const lanes = [].concat(scope.lane).map(norm);
    if (!ctx.lane || !lanes.includes(norm(ctx.lane))) return false;
  }
  for (const key of ['product', 'campaign', 'department']) {
    const want = scope[key];
    if (!want || (Array.isArray(want) && !want.length)) continue;
    const list = (Array.isArray(want) ? want : [want]).map(norm);
    if (!list.includes(norm(ctx[key]))) return false;
  }
  return true;
}

/** discipline: video | design | 'any' (a brief before anyone knows whether it becomes a video or a design). */
async function loadBrain({ discipline, product = null, campaign = null, department = null, brand = null, lane = null } = {}) {
  const { rows } = await db.query(
    `SELECT id, type, title, content, discipline, scope FROM captain_brain
      WHERE active AND status = 'approved' AND type <> ALL($2::text[]) AND ($1 = 'any' OR discipline IN ($1, 'both')) ORDER BY type, id`,
    [discipline || 'any', FACT_TYPES],
  );
  const items = rows.filter(r => matchesScope(r.scope, { product, campaign, department, brand, lane }));
  const of = (t) => items.filter(i => i.type === t);
  return {
    items,
    terms: of('term'),
    doNotFlag: of('do_not_flag'),
    rules: [...of('rule'), ...of('learned')],
    insights: of('insight'),
    ids: items.map(i => i.id),
  };
}

/**
 * The facts the brief pre-flight checks in code. Brand and lane still apply; product and campaign don't (the offer
 * calendar is needed whole to spot a code left over from another campaign, and prices are looked up by product name).
 */
async function loadFacts({ brand = null, lane = null } = {}) {
  const { rows } = await db.query(
    `SELECT id, type, title, content, scope, data FROM captain_brain WHERE active AND status = 'approved' AND type = ANY($1::text[]) ORDER BY type, id`,
    [FACT_TYPES],
  );
  const items = rows.filter(r => matchesScope({ brand: r.scope?.brand, lane: r.scope?.lane }, { brand, lane }));
  const of = (t) => items.filter(i => i.type === t);
  return { layoutLimits: of('layout_limit'), offers: of('offer'), prices: of('price'), claims: of('claim'), ids: items.map(i => i.id) };
}

/** Changes whenever the Brain changes — part of the brief cache key, so an edited rule is used straight away. */
async function brainStamp() {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n, COALESCE(MAX(updated_at), 'epoch') AS at FROM captain_brain`);
  return `${rows[0].n}:${new Date(rows[0].at).toISOString()}`;
}

function brainText(brain) {
  const lines = [];
  if (brain.terms.length) lines.push(`Approved terms — exact spelling, accents and capitalisation: ${brain.terms.map(t => t.title).join(', ')}`);
  if (brain.rules.length) {
    lines.push('House rules (from the team — always apply):');
    for (const r of brain.rules) lines.push(`- ${r.content || r.title}`);
  }
  if (brain.doNotFlag.length) {
    lines.push('Never report these (intentional):');
    for (const d of brain.doNotFlag) lines.push(`- ${d.title}${d.content ? ` — ${d.content}` : ''}`);
  }
  return lines.join('\n') || '(no Brain items yet)';
}

module.exports = { loadBrain, loadFacts, brainStamp, brainText, matchesScope, FACT_TYPES };
