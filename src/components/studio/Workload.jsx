import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, Plane, Mail, ExternalLink, X, Undo2, AlertTriangle, CalendarX2, Inbox } from 'lucide-react';
import { Avatar, Seg, StatusPill, ProductTag, hrs } from './Bits';
import { applyFilters, addDays, sundayOf, ymd } from './Filters';
import { studioApi } from '../../lib/studioService';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LANE_H = 30;
const NAME_W = 210;
const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const diffDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const workdays = (from, to) => { const o = []; for (let d = from; d <= to; d = addDays(d, 1)) if (dow(d) <= 4) o.push(d); return o; };

function outOn(person, day) {
  return (person?.out || []).find(o => o.start <= day && o.end >= day) || null;
}

/** Greedy lanes so overlapping bars stack. */
function lanes(bars) {
  const ends = [];
  return bars.sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to)).map(b => {
    let lane = ends.findIndex(e => e < b.from);
    if (lane < 0) { lane = ends.length; ends.push(b.to); } else ends[lane] = b.to;
    return { ...b, lane };
  });
}

export default function Workload({ f }) {
  const [role, setRole] = useState('design');
  const [weeks, setWeeks] = useState(2);
  const [start, setStart] = useState(() => sundayOf(ymd(new Date())));
  const end = addDays(start, weeks * 7 - 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [local, setLocal] = useState({}); // optimistic edits: id → { timeline, people }
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);
  const [drag, setDrag] = useState(null);
  const [showEmails, setShowEmails] = useState(true);
  const gridRef = useRef(null);
  const rowRefs = useRef(new Map());
  const [width, setWidth] = useState(1100);

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try { setData(await studioApi.dashboard({ from: start, to: end, force })); setLocal({}); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [start, end]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const days = useMemo(() => { const o = []; for (let d = start; d <= end; d = addDays(d, 1)) o.push(d); return o; }, [start, end]);
  const dayW = Math.max(40, Math.floor((width - NAME_W) / days.length));
  const today = ymd(new Date());
  const capacity = data?.capacity?.[role] || (role === 'video' ? 3 : 5);

  const all = useMemo(() => {
    if (!data) return [];
    const base = applyFilters(data.items, { ...f, division: 'all', status: null });
    const em = role === 'design' && showEmails ? (data.emails || []).filter(e => e.open) : [];
    return [...base, ...em].map(it => (local[it.id] ? { ...it, ...local[it.id] } : it)).map(it => (
      it.timeline?.from && it.timeline?.to && it.timeline.to < it.timeline.from ? { ...it, timeline: { from: it.timeline.to, to: it.timeline.from } } : it));
  }, [data, f, role, showEmails, local]);
  const people = useMemo(() => Object.values(data?.people || {}).filter(p => p.role === role && (!f.people.length || f.people.includes(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name)), [data, role, f.people]);

  const rows = useMemo(() => people.map(p => {
    const mine = all.filter(it => it.people.includes(p.id) && it.timeline?.from && it.timeline?.to && it.timeline.to >= start && it.timeline.from <= end
      && (it.open || it.delivered_in_period));
    const bars = lanes(mine.map(it => ({ it, from: it.timeline.from < start ? start : it.timeline.from, to: it.timeline.to > end ? end : it.timeline.to })));
    // Load per day: each task's effort is spread over its timeline's working days
    const load = Object.fromEntries(days.map(d => [d, 0]));
    for (const it of mine) {
      if (!it.open) continue;
      const wd = workdays(it.timeline.from, it.timeline.to);
      const share = 1 / Math.max(1, wd.length);
      for (const d of wd) if (d in load) load[d] += share;
    }
    const unscheduled = all.filter(it => it.open && it.people.includes(p.id) && !(it.timeline?.from && it.timeline?.to));
    return { p, bars, laneCount: Math.max(1, ...bars.map(b => b.lane + 1)), load, unscheduled };
  }), [people, all, start, end, days]);
  const unassigned = useMemo(() => all.filter(it => it.open && !it.people.length && (role === 'design' ? it.board !== 'video' : it.board === 'video')), [all, role]);

  // ── Writes (optimistic + undo) ──
  const apply = useCallback(async (it, next, label) => {
    const prev = { timeline: it.timeline || null, people: it.people };
    setLocal(l => ({ ...l, [it.id]: { ...(l[it.id] || {}), ...next } }));
    try {
      await studioApi.patchItem(it.id, { board: it.board, ...next, current_people: it.people });
      setToast({
        text: label,
        undo: async () => {
          setToast(null);
          setLocal(l => ({ ...l, [it.id]: prev }));
          try { await studioApi.patchItem(it.id, { board: it.board, timeline: prev.timeline, people: prev.people }); } catch (e) { setToast({ error: true, text: e.message }); }
        },
      });
    } catch (e) {
      setLocal(l => { const n = { ...l }; if (prev) n[it.id] = prev; return n; });
      setToast({ error: true, text: e.message });
    }
  }, []);

  // ── Drag & drop ──
  const rowAt = (y) => {
    for (const [uid, el] of rowRefs.current) {
      const r = el?.getBoundingClientRect();
      if (el && r && y >= r.top && y <= r.bottom) return uid;
    }
    return null;
  };
  const dayAt = (x) => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return null;
    const i = Math.floor((x - r.left - NAME_W) / dayW);
    return i >= 0 && i < days.length ? days[i] : null;
  };
  const dragRef = useRef(null);
  const onPointerDown = (e, it, mode, ownerId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const d = { it, mode, ownerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, x: e.clientX, y: e.clientY, moved: false };
    dragRef.current = d;
    setDrag(d);
  };
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, dx: e.clientX - d.x0, dy: e.clientY - d.y0, x: e.clientX, y: e.clientY, moved: d.moved || Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4 };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (e) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.moved) { if (d.mode !== 'tray') setDetail(d.it); return; }
      const { it } = d;
      const shift = Math.round((e.clientX - d.x0) / dayW);
      let from = it.timeline?.from;
      let to = it.timeline?.to;
      let target = d.ownerId;
      if (d.mode === 'move') { from = addDays(from, shift); to = addDays(to, shift); target = rowAt(e.clientY) || d.ownerId; }
      else if (d.mode === 'left') { from = addDays(from, shift); if (from > to) from = to; }
      else if (d.mode === 'right') { to = addDays(to, shift); if (to < from) to = from; }
      else if (d.mode === 'tray') {
        const day = dayAt(e.clientX);
        target = rowAt(e.clientY);
        if (!day || !target) return;
        from = day; to = day;
      }
      const person = data.people[target];
      if (!person) return;
      // Vacations layer: a task can't start or end on someone's day off (crossing one is allowed, with a note)
      const blocked = [from, to].map(day => [day, outOn(person, day)]).find(([, o]) => o);
      if (blocked) {
        setToast({ error: true, text: `${person.name.split(' ')[0]} is ${blocked[1].type === 'holiday' ? `off (${blocked[1].name || 'holiday'})` : 'on vacation'} on ${fmt(blocked[0])} — not moved` });
        return;
      }
      const crosses = workdays(from, to).find(day => outOn(person, day));
      const next = { timeline: { from, to } };
      const reassigned = !it.people.includes(target);
      if (reassigned) next.people = [...it.people.filter(p => p !== d.ownerId), target];
      if (from === it.timeline?.from && to === it.timeline?.to && !reassigned) return;
      const who = reassigned ? ` → ${person.name.split(' ')[0]}` : '';
      const note = crosses ? ` · spans a day off (${fmt(crosses)})` : '';
      apply(it, next, `${it.title || it.name.slice(0, 40)}: ${fmt(from)}${to !== from ? `–${fmt(to)}` : ''}${who}${note}`);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging, dayW, data, apply]); // eslint-disable-line react-hooks/exhaustive-deps

  const [toastHover, setToastHover] = useState(false);
  useEffect(() => { if (!toast || toastHover) return undefined; const t = setTimeout(() => setToast(null), toast.error ? 7000 : 12000); return () => clearTimeout(t); }, [toast, toastHover]);

  // Drag preview
  const ghost = (() => {
    if (!drag?.moved) return null;
    const { it } = drag;
    const shift = Math.round(drag.dx / dayW);
    let from = it.timeline?.from;
    let to = it.timeline?.to;
    let owner = drag.ownerId;
    if (drag.mode === 'move') { from = addDays(from, shift); to = addDays(to, shift); owner = rowAt(drag.y) || drag.ownerId; }
    if (drag.mode === 'left') { from = addDays(from, shift); if (from > to) from = to; }
    if (drag.mode === 'right') { to = addDays(to, shift); if (to < from) to = from; }
    if (drag.mode === 'tray') { const d = dayAt(drag.x); owner = rowAt(drag.y); if (!d || !owner) return { floating: true }; from = d; to = d; }
    const person = data.people[owner];
    const blocked = !!(outOn(person, from) || outOn(person, to));
    return { owner, from, to, blocked };
  })();

  if (error) return <div className="my-4 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={role} onChange={setRole} options={[['design', 'Designers'], ['video', 'Video editors']]} size="md" />
        <div className="flex items-center gap-1 ml-2">
          <button type="button" onClick={() => setStart(s => addDays(s, -7))} className="p-2 rounded-lg hover:bg-white text-gray-600"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setStart(sundayOf(today))} className="text-xs font-semibold px-3 py-2 rounded-lg hover:bg-white text-gray-700">Today</button>
          <button type="button" onClick={() => setStart(s => addDays(s, 7))} className="p-2 rounded-lg hover:bg-white text-gray-600"><ChevronRight size={16} /></button>
          <span className="text-sm font-semibold text-[#030b2e] ml-1">{fmt(start)} – {fmt(end)}</span>
        </div>
        <Seg value={weeks} onChange={setWeeks} options={[[1, '1 week'], [2, '2 weeks'], [4, '4 weeks']]} />
        {role === 'design' && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 ml-1 cursor-pointer">
            <input type="checkbox" checked={showEmails} onChange={e => setShowEmails(e.target.checked)} /> <Mail size={13} className="text-[#00a9a5]" /> Email tasks
          </label>
        )}
        <span className="ml-auto text-xs text-gray-400 flex items-center gap-1.5">
          {loading && <Loader2 size={13} className="animate-spin" />}
          Drag a bar to move · edges to resize · onto someone else to reassign · changes go to Monday
        </span>
      </div>

      {!data ? (
        <div className="py-24 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div ref={gridRef} className="relative overflow-x-auto">
            {/* Header */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200" style={{ width: NAME_W + dayW * days.length }}>
              <div className="flex-none px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400" style={{ width: NAME_W }}>{role === 'design' ? 'Designers' : 'Video editors'}</div>
              {days.map(d => {
                const hol = (data.holidays || []).find(h => h.start <= d && h.end >= d);
                return (
                  <div key={d} title={hol ? hol.name || 'Holiday' : undefined}
                    className={`flex-none text-center py-2 text-[11px] border-l border-gray-100 ${hol ? 'bg-gray-100' : ''} ${d === today ? 'text-[#0808f8] font-bold' : dow(d) > 4 ? 'text-gray-300' : 'text-gray-500 font-semibold'}`} style={{ width: dayW }}>
                    {dayW >= 56 ? DOW[dow(d)] : DOW[dow(d)][0]} <span className="font-normal">{Number(d.slice(8))}</span>
                    {hol && <div className="text-[9px] font-semibold text-gray-500 truncate px-1 leading-tight">{dayW >= 56 ? (hol.name || 'Holiday') : '★'}</div>}
                  </div>
                );
              })}
            </div>

            {rows.map(({ p, bars, laneCount, load, unscheduled }) => {
              const h = 30 + laneCount * LANE_H + 10;
              const isTarget = ghost && !ghost.floating && ghost.owner === p.id;
              return (
                <div key={p.id} ref={el => rowRefs.current.set(p.id, el)} className={`flex border-b border-gray-100 ${isTarget ? 'bg-[#0808f8]/[0.03]' : ''}`} style={{ width: NAME_W + dayW * days.length, minHeight: h }}>
                  <div className="flex-none px-4 py-3 flex flex-col gap-1.5 border-r border-gray-100" style={{ width: NAME_W }}>
                    <div className="flex items-center gap-2.5">
                      <Avatar person={p} size={30} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{p.name}</div>
                        <div className="text-[11px] text-gray-400">{bars.length} scheduled{unscheduled.length ? ` · ${unscheduled.length} unscheduled` : ''}</div>
                      </div>
                    </div>
                    {unscheduled.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {unscheduled.slice(0, 6).map(it => (
                          <span key={it.id} onPointerDown={(e) => onPointerDown(e, it, 'tray', p.id)} title={`Drag onto a day: ${it.name}`}
                            className="max-w-[170px] truncate text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-grab text-white" style={{ background: it.status.color || '#999' }}>
                            {it.board === 'retention' && <Mail size={9} className="inline mr-0.5" />}{it.title || it.name}
                          </span>
                        ))}
                        {unscheduled.length > 6 && <span className="text-[10px] text-gray-400">+{unscheduled.length - 6}</span>}
                      </div>
                    )}
                  </div>
                  <div className="relative flex-none" style={{ width: dayW * days.length }}>
                    {/* Day cells: weekends, vacations, today, load */}
                    {days.map((d, i) => {
                      const o = outOn(p, d);
                      const ld = load[d];
                      const over = ld > capacity;
                      return (
                        <div key={d} className="absolute top-0 bottom-0 border-l border-gray-100" style={{
                          left: i * dayW, width: dayW,
                          background: o ? 'repeating-linear-gradient(135deg,#eceef2 0 6px,#e2e4ea 6px 12px)' : dow(d) > 4 ? 'repeating-linear-gradient(135deg,#fafafa 0 6px,#f4f5f7 6px 12px)' : d === today ? 'rgba(8,8,248,.035)' : undefined,
                        }}>
                          {o ? (
                            <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-center gap-1 pt-1.5" title={o.name || 'Out'}><Plane size={10} /> {dayW >= 56 ? (o.type === 'holiday' ? 'Holiday' : 'Off') : ''}</div>
                          ) : ld > 0 && dow(d) <= 4 ? (
                            <div className="flex justify-center pt-1.5">
                              <span title={`${Math.round(ld * 10) / 10} projects' worth of work · capacity ${capacity}`}
                                className={`text-[10px] font-bold rounded-full px-1.5 min-w-[22px] text-center ${over ? 'bg-red-500 text-white' : 'bg-[#0808f8]/10 text-[#0808f8]'}`}>
                                {Math.round(ld * 10) / 10}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {/* Bars */}
                    {bars.map(({ it, from, to, lane }) => {
                      const dragging = drag?.moved && drag.it.id === it.id && drag.mode !== 'tray';
                      const left = diffDays(start, from) * dayW + 2;
                      const w = (diffDays(from, to) + 1) * dayW - 4;
                      return (
                        <div key={`${it.board}:${it.id}`} onPointerDown={(e) => onPointerDown(e, it, 'move', p.id)}
                          className={`absolute rounded-md text-[11px] font-semibold text-white shadow-sm flex items-center cursor-grab active:cursor-grabbing group ${dragging ? 'opacity-30' : 'hover:brightness-110'} ${it.board === 'retention' ? 'ring-2 ring-[#00a9a5]/60' : ''}`}
                          style={{ left, width: w, top: 28 + lane * LANE_H, height: LANE_H - 6, background: it.status.color || '#888' }}
                          title={`${it.name}\n${it.status.label}${it.deadline ? ` · due ${it.deadline}` : ''}`}>
                          <span onPointerDown={(e) => onPointerDown(e, it, 'left', p.id)} className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 rounded-l-md" />
                          <span className="px-2 truncate">{it.board === 'retention' && <Mail size={10} className="inline mr-1 -mt-0.5" />}{it.division === 'tv' && 'TV · '}{it.title || it.name}</span>
                          {it.deadline && it.deadline < it.timeline.to && <CalendarX2 size={11} className="ml-auto mr-1.5 flex-none opacity-90" title="Ends after the deadline" />}
                          <span onPointerDown={(e) => onPointerDown(e, it, 'right', p.id)} className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/20 rounded-r-md" />
                        </div>
                      );
                    })}
                    {/* Ghost */}
                    {isTarget && ghost.from && (
                      <div className={`absolute rounded-md border-2 border-dashed pointer-events-none flex items-center px-2 text-[11px] font-bold ${ghost.blocked ? 'border-red-500 bg-red-50 text-red-600' : 'border-[#0808f8] bg-[#0808f8]/10 text-[#0808f8]'}`}
                        style={{ left: diffDays(start, ghost.from) * dayW + 2, width: (diffDays(ghost.from, ghost.to) + 1) * dayW - 4, top: 28 + laneCount * LANE_H - LANE_H + 2, height: LANE_H - 6, zIndex: 5 }}>
                        {ghost.blocked ? 'On vacation' : `${fmt(ghost.from)}${ghost.to !== ghost.from ? ` – ${fmt(ghost.to)}` : ''}`}
                      </div>
                    )}
                    {/* Today line */}
                    {today >= start && today <= end && <div className="absolute top-0 bottom-0 w-0.5 bg-[#0808f8]/50 pointer-events-none" style={{ left: diffDays(start, today) * dayW + dayW / 2 }} />}
                  </div>
                </div>
              );
            })}
            {!rows.length && <div className="py-16 text-center text-sm text-gray-400">No {role === 'design' ? 'designers' : 'video editors'} match these filters.</div>}
          </div>

          {unassigned.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-50/70 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5"><Inbox size={12} /> Waiting for someone · drag onto a person and a day</div>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.slice(0, 40).map(it => (
                  <span key={it.id} onPointerDown={(e) => onPointerDown(e, it, 'tray', null)} title={it.name}
                    className="max-w-[260px] truncate text-[11px] font-semibold px-2 py-1 rounded-md cursor-grab bg-white border border-gray-200 text-gray-800 hover:border-[#0808f8]">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: it.status.color }} />{it.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {drag?.moved && drag.mode === 'tray' && createPortal(
        <div className="fixed z-[90] pointer-events-none text-[11px] font-semibold px-2 py-1 rounded-md text-white shadow-lg max-w-[240px] truncate" style={{ left: drag.x + 8, top: drag.y + 8, background: ghost?.blocked ? '#e2445c' : '#0808f8' }}>
          {ghost?.blocked ? 'On vacation' : drag.it.title || drag.it.name}
        </div>, document.body)}

      {detail && <ItemDetail it={local[detail.id] ? { ...detail, ...local[detail.id] } : detail} data={data} onClose={() => setDetail(null)}
        onUnschedule={() => { apply(detail, { timeline: null }, `${detail.title || detail.name.slice(0, 40)}: unscheduled`); setDetail(null); }} />}

      {toast && createPortal(
        <div onMouseEnter={() => setToastHover(true)} onMouseLeave={() => setToastHover(false)}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] px-4 py-2.5 rounded-full text-sm shadow-xl flex items-center gap-3 ${toast.error ? 'bg-red-600 text-white' : 'bg-[#030b2e] text-white'}`}>
          {toast.error ? <AlertTriangle size={15} /> : null}
          <span className="max-w-[60vw] truncate">{toast.error ? toast.text : `Updated on Monday · ${toast.text}`}</span>
          {toast.undo && <button type="button" onClick={toast.undo} className="flex items-center gap-1 font-semibold text-[#8c93ff] hover:text-white"><Undo2 size={14} /> Undo</button>}
          <button type="button" onClick={() => setToast(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>, document.body)}
    </div>
  );
}

function ItemDetail({ it, data, onClose, onUnschedule }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end" style={{ background: 'rgba(3,11,46,.25)' }} onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-2xl p-6 flex flex-col gap-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#0808f8]">{it.board === 'retention' ? 'Email task' : it.board === 'video' ? 'Video' : 'Design'}{it.division === 'tv' ? ' · TV' : ''}</div>
            <div className="text-lg font-bold text-[#030b2e] leading-snug">{it.name}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2"><StatusPill status={it.status} /><ProductTag product={it.product} /></div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Fact label="Timeline" value={it.timeline ? `${fmt(it.timeline.from)} – ${fmt(it.timeline.to)}` : 'Not scheduled'} />
          <Fact label="Deadline" value={it.deadline ? fmt(it.deadline) : '–'} warn={it.deadline && it.timeline?.to > it.deadline} />
          <Fact label="Worked (period)" value={hrs(it.effort_s)} />
          <Fact label="Total effort" value={hrs(it.effort_total_s)} />
        </div>
        <div className="flex flex-col gap-2">
          {it.people.map(p => data.people[p] && <div key={p} className="flex items-center gap-2 text-sm"><Avatar person={data.people[p]} size={26} />{data.people[p].name}</div>)}
          {it.requested_by?.length > 0 && <div className="text-xs text-gray-500">Requested by {it.requested_by.map(r => data.requesters[r]?.name).filter(Boolean).join(', ')}</div>}
        </div>
        <div className="mt-auto flex gap-2">
          {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-sm font-semibold px-4 py-2.5 rounded-xl text-white flex items-center justify-center gap-1.5" style={{ background: '#0808f8' }}>Open in Monday <ExternalLink size={14} /></a>}
          {it.timeline && <button type="button" onClick={onUnschedule} className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Unschedule</button>}
        </div>
      </div>
    </div>, document.body);
}

function Fact({ label, value, warn }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`font-semibold ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  );
}
