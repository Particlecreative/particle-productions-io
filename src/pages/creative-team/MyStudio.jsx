// My Studio — the Creative team's own board (Tomer, 25 Nov 2026: "the Kanban look the team loves the most — make it even
// better and smarter, arranged by timelines, deadlines and priority"; "my tasks — a table by status / brand"; "workload").
// Board (by status like Monday, or by when it's due) · My tasks (table, grouped by status or brand) · Week (my timeline).
// Drag a card to another status — it moves on Monday as you. Everything is arranged per person and remembered.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FrameBadge, ChecklistChip, boxesOf } from '../../components/studio/Bench';
import { EMPTY_FILTERS, DEFAULT_COLUMNS, passes, sortItems, groupItems, statusMix, campaignsOf, activeCount } from '../../components/creative-team/boardTools';
import { ViewsBar, QuickFilters, FilterButton, ActiveFilters, SortButton, GroupButton, ColumnsButton } from '../../components/creative-team/BoardToolbar';
import { studioApi as benchApi } from '../../lib/studioService';
import { useLive } from '../../lib/useLive';

import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Search, KanbanSquare, List, CalendarRange, Flag, ArrowRight, SlidersHorizontal, ChevronDown, ChevronRight, ChevronLeft, Film, Folder, PenTool, Link2,
  RefreshCw, Loader2, CircleCheck, AlertTriangle, Clock, Eye, EyeOff,
} from 'lucide-react';
import CreativeShell, { MyTasksProvider, useMyTasks, FreshBadge } from '../../components/creative-team/CreativeShell';
import { useStudio, fmtDay, firstName } from '../../components/studio/writes';
import { Avatar } from '../../components/studio/Bits';
import { statusColumns, dueColumns, smartSort, urgency, dueWords, nextStatus, priorityRank, matchTask } from '../../components/studio/kanban';
import { useAuth } from '../../context/AuthContext';
import { getViewOrder, saveViewOrder } from '../../lib/dataService';
import { meApi } from '../../lib/meService';

// The bench on the cards (25 Nov 2026): the latest Frame.io version + comments, the delivery checklist's progress
const BenchCtx = createContext({ frame: {}, checks: {} });

const PREFS_KEY = 'creative-board';
const DEFAULT_PREFS = {
  view: 'board', group: 'status', showDone: false, compact: false, tableBy: 'status', fields: { timeline: true, links: true, priority: true, requester: true },
  // Monday-style (25 Nov 2026): filters by every field, sort, table columns, saved views
  filters: EMPTY_FILTERS, sort: { key: 'smart', dir: 'asc' }, columns: DEFAULT_COLUMNS, views: [], activeView: null,
};
const VIEW_STATE = ['view', 'group', 'tableBy', 'showDone', 'filters', 'sort', 'columns'];
const stateOf = (p) => Object.fromEntries(VIEW_STATE.map(k => [k, p[k]]));
const URG_STYLE = {
  overdue: 'bg-red-50 text-red-700 border-red-200', today: 'bg-orange-50 text-orange-700 border-orange-200', soon: 'bg-amber-50 text-amber-700 border-amber-200',
  week: 'bg-blue-50 text-blue-700 border-blue-100', later: 'bg-gray-50 text-gray-600 border-gray-200', none: 'bg-gray-50 text-gray-400 border-gray-200', done: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};
const LINKS = [['frame', 'Frame.io', Film], ['dropbox', 'Dropbox', Folder], ['figma', 'Figma', PenTool], ['project', 'Project', Link2]];

/** Their saved arrangement (view, grouping, what a card shows) — per person, on the server. */
function usePrefs() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const loaded = useRef(false);
  useEffect(() => {
    if (!user?.id) return;
    Promise.resolve(getViewOrder(PREFS_KEY, user.id)).then((p) => {
      if (p && typeof p === 'object' && !Array.isArray(p)) setPrefs({ ...DEFAULT_PREFS, ...p, fields: { ...DEFAULT_PREFS.fields, ...(p.fields || {}) }, filters: { ...EMPTY_FILTERS, ...(p.filters || {}) }, columns: Array.isArray(p.columns) && p.columns.length ? p.columns : DEFAULT_COLUMNS });
      loaded.current = true;
    }).catch(() => { loaded.current = true; });
  }, [user?.id]);
  const update = useCallback((patch) => setPrefs((p) => {
    const next = { ...p, ...patch, fields: { ...p.fields, ...(patch.fields || {}) }, filters: patch.filters ? { ...EMPTY_FILTERS, ...patch.filters } : p.filters };
    if (user?.id) Promise.resolve(saveViewOrder(PREFS_KEY, user.id, next, false)).catch(() => null);
    return next;
  }), [user?.id]);
  return [prefs, update];
}

