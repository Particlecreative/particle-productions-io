import { useCallback, useEffect, useState } from 'react';
import { X, ExternalLink, RotateCcw, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import { dateTime, mmss, statusMeta, TRIGGERS, ISSUE_TYPES, money } from './util';

/** One check: what the Captain found (with frames), what he read and heard, and the team's feedback buttons. */
export default function CheckDrawer({ id, onClose, notify, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setData(await captainApi.check1(id)); } catch (e) { notify(e.message, true); onClose(); }
  }, [id, notify, onClose]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => {
    if (!data || !['running', 'queued'].includes(data.check.status)) return undefined;
    const t = setInterval(load, 5000); return () => clearInterval(t);
  }, [data, load]);

  const feedback = async (issue, fb) => {
    setBusy(`fb${issue.id}`);
    try {
      const next = issue.feedback === fb ? '' : fb;
      const r = await captainApi.feedback(issue.id, next);
      if (r.learned) notify('Thanks — added to the Brain’s review queue');
      await load(); onChanged?.();
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const rerun = async () => {
    setBusy('rerun');
    try { const r = await captainApi.rerun(id); notify(r.queued ? 'Re-run queued — it will appear in Activity' : 'A re-run is already waiting'); onChanged?.(); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };

  const c = data?.check;
  const s = c ? statusMeta(c) : null;
  const raw = c?.raw || {};
  const frameioUrl = c?.asset?.view_url || null;
  const figmaUrl = c?.discipline === 'design' && c?.asset?.file_key ? `https://www.figma.com/design/${c.asset.file_key}/?node-id=${String(c.asset.node_id || '').replace(':', '-')}` : null;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose} style={{ background: 'rgba(3,11,46,.55)' }}>
      <aside className="trk cc trk-drawer h-full w-full max-w-[760px] overflow-y-auto trk-scroll" onClick={e => e.stopPropagation()} role="dialog" aria-label="Check details">
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="trk-eyebrow">{c?.discipline === 'design' ? '🎨 Design' : '🎬 Video'} check</div>
              <h2 className="trk-title text-[40px] mt-2 break-words">{c ? (c.item_name || c.asset?.name || 'Untitled') : 'Loading…'}</h2>
              {c && <div className="mt-2 text-sm trk-muted">{[c.deliverable, c.round ? `round ${c.round}` : null, c.person, c.product].filter(Boolean).join(' · ')}</div>}
            </div>
            <button type="button" className="trk-btn !p-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>

          {!c && <div className="mt-10 text-center trk-muted"><Loader2 className="inline animate-spin" size={18} /></div>}
          {c && (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className={`trk-chip ${s.tone}`}>{s.icon} {s.label}</span>
                {c.trigger && <span className="trk-chip gray">{TRIGGERS[c.trigger] || c.trigger}</span>}
                {c.scope_reason && <span className="trk-chip gray" title="Why this was in scope">{c.scope_reason}</span>}
                {c.model && <span className="trk-chip gray">{c.model}</span>}
                {c.duration_ms ? <span className="trk-chip gray">{Math.round(c.duration_ms / 1000)}s</span> : null}
                {c.cost_usd != null && <span className="trk-chip gray" title="Estimated AI cost">{money(Number(c.cost_usd))}</span>}
                {c.posting && <span className={`trk-chip ${c.posted_at ? 'green' : 'gray'}`}>{c.posted_at ? 'Comments posted' : `Not posted (${c.posting === 'test' ? 'not a test file' : c.posting})`}</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {frameioUrl && <a className="trk-btn" href={frameioUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open in Frame.io</a>}
                {figmaUrl && <a className="trk-btn" href={figmaUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open in Figma</a>}
                {c.monday_url && <a className="trk-btn" href={c.monday_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Monday item</a>}
                {<button type="button" className="trk-btn" onClick={rerun} disabled={busy === 'rerun'}>{busy === 'rerun' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Re-run</button>}
              </div>

              {c.thumb_url && <img src={c.thumb_url} alt="" className="mt-5 w-full max-h-[300px] object-contain rounded-2xl" style={{ background: 'rgba(0,0,0,.25)' }} />}
              {c.status === 'skipped' && <p className="mt-5 text-sm">Skipped: <b>{c.skip_reason}</b></p>}
              {c.status === 'error' && <p className="mt-5 text-sm" style={{ color: 'var(--trk-red)' }}>{c.error}</p>}

              {data.issues.length > 0 && (
                <div className="trk-section">
                  <div className="trk-label mb-1">What the Captain found</div>
                  {data.issues.map(i => (
                    <div key={i.id} className="cc-issue">
                      <div>
                        {c.discipline === 'video'
                          ? <><div className="cc-time">{mmss(i.start_s)}</div><div className="text-[11px] trk-dim">frame {i.frame}</div></>
                          : <div className="text-[11px] trk-dim">layer {i.node_id}</div>}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[15px] break-words">
                          {i.found && <span className="cc-strike">{i.found}</span>}{i.fix && <> → <span className="cc-fix">{i.fix}</span></>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 items-center">
                          <span className={`trk-chip ${i.severity === 'check' ? 'amber' : 'red'}`}>{i.severity === 'check' ? 'Please check' : 'Must fix'}</span>
                          <span className="trk-chip gray">{ISSUE_TYPES[i.type] || i.type}</span>
                          {i.comment_id && <span className="trk-chip green">commented</span>}
                          {i.note && <span className="text-[12px] trk-muted">{i.note}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button type="button" className="trk-btn !px-2.5 !py-1.5" title="Good catch" aria-pressed={i.feedback === 'good_catch'} disabled={busy === `fb${i.id}`}
                          style={i.feedback === 'good_catch' ? { background: 'var(--trk-green)', color: '#03231a', borderColor: 'transparent' } : undefined} onClick={() => feedback(i, 'good_catch')}><ThumbsUp size={13} /></button>
                        <button type="button" className="trk-btn !px-2.5 !py-1.5" title="Not a typo — teach the Captain" aria-pressed={i.feedback === 'not_a_typo'} disabled={busy === `fb${i.id}`}
                          style={i.feedback === 'not_a_typo' ? { background: 'var(--trk-red)', color: '#fff', borderColor: 'transparent' } : undefined} onClick={() => feedback(i, 'not_a_typo')}><ThumbsDown size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(raw.on_screen_text?.length > 0 || raw.voiceover?.length > 0) && (
                <div className="trk-section grid md:grid-cols-2 gap-5">
                  {raw.on_screen_text?.length > 0 && (
                    <details open>
                      <summary className="trk-label mb-2">On-screen text ({raw.on_screen_text.length})</summary>
                      <div className="text-[13px] space-y-1">{raw.on_screen_text.map((t, k) => <div key={k}><span className="trk-dim cc-time !text-[11px] mr-2">{mmss(t.start)}</span>{t.text}</div>)}</div>
                    </details>
                  )}
                  {raw.voiceover?.length > 0 && (
                    <details open>
                      <summary className="trk-label mb-2">Voiceover ({raw.voiceover.length})</summary>
                      <div className="text-[13px] space-y-1">{raw.voiceover.map((t, k) => <div key={k}><span className="trk-dim cc-time !text-[11px] mr-2">{mmss(t.start)}</span>{t.text}</div>)}</div>
                    </details>
                  )}
                </div>
              )}

              <div className="trk-section">
                <details>
                  <summary className="trk-label">Raw AI response</summary>
                  <pre className="cc-pre mt-2">{JSON.stringify({ issues: raw.issues, usage: c.usage, asset: c.asset }, null, 2)}</pre>
                </details>
              </div>

              {data.events.length > 0 && (
                <div className="trk-section">
                  <div className="trk-label mb-2">History</div>
                  <div className="space-y-1 text-[13px]">
                    {data.events.map(e => <div key={e.id} className="flex gap-3"><span className="trk-dim w-[120px] shrink-0">{dateTime(e.created_at)}</span><span>{e.message}</span></div>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
