import { useState, useEffect } from 'react';
import { useBrand } from '../../context/BrandContext';
import { getSettings } from '../../lib/dataService';

const DEFAULT_LOGOS = {
  particle: 'https://www.particleformen.com/wp-content/themes/particleformen/assets/images/particle-for-men-logo.png',
};

export default function BrandLogo({ compact = false, dark = false }) {
  const { brand, brandId } = useBrand();
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGOS[brandId] || null);

  // Load logo_url from settings (async in production)
  useEffect(() => {
    const result = getSettings(brandId);
    if (result && typeof result.then === 'function') {
      result.then(s => {
        if (s?.logo_url) setLogoUrl(s.logo_url);
        else setLogoUrl(DEFAULT_LOGOS[brandId] || null);
      }).catch(() => {});
    } else if (result?.logo_url) {
      setLogoUrl(result.logo_url);
    } else {
      setLogoUrl(DEFAULT_LOGOS[brandId] || null);
    }
  }, [brandId]);

  if (compact) {
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={brand.name}
          style={{ width: 32, height: 32, objectFit: 'contain', objectPosition: 'left center' }}
          className="flex-shrink-0"
        />
      );
    }
    return (
      <div
        className="flex items-center justify-center w-8 h-8 rounded font-black text-sm flex-shrink-0"
        style={{ background: 'var(--brand-accent)', color: 'white' }}
      >
        {brand.name?.[0] || '?'}
      </div>
    );
  }

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={brand.name}
        style={{ width: 180, height: 40, objectFit: 'contain', objectPosition: 'left center' }}
        className="flex-shrink-0"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="flex items-center justify-center w-8 h-8 rounded font-black text-sm flex-shrink-0"
        style={{ background: 'var(--brand-accent)', color: 'white' }}
      >
        {brand.name?.[0] || '?'}
      </div>
      <div className="min-w-0">
        <div
          className="font-black text-base leading-tight truncate brand-title"
          style={{ color: dark ? 'var(--brand-primary)' : 'white' }}
        >
          {brand.name}
        </div>
        {brand.tagline && (
          <div className="text-white/40 text-[9px] uppercase tracking-widest leading-tight">
            {brand.tagline}
          </div>
        )}
      </div>
    </div>
  );
}
