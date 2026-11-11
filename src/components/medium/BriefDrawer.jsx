import { useCallback, useEffect, useState } from 'react';
import { X, Check, Pencil, RotateCcw, Ban, Loader2, ExternalLink, Save, Sparkles } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { BAND, SUB_LABEL, SUB_WEIGHT, MOVE_LABEL, KIND_LABEL, FINDING, LANE_LABEL, Chip, money, readiness, origin, headline } from './util';

const ISSUE_SEV = { must_fix: ['Must fix', 'red'], should_fix: ['Please check', 'amber'], info: ['Note', 'gray'] };
const EDITABLE = [['hook', 'Hook', 2], ['brief', 'Brief', 8], ['script', 'Script', 14], ['copy', 'Copy', 12], ['why', 'Why it should work', 2], ['test', 'How we’ll know', 2]];

/** One brief, the way a strategist reads it: the hook, a verdict, the brief, why — details folded away, actions at hand. */
export default function BriefDrawer({ id, onClose, notify, onChanged, isAdmin, mondayOn }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edit, setEdit] = useState(null);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [tab, setTab] = useState('medium');

  const load = useCallback(async () => {
    try { setData(await mediumApi.brief(id)); } catch (e) { notify(e.message, true); onClose(); }
  }, [id, notify, onClose]);
  useEffect(() => { setData(null); setEdit(null); load(); }, [load]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && !edit && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose, edit]);
  const [improving, setImproving] = useState(null);   // the improve round we're waiting for
  useEffect(() => {
    const waiting = data && (['QUEUED', 'WRITING'].includes(data.brief.status) || (improving && Number(data.brief.versions?.improved?.round || 0) < improving));
    if (!waiting) { if (improving && data && Number(data.brief.versions?.improved?.round || 0) >= improving) { setImproving(null); setTab('improved'); } return undefined; }
    const t = setInterval(load, 4000); return () => clearInterval(t);
  }, [data, load, improving]);

  const b = data?.brief;
  const act = async (key, fn, msg) => {
    setBusy(key);
    try { const r = await fn(); if (msg) notify(typeof msg === 'function' ? msg(r) : msg); await load(); onChanged?.(); return r; }
    catch (e) { notify(e.message, true); return null; } finally { setBusy(null); }
  };
  const approve = () => act('approve', () => mediumApi.approve(b.id, reason || undefined), (r) => `Approved — ${r.monday}`);
  const reject = () => act('reject', () => mediumApi.reject(b.id, reason), 'Rejected — Medium learns from your reason').then(() => setRejecting(false));
  const regenerate = () => act('regen', () => mediumApi.regenerate(b.id, reason || undefined), 'A new version is being written — it will show up in your briefs');
  const saveEdit = () => act('save', () => mediumApi.edit(b.id, { fields: edit }), 'Saved — checked and scored again').then(() => setEdit(null));
  const recheck = () => act('recheck', () => mediumApi.edit(b.id, { recheck: true }), (r) => `Checked again — ${r.preflight?.verdict === 'passed' ? 'Captain is happy' : `${r.preflight?.must_fix ?? '?'} thing(s) to fix`}`);
  const useVersion = (v) => act('version', () => mediumApi.edit(b.id, { version: v }), v === 'mine' ? 'Your version is now the brief' : v === 'improved' ? 'The improved version is now the brief' : 'Medium’s version is now the brief').then(() => setTab('medium'));
  const improve = () => act('improve', () => mediumApi.improve(b.id), 'Improving — Medium applies its own suggestions, then checks again (about a minute)').then(r => { if (r) setImproving(Number(b.versions?.improved?.round || 0) + 1); });
  const submit = () => act('submit', () => mediumApi.submit(b.id), (r) => r.monday);
  const staticVersion = () => act('static', () => mediumApi.staticVersion(b.id), 'A static version is being written — it will show up in your briefs');

  const VERSION_LABEL = { medium: b?.source === 'freeform' ? 'Medium’s version' : 'Current', mine: 'Your idea, as you wrote it', improved: `Improved${b?.versions?.improved?.round > 1 ? ` (round ${b.versions.improved.round})` : ''}` };
  const view = b?.versions && tab !== 'medium' && b.versions[tab] ? { ...b, ...b.versions[tab], score: b.versions[tab].score, preflight: b.versions[tab].preflight } : b;
  const f = view?.fields || {};
  const locked = b && (Number(b.preflight?.must_fix) > 0 || ['blocked', 'below_bar'].includes(b.score?.band) || !b.preflight || b.preflight?.verdict === 'error');
  const r = b ? readiness(view) : null;
  const canImprove = b && tab === 'medium' && b.status === 'PENDING_REVIEW' && !improving && (b.score?.fixes || []).length > 0 && (b.versions?.improved ? b.versions.improved.round < 3 && b.versions.improved.gain >= 3 : true);
  const mustFix = (view?.preflight?.issues || []).filter(i => i.severity === 'must_fix');
  const blocks = (view?.score?.guardrails?.violations || []).map(v => (typeof v === 'string' ? { text: v, severity: 'block' } : v)).filter(v => v.severity !== 'warn');
  const pending = b?.status === 'PENDING_REVIEW' && !edit;
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={() => !edit && onClose()} style={{ background: 'rgba(3,11,46,.55)' }}>
      <aside className="trk cc md trk-drawer h-full w-full max-w-[880px] overflow-y-auto trk-scroll" onClick={e => e.stopPropagation()} role="dialog" aria-label="Brief">
        <div className="p-6 md:p-8 min-h-full flex flex-col">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] trk-muted">{b ? [b.format === 'design' ? '🎨 Static' : '🎬 Video', b.product, b.lane && b.lane !== 'Particle' ? LANE_LABEL[b.lane] || b.lane : null, MOVE_LABEL[b.move], origin(b)].filter(Boolean).join(' · ') : '🔮 Medium'}</div>
              <h2 className="md-hookline mt-2 break-words">{b ? headline({ hook: f.hook, ticket_name: view.ticket_name }) || 'Writing…' : 'Loading…'}</h2>
              {b && view.ticket_name && <div className="mt-1.5 text-[12.5px] trk-dim break-words">Monday ticket: {view.ticket_name}</div>}
            </div>
            <button type="button" className="trk-btn !p-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          {!b && <div className="mt-10 text-center trk-muted"><Loader2 className="inline animate-spin" size={18} /></div>}
          {b && (
            <>
              {r && !['QUEUED', 'WRITING'].includes(b.status) && (
                <div className={`md-verdict ${r.tone} mt-5`}>
                  <span className="md-emoji" aria-hidden>{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15.5px]">{r.label}</div>
                    <div className="text-[13.5px] trk-muted mt-0.5">{b.status === 'DROPPED' || b.status === 'ERROR' ? b.error || r.line : r.line}</div>
                    {r.key === 'fix' && (mustFix.length > 0 || blocks.length > 0) && (
                      <ul className="mt-2 space-y-1 text-[13.5px]">
                        {mustFix.slice(0, 4).map((i, k) => <li key={`m${k}`}>• <b>{i.found}</b>{i.fix ? <> → {i.fix}</> : null}</li>)}
                        {blocks.slice(0, 3).map((v, k) => <li key={`b${k}`}>• {v.text}</li>)}
                      </ul>
                    )}
                    {canImprove && ['almost', 'work'].includes(r.key) && <button type="button" className="trk-btn mt-3 !py-1.5" disabled={!!busy} onClick={improve}>{busy === 'improve' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Improve it for me</button>}
                  </div>
                  {view.score?.total != null && <div className="text-right flex-none"><div className="cc-stat !text-[34px]">{view.score.total}</div><div className="text-[11px] trk-dim">score</div></div>}
                </div>
              )}
              {['QUEUED', 'WRITING'].includes(b.status) && <div className="md-verdict amber mt-5"><span className="md-emoji" aria-hidden>✍️</span><div><div className="font-semibold">Writing…</div><div className="text-[13.5px] trk-muted mt-0.5">Medium is writing it, checking the house style, scoring it and sending it past Captain Caption — about a minute.</div></div></div>}
              {b.review_reason && <p className="mt-3 text-[13.5px] trk-muted">{b.status === 'REJECTED' ? 'Rejected' : 'Note'} by {b.reviewer}: {b.review_reason}</p>}

              {b.versions && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <div className="trk-seg" role="tablist">
                    {['medium', ...Object.keys(b.versions).filter(k => k !== 'medium')].map(k => (
                      <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{VERSION_LABEL[k] || k}</button>
                    ))}
                  </div>
                  {b.status === 'PENDING_REVIEW' && tab !== 'medium' && <button type="button" className="trk-btn !py-1.5" disabled={!!busy} onClick={() => useVersion(tab)}>{busy === 'version' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Use this version</button>}
                  {tab === 'improved' && b.versions.improved?.gain != null && <span className="text-[12.5px] trk-muted">{b.versions.improved.gain >= 0 ? '+' : ''}{b.versions.improved.gain} points</span>}
                </div>
              )}
              {b.evidence?.changed && <p className="mt-3 text-[14px]"><b>What Medium changed:</b> {b.evidence.changed}</p>}
              {b.evidence?.question && <p className="mt-2 text-[14px]" style={{ color: 'var(--trk-amber)' }}><b>Medium asks you:</b> {b.evidence.question}</p>}
              {improving && <p className="mt-4 text-[13.5px] trk-muted"><Loader2 size={13} className="inline animate-spin mr-1" /> Improving — the new version shows up as its own tab when it’s checked.</p>}

              {/* the brief */}
              <section className="mt-7">
                <div className="flex items-center gap-2">
                  <h3 className="md-h2">The brief</h3>
                  {pending && tab === 'medium' && (
                    <span className="ml-auto flex gap-1.5">
                      <button type="button" className="trk-btn !py-1 !px-2.5" disabled={!!busy} onClick={recheck} title="Run Captain Caption and the score again (about 2¢)">{busy === 'recheck' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Check again</button>
                      <button type="button" className="trk-btn !py-1 !px-2.5" onClick={() => setEdit({ ...b.fields })}><Pencil size={12} /> Edit</button>
                    </span>
                  )}
                </div>
                {edit ? (
                  <div className="mt-4 grid gap-3">
                    {EDITABLE.filter(([k]) => (k !== 'script' || b.format === 'video') && (k !== 'copy' || b.format === 'design')).map(([k, label, rows]) => (
                      <label key={k} className="grid gap-1"><span className="md-doc-label">{label}</span>
                        <textarea className="trk-input !text-[14px] leading-relaxed" rows={rows} value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                      </label>
                    ))}
                    <label className="grid gap-1"><span className="md-doc-label">Don’ts (one per line)</span>
                      <textarea className="trk-input !text-[14px]" rows={3} value={(edit.donts || []).join('\n')} onChange={(e) => setEdit({ ...edit, donts: e.target.value.split('\n') })} />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" className="trk-btn primary" disabled={busy === 'save'} onClick={saveEdit}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save & check again</button>
                      <button type="button" className="trk-btn" onClick={() => setEdit(null)}>Cancel</button>
                    </div>
                    <p className="text-[12.5px] trk-dim">Medium remembers your edits — the ones you make again and again become part of how it writes.</p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-5">
                    {String(f.brief || '').trim() && <Field label="Brief" value={[String(f.brief || ''), (f.donts || []).filter(Boolean).length && `Don’ts:\n${f.donts.filter(Boolean).map(d => `– ${d}`).join('\n')}`].filter(Boolean).join('\n\n')} pre />}
                    {f.script && <Field label="Script" value={f.script} pre />}
                    {f.copy && <Field label="Copy — V1 / V2 / V3" value={f.copy} pre />}
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      {(f.sizes || []).length > 0 && <Chip>{f.sizes.map(x => x.replace('x', '×')).join(' · ')}</Chip>}
                      {f.duration ? <Chip>{f.duration}s</Chip> : null}
                      {f.video_type && <Chip>{f.video_type}</Chip>}
                      {f.template && <Chip>Template: {f.template}</Chip>}
                      {f.persona && <Chip>Talent: {f.persona}</Chip>}
                      {f.donor && <Chip>Structure from {f.donor}</Chip>}
                    </div>
                    {view.style && !view.style.passed && <div className="text-[13px]" style={{ color: 'var(--trk-red)' }}>House style: {view.style.failures.join(' · ')}</div>}
                  </div>
                )}
              </section>

              {/* why */}
              {(f.why || f.test || b.evidence?.headline || b.evidence?.transfer || b.evidence?.findings?.length > 0) && (
                <section className="mt-8">
                  <h3 className="md-h2">Why it should work</h3>
                  {f.why && <p className="mt-2 text-[15px] leading-relaxed">{f.why}</p>}
                  {f.test && <p className="mt-2 text-[14px] trk-muted"><b style={{ color: 'var(--trk-text)' }}>How we’ll know:</b> {f.test}</p>}
                  {b.evidence?.headline && <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--trk-glass-hi)' }}><div className="text-[12.5px] font-semibold trk-muted">🪝 The opening line won as a static headline</div><div className="text-[16px] font-semibold mt-1">“{b.evidence.headline.used}”</div><div className="text-[12.5px] trk-dim mt-1">{b.evidence.headline.from === 'the ad image' ? 'Read from the ad itself' : b.evidence.headline.edited ? b.evidence.headline.from : 'From its Monday brief'}{b.evidence.headline.brief ? ` · the brief said “${b.evidence.headline.brief}”, the ad ran the line above` : ''}</div></div>}
                  {b.evidence?.transfer && <TransferPanel t={b.evidence.transfer} />}
                  {b.evidence?.findings?.length > 0 && (
                    <div className="mt-4 space-y-2 text-[14px]">
                      {b.evidence.findings.map((x, i) => { const [l, t] = FINDING[x.tag] || [x.tag, 'gray']; return <div key={i} className="flex flex-wrap items-baseline gap-2"><Chip tone={t}>{l}</Chip><span>{x.text}</span></div>; })}
                    </div>
                  )}
                </section>
              )}

              {/* more, after approval */}
              {!edit && (b.status === 'APPROVED' || (b.status === 'SUBMITTED' && b.monday_item_id) || (b.format === 'video' && ['PENDING_REVIEW', 'APPROVED', 'SUBMITTED'].includes(b.status))) && (
                <section className="mt-8 flex flex-wrap gap-2">
                  {b.status === 'APPROVED' && <button type="button" className="trk-btn primary" disabled={!!busy} onClick={submit}>{busy === 'submit' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />} Create the Monday ticket</button>}
                  {b.status === 'SUBMITTED' && b.monday_item_id && <a className="trk-btn primary" href={`https://particle-for-men.monday.com/boards/${b.format === 'design' ? '8036329818' : '5433027071'}/pulses/${b.monday_item_id}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Open it on Monday</a>}
                  {b.format === 'video' && ['PENDING_REVIEW', 'APPROVED', 'SUBMITTED'].includes(b.status) && <button type="button" className="trk-btn" disabled={!!busy} onClick={staticVersion} title="Same idea, written as a static set (about 10¢)">{busy === 'static' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Make a static version too</button>}
                </section>
              )}

              {/* the details, folded */}
              <div className="mt-8">
                {view.score && (
                  <details className="md-more">
                    <summary>📊 Score breakdown <span className="md-more-hint">{view.score.total ?? 'blocked'} · {(BAND[view.score.band] || [''])[0]}</span></summary>
                    <div className="pb-4"><ScorePanel s={view.score} /></div>
                  </details>
                )}
                {view.preflight && (
                  <details className="md-more" open={Number(view.preflight.must_fix) > 0}>
                    <summary>🔎 Captain Caption’s line-by-line check <span className="md-more-hint">{view.preflight.verdict === 'passed' ? 'passed' : view.preflight.verdict === 'issues' ? `${view.preflight.must_fix} to fix` : 'not checked'}</span></summary>
                    <div className="pb-4"><PreflightPanel p={view.preflight} /></div>
                  </details>
                )}
                <details className="md-more">
                  <summary>📚 Evidence & the briefs it learned from</summary>
                  <div className="pb-4 space-y-1.5 text-[13.5px]">
                    {(view.evidence?.items || b.evidence?.items || []).map((e, i) => <div key={i}>• {e.claim} <span className="trk-dim">({e.source})</span></div>)}
                    {b.evidence?.afterlife && !b.evidence.afterlife.available && b.evidence.afterlife.reason && <div className="trk-dim">AfterLife: {b.evidence.afterlife.reason}</div>}
                    {data.examples?.length > 0 && <div className="pt-2"><span className="trk-dim">Written in the style of:</span> {data.examples.map(e => <a key={e.id} className="underline-offset-2 hover:underline mr-3" href={`https://particle-for-men.monday.com/boards/${e.board_id || ''}/pulses/${e.item_id}`} target="_blank" rel="noopener noreferrer">{e.name} <ExternalLink size={11} className="inline" /></a>)}</div>}
                    {view.kind && <div className="trk-dim pt-1">Kind of job: {KIND_LABEL[view.kind] || view.kind}{b.cost_usd != null ? ` · AI cost ${money(Number(b.cost_usd))}` : ''}{view.style?.passed ? ` · house style ✓${view.style.rewrites ? ' (after one rewrite)' : ''}` : ''}</div>}
                  </div>
                </details>
              </div>

              {/* actions */}
              {pending && (
                <div className="md-actionbar mt-auto">
                  {(locked || rejecting) && (
                    <label className="grid gap-1 mb-3"><span className="text-[12.5px] font-semibold trk-muted">{rejecting ? 'What’s wrong with it? Medium learns from this.' : isAdmin ? 'It has open issues — approve anyway? Say why (it’s logged).' : 'Fix the issues above before approving — or ask an admin.'}</span>
                      <input className="trk-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={rejecting ? 'e.g. Too close to the live Face Cream ad' : 'e.g. Legal approved the claim'} disabled={locked && !isAdmin && !rejecting} />
                    </label>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {!rejecting && <button type="button" className="trk-btn primary !px-5" disabled={!!busy || (locked && (!isAdmin || !reason.trim()))} onClick={approve}>{busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve</button>}
                    {!rejecting && canImprove && <button type="button" className="trk-btn" disabled={!!busy} onClick={improve}>{busy === 'improve' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Improve</button>}
                    {!rejecting && <button type="button" className="trk-btn" disabled={!!busy} onClick={regenerate} title="Write a different version from scratch">{busy === 'regen' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Try another</button>}
                    {rejecting
                      ? <><button type="button" className="trk-btn" disabled={!!busy || !reason.trim()} onClick={reject}>{busy === 'reject' ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Reject</button><button type="button" className="trk-btn" onClick={() => setRejecting(false)}>Cancel</button></>
                      : <button type="button" className="trk-btn ml-auto" disabled={!!busy} onClick={() => setRejecting(true)}><Ban size={13} /> Reject</button>}
                  </div>
                  <p className="mt-2 text-[12px] trk-dim">{mondayOn ? 'Approving creates the ticket in Monday’s Form Requests.' : 'Approving keeps the brief in CP — Monday is switched off.'}</p>
                </div>
              )}
              {b.status === 'DROPPED' && !edit && (
                <div className="md-actionbar mt-auto flex flex-wrap gap-2">
                  <button type="button" className="trk-btn" onClick={() => setEdit({ ...b.fields })}><Pencil size={13} /> Fix it by hand</button>
                  <button type="button" className="trk-btn primary" disabled={!!busy} onClick={regenerate}><RotateCcw size={13} /> Write it again</button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, pre }) {
  if (!value) return null;
  return (
    <div>
      <div className="md-doc-label">{label}</div>
      <div className={pre ? 'md-doc' : 'text-[15px] leading-relaxed break-words'}>{value}</div>
    </div>
  );
}

function TransferPanel({ t }) {
  const OK = { yes: ['✓', 'var(--trk-green)'], no: ['✗', 'var(--trk-red)'], unknown: ['?', 'var(--trk-amber)'] };
  return (
    <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--trk-glass-hi)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[12.5px] font-semibold trk-muted">➡️ Moving a winner</div>
        <Chip tone={t.verdict === 'go' ? 'green' : t.verdict === 'block' ? 'red' : 'amber'}>{t.verdict === 'go' ? 'Go' : t.verdict === 'block' ? 'Blocked' : 'Promise rewritten'}</Chip>
        <span className="text-[12.5px] trk-muted">{t.source?.product || t.source?.lane || t.source?.format} → {t.target?.product || t.target?.lane || t.target?.format}{t.edge ? ` · map score ${t.edge.score}` : ''}</span>
      </div>
      {t.hypothesis && <p className="mt-1 text-[13.5px]">{t.hypothesis}</p>}
      <div className="mt-2 grid md:grid-cols-2 gap-4 text-[13px]">
        <div><div className="text-[11px] uppercase tracking-wide trk-dim mb-1">Keeps</div><ul className="space-y-0.5">{(t.keep || []).map((k, i) => <li key={i}>• {k}</li>)}</ul></div>
        <div><div className="text-[11px] uppercase tracking-wide trk-dim mb-1">Swaps</div><ul className="space-y-0.5">{(t.swap || []).map((s, i) => <li key={i}><span className="cc-strike">{s.from}</span> → {s.to}</li>)}</ul></div>
      </div>
      <div className="mt-2 space-y-0.5 text-[12.5px]">
        {(t.prerequisites || []).map((p, i) => <div key={i}><span style={{ color: (OK[p.ok] || OK.unknown)[1] }}>{(OK[p.ok] || OK.unknown)[0]}</span> {p.check} <span className="trk-dim">— {p.note}</span></div>)}
        {t.proof_check && <div className="trk-muted">Proof: needs {t.proof_check.needs} · {t.proof_check.have ? 'available' : `not available — ${t.proof_check.fallback}`}</div>}
      </div>
    </div>
  );
}

function ScorePanel({ s }) {
  return (
    <div>
      <p className="text-[12.5px] trk-dim">Eight checks, weighted. Not calibrated yet — the weights get fitted to real AfterLife results as briefs ship.</p>
      {(s.guardrails?.violations || []).length > 0 && (
        <ul className="mt-2 text-[13px] space-y-0.5">
          {s.guardrails.violations.map((v, i) => { const o = typeof v === 'string' ? { text: v, severity: 'block' } : v; return (
            <li key={i} style={{ color: o.severity === 'warn' ? 'var(--trk-amber)' : 'var(--trk-red)' }}>{o.severity === 'warn' ? '⚠️ Check' : '⛔ Blocks approval'}: {o.text}</li>
          ); })}
        </ul>
      )}
      <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {Object.entries(SUB_LABEL).map(([k, l]) => {
          const v = s.subs?.[k];
          const n = typeof v?.score === 'number' ? Math.max(0, Math.min(100, v.score)) : null;
          return (
            <div key={k} className="text-[13px]" title={v?.why || ''}>
              <div className="flex justify-between"><span>{l} <span className="trk-dim">· {SUB_WEIGHT[k]}</span></span><span className="tabular-nums">{n == null ? <span className="trk-dim">{k === 'evidence' ? '[AfterLife]' : k === 'pattern_fit' ? '[Upspring]' : '—'}</span> : n}</span></div>
              <div className="h-[6px] mt-1 rounded-full" style={{ background: 'var(--trk-glass-hi)' }}>{n != null && <div className="h-full rounded-full" style={{ width: `${n}%`, background: 'var(--trk-violet)' }} />}</div>
              {v?.why && <div className="text-[11.5px] trk-dim mt-0.5">{v.why}</div>}
            </div>
          );
        })}
      </div>
      {s.critics && (
        <div className="mt-4 grid md:grid-cols-3 gap-3 text-[13px]">
          {[['buyer', 'The skeptical buyer'], ['media_buyer', 'The media buyer'], ['maker', 'The editor / designer']].map(([k, l]) => (
            <div key={k} className="rounded-xl p-3" style={{ background: 'var(--trk-glass-hi)' }}><div className="font-semibold mb-1">{l}</div><div className="trk-muted">{s.critics[k]}</div></div>
          ))}
        </div>
      )}
      {s.fixes?.length > 0 && (
        <div className="mt-3 text-[13px]">
          <div className="font-semibold">What would make it stronger <span className="font-normal trk-dim">— “Improve” applies these as a new version</span></div>
          <ul className="mt-1 space-y-0.5">{s.fixes.map((x, i) => <li key={i}>+{Math.round(x.gain)} · {x.fix} <span className="trk-dim">({x.evidence})</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function PreflightPanel({ p }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {p.verdict === 'passed' && <Chip tone="green">✅ Passed</Chip>}
        {p.verdict === 'issues' && <Chip tone="red">🔴 {p.must_fix} must-fix — approval locked</Chip>}
        {p.verdict === 'error' && <Chip tone="red">Couldn’t check: {p.error}</Chip>}
        {p.check_id && <a className="text-[12px] underline-offset-2 hover:underline trk-muted ml-auto" href={`/captain?tab=activity&check=${p.check_id}`}>Open in Captain HQ <ExternalLink size={11} className="inline" /></a>}
      </div>
      <p className="mt-1 text-[12.5px] trk-dim">The same proofreader that checks finished assets in Frame.io and Figma. Once approved, these lines are what the delivered asset gets checked against.</p>
      {(p.issues || []).length > 0 && (
        <div className="mt-2 space-y-1.5 text-[13px]">
          {p.issues.map((i, k) => { const [l, t] = ISSUE_SEV[i.severity] || ISSUE_SEV.must_fix; return <div key={k} className="flex flex-wrap items-baseline gap-2"><Chip tone={t}>{l}</Chip><span><b>{i.found}</b>{i.fix ? <> → {i.fix}</> : null}</span><span className="trk-dim">{i.rule}</span></div>; })}
        </div>
      )}
      {(p.notes || []).length > 0 && <div className="mt-2 text-[12px] trk-dim">{p.notes.join(' · ')}</div>}
    </div>
  );
}
