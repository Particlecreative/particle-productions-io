// Per-brand legal company details for contracts (backend fallback PDF + emails +
// the data returned to the public signing page). Mirror of src/lib/companyInfo.js.
// Keyed by production brand_id; defaults to Particle for any unknown brand.
const BRAND_COMPANY = {
  particle: {
    legalName: 'Particle Aesthetic Science Ltd.',
    number: '',
    address: 'King George 48, Tel Aviv',
    short: 'Particle',
    hasLogo: true,
  },
  blurr: {
    legalName: 'Blurr Beauty LTD',
    number: '517208203',
    address: 'King George 48, Tel Aviv',
    short: 'Blurr',
    hasLogo: false,
  },
};

function companyForBrand(brandId) {
  return BRAND_COMPANY[brandId] || BRAND_COMPANY.particle;
}

function companyClause(c) {
  const num = c.number ? `, company no. ${c.number}` : '';
  return `${c.legalName}${num}, a company registered in Israel, with a principal place of business at ${c.address}`;
}

module.exports = { BRAND_COMPANY, companyForBrand, companyClause };
