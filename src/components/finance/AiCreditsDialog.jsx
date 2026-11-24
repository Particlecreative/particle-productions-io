// AI credits before Wrap-up (Tomer, 24 Nov 2026): a production with Higgsfield / AI-credit lines asks how many credits
// it used before it moves on. Credits × our price (finance settings, $0.065) becomes each line's actual — shown live.
import { useMemo, useState } from 'react';
import { Sparkles, X, Check } from 'lucide-react';

const usdFmt = (n, dp = 2) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const ilsFmt = (n) => `₪${Math.round(Number(n || 0)).toLocaleString('en-US')}`;
const money = (n, cur, dp = 0) => (cur === 'ILS' ? ilsFmt(n) : usdFmt(n, dp));
const digits = (s) => String(s || '').replace(/[^\d]/g, '').slice(0, 9);

export default function AiCreditsDialog({ payload, onDone }) {
  const price = Number(payload.price) > 0 ? Number(payload.price) : 0.065;
  const rate = Number(payload.rate) > 0 ? Number(payload.rate) : 3.7;
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const stage = payload.stage || 'Wrap-up';
  const [vals, setVals] = useState(() => Object.fromEntries(lines.map(l => [l.id, l.credits != null ? String(l.credits) : ''])));

  const rows = useMemo(() => lines.map(l => {
    const raw = vals[l.id] ?? '';
    const credits = raw === '' ? null : Number(raw);
    const usd = credits == null ? null : Math.round(credits * price * 100) / 100;
    const amount = usd == null ? null : (l.currency === 'ILS' ? Math.round(usd * rate * 100) / 100 : usd);
    const planned = Number(l.planned) || 0;
    const pct = amount != null && planned > 0 ? (amount / planned) * 100 : null;
    return { ...l, raw, credits, usd, amount, planned, pct };
  }), [lines, vals, price, rate]);

  const filled = rows.every(r => r.credits != null);
  const totalCredits = rows.reduce((a, r) => a + (r.credits || 0), 0);
  const totalUsd = rows.reduce((a, r) => a + (r.usd || 0), 0);
  const plannedUsd = rows.reduce((a, r) => a + (r.currency === 'ILS' ? r.planned / rate : r.planned), 0);
  const submit = () => { if (filled) onDone({ ai_credits: Object.fromEntries(rows.map(r => [r.id, r.credits])) }); };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => onDone(null)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] max-h-[92vh] flex flex-col overflow-hidden" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ai-credits-title">
        {/* Header */}
        <div className="relative px-6 pt-5 pb-4" style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #eef2ff 100%)' }}>
          <button type="button" onClick={() => onDone(null)} className="absolute right-3 top-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/70" aria-label="Close"><X size={16} /></button>
          <div className="flex items-start gap-3 pr-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}><Sparkles size={19} /></div>
            <div className="min-w-0">
              <h3 id="ai-credits-title" className="font-bold text-gray-900 text-[17px] leading-snug">How many AI credits did {payload.production || 'this production'} use?</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Before it moves to {stage} — {usdFmt(price, 3)} a credit, the cost goes on the AI lines.</p>
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          {rows.map((r, i) => {
            const over = r.pct != null && r.pct > 100;
            const color = r.pct == null ? '#c7d2fe' : over ? '#dc2626' : r.pct > 85 ? '#f59e0b' : '#10b981';
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 p-3.5 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-shadow">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-semibold text-[14px] text-gray-900 truncate">{r.label || 'AI credits'}</span>
                  {r.supplier && <span className="text-[12px] text-gray-400 truncate">{r.supplier}</span>}
                  <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{r.planned > 0 ? `planned ${money(r.planned, r.currency)}` : 'no budget set'}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <label className="relative flex-1 min-w-0">
                    <span className="sr-only">Credits used on {r.label || 'this line'}</span>
                    <input
                      autoFocus={i === 0} inputMode="numeric" placeholder="0"
                      value={r.raw === '' ? '' : Number(r.raw).toLocaleString('en-US')}
                      onChange={e => setVals(v => ({ ...v, [r.id]: digits(e.target.value) }))}
                      onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 focus:bg-white pl-3 pr-16 py-2.5 text-[20px] font-bold tabular-nums text-gray-900 outline-none placeholder:text-gray-300"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-gray-400 pointer-events-none">credits</span>
                  </label>
                  <div className="sm:w-[132px] shrink-0 flex items-baseline gap-2 sm:block sm:text-right">
                    <div className="text-[11px] text-gray-400 leading-none sm:mb-1">cost</div>
                    <div className={`text-[22px] font-black tabular-nums leading-none transition-colors ${r.usd == null ? 'text-gray-300' : 'text-gray-900'}`}>{usdFmt(r.usd ?? 0)}</div>
                    {r.currency === 'ILS' && r.amount != null && <div className="text-[11px] text-gray-400 mt-0.5 tabular-nums">{ilsFmt(r.amount)} on the line</div>}
                  </div>
                </div>
                {r.planned > 0 && (
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.pct ?? 0)}%`, background: color, transition: 'width .45s cubic-bezier(.16,1,.3,1), background-color .3s' }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[11px] tabular-nums">
                      <span style={{ color: r.pct == null ? '#9ca3af' : color }} className="font-semibold">
                        {r.pct == null ? 'type the credits from the Higgsfield account' : over ? `${money(r.amount - r.planned, r.currency)} over the plan` : `${Math.round(r.pct)}% of the plan`}
                      </span>
                      {r.actual > 0 && r.credits == null && <span className="text-gray-400">now {money(r.actual, r.currency)} on the line</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Total + actions */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 bg-gray-50/60">
          {rows.length > 1 && (
            <div className="flex items-end justify-between mb-3">
              <div className="text-[12px] text-gray-500">
                <div className="font-semibold text-gray-700 tabular-nums">{totalCredits.toLocaleString('en-US')} credits</div>
                {plannedUsd > 0 && <div className="tabular-nums">of ~{usdFmt(plannedUsd, 0)} planned</div>}
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-400">total</div>
                <div className="text-[26px] font-black tabular-nums leading-none text-gray-900">{usdFmt(totalUsd)}</div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => onDone({ ai_credits_skip: true })} className="mr-auto px-3 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100">Not now</button>
            <button type="button" onClick={() => onDone(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={!filled}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
              <Check size={15} /> Save &amp; move to {stage}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 text-right">“Not now” moves it on without them — you can type the cost on the AI lines later.</p>
        </div>
      </div>
    </div>
  );
}
