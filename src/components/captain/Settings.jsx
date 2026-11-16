import { useCallback, useEffect, useState } from 'react';
import { Loader2, Link2, Unlink, Save, ArrowRight, BellOff, Hand, ExternalLink } from 'lucide-react';
import { captainApi } from '../../lib/captainService';

const listToText = (a) => (a || []).join(', ');
const textToList = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

function Conn({ name, ok, detail, children }) {
  return (
    <div className="trk-glass p-4 flex items-start gap-3">
      <span className="cc-dot mt-1.5" style={{ background: ok ? 'var(--trk-green)' : 'var(--trk-amber)' }} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{name}</div>
        <div className="text-[13px] trk-muted mt-0.5 break-words">{detail}</div>
        {children}
      </div>
    </div>
  );
}

/** Connections, the posting switch, scope, engines. Editing is admin-only. */
export default function CaptainSettings({ notify, isAdmin, status, reloadStatus }) {
  const [s, setS] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { const r = await captainApi.settings(); setS(r.settings); setDraft(JSON.parse(JSON.stringify(r.settings))); } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const connectFrameio = async () => {
    setBusy('fio');
    try { const { url } = await captainApi.frameioConnect(); window.location.href = url; } catch (e) { notify(e.message, true); setBusy(null); }
  };
  const disconnectFrameio = async () => {
    if (!window.confirm('Disconnect the Captain from Frame.io? Checks will stop until it’s connected again.')) return;
    setBusy('fio');
    try { await captainApi.frameioDisconnect(); reloadStatus(); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const setPosting = async (mode) => {
    if (mode === 'live' && !window.confirm('Go live? The Captain will comment on real Frame.io videos and Figma files and post on real Monday items.')) return;
    setBusy('posting');
    try { const r = await captainApi.saveSettings({ posting: { mode } }); setS(r.settings); setDraft(JSON.parse(JSON.stringify(r.settings))); reloadStatus(); notify(`Posting: ${mode === 'test' ? 'test files only' : mode}`); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try {
      const r = await captainApi.saveSettings({ scope: draft.scope, triggers: draft.triggers, engines: draft.engines, auto_versions: draft.auto_versions, insights: draft.insights });
      setS(r.settings); setDraft(JSON.parse(JSON.stringify(r.settings))); notify('Settings saved');
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };

  const set = (path, value) => setDraft(d => {
    const next = JSON.parse(JSON.stringify(d));
    let o = next; const keys = path.split('.');
    keys.slice(0, -1).forEach(k => { o = o[k]; });
    o[keys[keys.length - 1]] = value;
    return next;
  });

  if (!s || !draft) return <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>;
  const fio = status?.frameio || {};
  const dirty = JSON.stringify(draft) !== JSON.stringify(s);
  return (
    <div className="space-y-6">
      <div>
        <div className="trk-label mb-2">Connections — the Captain’s own accounts</div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Conn name="Frame.io" ok={fio.connected && !fio.error} detail={fio.connected ? `Connected as ${fio.user_name || '…'}${fio.account_name ? ` · ${fio.account_name}` : ''}${fio.error ? ` — ${fio.error}` : ''}` : 'Not connected. Sign in with the Captain’s Adobe ID (tomer@blurrskin.com) — not your own.'}>
            {isAdmin && (
              <div className="mt-2 flex gap-2">
                <button type="button" className="trk-btn !py-1.5" onClick={connectFrameio} disabled={busy === 'fio'}>{busy === 'fio' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} {fio.connected ? 'Reconnect' : 'Connect the Captain'}</button>
                {fio.connected && <button type="button" className="trk-btn !py-1.5" onClick={disconnectFrameio} disabled={busy === 'fio'}><Unlink size={13} /> Disconnect</button>}
              </div>
            )}
          </Conn>
          <Conn name="Figma" ok={status?.figma?.connected} detail={status?.figma?.connected ? `Connected as ${status.figma.user_name}` : status?.figma?.configured ? `Token problem — ${status?.figma?.error || 'check it'}` : 'No token on the server yet.'} />
          <Conn name="Monday" ok={status?.monday?.connected} detail={status?.monday?.connected ? `Posting as ${status.monday.user_name}` : 'The Captain’s Monday token isn’t on the server yet — save it as captain-monday-token.txt on your Desktop and ask Claude to install it.'} />
          <Conn name="AI" ok={status?.gemini?.configured} detail={`Video: ${s.engines.video.model} · Design: ${s.engines.design.model}`} />
        </div>
      </div>

      <AutopilotCard s={s} isAdmin={isAdmin} notify={notify} onSaved={(next) => { setS(next); setDraft(JSON.parse(JSON.stringify(next))); reloadStatus(); }} />

      <div className="trk-glass p-5">
        <div className="trk-label">Posting switch</div>
        <p className="text-[13px] trk-muted mt-1 max-w-[760px]">Where the Captain may comment. <b>Test only</b> = the Captain Caption Test folder in Frame.io and the Captain Test Figma file; everything else is checked and shown here without commenting.</p>
        <div className="mt-3 trk-seg cc-switch">
          {[['off', 'Off'], ['test', 'Test only'], ['live', 'Live']].map(([k, l]) => (
            <button key={k} type="button" className={s.posting.mode === k ? 'on' : ''} disabled={!isAdmin || busy === 'posting'} onClick={() => setPosting(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="trk-glass p-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 trk-label">What gets checked</div>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">🎬 Video departments</span>
          <input className="trk-input" disabled={!isAdmin} value={listToText(draft.scope.video_departments)} onChange={(e) => set('scope.video_departments', textToList(e.target.value))} /></label>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">🎨 Design departments</span>
          <input className="trk-input" disabled={!isAdmin} value={listToText(draft.scope.design_departments)} onChange={(e) => set('scope.design_departments', textToList(e.target.value))} /></label>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">Title keywords (any department)</span>
          <input className="trk-input" disabled={!isAdmin} value={listToText(draft.scope.title_keywords)} onChange={(e) => set('scope.title_keywords', textToList(e.target.value))} />
          <span className="text-[12px] trk-dim">Whole word, any case — “Meta” matches “Meta Ad”, not “Metallic”. TV is always skipped.</span></label>
        <div className="grid gap-1">
          <span className="text-[13px] font-semibold">Statuses that trigger a check</span>
          <div className="text-[13px] trk-muted">🎬 1st: {listToText(draft.triggers.video.first)} · 2nd: {listToText(draft.triggers.video.second)}</div>
          <div className="text-[13px] trk-muted">🎨 1st: {listToText(draft.triggers.design.first)} · 2nd: {listToText(draft.triggers.design.second)}</div>
        </div>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">🎬 Video model</span>
          <input className="trk-input" disabled={!isAdmin} value={draft.engines.video.model} onChange={(e) => set('engines.video.model', e.target.value.trim())} /></label>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">🎨 Design model</span>
          <input className="trk-input" disabled={!isAdmin} value={draft.engines.design.model} onChange={(e) => set('engines.design.model', e.target.value.trim())} /></label>
        <label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!isAdmin} checked={!!draft.auto_versions.video} onChange={(e) => set('auto_versions.video', e.target.checked)} /> Check new video rounds automatically</label>
        <label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" disabled={!isAdmin} checked={!!draft.auto_versions.design} onChange={(e) => set('auto_versions.design', e.target.checked)} /> Check design changes automatically</label>
        {isAdmin && (
          <div className="md:col-span-2">
            <button type="button" className="trk-btn primary" onClick={save} disabled={!dirty || busy === 'save'}>{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save settings</button>
          </div>
        )}
      </div>
    </div>
  );
}

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const STATUS_TONE = { 'Approved': 'var(--trk-green)', 'Fixes Round': 'var(--trk-amber)', 'For Approval': 'var(--trk-blue, #4a55ff)' };

function Step({ tone, children }) {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12.5px] font-semibold whitespace-nowrap" style={{ background: 'var(--trk-glass-hi)', color: tone || 'inherit' }}>{children}</span>;
}

/**
 * The Captain on his own (Tomer, 16 Nov 2026): he sees a ticket enter a review status, checks it and moves it on —
 * quietly. The rules are spelled out here in plain words, next to the switch.
 */
function AutopilotCard({ s, isAdmin, notify, onSaved }) {
  const a = s.autopilot || { mode: 'off', first_clean_to: 'Approved', max_rounds: 3, start_delay_min: 3, test_items: [] };
  const [busy, setBusy] = useState(null);
  const [tests, setTests] = useState((a.test_items || []).join('\n'));
  const [log, setLog] = useState(null);
  useEffect(() => { captainApi.autopilot().then(setLog).catch(() => setLog({ recent: [], needs_person: [] })); }, [a.mode]);
  const save = async (patch, msg) => {
    setBusy(Object.keys(patch)[0]);
    try { const r = await captainApi.saveSettings({ autopilot: { ...a, ...patch } }); onSaved(r.settings); notify(msg); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const setMode = (mode) => {
    if (mode === 'live' && !window.confirm('Turn the autopilot on for every ticket in scope? The Captain will review tickets in Review, Quality Check and For Approval and move them to Fixes Round or Approved on his own.')) return;
    if (mode === 'test' && !String(tests).trim()) { notify('Add a test ticket first (a Monday link or item ID)', true); return; }
    save({ mode, test_items: String(tests).split(/[\n,]+/).map(x => x.trim()).filter(Boolean) }, mode === 'off' ? 'Autopilot off — nothing moves on its own' : mode === 'test' ? 'Autopilot on for the test tickets' : 'Autopilot is live 🧑‍✈️');
  };
  const t = s.triggers || {};
  const postingNote = s.posting?.mode === 'live' ? null
    : s.posting?.mode === 'test' ? 'Posting is on “Test only”, so his comments land only in the test files — set Posting to Live so editors see what to fix.'
      : 'Posting is off, so editors won’t see his comments — set Posting to Live.';
  return (
    <div className="trk-glass p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="trk-label">🧑‍✈️ Autopilot — the Captain reviews and moves tickets on his own</div>
          <p className="text-[13px] trk-muted mt-1 max-w-[760px]">When a ticket reaches a review status he checks it {a.start_delay_min || 3} minutes later and moves it to the next step himself. Quietly: <b>no Monday updates, no @mentions</b> — his comments go on the video or design, where the problem is.</p>
        </div>
        <div className="trk-seg cc-switch">
          {[['off', 'Off'], ['test', 'Test tickets'], ['live', 'Live']].map(([k, l]) => (
            <button key={k} type="button" className={a.mode === k ? 'on' : ''} disabled={!isAdmin || !!busy} onClick={() => setMode(k)}>{busy === 'mode' && a.mode !== k ? '…' : l}</button>
          ))}
        </div>
      </div>

      {/* the flow, as a picture */}
      <div className="mt-4 grid gap-2.5 text-[13px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-[86px] trk-dim text-[12px] uppercase tracking-wide">1st review</span>
          <Step>🎬 {(t.video?.first || ['Review']).join(' / ')} · 🎨 {(t.design?.first || ['Quality Check']).join(' / ')}</Step>
          <ArrowRight size={14} className="trk-dim" />
          <span className="trk-muted">must-fix?</span>
          <Step tone={STATUS_TONE['Fixes Round']}>yes → Fixes Round</Step>
          <Step tone={STATUS_TONE[a.first_clean_to]}>no → {a.first_clean_to}</Step>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-[86px] trk-dim text-[12px] uppercase tracking-wide">2nd review</span>
          <Step>{(t.video?.second || ['For Approval']).join(' / ')} <span className="trk-dim font-normal ml-1">(after the fixes)</span></Step>
          <ArrowRight size={14} className="trk-dim" />
          <span className="trk-muted">all must-fixes fixed?</span>
          <Step tone={STATUS_TONE['Approved']}>yes → Approved</Step>
          <Step tone={STATUS_TONE['Fixes Round']}>no → Fixes Round</Step>
        </div>
      </div>

      <ul className="mt-4 grid gap-1.5 text-[13px] max-w-[820px]">
        <li>✅ <b>A must-change is a must.</b> Only must-fixes hold a ticket back. His “please check” notes stay as comments for the editor to judge — they never block, and anything you mark “not a typo” doesn’t count.</li>
        <li><Hand size={13} className="inline -mt-0.5 mr-1" />After <b>{a.max_rounds || 3} reviews</b> that still have must-fixes he stops moving it and leaves it for a person (listed below).</li>
        <li><BellOff size={13} className="inline -mt-0.5 mr-1" />If a ticket moves on before he gets to it, is out of scope, has no file yet or can’t be opened, he leaves it alone.</li>
      </ul>
      {a.mode !== 'off' && postingNote && <p className="mt-3 text-[13px]" style={{ color: 'var(--trk-amber)' }}>{postingNote}</p>}

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold">A clean first review goes to</span>
          <div className="trk-seg cc-switch w-fit">
            {[['Approved', 'Approved'], ['For Approval', 'For Approval — a person approves']].map(([k, l]) => (
              <button key={k} type="button" className={a.first_clean_to === k ? 'on' : ''} disabled={!isAdmin || !!busy} onClick={() => save({ first_clean_to: k }, `A clean first review now goes to ${k}`)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Test tickets <span className="trk-dim font-normal">(Monday links or item IDs, one per line)</span></span>
          <textarea className="trk-input min-h-[64px] text-[12.5px]" disabled={!isAdmin} value={tests} onChange={(e) => setTests(e.target.value)} placeholder="https://particle-for-men.monday.com/boards/5433027071/pulses/…" />
          {isAdmin && a.mode === 'test' && <button type="button" className="trk-btn !py-1 w-fit" disabled={!!busy} onClick={() => save({ test_items: String(tests).split(/[\n,]+/).map(x => x.trim()).filter(Boolean) }, 'Test tickets saved')}><Save size={12} /> Save test tickets</button>}
        </label>
      </div>

      {log && (log.needs_person.length > 0 || log.recent.length > 0) && (
        <div className="mt-5 grid lg:grid-cols-2 gap-4">
          {log.needs_person.length > 0 && (
            <div>
              <div className="text-[12px] uppercase tracking-wide trk-dim mb-2">Waiting for a person</div>
              <div className="grid gap-2">{log.needs_person.map(r => <Decision key={`${r.board_id}:${r.item_id}`} r={r} />)}</div>
            </div>
          )}
          {log.recent.length > 0 && (
            <div>
              <div className="text-[12px] uppercase tracking-wide trk-dim mb-2">His latest decisions</div>
              <div className="grid gap-2">{log.recent.slice(0, 8).map(r => <Decision key={`${r.board_id}:${r.item_id}`} r={r} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Decision({ r }) {
  const to = r.last?.to;
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl px-3 py-2.5 hover:brightness-110" style={{ background: 'var(--trk-glass-hi)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <span>{r.discipline === 'design' ? '🎨' : '🎬'}</span>
        <span className="font-semibold text-[13px] truncate min-w-0">{r.item_name}</span>
        <ExternalLink size={11} className="trk-dim flex-none" />
        <span className="ml-auto text-[11.5px] trk-dim whitespace-nowrap">{ago(r.updated_at)}</span>
      </div>
      <div className="text-[12.5px] trk-muted mt-1 flex items-center gap-1.5 flex-wrap">
        <span>{r.last?.from}</span><ArrowRight size={11} />
        <b style={{ color: to ? STATUS_TONE[to] : 'var(--trk-amber)' }}>{to || 'left for a person'}</b>
        <span className="trk-dim">· {r.last?.why?.replace(/^Review \d+: /, '')}</span>
      </div>
    </a>
  );
}
