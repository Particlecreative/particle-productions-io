/**
 * Which brand an ad belongs to. The studio makes ads for several brands (Particle, Ashford Formulary & Co.); the
 * Captain must use that brand's knowledge only. Detected from the Monday task name ("Ashford | Bone & Joint | …"),
 * then the Frame.io / Figma names. Brain items with scope.brand apply to that brand only; items without a brand are
 * general house style and apply to every brand.
 *
 * Particle also runs ads in four lanes (Particle direct, Science For You, Gentleman Today, We Are Colognes), each with
 * its own rules. Brain items with scope.lane apply to that lane only.
 */
const { DEFAULTS } = require('./config');

function brandOf({ itemName = null, names = [], brand = null } = {}, cfg = DEFAULTS) {
  const brands = cfg.brands || DEFAULTS.brands;
  const want = String(brand || '').trim().toLowerCase();
  const named = want && brands.find(b => b.name.toLowerCase() === want || (b.match || []).includes(want));
  if (named) return named;
  const first = String(itemName || '').split('|')[0].trim().toLowerCase();
  const hay = [itemName, ...names].filter(Boolean).join(' ').toLowerCase();
  const hit = brands.find(b => (b.match || []).some(m => first === m || first.startsWith(`${m} `)))
    || brands.find(b => (b.match || []).some(m => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(hay)));
  return hit || brands.find(b => b.default) || brands[0];
}

/**
 * The lane, in the order the Medium spec gives (§5.2): an explicit lane, then name tokens ("| SFY |", "Gentleman Today"),
 * then the destination domain in the text ("Page: wearecolognes.com/…"), otherwise Particle direct.
 */
function laneOf({ lane = null, names = [], text = '' } = {}, cfg = DEFAULTS) {
  const lanes = cfg.lanes || DEFAULTS.lanes;
  const want = String(lane || '').trim().toLowerCase();
  if (want) {
    const hit = lanes.find(l => l.name.toLowerCase() === want || (l.match || []).includes(want));
    if (hit) return hit;
  }
  const hay = names.filter(Boolean).join(' | ').toLowerCase();
  const byName = lanes.find(l => (l.match || []).some(m => new RegExp(`(^|[^a-z])${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(hay)));
  if (byName) return byName;
  const t = String(text || '').toLowerCase();
  const byDomain = lanes.find(l => l.destination && !l.default && t.includes(l.destination));
  return byDomain || lanes.find(l => l.default) || lanes[0];
}

module.exports = { brandOf, laneOf };
