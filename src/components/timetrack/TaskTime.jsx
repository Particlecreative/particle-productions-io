// Time on one task — for the task panel: "Requested 5 days ago · Worked 6h 20m (clocked) · 2 review rounds · In review
// for 3h" + a mini status strip. Reads /api/timetrack/task/:board/:id; shows nothing when the person may not see it (403).
// Also exports the status strip and its hover tooltip, used by the Time tracking panel.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ChevronDown } from 'lucide-react';
import { Avatar } from '../studio/Bits';
import {
  timetrackApi, TT_CSS, CATEGORY_LABEL, CATEGORY_HINT, CATEGORY_ORDER, catColor, fmtDur, fmtHM, fmtAgo, fmtDate, fmtDateTime, workdaysBetween,
} from '../../lib/timetrackService';

// ── Tooltip ─────────────────────────────────────────────────────────────────
/** A hover tooltip that follows the pointer: const { tip, show, hide } = useTip(); render {tip}. */
export function useTip() {
  const [state, setState] = useState(null);
  const show = useCallback((e, content) => setState({ x: e.clientX, y: e.clientY, content }), []);
  const hide = useCallback(() => setState(null), []);
  const tip = state ? <TipBox {...state} /> : null;
  return { tip, show, hide };
}
function TipBox({ x, y, content }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x + 14, top: y + 14 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8));
    const top = y + 14 + h > window.innerHeight - 8 ? Math.max(8, y - h - 10) : y + 14;
    setPos({ left, top });
  }, [x, y, content]);
  return createPortal(
    <div ref={ref} role="tooltip" className="tt-root fixed z-[200] pointer-events-none max-w-[280px] rounded-xl px-3 py-2 text-[12px] leading-snug shadow-xl bg-[#030b2e] text-white dark:bg-[#e6edf3] dark:text-[#030b2e]"
      style={{ left: pos.left, top: pos.top }}>
      {content}
    </div>, document.body);
}

/** Tooltip body for one status segment. */
export function SegmentTip({ seg, people }) {
  const [category, from, to, status, by] = Array.isArray(seg) ? seg : [seg.category, seg.from_ms, seg.to_ms, seg.status, seg.by];
  const who = by && people?.[by]?.name;
  return (
    <div>
      <div className="flex items-center gap-1.5 font-semibold">
        <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: catColor(category) }} />
        {status || CATEGORY_LABEL[category]} <span className="opacity-60 font-normal">· {CATEGORY_LABEL[category]}</span>
      </div>
      <div className="mt-0.5 tabular-nums"><b>{fmtDur(to - from)}</b> <span className="opacity-70">· {fmtDateTime(from)} → {fmtDateTime(to)}</span></div>
      {who && <div className="opacity-70 mt-0.5">Moved here by {who}</div>}
    </div>
  );
}

/**
 * The status strip: one coloured block per status stretch, widths by time, a 2px gap between blocks.
 * strip: [[category, from, to, status, by], …] or segments; clipped to [start, end].
 */
export function StatusStrip({ strip, start, end, height = 10, people, onTip, onLeave, className = '' }) {
  const segs = (strip || []).map(s => (Array.isArray(s) ? s : [s.category, s.from_ms, s.to_ms, s.status, s.by]))
    .map(([c, a, b, st, by]) => [c, Math.max(a, start ?? a), Math.min(b, end ?? b), st, by]).filter(([, a, b]) => b > a);
  const total = segs.reduce((s, [, a, b]) => s + (b - a), 0);
  if (!total) return <div className={`rounded-full bg-gray-100 dark:bg-white/10 ${className}`} style={{ height }} />;
  return (
    <div className={`flex gap-[2px] w-full rounded-full overflow-hidden ${className}`} style={{ height }} onMouseLeave={onLeave}>
      {segs.map((s, i) => (
        <div key={i} className="h-full min-w-[3px] transition-[filter] hover:brightness-110"
          style={{ flexGrow: s[2] - s[1], flexBasis: 0, background: catColor(s[0]) }}
          onMouseMove={onTip ? (e) => onTip(e, <SegmentTip seg={s} people={people} />) : undefined} />
      ))}
    </div>
  );
}

const BOARDS = new Set(['video', 'design']);

