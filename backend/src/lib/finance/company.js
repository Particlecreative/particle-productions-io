/**
 * The company a production belongs to, for every finance output (email subject, banner, dashboard row).
 * Particle and Blurr are separate companies (Biomella is a Blurr brand — Blurr Beauty LTD) — invoices must name the right one.
 */
const { BRAND_COMPANY } = require('../companyInfo');

const FINANCE_COMPANY = {
  particle: { short: 'Particle', legalName: BRAND_COMPANY.particle.legalName, number: BRAND_COMPANY.particle.number, color: '#0808f8' },
  blurr:    { short: 'Blurr', legalName: BRAND_COMPANY.blurr.legalName, number: BRAND_COMPANY.blurr.number, color: '#B842A9' },
  biomella: { short: 'Biomella', legalName: BRAND_COMPANY.biomella.legalName, number: BRAND_COMPANY.biomella.number, color: '#1a8c5c' },  // a Blurr brand: same legal company
};

function companyOf(brandId) {
  const c = FINANCE_COMPANY[brandId];
  if (c) return { id: brandId, ...c };
  const short = brandId ? brandId.charAt(0).toUpperCase() + brandId.slice(1) : 'Unknown';
  return { id: brandId, short, legalName: null, number: '', color: '#64748b' };
}

/** "Blurr Beauty LTD (517208203)" or the short name when the legal name isn't known. */
function companyLine(brandId) {
  const c = companyOf(brandId);
  if (!c.legalName) return c.short;
  return c.number ? `${c.legalName} (${c.number})` : c.legalName;
}

module.exports = { companyOf, companyLine, FINANCE_COMPANY };
