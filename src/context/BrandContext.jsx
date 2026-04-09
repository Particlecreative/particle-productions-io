import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getBrands, getSettings } from '../lib/dataService';

const IS_DEV = import.meta.env.DEV;

const BrandContext = createContext(null);

// Static brand definitions (fallback defaults) — Particle first
export const BRANDS = {
  particle: {
    id: 'particle',
    name: 'Particle',
    tagline: 'For Men',
    bg: '#f4f5f7',
    primary: '#030b2e',
    secondary: '#0808f8',
    accent: '#0808f8',
  },
  biomella: {
    id: 'biomella',
    name: 'Biomella',
    tagline: 'The beauty biohack',
    bg: '#f9f7f5',
    primary: '#C41E1E',
    secondary: '#8B1515',
    accent: '#C41E1E',
  },
  blurr: {
    id: 'blurr',
    name: 'Blurr',
    tagline: '',
    bg: '#F5F5F5',
    primary: '#B842A9',
    secondary: '#862F7B',
    accent: '#F86EE6',
  },
};

// Preferred brand display order (Particle first)
const BRAND_ORDER = ['particle', 'biomella', 'blurr'];

export function BrandProvider({ children }) {
  const [brandId, setBrandId] = useState(() => {
    return localStorage.getItem('cp_brand') || 'particle';
  });

  const [brands, setBrands] = useState(Object.values(BRANDS));

  // Sort brands so Particle is always first
  function sortBrands(list) {
    return [...list].sort((a, b) => {
      const ai = BRAND_ORDER.indexOf(a.id);
      const bi = BRAND_ORDER.indexOf(b.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  const refreshBrands = useCallback(() => {
    if (!IS_DEV && !localStorage.getItem('cp_auth_token')) return;
    const result = getBrands();
    if (result && typeof result.then === 'function') {
      result.then(b => { if (b?.length) setBrands(sortBrands(b)); }).catch(() => {});
    } else if (result?.length) {
      setBrands(sortBrands(result));
    }
  }, []);

  useEffect(() => { refreshBrands(); }, [refreshBrands]);

  useEffect(() => {
    localStorage.setItem('cp_brand', brandId);
    document.documentElement.setAttribute('data-brand', brandId);

    // Apply saved brand colors from settings as CSS variables
    try {
      const result = getSettings(brandId);
      const applyColors = (s) => {
        if (s?.colors) {
          Object.entries(s.colors).forEach(([key, value]) => {
            if (value) document.documentElement.style.setProperty(`--brand-${key}`, value);
          });
        }
      };
      if (result && typeof result.then === 'function') {
        result.then(applyColors).catch(() => {});
      } else {
        applyColors(result);
      }
    } catch {}
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
