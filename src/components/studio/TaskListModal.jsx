import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Filter, ArrowUpDown, Tv, Mail, ChevronDown, CalendarDays, CircleDot, Check } from 'lucide-react';
import { Avatar, StatusPill, ProductTag, hrs, DIVISION, TimelinePill } from './Bits';
import { useStudio, workdaysSince } from './writes';
import { addDays } from './Filters';

const BOARD_LABEL = { video: 'Video', design: 'Design', retention: 'Email' };
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '–');
const keyOf = (it) => `${it.board}:${it.id}`;
const isWorkday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() <= 4;   // Sun–Thu
/** n workdays later (Fri / Sat skipped); negative n goes back */
function shiftWorkdays(d, n) {
  let out = d; let left = Math.abs(n);
  while (left > 0) { out = addDays(out, n > 0 ? 1 : -1); if (isWorkday(out)) left--; }
  return out;
}
const nextSunday = (today) => { let d = addDays(today, 1); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) d = addDays(d, 1); return d; };

/**
 * Drill-down: the exact tasks behind any number on the dashboard
 * (e.g. Natalie → Completed, Video battery → Review, Overdue).
 */
export default function TaskListModal({ list, data, onClose, onFilter }) {
  const { openTask, writes } = useStudio();
  const [sort, setSort] = useState(['timeline', 1]);
  // Select several (24 Nov 2026): change their status or deadline together
  const canEdit = !!writes?.saveMany && !writes.readOnly;
  const [picked, setPicked] = useState(() => new Set());
  const lastClick = useRef(null);
  useEffect(() => { setPicked(new Set()); }, [list]);
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
  const chosen = items.filter(it => picked.has(keyOf(it)));
  const allOn = items.length > 0 && chosen.length === items.length;
  const toggle = (it, idx, shift) => {
    const from = lastClick.current;   // read now — the state update below runs later
    lastClick.current = idx;
    setPicked(p => {
      const n = new Set(p);
      const on = !n.has(keyOf(it));
      if (shift && from != null) {
        const [a, b] = [Math.min(from, idx), Math.max(from, idx)];
        for (const x of items.slice(a, b + 1)) { if (on) n.add(keyOf(x)); else n.delete(keyOf(x)); }
      } else if (on) n.add(keyOf(it)); else n.delete(keyOf(it));
      return n;
    });
  };
  const selectAll = () => setPicked(new Set(items.map(keyOf)));
  const selectNone = () => setPicked(new Set());
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
                {canEdit && (
                  <th className="py-2 pl-4 pr-0 w-8">
                    <input type="checkbox" aria-label={allOn ? 'Select none' : 'Select all'} checked={allOn}
                      ref={el => { if (el) el.indeterminate = chosen.length > 0 && !allOn; }}
                      onChange={() => (allOn ? selectNone() : selectAll())} className="w-4 h-4 accent-[#0808f8] cursor-pointer align-middle" />
                  </th>
                )}
                <th className={`py-2 ${canEdit ? 'pl-2' : 'pl-4'} pr-4 font-semibold`}><Head k="name">Task</Head></th>
                <th className="py-2 px-2 font-semibold">Who</th>
                <th className="py-2 px-2 font-semibold"><Head k="status">Status</Head></th>
                <th className="py-2 px-2 font-semibold"><Head k="timeline">Timeline</Head></th>
                <th className="py-2 px-2 font-semibold"><Head k="deadline">Deadline</Head></th>
                <th className="py-2 px-2 font-semibold text-right"><Head k="effort" right>Worked</Head></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const late = it.open && it.deadline && it.deadline < today;
                const on = picked.has(keyOf(it));
                return (
                  <tr key={keyOf(it)} onClick={() => openTask(it)} className={`border-b border-gray-50 cursor-pointer ${on ? 'bg-[#f2f3ff] hover:bg-[#eceeff]' : 'hover:bg-gray-50/70'}`}>
                    {canEdit && (
                      <td className="py-2.5 pl-4 pr-0 w-8 select-none" onMouseDown={e => { if (e.shiftKey) e.preventDefault(); }} onClick={e => { e.stopPropagation(); toggle(it, idx, e.shiftKey); }}>
                        <input type="checkbox" checked={on} readOnly aria-label={`Select ${it.title || it.name}`} className="w-4 h-4 accent-[#0808f8] cursor-pointer align-middle pointer-events-none" />
                      </td>
                    )}
                    <td className={`py-2.5 ${canEdit ? 'pl-2' : 'pl-4'} pr-4 max-w-[440px]`}>
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
        {canEdit && chosen.length > 0 && (
          <BulkBar chosen={chosen} total={items.length} data={data} today={today} writes={writes}
            onAll={selectAll} onNone={selectNone} onDone={selectNone} />
        )}
      </div>
    </div>,
    document.body
  );
}

/** The bar under a list once tasks are selected: how many, select all / none, and one change for all of them. */
/** Where a menu opens: fixed to the page (the list's frame clips anything outside it), above the button when there's room. */
function placeFor(el, height = 380) {
  const r = el.getBoundingClientRect();
  const right = Math.max(8, window.innerWidth - r.right);
  return r.top > height + 16 ? { bottom: window.innerHeight - r.top + 8, right } : { top: r.bottom + 8, right };
}

