import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Landmark, LayoutDashboard, FileSpreadsheet, Wrench, Mail, Settings2, ScrollText, Loader2, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, Download, Send, Eye, X, Copy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import FinanceDashboardView, { CompanyChip } from '../../components/finance/FinanceDashboardView';
import { financeApi, downloadAuthed, usd, signedUsd, nativeMoney, dayLabel, dayYearLabel, monthLabel, companyOf, financeCode, EVENT_LABEL, REASON_LABEL } from '../../lib/financeService';

const TABS = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['accruals', 'Accruals', FileSpreadsheet],
  ['cleanup', 'Cleanup', Wrench],
  ['emails', 'Emails', Mail],
  ['log', 'Finance log', ScrollText],
  ['settings', 'Settings', Settings2],
];
const NAVY = '#030b2e';
const card = 'rounded-2xl bg-white border border-gray-100 shadow-sm';
const btn = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40';
const primary = 'inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg text-white disabled:opacity-40';

/** Finance — CP × Finance in one place: what finance sees, accrual reports, cleanup, emails, settings, the log. */
export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'dashboard';
  const [config, setConfig] = useState(null);
  const reloadConfig = useCallback(() => financeApi.config().then(setConfig).catch(() => {}), []);
  useEffect(() => { reloadConfig(); }, [reloadConfig]);

  return (
    <div className="max-w-[1600px] mx-auto pb-16">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <h1 className="brand-title text-4xl" style={{ color: 'var(--brand-primary)' }}>Finance</h1>
          <p className="text-sm text-gray-500 mt-1">Approved budgets, alerts, accruals and the finance dashboard — Particle, Blurr and Biomella.</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-1 p-1 rounded-2xl bg-white border border-gray-200">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setParams(k === 'dashboard' ? {} : { tab: k })}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${tab === k ? 'text-white shadow' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
              style={tab === k ? { background: NAVY } : undefined}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {config?.config?.shadow && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-3 flex-wrap">
          <AlertTriangle size={16} className="shrink-0" />
          <span><b>Test mode is on</b> — every finance email goes to {config.config.shadow_to} only, with a note saying who it was meant for.</span>
          <button type="button" onClick={() => setParams({ tab: 'emails' })} className="ml-auto text-xs font-bold underline">Switch it off when ready</button>
        </div>
      )}

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'accruals' && <AccrualsTab month={params.get('month')} />}
      {tab === 'cleanup' && <CleanupTab />}
      {tab === 'emails' && <EmailsTab config={config} onConfig={reloadConfig} />}
      {tab === 'log' && <LogTab />}
      {tab === 'settings' && <SettingsTab config={config} onConfig={reloadConfig} />}
    </div>
  );
}

// ── Dashboard: exactly what finance sees on their link ──
function DashboardTab() {
  const [data, setData] = useState(null);
  const [brand, setBrand] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setData(null); financeApi.dashboard(brand).then(setData).catch(e => setErr(e.message)); }, [brand]);
  const link = `${window.location.origin}/finance-view`;
  return (
    <div className="space-y-4">
      <div className={`${card} px-4 py-3 flex items-center gap-3 flex-wrap text-sm`}>
        <span className="text-gray-600">Finance opens this at</span>
        <code className="px-2 py-1 rounded bg-gray-50 text-gray-800">{link}</code>
        <button type="button" className={btn} onClick={() => navigator.clipboard?.writeText(link)}><Copy size={12} /> Copy link</button>
        <span className="text-xs text-gray-400">Sign-in is a code emailed to the addresses in Settings — no CP account needed.</span>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      {!data ? <Spinner /> : <FinanceDashboardView data={data} brand={brand} onBrand={setBrand} productionHref={(p) => `/production/${encodeURIComponent(p.id)}`} onOpen={(p) => p?.id && window.open(`/production/${encodeURIComponent(p.id)}`, '_self')} />}
    </div>
  );
}