/** The compact block for a task panel. Props: board ('video' | 'design'), itemId. */
export default function TaskTime({ board, itemId, className = '' }) {
  const [state, setState] = useState({ loading: true });
  const [open, setOpen] = useState(false);
  const { tip, show, hide } = useTip();
  useEffect(() => {
    if (!BOARDS.has(board) || !itemId) { setState({ hidden: true }); return undefined; }
    let alive = true;
    setState({ loading: true });
    timetrackApi.task(board, itemId)
      .then((d) => { if (alive) setState(d?.task ? { data: d } : { hidden: true }); })
      .catch(() => { if (alive) setState({ hidden: true }); });   // 403 (not theirs) or unavailable → nothing
    return () => { alive = false; };
  }, [board, itemId]);

  if (state.hidden) return null;
  if (state.loading) {
    return (
      <div className={`rounded-xl bg-gray-50 dark:bg-white/5 p-3.5 ${className}`} aria-busy="true">
        <div className="h-3 w-2/3 rounded-full bg-gray-200 dark:bg-white/10 animate-pulse" />
        <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-white/10 animate-pulse mt-3" />
      </div>
    );
  }
  const { task, people } = state.data;
  const m = task.metrics;
  const now = Date.parse(state.data.generated_at) || Date.now();
  const end = m.delivered_at ?? now;
  const cur = m.current;
  const parts = [];
  parts.push(<span key="r">Requested <b className="font-semibold text-[#030b2e] dark:text-white">{fmtAgo(m.requested_at, now)}</b></span>);
  if (m.worked_ms > 0) {
    parts.push(
      <span key="w" title={m.estimated ? 'Estimated: someone on it isn’t on BambooHR, so working hours (Sun–Thu 09:00–19:00) are used' : 'Time in Working while the editor / designer was clocked in'}>
        Worked <b className="font-semibold text-[#030b2e] dark:text-white">{m.estimated ? '≈ ' : ''}{fmtHM(m.worked_ms)}</b> {m.estimated ? '(estimated)' : '(clocked)'}
      </span>,
    );
  } else if (m.still_waiting) {
    parts.push(<span key="w">Not started yet</span>);
  }
  if (m.review_rounds > 0) parts.push(<span key="rr">{m.review_rounds} review round{m.review_rounds === 1 ? '' : 's'}</span>);
  if (m.fix_rounds > 0) parts.push(<span key="fr">{m.fix_rounds} fix round{m.fix_rounds === 1 ? '' : 's'}</span>);
  if (!m.open) {
    parts.push(<span key="d">Delivered {fmtDate(m.delivered_at)} after <b className="font-semibold text-[#030b2e] dark:text-white">{fmtDur(m.lead_ms)}</b>{m.on_time === true ? ' · on time' : m.on_time === false ? ' · late' : ''}</span>);
  } else if (cur) {
    parts.push(<span key="c">{cur.status || CATEGORY_LABEL[cur.category]} for <b className="font-semibold text-[#030b2e] dark:text-white">{fmtDur(now - cur.since_ms)}</b></span>);
  }
  const workers = Object.entries(m.worked_by_person || {}).sort((a, b) => b[1] - a[1]);
  const cats = CATEGORY_ORDER.filter(c => (m.by_category?.[c] || 0) > 0);

  return (
    <div className={`tt-root rounded-xl bg-gray-50 dark:bg-white/5 p-3.5 ${className}`}>
      <style>{TT_CSS}</style>
      <div className="flex items-center gap-2">
        <Clock size={13} className="text-[#0808f8] dark:text-[#8c93ff] flex-none" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Time on this task</span>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
          className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-[#0808f8] dark:hover:text-[#8c93ff]">
          {open ? 'Less' : 'Details'} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div className="mt-1.5 text-[12.5px] text-gray-600 dark:text-gray-300 flex flex-wrap gap-x-1.5 gap-y-0.5">
        {parts.map((p, i) => <span key={i} className="whitespace-nowrap">{i > 0 && <span className="text-gray-300 dark:text-gray-600 mr-1.5">·</span>}{p}</span>)}
      </div>
      <StatusStrip strip={task.segments} start={m.requested_at} end={end} height={8} people={people} onTip={show} onLeave={hide} className="mt-2.5" />
      {open && (
        <div className="mt-3 flex flex-col gap-2.5 text-[12px] text-gray-600 dark:text-gray-300">
          <div className="flex flex-wrap gap-1.5">
            {cats.map(c => (
              <span key={c} title={CATEGORY_HINT[c]} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <span className="w-2 h-2 rounded-sm" style={{ background: catColor(c) }} />
                {CATEGORY_LABEL[c]} <b className="font-semibold text-[#030b2e] dark:text-white tabular-nums">{fmtDur(m.by_category[c])}</b>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>Requested {fmtDateTime(m.requested_at)}</span>
            {m.first_started_at ? <span>Started after <b className="font-semibold">{fmtDur(m.waiting_ms)}</b> waiting</span> : <span>Not started yet</span>}
            <span>{m.open ? 'Open for' : 'Took'} <b className="font-semibold">{fmtDur(m.lead_ms)}</b> ({workdaysBetween(m.requested_at, end)} work days)</span>
            {m.deadline && <span>Deadline {fmtDate(Date.parse(`${m.deadline}T12:00:00Z`))}</span>}
            {m.fixes_worked_ms > 0 && <span title="Clocked-in time while the task was in Fixes Round — not part of Worked">+ {fmtHM(m.fixes_worked_ms)} during fixes</span>}
          </div>
          {workers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {workers.map(([id, ms]) => (
                <span key={id} className="inline-flex items-center gap-1.5">
                  <Avatar person={people?.[id] || { name: '?' }} size={18} />
                  <span>{(people?.[id]?.name || 'Someone').split(' ')[0]}</span>
                  <b className="font-semibold tabular-nums">{people?.[id]?.matched ? '' : '≈ '}{fmtHM(ms)}</b>
                </span>
              ))}
            </div>
          )}
          {task.partial && <div className="text-[11px] text-amber-700 dark:text-amber-400">Part of this task’s early history isn’t on Monday any more (it keeps about a year) — its first days may be missing.</div>}
        </div>
      )}
      {tip}
    </div>
  );
}