function BulkBar({ chosen, total, data, today, writes, onAll, onNone, onDone }) {
  const [menu, setMenuState] = useState(null);   // { kind: 'status' | 'deadline', at } | null
  const setMenu = (kind, e) => setMenuState(kind && e ? { kind, at: placeFor(e.currentTarget, kind === 'deadline' ? 380 : 220) } : null);
  const n = chosen.length;
  const boards = [...new Set(chosen.map(it => it.board))];
  // Statuses every selected task's board has (Video, Design and Email boards name some differently)
  const statuses = useMemo(() => {
    const lists = boards.map(b => data.boards?.[b]?.statuses || []);
    if (!lists.length || lists.some(l => !l.length)) return [];
    return lists[0].filter(s => lists.every(l => l.some(x => x.label === s.label)));
  }, [boards.join(), data.boards]); // eslint-disable-line react-hooks/exhaustive-deps
  const statusOn = (board, label) => (data.boards?.[board]?.statuses || []).find(s => s.label === label) || null;
  const plural = (k) => `${k} task${k === 1 ? '' : 's'}`;

  const setStatus = async (s) => {
    setMenu(null);
    const ok = await writes.saveMany(chosen, it => (it.status?.label === s.label ? null : { status: statusOn(it.board, s.label) }), `→ ${s.label}`);
    if (ok) onDone();
  };
  const setDeadline = async (fn, label) => {
    setMenu(null);
    const ok = await writes.saveMany(chosen, it => { const d = fn(it); return d === (it.deadline || null) ? null : { deadline: d }; }, label);
    if (ok) onDone();
  };

  return (
    <div className="relative border-t border-gray-200 bg-white px-4 py-2.5 flex flex-wrap items-center gap-2">
      {menu && <div className="fixed inset-0 z-[85]" onClick={() => setMenu(null)} />}
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#030b2e]">
        <span className="w-5 h-5 rounded-md bg-[#0808f8] text-white flex items-center justify-center"><Check size={13} /></span>
        {n} selected
      </span>
      {n < total
        ? <button type="button" onClick={onAll} className="text-xs font-semibold text-[#0808f8] hover:underline">Select all {total}</button>
        : null}
      <button type="button" onClick={onNone} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Select none</button>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button type="button" onClick={e => setMenu(menu?.kind === 'status' ? null : 'status', e)} aria-expanded={menu?.kind === 'status'}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#0808f8] hover:text-[#0808f8]">
            <CircleDot size={14} /> Status <ChevronDown size={13} />
          </button>
          {menu?.kind === 'status' && (
            <div className="fixed z-[90] w-[300px] max-w-[85vw] max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-200 p-3" style={menu.at}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Change {plural(n)} to</div>
              {statuses.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {statuses.map(s => (
                    <button key={s.label} type="button" onClick={() => setStatus(s)}
                      className="text-[12px] font-semibold text-white px-2.5 py-1 rounded-full hover:brightness-110 hover:scale-[1.03] transition" style={{ background: s.color || '#c4c4c4' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500">These tasks are on different boards with no status in common — select tasks from one board (Video, Design or Email).</div>
              )}
              {boards.length > 1 && statuses.length > 0 && <div className="text-[11px] text-gray-400 mt-2">Only the statuses all {boards.length} boards share.</div>}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={e => setMenu(menu?.kind === 'deadline' ? null : 'deadline', e)} aria-expanded={menu?.kind === 'deadline'}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#0808f8] hover:text-[#0808f8]">
            <CalendarDays size={14} /> Deadline <ChevronDown size={13} />
          </button>
          {menu?.kind === 'deadline' && <DeadlineMenu n={n} chosen={chosen} today={today} onPick={setDeadline} at={menu.at} />}
        </div>
      </div>
    </div>
  );
}

function DeadlineMenu({ n, chosen, today, onPick, at }) {
  const [date, setDate] = useState('');
  const quick = [['Today', today], ['Tomorrow', isWorkday(addDays(today, 1)) ? addDays(today, 1) : shiftWorkdays(today, 1)], ['In 2 workdays', shiftWorkdays(today, 2)], ['Next Sunday', nextSunday(today)], ['In a week', addDays(today, 7)]];
  const sample = chosen.find(it => it.deadline) || chosen[0];
  const from = (it) => (it.deadline && it.deadline >= today ? it.deadline : today);   // an overdue deadline moves from today
  const plural = `${n} task${n === 1 ? '' : 's'}`;
  return (
    <div className="fixed z-[90] w-[320px] max-w-[85vw] max-h-[80vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-200 p-3 space-y-3" style={at}>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Same deadline for {plural}</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quick.map(([label, d]) => (
            <button key={label} type="button" onClick={() => onPick(() => d, `deadline ${fmtDate(d)}`)} title={fmtDate(d)}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-[#eef0ff] hover:text-[#0808f8]">
              {label} <span className="text-gray-400 font-normal">{fmtDate(d)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200" />
          <button type="button" disabled={!date} onClick={() => onPick(() => date, `deadline ${fmtDate(date)}`)}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: '#0808f8' }}>Set</button>
        </div>
      </div>
      <div className="border-t border-gray-100 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Push each one later</div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 5].map(k => (
            <button key={k} type="button" onClick={() => onPick(it => shiftWorkdays(from(it), k), `deadlines +${k} workday${k === 1 ? '' : 's'}`)}
              className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-[#eef0ff] hover:text-[#0808f8]">+{k} workday{k === 1 ? '' : 's'}</button>
          ))}
        </div>
        {sample && <div className="text-[11px] text-gray-400 mt-1.5">e.g. {sample.deadline ? fmtDate(sample.deadline) : 'no deadline'} → {fmtDate(shiftWorkdays(from(sample), 2))} with +2 · overdue ones count from today · Fri–Sat skipped</div>}
      </div>
      <div className="border-t border-gray-100 pt-2 flex justify-end">
        <button type="button" onClick={() => onPick(() => null, 'deadline cleared')} className="text-[12px] font-semibold text-gray-500 hover:text-red-600">Clear the deadline</button>
      </div>
    </div>
  );
}
