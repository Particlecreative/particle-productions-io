import { useCallback, useEffect, useState } from 'react';
import { Loader2, Link2, Unlink, Save } from 'lucide-react';
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
