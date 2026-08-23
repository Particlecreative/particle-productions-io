// Per-brand legal company details used on contracts (PDF, signing page, emails).
// Keyed by production brand_id. Defaults to Particle for any unknown brand so
// nothing regresses. Address & signers are shared today; only the legal entity
// (name + registration number) and letterhead differ per brand.
export const BRAND_COMPANY = {
  particle: {
    legalName: 'Particle Aesthetic Science Ltd.',
    number: '',
    address: 'King George 48, Tel Aviv',
    short: 'Particle',
    hasLogo: true, // uses the Particle letterhead image
  },
  blurr: {
    legalName: 'Blurr Beauty LTD',
    number: '517208203',
    address: 'King George 48, Tel Aviv',
    short: 'Blurr',
    hasLogo: false, // text letterhead for now
  },
};

export function companyForBrand(brandId) {
  return BRAND_COMPANY[brandId] || BRAND_COMPANY.particle;
}

// The legal clause used in the contract preamble.
export function companyClause(c) {
  const num = c.number ? `, company no. ${c.number}` : '';
  return `${c.legalName}${num}, a company registered in Israel, with a principal place of business at ${c.address}`;
}
