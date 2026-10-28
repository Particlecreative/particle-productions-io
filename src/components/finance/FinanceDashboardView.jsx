import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Lock, TrendingUp, Search } from 'lucide-react';
import { usd, signedUsd, nativeMoney, dayLabel, dayYearLabel, monthLabel, companyOf, EVENT_LABEL, REASON_LABEL } from '../../lib/financeService';

const NAVY = '#030b2e';
const INVOICED = '#030b2e';
const NOT_INVOICED = '#8c93ff';

function Tile({ label, value, sub, tone }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 px-4 py-3.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[26px] leading-tight font-black tracking-tight mt-0.5" style={{ color: tone || NAVY }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function CompanyChip({ id, small }) {
  const c = companyOf(id);
  return <span className={`inline-flex items-center rounded-md font-black tracking-wider text-white ${small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`} style={{ background: c.color }}>{c.short.toUpperCase()}</span>;
}

/** Expected cost per month: invoiced (solid) + not invoiced yet (light). */
function MonthBars({ months, thisMonth }) {
  const max = Math.max(1, ...months.map(m => m.usd));
  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-gray-500 mb-3">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: INVOICED }} /> Invoiced</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: NOT_INVOICED }} /> Not invoiced yet</span>
      </div>
      <div className="space-y-2">
        {months.map(m => (
          <div key={m.month} className="flex items-center gap-3">
            <div className={`w-20 text-xs shrink-0 ${m.month === thisMonth ? 'font-bold text-gray-900' : 'text-gray-500'}`}>{monthLabel(m.month)}</div>
            <div className="flex-1 h-5 flex rounded-md overflow-hidden bg-gray-50" title={`Invoiced ${usd(m.invoiced_usd)} · not invoiced ${usd(m.not_invoiced_usd)}`}>
              <div style={{ width: `${(m.invoiced_usd / max) * 100}%`, background: INVOICED }} />
              <div style={{ width: `${(m.not_invoiced_usd / max) * 100}%`, background: NOT_INVOICED, borderLeft: m.invoiced_usd > 0 ? '2px solid #fff' : 'none' }} />
            </div>
            <div className={`w-20 text-right text-xs tabular-nums ${m.month === thisMonth ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{usd(m.usd)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function changeText(e) {
  const nat = (v) => { if (!v) return '—'; const [a, c] = String(v).split(' '); return c ? nativeMoney(a, c) : v; };
  if (['budget_increase', 'budget_approved'].includes(e.kind)) return e.old_value ? `${usd(e.old_value)} → ${usd(e.new_value)}` : usd(e.new_value);
  if (e.kind === 'historical_change') return `${usd(e.old_value)} → ${usd(e.new_value)} · ${monthLabel(e.month)}`;
  if (['line_added', 'line_removed', 'amount_changed', 'currency_changed'].includes(e.kind)) return `${nat(e.old_value)} → ${nat(e.new_value)}`;
  if (e.kind === 'postponed') return `${e.old_value} → ${e.new_value}`;
  return '';
}

/**
 * The finance dashboard — same view for finance (the shared link) and inside CP.
 * onOpen(production) opens a production; onConfirm(id) is finance's "Confirmed" on a closed production.
 */
export default function FinanceDashboardView({ data, onOpen, onConfirm, brand, onBrand, productionHref }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState('open'); // open | closed | all
  const prods = useMemo(() => (data?.productions || []).filter(p =>
    (show === 'all' || (show === 'open' ? p.open : !p.open)) &&
    (!q.trim() || `${p.code} ${p.id} ${p.name}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, q, show]);
  if (!data) return null;
  const k = data.kpis;
  const changes = (data.changes || []).filter(e => !['finance_confirmed', 'sync_conflict'].includes(e.kind)).slice(0, 40);

  return (
    <div className="space-y-5">
      {/* Company filter + rate */}
      <div className="flex items-center gap-2 flex-wrap">
        {onBrand && [{ id: '', short: 'All companies' }, ...(data.companies || [])].map(c => (
          <button key={c.id || 'all'} type="button" onClick={() => onBrand(c.id)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border ${brand === c.id || (!brand && !c.id) ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            style={brand === c.id || (!brand && !c.id) ? { background: c.id ? companyOf(c.id).color : NAVY } : undefined}>
            {c.short}
          </button>
        ))}
        <div className="ml-auto text-[11px] text-gray-400">USD at ₪{data.rate?.rate}/$ · Bank of Israel {dayYearLabel(data.rate?.date)} · updated {new Date(data.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label={`Expected cost · ${monthLabel(data.this_month)}`} value={usd(k.this_month_usd)} sub="Accrue this month" />
        <Tile label={`Expected · ${monthLabel(data.next_month)}`} value={usd(k.next_month_usd)} />
        <Tile label="Next 30 days" value={usd(k.forecast.d30)} sub={`Payments due ${usd(k.payments.d30)}`} />
        <Tile label="Next 60 days" value={usd(k.forecast.d60)} sub={`Payments due ${usd(k.payments.d60)}`} />
        <Tile label="Next 90 days" value={usd(k.forecast.d90)} sub={`Payments due ${usd(k.payments.d90)}`} />
        <Tile label="Invoices missing" value={k.missing_invoices} tone={k.missing_invoices ? '#b45309' : '#16a34a'} sub={`By the ${data.rules?.invoice_cutoff_day}th → paid on the ${data.rules?.payment_day}th`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        {/* Impact + months */}
        <div className="xl:col-span-3 rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <h3 className="font-bold text-gray-900">This month’s changes</h3>
              <p className="text-xs text-gray-500">What changed since the 1st, and which months it lands in</p>
            </div>
            <div className="flex gap-4 text-sm">
              <div><div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">This month</div><div className="font-black tabular-nums">{signedUsd(data.impact.this_month_usd)}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Past months</div><div className={`font-black tabular-nums ${data.impact.past_months_usd ? 'text-amber-700' : ''}`}>{signedUsd(data.impact.past_months_usd)}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Later months</div><div className="font-black tabular-nums">{signedUsd(data.impact.future_months_usd)}</div></div>
            </div>
          </div>
          <MonthBars months={data.months} thisMonth={data.this_month} />
          {data.surprise && (
            <div className={`mt-4 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${Math.abs(data.surprise.usd) >= 1 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
              <TrendingUp size={15} />
              {Math.abs(data.surprise.usd) >= 1
                ? <>Since the {monthLabel(data.surprise.since_report)} accrual report, months already booked changed by <b>{signedUsd(data.surprise.usd)}</b> ({data.surprise.count} change{data.surprise.count === 1 ? '' : 's'}).</>
                : <>No surprises: months already booked haven’t changed since the {monthLabel(data.surprise.since_report)} report.</>}
            </div>
          )}
        </div>

        {/* Changes list */}
        <div className="xl:col-span-2 rounded-2xl bg-white border border-gray-100 shadow-sm p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100"><h3 className="font-bold text-gray-900">Latest changes</h3></div>
          {changes.length === 0 ? <div className="px-5 py-10 text-sm text-gray-400 text-center">No changes this month.</div> : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {changes.map(e => (
                <button key={e.id} type="button" onClick={() => onOpen?.({ id: e.production_id })} className="w-full text-left px-5 py-2.5 hover:bg-gray-50">
                  <div className="flex items-center gap-2 text-sm">
                    <CompanyChip id={e.brand_id} small />
                    <span className="font-bold text-gray-800">{e.code}</span>
                    <span className="text-gray-700">{EVENT_LABEL[e.kind] || e.kind}</span>
                    <span className="ml-auto text-[11px] text-gray-400 shrink-0">{dayLabel(e.at)}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5 truncate">
                    {e.label}{changeText(e) ? ` · ${changeText(e)}` : ''}{e.delta_usd != null && Math.abs(Number(e.delta_usd)) >= 1 && !['budget_increase', 'historical_change'].includes(e.kind) ? ` (${signedUsd(e.delta_usd)})` : ''}
                  </div>
                  {(e.reason || e.approved_by || e.note) && (
                    <div className="text-[11px] text-gray-500 truncate">{e.reason ? REASON_LABEL[e.reason] : ''}{e.approved_by ? ` · approved by ${e.approved_by}` : ''}{e.note ? ` · “${e.note}”` : ''}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Missing invoices */}
      {data.missing?.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><AlertTriangle size={16} className="text-amber-600" /> Invoices still missing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.missing.map(g => (
              <div key={g.production_id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center gap-2 mb-1.5"><CompanyChip id={g.brand_id} small /><span className="font-bold text-sm">{g.code}</span><span className="text-sm text-gray-600 truncate">{g.name}</span></div>
                {g.items.map(m => (
                  <div key={m.id} className="flex justify-between gap-2 text-xs py-0.5">
                    <span className="truncate text-gray-700">{m.supplier || m.label} <span className="text-gray-400">· {monthLabel(m.month)}</span></span>
                    <span className="font-semibold tabular-nums shrink-0">{nativeMoney(m.amount, m.currency)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Productions */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <h3 className="font-bold text-gray-900">Productions</h3>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-semibold">
            {[['open', `Open (${k.open_productions})`], ['closed', `Closed${k.to_confirm ? ` · ${k.to_confirm} to confirm` : ''}`], ['all', 'All']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setShow(v)} className={`px-2.5 py-1 rounded-md ${show === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          <div className="ml-auto relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Code or name" className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 980 }}>
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="text-left font-bold px-5 py-2">Production</th>
                <th className="text-left font-bold px-3 py-2">Status</th>
                <th className="text-right font-bold px-3 py-2">Planned</th>
                <th className="text-right font-bold px-3 py-2">Expected</th>
                <th className="text-right font-bold px-3 py-2">Paid</th>
                <th className="text-right font-bold px-3 py-2">{monthLabel(data.this_month)}</th>
                <th className="text-right font-bold px-3 py-2">{monthLabel(data.next_month)}</th>
                <th className="text-left font-bold px-3 py-2">Dates</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {prods.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-2.5">
                    <button type="button" onClick={() => onOpen?.(p)} className="text-left">
                      <div className="flex items-center gap-2"><CompanyChip id={p.brand_id} small /><span className="font-bold text-gray-900">{p.code}</span>{p.parent_id && <span className="text-[10px] text-violet-600 font-semibold">re-edit</span>}</div>
                      <div className="text-xs text-gray-600 max-w-[260px] truncate">{p.name}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.open ? (
                      <span className="text-xs font-semibold text-gray-700">{p.stage || 'Open'}</span>
                    ) : p.confirmed_at ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={12} /> Closed · confirmed</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700"><Lock size={11} /> Closed</span>
                    )}
                    {p.approved && <div className="text-[10px] text-emerald-700 font-semibold">Approved{p.approved_by ? ` · ${p.approved_by}` : ''}</div>}
                    {p.missing_invoices > 0 && <div className="text-[10px] text-amber-700 font-semibold">{p.missing_invoices} invoice{p.missing_invoices === 1 ? '' : 's'} missing</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {usd(p.planned_usd)}
                    {p.buffer_left_usd != null && <div className={`text-[10px] ${p.buffer_left_usd < 0 ? 'text-red-600' : 'text-gray-400'}`}>{p.buffer_left_usd < 0 ? `over ${usd(-p.buffer_left_usd)}` : `${usd(p.buffer_left_usd)} unexpected left`}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{usd(p.expected_usd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{usd(p.paid_usd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.this_month_usd ? usd(p.this_month_usd) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.next_month_usd ? usd(p.next_month_usd) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{p.start || p.end ? `${dayLabel(p.start)} → ${dayLabel(p.end)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {p.sheet_url && <a href={p.sheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline mr-2">Sheet <ExternalLink size={10} /></a>}
                    {productionHref && <a href={productionHref(p)} className="text-xs text-blue-600 hover:underline mr-2">CP</a>}
                    {onConfirm && !p.open && !p.confirmed_at && (
                      <button type="button" onClick={() => onConfirm(p)} className="text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ background: NAVY }}>Confirm closed</button>
                    )}
                  </td>
                </tr>
              ))}
              {prods.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-400">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export { CompanyChip, changeText };
