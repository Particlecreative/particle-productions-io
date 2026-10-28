import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const norm = (v) => (v ? String(v).slice(0, 10) : '');
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/** "18 Oct → 20 Oct" (year only when it isn't this year). */
export function rangeLabel(start, end) {
  const s = norm(start), e = norm(end);
  if (!s && !e) return '';
  const thisYear = todayStr().slice(0, 4);
  const one = (d) => `${+d.slice(8)} ${SHORT[+d.slice(5, 7) - 1]}${d.slice(0, 4) !== thisYear ? ` ${d.slice(2, 4)}` : ''}`;
  if (s && e && s !== e) return `${one(s)} → ${one(e)}`;
  return one(s || e);
}

function MonthGrid({ year, month, start, end, hover, onPick, onHover }) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // Sunday first (Israel week)
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayStr();
  const hi = end || (start && hover && hover > start ? hover : null);
  return (
    <div className="w-[224px]">
      <div className="text-center text-sm font-bold text-gray-800 mb-2">{MONTHS[month]} {year}</div>
      <div className="grid grid-cols-7 text-[10px] font-semibold text-gray-400 mb-1">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="text-center">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const v = ymd(year, month, d);
          const isEdge = v === start || v === end;
          const inRange = start && hi && v > start && v < hi;
          return (
            <button key={i} type="button" onClick={() => onPick(v)} onMouseEnter={() => onHover(v)}
              className={`h-8 text-xs rounded-lg transition-colors ${isEdge ? 'text-white font-bold' : inRange ? 'bg-blue-50 text-blue-800' : 'text-gray-700 hover:bg-gray-100'} ${v === today && !isEdge ? 'ring-1 ring-blue-300' : ''}`}
              style={isEdge ? { background: 'var(--brand-accent, #0808f8)' } : undefined}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pick a start and end in one go (click, click) and save once — plus an optional "cost month" override
 * (which month finance books the cost in; Auto = by the dates).
 */
export function DateRangePopover({ anchor, start: s0, end: e0, expenseMonth, onSave, onClose, showCostMonth = true }) {
  const [start, setStart] = useState(norm(s0));
  const [end, setEnd] = useState(norm(e0));
  const [hover, setHover] = useState(null);
  const [cost, setCost] = useState(expenseMonth ? norm(expenseMonth).slice(0, 7) : '');
  const base = start || todayStr();
  const [view, setView] = useState({ y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 });
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect?.();
    if (!r) return;
    const w = 500, h = 400;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    const top = r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    setPos({ top, left });
  }, [anchor]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !anchor?.contains?.(e.target)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [onClose, anchor]);

  function pick(v) {
    if (!start || (start && end)) { setStart(v); setEnd(''); return; }
    if (v < start) { setEnd(start); setStart(v); } else setEnd(v);
  }
  const next = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
  const shift = (n) => setView(v => { const d = new Date(Date.UTC(v.y, v.m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const months = useMemo(() => {
    const t = todayStr();
    const out = [];
    for (let i = -6; i <= 12; i++) { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 + i, 1)); out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); }
    return out;
  }, []);

  return createPortal(
    <div ref={ref} className="fixed z-[65] bg-white rounded-2xl shadow-2xl border border-gray-200 p-4" style={{ top: pos.top, left: pos.left, width: 500 }}
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={16} /></button>
        <div className="text-xs text-gray-500">{start && !end ? 'Now pick the end date' : 'Pick the start date'}</div>
        <button type="button" onClick={() => shift(1)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronRight size={16} /></button>
      </div>
      <div className="flex justify-between gap-4" onMouseLeave={() => setHover(null)}>
        <MonthGrid year={view.y} month={view.m} start={start} end={end} hover={hover} onPick={pick} onHover={setHover} />
        <MonthGrid year={next.y} month={next.m} start={start} end={end} hover={hover} onPick={pick} onHover={setHover} />
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
        <div className="text-sm font-semibold text-gray-700 min-w-[130px]">{rangeLabel(start, end || start) || 'No dates'}</div>
        {showCostMonth && (
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            Cost month
            <select value={cost} onChange={e => setCost(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
              <option value="">Auto (by the dates)</option>
              {months.map(m => <option key={m} value={m}>{SHORT[+m.slice(5) - 1]} {m.slice(0, 4)}</option>)}
            </select>
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => onSave({ timeline_start: null, timeline_end: null, ...(showCostMonth ? { expense_month: cost ? `${cost}-01` : null } : {}) })} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">Clear dates</button>
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="button" disabled={!start} onClick={() => onSave({ timeline_start: start, timeline_end: end || start, ...(showCostMonth ? { expense_month: cost ? `${cost}-01` : null } : {}) })}
            className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold disabled:opacity-40" style={{ background: 'var(--brand-accent, #0808f8)' }}>Save</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The cell button: shows the range, opens the picker. */
export function DateRangeButton({ start, end, expenseMonth, onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const label = rangeLabel(start, end);
  const costOverride = expenseMonth ? norm(expenseMonth).slice(0, 7) : '';
  if (disabled) return <span className="text-xs text-gray-500">{label || '—'}</span>;
  return (
    <>
      <button ref={btn} type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${label ? 'border-gray-200 text-gray-700 hover:border-blue-300' : 'border-dashed border-gray-300 text-gray-400 hover:text-blue-600 hover:border-blue-300'}`}>
        <CalendarDays size={12} className="shrink-0 text-gray-400" />
        {label || 'Add dates'}
        {costOverride && <span className="text-[9px] font-bold px-1 rounded bg-amber-50 text-amber-700" title="Cost month set by hand">{SHORT[+costOverride.slice(5) - 1]}</span>}
      </button>
      {open && <DateRangePopover anchor={btn.current} start={start} end={end} expenseMonth={expenseMonth} onClose={() => setOpen(false)} onSave={(v) => { setOpen(false); onSave(v); }} />}
    </>
  );
}

/** A dialog version for bulk "Set dates…" (no cost month). */
export function DateRangeDialog({ onSave, onClose, title = 'Set dates' }) {
  const anchor = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className="fixed inset-0 z-[60] bg-black/30" onMouseDown={onClose}>
      <div ref={anchor} className="fixed left-1/2 top-[18%] -translate-x-1/2 w-[500px] h-0" />
      <div className="fixed left-1/2 top-[13%] -translate-x-1/2 text-white font-semibold text-sm flex items-center gap-2">{title}<X size={14} className="cursor-pointer" onClick={onClose} /></div>
      {ready && <DateRangePopover anchor={anchor.current} showCostMonth={false} onClose={onClose} onSave={onSave} />}
    </div>
  );
}
