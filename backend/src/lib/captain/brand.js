/**
 * Which brand an ad belongs to. The studio makes ads for several brands (Particle, Ashford Formulary & Co.); the
 * Captain must use that brand's knowledge only. Detected from the Monday task name ("Ashford | Bone & Joint | …"),
 * then the Frame.io / Figma names. Brain items with scope.brand apply to that brand only; items without a brand are
 * general house style and apply to every brand.
 */
const { DEFAULTS } = require('./config');

function brandOf({ itemName = null, names = [] } = {}, cfg = DEFAULTS) {
  const brands = cfg.brands || DEFAULTS.brands;
  const first = String(itemName || '').split('|')[0].trim().toLowerCase();
  const hay = [itemName, ...names].filter(Boolean).join(' ').toLowerCase();
  const hit = brands.find(b => (b.match || []).some(m => first === m || first.startsWith(`${m} `)))
    || brands.find(b => (b.match || []).some(m => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(hay)));
  return hit || brands.find(b => b.default) || brands[0];
}

module.exports = { brandOf };
