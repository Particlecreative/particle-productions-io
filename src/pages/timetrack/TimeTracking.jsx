// Time tracking — how long Video and Design tasks really take, from the request to delivery (Tomer, 25 Nov 2026).
// Lead time, waiting, time per status, and the real working time: time in Working while the editor / designer was
// clocked in on BambooHR (working hours when someone isn't on BambooHR — marked ≈). Per person, type, product,
// requester and campaign; outliers; week by week; every task with its status strip; CSV.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  RefreshCw, Download, Loader2, AlertTriangle, Info, ChevronDown, ChevronUp, Search, ExternalLink, Lock, X, Film, PenTool, Flame, CircleCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/studio/Bits';
import { StatusStrip, useTip } from '../../components/timetrack/TaskTime';
import {
  timetrackApi, TT_CSS, CATEGORY_ORDER, CATEGORY_LABEL, CATEGORY_HINT, catColor, fmtDur, fmtHM, fmtAgo, fmtDate, fmtDateTime, pct,
  presetRange, RANGE_PRESETS, israelYmd, addDaysYmd, workdaysBetween,
} from '../../lib/timetrackService';

const CARD = 'bg-white dark:bg-[#161b22] rounded-2xl border border-gray-200 dark:border-white/10 shadow-[0_1px_2px_rgba(3,11,46,.04)]';
const INK = 'text-[#030b2e] dark:text-white';
const SOFT = 'text-gray-500 dark:text-gray-400';
const MUTED = 'text-gray-400 dark:text-gray-500';
const FILTERS = [['person', 'Person'], ['product', 'Product'], ['type', 'Type'], ['requester', 'Requested by'], ['campaign', 'Campaign']];
const MAX_DAYS = 120;
const BOARD_ICON = { video: Film, design: PenTool };