function Spinner() { return <div className="py-20 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>; }

// ── Accruals ──
function AccrualsTab({ month: initial }) {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [approvers, setApprovers] = useState([]);
  const [month, setMonth] = useState(initial ? `${initial.slice(0, 7)}-01` : null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const thisMonth = `${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).slice(0, 7)}-01`;
  const loadList = useCallback(() => financeApi.accruals().then(r => { setList(r.reports); setApprovers(r.approvers || []); if (!month) setMonth(r.reports[0]?.month || thisMonth); }).catch(e => setErr(e.message)), [month, thisMonth]);
  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (month) { setReport(null); financeApi.accrual(month).then(setReport).catch(() => setReport(false)); } }, [month]);
  async function run(name, fn) { setBusy(name); setErr(''); try { await fn(); } catch (e) { setErr(e.message); } setBusy(''); }
  const me = String(user?.email || '').toLowerCase();
  const iApproved = report?.approvals?.some(a => a.email === me);
  const canApprove = approvers.includes(me) && report?.status === 'draft' && !iApproved;
  const d = report?.data;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
      <div className={`${card} p-4 h-fit`}>
        <h3 className="font-bold text-gray-900 mb-1">Accrual reports</h3>
        <p className="text-xs text-gray-500 mb-3">Built on the 25th for that month. Omer and Tomer approve, then it goes to billing@ with a CSV per company.</p>
        <button type="button" disabled={!!busy} onClick={() => run('build', async () => { const r = await financeApi.buildAccrual(thisMonth, false); setMonth(r.month); setReport(r); await loadList(); })}
          className={`${primary} w-full justify-center mb-3`} style={{ background: NAVY }}>
          {busy === 'build' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Build {monthLabel(thisMonth)} now
        </button>
        <div className="space-y-1">
          {(list || []).map(r => (
            <button key={r.id} type="button" onClick={() => setMonth(r.month)} className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${month === r.month ? 'bg-gray-100' : 'hover:bg-gray-50'}`}>
              <span className="font-semibold">{monthLabel(r.month)}</span>
              <span className="text-xs text-gray-500">{usd(r.total_usd)}</span>
              <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${r.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : r.status === 'approved' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{r.status}</span>
            </button>
          ))}
          {list && !list.length && <div className="text-xs text-gray-400 px-1">No reports yet.</div>}
        </div>
      </div>

      <div className="xl:col-span-3 space-y-4">
        {err && <div className="text-sm text-red-600">{err}</div>}
        {report === null && month ? <Spinner /> : report === false ? (
          <div className={`${card} p-10 text-center text-sm text-gray-500`}>No report for {monthLabel(month)} yet — build it.</div>
        ) : report ? (
          <>
            <div className={`${card} p-5 flex items-start gap-4 flex-wrap`}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Accruals · {monthLabel(report.month)}</div>
                <div className="text-3xl font-black" style={{ color: NAVY }}>{usd(d.total_usd)}</div>
                <div className="text-xs text-gray-500">{d.production_count} production{d.production_count === 1 ? '' : 's'} · ₪{d.rate}/$ (Bank of Israel {dayYearLabel(d.rate_date)}) · built {dayYearLabel(report.built_at)}</div>
              </div>
              <div className="ml-auto flex flex-col items-end gap-2">
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {approvers.map(a => {
                    const ok = report.approvals?.find(x => x.email === a);
                    return <span key={a} className={`text-[11px] font-semibold px-2 py-1 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{ok ? '✓ ' : ''}{a.split('@')[0]}</span>;
                  })}
                </div>
                <div className="flex gap-2">
                  {report.status === 'draft' && (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => run('rebuild', async () => { const r = await financeApi.buildAccrual(report.month, false); setReport(r); loadList(); })}>
                      <RefreshCw size={12} /> Rebuild
                    </button>
                  )}
                  {report.status === 'draft' && (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => run('draft', async () => { await financeApi.buildAccrual(report.month, true); })}>
                      <Send size={12} /> Email the draft to approvers
                    </button>
                  )}
                  {canApprove && (
                    <button type="button" disabled={!!busy} className={primary} style={{ background: '#16a34a' }}
                      onClick={() => run('approve', async () => { const r = await financeApi.approveAccrual(report.id); setReport(r); loadList(); })}>
                      {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve{report.approvals?.length ? ' & send to billing' : ''}
                    </button>
                  )}
                  {report.status === 'sent' && <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={13} /> Sent {dayYearLabel(report.sent_at)}</span>}
                </div>
              </div>
            </div>
            {(d.companies || []).map(c => (
              <div key={c.brand_id} className={`${card} overflow-hidden`}>
                <div className="px-5 py-3 flex items-center gap-3 text-white" style={{ background: companyOf(c.brand_id).color }}>
                  <span className="font-black tracking-wider">{companyOf(c.brand_id).short.toUpperCase()}</span>
                  <span className="text-sm opacity-90">{usd(c.total_usd)}</span>
                  <button type="button" onClick={() => downloadAuthed(financeApi.accrualCsvUrl(report.id, c.brand_id), `Accruals ${report.month.slice(0, 7)} - ${companyOf(c.brand_id).short}.csv`)}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-semibold bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg"><Download size={12} /> CSV for Priority</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: 860 }}>
                    <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="text-left px-5 py-2">Production</th><th className="text-right px-3 py-2">This month</th><th className="text-right px-3 py-2">Invoiced</th><th className="text-right px-3 py-2">Not invoiced</th><th className="text-right px-3 py-2">Vs last report</th><th className="text-left px-3 py-2">Why</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {c.rows.map(r => (
                        <tr key={r.id}>
                          <td className="px-5 py-2"><Link to={`/production/${encodeURIComponent(r.id)}`} className="font-bold text-gray-900 hover:underline">{r.code}</Link> <span className="text-gray-600">{r.name}</span>{r.closed && <span className="ml-1 text-[10px] text-gray-400">closed</span>}
                            <div className="text-[10px] text-gray-400">{(r.native || []).map(n => nativeMoney(n.amount, n.currency)).join(' + ')}</div></td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums">{usd(r.month_usd)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(r.invoiced_usd)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(r.not_invoiced_usd)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.change_usd == null ? <span className="text-gray-400 text-xs">new</span> : Math.abs(r.change_usd) >= 1 ? signedUsd(r.change_usd) : '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 max-w-[360px]">{(r.reasons || []).join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {d.past_changes?.length > 0 && (
              <div className={`${card} p-5`}>
                <h3 className="font-bold text-amber-700 mb-2">Changes to months already booked</h3>
                {d.past_changes.map((x, i) => (
                  <div key={i} className="flex gap-3 text-sm py-0.5"><CompanyChip id={x.brand_id} small /><span className="font-semibold">{x.code}</span><span className="text-gray-600">{x.name}{x.line ? ` · ${x.line}` : ''}</span><span className="text-gray-400">{monthLabel(x.month)}</span><span className="ml-auto font-semibold tabular-nums">{signedUsd(x.delta_usd)}</span></div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// Defined at module level so inputs inside keep focus while typing
function Section({ title, count, children, tone }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-bold text-gray-900">{title}</h3>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${count ? (tone || 'bg-amber-50 text-amber-700') : 'bg-emerald-50 text-emerald-700'}`}>{count ? count : '✓ none'}</span>
      </div>
      {children}
    </div>
  );
}

function SettingField({ f, set, k, label, hint, type = 'text' }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <input type={type} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Cleanup: get the data right before the first accrual report ──
function CleanupTab() {
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [paidDates, setPaidDates] = useState({});
  const [methods, setMethods] = useState({});
  const [compare, setCompare] = useState(null); // { id, diffs, apply:Set }
  const load = useCallback(() => financeApi.cleanup().then(setC).catch(e => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function run(name, fn, done) { setBusy(name); setMsg(''); try { const r = await fn(); if (done) setMsg(done(r)); await load(); } catch (e) { setMsg(e.message); } setBusy(''); }
  if (!c) return <Spinner />;

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-xl bg-blue-50 text-blue-800 px-4 py-2.5 text-sm">{msg}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Section title="Totals at the old 3.7 rate" count={c.totals_at_old_rate}>
          <p className="text-sm text-gray-600 mb-3">CP used a fixed ₪3.7/$. The Bank of Israel rate today is ₪{c.rate?.rate}/$. Recalculating updates every production’s estimate and spent — and the Planned Budget of productions that aren’t approved yet (shekel lines go up by about {Math.round((3.7 / (c.rate?.rate || 3.7) - 1) * 100)}%). Approved budgets don’t move.</p>
          <button type="button" disabled={!!busy} className={primary} style={{ background: NAVY }} onClick={() => run('recalc', () => financeApi.recalcAll(), r => `Recalculated ${r.productions} productions at ₪${r.rate?.rate}/$.`)}>
            {busy === 'recalc' && <Loader2 size={13} className="animate-spin" />} Recalculate all at Bank of Israel rates
          </button>
        </Section>

        <Section title="Active productions without an approved budget" count={c.unapproved_active.length} tone="bg-blue-50 text-blue-700">
          <p className="text-sm text-gray-600 mb-2">Approve each one from its page — finance gets the approval email and alerts start.</p>
          {c.unapproved_active.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm py-1">
              <Link to={`/production/${encodeURIComponent(p.id)}`} className="font-bold hover:underline">{financeCode(p.id)}</Link>
              <span className="text-gray-600 truncate">{p.name}</span><span className="text-xs text-gray-400">{p.stage}</span>
              <span className="ml-auto tabular-nums text-xs text-gray-500" title="Planned now (at today's rate) vs what's stored">{usd(p.planned_now)} <span className="text-gray-300">was {usd(p.planned_stored)}</span></span>
            </div>
          ))}
        </Section>

        <Section title="Paid lines with no paid date" count={c.paid_without_date.length}>
          <p className="text-sm text-gray-600 mb-2">Without a date CP can’t tell which month the payment belongs to.</p>
          {c.paid_without_date.map(l => (
            <div key={l.id} className="flex items-center gap-2 text-sm py-1">
              <span className="font-semibold w-16 shrink-0">{financeCode(l.production_id)}</span>
              <span className="truncate flex-1 text-gray-700">{l.full_name || l.item}</span>
              <span className="text-xs tabular-nums text-gray-500">{nativeMoney(l.actual_spent || l.planned_budget, l.currency_code)}</span>
              <input type="date" value={paidDates[l.id] ?? (l.guess || l.timeline_end || '')} onChange={e => setPaidDates(x => ({ ...x, [l.id]: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
            </div>
          ))}
          {c.paid_without_date.length > 0 && (
            <button type="button" disabled={!!busy} className={`${primary} mt-2`} style={{ background: NAVY }}
              onClick={() => run('dates', () => financeApi.cleanupLines(c.paid_without_date.map(l => ({ id: l.id, paid_at: paidDates[l.id] ?? (l.guess || l.timeline_end) })).filter(x => x.paid_at)), r => `Saved ${r.updated} paid dates.`)}>
              Save paid dates
            </button>
          )}
        </Section>

        <Section title="Paid lines with no payment method" count={c.paid_without_method.length}>
          {c.paid_without_method.slice(0, 40).map(l => (
            <div key={l.id} className="flex items-center gap-2 text-sm py-1">
              <span className="font-semibold w-16 shrink-0">{financeCode(l.production_id)}</span>
              <span className="truncate flex-1 text-gray-700">{l.full_name || l.item}</span>
              <select value={methods[l.id] || ''} onChange={e => setMethods(x => ({ ...x, [l.id]: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                <option value="">Method…</option>{['Bank Transfer', 'PayPal', 'Credit Card', 'Upwork', 'Cash', 'Other'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          ))}
          {Object.keys(methods).length > 0 && (
            <button type="button" disabled={!!busy} className={`${primary} mt-2`} style={{ background: NAVY }}
              onClick={() => run('methods', () => financeApi.cleanupLines(Object.entries(methods).filter(([, v]) => v).map(([id, payment_method]) => ({ id, payment_method }))), r => `Saved ${r.updated} payment methods.`)}>
              Save methods
            </button>
          )}
        </Section>

        <Section title="Past their dates but still open" count={c.stale_dates.length}>
          <p className="text-sm text-gray-600 mb-2">Postpone (move the dates — finance is asked about this month) or mark Completed. The producer also gets a daily nudge.</p>
          {c.stale_dates.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm py-1">
              <Link to={`/production/${encodeURIComponent(p.id)}`} className="font-bold hover:underline">{financeCode(p.id)}</Link>
              <span className="text-gray-600 truncate">{p.name}</span><span className="text-xs text-gray-400">{p.stage}</span>
              <span className="ml-auto text-xs text-red-600">ended {dayYearLabel(p.end)}</span>
            </div>
          ))}
        </Section>

        <Section title="Productions with no finance sheet" count={c.no_sheet.length}>
          {c.no_sheet.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm py-1">
              <CompanyChip id={p.brand_id} small /><span className="font-bold">{financeCode(p.id)}</span><span className="text-gray-600 truncate">{p.name}</span>
              <button type="button" disabled={!!busy} className={`${btn} ml-auto`} onClick={() => run(`sheet-${p.id}`, () => financeApi.createSheet(p.id), () => `Sheet created for ${p.id}.`)}>
                {busy === `sheet-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Create sheet
              </button>
            </div>
          ))}
        </Section>

        <Section title="Old-format sheets on open productions" count={c.legacy_sheets.length}>
          <p className="text-sm text-gray-600 mb-2">Compare first — anything finance changed in the old sheet (Paid, actuals) can be brought into CP — then convert to a two-way sheet. The old one stays as a link.</p>
          {c.legacy_sheets.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm py-1">
              <span className="font-bold">{financeCode(p.id)}</span><span className="text-gray-600 truncate">{p.name}</span>
              <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:underline">old sheet</a>
              <button type="button" disabled={!!busy} className={`${btn} ml-auto`} onClick={() => run(`cmp-${p.id}`, async () => {
                const r = await financeApi.compareSheet(p.id);
                const diffs = (r.diffs || []).filter(x => x.type === 'changed');
                const apply = new Set();
                diffs.forEach(dd => dd.fields.forEach(f => { if (['Actual', 'Status'].includes(f.field)) apply.add(`${dd.line_id}|${f.field}`); }));
                setCompare({ id: p.id, name: p.name, diffs, other: (r.diffs || []).filter(x => x.type !== 'changed'), apply });
              })}>{busy === `cmp-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Compare & convert</button>
            </div>
          ))}
        </Section>

        <Section title="Invoices Claude hasn’t read yet" count={c.unread_invoices} tone="bg-violet-50 text-violet-700">
          <p className="text-sm text-gray-600 mb-2">Claude reads each invoice: amount, VAT, number, and which company it’s billed to — and flags the wrong company, gaps vs the budget and duplicates. New invoices are read automatically.</p>
          {c.unread_invoices > 0 && (
            <button type="button" disabled={!!busy} className={primary} style={{ background: '#7c3aed' }} onClick={() => run('read', () => financeApi.readAllInvoices(100), r => `Reading ${r.queued} invoices in the background — flags show in the Budget Tables.`)}>
              Read {Math.min(100, c.unread_invoices)} invoices
            </button>
          )}
        </Section>
      </div>

      {compare && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={() => setCompare(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div><h3 className="font-bold">{financeCode(compare.id)} {compare.name}</h3><p className="text-xs text-gray-500">Ticked values come from the old sheet into CP, then the sheet is converted.</p></div>
              <button type="button" onClick={() => setCompare(null)} className="ml-auto p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {compare.diffs.length === 0 && <div className="text-sm text-gray-500">The old sheet matches CP.</div>}
              {compare.diffs.map(dd => (
                <div key={dd.line_id} className="text-sm">
                  <div className="font-semibold">{dd.name}</div>
                  {dd.fields.filter(f => f.field !== 'Name spelling').map(f => {
                    const key = `${dd.line_id}|${f.field}`;
                    return (
                      <label key={key} className="flex items-center gap-2 text-xs py-0.5 pl-2">
                        <input type="checkbox" checked={compare.apply.has(key)} onChange={e => setCompare(x => { const s = new Set(x.apply); if (e.target.checked) s.add(key); else s.delete(key); return { ...x, apply: s }; })} />
                        <span className="w-14 text-gray-500">{f.field}</span> CP <b>{String(f.cp)}</b> → sheet <b>{String(f.sheet)}</b>
                      </label>
                    );
                  })}
                </div>
              ))}
              {compare.other.length > 0 && <div className="text-xs text-gray-500">Also: {compare.other.map(o => `${o.name} (${o.type === 'only_in_sheet' ? 'only in the sheet' : 'only in CP'})`).join(', ')}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setCompare(null)}>Cancel</button>
              <button type="button" disabled={!!busy} className={primary} style={{ background: NAVY }} onClick={() => run('convert', async () => {
                const map = { Actual: 'actual', Status: 'status', Budget: 'budget' };
                const apply = [];
                compare.diffs.forEach(dd => dd.fields.forEach(f => { if (compare.apply.has(`${dd.line_id}|${f.field}`) && map[f.field]) apply.push({ line_id: dd.line_id, field: map[f.field], value: f.sheet }); }));
                const r = await financeApi.convertSheet(compare.id, apply);
                setCompare(null);
                return r;
              }, () => 'Converted — the new two-way sheet is shared with finance.')}>
                {busy === 'convert' && <Loader2 size={13} className="animate-spin" />} Convert to a two-way sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Emails: test mode, the outbox, previews, run jobs now ──
function EmailsTab({ config, onConfig }) {
  const [out, setOut] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => financeApi.outbox().then(setOut).catch(e => setMsg(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const cfg = config?.config;
  async function run(name, fn, done) { setBusy(name); setMsg(''); try { const r = await fn(); if (done) setMsg(done(r)); load(); } catch (e) { setMsg(e.message); } setBusy(''); }
  const JOBS = [
    ['notify', 'Send due change emails'], ['reminders', 'Missing-invoice reminder (to Omer)'], ['nudges', 'Past-dates nudge (to producers)'],
    ['digest', 'Weekly digest (to finance)'], ['rights', 'Rights ending soon'], ['accrual', 'Accrual draft for this month'], ['sheets', 'Read the finance sheets now'],
  ];
  return (
    <div className="space-y-4">
      {cfg && (
        <div className={`${card} p-5 flex items-center gap-4 flex-wrap`}>
          <div className="flex-1 min-w-[260px]">
            <h3 className="font-bold text-gray-900">{cfg.shadow ? 'Test mode is on' : 'Live — emails go to finance'}</h3>
            <p className="text-sm text-gray-600">{cfg.shadow ? `Every email goes to ${cfg.shadow_to} with a note saying who it was meant for.` : `Finance emails go to ${cfg.to} (cc ${cfg.cc.join(', ') || '—'}). Sent from tomer@ through the connected Google account.`}</p>
          </div>
          <button type="button" disabled={!!busy} className={primary} style={{ background: cfg.shadow ? '#16a34a' : '#b45309' }}
            onClick={() => { if (!cfg.shadow || window.confirm(`Go live? From now on emails go to ${cfg.to} (cc ${cfg.cc.join(', ')}).`)) run('shadow', () => financeApi.saveConfig({ shadow: !cfg.shadow }).then(onConfig)); }}>
            {cfg.shadow ? 'Go live' : 'Back to test mode'}
          </button>
        </div>
      )}
      {msg && <div className="rounded-xl bg-blue-50 text-blue-800 px-4 py-2.5 text-sm">{msg}</div>}
      <div className={`${card} p-5`}>
        <h3 className="font-bold text-gray-900 mb-2">Run now</h3>
        <div className="flex flex-wrap gap-2">
          {JOBS.map(([k, l]) => (
            <button key={k} type="button" disabled={!!busy} className={btn} onClick={() => run(k, () => financeApi.runJob(k), r => `${l}: ${JSON.stringify(r)}`)}>
              {busy === k ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {l}
            </button>
          ))}
        </div>
      </div>
      <div className={`${card} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center"><h3 className="font-bold text-gray-900">Outbox</h3><button type="button" onClick={load} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><RefreshCw size={14} /></button></div>
        {!out ? <Spinner /> : (
          <div className="divide-y divide-gray-50">
            {out.map(m => (
              <div key={m.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${m.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : m.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{m.status}{m.last_error === 'dry run (not sent)' ? ' (dry run)' : ''}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-gray-800">{m.subject}</div>
                  <div className="text-[11px] text-gray-400 truncate">{m.shadow ? `test → ${m.to_addr} · meant for ${m.original_to}${m.original_cc?.length ? ` cc ${m.original_cc.join(', ')}` : ''}` : `${m.to_addr}${m.cc?.length ? ` cc ${m.cc.join(', ')}` : ''}`} · {dayLabel(m.created_at)} {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{m.status !== 'sent' && m.last_error ? ` · ${m.last_error}` : ''}</div>
                </div>
                <button type="button" className={btn} onClick={async () => setView(await financeApi.outboxItem(m.id))}><Eye size={12} /> View</button>
                {m.status !== 'sent' && <button type="button" className={btn} onClick={() => run(`retry-${m.id}`, () => financeApi.retryEmail(m.id))}>Retry</button>}
              </div>
            ))}
            {out.length === 0 && <div className="px-5 py-10 text-center text-sm text-gray-400">No emails yet.</div>}
          </div>
        )}
      </div>
      {view && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={() => setView(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="min-w-0"><div className="font-bold truncate">{view.subject}</div><div className="text-xs text-gray-500">To {view.to_addr}{view.cc?.length ? ` · cc ${view.cc.join(', ')}` : ''}{view.attachments?.length ? ` · ${view.attachments.map(a => a.filename).join(', ')}` : ''}</div></div>
              <button type="button" onClick={() => setView(null)} className="ml-auto p-1 rounded-lg hover:bg-gray-100"><X size={16} /></button>
            </div>
            <iframe title="Email" srcDoc={view.html} sandbox="allow-same-origin" className="flex-1 w-full bg-gray-50" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── The finance log ──
function LogTab() {
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { setRows(null); financeApi.events({ limit: 1000, ...(kind ? { kind } : {}) }).then(setRows).catch(() => setRows([])); }, [kind]);
  const shown = useMemo(() => (rows || []).filter(e => !q.trim() || `${e.production_id} ${financeCode(e.production_id)} ${e.label} ${e.note} ${e.user_name}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <h3 className="font-bold text-gray-900">Finance log</h3>
        <span className="text-xs text-gray-400">Append-only — nothing here can be edited or deleted.</span>
        <select value={kind} onChange={e => setKind(e.target.value)} className="ml-auto border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
          <option value="">Everything</option>{Object.entries(EVENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48" />
      </div>
      {!rows ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 980 }}>
            <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="text-left px-5 py-2">When</th><th className="text-left px-3 py-2">Production</th><th className="text-left px-3 py-2">What</th><th className="text-left px-3 py-2">Change</th><th className="text-left px-3 py-2">Why</th><th className="text-left px-3 py-2">Who</th><th className="text-left px-3 py-2">Email</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map(e => (
                <tr key={e.id}>
                  <td className="px-5 py-2 text-xs text-gray-500 whitespace-nowrap">{dayLabel(e.created_at)} {new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.production_id ? <Link to={`/production/${encodeURIComponent(e.production_id)}`} className="font-semibold hover:underline">{financeCode(e.production_id)}</Link> : '—'} <CompanyChip id={e.brand_id} small /></td>
                  <td className="px-3 py-2"><div className="font-medium">{EVENT_LABEL[e.kind] || e.kind}</div><div className="text-xs text-gray-500 truncate max-w-[220px]">{e.label}</div></td>
                  <td className="px-3 py-2 text-xs text-gray-700">{e.old_value ?? '—'} → {e.new_value ?? '—'}{e.delta_usd != null ? ` (${signedUsd(e.delta_usd)})` : ''}{e.expense_month ? ` · ${monthLabel(e.expense_month)}` : ''}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[260px]">{e.reason ? <b>{REASON_LABEL[e.reason]}</b> : ''}{e.approved_by ? ` · ${e.approved_by}` : ''}{e.note ? ` · “${e.note}”` : ''}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{e.user_name || 'CP'}{e.source && e.source !== 'cp' ? ` · ${e.source}` : ''}</td>
                  <td className="px-3 py-2 text-[10px] font-semibold">{e.notify ? (e.notified_at ? <span className="text-emerald-700">sent</span> : <span className="text-amber-700">pending</span>) : <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Settings: recipients, days, approvers, year budgets, backup ──
function SettingsTab({ config, onConfig }) {
  const cfg = config?.config;
  const [f, setF] = useState(null);
  const [years, setYears] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const year = new Date().getFullYear();
  useEffect(() => { if (cfg) setF({ ...cfg, cc: cfg.cc.join(', '), internal: cfg.internal.join(', '), report_approvers: cfg.report_approvers.join(', '), reminders_to: cfg.reminders_to.join(', '), dashboard_emails: cfg.dashboard_emails.join(', '), approvers: cfg.approvers.join(', '), reminder_days: cfg.reminder_days.join(', ') }); }, [cfg]);
  useEffect(() => { financeApi.yearBudgets(year).then(setYears).catch(() => {}); }, [year]);
  if (!f) return <Spinner />;
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  async function save() {
    setBusy('save'); setMsg('');
    try { await financeApi.saveConfig(f); await onConfig(); setMsg('Saved.'); } catch (e) { setMsg(e.message); }
    setBusy('');
  }
  const budgetOf = (b) => years.find(y => y.brand_id === b)?.amount_usd;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className={`${card} p-5 xl:col-span-2 space-y-4`}>
        <h3 className="font-bold text-gray-900">Who gets what</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SettingField f={f} set={set} k="to" label="Finance (to)" hint="Approvals, changes, reopen alerts, closings, accruals, weekly digest" />
          <SettingField f={f} set={set} k="cc" label="Cc" hint="Comma-separated" />
          <SettingField f={f} set={set} k="report_approvers" label="Accrual report approvers" hint="All of them approve before it goes to finance" />
          <SettingField f={f} set={set} k="reminders_to" label="Missing-invoice reminders" hint="Suppliers are never contacted by CP" />
          <SettingField f={f} set={set} k="internal" label="Internal alerts" hint="Unexpected running low, rights ending, accrual drafts" />
          <SettingField f={f} set={set} k="dashboard_emails" label="Finance dashboard access" hint="These addresses can get a sign-in code" />
          <SettingField f={f} set={set} k="approvers" label="Budget approvers (names)" hint="The “Approved by” list" />
          <SettingField f={f} set={set} k="shadow_to" label="Test mode sends to" />
        </div>
        <h3 className="font-bold text-gray-900 pt-2">Days & rules</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SettingField f={f} set={set} k="accrual_day" label="Accrual report day" type="number" />
          <SettingField f={f} set={set} k="reminder_days" label="Reminder days" hint="e.g. 21, 26" />
          <SettingField f={f} set={set} k="invoice_cutoff_day" label="Invoice cutoff" type="number" />
          <SettingField f={f} set={set} k="payment_day" label="Payment run day" type="number" />
          <SettingField f={f} set={set} k="default_net_days" label="Net days" type="number" hint="שוטף + N" />
          <SettingField f={f} set={set} k="buffer_warn_pct" label="Warn at % of unexpected" type="number" />
          <SettingField f={f} set={set} k="bundle_minutes" label="Bundle changes (minutes)" type="number" />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {[['nudges', 'Daily past-dates nudge'], ['weekly_digest', 'Weekly digest'], ['sheet_sync', 'Read finance sheets (two-way)']].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!f[k]} onChange={e => set(k, e.target.checked)} /> {l}</label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={!!busy} onClick={save} className={primary} style={{ background: NAVY }}>{busy === 'save' && <Loader2 size={13} className="animate-spin" />} Save settings</button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>
      </div>
      <div className="space-y-5">
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-1">{year} budget per company</h3>
          <p className="text-xs text-gray-500 mb-3">Used by the Budget Overview and the forecast (it used to live in each browser).</p>
          {['particle', 'blurr', 'biomella'].map(b => (
            <div key={b} className="flex items-center gap-2 py-1">
              <CompanyChip id={b} small />
              <input type="number" defaultValue={budgetOf(b) ? Math.round(budgetOf(b)) : ''} placeholder="USD" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                onBlur={e => { const v = Number(e.target.value); if (v > 0 && v !== Number(budgetOf(b))) financeApi.saveYearBudget(b, year, v).then(() => financeApi.yearBudgets(year).then(setYears)); }} />
            </div>
          ))}
        </div>
        <div className={`${card} p-5`}>
          <h3 className="font-bold text-gray-900 mb-1">Database backup</h3>
          <p className="text-xs text-gray-500 mb-2">Every night to Dropbox (/CP Panel Backup/Database).</p>
          <div className="text-sm text-gray-700">{config?.backup ? `Last: ${dayYearLabel(config.backup.at)} · ${(config.backup.bytes / 1048576).toFixed(1)} MB` : 'No backup yet'}</div>
          <button type="button" disabled={!!busy} className={`${btn} mt-2`} onClick={async () => { setBusy('backup'); try { const r = await financeApi.runJob('backup'); setMsg(`Backed up ${(r.bytes / 1048576).toFixed(1)} MB`); onConfig(); } catch (e) { setMsg(e.message); } setBusy(''); }}>
            {busy === 'backup' && <Loader2 size={12} className="animate-spin" />} Back up now
          </button>
        </div>
        <div className={`${card} p-5 text-xs text-gray-500 space-y-1`}>
          <div>USD rate: ₪{config?.rate?.rate}/$ · Bank of Israel {dayYearLabel(config?.rate?.date)}</div>
          <div>Finance dashboard: <a className="text-blue-600 hover:underline" href="/finance-view" target="_blank" rel="noreferrer">/finance-view <ExternalLink size={10} className="inline" /></a></div>
        </div>
      </div>
    </div>
  );
}
