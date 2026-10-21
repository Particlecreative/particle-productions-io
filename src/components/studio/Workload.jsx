import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, Plane, Mail, X, AlertTriangle, Inbox, Search, Check, PanelRightOpen, PanelRightClose, RefreshCw, Flag } from 'lucide-react';
import { Avatar, Seg, StatusPill, ProductTag } from './Bits';
import { applyFilters, addDays, sundayOf, ymd } from './Filters';
import { studioApi } from '../../lib/studioService';
import { useStudio, lastWriteAt, outOn, checkSchedule, workdays } from './writes';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LANE_H = 32;
const NAME_W = 230;
const TOP = 26; // room above the bars for the day's load pill
const WEEKEND = 0.36; // Fri/Sat columns, relative to a workday
const PANEL_KEY = 'cp_studio_wl_panel';
const ROLE_KEY = 'cp_studio_wl_role';
const WEEKS_KEY = 'cp_studio_wl_weeks';
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map(); // `${from}:${to}` → { data, at } — kept while you move between weeks

const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDow = (d) => `${DOW[dow(d)]} ${Number(d.slice(8))}`;
const first = (name) => (name || '').split(' ')[0];
const pref = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const setPref = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };
const roleOf = (it) => (it.board === 'video' ? 'video' : 'design');

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
  const today = ymd(new Date());
  const [role, setRoleState] = useState(() => pref(ROLE_KEY, 'all'));
  const [weeks, setWeeksState] = useState(() => Number(pref(WEEKS_KEY, 2)) || 2);
  const [start, setStart] = useState(() => sundayOf(today));
  const end = addDays(start, weeks * 7 - 1);
  const [data, setData] = useState(() => cache.get(`${sundayOf(today)}:${addDays(sundayOf(today), (Number(pref(WEEKS_KEY, 2)) || 2) * 7 - 1)}`)?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { writes, openTask } = useStudio();
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  const [showEmails, setShowEmails] = useState(true);
  const [panel, setPanelState] = useState(() => pref(PANEL_KEY, '1') === '1');
  const [panelQ, setPanelQ] = useState('');
  const [panelWho, setPanelWho] = useState(null);
  const gridRef = useRef(null);
  const rowRefs = useRef(new Map());
  const keyRef = useRef('');
  const hoverTimer = useRef(null);
  const [width, setWidth] = useState(1100);
  const setRole = (v) => { setRoleState(v); setPref(ROLE_KEY, v); };
  const setWeeks = (v) => { setWeeksState(v); setPref(WEEKS_KEY, v); };
  const setPanel = (v) => { setPanelState(v); setPref(PANEL_KEY, v ? '1' : '0'); };

  // ── Data: light schedule build, cached per window, next window prefetched ──
  const load = useCallback(async (force = false) => {
    const key = `${start}:${end}`;
    keyRef.current = key;
    const hit = cache.get(key);
    if (hit && !force && Date.now() - hit.at < CACHE_MS && hit.at > lastWriteAt()) { setData(hit.data); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const d = await studioApi.dashboard({ from: start, to: end, force, lite: true });
      cache.set(key, { data: d, at: Date.now() });
      if (keyRef.current === key) setData(d);
    } catch (e) { if (keyRef.current === key) setError(e.message); } finally { if (keyRef.current === key) setLoading(false); }
  }, [start, end]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || loading) return undefined;
    const t = setTimeout(() => {
      const from = addDays(start, 7 * weeks);
      const to = addDays(from, weeks * 7 - 1);
      const key = `${from}:${to}`;
      if (cache.has(key)) return;
      studioApi.dashboard({ from, to, lite: true }).then(d => cache.set(key, { data: d, at: Date.now() })).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [data, loading, start, weeks]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, panel]);

  // ── Keyboard: ← → weeks, T today ──
  useEffect(() => {
    const k = (e) => {
      if (document.querySelector('[data-task-panel]') || e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft') setStart(s => addDays(s, -7));
      else if (e.key === 'ArrowRight') setStart(s => addDays(s, 7));
      else if (e.key === 't' || e.key === 'T') setStart(sundayOf(today));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [today]);

  // ── Columns: workdays wide, Fri/Sat narrow ──
  const days = useMemo(() => { const o = []; for (let d = start; d <= end; d = addDays(d, 1)) o.push(d); return o; }, [start, end]);
  const cols = useMemo(() => {
    const avail = Math.max(320, width - NAME_W);
    const wk = days.filter(d => dow(d) > 4).length;
    const unit = Math.max(34, avail / (days.length - wk + wk * WEEKEND));
    const w = days.map(d => (dow(d) > 4 ? Math.max(14, Math.floor(unit * WEEKEND)) : Math.floor(unit)));
    const x = [];
    w.reduce((acc, cw, i) => { x[i] = acc; return acc + cw; }, 0);
    return { w, x, total: w.reduce((a, b) => a + b, 0), idx: new Map(days.map((d, i) => [d, i])) };
  }, [days, width]);
  const xOf = (d) => cols.x[cols.idx.get(d)] ?? 0;
  const spanW = (a, b) => xOf(b) + cols.w[cols.idx.get(b)] - xOf(a);

  // ── Rows ──
  const all = useMemo(() => {
    if (!data) return [];
    const base = applyFilters(data.items, { ...f, division: 'all', status: null });
    const em = role !== 'video' && showEmails ? applyFilters(data.emails || [], { ...f, division: 'all', status: null, requesters: [] }) : [];
    return [...base, ...em].map(it => writes.merge(it, data.generated_at)).map(it => (
      it.timeline?.from && it.timeline?.to && it.timeline.to < it.timeline.from ? { ...it, timeline: { from: it.timeline.to, to: it.timeline.from } } : it));
  }, [data, f, role, showEmails, writes]);
  const people = useMemo(() => Object.values(data?.people || {})
    .filter(p => (role === 'all' ? ['design', 'video'].includes(p.role) : p.role === role) && (!f.people.length || f.people.includes(p.id)))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'design' ? -1 : 1)), [data, role, f.people]);

  const rows = useMemo(() => people.map(p => {
    const mine = all.filter(it => it.people.includes(p.id) && it.timeline?.from && it.timeline?.to && it.timeline.to >= start && it.timeline.from <= end);
    const bars = lanes(mine.map(it => ({ it, from: it.timeline.from < start ? start : it.timeline.from, to: it.timeline.to > end ? end : it.timeline.to })));
    const capacity = data?.capacity?.[p.role] || (p.role === 'video' ? 3 : 5);
    // Load per day: each open task's work is spread over its timeline's working days
    const load = Object.fromEntries(days.map(d => [d, 0]));
    for (const it of mine) {
      if (!it.open) continue;
      const wd = workdays(it.timeline.from, it.timeline.to);
      for (const d of wd) if (d in load) load[d] += 1 / Math.max(1, wd.length);
    }
    const avail = days.filter(d => dow(d) <= 4 && !outOn(p, d));
    const booked = avail.length ? avail.reduce((a, d) => a + load[d], 0) / (capacity * avail.length) : 0;
    const free = avail.filter(d => d >= today && load[d] < 0.05).slice(0, 3);
    const unscheduled = all.filter(it => it.open && it.people.includes(p.id) && !(it.timeline?.from && it.timeline?.to));
    return { p, bars, laneCount: Math.max(1, ...bars.map(b => b.lane + 1)), load, capacity, booked, free, unscheduled, open: mine.filter(i => i.open).length };
  }), [people, all, start, end, days, today, data]);
  const unassigned = useMemo(() => all.filter(it => it.open && !it.people.length && (role === 'all' || roleOf(it) === role)), [all, role]);
  const toSchedule = rows.reduce((a, r) => a + r.unscheduled.length, 0) + unassigned.length;

  // ── Drag & drop ──
  const rowAt = (y) => {
    for (const [uid, el] of rowRefs.current) {
      const r = el?.getBoundingClientRect();
      if (el && r && y >= r.top && y <= r.bottom) return uid;
    }
    return null;
  };
  const dayIdxAt = (clientX, clamp = false) => {
    const g = gridRef.current;
    if (!g) return null;
    const lx = clientX - g.getBoundingClientRect().left + g.scrollLeft - NAME_W;
    if (lx < 0) return clamp ? 0 : null;
    for (let i = 0; i < days.length; i++) if (lx < cols.x[i] + cols.w[i]) return i;
    return clamp ? days.length - 1 : null;
  };
  const dragRef = useRef(null);
  const onPointerDown = (e, it, mode, ownerId) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(hoverTimer.current);
    setHover(null);
    const d = { it, mode, ownerId, x0: e.clientX, y0: e.clientY, i0: dayIdxAt(e.clientX, true), x: e.clientX, y: e.clientY, moved: false };
    dragRef.current = d;
    setDrag(d);
  };
  const target = (d) => {
    const { it } = d;
    const shift = (dayIdxAt(d.x, true) ?? 0) - (d.i0 ?? 0);
    let from = it.timeline?.from;
    let to = it.timeline?.to;
    let owner = d.ownerId;
    if (d.mode === 'move') { from = addDays(from, shift); to = addDays(to, shift); owner = rowAt(d.y) || d.ownerId; }
    else if (d.mode === 'left') { from = addDays(from, shift); if (from > to) from = to; }
    else if (d.mode === 'right') { to = addDays(to, shift); if (to < from) to = from; }
    else if (d.mode === 'tray') {
      const i = dayIdxAt(d.x);
      owner = rowAt(d.y);
      if (i == null || !owner) return null;
      from = days[i]; to = days[i];
    }
    return { owner, from, to };
  };
  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return undefined;
    document.body.style.cursor = 'grabbing';
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4 };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (e) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (!d.moved) { openTask(d.it, data); return; }
      const t = target({ ...d, x: e.clientX, y: e.clientY });
      if (!t || !data.people[t.owner]) return;
      const { it } = d;
      const reassigned = !it.people.includes(t.owner);
      if (t.from === it.timeline?.from && t.to === it.timeline?.to && !reassigned) return;
      const next = { timeline: { from: t.from, to: t.to } };
      if (reassigned) next.people = [...it.people.filter(p => p !== d.ownerId), t.owner];
      writes.save(it, next, data);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { document.body.style.cursor = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging, data, writes, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const ghost = (() => {
    if (!drag?.moved) return null;
    const t = target(drag);
    if (!t) return { floating: true };
    const blocked = !!checkSchedule(data, [t.owner], t.from, t.to).error;
    return { ...t, blocked };
  })();

  const hoverOn = (e, it) => {
    if (drag) return;
    clearTimeout(hoverTimer.current);
    const { clientX: x, clientY: y } = e;
    hoverTimer.current = setTimeout(() => setHover({ it, x, y }), 380);
  };
  const hoverOff = () => { clearTimeout(hoverTimer.current); setHover(null); };

  if (error && !data) return <div className="my-4 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;

  let lastRole = null;
  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={role} onChange={setRole} options={[['all', 'Everyone'], ['design', 'Designers'], ['video', 'Video editors']]} size="md" />
        <div className="flex items-center gap-0.5 ml-1 bg-white rounded-xl border border-gray-200 p-0.5">
          <button type="button" onClick={() => setStart(s => addDays(s, -7))} title="Previous week (←)" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setStart(sundayOf(today))} title="This week (T)" className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg ${start === sundayOf(today) ? 'text-[#0808f8]' : 'text-gray-700 hover:bg-gray-100'}`}>Today</button>
          <button type="button" onClick={() => setStart(s => addDays(s, 7))} title="Next week (→)" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"><ChevronRight size={16} /></button>
        </div>
        <span className="text-sm font-semibold text-[#030b2e] ml-1 tabular-nums">{fmt(start)} – {fmt(end)}</span>
        {loading ? <Loader2 size={14} className="animate-spin text-gray-400" /> : (
          <button type="button" onClick={() => load(true)} title="Reload from Monday" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white"><RefreshCw size={13} /></button>
        )}
        <Seg value={weeks} onChange={setWeeks} options={[[1, '1 week'], [2, '2 weeks'], [4, '4 weeks']]} />
        {role !== 'video' && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 ml-1 cursor-pointer">
            <input type="checkbox" checked={showEmails} onChange={e => setShowEmails(e.target.checked)} /> <Mail size={13} className="text-[#00a9a5]" /> Email tasks
          </label>
        )}
        <button type="button" onClick={() => setPanel(!panel)}
          className={`ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${panel ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0808f8]/50'}`}>
          {panel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} To schedule
          {toSchedule > 0 && <span className={`tabular-nums rounded-full px-1.5 text-[10px] ${panel ? 'bg-white/20' : 'bg-[#0808f8] text-white'}`}>{toSchedule}</span>}
        </button>
      </div>
      <div className="text-[11px] text-gray-400 -mt-1">
        Drag a bar to move it · drag its edges to change dates · drop it on someone else to reassign · click for details · ← → weeks, T today · every change goes straight to Monday, with Undo
      </div>

      {!data ? (
        <div className="py-24 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>
      ) : (
        <div className="flex items-start gap-3">
          <div className={`flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <div ref={gridRef} className="relative overflow-x-auto">
              {/* Header */}
              <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200" style={{ width: NAME_W + cols.total }}>
                <div className="flex-none px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400" style={{ width: NAME_W }}>{people.length} {role === 'video' ? 'video editors' : role === 'design' ? 'designers' : 'people'}</div>
                {days.map((d, i) => {
                  const hol = (data.holidays || []).find(h => h.start <= d && h.end >= d);
                  const we = dow(d) > 4;
                  return (
                    <div key={d} title={hol ? hol.name || 'Holiday' : fmt(d)}
                      className={`flex-none text-center py-2 text-[11px] border-l ${dow(d) === 0 ? 'border-gray-300' : 'border-gray-100'} ${hol ? 'bg-gray-100' : ''} ${d === today ? 'text-[#0808f8] font-bold' : we ? 'text-gray-300' : 'text-gray-500 font-semibold'}`}
                      style={{ width: cols.w[i] }}>
                      {we ? DOW[dow(d)][0] : <>{cols.w[i] >= 56 ? DOW[dow(d)] : DOW[dow(d)][0]} <span className="font-normal">{Number(d.slice(8))}</span></>}
                      {hol && !we && <div className="text-[9px] font-semibold text-gray-500 truncate px-1 leading-tight">{cols.w[i] >= 56 ? (hol.name || 'Holiday') : '★'}</div>}
                    </div>
                  );
                })}
              </div>

              {rows.map(({ p, bars, laneCount, load, capacity, booked, free, unscheduled, open }) => {
                const isTarget = ghost && !ghost.floating && ghost.owner === p.id;
                const h = TOP + (laneCount + (isTarget ? 1 : 0)) * LANE_H + 8;
                const header = role === 'all' && p.role !== lastRole;
                lastRole = p.role;
                const outNow = outOn(p, today);
                return (
                  <Fragment key={p.id}>
                    {header && (
                      <div className="flex items-center px-4 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500" style={{ width: NAME_W + cols.total }}>
                        {p.role === 'video' ? 'Video editors' : 'Designers'}
                      </div>
                    )}
                    <div ref={el => rowRefs.current.set(p.id, el)} className={`flex border-b border-gray-100 transition-colors ${isTarget ? (ghost.blocked ? 'bg-red-50/60' : 'bg-[#0808f8]/[0.04]') : ''}`} style={{ width: NAME_W + cols.total, minHeight: h }}>
                      <div className="flex-none px-4 py-2.5 flex flex-col gap-1.5 border-r border-gray-100" style={{ width: NAME_W }}>
                        <div className="flex items-center gap-2.5">
                          <Avatar person={p} size={30} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                              {p.name}{outNow && <span title={outNow.name || 'Out today'}><Plane size={11} className="text-gray-400" /></span>}
                            </div>
                            <div className="text-[11px] text-gray-400 truncate">{open} open{unscheduled.length ? ' · ' : ''}
                              {unscheduled.length > 0 && <button type="button" onClick={() => { setPanel(true); setPanelWho(p.id); }} className="text-[#0808f8] hover:underline">{unscheduled.length} to schedule</button>}
                            </div>
                          </div>
                        </div>
                        <div title={`${Math.round(booked * 100)}% of ${first(p.name)}’s capacity in these weeks (${capacity} tasks a day)`}>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, booked * 100)}%`, background: booked > 1 ? '#e2445c' : booked > 0.85 ? '#fdab3d' : '#0808f8' }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                            <span>{Math.round(booked * 100)}% booked</span>
                            {free.length > 0 && <span className="text-emerald-600 truncate ml-1">free {free.map(fmtDow).join(', ')}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="relative flex-none" style={{ width: cols.total }}>
                        {/* Day cells: weekends, vacations, today, load */}
                        {days.map((d, i) => {
                          const o = outOn(p, d);
                          const ld = load[d];
                          const over = ld > capacity;
                          const we = dow(d) > 4;
                          return (
                            <div key={d} className={`absolute top-0 bottom-0 border-l ${dow(d) === 0 ? 'border-gray-200' : 'border-gray-100'}`} style={{
                              left: cols.x[i], width: cols.w[i],
                              background: o ? 'repeating-linear-gradient(135deg,#eceef2 0 6px,#e2e4ea 6px 12px)' : we ? 'repeating-linear-gradient(135deg,#fafafa 0 5px,#f3f4f6 5px 10px)' : d === today ? 'rgba(8,8,248,.04)' : undefined,
                            }}>
                              {o && !we ? (
                                <div className="text-[10px] text-gray-400 font-semibold flex items-center justify-center gap-1 pt-1.5" title={o.name || 'Out'}><Plane size={10} /> {cols.w[i] >= 56 ? (o.type === 'holiday' ? 'Holiday' : 'Off') : ''}</div>
                              ) : ld > 0 && !we ? (
                                <div className="flex justify-center pt-1.5">
                                  <span title={`${Math.round(ld * 10) / 10} tasks’ worth of work · capacity ${capacity}`}
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
                          const moving = drag?.moved && drag.it.id === it.id && drag.mode !== 'tray';
                          const late = it.open && it.deadline && it.deadline < today;
                          const dl = it.deadline && it.deadline >= from && it.deadline <= to && it.deadline !== to ? it.deadline : null;
                          const w = spanW(from, to) - 4;
                          return (
                            <div key={`${it.board}:${it.id}`} onPointerDown={(e) => onPointerDown(e, it, 'move', p.id)} onPointerEnter={(e) => hoverOn(e, it)} onPointerLeave={hoverOff}
                              className={`absolute rounded-lg text-[11px] font-semibold text-white flex items-center cursor-grab group overflow-hidden ${moving ? 'opacity-30' : 'hover:brightness-110 hover:shadow-md'} ${!it.open ? 'opacity-55' : 'shadow-sm'} ${it.board === 'retention' ? 'ring-2 ring-[#00a9a5]/60' : ''}`}
                              style={{ left: xOf(from) + 2, width: w, top: TOP + lane * LANE_H, height: LANE_H - 6, background: it.status.color || '#888' }}>
                              <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: it.product?.color || 'transparent' }} />
                              <span onPointerDown={(e) => onPointerDown(e, it, 'left', p.id)} className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/25 z-[1]" />
                              <span className="pl-2.5 pr-2 truncate flex items-center gap-1">
                                {!it.open && <Check size={11} className="flex-none" />}
                                {it.board === 'retention' && <Mail size={10} className="flex-none" />}
                                {it.division === 'tv' && <span className="flex-none opacity-80">TV ·</span>}
                                <span className="truncate">{it.title || it.name}</span>
                                {w > 220 && it.product?.label && it.product.label !== '-' && <span className="font-normal opacity-75 truncate">· {it.product.label}</span>}
                              </span>
                              {dl && <span className="absolute top-0 bottom-0 w-0.5 bg-white/90" style={{ left: xOf(dl) - xOf(from) + cols.w[cols.idx.get(dl)] - 2 }} title={`Deadline ${fmt(dl)}`} />}
                              {late ? (
                                <span className={`ml-auto mr-1.5 flex-none rounded bg-red-600 text-white font-bold ${w > 110 ? 'text-[9px] px-1 py-px' : 'w-2 h-2 rounded-full'}`} title={`Overdue — deadline was ${fmt(it.deadline)}`}>{w > 110 ? 'LATE' : ''}</span>
                              ) : it.deadline && it.deadline < it.timeline.to && it.open ? <Flag size={11} className="ml-auto mr-2 flex-none" title={`Ends after its deadline (${fmt(it.deadline)})`} /> : null}
                              <span onPointerDown={(e) => onPointerDown(e, it, 'right', p.id)} className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-black/25 z-[1]" />
                            </div>
                          );
                        })}
                        {/* Ghost */}
                        {isTarget && ghost.from && (
                          <div className={`absolute rounded-lg border-2 border-dashed pointer-events-none flex items-center px-2 text-[11px] font-bold ${ghost.blocked ? 'border-red-500 bg-red-50 text-red-600' : 'border-[#0808f8] bg-[#0808f8]/10 text-[#0808f8]'}`}
                            style={{ left: xOf(ghost.from) + 2, width: Math.max(28, spanW(ghost.from, ghost.to) - 4), top: TOP + laneCount * LANE_H, height: LANE_H - 6, zIndex: 5 }}>
                            <span className="truncate">{ghost.blocked ? `${first(p.name)} is off` : `${fmt(ghost.from)}${ghost.to !== ghost.from ? ` – ${fmt(ghost.to)}` : ''}${drag.it.people.includes(p.id) ? '' : ` → ${first(p.name)}`}`}</span>
                          </div>
                        )}
                        {/* Today line */}
                        {today >= start && today <= end && <div className="absolute top-0 bottom-0 w-0.5 bg-[#0808f8]/50 pointer-events-none" style={{ left: xOf(today) + cols.w[cols.idx.get(today)] / 2 }} />}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
              {!rows.length && <div className="py-16 text-center text-sm text-gray-400">No {role === 'video' ? 'video editors' : role === 'design' ? 'designers' : 'people'} match these filters.</div>}
            </div>
          </div>

          {panel && (
            <SchedulePanel rows={rows} unassigned={unassigned} data={data} q={panelQ} setQ={setPanelQ} who={panelWho} setWho={setPanelWho}
              onClose={() => setPanel(false)} onGrab={onPointerDown} today={today} />
          )}
        </div>
      )}

      {drag?.moved && drag.mode === 'tray' && createPortal(
        <div className="fixed z-[90] pointer-events-none text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-white shadow-lg max-w-[260px] truncate" style={{ left: drag.x + 10, top: drag.y + 10, background: ghost?.blocked ? '#e2445c' : '#0808f8' }}>
          {ghost?.floating ? `Drop on a person and a day · ${drag.it.title || drag.it.name}` : ghost?.blocked ? 'Day off — pick another day' : `${fmt(ghost.from)} → ${first(data.people[ghost.owner]?.name)}`}
        </div>, document.body)}

      {hover && !drag && createPortal(<HoverCard it={hover.it} x={hover.x} y={hover.y} data={data} today={today} />, document.body)}

    </div>
  );
}

