import { useLayoutEffect, useRef, useState } from 'react';

/** [ref, width] — an element's width, kept up to date (fallback until it's measured). */
export function useWidth(fallback = 1200) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  // Measure before the first paint, then follow resizes (window resize too, in case the observer is throttled)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(el.getBoundingClientRect().width);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return [ref, w || fallback];
}

/** Cards per row so every row is full: as many as fit (each ≥ min px), rows balanced (7 → 4 + 3, never 6 + 1). */
export function perRow(n, width, min, gap) {
  const fit = Math.max(1, Math.floor((width + gap) / (min + gap)));
  return Math.ceil(n / Math.max(1, Math.ceil(n / fit)));
}

/** A grid with no half-empty rows — each row is stretched edge to edge and its cards share one height. */
export function BalancedGrid({ items, min = 230, gap = 12, render }) {
  const [ref, w] = useWidth();
  const per = perRow(items.length, w, min, gap);
  const rows = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per));
  return (
    <div ref={ref} className="flex flex-col" style={{ gap }}>
      {rows.map((row, r) => (
        <div key={r} className="grid" style={{ gap, gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>{row.map(render)}</div>
      ))}
    </div>
  );
}

export const ELECTRIC = '#0808f8';
export const NAVY = '#030b2e';
export const DIVISION = {
  design: { label: 'Design', color: '#7c5cff' },
  video: { label: 'Video', color: '#0808f8' },
  tv: { label: 'TV & SP', color: '#ff7a1a' },
};
export const CATEGORY = {
  delivered: { label: 'Done', color: '#00c875' },
  review: { label: 'In review', color: '#a25ddc' },
  fixes: { label: 'Fixes', color: '#fdab3d' },
  in_progress: { label: 'Working', color: '#579bfc' },
  queued: { label: 'Queued', color: '#c4c4c4' },
  paused: { label: 'Paused', color: '#9d99b9' },
  stuck: { label: 'Stuck', color: '#e2445c' },
  other: { label: 'Other', color: '#d0d4e4' },
};
export const CATEGORY_ORDER = ['delivered', 'review', 'fixes', 'in_progress', 'queued', 'paused', 'stuck', 'other'];

/** Seconds → "12.5h" / "45m" */
export function hrs(s, { zero = '–' } = {}) {
  if (!s) return zero;
  const h = s / 3600;
  if (h < 1) return `${Math.max(1, Math.round(s / 60))}m`;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}h`;
}

export function Avatar({ person, size = 28, ring }) {
  const [failed, setFailed] = useState(false);
  const name = person?.name || '?';
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="rounded-full overflow-hidden inline-flex items-center justify-center flex-none font-bold text-white"
      title={name}
      style={{ width: size, height: size, fontSize: size * 0.38, background: 'linear-gradient(135deg,#0808f8,#4a55ff)', boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      {person?.photo && !failed
        ? <img src={person.photo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : initials}
    </span>
  );
}

export function StatusPill({ status, small }) {
  if (!status?.label) return null;
  return (
    <span className={`inline-flex items-center rounded-full font-semibold text-white whitespace-nowrap ${small ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-1'}`}
      style={{ background: status.color || '#c4c4c4' }}>
      {status.label}
    </span>
  );
}

export function ProductTag({ product }) {
  if (!product?.label || product.label === '-') return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full flex-none" style={{ background: product.color || '#c4c4c4' }} />
      {product.label}
    </span>
  );
}

export function Card({ title, subtitle, right, children, className = '', pad = true }) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200 shadow-[0_1px_2px_rgba(3,11,46,.04)] ${className}`}>
      {(title || right) && (
        <header className="flex items-start gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-[#030b2e]">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {right && <div className="ml-auto flex-none">{right}</div>}
        </header>
      )}
      <div className={pad ? 'p-5 pt-3' : ''}>{children}</div>
    </section>
  );
}

export function Seg({ value, onChange, options, size = 'sm' }) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-gray-100">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`${size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2'} font-semibold rounded-lg transition-colors ${value === v ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500 hover:text-gray-800'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Horizontal stacked bar from [{ key, value, color, label }] */
export function StackBar({ parts, height = 12, total, onPart, rounded = true }) {
  const sum = total ?? parts.reduce((a, p) => a + p.value, 0);
  if (!sum) return <div className="w-full rounded-full bg-gray-100" style={{ height }} />;
  return (
    <div className={`flex w-full overflow-hidden bg-gray-100 ${rounded ? 'rounded-full' : 'rounded'}`} style={{ height }}>
      {parts.filter(p => p.value > 0).map(p => (
        <div key={p.key} title={`${p.label}: ${p.value}`}
          onClick={onPart ? () => onPart(p) : undefined}
          className={onPart ? 'cursor-pointer hover:brightness-110' : ''}
          style={{ width: `${(p.value / sum) * 100}%`, background: p.color, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="text-sm text-gray-400 text-center py-10">{children}</div>;
}

/** Monday-style timeline pill: dark track, filled for the part that has already passed. */
export function TimelinePill({ timeline, today, color = '#e2445c', small = false }) {
  if (!timeline?.from) return <span className="text-xs text-gray-300">No timeline</span>;
  const f = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const to = timeline.to || timeline.from;
  const sameMonth = timeline.from.slice(0, 7) === to.slice(0, 7);
  const label = to === timeline.from ? f(timeline.from) : `${f(timeline.from)} – ${sameMonth ? Number(to.slice(8)) : f(to)}`;
  const day = (s) => Date.parse(`${s}T12:00:00Z`);
  const total = (day(to) - day(timeline.from)) / 86400000 + 1;
  const done = today ? Math.max(0, Math.min(total, (day(today) - day(timeline.from)) / 86400000 + 1)) : 0;
  const pct = Math.round((done / total) * 100);
  return (
    <span className={`relative inline-flex items-center justify-center overflow-hidden rounded-full text-white font-semibold whitespace-nowrap ${small ? 'text-[10px] h-5 min-w-[84px] px-2' : 'text-[11px] h-6 min-w-[96px] px-2.5'}`}
      style={{ background: '#333' }} title={`${timeline.from} → ${to}`}>
      <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: color }} />
      <span className="relative">{label}</span>
    </span>
  );
}
