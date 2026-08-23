import { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, ArrowRight, Sparkles, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { getFinanceSheetMismatches } from '../../lib/dataService';

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return String(v);
}

const CONFETTI = [
  { c: '#22c55e', l: '18%', d: '0s' }, { c: '#6366f1', l: '32%', d: '0.08s' },
  { c: '#f59e0b', l: '46%', d: '0.02s' }, { c: '#ec4899', l: '60%', d: '0.12s' },
  { c: '#14b8a6', l: '72%', d: '0.05s' }, { c: '#8b5cf6', l: '84%', d: '0.15s' },
  { c: '#22c55e', l: '26%', d: '0.2s' }, { c: '#3b82f6', l: '66%', d: '0.24s' },
];

export default function FinanceMismatchModal({ productionId, productionName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [resolved, setResolved] = useState(() => new Set()); // keys ticked off in the checklist

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setData(null); setResolved(new Set());
    (async () => {
      try {
        const r = await getFinanceSheetMismatches(productionId);
        if (!alive) return;
        if (r?.error) throw new Error(r.error);
        setData(r);
      } catch (e) { if (alive) setError(e.message || 'Could not read the sheet'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [productionId, nonce]);

  const keyOf = (d) => `${d.type}:${d.name}`;
  const toggle = (k) => setResolved(prev => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });

  const diffs = data?.diffs || [];
  const changed = diffs.filter(d => d.type === 'changed');
  const onlySheet = diffs.filter(d => d.type === 'only_in_sheet');
  const onlyCp = diffs.filter(d => d.type === 'only_in_cp');
  const inSync = data && diffs.length === 0;
  const doneCount = diffs.filter(d => resolved.has(keyOf(d))).length;
  const allResolved = diffs.length > 0 && doneCount >= diffs.length;
  const donePct = diffs.length ? Math.round((doneCount / diffs.length) * 100) : 0;
  let cardIdx = 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="brand-card rounded-2xl w-full max-w-2xl overflow-hidden ai-panel-in" onClick={e => e.stopPropagation()}
        style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <FileSpreadsheet size={16} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-800 dark:text-gray-100">Sheet vs CP</h2>
              <p className="text-[10px] text-gray-400">{productionName || productionId} · budget, actual spent & status</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!loading && (
              <button onClick={() => setNonce(n => n + 1)} title="Re-check"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"><RefreshCw size={14} /></button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          {loading ? (
            /* ── Loading ── */
            <div className="py-14 text-center">
              <div className="relative w-16 h-16 mx-auto mb-5">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-green-100 to-indigo-100 dark:from-green-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                  <FileSpreadsheet size={26} className="text-green-500" />
                </div>
              </div>
              <div className="w-48 h-1.5 mx-auto rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-green-400 to-transparent fs-scan" />
              </div>
              <p className="text-xs text-gray-400 mt-4 font-medium">Comparing the sheet with the CP…</p>
            </div>
          ) : error ? (
            /* ── Error ── */
            <div className="py-12 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Couldn't read the sheet</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto mb-4">{error}</p>
              <button onClick={() => setNonce(n => n + 1)} className="text-xs font-bold text-[var(--brand-accent)] hover:underline inline-flex items-center gap-1">
                <RefreshCw size={12} /> Try again
              </button>
            </div>
          ) : inSync ? (
            /* ── In sync (celebratory) ── */
            <div className="py-12 text-center relative overflow-hidden">
              {/* confetti */}
              <div className="pointer-events-none absolute inset-x-0 top-6 h-0">
                {CONFETTI.map((p, i) => (
                  <span key={i} className="fs-confetti absolute top-0 w-2 h-2 rounded-sm"
                    style={{ left: p.l, background: p.c, animationDelay: p.d }} />
                ))}
              </div>
              <div className="relative w-20 h-20 mx-auto mb-5">
                <span className="fs-ring-pulse absolute inset-0 rounded-full bg-green-400/40" />
                <div className="fs-check-pop absolute inset-0 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <Check size={40} className="text-white" strokeWidth={3} />
                </div>
              </div>
              <h3 className="text-lg font-black text-gray-800 dark:text-gray-100 flex items-center justify-center gap-1.5">
                Everything's in sync <Sparkles size={16} className="text-amber-400" />
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                All {data.cpRowCount} line item{data.cpRowCount !== 1 ? 's' : ''} match the sheet — budget, actual spent and status.
              </p>
            </div>
          ) : (
            /* ── Differences (resolving checklist) ── */
            <div>
              {/* Summary + progress */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-sm font-black text-gray-800 dark:text-gray-100">
                  {diffs.length} difference{diffs.length !== 1 ? 's' : ''} to resolve
                </span>
                <span className="text-[11px] text-gray-400">· {data.sheetRowCount} sheet rows vs {data.cpRowCount} in CP</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {changed.length > 0 && <Chip color="amber" n={changed.length} label="changed" />}
                  {onlySheet.length > 0 && <Chip color="orange" n={onlySheet.length} label="only in sheet" />}
                  {onlyCp.length > 0 && <Chip color="blue" n={onlyCp.length} label="only in CP" />}
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${donePct}%`, background: allResolved ? '#22c55e' : 'var(--brand-accent)' }} />
                </div>
                <span className="text-[11px] font-bold text-gray-500 shrink-0">{doneCount}/{diffs.length} resolved</span>
              </div>

              {/* All-resolved banner */}
              {allResolved && (
                <div className="fs-card-in relative overflow-hidden flex items-center gap-3 rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50/70 dark:bg-green-900/15 p-3 mb-4">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-0">
                    {CONFETTI.map((p, i) => (
                      <span key={i} className="fs-confetti absolute top-0 w-1.5 h-1.5 rounded-sm" style={{ left: p.l, background: p.c, animationDelay: p.d }} />
                    ))}
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shrink-0 fs-check-pop">
                    <Check size={18} className="text-white" strokeWidth={3} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-black text-green-700 dark:text-green-400">All checked off! <Sparkles size={13} className="inline text-amber-400" /></p>
                    <p className="text-[11px] text-green-600/80">Re-check to confirm the sheet now matches the CP.</p>
                  </div>
                  <button onClick={() => setNonce(n => n + 1)}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5">
                    <RefreshCw size={12} /> Re-check
                  </button>
                </div>
              )}

              <div className="space-y-2.5">
                {changed.map((d, i) => {
                  const k = keyOf(d); const done = resolved.has(k);
                  return (
                  <div key={`c${i}`} className={`fs-card-in rounded-xl border p-3 transition-all ${done ? 'border-green-200/70 dark:border-green-900/40 bg-green-50/40 dark:bg-green-900/10 opacity-60' : 'border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-900/10'}`}
                    style={{ animationDelay: `${(cardIdx++) * 45}ms` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckBox done={done} onClick={() => toggle(k)} />
                      <span className={`text-sm font-bold text-gray-800 dark:text-gray-100 ${done ? 'line-through text-gray-400' : ''}`}>{d.name}</span>
                    </div>
                    <div className="space-y-1 pl-8">
                      {d.fields.map((f, fi) => (
                        <div key={fi} className="flex items-center gap-2 text-[11px]">
                          <span className="text-gray-400 w-24 shrink-0">{f.field}</span>
                          <span className="font-semibold text-gray-500 dark:text-gray-400">{fmtVal(f.sheet)}</span>
                          <ArrowRight size={11} className="text-gray-300 shrink-0" />
                          <span className="font-bold text-gray-800 dark:text-gray-100">{fmtVal(f.cp)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pl-8 mt-1.5 text-[9px] text-gray-400 uppercase tracking-wide">sheet → CP</div>
                  </div>
                  );
                })}

                {onlySheet.map((d, i) => {
                  const k = keyOf(d); const done = resolved.has(k);
                  return (
                  <div key={`s${i}`} className={`fs-card-in flex items-center gap-2.5 rounded-xl border p-3 transition-all ${done ? 'border-green-200/70 bg-green-50/40 dark:bg-green-900/10 opacity-60' : 'border-orange-200/70 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-900/10'}`}
                    style={{ animationDelay: `${(cardIdx++) * 45}ms` }}>
                    <CheckBox done={done} onClick={() => toggle(k)} />
                    <span className={`text-sm font-semibold text-gray-800 dark:text-gray-100 ${done ? 'line-through text-gray-400' : ''}`}>{d.name}</span>
                    <span className="ml-auto text-[10px] text-orange-500 font-semibold">only in the sheet</span>
                  </div>
                  );
                })}

                {onlyCp.map((d, i) => {
                  const k = keyOf(d); const done = resolved.has(k);
                  return (
                  <div key={`p${i}`} className={`fs-card-in flex items-center gap-2.5 rounded-xl border p-3 transition-all ${done ? 'border-green-200/70 bg-green-50/40 dark:bg-green-900/10 opacity-60' : 'border-blue-200/70 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10'}`}
                    style={{ animationDelay: `${(cardIdx++) * 45}ms` }}>
                    <CheckBox done={done} onClick={() => toggle(k)} />
                    <span className={`text-sm font-semibold text-gray-800 dark:text-gray-100 ${done ? 'line-through text-gray-400' : ''}`}>{d.name}</span>
                    <span className="ml-auto text-[10px] text-blue-500 font-semibold">only in CP</span>
                  </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-gray-400 mt-4 text-center">Tick each item as you fix it in the CP or the sheet — then Re-check. Read-only: nothing here changes your data.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckBox({ done, onClick }) {
  return (
    <button onClick={onClick} title={done ? 'Mark as unresolved' : 'Mark as resolved'}
      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-all active:scale-90 ${
        done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-green-400'
      }`}>
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

function Chip({ color, n, label }) {
  const cls = {
    amber:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30',
    blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30',
  }[color];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{n} {label}</span>;
}
