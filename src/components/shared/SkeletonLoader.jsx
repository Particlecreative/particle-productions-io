/**
 * SkeletonLoader — shimmer placeholder for loading states.
 * Usage: <SkeletonLoader rows={5} /> for a table-like skeleton
 *        <SkeletonLoader type="cards" count={6} /> for card grid
 */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      <div className="skeleton-block h-4 w-16 rounded" />
      <div className="skeleton-block h-4 flex-1 rounded" />
      <div className="skeleton-block h-4 w-24 rounded" />
      <div className="skeleton-block h-4 w-20 rounded" />
      <div className="skeleton-block h-4 w-16 rounded" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="brand-card p-4 rounded-xl space-y-3">
      <div className="flex items-center gap-3">
        <div className="skeleton-block h-3 w-16 rounded" />
        <div className="skeleton-block h-5 w-14 rounded-full" />
      </div>
      <div className="skeleton-block h-4 w-3/4 rounded" />
      <div className="skeleton-block h-3 w-1/2 rounded" />
      <div className="skeleton-block h-1.5 w-full rounded-full mt-2" />
    </div>
  );
}

export default function SkeletonLoader({ rows = 6, type = 'table', count = 6 }) {
  if (type === 'cards') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[...Array(count)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="brand-card p-2 space-y-1">
      {[...Array(rows)].map((_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}
