import { useCallback, useEffect, useState } from 'react';
import { X, Check, Pencil, RotateCcw, Ban, Loader2, ExternalLink, Save } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { STATUS, BAND, SUB_LABEL, SUB_WEIGHT, MOVE_LABEL, KIND_LABEL, FINDING, LANE_LABEL, Chip, money } from './util';

const ISSUE_SEV = { must_fix: ['Must fix', 'red'], should_fix: ['Please check', 'amber'], info: ['Note', 'gray'] };
const EDITABLE = [['hook', 'Hook', 2], ['brief', 'Brief', 8], ['script', 'Script', 14], ['copy', 'Copy', 12], ['why', 'Why', 2], ['test', 'Test', 2]];

/** One brief exactly as it will be created on Monday — score, critics, Captain pre-flight, evidence — and the review buttons. */
export default function BriefDrawer({ id, onClose, notify, onChanged, isAdmin }) {
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
  useEffect(() => {
    if (!data || !['QUEUED', 'WRITING'].includes(data.brief.status)) return undefined;
    const t = setInterval(load, 4000); return () => clearInterval(t);
  }, [data, load]);

  const b = data?.brief;
  const act = async (key, fn, msg) => {
    setBusy(key);
    try { const r = await fn(); if (msg) notify(typeof msg === 'function' ? msg(r) : msg); await load(); onChanged?.(); return r; }
    catch (e) { notify(e.message, true); return null; } finally { setBusy(null); }
  };
  const approve = () => act('approve', () => mediumApi.approve(b.id, reason || undefined), (r) => `Approved — ${r.monday}`);
  const reject = () => act('reject', () => mediumApi.reject(b.id, reason), 'Rejected — Medium learns from the reason').then(() => setRejecting(false));
  const regenerate = () => act('regen', () => mediumApi.regenerate(b.id, reason || undefined), 'A new version is being written — it will appear in the queue');
  const saveEdit = () => act('save', () => mediumApi.edit(b.id, { fields: edit }), 'Saved — style check and Captain Caption ran again').then(() => setEdit(null));
  const useVersion = (v) => act('version', () => mediumApi.edit(b.id, { version: v }), v === 'mine' ? 'Your version is now the brief' : 'Medium’s version is now the brief');

  const view = b?.versions && tab === 'mine' ? { ...b, ...b.versions.mine, score: b.versions.mine.score, preflight: b.versions.mine.preflight } : b;
  const f = view?.fields || {};
  const locked = b && (Number(b.preflight?.must_fix) > 0 || ['blocked', 'below_bar'].includes(b.score?.band) || !b.preflight || b.preflight?.verdict === 'error');
  const [statusLabel, statusTone] = STATUS[b?.status] || [b?.status, 'gray'];
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={() => !edit && onClose()} style={{ background: 'rgba(3,11,46,.55)' }}>
      <aside className="trk cc md trk-drawer h-full w-full max-w-[920px] overflow-y-auto trk-scroll" onClick={e => e.stopPropagation()} role="dialog" aria-label="Brief">
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="trk-eyebrow">🔮 {b?.source === 'freeform' ? 'Freeform brief' : 'Medium brief'}{b?.author ? ` · asked by ${b.author}` : ''}</div>
              <h2 className="trk-title text-[34px] mt-2 break-words">{b ? (view.ticket_name || 'Writing…') : 'Loading…'}</h2>
            </div>
            <button type="button" className="trk-btn !p-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          {!b && <div className="mt-10 text-center trk-muted"><Loader2 className="inline animate-spin" size={18} /></div>}
          {b && (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip tone={statusTone}>{statusLabel}</Chip>
                {b.lane && <Chip>{LANE_LABEL[b.lane] || b.lane}</Chip>}
                {b.format && <Chip>{b.format === 'video' ? '🎬 Video' : '🎨 Static'}</Chip>}
                {b.move && <Chip>{MOVE_LABEL[b.move] || b.move}</Chip>}
                {view.kind && <Chip>{KIND_LABEL[view.kind] || view.kind}</Chip>}
                {b.product && <Chip>{b.product}</Chip>}
                {b.cost_usd != null && <Chip title="AI cost to write, score and check it">{money(Number(b.cost_usd))}</Chip>}
              </div>
              {['QUEUED', 'WRITING'].includes(b.status) && <p className="mt-5 text-sm trk-muted"><Loader2 size={13} className="inline animate-spin mr-1" /> Medium is writing, scoring and sending it through Captain Caption — about a minute.</p>}
              {b.error && <p className="mt-4 text-sm" style={{ color: 'var(--trk-red)' }}>{b.error}</p>}
              {b.review_reason && <p className="mt-3 text-sm trk-muted">{b.status === 'REJECTED' ? 'Rejected' : 'Review note'} by {b.reviewer}: {b.review_reason}</p>}

              {b.versions && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <div className="trk-seg" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'medium'} className={tab === 'medium' ? 'on' : ''} onClick={() => setTab('medium')}>Medium’s version{b.versions.medium?.score?.total != null ? ` · ${b.versions.medium.score.total}` : ''}</button>
                    <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Your idea, as written{b.versions.mine?.score?.total != null ? ` · ${b.versions.mine.score.total}` : ''}</button>
                  </div>
                  {b.status === 'PENDING_REVIEW' && <button type="button" className="trk-btn !py-1.5" disabled={!!busy} onClick={() => useVersion(tab)}>{busy === 'version' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Use this version</button>}
                </div>
              )}
              {b.evidence?.changed && <p className="mt-3 text-[13.5px]"><b>What Medium changed:</b> {b.evidence.changed}</p>}
              {b.evidence?.question && <p className="mt-2 text-[13.5px]" style={{ color: 'var(--trk-amber)' }}><b>Medium asks:</b> {b.evidence.question}</p>}

              {view.score && <ScorePanel s={view.score} />}
              {view.preflight && <PreflightPanel p={view.preflight} />}

              <div className="trk-section">
                <div className="flex items-center gap-2"><div className="trk-label">The Monday item</div>
                  {b.status === 'PENDING_REVIEW' && !edit && tab === 'medium' && <button type="button" className="trk-btn !py-1 !px-2.5 ml-auto" onClick={() => setEdit({ ...b.fields })}><Pencil size={12} /> Edit</button>}
                </div>
                {edit ? (
                  <div className="mt-3 grid gap-3">
                    {EDITABLE.filter(([k]) => (k !== 'script' || b.format === 'video') && (k !== 'copy' || b.format === 'design')).map(([k, label, rows]) => (
                      <label key={k} className="grid gap-1"><span className="trk-label">{label}</span>
                        <textarea className="trk-input font-mono !text-[13px]" rows={rows} value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                      </label>
                    ))}
                    <label className="grid gap-1"><span className="trk-label">Don’ts (one per line)</span>
                      <textarea className="trk-input !text-[13px]" rows={3} value={(edit.donts || []).join('\n')} onChange={(e) => setEdit({ ...edit, donts: e.target.value.split('\n') })} />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" className="trk-btn primary" disabled={busy === 'save'} onClick={saveEdit}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save & re-check</button>
                      <button type="button" className="trk-btn" onClick={() => setEdit(null)}>Cancel</button>
                    </div>
                    <p className="text-[12px] trk-dim">Your edit is kept as a diff — recurring edits become part of Medium’s writing instructions.</p>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 text-[14px]">
                    <Field label="Name" value={view.ticket_name} />
                    {f.hook && <Field label="Hook" value={f.hook} />}
                    <Field label="Brief" value={tab === 'medium' ? b.brief_text : [String(f.brief || '').split('\n')[0], f.why && `Why: ${f.why}`, String(f.brief || '').split('\n').slice(1).join('\n'), (f.donts || []).length && `Don'ts:\n${f.donts.map(d => `- ${d}`).join('\n')}`, f.test && `Test: ${f.test}`].filter(Boolean).join('\n\n')} pre />
                    {f.script && <Field label="Script" value={f.script} pre />}
                    {f.copy && <Field label="Copy V1 / V2 / V3" value={f.copy} pre />}
                    <div className="flex flex-wrap gap-2 text-[12px]">
                      {(f.sizes || []).length > 0 && <Chip>Sizes {f.sizes.map(s => s.replace('x', '×')).join(' · ')}</Chip>}
                      {f.duration ? <Chip>{f.duration}s</Chip> : null}
                      {f.video_type && <Chip>{f.video_type}</Chip>}
                      {f.template && <Chip>Template: {f.template}</Chip>}
                      {f.persona && <Chip>Persona: {f.persona}</Chip>}
                      {f.donor && <Chip>Structure from {f.donor}</Chip>}
                    </div>
                  </div>
                )}
                {view.style && !view.style.passed && <div className="mt-3 text-[13px]" style={{ color: 'var(--trk-red)' }}>House-style check: {view.style.failures.join(' · ')}</div>}
                {view.style?.passed && <div className="mt-3 text-[12px] trk-dim">✓ House-style check passed{view.style.rewrites ? ' after one rewrite' : ''}{view.style.edited ? ' · edited by a reviewer' : ''}</div>}
              </div>

              {b.evidence?.findings?.length > 0 && (
                <div className="trk-section">
                  <div className="trk-label mb-2">Crossed with the data</div>
                  {b.evidence.chips && <div className="flex flex-wrap gap-1.5 mb-3">{Object.entries(b.evidence.chips).filter(([, v]) => v && v !== '—').map(([k, v]) => <Chip key={k}>{k}: {v}</Chip>)}</div>}
                  <div className="space-y-1.5 text-[13.5px]">
                    {b.evidence.findings.map((x, i) => { const [l, t] = FINDING[x.tag] || [x.tag, 'gray']; return <div key={i} className="flex flex-wrap items-baseline gap-2"><Chip tone={t}>{l}</Chip><span>{x.text}</span><span className="trk-dim">— {x.source}</span></div>; })}
                  </div>
                </div>
              )}

              <div className="trk-section">
                <details>
                  <summary className="trk-label">Evidence — goes into the Monday update, not the brief</summary>
                  <div className="mt-2 space-y-1 text-[13px]">
                    {(view.evidence?.items || b.evidence?.items || []).map((e, i) => <div key={i}>• {e.claim} <span className="trk-dim">({e.source})</span></div>)}
                    {b.evidence?.afterlife && !b.evidence.afterlife.available && b.evidence.afterlife.reason && <div className="trk-dim">AfterLife: {b.evidence.afterlife.reason} — numbers show as [AfterLife].</div>}
                    {data.examples?.length > 0 && <div className="mt-2"><span className="trk-dim">Written in the style of:</span> {data.examples.map(e => <a key={e.id} className="underline-offset-2 hover:underline mr-2" href={`https://particle-for-men.monday.com/boards/${e.board_id || ''}/pulses/${e.item_id}`} target="_blank" rel="noopener noreferrer">{e.name} <ExternalLink size={11} className="inline" /></a>)}</div>}
                  </div>
                </details>
              </div>

              {b.status === 'PENDING_REVIEW' && !edit && (
                <div className="trk-section">
                  {(locked || rejecting) && (
                    <label className="grid gap-1 mb-3"><span className="trk-label">{rejecting ? 'Why are you rejecting it?' : locked ? (isAdmin ? 'Override reason (approval is locked — logged)' : 'Approval is locked') : 'Note'}</span>
                      <input className="trk-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={rejecting ? 'e.g. The hook is too close to the live Face Cream ad' : 'e.g. Legal approved the claim'} disabled={locked && !isAdmin && !rejecting} />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!rejecting && <button type="button" className="trk-btn primary" disabled={!!busy || (locked && (!isAdmin || !reason.trim()))} onClick={approve}>{busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve</button>}
                    {!rejecting && <button type="button" className="trk-btn" disabled={!!busy} onClick={regenerate}>{busy === 'regen' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Regenerate</button>}
                    {rejecting
                      ? <><button type="button" className="trk-btn" disabled={!!busy || !reason.trim()} onClick={reject}>{busy === 'reject' ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Reject with this reason</button><button type="button" className="trk-btn" onClick={() => setRejecting(false)}>Cancel</button></>
                      : <button type="button" className="trk-btn" disabled={!!busy} onClick={() => setRejecting(true)}><Ban size={13} /> Reject</button>}
                  </div>
                  <p className="mt-2 text-[12px] trk-dim">Shadow mode: approving keeps the brief in CP — nothing is created on Monday yet.</p>
                </div>
              )}
              {b.status === 'DROPPED' && !edit && (
                <div className="trk-section flex flex-wrap gap-2">
                  <button type="button" className="trk-btn" onClick={() => setEdit({ ...b.fields })}><Pencil size={13} /> Fix it by hand</button>
                  <button type="button" className="trk-btn" disabled={!!busy} onClick={regenerate}><RotateCcw size={13} /> Write it again</button>
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
      <div className="text-[11px] uppercase tracking-wide trk-dim mb-1">{label}</div>
      <div className={`${pre ? 'whitespace-pre-wrap' : ''} break-words leading-relaxed`}>{value}</div>
    </div>
  );
}

function ScorePanel({ s }) {
  const [label, tone] = BAND[s.band] || ['', 'gray'];
  return (
    <div className="trk-section">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="trk-label">Brief score</div>
        <span className="cc-stat !text-[40px]">{s.total ?? '—'}</span>
        <Chip tone={tone}>{label}</Chip>
        <span className="text-[12px] trk-dim">Uncalibrated — weights get fitted on past briefs vs AfterLife results once that feed is live.</span>
      </div>
      {!s.guardrails?.passed && <div className="mt-2 text-[13px]" style={{ color: 'var(--trk-red)' }}>Guardrails: {(s.guardrails?.violations || []).join(' · ')}</div>}
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
        <div className="mt-3 text-[13px]"><span className="trk-label">What would raise it</span>
          <ul className="mt-1 space-y-0.5">{s.fixes.map((x, i) => <li key={i}>+{Math.round(x.gain)} · {x.fix} <span className="trk-dim">({x.evidence})</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function PreflightPanel({ p }) {
  return (
    <div className="trk-section">
      <div className="flex flex-wrap items-center gap-2">
        <div className="trk-label">Captain Caption · pre-flight</div>
        {p.verdict === 'passed' && <Chip tone="green">✅ Passed</Chip>}
        {p.verdict === 'issues' && <Chip tone="red">🔴 {p.must_fix} must-fix — approval locked</Chip>}
        {p.verdict === 'error' && <Chip tone="red">Couldn’t check: {p.error}</Chip>}
        {p.check_id && <a className="text-[12px] underline-offset-2 hover:underline trk-muted ml-auto" href={`/captain?tab=activity&check=${p.check_id}`}>Open in Captain HQ <ExternalLink size={11} className="inline" /></a>}
      </div>
      <p className="mt-1 text-[12px] trk-dim">Same Brain as the asset checks in Frame.io and Figma. Once approved and on Monday, these lines become the approved on-screen text the delivered asset is checked against.</p>
      {(p.issues || []).length > 0 && (
        <div className="mt-2 space-y-1.5 text-[13px]">
          {p.issues.map((i, k) => { const [l, t] = ISSUE_SEV[i.severity] || ISSUE_SEV.must_fix; return <div key={k} className="flex flex-wrap items-baseline gap-2"><Chip tone={t}>{l}</Chip><span><b>{i.found}</b>{i.fix ? <> → {i.fix}</> : null}</span><span className="trk-dim">{i.rule}</span></div>; })}
        </div>
      )}
      {(p.notes || []).length > 0 && <div className="mt-2 text-[12px] trk-dim">{p.notes.join(' · ')}</div>}
    </div>
  );
}