/** Everything not on the timeline yet — drag a card onto a person and a day. */
function SchedulePanel({ rows, unassigned, data, q, setQ, who, setWho, onClose, onGrab, today }) {
  const match = (it) => !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase());
  const groups = [
    ...(!who ? [{ key: 'none', title: 'Waiting for someone', icon: <Inbox size={12} />, items: unassigned.filter(match) }] : []),
    ...rows.filter(r => r.unscheduled.length && (!who || r.p.id === who)).map(r => ({ key: r.p.id, title: r.p.name, person: r.p, items: r.unscheduled.filter(match) })),
  ].filter(g => g.items.length);
  return (
    <aside className="hidden md:flex w-[300px] flex-none bg-white rounded-2xl border border-gray-200 flex-col sticky top-2 max-h-[calc(100vh-140px)]">
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-bold text-[#030b2e]">To schedule</span>
          <span className="text-[11px] text-gray-400">drag onto a person + day</span>
          <button type="button" onClick={onClose} className="ml-auto p-1 rounded-md hover:bg-gray-100 text-gray-400"><X size={14} /></button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="w-full text-xs pl-8 pr-2 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#0808f8]/50" />
        </div>
        {who && (
          <button type="button" onClick={() => setWho(null)} className="mt-2 text-[11px] font-semibold text-[#0808f8] flex items-center gap-1">
            Only {first(data.people[who]?.name)} · show everyone <X size={11} />
          </button>
        )}
      </div>
      <div className="overflow-y-auto p-2 flex flex-col gap-3">
        {groups.map(g => (
          <div key={g.key}>
            <div className="flex items-center gap-1.5 px-1 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {g.person ? <Avatar person={g.person} size={16} /> : g.icon} <span className="truncate">{g.title}</span><span className="text-gray-400 tabular-nums">{g.items.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {g.items.slice(0, 40).map(it => {
                const late = it.deadline && it.deadline < today;
                return (
                  <div key={`${it.board}:${it.id}`} onPointerDown={(e) => onGrab(e, it, 'tray', g.person?.id || null)}
                    className="rounded-lg bg-white border border-gray-200 px-2.5 py-2 cursor-grab hover:border-[#0808f8]/50 hover:shadow-sm active:cursor-grabbing">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <span className="w-2 h-2 rounded-full flex-none" style={{ background: it.status.color || '#c4c4c4' }} />
                      <span className="truncate">{it.status.label}</span>
                      {it.board === 'retention' && <Mail size={10} className="text-[#00a9a5]" />}
                      {it.deadline && <span className={`ml-auto flex-none ${late ? 'text-red-600 font-semibold' : ''}`}>due {fmt(it.deadline)}</span>}
                    </div>
                    <div className="text-xs font-semibold text-gray-900 leading-snug mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.title || it.name}</div>
                    <div className="flex items-center gap-2 mt-1 min-w-0">
                      <ProductTag product={it.product} />
                      {it.requested_by?.length > 0 && <span className="text-[10px] text-gray-400 truncate">for {it.requested_by.map(r => first(data.requesters[r]?.name)).filter(Boolean).join(', ')}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!groups.length && <div className="text-xs text-gray-400 text-center py-8">{q ? 'Nothing matches.' : 'Everything is on the timeline.'}</div>}
      </div>
    </aside>
  );
}

function HoverCard({ it, x, y, data, today }) {
  const w = 300;
  const left = Math.min(x + 14, window.innerWidth - w - 12);
  const top = Math.min(y + 16, window.innerHeight - 190);
  const late = it.open && it.deadline && it.deadline < today;
  return (
    <div className="fixed z-[85] pointer-events-none bg-white rounded-xl shadow-2xl border border-gray-200 p-3 flex flex-col gap-1.5" style={{ left, top, width: w }}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#0808f8]">{it.board === 'retention' ? 'Email task' : it.board === 'video' ? 'Video' : 'Design'}{it.division === 'tv' ? ' · TV' : ''}</div>
      <div className="text-sm font-semibold text-[#030b2e] leading-snug">{it.name}</div>
      <div className="flex flex-wrap items-center gap-2"><StatusPill status={it.status} small /><ProductTag product={it.product} /></div>
      <div className="text-xs text-gray-600">
        {it.timeline?.from ? `${fmt(it.timeline.from)}${it.timeline.to !== it.timeline.from ? ` – ${fmt(it.timeline.to)}` : ''}` : 'Not scheduled'}
        {it.deadline && <span className={late ? 'text-red-600 font-semibold' : ''}> · due {fmt(it.deadline)}</span>}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {it.people.map(p => data.people[p] && <Avatar key={p} person={data.people[p]} size={18} />)}
        {it.requested_by?.length > 0 && <span className="truncate">for {it.requested_by.map(r => first(data.requesters[r]?.name)).filter(Boolean).join(', ')}</span>}
      </div>
    </div>
  );
}
