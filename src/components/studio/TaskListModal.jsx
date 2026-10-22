import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Filter, ArrowUpDown, Tv, Mail } from 'lucide-react';
import { Avatar, StatusPill, ProductTag, hrs, DIVISION, TimelinePill } from './Bits';
import { useStudio, workdaysSince } from './writes';

const BOARD_LABEL = { video: 'Video', design: 'Design', retention: 'Email' };
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '–');

/**
 * Drill-down: the exact tasks behind any number on the dashboard
 * (e.g. Natalie → Completed, Video battery → Review, Overdue).
 */
export default function TaskListModal({ list, data, onClose, onFilter }) {
  const { openTask, writes } = useStudio();
  const [sort, setSort] = useState(['timeline', 1]);
  // Lists about time in a status open longest-first
  useEffect(() => { setSort(list?.statusAge ? ['age', -1] : ['timeline', 1]); }, [list]);
  useEffect(() => {
    // Esc closes the task panel first when one is open on top
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[data-task-panel]')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const items = useMemo(() => {
    const [k, dir] = sort;
    const v = (it) => (k === 'age' ? -(Date.parse(it.status_since) || Date.now()) : k === 'deadline' ? (it.deadline || '9999') : k === 'timeline' ? (it.timeline?.from || '9999') : k === 'effort' ? (it.effort_s || 0) : k === 'status' ? it.status.label : it.name.toLowerCase());
    // Show each task as it is now (a change made in the task panel shows here straight away)
    const now = new Map([...(data.items || []), ...(data.emails || [])].map(i => [`${i.board}:${i.id}`, i]));
    return (list?.items || []).map(i => now.get(`${i.board}:${i.id}`) || writes.merge(i)).filter(i => !i.archived)
      .sort((a, b) => { const x = v(a); const y = v(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }, [list, sort, data, writes]);
  if (!list) return null;
  const today = data.today;
  const totalEffort = items.reduce((a, i) => a + (i.effort_s || 0), 0);
  const Head = ({ k, children, right }) => (
    <button type="button" onClick={() => setSort([k, sort[0] === k ? -sort[1] : (k === 'effort' ? -1 : 1)])}
      className={`inline-flex items-center gap-1 hover:text-gray-700 ${right ? 'justify-end w-full' : ''}`}>
      {children}{sort[0] === k && <ArrowUpDown size={11} />}
    </button>
  );
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 md:p-10" style={{ background: 'rgba(3,11,46,.45)' }} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-full bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          {list.person && <Avatar person={list.person} size={36} />}
          {list.color && !list.person && <span className="w-3.5 h-3.5 rounded-full flex-none" style={{ background: list.color }} />}
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-[#030b2e] truncate">{list.title}</div>
            <div className="text-xs text-gray-500">{items.length} task{items.length === 1 ? '' : 's'}{totalEffort ? ` · ${hrs(totalEffort)} worked in this period` : ''}{list.subtitle ? ` · ${list.subtitle}` : ''}</div>
          </div>
          {list.filter && onFilter && (
            <button type="button" onClick={() => { onFilter(list.filter); onClose(); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:border-[#0808f8] hover:text-[#0808f8]">
              <Filter size={13} /> Filter the dashboard
            </button>
          )}
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="py-2 px-4 font-semibold"><Head k="name">Task</Head></th>
                <th className="py-2 px-2 font-semibold">Who</th>
                <th className="py-2 px-2 font-semibold"><Head k="status">Status</Head></th>
                <th className="py-2 px-2 font-semibold"><Head k="timeline">Timeline</Head></th>
                <th className="py-2 px-2 font-semibold"><Head k="deadline">Deadline</Head></th>
                <th className="py-2 px-2 font-semibold text-right"><Head k="effort" right>Worked</Head></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const late = it.open && it.deadline && it.deadline < today;
                return (
                  <tr key={`${it.board}:${it.id}`} onClick={() => openTask(it)} className="border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer">
                    <td className="py-2.5 px-4 max-w-[440px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-none text-white" style={{ background: it.board === 'retention' ? '#00a9a5' : DIVISION[it.division]?.color || '#888' }}>
                          {it.board === 'retention' ? <Mail size={10} className="inline" /> : it.division === 'tv' ? 'TV' : BOARD_LABEL[it.board]}
                        </span>
                        <span className="truncate text-gray-900" title={it.name}>{it.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ProductTag product={it.product} />
                        {it.tv?.name && <span className="text-[11px] text-[#ff7a1a] flex items-center gap-1 truncate"><Tv size={10} /> {it.tv.name}</span>}
                        {it.requested_by?.length > 0 && <span className="text-[11px] text-gray-400 truncate">for {it.requested_by.map(r => data.requesters[r]?.name.split(' ')[0]).filter(Boolean).join(', ')}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-2"><div className="flex -space-x-1.5">{it.people.map(p => data.people[p] && <Avatar key={p} person={data.people[p]} size={24} ring="#fff" />)}</div></td>
                    <td className="py-2.5 px-2">
                      <StatusPill status={it.status} small />
                      {list.statusAge && it.status_since && (
                        <div className="text-[10px] text-amber-700 font-semibold mt-0.5 whitespace-nowrap" title={`Since ${new Date(it.status_since).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' })}`}>
                          for {workdaysSince(it.status_since, today)} workdays{it.status_since_partial ? '+' : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2"><TimelinePill timeline={it.timeline} today={today} color={it.status.color} small /></td>
                    <td className={`py-2.5 px-2 text-xs whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{fmtDate(it.deadline)}</td>
                    <td className="py-2.5 px-2 text-xs text-right tabular-nums font-semibold text-gray-900">{hrs(it.effort_s)}</td>
                    <td className="py-2.5 px-3">{it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-300 hover:text-[#0808f8]" title="Open in Monday"><ExternalLink size={14} /></a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!items.length && <div className="text-sm text-gray-400 text-center py-12">Nothing here.</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
