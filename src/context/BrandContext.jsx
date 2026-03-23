import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getBrands } from '../lib/dataService';

const IS_DEV = import.meta.env.DEV;

const BrandContext = createContext(null);

// Keep the static BRANDS constant for backward-compat with any code that imports it directly
export const BRANDS = {
  particle: {
    id: 'particle',
    name: 'Particle',
    tagline: 'For Men',
    bg: '#b7b7b7',
    primary: '#030b2e',
    secondary: '#0808f8',
    accent: '#0808f8',
  },
  blurr: {
    id: 'blurr',
    name: 'Blurr',
    tagline: '',
    bg: '#F5F5F5',
    primary: '#B842A9',
    secondary: '#862F7B',
    accent: '#B842A9',
  },
};

export function BrandProvider({ children }) {
  const [brandId, setBrandId] = useState(() => {
    return localStorage.getItem('cp_brand') || 'particle';
  });

  const [brands, setBrands] = useState(Object.values(BRANDS));

  const refreshBrands = useCallback(() => {
    // In prod, skip the fetch if no auth token exists (e.g. on the login page)
    if (!IS_DEV && !localStorage.getItem('cp_auth_token')) return;
    // In dev mode getBrands() is synchronous; in prod it's a Promise
    const result = getBrands();
    if (result && typeof result.then === 'function') {
      result.then(b => { if (b?.length) setBrands(b); }).catch(() => {});
    } else if (result?.length) {
      setBrands(result);
    }
  }, []);

  useEffect(() => { refreshBrands(); }, [refreshBrands]);

  useEffect(() => {
    localStorage.setItem('cp_brand', brandId);
    document.documentElement.setAttribute('data-brand', brandId);
  }, [brandId]);

  // Derive the active brand object from loaded list (fall back to static BRANDS)
  const brand = brands.find(b => b.id === brandId) || BRANDS[brandId] || brands[0];

  function switchBrand(id) {
    const exists = brands.find(b => b.id === id);
    if (exists) setBrandId(id);
  }

  // brandsById: backward-compat object keyed by id
  const brandsById = Object.fromEntries(brands.map(b => [b.id, b]));

  return (
    <BrandContext.Provider value={{
      brandId,
      brand,
      switchBrand,
      brands,            // array of brand objects
      brandsById,        // { [id]: brand } — for backward compat
      refreshBrands,
    }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}
