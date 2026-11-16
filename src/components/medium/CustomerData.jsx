// The customer data a brief stands on (Tomer, 16 Nov 2026: "when you create briefs based on surveys, let us know the
// data — it's important"): what the brief took from the surveys / OuterSignal, and the survey answers Medium read.
import { useState } from 'react';
import { ChevronDown, MessageSquareQuote } from 'lucide-react';

const isCustomer = (e) => /survey|outersignal/i.test(String(e?.source || ''));

export default function CustomerData({ b }) {
  const [open, setOpen] = useState(false);
  const cited = (b.evidence?.items || []).filter(isCustomer);
  const surveys = b.evidence?.surveys || [];
  if (!cited.length && !surveys.length) return null;
  return (
    <section className="mt-7">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="md-h2">📊 What customers told us</h3>
        <span className="text-[12.5px] trk-muted">{cited.length ? `this brief leans on ${cited.length === 1 ? 'one finding' : `${cited.length} findings`}` : 'read by Medium — not used in this brief'}</span>
      </div>
      {cited.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {cited.map((e, i) => (
            <li key={i} className="rounded-xl px-3.5 py-2.5 text-[13.5px] leading-snug flex gap-2.5" style={{ background: 'var(--trk-glass-hi)' }}>
              <MessageSquareQuote size={15} className="flex-none mt-0.5" style={{ color: 'var(--trk-electric, #4a55ff)' }} />
              <span className="min-w-0"><span>{e.claim}</span> <span className="text-[11.5px] trk-dim whitespace-nowrap">· {e.source}</span></span>
            </li>
          ))}
        </ul>
      )}
      {surveys.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="mt-3 text-[12.5px] font-semibold trk-muted hover:underline inline-flex items-center gap-1">
            {open ? 'Hide' : 'See'} the survey answers Medium read ({surveys.length} survey{surveys.length === 1 ? '' : 's'}) <ChevronDown size={13} className={open ? 'rotate-180' : ''} />
          </button>
          {open && (
            <div className="mt-3 grid gap-3">
              {surveys.map(s => (
                <div key={s.id} className="rounded-2xl p-3.5" style={{ background: 'var(--trk-glass-hi)' }}>
                  <div className="text-[13.5px] font-semibold">{s.name}</div>
                  <div className="text-[11.5px] trk-dim mt-0.5">{s.product ? `${s.product} · ` : ''}{Number(s.responses || 0).toLocaleString('en-US')} answers{s.last_answer_at ? ` · latest ${String(s.last_answer_at).slice(0, 10)}` : ''} · PFM Surveys</div>
                  {(s.questions || []).map((q, qi) => (
                    <div key={qi} className="mt-3">
                      <div className="text-[12.5px] font-semibold">“{q.text}” <span className="trk-dim font-normal">· {q.total} answers</span></div>
                      {q.bars?.length > 0 && (
                        <div className="mt-1.5 grid gap-1">
                          {q.bars.map((bar, bi) => (
                            <div key={bi} className="grid grid-cols-[minmax(0,1fr)_46px] items-center gap-2 text-[12px]">
                              <div className="relative h-6 rounded-md overflow-hidden" style={{ background: 'rgba(127,127,127,.12)' }}>
                                <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.max(2, Math.min(100, bar.pct || 0))}%`, background: bi === 0 ? 'rgba(74,85,255,.45)' : 'rgba(74,85,255,.22)' }} />
                                <span className="relative px-2 leading-6 truncate block">{bar.label}</span>
                              </div>
                              <span className="text-right tabular-nums font-semibold">{Math.round(bar.pct || 0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {q.verbatims?.length > 0 && (
                        <ul className="mt-1.5 grid gap-1">
                          {q.verbatims.map((v, vi) => <li key={vi} className="text-[12.5px] italic trk-muted">“{v.text}”{v.at ? <span className="not-italic trk-dim text-[11px]"> · {v.at}</span> : null}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
