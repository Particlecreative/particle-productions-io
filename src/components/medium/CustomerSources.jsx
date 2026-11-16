// Medium → Sources: what customers tell us (PFM Surveys, synced daily) and who's buying (OuterSignal's weekly email).
// Tomer, 16 Nov 2026 — both feed the briefs; a brief that uses them shows the numbers.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, KeyRound, ChevronDown, ClipboardPaste, TrendingUp, TrendingDown } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { relTime } from './util';

export function SurveysCard({ isAdmin, notify }) {
  const [st, setSt] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const load = useCallback(async () => { try { setSt(await mediumApi.surveys()); } catch (e) { notify(e.message, true); } }, [notify]);
  useEffect(() => { load(); }, [load]);
  const connect = async (e) => {
    e.preventDefault();
    setBusy('key');
    try { const r = await mediumApi.surveysKey(key); setKey(''); notify(`Connected — ${r.surveys ?? 'the'} surveys on ${r.sites?.join(', ') || 'your site'}. Reading the answers now (a few minutes)`); setTimeout(load, 4000); } catch (er) { notify(er.message, true); } finally { setBusy(null); }
  };
  const sync = async () => { setBusy('sync'); try { await mediumApi.surveysSync(); notify('Reading the newest answers — a few minutes'); setTimeout(load, 8000); } catch (e) { notify(e.message, true); } finally { setBusy(null); } };
  const surveys = (st?.surveys || []);
  const withAnswers = surveys.filter(s => s.responses >= 15);
  const shown = all ? withAnswers : withAnswers.slice(0, 8);
  const answers = surveys.reduce((a, s) => a + (s.responses || 0), 0);
  return (
    <div className="trk-glass rounded-3xl p-6">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="md-h2">📊 What customers tell us — on-site surveys</h3>
          <p className="md-sub mt-1 max-w-[700px]">The answers from PFM Surveys, read every morning. Medium uses them to pick the pain point, the angle and the customers’ own words — and a brief that leans on a survey shows the numbers (“34% of 1,240 Face Cream visitors said…”), in Medium and on the Monday ticket.</p>
        </div>
        {st?.connected && <button type="button" className="trk-btn !py-1.5" onClick={sync} disabled={busy === 'sync'}>{busy === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Read now</button>}
      </div>
      {!st ? <div className="py-6 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div> : (
        <>
          <div className="mt-3 text-[13px]">
            {st.connected
              ? <span>✅ Connected{st.sites?.length ? ` · ${st.sites.join(', ')}` : ''}{st.synced_at ? ` · read ${relTime(st.synced_at)}` : ' · reading for the first time…'}{surveys.length ? ` · ${surveys.length} surveys, ${answers.toLocaleString('en-US')} answers` : ''}</span>
              : <span className="trk-muted">Not connected yet.</span>}
          </div>
          {isAdmin && (
            <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={connect}>
              <KeyRound size={14} className="trk-dim" />
              <input type="password" autoComplete="off" className="trk-input !py-1.5 !w-[340px] max-w-full" value={key} onChange={(e) => setKey(e.target.value)}
                placeholder={st.connected ? 'Paste a new key to replace it' : 'Paste the API key (pfm_sk_live_…)'} aria-label="PFM Surveys API key" />
              <button type="submit" className="trk-btn primary !py-1.5" disabled={!key.trim() || busy === 'key'}>{busy === 'key' ? <Loader2 size={13} className="animate-spin" /> : null} Test &amp; connect</button>
              <span className="text-[12px] trk-dim">Read-only (sites, surveys, responses). Stored sealed on the server — never shown again.</span>
            </form>
          )}
          {shown.length > 0 && (
            <div className="mt-4 grid gap-1.5">
              {shown.map(s => (
                <div key={s.id} className="rounded-xl" style={{ background: 'var(--trk-glass)' }}>
                  <button type="button" className="w-full text-left px-3.5 py-2.5 flex items-center gap-3" onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold truncate">{s.name}</span>
                      <span className="block text-[12px] trk-dim">{s.product || 'General'} · {s.responses.toLocaleString('en-US')} answers{s.last_answer_at ? ` · latest ${relTime(s.last_answer_at)}` : ''}{s.active ? ' · running' : ''}</span>
                    </span>
                    {s.top?.[0]?.bars?.[0] && <span className="hidden md:block text-[12.5px] trk-muted max-w-[300px] truncate">Top: {s.top[0].bars[0].label} <b>{Math.round(s.top[0].bars[0].pct)}%</b></span>}
                    <ChevronDown size={14} className={`trk-dim flex-none ${open === s.id ? 'rotate-180' : ''}`} />
                  </button>
                  {open === s.id && (
                    <div className="px-3.5 pb-3 grid gap-3">
                      {(s.top || []).map((q, qi) => (
                        <div key={qi}>
                          <div className="text-[12.5px] font-semibold">“{q.text}” <span className="trk-dim font-normal">· {q.total} answers</span></div>
                          {q.bars?.map((b, bi) => (
                            <div key={bi} className="mt-1 grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2 text-[12px]">
                              <div className="relative h-5 rounded overflow-hidden" style={{ background: 'rgba(127,127,127,.12)' }}>
                                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(2, Math.min(100, b.pct))}%`, background: 'rgba(74,85,255,.35)' }} />
                                <span className="relative px-2 leading-5 truncate block">{b.label}</span>
                              </div>
                              <span className="text-right tabular-nums">{Math.round(b.pct)}%</span>
                            </div>
                          ))}
                          {q.verbatims?.map((v, vi) => <div key={vi} className="mt-1 text-[12.5px] italic trk-muted">“{v.text}”</div>)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {withAnswers.length > 8 && <button type="button" className="text-[12.5px] font-semibold trk-muted hover:underline justify-self-start mt-1" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${withAnswers.length}`}</button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BuyerSignalCard({ notify }) {
  const [weeks, setWeeks] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setWeeks((await mediumApi.buyerSignal()).weeks); } catch (e) { notify(e.message, true); } }, [notify]);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const r = await mediumApi.addBuyerSignal(text); setText(''); notify(`Got it — ${r.week.personas?.length || 0} personas${r.week.trending?.length ? `, ${r.week.trending.length} trending` : ''}. Medium uses it from the next brief`); load(); } catch (er) { notify(er.message, true); } finally { setBusy(false); }
  };
  const w = weeks?.[0];
  const d = w?.data;
  return (
    <div className="trk-glass rounded-3xl p-6">
      <h3 className="md-h2">👥 Who’s buying — OuterSignal</h3>
      <p className="md-sub mt-1 max-w-[700px]">Paste OuterSignal’s weekly “The Signal” email. Medium keeps the totals only — the personas’ share of buyers and how they moved, what’s trending with a persona, the notable-buyer mix (never the names) — and uses them to choose the persona, the talent and the angle.</p>
      {d && (
        <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--trk-glass)' }}>
          <div className="text-[12px] uppercase tracking-wide trk-dim">{w.week_from && w.week_to ? `Week ${String(w.week_from).slice(5, 10)} → ${String(w.week_to).slice(5, 10)}` : 'Latest week'}{w.added_by ? ` · added by ${w.added_by}` : ''}</div>
          {d.headline && <div className="text-[14px] font-semibold mt-1">{d.headline}</div>}
          <div className="mt-3 grid gap-1">
            {(d.personas || []).map(p => (
              <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_56px_72px] items-center gap-2 text-[12.5px]">
                <div className="relative h-6 rounded-md overflow-hidden" style={{ background: 'rgba(127,127,127,.12)' }}>
                  <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.max(2, Math.min(100, p.share_pct * 2))}%`, background: 'rgba(74,85,255,.3)' }} />
                  <span className="relative px-2 leading-6 truncate block">{p.name}</span>
                </div>
                <span className="text-right tabular-nums font-semibold">{Math.round(p.share_pct * 10) / 10}%</span>
                <span className="text-right tabular-nums text-[12px] inline-flex items-center justify-end gap-0.5" style={{ color: p.change_pts > 0 ? 'var(--trk-green)' : p.change_pts < 0 ? 'var(--trk-red, #e2445c)' : undefined }}>
                  {p.change_pts > 0 ? <TrendingUp size={12} /> : p.change_pts < 0 ? <TrendingDown size={12} /> : null}{p.change_pts != null ? `${p.change_pts > 0 ? '+' : ''}${p.change_pts} pts` : ''}
                </span>
              </div>
            ))}
          </div>
          {(d.trending || []).map((t, i) => <div key={i} className="mt-2 text-[13px]">🔥 <b>{t.product}</b>{t.persona ? ` with ${t.persona}` : ''}{t.share_pct != null ? ` — ${t.share_pct}% of what they bought` : ''}{t.prior_share_pct != null ? `, up from ${t.prior_share_pct}%` : ''}</div>)}
          {d.notable_total ? <div className="mt-2 text-[12.5px] trk-muted">{d.notable_total} notable buyers{d.types?.length ? ` — ${d.types.map(x => `${x.type} ${x.count}`).join(' · ')}` : ''}</div> : null}
        </div>
      )}
      <form className="mt-4 grid gap-2" onSubmit={add}>
        <textarea className="trk-input min-h-[90px] text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Open the email in Gmail → select all (⌘A) → copy → paste here" aria-label="OuterSignal email" />
        <button type="submit" className="trk-btn primary !py-1.5 justify-self-start" disabled={busy || text.trim().length < 200}>{busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />} Read this week’s email</button>
      </form>
      {weeks?.length > 1 && <div className="mt-3 text-[12px] trk-dim">{weeks.length} weeks kept · Medium uses the newest one (up to 3 weeks old)</div>}
    </div>
  );
}
