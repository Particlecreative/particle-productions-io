import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { getList, getListItemColor } from '../../lib/listService';

export const STAGE_FLOW = ['Pending', 'Pre Production', 'Production', 'Post', 'Completed'];
const FALLBACK_STAGES = ['Pending', 'Pre Production', 'Production', 'Post', 'Paused', 'Completed'];

/** Stages from the CP's Lists (admins can rename / add), in pipeline order; Paused sits before Completed. */
export function stageList() {
  const raw = (getList('stages') || FALLBACK_STAGES).map(s => (typeof s === 'object' ? s.label : s)).filter(Boolean);
  const rank = (s) => {
    const i = STAGE_FLOW.indexOf(s);
    if (s === 'Paused') return 3.5;
    return i === -1 ? 3.6 : i;
  };
  return [...new Set(raw)].sort((a, b) => rank(a) - rank(b));
}
export const stageColor = (s) => getListItemColor('stages', s) || '#8b93c7';
export const isDone = (s) => /^(completed|cancel)/i.test(s || '');
export const HEALTH = {
  on_track: { label: 'On track', color: '#2fd38a' },
  at_risk: { label: 'At risk', color: '#ffb547' },
  blocked: { label: 'Blocked', color: '#ff5c7a' },
};

// ── Dates (Israel calendar dates as YYYY-MM-DD) ──
export const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const utc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const daysUntil = (d, today = todayIL()) => (d ? Math.round((utc(d) - utc(today)) / 86400000) : null);
export const addDays = (d, n) => new Date(utc(d) + n * 86400000).toISOString().slice(0, 10);
export function shortDate(d) {
  if (!d) return '';
  return new Date(utc(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export function relTime(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function money(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

/** "In 4 days" / "Today" / "2d late" for a deadline. */
export function countdown(deadline, today = todayIL()) {
  const n = daysUntil(deadline, today);
  if (n == null) return null;
  if (n < 0) return { n: -n, unit: 'late', tone: 'red', text: `${-n}d late` };
  if (n === 0) return { n: 0, unit: 'today', tone: 'red', text: 'Today' };
  if (n <= 7) return { n, unit: n === 1 ? 'day' : 'days', tone: 'amber', text: `In ${n}d` };
  return { n, unit: 'days', tone: 'calm', text: `In ${n}d` };
}
export const TONE = { red: '#ff5c7a', amber: '#ffb547', calm: '#e8ecff' };

export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), className, style }) {
  const reduced = useReducedMotion();
  const final = Number(value) || 0;
  const [shown, setShown] = useState(reduced ? final : 0);
  useEffect(() => {
    if (reduced) { setShown(final); return undefined; }
    const c = animate(0, final, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => c.stop();
  }, [final, reduced]);
  return (
    <span className={className} style={{ display: 'inline-grid', ...style }}>
      <span style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{format(final)}</span>
      <span style={{ gridArea: '1 / 1' }}>{format(shown)}</span>
    </span>
  );
}

export function Face({ person, size = 26, ring = 'var(--trk-navy)', tone = 'internal' }) {
  const [failed, setFailed] = useState(false);
  const name = person?.name || '?';
  const initials = name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const bg = tone === 'external' ? 'linear-gradient(135deg,#ff7a1a,#ffb547)' : 'linear-gradient(135deg,#0808f8,#6f78ff)';
  return (
    <span title={person?.role ? `${name} · ${person.role}` : name}
      className="rounded-full overflow-hidden inline-flex items-center justify-center flex-none font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: bg, boxShadow: `0 0 0 2px ${ring}` }}>
      {person?.photo && !failed
        ? <img src={person.photo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : initials}
    </span>
  );
}

export function FaceStack({ list, max = 4, size = 24, tone }) {
  if (!list?.length) return null;
  return (
    <span className="inline-flex items-center">
      <span className="flex -space-x-1.5">{list.slice(0, max).map((m, i) => <Face key={`${m.name}${i}`} person={m} size={size} tone={tone || m.kind} />)}</span>
      {list.length > max && <span className="ml-1.5 text-[11px] font-semibold trk-muted">+{list.length - max}</span>}
    </span>
  );
}

export function StageDot({ stage, size = 8 }) {
  return <span className="inline-block rounded-full flex-none" style={{ width: size, height: size, background: stageColor(stage), boxShadow: `0 0 10px ${stageColor(stage)}` }} />;
}

export function HealthDot({ health, size = 8 }) {
  const h = HEALTH[health];
  if (!h) return null;
  return <span title={h.label} className={`inline-block rounded-full flex-none ${health === 'blocked' ? 'trk-pulse' : ''}`} style={{ width: size, height: size, background: h.color }} />;
}

/** Monday ticket statuses as coloured pills in a row (open first). */
export function TicketDots({ tickets, max = 10 }) {
  if (!tickets?.length) return null;
  const open = tickets.filter(t => t.open).length;
  return (
    <span className="inline-flex items-center gap-1.5" title={`${tickets.length} Monday ticket${tickets.length > 1 ? 's' : ''} · ${open} open`}>
      <span className="flex gap-[3px]">
        {tickets.slice(0, max).map(t => (
          <span key={t.id} className="rounded-full" style={{ width: t.open ? 14 : 6, height: 6, background: t.status?.color || '#c4c4c4', opacity: t.open ? 1 : 0.45 }} />
        ))}
      </span>
      <span className="text-[11px] font-semibold trk-muted">{open ? `${open} open` : 'all done'}</span>
    </span>
  );
}

export function BudgetBar({ budget, compact }) {
  if (!budget?.planned && !budget?.actual) return null;
  const pct = budget.planned ? budget.actual / budget.planned : 1;
  const over = budget.planned && pct > 1;
  const color = over ? '#ff5c7a' : pct > 0.9 ? '#ffb547' : '#4a55ff';
  return (
    <div>
      {!compact && (
        <div className="flex items-baseline justify-between text-[11px] mb-1">
          <span className="trk-muted">Budget</span>
          <span><b style={{ color: over ? '#ffb3c2' : '#fff' }}>{money(budget.actual)}</b> <span className="trk-dim">/ {budget.planned ? money(budget.planned) : '—'}</span></span>
        </div>
      )}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(pct * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

export function Signal({ s }) {
  return <span className={`trk-chip ${s.level}`}>{s.text}</span>;
}

/** Everyone on a production, in one list (internal first). */
export const teamOf = (p) => [...(p.team?.internal || []), ...(p.team?.external || [])];
