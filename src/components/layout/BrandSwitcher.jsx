import { useBrand } from '../../context/BrandContext';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

export default function BrandSwitcher({ compact = false }) {
  const { brandId, brands, switchBrand } = useBrand();
  const { user, isAdmin } = useAuth();

  // Use brand_ids from user object (set by JWT in prod, by SAMPLE_USERS in dev)
  const isSuperAdmin = user?.super_admin === true || isAdmin;
  const accessList = isSuperAdmin
    ? brands.map(b => b.id)
    : (user?.brand_ids ?? (user?.brand ? [user.brand] : ['particle']));

  const visibleBrands = brands.filter(b => accessList.includes(b.id));

  if (visibleBrands.length < 2) return null; // only one brand accessible — no switcher needed

  if (compact) {
    return (
      <div className="flex flex-col gap-1">
        {visibleBrands.map(b => (
          <button
            key={b.id}
            onClick={() => switchBrand(b.id)}
            className={clsx(
              'w-full h-6 rounded text-[9px] font-bold uppercase transition-all',
              brandId === b.id
                ? 'bg-white text-gray-900'
                : 'bg-white/10 text-white/40 hover:bg-white/20'
            )}
          >
            {b.name[0]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {visibleBrands.map(b => (
        <button
          key={b.id}
          onClick={() => switchBrand(b.id)}
          className={clsx(
            'flex-1 py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-all',
            brandId === b.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'bg-white/10 text-white/50 hover:bg-white/15'
          )}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}