function DueChip({ it, today }) {
  const u = urgency(it, today);
  const w = dueWords(it, today);
  if (!w) return null;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${URG_STYLE[u]}`}>{u === 'overdue' ? <AlertTriangle size={11} /> : <Clock size={11} />}{w}</span>;
}

function PriorityFlag({ p }) {
  const r = priorityRank(p);
  if (r > 1) return null;
  const label = p && typeof p === 'object' ? p.label : p;
  return <span title={`Priority: ${label}`} className={`inline-flex items-center gap-0.5 text-[10.5px] font-bold px-1.5 py-0.5 rounded-md ${r === 0 ? 'bg-red-600 text-white' : 'bg-orange-100 text-orange-700'}`}><Flag size={10} />{r === 0 ? 'Critical' : 'High'}</span>;
}

const range = (t) => (t?.from ? (t.to && t.to !== t.from ? `${fmtDay(t.from)} – ${fmtDay(t.to)}` : fmtDay(t.from)) : '');

function LinkIcons({ it }) {
  const list = LINKS.filter(([k]) => it.links?.[k]);
  if (!list.length) return null;
  return (
    <span className="flex items-center gap-1">
      {list.map(([k, label, Icon]) => (
        <a key={k} href={it.links[k]} target="_blank" rel="noopener noreferrer" title={`Open ${label}`} onClick={(e) => e.stopPropagation()}
          className="w-6 h-6 rounded-md flex items-center justify-center text-gray-500 bg-gray-50 hover:bg-[#0808f8]/10 hover:text-[#0808f8]"><Icon size={13} /></a>
      ))}
    </span>
  );
}

function TaskCard({ it, today, people, statuses, prefs, onOpen, onMove, onLink, draggable }) {
  // the delivery link this task still needs (Frame.io for video, Figma for design) — while it's being worked on
  const needs = ['in_progress', 'fixes'].includes(it.status?.category) ? (it.board === 'video' ? (!it.links?.frame && 'Frame.io') : it.board === 'design' ? (!it.links?.figma && 'Figma') : null) : null;
  const nxt = nextStatus(it, statuses);
  const asked = (it.requested_by || []).map(id => people[id]).filter(Boolean);
  const f = prefs.fields;
  return (
    <div draggable={draggable} onDragStart={(e) => { e.dataTransfer.setData('text/task', it.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => onOpen(it)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(it); }}
      className={`group relative rounded-xl bg-white border border-gray-200 hover:border-[#0808f8]/30 hover:shadow-md shadow-[0_1px_2px_rgba(3,11,46,.05)] transition-all cursor-pointer ${prefs.compact ? 'p-2.5' : 'p-3'} ${draggable ? 'active:cursor-grabbing' : ''}`}>
      <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full" style={{ background: it.product?.color || '#c4c4c4' }} />
      <div className="flex items-center gap-1.5 flex-wrap pl-1">
        {it.product?.label && <span className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: it.product.color || '#676879' }}>{it.product.label}</span>}
        {it.type?.label && <span className="text-[10.5px] text-gray-400">· {it.type.label}</span>}
        <span className="ml-auto flex items-center gap-1"><FreshBadge id={it.id} />{f.priority && <PriorityFlag p={it.priority} />}</span>
      </div>
      <div className={`pl-1 mt-1 font-semibold text-[#030b2e] leading-snug ${prefs.compact ? 'text-[12.5px] line-clamp-2' : 'text-[13.5px] line-clamp-3'}`}>{it.title || it.name}</div>
      {!prefs.compact && it.subtitle && <div className="pl-1 text-[11.5px] text-gray-400 truncate mt-0.5">{it.subtitle}</div>}
      <div className="pl-1 mt-2 flex items-center gap-1.5 flex-wrap">
        <DueChip it={it} today={today} />
        {f.timeline && it.timeline?.from && <span className="inline-flex items-center gap-1 text-[11px] text-gray-500"><CalendarRange size={11} />{range(it.timeline)}</span>}
        <BenchChips it={it} />
        <span className="ml-auto flex items-center gap-1.5">
          {f.links && <LinkIcons it={it} />}
          {f.requester && asked.slice(0, 2).map(p => <Avatar key={p.id} person={p} size={20} />)}
        </span>
      </div>
      {needs && onLink && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onLink(it); }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11.5px] font-semibold py-1 rounded-lg bg-[#0808f8]/[0.06] text-[#0808f8] hover:bg-[#0808f8]/10">
          + {needs} link
        </button>
      )}
      {nxt && onMove && !needs && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onMove(it, nxt); }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11.5px] font-semibold py-1 rounded-lg border border-dashed text-gray-500 hover:text-[#030b2e] sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
          style={{ borderColor: nxt.color }}>
          <ArrowRight size={12} /> Move to {nxt.label}
        </button>
      )}
    </div>
  );
}