// ── Small pieces ────────────────────────────────────────────────────────────
function Card({ title, subtitle, right, children, className = '', pad = true }) {
  return (
    <section className={`${CARD} ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 sm:px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className={`text-sm font-bold ${INK}`}>{title}</h2>}
            {subtitle && <p className={`text-xs mt-0.5 ${SOFT}`}>{subtitle}</p>}
          </div>
          {right && <div className="ml-auto min-w-0 max-w-full">{right}</div>}
        </header>
      )}
      <div className={pad ? 'p-4 sm:p-5 pt-3 sm:pt-3' : ''}>{children}</div>
    </section>
  );
}

function Seg({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap p-1 rounded-xl bg-gray-100 dark:bg-white/5 max-w-full">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={`text-xs px-3 py-1.5 font-semibold rounded-lg whitespace-nowrap transition-colors ${value === v ? `bg-white dark:bg-white/15 shadow ${INK}` : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Single-series weekly trend, as wide as its card: a 2px line, a light wash under it, a ringed dot on the latest
 * week, and a hover target per week (wider than the mark).
 */
function Sparkline({ points, fmt, onTip, onLeave, height = 28 }) {
  const known = points.map(p => p.v).filter(v => v != null && Number.isFinite(v));
  if (points.length < 2 || known.length < 2) return null;
  const lo = Math.min(...known, 0);
  const span = (Math.max(...known) - lo) || 1;
  const W = 100;
  const step = W / (points.length - 1);
  const xy = points.map((p, i) => (p.v == null ? null : [i * step, height - 3 - ((p.v - lo) / span) * (height - 8)]));
  const path = xy.reduce((acc, p, i) => (p ? `${acc}${acc && xy[i - 1] ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}` : acc), '');
  const firstI = xy.findIndex(Boolean);
  const lastI = xy.length - 1 - [...xy].reverse().findIndex(Boolean);
  const area = `${path}L${xy[lastI][0].toFixed(2)},${height}L${xy[firstI][0].toFixed(2)},${height}Z`;
  return (
    <div className="relative w-full" style={{ height }} onMouseLeave={onLeave}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden="true">
        <path d={area} fill="var(--tt-accent)" opacity="0.1" />
        <path d={path} fill="none" stroke="var(--tt-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${xy[lastI][0]}%`, top: xy[lastI][1], background: 'var(--tt-accent)', boxShadow: '0 0 0 2px var(--tt-gap)' }} />
      <div className="absolute inset-0 flex">
        {points.map((p, i) => (
          <span key={i} className="h-full" style={{ flex: i === 0 || i === points.length - 1 ? 0.5 : 1 }}
            onMouseMove={(e) => onTip?.(e, <div><div className="opacity-70">Week of {p.label}</div><b className="tabular-nums">{p.v == null ? 'No deliveries' : fmt(p.v)}</b></div>)} />
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hint, spark, meter, warn, tipApi }) {
  return (
    <div className={`${CARD} p-4 flex flex-col gap-1.5 min-w-0`} title={hint}>
      <div className={`text-[11px] font-bold uppercase tracking-wider ${MUTED} truncate`}>{label}</div>
      <div className={`text-[26px] leading-none font-extrabold tabular-nums whitespace-nowrap ${INK}`}>{value}</div>
      {sub && <div className={`text-xs ${warn ? 'text-amber-700 dark:text-amber-400' : SOFT} truncate`} title={typeof sub === 'string' ? sub : undefined}>{sub}</div>}
      <div className="mt-auto pt-1">
        {spark && <Sparkline {...spark} onTip={tipApi.show} onLeave={tipApi.hide} />}
        {meter != null && (
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden mt-2">
            <div className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, meter) * 100)}%`, background: 'var(--tt-accent)' }} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Stacked bar of categories with a 2px gap between parts; hover for the numbers. */
function CategoryBar({ values, height = 14, onTip, onLeave, per }) {
  const parts = CATEGORY_ORDER.map(c => [c, values?.[c] || 0]).filter(([, v]) => v > 0);
  const total = parts.reduce((a, [, v]) => a + v, 0);
  if (!total) return <div className="rounded-full bg-gray-100 dark:bg-white/10" style={{ height }} />;
  return (
    <div className="flex gap-[2px] w-full rounded-full overflow-hidden" style={{ height }} onMouseLeave={onLeave}>
      {parts.map(([c, v]) => (
        <div key={c} className="h-full min-w-[3px] hover:brightness-110" style={{ flexGrow: v, flexBasis: 0, background: catColor(c) }}
          onMouseMove={onTip ? (e) => onTip(e, (
            <div>
              <div className="flex items-center gap-1.5 font-semibold"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: catColor(c) }} />{CATEGORY_LABEL[c]}</div>
              <div className="tabular-nums mt-0.5"><b>{Math.round((v / total) * 100)}%</b>{per ? <> · {fmtDur(v / per)} per task</> : <> · {fmtDur(v)}</>}</div>
              <div className="opacity-70 mt-0.5">{CATEGORY_HINT[c]}</div>
            </div>
          )) : undefined} />
      ))}
    </div>
  );
}

function Legend({ only }) {
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] ${SOFT}`}>
      {CATEGORY_ORDER.filter(c => !only || only.includes(c)).map(c => (
        <span key={c} className="inline-flex items-center gap-1.5" title={CATEGORY_HINT[c]}>
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: catColor(c) }} />{CATEGORY_LABEL[c]}
        </span>
      ))}
    </div>
  );
}

/** A table you can sort by clicking a column; scrolls sideways inside its card on a phone. */
function SortTable({ columns, rows, initial, onRowClick, rowKey = (r) => r.key, active, empty = 'Nothing here yet', limit = 12 }) {
  const [sort, setSort] = useState(initial || { key: columns[1]?.key, dir: -1 });
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sort.key);
    if (!col?.value) return rows;
    return [...rows].sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
    });
  }, [rows, sort, columns]);
  if (!rows.length) return <div className={`text-sm text-center py-8 ${MUTED}`}>{empty}</div>;
  const shown = all ? sorted : sorted.slice(0, limit);
  return (
    <div>
      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
        <table className="w-full text-[13px] border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((c) => {
                const on = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" className={`py-2 px-2 first:pl-0 last:pr-0 font-semibold text-[11px] uppercase tracking-wide whitespace-nowrap border-b border-gray-100 dark:border-white/5 ${c.align === 'right' ? 'text-right' : 'text-left'} ${MUTED}`}>
                    {c.value ? (
                      <button type="button" onClick={() => setSort({ key: c.key, dir: on ? -sort.dir : (c.firstDir || -1) })}
                        className={`inline-flex items-center gap-0.5 hover:text-gray-700 dark:hover:text-gray-200 ${on ? INK : ''}`} title={c.hint}>
                        {c.label}{on && (sort.dir < 0 ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                      </button>
                    ) : <span title={c.hint}>{c.label}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={`${onRowClick ? 'cursor-pointer' : ''} ${active === k ? 'bg-[#0808f8]/[0.05] dark:bg-[#8c93ff]/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                  {columns.map(c => (
                    <td key={c.key} className={`py-2 px-2 first:pl-0 last:pr-0 border-b border-gray-50 dark:border-white/5 whitespace-nowrap tabular-nums ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className || 'text-gray-700 dark:text-gray-300'}`}>
                      {c.render ? c.render(r) : c.value?.(r) ?? '–'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-2 text-xs font-semibold text-[#0808f8] dark:text-[#8c93ff] hover:underline">
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  const on = !!value;
  return (
    <label className={`relative flex sm:inline-flex items-center rounded-xl border text-xs font-semibold min-w-0 max-w-full ${on ? 'border-[#0808f8]/40 bg-[#0808f8]/[0.05] text-[#0808f8] dark:text-[#8c93ff] dark:border-[#8c93ff]/40' : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 bg-white dark:bg-transparent'}`}>
      <span className="pl-3 pr-1 whitespace-nowrap">{label}</span>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="appearance-none bg-transparent pr-7 pl-1 py-2 flex-1 min-w-0 sm:flex-none sm:max-w-[11rem] truncate focus:outline-none cursor-pointer text-inherit">
        <option value="">All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}{o.count != null ? ` (${o.count})` : ''}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2 pointer-events-none opacity-60" />
    </label>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className={`${CARD} h-[104px] animate-pulse`} />)}
      </div>
      <div className={`${CARD} h-40 animate-pulse`} />
      <div className={`${CARD} h-72 animate-pulse`} />
      <p className={`text-sm text-center ${SOFT}`}>Reading every task’s history from Monday — the first look at a period can take up to a minute.</p>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────
export default function TimeTracking() {
  const { isEditor, user } = useAuth();
  const allowed = isEditor || !!user?.super_admin;
  const [params, setParams] = useSearchParams();
  const preset = params.get('range') || 'month';
  const range = useMemo(() => {
    if (preset === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') || '')) {
      return { from: params.get('from'), to: params.get('to') };
    }
    return presetRange(preset === 'custom' ? 'month' : preset);
  }, [preset, params]);
  const board = ['video', 'design'].includes(params.get('board')) ? params.get('board') : 'all';
  const filters = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, params.get(k) || ''])), [params]);
  const query = useMemo(() => ({ ...range, board, ...filters }), [range, board, filters]);
  const queryKey = JSON.stringify(query);

  const set = useCallback((patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === '' || v === 'all') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  }, [params, setParams]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const reqId = useRef(0);
  const tipApi = useTip();

  const load = useCallback(async (force = false) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const d = await timetrackApi.overview({ ...JSON.parse(queryKey), force });
      if (id === reqId.current) setData(d);
    } catch (e) {
      if (id === reqId.current) setError({ message: e.message === 'SYSTEM_UPDATING' ? 'The server is updating — try again in a moment' : e.message, status: e.status });
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [queryKey]);
  useEffect(() => { if (allowed) load(false); }, [load, allowed]);

  const downloadCsv = async () => {
    setCsvBusy(true);
    try { await timetrackApi.downloadCsv(query); } catch (e) { setError({ message: e.message }); } finally { setCsvBusy(false); }
  };

  if (!allowed || error?.status === 403) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center p-10 rounded-3xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22]">
        <Lock className="mx-auto text-gray-400" />
        <h2 className={`mt-3 text-xl font-bold ${INK}`}>Editors and Admins only</h2>
        <p className={`mt-1 text-sm ${SOFT}`}>Time tracking shows each person’s hours, so it’s limited to Editors and Admins.</p>
      </div>
    );
  }

  const today = israelYmd();
  const anyFilter = FILTERS.some(([k]) => filters[k]);
  const opt = data?.filters || {};
  const options = {
    person: (opt.people || []).map(p => ({ value: p.id, label: p.name, count: p.count })),
    product: (opt.products || []).map(p => ({ value: p.label, label: p.label, count: p.count })),
    type: (opt.types || []).map(p => ({ value: p.label, label: p.label, count: p.count })),
    requester: (opt.requesters || []).map(p => ({ value: p.id, label: p.name, count: p.count })),
    campaign: (opt.campaigns || []).map(p => ({ value: p.label, label: p.label, count: p.count })),
  };

  return (
    <div className="tt-root max-w-[1600px] mx-auto pb-16 flex flex-col gap-4 min-w-0">
      <style>{TT_CSS}</style>

      {/* Header */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="brand-title text-4xl flex items-center gap-2" style={{ color: 'var(--brand-primary)' }}>Time tracking</h1>
          <p className={`text-sm mt-1 ${SOFT}`}>How long tasks really take — from the request to delivery, status by status, and the hours actually spent working on them.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {data && <span className={`text-xs ${MUTED}`} title={fmtDateTime(Date.parse(data.generated_at))}>Updated {fmtAgo(Date.parse(data.generated_at))}</span>}
          <button type="button" onClick={() => load(true)} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 hover:border-[#0808f8]/40 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={downloadCsv} disabled={csvBusy || !data}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white disabled:opacity-50" style={{ background: '#0808f8' }}>
            {csvBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download CSV
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className={`${CARD} p-3 sm:p-4 flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <Seg value={preset} onChange={(v) => set(v === 'custom' ? { range: v, from: range.from, to: range.to } : { range: v, from: null, to: null })} options={RANGE_PRESETS} />
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input type="date" value={range.from} max={range.to} min={addDaysYmd(range.to, -(MAX_DAYS - 1))} onChange={(e) => e.target.value && set({ from: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200" aria-label="From" />
              <span className={MUTED}>→</span>
              <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && set({ to: e.target.value })}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200" aria-label="To" />
            </div>
          )}
          <span className={`text-xs ${MUTED} hidden md:inline`}>{fmtDate(Date.parse(`${range.from}T12:00:00Z`))} – {fmtDate(Date.parse(`${range.to}T12:00:00Z`))}</span>
          <div className="sm:ml-auto"><Seg value={board} onChange={(v) => set({ board: v })} options={[['all', 'All'], ['video', 'Video'], ['design', 'Design']]} /></div>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {FILTERS.map(([k, label]) => <FilterSelect key={k} label={label} value={filters[k]} options={options[k]} onChange={(v) => set({ [k]: v })} />)}
          {anyFilter && (
            <button type="button" onClick={() => set(Object.fromEntries(FILTERS.map(([k]) => [k, null])))} className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-red-600">
              <X size={13} /> Clear filters
            </button>
          )}
          {loading && data && <Loader2 size={14} className="animate-spin text-[#0808f8] dark:text-[#8c93ff]" aria-label="Updating" />}
        </div>
      </div>

      {error && error.status !== 403 && (
        <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle size={16} className="flex-none" /> <span className="min-w-0">{error.message}</span>
          <button type="button" onClick={() => load(false)} className="ml-auto font-semibold underline">Try again</button>
        </div>
      )}

      {!data && loading && <Skeleton />}
      {data && <Body data={data} board={board} filters={filters} set={set} tipApi={tipApi} loading={loading} howOpen={howOpen} setHowOpen={setHowOpen} />}
      {tipApi.tip}
    </div>
  );
}

function ClockNote({ source, setHowOpen }) {
  const text = source === 'bamboohr' ? 'Worked time = time in Working while the editor / designer was clocked in on BambooHR.'
    : source === 'mixed' ? 'Worked time uses BambooHR clock-ins. People who aren’t on BambooHR are estimated from working hours (Sun–Thu 09:00–19:00) and marked ≈.'
      : 'BambooHR isn’t connected for these people, so worked time is estimated from working hours (Sun–Thu 09:00–19:00) and marked ≈.';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`inline-flex items-center gap-1.5 text-xs ${SOFT}`}>
        <span className={`w-2 h-2 rounded-full flex-none ${source === 'bamboohr' ? 'bg-emerald-500' : source === 'mixed' ? 'bg-amber-500' : 'bg-gray-400'}`} />{text}
      </span>
      <button type="button" onClick={() => setHowOpen(v => !v)} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-[#0808f8] dark:hover:text-[#8c93ff]">
        <Info size={13} /> How it’s counted
      </button>
    </div>
  );
}

function HowItWorks() {
  const Row = ({ t, children }) => <div><dt className={`font-semibold ${INK}`}>{t}</dt><dd className={`mt-0.5 ${SOFT}`}>{children}</dd></div>;
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[13px]">
        <Row t="Lead time">From the moment the ticket was created on Monday until it was delivered (or until now, if it’s still open). Calendar time — nights and weekends included.</Row>
        <Row t="Delivered">The first move to Approved / Completed after the last work on it. If it was approved and then sent back for fixes, the later approval counts.</Row>
        <Row t="Waiting before start">From the request until it first moved to Working.</Row>
        <Row t="Worked (clocked)">Time the task was in Working while the editor / designer on it at that moment was clocked in on BambooHR. If two tasks were in Working at once, each gets that time. Fixes Round is shown separately in each task’s details. People not on BambooHR (or before the team started clocking in) use working hours, Sun–Thu 09:00–19:00 — marked ≈.</Row>
        <Row t="Utilization">Of the hours someone was clocked in, the share with at least one of their tasks in Working. A low number usually means statuses weren’t moved to Working.</Row>
        <Row t="Rounds and on time">A review round = a move into review from something else; a fix round = a move into Fixes Round. On time = delivered on or before the deadline date.</Row>
      </dl>
      <p className={`text-xs mt-4 ${MUTED}`}>The Studio’s Time tab counts “hands-on” time a little differently: Working and Fixes Round together, split between the tasks someone had open at the same time. So a task’s hours here can be a bit higher than its hands-on hours there; the Studio’s task “life” (submitted → completed) uses the same statuses as this page.</p>
    </div>
  );
}

function Body({ data, board, filters, set, tipApi, loading, howOpen, setHowOpen }) {
  const k = data.kpis;
  const weekly = data.weekly || [];
  const spark = (key, fmt) => (weekly.length >= 2 ? { points: weekly.map(w => ({ label: w.label, v: w[key] })), fmt } : null);
  const toggle = (key, value) => set({ [key]: filters[key] === value ? '' : value });
  const people = data.people || {};
  const dim = loading ? 'opacity-60 transition-opacity' : 'transition-opacity';
  const perTask = k.delivered || 0;
  const time = k.time_by_category || {};
  const timeTotal = Object.values(time).reduce((a, b) => a + b, 0);

  return (
    <div className={`flex flex-col gap-4 min-w-0 ${dim}`}>
      <ClockNote source={data.clock_source} setHowOpen={setHowOpen} />
      {howOpen && <HowItWorks />}
      {data.warnings?.length > 0 && (
        <details className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-300">
          <summary className="cursor-pointer font-semibold">{data.warnings.length} note{data.warnings.length === 1 ? '' : 's'} about this data</summary>
          <ul className="list-disc pl-5 mt-1.5 flex flex-col gap-0.5">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Tasks delivered" value={k.delivered} sub={k.open ? `${k.open} still open` : 'Nothing open'} spark={spark('delivered', v => `${v} delivered`)} tipApi={tipApi} />
        <Kpi label="Median lead time" value={fmtDur(k.median_lead_ms)} sub={k.median_waiting_ms != null ? `waits ${fmtDur(k.median_waiting_ms)} before work starts` : 'request → delivered'}
          hint="Half of the delivered tasks took less than this, from the request to delivery" spark={spark('median_lead_ms', fmtDur)} tipApi={tipApi} />
        <Kpi label="Median worked" value={fmtHM(k.median_worked_ms)} sub={k.estimated ? `≈ ${k.estimated} estimated (not on BambooHR)` : 'clocked, in Working'}
          hint="Per delivered task: time in Working while clocked in" spark={spark('median_worked_ms', fmtHM)} tipApi={tipApi} />
        <Kpi label="Review rounds" value={k.avg_review_rounds ?? '–'} sub={k.avg_fix_rounds != null ? `${k.avg_fix_rounds} fix rounds on average` : 'per delivered task'}
          hint="Average moves into review per delivered task" spark={spark('avg_review_rounds', v => `${v} rounds`)} tipApi={tipApi} />
        <Kpi label="On time" value={k.on_time_pct == null ? '–' : `${k.on_time_pct}%`} sub="of delivered tasks with a deadline"
          spark={spark('on_time_pct', v => `${v}% on time`)} warn={k.on_time_pct != null && k.on_time_pct < 70} tipApi={tipApi} />
        <Kpi label="Utilization" value={pct(k.utilization)} meter={k.utilization}
          sub={k.clocked_ms ? `${fmtHM(k.busy_ms)} in Working of ${fmtHM(k.clocked_ms)} clocked` : 'Needs BambooHR clock-ins'}
          hint="Of the hours people were clocked in, the share with a task in Working" tipApi={tipApi} />
      </div>

      {/* Where the time goes + outliers */}
      <div className="grid xl:grid-cols-3 gap-4 min-w-0">
        <Card className="xl:col-span-2 min-w-0" title="Where the time goes" subtitle={`Delivered tasks, from the request to delivery — ${perTask ? `on average ${fmtDur(timeTotal / perTask)} per task` : 'nothing delivered in this period'}`}
          right={<Legend only={CATEGORY_ORDER.filter(c => time[c] > 0)} />}>
          <div className="flex flex-col gap-3">
            <CategoryBar values={time} height={16} per={perTask} onTip={tipApi.show} onLeave={tipApi.hide} />
            {board === 'all' && (data.by_board || []).filter(b => b.delivered).length > 1 && (data.by_board || []).filter(b => b.delivered).map(b => {
              const Icon = BOARD_ICON[b.key] || Film;
              return (
                <div key={b.key} className="grid grid-cols-[88px_minmax(0,1fr)_64px] items-center gap-3">
                  <span className={`text-xs font-semibold flex items-center gap-1.5 ${SOFT}`}><Icon size={13} />{data.boards?.[b.key]?.label || b.key}</span>
                  <CategoryBar values={b.by_category} height={8} per={b.delivered} onTip={tipApi.show} onLeave={tipApi.hide} />
                  <span className={`text-xs text-right tabular-nums ${SOFT}`}>{fmtDur(b.lead_median_ms)}</span>
                </div>
              );
            })}
            {perTask > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {CATEGORY_ORDER.filter(c => time[c] > 0).map(c => (
                  <div key={c} className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2" title={CATEGORY_HINT[c]}>
                    <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${SOFT}`}><span className="w-2 h-2 rounded-sm" style={{ background: catColor(c) }} />{CATEGORY_LABEL[c]}</div>
                    <div className={`text-sm font-bold tabular-nums mt-0.5 ${INK}`}>{fmtDur(time[c] / perTask)}</div>
                    <div className={`text-[11px] tabular-nums ${MUTED}`}>{Math.round((time[c] / timeTotal) * 100)}% · per task</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Outliers rows={data.outliers || []} people={people} />
      </div>

      {/* People */}
      <Card className="min-w-0" title="People" subtitle="Their delivered tasks in this period · click someone to see only their tasks">
        <SortTable rows={data.by_person || []} active={filters.person} onRowClick={(r) => toggle('person', r.key)} empty="No one worked on tasks in this period"
          initial={{ key: 'delivered', dir: -1 }}
          columns={[
            { key: 'name', label: 'Person', value: r => r.label, firstDir: 1, className: INK, render: r => (
              <span className="flex items-center gap-2 min-w-[150px]"><Avatar person={{ name: r.label, photo: r.photo }} size={26} />
                <span className="font-semibold truncate max-w-[160px]">{r.label}</span>
                {!r.matched && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400`} title="Not matched to BambooHR — worked time is estimated from working hours">≈ est.</span>}
              </span>) },
            { key: 'delivered', label: 'Delivered', align: 'right', value: r => r.delivered, render: r => <span><b className={INK}>{r.delivered}</b>{r.open ? <span className={MUTED}> · {r.open} open</span> : null}</span> },
            { key: 'worked_median', label: 'Worked / task', align: 'right', hint: 'Median of their worked time per delivered task', value: r => r.worked_median_ms, render: r => fmtHM(r.worked_median_ms) },
            { key: 'worked_total', label: 'Worked total', align: 'right', value: r => r.worked_total_ms, render: r => fmtHM(r.worked_total_ms) },
            { key: 'lead', label: 'Avg lead time', align: 'right', value: r => r.lead_avg_ms, render: r => fmtDur(r.lead_avg_ms) },
            { key: 'rr', label: 'Review rounds', align: 'right', value: r => r.review_rounds_avg, render: r => r.review_rounds_avg ?? '–' },
            { key: 'fr', label: 'Fix rounds', align: 'right', value: r => r.fix_rounds_avg, render: r => r.fix_rounds_avg ?? '–' },
            { key: 'ontime', label: 'On time', align: 'right', value: r => r.on_time_pct, render: r => (r.on_time_pct == null ? '–' : `${r.on_time_pct}%`) },
            { key: 'util', label: 'Utilization', align: 'right', hint: 'Share of their clocked hours with a task in Working', value: r => r.utilization, render: r => (r.utilization == null
              ? <span className={MUTED} title={r.matched ? 'No clock-ins in this period' : 'Not on BambooHR'}>–</span>
              : <span className="inline-flex items-center gap-2 justify-end"><span className="w-14 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.round(r.utilization * 100)}%`, background: 'var(--tt-accent)' }} /></span>{pct(r.utilization)}</span>) },
            { key: 'clocked', label: 'Clocked', align: 'right', value: r => r.clocked_ms, render: r => (r.clocked_ms == null ? <span className={MUTED}>–</span> : fmtHM(r.clocked_ms)) },
          ]} />
      </Card>

      {/* Breakdowns */}
      <div className="grid lg:grid-cols-2 gap-4 min-w-0">
        <Breakdown title="By type" subtitle="Click a type to see only its tasks" rows={data.by_type} active={filters.type} onPick={(r) => toggle('type', r.key)} tipApi={tipApi} />
        <Breakdown title="By product" subtitle="Click a product to see only its tasks" rows={data.by_product} active={filters.product} onPick={(r) => toggle('product', r.key)} tipApi={tipApi} />
        <Breakdown title="By who asked" subtitle="Requested by" rows={data.by_requester} active={filters.requester} onPick={(r) => toggle('requester', r.key)} tipApi={tipApi} person />
        <Breakdown title="By campaign" subtitle="Tasks that belong to a campaign" rows={data.by_campaign} active={filters.campaign} onPick={(r) => toggle('campaign', r.key)} tipApi={tipApi} empty="No tasks with a campaign in this period" />
      </div>

      <Tasks data={data} tipApi={tipApi} />
    </div>
  );
}

function Breakdown({ title, subtitle, rows = [], active, onPick, tipApi, person = false, empty }) {
  return (
    <Card title={title} subtitle={subtitle} className="min-w-0">
      <SortTable rows={rows} active={active} onRowClick={onPick} empty={empty || 'Nothing in this period'} initial={{ key: 'delivered', dir: -1 }} limit={8}
        columns={[
          { key: 'name', label: 'Name', value: r => r.label, firstDir: 1, className: INK, render: r => (
            <span className="flex items-center gap-2 min-w-[120px]">{person && <Avatar person={{ name: r.label, photo: r.photo }} size={22} />}<span className="font-semibold truncate max-w-[180px]" title={r.label}>{r.label}</span></span>) },
          { key: 'delivered', label: 'Delivered', align: 'right', value: r => r.delivered, render: r => <span><b className={INK}>{r.delivered}</b>{r.open ? <span className={MUTED}> · {r.open} open</span> : null}</span> },
          { key: 'lead', label: 'Median lead', align: 'right', value: r => r.lead_median_ms, render: r => fmtDur(r.lead_median_ms) },
          { key: 'worked', label: 'Median worked', align: 'right', value: r => r.worked_median_ms, render: r => fmtHM(r.worked_median_ms) },
          { key: 'rounds', label: 'Rounds', align: 'right', hint: 'Review · fix rounds, average per delivered task', value: r => r.review_rounds_avg, render: r => (r.delivered ? `${r.review_rounds_avg ?? 0} · ${r.fix_rounds_avg ?? 0}` : '–') },
          { key: 'split', label: 'Where the time goes', render: r => <div className="w-28 sm:w-36"><CategoryBar values={r.by_category} height={8} per={r.delivered} onTip={tipApi.show} onLeave={tipApi.hide} /></div> },
        ]} />
    </Card>
  );
}

function Outliers({ rows, people }) {
  return (
    <Card title={<span className="flex items-center gap-1.5"><Flame size={14} className="text-[#d97a12]" /> Took much longer than usual</span>}
      subtitle="Worked more than twice the usual time for their type" className="min-w-0">
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-white/5 -my-1">
          {rows.slice(0, 10).map(o => (
            <li key={o.id}>
              <a href={o.url || undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 group">
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold truncate group-hover:text-[#0808f8] dark:group-hover:text-[#8c93ff] ${INK}`}>{o.name}</span>
                  <span className={`block text-[11.5px] truncate ${SOFT}`}>
                    {o.type} · {(o.people || []).map(id => (people[id]?.name || '').split(' ')[0]).filter(Boolean).join(', ') || 'nobody'} · {o.estimated ? '≈ ' : ''}{fmtHM(o.worked_ms)} vs usual {fmtHM(o.median_ms)}
                  </span>
                </span>
                <span className="flex-none text-xs font-bold px-2 py-1 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 tabular-nums">{o.ratio}×</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`flex flex-col items-center text-center gap-1.5 py-8 text-sm ${MUTED}`}>
          <CircleCheck size={20} className="text-emerald-500" /> Nothing unusual — every delivered task stayed within twice its type’s usual time.
        </div>
      )}
    </Card>
  );
}

const TASK_SORTS = [['recent', 'Newest'], ['lead', 'Longest lead time'], ['worked', 'Most worked'], ['wait', 'Longest wait'], ['rounds', 'Most rounds']];
const TASK_SORT_FN = {
  recent: (t) => t.delivered_at ?? t.requested_at,
  lead: (t) => t.lead_ms,
  worked: (t) => t.worked_ms,
  wait: (t) => t.waiting_ms ?? -1,
  rounds: (t) => (t.review_rounds || 0) + (t.fix_rounds || 0),
};

function Tasks({ data, tipApi }) {
  const [show, setShow] = useState('delivered');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');
  const [limit, setLimit] = useState(40);
  const now = Date.parse(data.generated_at) || Date.now();
  const people = data.people || {};
  const counts = useMemo(() => ({
    delivered: data.tasks.filter(t => t.delivered_in_range).length,
    open: data.tasks.filter(t => t.open).length,
    all: data.tasks.length,
  }), [data.tasks]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fn = TASK_SORT_FN[sort];
    return data.tasks
      .filter(t => (show === 'delivered' ? t.delivered_in_range : show === 'open' ? t.open : true))
      .filter(t => !needle || t.name.toLowerCase().includes(needle))
      .sort((a, b) => (fn(b) ?? -1) - (fn(a) ?? -1));
  }, [data.tasks, show, q, sort]);
  useEffect(() => setLimit(40), [show, q, sort, data]);
  const used = CATEGORY_ORDER.filter(c => data.tasks.some(t => t.by_category?.[c] > 0));

  return (
    <Card title="Tasks" subtitle="Each bar is one task’s life, from the request to delivery (or now) — hover a colour for the status and how long it lasted · click a task to open it on Monday"
      right={<Legend only={used} />}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Seg value={show} onChange={setShow} options={[['delivered', `Delivered · ${counts.delivered}`], ['open', `Open · ${counts.open}`], ['all', `All · ${counts.all}`]]} />
        <label className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:border-[#0808f8]/50" />
        </label>
        <label className={`ml-auto flex items-center gap-1.5 text-xs ${SOFT}`}>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent text-gray-700 dark:text-gray-200">
            {TASK_SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className={`hidden md:grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_80px_96px_64px] gap-4 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide border-b border-gray-100 dark:border-white/5 ${MUTED}`}>
        <span>Task</span><span>Status timeline</span><span className="text-right">Lead time</span><span className="text-right" title="Time in Working while clocked in">Worked</span><span className="text-right" title="Review · fix rounds">Rounds</span>
      </div>
      {rows.length === 0 && <div className={`text-sm text-center py-10 ${MUTED}`}>{q ? 'No task matches that search' : show === 'open' ? 'No open tasks' : 'No tasks delivered in this period'}</div>}
      <ul className="flex flex-col">
        {rows.slice(0, limit).map(t => <TaskRow key={`${t.board}:${t.id}`} t={t} now={now} people={people} tipApi={tipApi} />)}
      </ul>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit(l => l + 60)} className="mt-3 w-full text-xs font-semibold py-2 rounded-xl border border-dashed border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-[#0808f8] dark:hover:text-[#8c93ff]">
          Show more ({rows.length - limit} left)
        </button>
      )}
      {data.tasks_total > data.tasks.length && <p className={`text-xs mt-2 ${MUTED}`}>Showing the newest {data.tasks.length} of {data.tasks_total} tasks — the CSV has them all.</p>}
    </Card>
  );
}

function TaskRow({ t, now, people, tipApi }) {
  const end = t.delivered_at ?? (t.strip?.length ? t.strip[t.strip.length - 1][2] : now);
  const Icon = BOARD_ICON[t.board] || Film;
  const names = (t.people || []).map(id => people[id]).filter(Boolean);
  const open = () => { if (t.url) window.open(t.url, '_blank', 'noopener,noreferrer'); };
  const late = t.on_time === false;
  const leadTip = (e) => tipApi.show(e, (
    <div className="tabular-nums">
      <div>Requested {fmtDateTime(t.requested_at)}</div>
      {t.first_started_at ? <div>Started after {fmtDur(t.waiting_ms)} waiting</div> : <div>Never moved to Working</div>}
      <div>{t.open ? 'Still open' : `Delivered ${fmtDateTime(t.delivered_at)}`} · {workdaysBetween(t.requested_at, end)} work days</div>
      {t.deadline && <div>Deadline {fmtDate(Date.parse(`${t.deadline}T12:00:00Z`))}{t.on_time === true ? ' · on time' : t.on_time === false ? ' · late' : ''}</div>}
    </div>
  ));
  const workTip = (e) => tipApi.show(e, (
    <div>
      <div className="font-semibold">{t.estimated ? 'Estimated' : 'Clocked'}: {fmtHM(t.worked_ms)} in Working</div>
      {t.estimated && <div className="opacity-80 mt-0.5">Someone on it isn’t on BambooHR — working hours (Sun–Thu 09:00–19:00) are used for them.</div>}
      {t.fixes_worked_ms > 0 && <div className="opacity-80 mt-0.5">+ {fmtHM(t.fixes_worked_ms)} clocked during Fixes Round</div>}
    </div>
  ));
  return (
    <li>
      <div role="link" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
        className="grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_80px_96px_64px] gap-x-4 gap-y-2 items-center px-2 py-3 border-b border-gray-50 dark:border-white/5 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 group">
        <div className="min-w-0">
          <div className={`text-[13px] font-semibold truncate flex items-center gap-1.5 group-hover:text-[#0808f8] dark:group-hover:text-[#8c93ff] ${INK}`}>
            <span className="truncate" title={t.name}>{t.name}</span>
            <ExternalLink size={11} className="flex-none opacity-0 group-hover:opacity-60" />
          </div>
          <div className={`flex items-center gap-1.5 text-[11.5px] mt-0.5 min-w-0 ${SOFT}`}>
            <Icon size={11} className="flex-none" />
            {t.product?.label && <span className="inline-flex items-center gap-1 flex-none"><span className="w-1.5 h-1.5 rounded-full" style={{ background: t.product.color || '#c4c4c4' }} />{t.product.label}</span>}
            <span className="truncate">· {t.type}</span>
            {t.open && <span className="flex-none text-[10px] font-semibold px-1.5 rounded bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">{t.status?.label || 'Open'}</span>}
            {t.partial && <span className="flex-none" title="Part of this task’s early history isn’t on Monday any more">· partial</span>}
            <span className="ml-auto flex -space-x-1.5 flex-none">{names.slice(0, 3).map(p => <Avatar key={p.id} person={p} size={18} ring="var(--tt-gap)" />)}</span>
          </div>
        </div>
        <StatusStrip strip={t.strip} start={t.requested_at} end={end} height={10} people={people} onTip={tipApi.show} onLeave={tipApi.hide} />
        <div className="flex md:contents items-center gap-4 text-[12.5px] tabular-nums">
          <span className={`md:text-right ${late ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}`} onMouseMove={leadTip} onMouseLeave={tipApi.hide}>
            <span className={`md:hidden ${MUTED} font-normal`}>Lead </span>{fmtDur(t.lead_ms)}
          </span>
          <span className={`md:text-right ${INK} font-semibold`} onMouseMove={workTip} onMouseLeave={tipApi.hide}>
            <span className={`md:hidden ${MUTED} font-normal`}>Worked </span>{t.estimated ? '≈ ' : ''}{t.worked_ms ? fmtHM(t.worked_ms) : '–'}
          </span>
          <span className={`md:text-right ${t.fix_rounds >= 3 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`} title="Review · fix rounds">
            <span className={`md:hidden ${MUTED} font-normal`}>Rounds </span>{t.review_rounds} · {t.fix_rounds}
          </span>
        </div>
      </div>
    </li>
  );
}
