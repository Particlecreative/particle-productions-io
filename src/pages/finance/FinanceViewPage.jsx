import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, Mail, RefreshCw, X, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import FinanceDashboardView, { CompanyChip, changeText } from '../../components/finance/FinanceDashboardView';
import { financePublic, financeSession, usd, signedUsd, nativeMoney, dayLabel, dayYearLabel, monthLabel, EVENT_LABEL, REASON_LABEL } from '../../lib/financeService';

const NAVY = '#030b2e';

/** Finance's live dashboard — no CP login: an emailed one-time code, then this device is remembered for 30 days. */
export default function FinanceViewPage() {
  const [signedIn, setSignedIn] = useState(!!financeSession.get());
  const [data, setData] = useState(null);
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('p'));

  useEffect(() => {
    document.title = 'Finance dashboard · Particle';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex,nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await financePublic.dashboard(brand)); }
    catch (e) { if (e.signin) setSignedIn(false); else setError(e.message); }
    setLoading(false);
  }, [brand]);
  useEffect(() => { if (signedIn) load(); }, [signedIn, load]);

  if (!signedIn) return <SignIn onDone={() => setSignedIn(true)} />;

  return (
    <div className="min-h-screen" style={{ background: '#f4f5f7' }}>
      <header className="text-white" style={{ background: NAVY }}>
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div>
            <div className="text-[11px] font-bold tracking-[0.18em] opacity-70">PARTICLE · BLURR · BIOMELLA</div>
            <h1 className="text-2xl font-black tracking-tight" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', textTransform: 'uppercase', fontSize: 30 }}>Finance dashboard</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {data?.you && <span className="hidden sm:inline text-xs opacity-70">{data.you}</span>}
            <button type="button" onClick={load} className="p-2 rounded-full hover:bg-white/10" title="Refresh"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            <button type="button" onClick={async () => { await financePublic.signOut(); setSignedIn(false); setData(null); }} className="p-2 rounded-full hover:bg-white/10" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-6">
        {error && <div className="mb-4 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
        {!data ? (
          <div className="py-24 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <FinanceDashboardView data={data} brand={brand} onBrand={setBrand}
            onOpen={(p) => p?.id && setOpen(p.id)}
            onConfirm={async (p) => {
              if (!window.confirm(`Confirm ${p.code} ${p.name} is closed on your side too?`)) return;
              try { await financePublic.confirm(p.id); load(); } catch (e) { alert(e.message); }
            }} />
        )}
      </main>
      {open && <ProductionDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SignIn({ onDone }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function send(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await financePublic.requestCode(email.trim()); setStep('code'); } catch (x) { setErr(x.message); }
    setBusy(false);
  }
  async function verify(e) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await financePublic.verifyCode(email.trim(), code.trim()); onDone(); } catch (x) { setErr(x.message); }
    setBusy(false);
  }
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: NAVY }}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <div className="text-[11px] font-bold tracking-[0.18em] text-gray-400">PARTICLE · FINANCE</div>
        <h1 className="text-[34px] leading-none font-black uppercase mt-1" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: NAVY }}>Finance dashboard</h1>
        {step === 'email' ? (
          <form onSubmit={send} className="mt-5 space-y-3">
            <p className="text-sm text-gray-500">Enter your work email — we’ll send you a sign-in code.</p>
            <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@particleformen.com" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500" />
            <button type="submit" disabled={busy} className="w-full rounded-xl py-3 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: '#0808f8' }}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Email me a code
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 space-y-3">
            <p className="text-sm text-gray-500">If <b>{email}</b> has access, a 6-digit code is on its way. It works for 10 minutes.</p>
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl tracking-[0.4em] text-center font-black outline-none focus:border-blue-500" />
            <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl py-3 font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: '#0808f8' }}>
              {busy && <Loader2 size={16} className="animate-spin" />} Sign in
            </button>
            <button type="button" onClick={() => { setStep('email'); setCode(''); }} className="w-full text-xs text-gray-400 hover:text-gray-600">Use a different email</button>
          </form>
        )}
        {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
        <p className="mt-6 text-[11px] text-gray-400">This device stays signed in for 30 days.</p>
      </div>
    </div>
  );
}