function Board({ items, data, prefs, onOpen, onMove, onLink }) {
  const [over, setOver] = useState(null);
  const today = data.today;
  const cols = groupItems(items, prefs.group, { today, boards: data.boards, people: data.people || {}, hideDone: !prefs.showDone });
  const statusesOf = (it) => data.boards?.[it.board]?.statuses || [];
  const drop = (col, e) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/task');
    const it = items.find(x => x.id === id);
    if (!it || prefs.group !== 'status' || String(it.status?.label).toLowerCase() === col.key) return;
    const s = statusesOf(it).find(x => String(x.label).toLowerCase() === col.key);
    onMove(it, s || null, col.label);
  };
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x" style={{ scrollbarWidth: 'thin' }}>
      {cols.map(col => {
        const list = sortItems(col.items, prefs.sort, { today, boards: data.boards });
        return (
          <section key={col.key} className={`flex-none w-[284px] snap-start rounded-2xl flex flex-col max-h-[calc(100vh-250px)] transition-colors ${over === col.key ? 'bg-[#0808f8]/[0.06]' : 'bg-[#f4f5f8]'}`}
            onDragOver={(e) => { if (prefs.group === 'status') { e.preventDefault(); setOver(col.key); } }} onDragLeave={() => setOver(o => (o === col.key ? null : o))} onDrop={(e) => drop(col, e)}>
            <header className="flex items-center gap-2 px-3 py-2.5 rounded-t-2xl text-white" style={{ background: col.color || '#c4c4c4' }}>
              <span className="font-bold text-[13.5px] truncate">{col.label}</span>
              <span className="text-[12px] font-semibold opacity-90">{col.items.length}</span>
            </header>
            <div className="p-2 flex flex-col gap-2 overflow-y-auto">
              {list.map(it => <TaskCard key={it.id} it={it} today={today} people={data.people || {}} statuses={statusesOf(it)} prefs={prefs} onOpen={onOpen} onMove={onMove} onLink={onLink} draggable={prefs.group === 'status'} />)}
              {!list.length && <div className="text-[12px] text-gray-400 text-center py-6">{prefs.group === 'status' ? 'Drop a task here' : 'Nothing'}</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** A status pill that opens the board's statuses — change it right in the table (as you, on Monday). */
function StatusCell({ it, statuses, onMove }) {
  const [at, setAt] = useState(null);   // where the menu opens (the table scrolls, so it floats above the page)
  const btn = useRef(null);
  const toggle = () => {
    if (at) { setAt(null); return; }
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const h = Math.min(288, statuses.length * 34 + 12);
    setAt({ left: Math.min(r.left, window.innerWidth - 200), top: r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - 4 - h) : r.bottom + 4 });
  };
  return (
    <span className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" onClick={toggle} className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md text-white min-w-[96px] text-center hover:brightness-110" style={{ background: it.status?.color || '#c4c4c4' }}>{it.status?.label || '—'}</button>
      {at && createPortal(
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setAt(null)} />
          <div className="fixed z-[91] w-48 rounded-xl border border-gray-200 bg-white shadow-2xl p-1.5 flex flex-col gap-1 max-h-72 overflow-y-auto" style={{ left: at.left, top: at.top }}>
            {statuses.map(st => (
              <button key={st.label} type="button" onClick={() => { setAt(null); if (st.label !== it.status?.label) onMove(it, st); }}
                className="text-[12px] font-semibold px-2.5 py-1.5 rounded-md text-white text-left hover:brightness-110 flex items-center gap-1" style={{ background: st.color || '#c4c4c4' }}>
                <span className="flex-1">{st.label}</span>{st.label === it.status?.label && <CircleCheck size={12} />}
              </button>
            ))}
          </div>
        </>, document.body,
      )}
    </span>
  );
}

const SORT_OF_COLUMN = { status: 'status', priority: 'priority', product: 'product', deadline: 'deadline', timeline: 'timeline', created: 'created', name: 'name' };
const COL_W = { status: 140, priority: 110, product: 160, type: 130, brand: 110, campaign: 160, requester: 120, deadline: 130, timeline: 140, links: 100, frame: 110, checklist: 90, board: 90, created: 100 };
const HEAD = { status: 'Status', priority: 'Priority', product: 'Product', type: 'Type', brand: 'Brand', campaign: 'Campaign', requester: 'Requested by', deadline: 'Deadline', timeline: 'Timeline', links: 'Links', frame: 'Frame.io', checklist: 'Checklist', board: 'Board', created: 'Created' };

function Table({ items, data, prefs, update, onOpen, onMove }) {
  const [closed, setClosed] = useState({});
  const bench = useContext(BenchCtx);
  const today = data.today;
  const people = data.people || {};
  const groups = useMemo(() => groupItems(items, prefs.tableBy || 'status', { today, boards: data.boards, people, hideDone: !prefs.showDone }).filter(g => g.items.length), [items, data.boards, prefs.tableBy, prefs.showDone, today, people]);
  const cols = prefs.columns?.length ? prefs.columns : DEFAULT_COLUMNS;
  const statusesOf = (it) => data.boards?.[it.board]?.statuses || [];
  const allClosed = groups.length > 0 && groups.every(g => closed[g.key]);
  const sortBy = (k) => { const key = SORT_OF_COLUMN[k]; if (!key) return; update({ sort: { key, dir: prefs.sort?.key === key && prefs.sort?.dir !== 'desc' ? 'desc' : 'asc' } }); };
  const arrow = (k) => (SORT_OF_COLUMN[k] && prefs.sort?.key === SORT_OF_COLUMN[k] ? (prefs.sort.dir === 'desc' ? ' ↓' : ' ↑') : '');
  const cell = (it, k) => {
    switch (k) {
      case 'status': return <StatusCell it={it} statuses={statusesOf(it)} onMove={onMove} />;
      case 'priority': return (it.priority?.label || it.priority) ? <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-md" style={{ background: `${it.priority?.color || '#c4c4c4'}22`, color: it.priority?.color || '#676879' }}>{it.priority?.label || it.priority}</span> : <span className="text-gray-300">—</span>;
      case 'product': return <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: it.product?.color || '#c4c4c4' }} />{it.product?.label || '—'}</span>;
      case 'type': return it.type?.label || <span className="text-gray-300">—</span>;
      case 'brand': return it.brand?.label || 'Particle';
      case 'campaign': return campaignsOf(it).join(', ') || <span className="text-gray-300">—</span>;
      case 'requester': return <span className="flex -space-x-1.5">{(it.requested_by || []).map(id => people[id]).filter(Boolean).slice(0, 3).map(p => <Avatar key={p.id} person={p} size={22} />)}</span>;
      case 'deadline': return <DueChip it={it} today={today} />;
      case 'timeline': return <span className="text-gray-500">{range(it.timeline) || '—'}</span>;
      case 'links': return <LinkIcons it={it} />;
      case 'frame': return <FrameBadge status={bench.frame[it.id]} compact /> || null;
      case 'checklist': return <ChecklistChip it={it} done={bench.checks[it.id]} />;
      case 'board': return it.board === 'design' ? 'Design' : 'Video';
      case 'created': return <span className="text-gray-500">{it.created_at ? fmtDay(String(it.created_at).slice(0, 10)) : '—'}</span>;
      default: return null;
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {groups.length > 1 && (
        <div className="flex justify-end -mb-2">
          <button type="button" onClick={() => setClosed(allClosed ? {} : Object.fromEntries(groups.map(g => [g.key, true])))} className="text-[12px] font-semibold text-gray-500 hover:text-gray-800">{allClosed ? 'Expand all' : 'Collapse all'}</button>
        </div>
      )}
      {groups.map(g => {
        const list = sortItems(g.items, prefs.sort, { today, boards: data.boards });
        const mix = statusMix(g.items);
        return (
          <section key={g.key} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <button type="button" onClick={() => setClosed(c => ({ ...c, [g.key]: !c[g.key] }))} className="w-full flex items-center gap-2 px-4 py-2.5 text-left" style={{ borderLeft: `4px solid ${g.color}` }}>
              {closed[g.key] ? <ChevronRight size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              <span className="font-bold text-[14px]" style={{ color: g.color }}>{g.label}</span>
              <span className="text-[12px] text-gray-400">{g.items.length} task{g.items.length === 1 ? '' : 's'}</span>
              {/* Monday's battery: the group's status mix */}
              {prefs.tableBy !== 'status' && (
                <span className="ml-auto hidden sm:flex w-40 h-2 rounded-full overflow-hidden bg-gray-100" title={mix.map(m => `${m.label}: ${m.n}`).join(' · ')}>
                  {mix.map(m => <span key={m.label} style={{ width: `${(m.n / g.items.length) * 100}%`, background: m.color }} />)}
                </span>
              )}
            </button>
            {!closed[g.key] && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] table-fixed" style={{ minWidth: 340 + cols.reduce((a, k) => a + (COL_W[k] || 120), 0) }}>
                  {/* the same column widths in every group — they line up like Monday's */}
                  <colgroup><col style={{ width: 340 }} />{cols.map(k => <col key={k} style={{ width: COL_W[k] || 120 }} />)}</colgroup>
                  <thead><tr className="text-[10.5px] uppercase tracking-wider text-gray-400 border-t border-gray-100">
                    <th className="text-left font-bold px-4 py-2 cursor-pointer hover:text-gray-700" onClick={() => sortBy('name')}>Task{arrow('name')}</th>
                    {cols.map(k => <th key={k} onClick={() => sortBy(k)} className={`text-left font-bold px-2 py-2 whitespace-nowrap ${SORT_OF_COLUMN[k] ? 'cursor-pointer hover:text-gray-700' : ''}`}>{HEAD[k]}{arrow(k)}</th>)}
                  </tr></thead>
                  <tbody>
                    {list.map(it => (
                      <tr key={it.id} onClick={() => onOpen(it)} className="border-t border-gray-100 hover:bg-[#0808f8]/[0.03] cursor-pointer">
                        <td className="px-4 py-2.5 max-w-[340px]">
                          <div className="flex items-center gap-1.5 min-w-0"><span className="font-semibold text-[#030b2e] truncate">{it.title || it.name}</span><FreshBadge id={it.id} /></div>
                          {it.subtitle && <div className="text-[11.5px] text-gray-400 truncate">{it.subtitle}</div>}
                        </td>
                        {cols.map(k => <td key={k} className="px-2 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis">{cell(it, k)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {!groups.length && <div className="text-center text-gray-400 py-12">No tasks match.</div>}
    </div>
  );
}

/** Two working weeks (Sun–Thu) with each task's timeline as a bar; the deadline as a ◆. */
function Week({ items, data, onOpen }) {
  // Weeks back and forward, finished tasks included (Tomer, 25 Nov 2026: "let me see next weeks and previous weeks, including completed things")
  const today = data.today;
  const sunday = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); };
  const add = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const [offset, setOffset] = useState(0);
  const [showDone, setShowDone] = useState(() => { try { return localStorage.getItem('cp_week_done') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('cp_week_done', showDone ? '1' : '0'); } catch { /* ignore */ } }, [showDone]);
  const start = add(sunday(today), offset * 7);
  const days = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map(n => add(start, n));
  const first = days[0], lastDay = days[days.length - 1];
  const idx = (d) => { let i = days.findIndex(x => x >= d); if (i === -1) i = days.length; return i; };
  const done = (it) => !it.open || it.status?.category === 'delivered';
  const pool = items.filter(it => showDone || !done(it));
  // on the grid: a timeline that touches the two weeks, else a deadline inside them (a one-day block)
  const spanOf = (it) => (it.timeline?.from ? { from: it.timeline.from, to: it.timeline.to || it.timeline.from } : it.deadline ? { from: it.deadline, to: it.deadline, byDeadline: true } : null);
  const placed = smartSort(pool.filter(it => { const sp = spanOf(it); return sp && sp.from <= lastDay && sp.to >= first; }), today)
    .sort((a, b) => Number(done(a)) - Number(done(b)));
  const unscheduled = offset === 0 ? smartSort(items.filter(it => it.open && !spanOf(it)), today) : [];
  const doneHere = placed.filter(done).length;
  const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const label = offset === 0 ? 'This week & next' : offset === -1 ? 'Last week & this week' : offset === 1 ? 'Next two weeks' : `${fmt(first)} – ${fmt(add(start, 11))}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-gray-200 bg-white">
          <button type="button" onClick={() => setOffset(o => o - 1)} className="p-2 text-gray-500 hover:text-[#030b2e]" aria-label="A week back"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setOffset(0)} className="px-2 text-[12.5px] font-bold text-[#030b2e] min-w-[150px]" title="Back to this week">{label}</button>
          <button type="button" onClick={() => setOffset(o => o + 1)} className="p-2 text-gray-500 hover:text-[#030b2e]" aria-label="A week forward"><ChevronRight size={16} /></button>
        </div>
        <span className="text-[12px] text-gray-400">{fmt(first)} – {fmt(add(start, 11))}</span>
        <label className="ml-auto flex items-center gap-2 text-[12.5px] text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="w-4 h-4 accent-[#0808f8]" /> Show finished{doneHere ? ` (${doneHere})` : ''}
        </label>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(10, minmax(84px, 1fr))', minWidth: 860 }}>
          {days.map((d, i) => (
            <div key={d} className={`px-2 py-2 text-[11px] font-bold border-b border-gray-100 ${i === 5 ? 'border-l-2 border-l-gray-200' : ''} ${d === today ? 'text-[#0808f8] bg-[#0808f8]/[0.05]' : d < today ? 'text-gray-300' : 'text-gray-400'}`}>
              {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
            </div>
          ))}
          {placed.map(it => {
            const sp = spanOf(it);
            const a = Math.max(0, idx(sp.from));
            const b = Math.min(days.length, idx(add(sp.to, 1)));
            const fin = done(it);
            const dl = !sp.byDeadline && it.deadline && it.deadline >= first && it.deadline <= lastDay ? idx(it.deadline) : null;
            return (
              <div key={it.id} className="contents">
                <button type="button" onClick={() => onOpen(it)} title={`${it.name}${fin ? ' · finished' : ''}`}
                  className={`m-1 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold truncate hover:brightness-110 shadow-sm relative flex items-center gap-1 ${fin ? 'text-emerald-800 dark:text-emerald-200 bg-emerald-50 border border-emerald-200' : 'text-white'}`}
                  style={{ gridColumn: `${a + 1} / ${Math.max(a + 2, b + 1)}`, ...(fin ? {} : { background: it.status?.color || '#579bfc' }) }}>
                  {fin && <CircleCheck size={12} className="flex-none text-emerald-600" />}
                  {sp.byDeadline && !fin && <span className="opacity-90 flex-none">◆</span>}
                  <span className="truncate">{it.title || it.name}</span>
                  {dl != null && <span className="ml-1 opacity-90 flex-none" title={`Deadline ${fmtDay(it.deadline)}`}>◆ {fmtDay(it.deadline)}</span>}
                </button>
              </div>
            );
          })}
        </div>
        {!placed.length && <div className="text-center text-[12.5px] text-gray-400 py-8">Nothing in these two weeks.</div>}
      </div>
      {unscheduled.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Not scheduled yet · {unscheduled.length}</div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map(it => (
              <button key={it.id} type="button" onClick={() => onOpen(it)} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] hover:border-[#0808f8]/40">
                <span className="w-2 h-2 rounded-full" style={{ background: it.status?.color }} /><span className="font-semibold text-[#030b2e] max-w-[260px] truncate">{it.title || it.name}</span><DueChip it={it} today={today} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Arrange({ prefs, update, onClose }) {
  const T = ({ k, label }) => (
    <label className="flex items-center justify-between gap-3 py-1.5 text-[13px] text-gray-700 cursor-pointer">
      {label}
      <input type="checkbox" checked={!!prefs.fields[k]} onChange={(e) => update({ fields: { [k]: e.target.checked } })} className="accent-[#0808f8] w-4 h-4" />
    </label>
  );
  return (
    <>
      <div className="fixed inset-0 z-[40]" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-[41] w-64 rounded-2xl border border-gray-200 bg-white shadow-2xl p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">A card shows</div>
        <T k="timeline" label="Timeline" /><T k="links" label="Frame.io · Dropbox · Figma" /><T k="priority" label="High / Critical priority" /><T k="requester" label="Who asked" />
        <div className="h-px bg-gray-100 my-2" />
        <label className="flex items-center justify-between gap-3 py-1.5 text-[13px] text-gray-700 cursor-pointer">Compact cards<input type="checkbox" checked={prefs.compact} onChange={(e) => update({ compact: e.target.checked })} className="accent-[#0808f8] w-4 h-4" /></label>
        <label className="flex items-center justify-between gap-3 py-1.5 text-[13px] text-gray-700 cursor-pointer">Show Done<input type="checkbox" checked={prefs.showDone} onChange={(e) => update({ showDone: e.target.checked })} className="accent-[#0808f8] w-4 h-4" /></label>
        <p className="text-[11px] text-gray-400 mt-2">Saved for you — it looks like this next time, on any computer.</p>
      </div>
    </>
  );
}

function BenchChips({ it }) {
  const b = useContext(BenchCtx);
  return <><FrameBadge status={b.frame[it.id]} compact /><ChecklistChip it={it} done={b.checks[it.id]} /></>;
}

function StudioBody() {
  const { data, error, loading, panelData, reload } = useMyTasks();
  const [bench, setBench] = useState({ frame: {}, checks: {} });
  const loadChecks = useCallback(() => benchApi.myChecklists().then(r => setBench(b => ({ ...b, checks: r.checklists || {} }))).catch(() => null), []);
  const loadFrame = useCallback(() => benchApi.myFrame().then(r => setBench(b => ({ ...b, frame: r.frame || {} }))).catch(() => null), []);
  useEffect(() => { loadChecks(); loadFrame(); }, [loadChecks, loadFrame]);
  useLive(loadChecks, { every: 60000 });
  useLive(loadFrame, { every: 5 * 60000 });
  const { writes, openTask } = useStudio();
  const [prefs, update] = usePrefs();
  const [q, setQ] = useState('');
  const [arrange, setArrange] = useState(false);
  const [params, setParams] = useSearchParams();

  const items = useMemo(() => (data?.items || []).map(it => writes.merge(it, data.generated_at)), [data, writes]);
  const names = useMemo(() => Object.fromEntries(Object.values(data?.people || {}).map(p => [p.id, p.name])), [data]);
  // Monday-style filters (every field) + search; the counts in the filter panel come from all tasks
  const fctx = useMemo(() => ({ today: data?.today, checks: bench.checks, boxes: (it) => boxesOf(it.sizes, it.versions) }), [data?.today, bench.checks]);
  const shown = useMemo(() => items.filter(it => passes(it, prefs.filters, fctx) && matchTask(it, q, names)), [items, prefs.filters, fctx, q, names]);
  // saved views: apply / save / delete; "dirty" when what's on screen differs from the view (or from Main's defaults)
  const activeView = (prefs.views || []).find(v => v.id === prefs.activeView) || null;
  const dirty = JSON.stringify(stateOf(prefs)) !== JSON.stringify(activeView ? { ...stateOf(DEFAULT_PREFS), ...activeView.state } : stateOf(DEFAULT_PREFS));
  const applyView = (id) => {
    const v = (prefs.views || []).find(x => x.id === id);
    update(v ? { ...v.state, filters: { ...EMPTY_FILTERS, ...(v.state.filters || {}) }, activeView: id } : { ...stateOf(DEFAULT_PREFS), activeView: null });
  };
  const saveView = (name) => {
    const id = `v${Date.now().toString(36)}`;
    update({ views: [...(prefs.views || []), { id, name: name.slice(0, 40), state: stateOf(prefs) }].slice(-12), activeView: id });
  };
  const deleteView = (id) => update({ views: (prefs.views || []).filter(v => v.id !== id), activeView: prefs.activeView === id ? null : prefs.activeView });
  const setFilters = (filters) => update({ filters });
  const open = useCallback((it) => openTask(it, panelData), [openTask, panelData]);
  const pasteLink = useCallback((it) => openTask(it, panelData, { focus: 'link' }), [openTask, panelData]);

  // ?task=<id> (a notification, Home) opens that task
  useEffect(() => {
    const id = params.get('task');
    if (!id || !data) return;
    const it = items.find(x => String(x.id) === id);
    if (it) open(it);
    params.delete('task'); setParams(params, { replace: true });
  }, [params, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (it, status, label) => {
    if (!status) { writes.setToast({ error: true, text: `This ${it.board} board has no “${label}” status` }); return; }
    if (writes.save(it, { status }, panelData)) setTimeout(() => reload(true), 2500);
  };

  const today = data?.today;
  const openItems = items.filter(it => it.open);
  const counts = today ? {
    overdue: openItems.filter(it => urgency(it, today) === 'overdue').length, today: openItems.filter(it => urgency(it, today) === 'today').length,
    working: openItems.filter(it => it.status?.category === 'in_progress').length, review: openItems.filter(it => it.status?.category === 'review').length,
  } : null;

  if (loading && !data) return <div className="py-24 text-center text-gray-400"><Loader2 className="inline animate-spin" /> Loading your tasks from Monday…</div>;
  if (error && !data) return <div className="py-16 text-center text-red-600">{error}</div>;
  if (!data?.me) return <div className="py-16 text-center text-gray-500 max-w-md mx-auto">{data?.warnings?.[0] || 'We couldn’t find you on Monday.'} <a href="/welcome" className="text-[#0808f8] font-semibold">Connect your Monday →</a></div>;

  const VIEWS = [['board', KanbanSquare, 'Board'], ['tasks', List, 'My tasks'], ['week', CalendarRange, 'Week']];
  return (
    <div className="flex flex-col gap-4">
      {counts && (
        <div className="flex flex-wrap gap-2">
          {[['overdue', 'Overdue', 'text-red-700 bg-red-50'], ['today', 'Due today', 'text-orange-700 bg-orange-50'], ['working', 'In progress', 'text-blue-700 bg-blue-50'], ['review', 'In review', 'text-lime-700 bg-lime-50']].map(([k, l, cls]) => (
            <span key={k} className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-xl ${cls}`}><b className="text-[15px]">{counts[k]}</b> {l}</span>
          ))}
        </div>
      )}
      <ViewsBar views={prefs.views || []} active={prefs.activeView} onApply={applyView} onSave={saveView} onDelete={deleteView} dirty={dirty} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-gray-200 bg-white p-1">
          {VIEWS.map(([k, Icon, l]) => (
            <button key={k} type="button" onClick={() => update({ view: k })} className={`flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg ${prefs.view === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:text-gray-800'}`}><Icon size={14} />{l}</button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[180px] max-w-[300px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search task, product, who asked…" className="w-full text-[13px] pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-[#0808f8]/50" />
        </label>
        <FilterButton items={items} filters={prefs.filters} onChange={setFilters} ctx={fctx} people={data.people || {}} />
        {prefs.view !== 'week' && <SortButton sort={prefs.sort} onChange={(sort) => update({ sort })} />}
        {prefs.view === 'board' && <GroupButton value={prefs.group} onChange={(group) => update({ group })} />}
        {prefs.view === 'tasks' && <GroupButton value={prefs.tableBy || 'status'} onChange={(tableBy) => update({ tableBy })} allowNone />}
        {prefs.view === 'tasks' && <ColumnsButton columns={prefs.columns?.length ? prefs.columns : DEFAULT_COLUMNS} onChange={(columns) => update({ columns })} />}
        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => update({ showDone: !prefs.showDone })} title={prefs.showDone ? 'Hide Done' : 'Show Done'} className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-2 rounded-xl border ${prefs.showDone ? 'border-[#0808f8]/40 text-[#0808f8] bg-[#0808f8]/5' : 'border-gray-200 bg-white text-gray-500'} hover:text-gray-800`}>{prefs.showDone ? <Eye size={15} /> : <EyeOff size={15} />}<span className="hidden xl:inline">Done</span></button>
          <button type="button" onClick={() => reload(true)} title="Refresh from Monday" className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-800"><RefreshCw size={15} /></button>
          <span className="relative">
            <button type="button" onClick={() => setArrange(v => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-gray-900"><SlidersHorizontal size={14} /> Cards</button>
            {arrange && <Arrange prefs={prefs} update={update} onClose={() => setArrange(false)} />}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <QuickFilters filters={prefs.filters} onChange={setFilters} />
        <span className="text-[12px] text-gray-400 ml-auto">{activeCount(prefs.filters) || q ? `Showing ${shown.length} of ${items.length}` : `${items.length} task${items.length === 1 ? '' : 's'}`}</span>
      </div>
      <ActiveFilters items={items} filters={prefs.filters} onChange={setFilters} ctx={fctx} people={data.people || {}} />
      <BenchCtx.Provider value={bench}>
      {prefs.view === 'board' && <Board items={shown} data={data} prefs={prefs} onOpen={open} onMove={move} onLink={pasteLink} />}
      {prefs.view === 'tasks' && <Table items={shown} data={data} prefs={prefs} update={update} onOpen={open} onMove={move} />}
      {prefs.view === 'week' && <Week items={shown} data={data} onOpen={open} />}
      </BenchCtx.Provider>
      {!!data.warnings?.length && <div className="text-[12px] text-amber-700">{data.warnings.join(' · ')}</div>}
      <p className="text-[11.5px] text-gray-400 flex items-center gap-1.5"><CircleCheck size={12} /> Drag a card to another status (or “Move to…”) — it changes on Monday as you. Timelines, people and deadlines are set by the studio.</p>
    </div>
  );
}

export default function MyStudio() {
  useEffect(() => { meApi.pageView('My Studio'); }, []);
  const { user } = useAuth();
  return (
    <MyTasksProvider>
      <CreativeShell eyebrow="My Studio" title={`${firstName(user?.name) || 'My'}’s board`} sub="Every task you’re on — by status, by deadline, as a table or on your week.">
        <StudioBody />
      </CreativeShell>
    </MyTasksProvider>
  );
}
