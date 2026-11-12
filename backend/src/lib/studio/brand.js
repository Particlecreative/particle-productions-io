/**
 * The brand a studio task is for — so the Studio can filter and colour by brand (Tomer, 12 Nov 2026).
 *
 * Both boards have a "Brands" status column (Video color_mm8q1bam, Design color_mm8q3pn9), but about 3 in 4 tasks
 * predate it (12 Nov 2026: 47 of the newest 200 Video tasks and 51 of 200 Design tasks had it set). So, in order:
 *   1. the Brands column
 *   2. the Design board's older free-text "Brand" column ("PARTICLE", "ASHFORD FORMULARY & Co.", "clearstep")
 *   3. a brand named in the task name or campaign ("Test Product | Ashford | …", "Biomella Face Cream …", "Levitas 1.0")
 *   4. a product only one brand sells (Bone & Joint → Ashford, Antifungal … → Clearstep — checked against every task
 *      that had the column set). Never the creams Particle and Biomella share (Face / Hand / Neck Cream).
 *   5. Particle, the house brand
 * Colours are Monday's Brands-column colours (the caller prefers the live column's colour when it has it).
 */

const BRANDS = [
  { name: 'Particle', color: '#579bfc', match: ['particle'], default: true },
  { name: 'Ashford', color: '#fdab3d', match: ['ashford'], products: ['Bone & Joint', 'Bone and Joint', 'Testosterone and Hormone', 'Joint Mobility'] },
  { name: 'Clearstep', color: '#00c875', match: ['clearstep'], products: ['Antifungal Foot Treatment', 'Antifungal Nail Repair'] },
  { name: 'Levitas', color: '#9d50dd', match: ['levitas'] },
  { name: 'Biomella', color: '#037f4c', match: ['biomella'] },
  { name: 'Blurr', color: '#a1e3f6', match: ['blurr'] },
];

const norm = (s) => String(s ?? '').trim().toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const named = (text, b) => b.match.some(m => new RegExp(`(^|[^a-z])${esc(m)}([^a-z]|$)`).test(text));

/**
 * { column, text, name, campaign, product } → { label, color, source } (pure — tested).
 * source: 'column' | 'text' | 'name' | 'product' | 'default' — how sure we are, for tooltips.
 */
function brandOf({ column = '', text = '', name = '', campaign = '', product = '' } = {}, brands = BRANDS) {
  const pick = (b, source) => ({ label: b.name, color: b.color, source });
  const col = String(column || '').trim();
  if (col && col !== '-') {
    const b = brands.find(x => norm(x.name) === norm(col) || x.match.includes(norm(col)));
    return b ? pick(b, 'column') : { label: col, color: null, source: 'column' };   // a brand Monday has and we don't (yet)
  }
  const t = norm(text);
  const fromText = t && brands.find(b => named(t, b));
  if (fromText) return pick(fromText, 'text');
  // the name's first segment is the strongest hint ("Ashford | Bone & Joint | …"); then any other brand named
  const first = norm(String(name || '').split('|')[0]);
  const hay = norm(`${name || ''} | ${campaign || ''}`);
  const byName = brands.find(b => !b.default && named(first, b)) || brands.find(b => !b.default && named(hay, b)) || brands.find(b => b.default && named(hay, b));
  if (byName) return pick(byName, 'name');
  const p = norm(product);
  const byProduct = p && brands.find(b => (b.products || []).some(x => norm(x) === p));
  if (byProduct) return pick(byProduct, 'product');
  const home = brands.find(b => b.default) || brands[0];
  return pick(home, 'default');
}

module.exports = { brandOf, BRANDS };
