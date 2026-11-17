// Creative Studio → My requests (Tomer, 17 Nov 2026): the tickets the signed-in person asked for — their Monday user is
// the ticket's "Requested by" (their connected Monday, else their email on Monday). Open first, then finished (60 days).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, ExternalLink, Search, X } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { useStudio } from '../studio/writes';
import { Avatar, StatusPill, ProductTag, DIVISION, CATEGORY, NAVY, Seg } from '../studio/Bits';

const ORDER = ['stuck', 'fixes', 'review', 'in_progress', 'queued', 'paused', 'other', 'delivered'];
const dueOf = (it) => it.deadline || it.timeline?.to || null;
const fmt = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
let cache = null;

export default function MyRequests() {
  const { openTask } = useStudio();
  const [data, setData] = useState(() => cache?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [show, setShow] = useState('open');
  const [board, setBoard] = useState('all');
  const [q, setQ] = useState('');
  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try { const d = await studioApi.myRequests({ force }); cache = { data: d, at: Date.now() }; setData(d); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!cache || Date.now() - cache.at > 120000) load(); }, [load]);
  const today = data?.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  const counts = useMemo(() => {
    const c = {};
    for (const it of data?.items || []) if (it.open) c[it.status.category] = (c[it.status.category] || 0) + 1;
    return c;
  }, [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items || [])
      .filter(it => (show === 'all' || (show === 'open' ? it.open : !it.open)) && (board === 'all' || it.board === board) && (!needle || it.name.toLowerCase().includes(needle)))
      .sort((a, b) => ORDER.indexOf(a.status.category) - ORDER.indexOf(b.status.category) || String(dueOf(a) || '9999').localeCompare(String(dueOf(b) || '9999')));
  }, [data, show, board, q]);
  const open = (data?.items || []).filter(it => it.open);
  const late = open.filter(it => dueOf(it) && dueOf(it) < today).length;

  return (
    <div className="flex flex-col gap-3">
      {data?.me && (
        <div className="text-xs text-gray-500 px-1">
          Tickets where <b className="text-gray-700">{data.me.name || 'you'}</b> is “Requested by” on Monday{data.me.source === 'email' ? ' (found by your email — connect your Monday to be sure)' : ''}.
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Tile label="Open" value={open.length} />
        <Tile label="Working" value={counts.in_progress || 0} color={counts.in_progress ? CATEGORY.in_progress.color : undefined} />
        <Tile label="Pending" value={counts.queued || 0} />
        <Tile label="In review" value={counts.review || 0} color={counts.review ? CATEGORY.review.color : undefined} />
        <Tile label="Fixes" value={counts.fixes || 0} color={counts.fixes ? CATEGORY.fixes.color : undefined} />
        <Tile label="Late" value={late} color={late ? '#e2445c' : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-white border border-gray-200">
        <label className="relative flex-1 min-w-[180px] max-w-[320px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search my tickets" className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gray-300 outline-none" />
          {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400" aria-label="Clear search"><X size={14} /></button>}
        </label>
        <Seg value={show} onChange={setShow} options={[['open', 'Open'], ['done', 'Finished'], ['all', 'All']]} />
        <Seg value={board} onChange={setBoard} options={[['all', 'Video + Design'], ['video', 'Video'], ['design', 'Design']]} />
        <button type="button" onClick={() => load(true)} disabled={loading} className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
      {data?.warnings?.length > 0 && <div className="text-xs text-amber-700 px-1">{data.warnings.join(' · ')}</div>}
      {!data && !error && <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}

      {data && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {!rows.length && <div className="py-10 text-center text-sm text-gray-400">{show === 'open' ? 'Nothing open that you asked for.' : 'No tickets here.'}</div>}
          {rows.map(it => {
            const div = DIVISION[it.division] || DIVISION[it.board];
            const due = dueOf(it);
            const isLate = it.open && due && due < today;
            const people = it.people.map(id => data.people?.[id]).filter(Boolean);
            return (
              <div key={`${it.board}:${it.id}`} role="button" tabIndex={0} onClick={() => openTask(it, data)} onKeyDown={(e) => { if (e.key === 'Enter') openTask(it, data); }}
                className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-4 py-3 border-t border-gray-100 first:border-t-0 cursor-pointer hover:bg-[#f5f6ff]">
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <span className={`block text-sm truncate ${it.open ? 'font-medium' : 'text-gray-500'}`} style={it.open ? { color: NAVY } : undefined} title={it.name}>{it.title || it.name}</span>
                  <span className="flex items-center gap-2 text-[11px] text-gray-400 min-w-0 mt-0.5">
                    {div && <span className="font-semibold" style={{ color: div.color }}>{div.label}</span>}
                    <ProductTag product={it.product} />
                    {it.campaign && <span className="truncate">{it.campaign}</span>}
                  </span>
                </span>
                <StatusPill status={it.status} small />
                <span className="flex items-center -space-x-1.5 w-[70px]">
                  {people.slice(0, 3).map(p => <Avatar key={p.id} person={p} size={22} ring="#fff" />)}
                  {!people.length && <span className="text-[11px] text-gray-300 pl-1">no one yet</span>}
                </span>
                <span className={`text-xs w-[78px] ${isLate ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{due ? `${isLate ? 'Late · ' : ''}${fmt(due)}` : '—'}</span>
                {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Monday" className="p-1 text-gray-300 hover:text-gray-700"><ExternalLink size={14} /></a>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-black tabular-nums mt-0.5 leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: color || NAVY }}>{value}</div>
    </div>
  );
}