function ProductionDrawer({ id, onClose }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { financePublic.production(id).then(setP).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/30" onMouseDown={onClose}>
      <aside className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start gap-3 z-10">
          <div className="flex-1 min-w-0">
            {p && <div className="flex items-center gap-2"><CompanyChip id={p.brand_id} /><span className="font-black text-lg">{p.code}</span><span className="text-xs text-gray-400">{p.id}</span></div>}
            <h2 className="text-lg font-bold text-gray-900 truncate">{p?.name || '…'}</h2>
            {p && <div className="text-xs text-gray-500">{p.company_legal} · {p.stage} · {dayLabel(p.start)} → {dayYearLabel(p.end)}</div>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>
        {err && <div className="m-5 text-sm text-red-600">{err}</div>}
        {!p ? <div className="py-20 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div> : (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Planned</div><div className="text-lg font-black">{usd(p.state.planned)}</div><div className="text-[10px] text-gray-500">{p.approved ? `Approved · ${p.approved_by}` : 'Not approved yet'}</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Actual</div><div className="text-lg font-black">{usd(p.totals.actualUsd ?? 0)}</div><div className="text-[10px] text-gray-500">{p.totals.parts.map(x => nativeMoney(x.amount, x.currency)).join(' + ')}</div></div>
              <div className="rounded-xl bg-gray-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Paid</div><div className="text-lg font-black">{usd(p.totals.paidUsd)}</div><div className="text-[10px] text-gray-500">{p.open ? 'Open' : p.confirmed_at ? 'Closed · confirmed' : 'Closed'}</div></div>
            </div>
            {p.sheet_url && <a href={p.sheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">Finance sheet <ExternalLink size={12} /></a>}

            <section>
              <h3 className="font-bold text-gray-900 mb-2">Budget lines</h3>
              <div className="rounded-xl border border-gray-100 overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 560 }}>
                  <thead><tr className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50"><th className="text-left px-3 py-2">Line</th><th className="text-left px-3 py-2">Month</th><th className="text-right px-3 py-2">Planned</th><th className="text-right px-3 py-2">Actual</th><th className="text-left px-3 py-2">Invoice</th><th className="text-left px-3 py-2">Paid</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {p.lines.filter(l => !l.unexpected).map(l => (
                      <tr key={l.id}>
                        <td className="px-3 py-1.5"><div className="font-semibold text-gray-800">{l.supplier || l.label}</div>{l.supplier && <div className="text-gray-500">{l.label}</div>}</td>
                        <td className="px-3 py-1.5 text-gray-500">{monthLabel(l.month)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{nativeMoney(l.planned, l.currency)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{l.actual ? nativeMoney(l.actual, l.currency) : '—'}</td>
                        <td className="px-3 py-1.5">
                          {l.invoice === 'received' ? <span className="text-emerald-700 font-semibold">Received</span> : l.invoice === 'not needed' ? <span className="text-gray-400">Not needed</span> : <span className="text-amber-700 font-semibold">Missing</span>}
                          {(l.invoice_flags || []).map(f => <div key={f.code} className="text-[10px] text-red-600 flex gap-1"><AlertTriangle size={10} className="shrink-0 mt-px" />{f.message}</div>)}
                        </td>
                        <td className="px-3 py-1.5">{l.paid ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={11} /> {dayLabel(l.paid_at)}{l.method ? ` · ${l.method}` : ''}</span> : <span className="text-gray-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {p.payment_plan?.length > 0 && (
              <section>
                <h3 className="font-bold text-gray-900 mb-2">Payments planned</h3>
                {p.payment_plan.map(r => <div key={r.date} className="flex justify-between text-sm py-0.5"><span>{dayYearLabel(r.date)}</span><span className="font-semibold">{usd(r.usd)}</span></div>)}
              </section>
            )}

            <section>
              <h3 className="font-bold text-gray-900 mb-2">Decision log</h3>
              <div className="space-y-2">
                {p.events.filter(e => !['sheet_edit', 'invoice_read'].includes(e.kind)).slice(0, 80).map(e => (
                  <div key={e.id} className="text-sm border-l-2 border-gray-100 pl-3">
                    <div className="flex gap-2"><span className="font-semibold">{EVENT_LABEL[e.kind] || e.kind}</span><span className="text-gray-400 text-xs ml-auto">{dayYearLabel(e.at)}</span></div>
                    <div className="text-xs text-gray-600">{e.label}{changeText({ ...e, month: e.month }) ? ` · ${changeText({ ...e, month: e.month })}` : ''}{e.delta_usd != null && Math.abs(Number(e.delta_usd)) >= 1 && !['budget_increase', 'historical_change'].includes(e.kind) ? ` (${signedUsd(e.delta_usd)})` : ''}</div>
                    {(e.reason || e.approved_by || e.note) && <div className="text-xs text-gray-500">{e.reason ? REASON_LABEL[e.reason] : ''}{e.approved_by ? ` · approved by ${e.approved_by}` : ''}{e.note ? ` · “${e.note}”` : ''}</div>}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
