import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, Search, X, RefreshCw, Users, UserRound, Tv } from 'lucide-react';
import { Avatar, Seg } from './Bits';

const DAY = 86400000;
export function ymd(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }
export function addDays(s, n) { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function sundayOf(s) { const d = new Date(`${s}T12:00:00Z`); return addDays(s, -d.getUTCDay()); }

/** Preset → { from, to } (Israel dates; weeks run Sun–Sat) */
export function presetRange(preset, today = ymd(new Date())) {
  const sun = sundayOf(today);
  switch (preset) {
    case 'last_week': return { from: addDays(sun, -7), to: addDays(sun, -1) };
    case 'this_month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last_30': return { from: addDays(today, -29), to: today };
    case 'next_week': return { from: addDays(sun, 7), to: addDays(sun, 13) };
    default: return { from: sun, to: addDays(sun, 6) };
  }
}
export const PRESETS = [['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_30', 'Last 30 days']];
const fmt = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const rangeLabel = (r) => `${fmt(r.from)} – ${fmt(r.to)}`;

function Popover({ anchor, open, onClose, children, width = 280 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - width - 12) });
    const onDoc = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, anchor, onClose, width]);
  if (!open || !pos) return null;
  return createPortal(
    <div ref={ref} className="fixed z-[70] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 max-h-[60vh] overflow-y-auto" style={{ top: pos.top, left: pos.left, width }}>
      {children}
    </div>,
    document.body
  );
}

function PeoplePicker({ label, icon: Icon, people, value, onChange }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = people.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = people.filter(p => value.includes(p.id));
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border ${value.length ? 'border-[#0808f8] bg-[#0808f8]/5 text-[#0808f8]' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
        <Icon size={14} />
        {chosen.length === 1 ? chosen[0].name : chosen.length ? `${label} · ${chosen.length}` : label}
        {value.length > 0
          ? <X size={13} onClick={(e) => { e.stopPropagation(); onChange([]); }} className="opacity-60 hover:opacity-100" />
          : <ChevronDown size={13} className="opacity-50" />}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`}
          className="w-full text-sm px-3 py-2 mb-1 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff]" />
        {list.map(p => {
          const on = value.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => onChange(on ? value.filter(x => x !== p.id) : [...value, p.id])}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm ${on ? 'bg-[#0808f8]/8 text-[#030b2e] font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}>
              <Avatar person={p} size={24} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.count != null && <span className="text-[11px] text-gray-400">{p.count}</span>}
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${on ? 'bg-[#0808f8] border-[#0808f8]' : 'border-gray-300'}`}>{on && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}</span>
            </button>
          );
        })}
        {!list.length && <div className="text-xs text-gray-400 px-2 py-3">No matches</div>}
      </Popover>
    </>
  );
}

/** Sticky filter bar shared by every Studio tab. */
export default function Filters({ f, setF, range, data, loading, onRefresh, showDivision = true }) {
  const dateRef = useRef(null);
  const [dateOpen, setDateOpen] = useState(false);
  const people = Object.values(data?.people || {}).map(p => ({ ...p, count: (data.items || []).filter(i => i.people.includes(p.id)).length }))
    .sort((a, b) => b.count - a.count);
  const requesters = Object.values(data?.requesters || {}).map(p => ({ ...p, count: (data.items || []).filter(i => i.requested_by.includes(p.id)).length }))
    .sort((a, b) => b.count - a.count);
  const products = [...new Map((data?.items || []).filter(i => i.product?.label && i.product.label !== '-').map(i => [i.product.label, i.product])).values()]
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div className="sticky -top-6 z-20 -mx-6 px-6 pt-4 pb-3 flex flex-wrap items-center gap-2" style={{ background: 'var(--brand-bg, #f4f5f7)', boxShadow: '0 8px 12px -12px rgba(3,11,46,.25)' }}>
      <button ref={dateRef} type="button" onClick={() => setDateOpen(v => !v)}
        className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-800 hover:border-gray-300">
        <Calendar size={14} className="text-[#0808f8]" />
        {PRESETS.find(([k]) => k === f.preset)?.[1] || 'Custom'} <span className="text-gray-400 font-medium">{rangeLabel(range)}</span>
        <ChevronDown size={13} className="opacity-50" />
      </button>
      <Popover anchor={dateRef} open={dateOpen} onClose={() => setDateOpen(false)} width={300}>
        {PRESETS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setF({ ...f, preset: k }); setDateOpen(false); }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${f.preset === k ? 'bg-[#0808f8]/8 font-semibold text-[#030b2e]' : 'hover:bg-gray-50 text-gray-700'}`}>
            {label} <span className="text-gray-400 text-xs ml-1">{rangeLabel(presetRange(k))}</span>
          </button>
        ))}
        <div className="border-t border-gray-100 mt-1 pt-2 px-2 pb-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Custom</div>
          <div className="flex items-center gap-2">
            <input type="date" value={range.from} max={range.to} onChange={e => e.target.value && setF({ ...f, preset: 'custom', from: e.target.value, to: range.to })}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200" />
            <span className="text-gray-400">→</span>
            <input type="date" value={range.to} min={range.from} onChange={e => e.target.value && setF({ ...f, preset: 'custom', from: range.from, to: e.target.value })}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200" />
          </div>
        </div>
      </Popover>

      {showDivision && (
        <Seg value={f.division} onChange={(v) => setF({ ...f, division: v })}
          options={[['all', 'All'], ['design', 'Design'], ['video', 'Video'], ['tv', <span key="tv" className="inline-flex items-center gap-1"><Tv size={12} /> TV</span>]]} />
      )}
      <PeoplePicker label="People" icon={UserRound} people={people} value={f.people} onChange={(v) => setF({ ...f, people: v })} />
      <PeoplePicker label="Requesters" icon={Users} people={requesters} value={f.requesters} onChange={(v) => setF({ ...f, requesters: v })} />
      <select value={f.product} onChange={e => setF({ ...f, product: e.target.value })}
        className={`text-xs font-semibold px-3 py-2 rounded-xl border ${f.product ? 'border-[#0808f8] text-[#0808f8] bg-[#0808f8]/5' : 'border-gray-200 bg-white text-gray-700'}`}>
        <option value="">All products</option>
        {products.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
      </select>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Search tasks"
          className="w-44 text-xs pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-white outline-none focus:border-[#4a55ff]" />
      </div>
      {(f.people.length || f.requesters.length || f.product || f.q || f.division !== 'all' || f.status) ? (
        <button type="button" onClick={() => setF({ ...f, division: 'all', people: [], requesters: [], product: '', q: '', status: null })}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 px-2">Clear filters</button>
      ) : null}
      <button type="button" onClick={onRefresh} disabled={loading} title="Pull fresh data from Monday"
        className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-gray-600 hover:bg-white">
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {data?.generated_at ? `Updated ${new Date(data.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}
      </button>
    </div>
  );
}

/** Apply the bar's filters to the item list. */
export function applyFilters(items, f) {
  const q = f.q.trim().toLowerCase();
  return items.filter(it => {
    if (f.division !== 'all' && it.division !== f.division && !(f.division === 'video' && it.board === 'video' && it.division !== 'tv')) return false;
    if (f.people.length && !it.people.some(p => f.people.includes(p))) return false;
    if (f.requesters.length && !it.requested_by.some(p => f.requesters.includes(p))) return false;
    if (f.product && it.product?.label !== f.product) return false;
    if (f.status && !(it.board === f.status.board && it.status.label === f.status.label)) return false;
    if (q && !`${it.name} ${it.campaign || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
export { DAY };
