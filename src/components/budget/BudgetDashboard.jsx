import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine,
} from 'recharts';
import { Pencil, Check, X, ArrowUpRight, Info, Search } from 'lucide-react';
import { buildSpend, MONTHS, OTHER, LENSES, lensOf, LENS_KINDS } from './spend';
import { CountUp, stageColor } from '../tracker/parts';
import '../tracker/tracker.css';

const INK = '#e8ecff';
const MUTED = '#8b93c7';
const GRID = 'rgba(232,236,255,.07)';
const SURFACE = '#0b1546';
// Planned money not spent yet: a light hatch, so it reads as "not real yet" next to paid / owed
const PLANNED_FILL = 'repeating-linear-gradient(90deg, rgba(232,236,255,.28) 0 2px, rgba(232,236,255,.08) 2px 6px)';

/**
 * Budget Overview's main view, in the Creative Weekly look: what the year has cost so far next to the budget,
 * month by month and production by production, planned vs actual. Click anything to see its line items.
 */
export default function BudgetDashboard({ productions, lineItems, getAmt, getPlanned, toDisplay, currency, year, budget, isEditor, onEditBudget, onDrill, onDetails, overdueCount, brandName }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const [lens, setLens] = useState('planned'); // planned | spent | unpaid | paid — see LENSES
  const [overOnly, setOverOnly] = useState(false);
  const [listQ, setListQ] = useState('');
  const [listSort, setListSort] = useState('amount'); // amount | budget | left | id
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const sym = currency === 'ILS' ? '₪' : '$';
  const short = (n) => {
    const v = Math.round(Number(n) || 0);
    const a = Math.abs(v);
    const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : `${a}`;
    return `${v < 0 ? '−' : ''}${sym}${s}`;
  };
  const full = (n) => `${Number(n) < 0 ? '−' : ''}${sym}${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US')}`;

  const d = useMemo(() => buildSpend({
    productions, lineItems, getAmt, getPlanned, usd: (v) => toDisplay(v, 'USD'), year, budget, today,
  }), [productions, lineItems, getAmt, getPlanned, toDisplay, year, budget, today]);
  const t = d.totals;
  const key = `${lens}_`;
  const val = (cell) => lensOf(lens, cell);
  const [, lensLabel, lensHint] = LENSES.find(l => l[0] === lens);
  const withEst = LENS_KINDS[lens].includes('est');
  const notPlanned = budget - t.all;

  const scale = Math.max(budget, t.all, t.projected, 1);
  const pct = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  const used = budget > 0 ? t.spent / budget : 0;
  const paceGap = t.pace - t.spent;
  const isCurrent = Number(today.slice(0, 4)) === year;

  // A cell's line items in this view (estimated budgets have no lines — they're named in the subtitle)
  const itemsOf = (cell) => LENS_KINDS[lens].filter(k => k !== 'est').flatMap(k => cell.items?.[k] || []);
  const estNote = (v) => (withEst && v > 0.5 ? ` · plus ${full(v)} of budget not broken into lines yet` : '');
  const drillMonth = (i) => {
    const items = d.prods.flatMap(r => itemsOf(r.months[i]));
    const est = d.prods.reduce((a, r) => a + r.months[i].est, 0);
    onDrill({ type: 'items', title: `${MONTHS[i]} ${year} — ${lensLabel.toLowerCase()}`, subtitle: `${items.length} items${estNote(est)}`, items });
  };
  const drillCell = (r, i) => {
    const c = r.months[i];
    const items = itemsOf(c);
    if (items.length || (withEst && c.est > 0.5)) onDrill({ type: 'items', title: `${r.name} · ${MONTHS[i]} ${year}`, subtitle: `${r.id} · ${items.length} items${estNote(c.est)}`, items });
  };

  // Every production of the year — ones with nothing budgeted or spent yet too
  const lq = listQ.trim().toLowerCase();
  const SORTS = { amount: (a, b) => lensOf(lens, b) - lensOf(lens, a) || b.planned - a.planned, budget: (a, b) => b.planned - a.planned || b.spent - a.spent, left: (a, b) => (a.planned - a.spent) - (b.planned - b.spent), id: (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) };
  const list = d.prods
    .filter(r => (!overOnly || r.over) && (!lq || `${r.id} ${r.name} ${r.stage}`.toLowerCase().includes(lq)))
    .sort(SORTS[listSort] || SORTS.amount);
  const listMax = Math.max(1, ...list.map(r => Math.max(r.all, r.planned)));
  const matrix = d.prods.filter(r => r.months.some(c => val(c) > 0));
  const cellMax = Math.max(1, ...matrix.flatMap(r => r.months.map(val)));
  // Running total in this view: spent / paid stop at today; plans run to December. Projected only for spent.
  const running = d.cumulative.map(c => ({
    ...c,
    actual: (lens === 'spent' || lens === 'paid') && c.i > t.curMonth && t.curMonth >= 0 ? null : Math.round(lensOf(lens, c)),
    projected: lens === 'spent' ? c.projected : null,
  }));
  const outBefore = lensOf(lens, d.outside.before);
  const outAfter = lensOf(lens, d.outside.after);

  return (
    <div className="trk">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        {/* Hero: the year so far next to the budget */}
        <div className="trk-eyebrow">Budget · {brandName} · {year}{isCurrent ? ` · to ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}` : ''}</div>
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
          <h2 className="trk-title text-[56px] sm:text-[96px] md:text-[120px]"><CountUp value={t.spent} format={full} /></h2>
          <div className="pb-2 sm:pb-4">
            <div className="text-[15px] trk-muted">spent of</div>
            {editing ? (
              <form className="flex items-center gap-1.5 mt-1" onSubmit={(e) => { e.preventDefault(); const n = parseFloat(draft); if (n > 0) onEditBudget(n); setEditing(false); }}>
                <input autoFocus type="number" min="0" className="trk-input !w-36" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={String(Math.round(budget))} />
                <button type="submit" className="trk-btn !p-2" aria-label="Save budget"><Check size={14} /></button>
                <button type="button" className="trk-btn !p-2" aria-label="Cancel" onClick={() => setEditing(false)}><X size={14} /></button>
              </form>
            ) : (
              <button type="button" disabled={!isEditor} onClick={() => { setDraft(''); setEditing(true); }} className="trk-title text-[34px] sm:text-[44px] flex items-center gap-2 group" style={{ color: '#aab0ff' }}>
                {full(budget)} budget {isEditor && <Pencil size={16} className="opacity-0 group-hover:opacity-100 trk-muted" />}
              </button>
            )}
          </div>
          <div className="ml-auto pb-3 text-right">
            <div className="trk-title text-[64px]" style={{ color: used > 1 ? '#ff5c7a' : '#fff' }}><CountUp value={Math.round(used * 100)} format={(n) => `${Math.round(n)}%`} /></div>
            <div className="trk-label">of the budget</div>
          </div>
        </div>

        {/* Budget bar: paid + owed against the budget, with today's pace and the projected year end */}
        <div className="mt-6">
          <div className="relative h-7 rounded-full overflow-visible" style={{ background: 'rgba(255,255,255,.07)' }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(budget), boxShadow: 'inset 0 0 0 1px rgba(232,236,255,.22)' }} />
            <div className="absolute inset-y-0 left-0 rounded-full flex overflow-hidden" style={{ width: pct(t.all) }}>
              <div className="h-full" style={{ width: `${t.all ? (t.paid / t.all) * 100 : 0}%`, background: '#4a55ff' }} title={`Paid ${full(t.paid)}`} />
              <div className="h-full" style={{ width: `${t.all ? (t.owed / t.all) * 100 : 0}%`, background: 'repeating-linear-gradient(45deg, rgba(74,85,255,.55) 0 6px, rgba(74,85,255,.3) 6px 12px)' }} title={`Owed ${full(t.owed)}`} />
              <div className="h-full" style={{ flex: 1, background: PLANNED_FILL }} title={`Planned, not spent yet ${full(t.plan + t.est)}`} />
            </div>
            {isCurrent && budget > 0 && (
              <div className="absolute -top-2 -bottom-2" style={{ left: pct(t.pace) }} title={`Budget pace by today: ${full(t.pace)}`}>
                <div className="w-0.5 h-full bg-white rounded" />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <Legend swatch={{ background: '#4a55ff' }} label="Paid" value={full(t.paid)} />
            <Legend swatch={{ background: 'repeating-linear-gradient(45deg, rgba(74,85,255,.75) 0 3px, rgba(74,85,255,.35) 3px 6px)' }} label="Owed (invoice in / cost entered)" value={full(t.owed)} />
            <Legend swatch={{ background: PLANNED_FILL }} label="Planned, not spent yet" value={full(t.plan + t.est)} />
            <Legend swatch={{ boxShadow: 'inset 0 0 0 1px rgba(232,236,255,.4)' }} label={notPlanned >= 0 ? 'Budget not planned yet' : 'Planned over the budget'} value={full(Math.abs(notPlanned))} tone={notPlanned < 0 ? '#ff5c7a' : undefined} />
            {isCurrent && budget > 0 && <Legend swatch={{ background: '#fff', width: 2 }} label="Spent vs pace by today" value={`${full(t.pace)} · ${paceGap >= 0 ? `${short(paceGap)} under` : `${short(-paceGap)} ahead`}`} />}
          </div>
        </div>

        {/* Tiles */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label={isCurrent ? `${MONTHS[t.curMonth]} so far` : 'Last month'} value={short(t.thisMonth)} sub={t.avgMonth ? `vs ${short(t.avgMonth)} a month on average` : 'No spend dated this year yet'} onClick={t.curMonth >= 0 ? () => drillMonth(t.curMonth) : undefined} />
          <Tile label="Monthly average" value={short(t.avgMonth)} sub={budget ? `Budget allows ${short(budget / 12)} a month` : ''} />
          <Tile label="Productions with spend" value={`${t.withSpend}`} sub={`of ${productions.length} in ${year}${t.withAnything > t.withSpend ? ` · ${t.withAnything - t.withSpend} more only planned` : ''}`} />
          <Tile label="Over their budget" value={`${t.overCount}`} tone={t.overCount ? '#ff5c7a' : undefined} sub={overOnly ? 'Showing only these — click to show all' : t.overCount ? 'Click to show only these' : 'Every production is within budget'} onClick={t.overCount ? () => setOverOnly(v => !v) : undefined} active={overOnly} />
        </div>

        {/* Mode */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <div className="trk-seg overflow-x-auto max-w-full">
            {LENSES.map(([k, l]) => <button key={k} type="button" className={lens === k ? 'on' : ''} onClick={() => setLens(k)}>{l}</button>)}
          </div>
          <span className="text-[12px] trk-muted">{lensLabel}: {lensHint}.</span>
          <span className="text-[12px] trk-dim">Click a month, a production or a cell to see its line items.</span>
        </div>

        {/* Charts */}
        <div className="mt-4 grid xl:grid-cols-[1.35fr_1fr] gap-4">
          <div className="trk-glass p-5">
            <div className="flex items-baseline gap-3">
              <div className="trk-label">{lensLabel} · by month</div>
              <div className="ml-auto text-[12px] trk-muted">by production</div>
            </div>
            <div className="h-[300px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.months} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%"
                  onClick={(e) => e?.activeTooltipIndex != null && drillMonth(Number(e.activeTooltipIndex))}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={(p) => <MonthTick {...p} current={isCurrent ? t.curMonth : -1} />} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={short} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,.05)' }} content={<MonthTip series={d.series} k={key} fmt={full} />} />
                  {d.series.map((s, i) => (
                    <Bar key={s.key} dataKey={`${key}${s.key}`} stackId="m" fill={s.color} stroke={SURFACE} strokeWidth={2}
                      radius={i === d.series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {d.series.map(s => (
                <span key={s.key} className="flex items-center gap-1.5 text-[12px]">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.name}
                </span>
              ))}
            </div>
          </div>

          <div className="trk-glass p-5">
            <div className="flex items-baseline gap-3">
              <div className="trk-label">The year so far vs the budget</div>
              <div className="ml-auto text-[12px] trk-muted">running total</div>
            </div>
            <div className="h-[300px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={running} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={short} domain={[0, (max) => Math.max(max, budget) * 1.05]} />
                  <Tooltip content={<RunTip fmt={full} />} cursor={{ stroke: 'rgba(255,255,255,.25)' }} />
                  {budget > 0 && <ReferenceLine y={budget} stroke="rgba(232,236,255,.45)" strokeDasharray="2 4" label={{ value: `Budget ${short(budget)}`, fill: MUTED, fontSize: 11, position: 'insideTopLeft' }} />}
                  <Line dataKey="pace" name="Budget pace" stroke="rgba(232,236,255,.35)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  <Line dataKey="projected" name="Projected" stroke="#ffb547" strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />
                  <Line dataKey="actual" name={lensLabel} stroke="#4a55ff" strokeWidth={3} dot={{ r: 4, fill: '#4a55ff', stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]">
              <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded" style={{ background: '#4a55ff' }} />{lensLabel}</span>
              <span className="flex items-center gap-1.5"><span className="w-4" style={{ borderTop: '2px dashed rgba(232,236,255,.5)' }} />Even pace to the budget</span>
              <span className="flex items-center gap-1.5"><span className="w-4" style={{ borderTop: '2px dashed #ffb547' }} />Projected</span>
            </div>
          </div>
        </div>

        {/* Planned vs actual by production */}
        <div className="mt-4 trk-glass p-5">
          <div className="flex flex-wrap items-baseline gap-3 mb-4">
            <div className="trk-label">Planned vs actual · all {d.prods.length} productions</div>
            {overOnly && <button type="button" className="trk-chip red" onClick={() => setOverOnly(false)}><X size={11} /> Over budget only</button>}
            <div className="relative w-full sm:w-[220px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 trk-dim" />
              <input className="trk-input !pl-8 !py-1.5 !rounded-full !text-[12px]" placeholder="Find a production…" value={listQ} onChange={(e) => setListQ(e.target.value)} />
            </div>
            <div className="trk-seg">
              {[['amount', 'Amount'], ['budget', 'Budget'], ['left', 'Over / left'], ['id', 'PRD']].map(([k, l]) => <button key={k} type="button" className={listSort === k ? 'on' : ''} onClick={() => setListSort(k)}>{l}</button>)}
            </div>
            <div className="ml-auto flex items-center gap-4 text-[12px] trk-muted">
              <span className="flex items-center gap-1.5"><span className="w-4 h-2.5 rounded-sm" style={{ boxShadow: 'inset 0 0 0 1px rgba(232,236,255,.45)' }} />Budget</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-2.5 rounded-sm" style={{ background: '#4a55ff' }} />Paid</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-2.5 rounded-sm" style={{ background: 'rgba(74,85,255,.45)' }} />Owed</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-2.5 rounded-sm" style={{ background: PLANNED_FILL }} />Planned</span>
            </div>
          </div>
          <div className="flex flex-col">
            {list.map(r => (
              <button key={r.id} type="button" onClick={() => onDrill({ type: 'production', id: r.id })}
                className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[260px_minmax(0,1fr)_200px] items-center gap-x-5 gap-y-2 py-3 text-left rounded-xl hover:bg-white/[.04] px-2 -mx-2"
                style={{ borderTop: '1px solid var(--trk-line)' }}>
                <span className="min-w-0 flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: r.color }} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold truncate">{r.name}</span>
                    <span className="flex items-center gap-1.5 text-[11px] trk-muted"><span className="w-1.5 h-1.5 rounded-full" style={{ background: stageColor(r.stage) }} />{r.id} · {r.stage || '—'}</span>
                  </span>
                </span>
                <span className="relative h-3.5 rounded-full" style={{ background: 'rgba(255,255,255,.04)' }}>
                  {r.planned > 0 && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.planned / listMax) * 100}%`, boxShadow: 'inset 0 0 0 1px rgba(232,236,255,.38)' }} />}
                  <span className="absolute inset-y-0 left-0 flex rounded-full overflow-hidden" style={{ width: `${(r.all / listMax) * 100}%` }}>
                    <span style={{ width: `${r.all ? (r.paid / r.all) * 100 : 0}%`, background: r.over ? '#ff5c7a' : '#4a55ff' }} />
                    <span style={{ width: `${r.all ? (r.owed / r.all) * 100 : 0}%`, background: r.over ? 'rgba(255,92,122,.5)' : 'rgba(74,85,255,.45)' }} />
                    <span style={{ flex: 1, background: PLANNED_FILL }} />
                  </span>
                  {r.over && <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-white" style={{ left: `${(r.planned / listMax) * 100}%` }} title={`Budget ${full(r.planned)}`} />}
                </span>
                {!r.all && !r.planned ? <span className="text-[12px] trk-dim md:text-right">No budget or spend yet</span> : <span className="flex items-baseline gap-2 md:justify-end text-[13px] tabular-nums">
                  <b>{short(lensOf(lens, r))}</b>
                  <span className="trk-dim">/ {r.planned ? short(r.planned) : 'no budget'}</span>
                  {r.over
                    ? <span className="trk-chip red">+{short(r.spent - r.planned)}</span>
                    : r.pct != null && <span className="trk-chip gray">{Math.round(r.pct * 100)}%</span>}
                </span>}
              </button>
            ))}
            {!list.length && <div className="py-8 text-center text-sm trk-muted">{lq || overOnly ? 'No production matches.' : `No productions in ${year}.`}</div>}
          </div>
        </div>

        {/* Production × month */}
        <div className="mt-4 trk-glass p-5">
          <div className="flex flex-wrap items-baseline gap-3 mb-4">
            <div className="trk-label">Month by month · per production</div>
            <div className="ml-auto text-[12px] trk-muted">{lensLabel} in each month · darker = more</div>
          </div>
          <div className="overflow-x-auto trk-scroll">
            <table className="w-full min-w-[980px] text-[12px] tabular-nums border-separate" style={{ borderSpacing: '3px' }}>
              <thead>
                <tr className="trk-label text-left">
                  <th className="px-2 py-1.5 font-bold">Production</th>
                  {MONTHS.map((m, i) => <th key={m} className="px-1 py-1.5 font-bold text-center" style={i === t.curMonth && isCurrent ? { color: '#fff' } : undefined}>{m}</th>)}
                  <th className="px-2 py-1.5 font-bold text-right">Total</th>
                  <th className="px-2 py-1.5 font-bold text-right">Budget</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map(r => {
                  const total = r.months.reduce((a, c) => a + val(c), 0);
                  return (
                    <tr key={r.id}>
                      <td className="px-2 py-1 max-w-[220px]">
                        <span className="flex items-center gap-2 min-w-0"><span className="w-2 h-2 rounded-sm flex-none" style={{ background: r.color }} /><span className="truncate font-semibold" title={r.name}>{r.name}</span></span>
                      </td>
                      {r.months.map((c, i) => {
                        const v = val(c);
                        const a = v > 0 ? 0.14 + 0.8 * Math.sqrt(v / cellMax) : 0;
                        return (
                          <td key={i} onClick={() => v > 0 && drillCell(r, i)} title={v > 0 ? `${r.name} · ${MONTHS[i]}: ${full(v)}` : undefined}
                            className={`h-9 rounded-md text-center ${v > 0 ? 'cursor-pointer hover:ring-1 hover:ring-white/50' : ''}`}
                            style={{ background: v > 0 ? `rgba(74,85,255,${a.toFixed(2)})` : 'rgba(255,255,255,.025)', color: a > 0.55 ? '#fff' : INK }}>
                            {v > 0 ? short(v) : ''}
                          </td>
                        );
                      })}
                      <td className="px-2 text-right font-bold">{short(total)}</td>
                      <td className="px-2 text-right" style={{ color: r.over ? '#ffb3c2' : MUTED }}>{r.planned ? short(r.planned) : '—'}</td>
                    </tr>
                  );
                })}
                {!matrix.length && <tr><td colSpan={15} className="py-8 text-center trk-muted">Nothing in this view for {year} yet.</td></tr>}
              </tbody>
              {matrix.length > 0 && (
                <tfoot>
                  <tr className="font-bold">
                    <td className="px-2 py-2 trk-label">Total</td>
                    {d.months.map((m, i) => (
                      <td key={i} onClick={() => val(m) > 0 && drillMonth(i)} className={`text-center py-2 ${val(m) > 0 ? 'cursor-pointer hover:underline' : 'trk-dim'}`}>{val(m) > 0 ? short(val(m)) : '—'}</td>
                    ))}
                    <td className="px-2 text-right">{short(d.months.reduce((a, m) => a + val(m), 0))}</td>
                    <td className="px-2 text-right trk-muted">{short(t.planned)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {(outBefore > 0.5 || outAfter > 0.5 || d.undated > 0) && (
            <div className="mt-3 flex items-start gap-2 text-[12px] trk-muted">
              <Info size={13} className="flex-none mt-0.5" />
              <span>
                {outBefore > 0.5 && <>{full(outBefore)} of {year}’s productions is dated in {year - 1}. </>}
                {outAfter > 0.5 && <>{full(outAfter)} is dated in {year + 1}. </>}
                {(outBefore > 0.5 || outAfter > 0.5) && 'It counts in the totals above, not in these months. '}
                {d.undated > 0 && <>{d.undated} cost{d.undated > 1 ? 's have' : ' has'} no paid or work date, so {d.undated > 1 ? 'they sit' : 'it sits'} in the production’s month.</>}
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 text-[11px] trk-dim flex flex-wrap gap-x-4 gap-y-1">
          <span>₪ amounts are excl. VAT (18%).</span>
          <span>A production’s budget is the planned budget on its board (incl. contingency).</span>
          <span>Projected = what’s spent + what live productions still have left in their budgets.</span>
          <button type="button" className="trk-link flex items-center gap-1" onClick={onDetails}>Cash flow, {overdueCount ? `${overdueCount} overdue payments` : 'payments'} &amp; categories <ArrowUpRight size={11} /></button>
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, label, value, tone }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-3.5 h-3.5 rounded-sm flex-none" style={swatch} />
      <span className="trk-muted">{label}</span>
      <b style={{ color: tone || '#fff' }}>{value}</b>
    </span>
  );
}

function Tile({ label, value, sub, tone, onClick, active }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={`trk-glass p-4 md:p-5 text-left ${onClick ? 'transition-colors hover:bg-white/[.07]' : ''}`}
      style={active ? { borderColor: 'rgba(255,92,122,.6)', background: 'rgba(255,92,122,.1)' } : undefined}>
      <div className="trk-label">{label}</div>
      <div className="trk-title text-[44px] md:text-[56px] mt-1" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="text-[12px] trk-muted mt-1">{sub}</div>}
    </Comp>
  );
}

function MonthTick({ x, y, payload, index, current }) {
  return (
    <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fontWeight={index === current ? 700 : 400} fill={index === current ? '#fff' : MUTED}>
      {payload.value}
    </text>
  );
}

function MonthTip({ active, payload, label, series, k, fmt }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const parts = series.map(s => ({ ...s, v: row[`${k}${s.key}`] || 0 })).filter(s => s.v > 0).sort((a, b) => b.v - a.v);
  const total = parts.reduce((a, s) => a + s.v, 0);
  return (
    <div className="trk rounded-2xl px-4 py-3 text-[12px] shadow-2xl min-w-[200px]" style={{ background: '#030b2e', border: '1px solid rgba(232,236,255,.15)' }}>
      <div className="flex items-baseline justify-between gap-4 mb-1.5"><b className="text-[13px]">{label}</b><b className="text-[13px]">{fmt(total)}</b></div>
      {parts.map(s => (
        <div key={s.key} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: s.color || OTHER }} />
          <span className="trk-muted truncate max-w-[180px]">{s.name}</span>
          <span className="ml-auto pl-3">{fmt(s.v)}</span>
        </div>
      ))}
      {!parts.length && <div className="trk-muted">Nothing this month</div>}
    </div>
  );
}

function RunTip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="trk rounded-2xl px-4 py-3 text-[12px] shadow-2xl" style={{ background: '#030b2e', border: '1px solid rgba(232,236,255,.15)' }}>
      <b className="text-[13px]">End of {label}</b>
      {row.actual != null && <div className="flex justify-between gap-6 mt-1"><span className="trk-muted">Running total</span><b>{fmt(row.actual)}</b></div>}
      {row.projected != null && row.actual == null && <div className="flex justify-between gap-6 mt-1"><span className="trk-muted">Projected</span><b style={{ color: '#ffb547' }}>{fmt(row.projected)}</b></div>}
      <div className="flex justify-between gap-6 mt-1"><span className="trk-muted">Even pace</span><span>{fmt(row.pace)}</span></div>
    </div>
  );
}

