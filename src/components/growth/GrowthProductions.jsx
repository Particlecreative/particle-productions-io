// Productions for the Growth team (Tomer, 17 Nov 2026): every production as a timeline — stage, product, type, producer,
// planned dates, shoot days, delivery and on-air. No money: the server sends Growth only these fields.
import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Film, Clapperboard, Tv } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { useBrand } from '../../context/BrandContext';
import { getListItemColor } from '../../lib/listService';

const NAVY = '#030b2e';
const STAGE_ORDER = ['Pending', 'Pre Production', 'Production', 'Post', 'Wrap-up', 'Paused', 'Completed'];
const day = (v) => (v ? String(v).slice(0, 10) : null);
const utc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const monthStart = (d, add = 0) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + add, 1)); return x.toISOString().slice(0, 10); };
const fmt = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
const stageColor = (s) => getListItemColor('stages', s) || '#8b93c7';
const shootDays = (p) => (Array.isArray(p.shoot_dates) ? p.shoot_dates : []).map(x => day(typeof x === 'string' ? x : x?.date || x?.start)).filter(Boolean);

export default function GrowthProductions() {
  const { brandId } = useBrand();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [view, setView] = useState('timeline');
  const today = todayIL();
  const [from, setFrom] = useState(() => monthStart(today, -1));
  const months = 6;
  const to = monthStart(from, months);

  useEffect(() => {
    let on = true;
    setRows(null); setError(null);
    apiGet(`/productions?brand_id=${encodeURIComponent(brandId)}`).then(r => on && setRows(Array.isArray(r) ? r : [])).catch(e => on && setError(e.message));
    return () => { on = false; };
  }, [brandId]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter(p =>
      (showDone || stage === 'Completed' || !/^completed|cancel/i.test(p.stage || '')) &&
      (!stage || p.stage === stage) &&
      (!needle || [p.id, p.project_name, p.producer, p.production_type, ...(Array.isArray(p.product_type) ? p.product_type : [p.product_type])].filter(Boolean).some(v => String(v).toLowerCase().includes(needle))))
      .sort((a, b) => String(day(a.planned_start) || '9999').localeCompare(String(day(b.planned_start) || '9999')));
  }, [rows, q, stage, showDone]);
  const counts = useMemo(() => {
    const m = {};
    for (const p of rows || []) m[p.stage || 'Pending'] = (m[p.stage || 'Pending'] || 0) + 1;
    return STAGE_ORDER.filter(s => m[s]).map(s => [s, m[s]]).concat(Object.entries(m).filter(([s]) => !STAGE_ORDER.includes(s)));
  }, [rows]);

  const span = utc(to) - utc(from);
  const x = (d) => Math.min(100, Math.max(0, ((utc(d) - utc(from)) / span) * 100));
  const monthList = Array.from({ length: months }, (_, i) => monthStart(from, i));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-white border border-gray-200">
        <label className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search productions, products, producers"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gray-300 outline-none" />
        </label>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setStage('')} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${!stage ? 'bg-[#030b2e] text-white' : 'bg-gray-100 text-gray-600'}`}>All</button>
          {counts.map(([s, n]) => (
            <button key={s} type="button" onClick={() => setStage(stage === s ? '' : s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${stage === s ? 'text-white' : 'bg-gray-100 text-gray-700'}`} style={stage === s ? { background: stageColor(s) } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: stage === s ? '#fff' : stageColor(s) }} />{s} <span className="opacity-70 tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 ml-auto cursor-pointer"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed</label>
        <div className="flex bg-gray-100 rounded-xl p-0.5">
          {[['timeline', 'Timeline'], ['list', 'List']].map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${view === k ? 'bg-white shadow-sm text-[#030b2e]' : 'text-gray-500'}`}>{l}</button>)}
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
      {!rows && !error && <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}

      {rows && view === 'timeline' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: 'minmax(180px, 280px) 1fr' }}>
            <div className="px-4 py-2 flex items-center gap-1">
              <button type="button" onClick={() => setFrom(monthStart(from, -1))} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Earlier"><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setFrom(monthStart(today, -1))} className="text-xs font-semibold px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-600">Today</button>
              <button type="button" onClick={() => setFrom(monthStart(from, 1))} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Later"><ChevronRight size={16} /></button>
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: `repeat(${months}, 1fr)` }}>
              {monthList.map(m => <div key={m} className="px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-l border-gray-100">{new Date(`${m}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</div>)}
            </div>
          </div>
          {!list.length && <div className="py-10 text-center text-sm text-gray-400">No productions match.</div>}
          {list.map(p => {
            const s = day(p.planned_start), e = day(p.planned_end) || s;
            const visible = s && e >= from && s < to;
            const shoots = shootDays(p).filter(d => d >= from && d < to);
            const color = stageColor(p.stage);
            return (
              <div key={p.id} className="grid border-b border-gray-50 hover:bg-[#f5f6ff]" style={{ gridTemplateColumns: 'minmax(180px, 280px) 1fr' }}>
                <div className="px-4 py-2 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: NAVY }} title={p.project_name}>{p.project_name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{p.id} · <span style={{ color }}>{p.stage}</span>{p.production_type ? ` · ${p.production_type}` : ''}{p.producer ? ` · ${p.producer.split(' ')[0]}` : ''}</div>
                </div>
                <div className="relative h-[46px]">
                  {monthList.map((m, i) => <div key={m} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${(i / months) * 100}%` }} />)}
                  {today >= from && today < to && <div className="absolute top-0 bottom-0 w-px bg-[#0808f8]/50" style={{ left: `${x(today)}%` }} />}
                  {visible && (
                    <div className="absolute top-[13px] h-[20px] rounded-full flex items-center px-2 text-[10.5px] font-semibold text-white overflow-hidden whitespace-nowrap"
                      title={`${fmt(s)} → ${fmt(e)}`} style={{ left: `${x(s)}%`, width: `${Math.max(1.2, x(e) - x(s) + (100 / (span / 86400000)))}%`, background: color }}>
                      {(Array.isArray(p.product_type) ? p.product_type : [p.product_type]).filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {shoots.map(d => <span key={d} title={`Shoot ${fmt(d)}`} className="absolute top-[8px] w-2.5 h-2.5 rounded-full border-2 border-white" style={{ left: `calc(${x(d)}% - 5px)`, background: '#ff7a1a' }} />)}
                  {[['delivery_date', '#00c875', 'Delivery'], ['air_date', '#e2445c', 'On air']].map(([k, c, l]) => {
                    const d = day(p[k]);
                    return d && d >= from && d < to ? <span key={k} title={`${l} ${fmt(d)}`} className="absolute bottom-[6px] w-0 h-0" style={{ left: `calc(${x(d)}% - 5px)`, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `8px solid ${c}` }} /> : null;
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-4 px-4 py-2 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff7a1a' }} /> Shoot day</span>
            <span className="flex items-center gap-1.5"><span className="w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '8px solid #00c875' }} /> Delivery</span>
            <span className="flex items-center gap-1.5"><span className="w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '8px solid #e2445c' }} /> On air</span>
            <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-[#0808f8]/60" /> Today</span>
          </div>
        </div>
      )}

      {rows && view === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              {['Production', 'Stage', 'Product', 'Type', 'Producer', 'Planned', 'Shoot', 'Delivery / on air'].map(h => <th key={h} className="px-4 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-[#f5f6ff]">
                  <td className="px-4 py-2.5"><div className="font-semibold" style={{ color: NAVY }}>{p.project_name}</div><div className="text-[11px] text-gray-400">{p.id}</div></td>
                  <td className="px-4 py-2.5 whitespace-nowrap"><span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="w-2 h-2 rounded-full" style={{ background: stageColor(p.stage) }} />{p.stage}</span></td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{(Array.isArray(p.product_type) ? p.product_type : [p.product_type]).filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{p.production_type || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{p.producer || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fmt(day(p.planned_start))} → {fmt(day(p.planned_end))}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600"><span className="inline-flex items-center gap-1"><Clapperboard size={12} className="text-gray-400" />{shootDays(p).map(fmt).join(', ') || '—'}</span></td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap"><span className="inline-flex items-center gap-1"><Film size={12} className="text-gray-400" />{fmt(day(p.delivery_date))}</span> · <span className="inline-flex items-center gap-1"><Tv size={12} className="text-gray-400" />{fmt(day(p.air_date))}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <div className="py-10 text-center text-sm text-gray-400">No productions match.</div>}
        </div>
      )}
    </div>
  );
}
