import { useBrand } from '../../context/BrandContext';
import { getSettings } from '../../lib/dataService';

const DEFAULT_LOGOS = {
  particle: 'https://www.particleformen.com/wp-content/themes/particleformen/assets/images/particle-for-men-logo.png',
};

export default function BrandLogo({ compact = false, dark = false }) {
  const { brand, brandId } = useBrand();
  const settings = getSettings(brandId);
  const logoUrl = settings?.logo_url || DEFAULT_LOGOS[brandId] || null;

  if (compact) {
    if (logoUrl) {
      return (
        <img
          src={logoUrl}
          alt={brand.name}
          style={{ maxWidth: 32, maxHeight: 32, objectFit: 'contain' }}
          className="flex-shrink-0"
        />
      );
    }
    return (
      <div
        className="flex items-center justify-center w-8 h-8 rounded font-black text-sm flex-shrink-0"
        style={{ background: 'var(--brand-accent)', color: 'white' }}
      >
        {brandId === 'particle' ? 'P' : 'B'}
      </div>
    );
  }

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={brand.name}
        style={{ maxWidth: 200, maxHeight: 50, objectFit: 'contain' }}
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
        {brandId === 'particle' ? 'P' : 'B'}
      </div>
      <div className="min-w-0">
        <div
          className={`font-black text-base leading-tight truncate brand-title`}
          style={{
            color: dark ? 'var(--brand-primary)' : 'white',
            fontFamily: brandId === 'particle'
              ? "'Sofia Sans Extra Condensed', sans-serif"
              : "'Avenir Next Condensed', Impact, sans-serif",
            fontWeight: 800,
            textTransform: brandId === 'blurr' ? 'uppercase' : 'none',
            letterSpacing: brandId === 'blurr' ? '0.05em' : 'normal',
          }}
        >
          {brand.name}
        </div>
        {!compact && brand.tagline && (
          <div className="text-white/40 text-[9px] uppercase tracking-widest leading-tight">
            {brand.tagline}
          </div>
        )}
      </div>
    </div>
  );
}
