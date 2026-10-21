import { useState } from 'react';

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
