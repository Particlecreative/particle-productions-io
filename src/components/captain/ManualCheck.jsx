import { useState } from 'react';
import { ScanText, Loader2, Info } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import BriefCheck from './BriefCheck';

/** Paste any Frame.io, Figma or Monday link → check now. Respects scope unless an admin overrides it. */
export default function ManualCheck({ notify, isAdmin, status, onQueued }) {
  const [link, setLink] = useState('');
  const [force, setForce] = useState(false);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (e) => {
    e?.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    try {
      const r = await captainApi.check(link.trim(), { force, override_scope: override });
      notify(r.queued ? 'Queued — the Captain is on it' : 'That link is already waiting in the queue');
      setLink('');
      onQueued?.();
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  };

  const posting = status?.posting?.mode;
  return (
    <div className="space-y-5">
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
      <form className="trk-glass p-5 sm:p-6" onSubmit={run}>
        <div className="trk-label">Check a link now</div>
        <p className="text-sm trk-muted mt-1">Paste a <b>Monday task</b> (best — the Captain also reads its brief and script), a <b>Frame.io</b> folder, video or short link, or a <b>Figma</b> link to a section or frame.</p>
        <input className="trk-input mt-4 !py-3 !text-[15px]" placeholder="https://particle-for-men.monday.com/boards/…/pulses/…   or   https://f.io/…" value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
        <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Check again even if already checked</label>
          {isAdmin && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Ignore scope (admin)</label>}
        </div>
        <button type="submit" className="trk-btn primary mt-5" disabled={busy || !link.trim()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ScanText size={14} />} Check now</button>
      </form>

      <div className="trk-glass p-5 text-[13px] leading-relaxed">
        <div className="flex items-center gap-2 trk-label"><Info size={13} /> What happens</div>
        <ul className="mt-2 space-y-1.5 list-disc pl-4 trk-muted">
          <li>Every deliverable in the folder is checked — each version and size, newest round.</li>
          <li>Cut-downs (9x16, 4x5) are compared with their 16x9 master.</li>
          <li>The Captain reads the on-screen text <i>and</i> listens to the voiceover, against the brief.</li>
          <li>Anything already checked is skipped unless you tick “check again”.</li>
        </ul>
        <div className="mt-3 p-3 rounded-xl" style={{ background: 'var(--trk-glass-hi)' }}>
          {posting === 'live' && <>Posting is <b>live</b>: comments go on Frame.io/Figma and a summary on Monday.</>}
          {posting === 'test' && <>Posting is <b>test only</b>: comments are posted only in the Captain Caption Test folder and the Captain Test Figma file. Everything else is checked and shown here, without commenting.</>}
          {posting === 'off' && <>Posting is <b>off</b>: results are shown here only.</>}
          {!posting && 'Loading…'}
        </div>
      </div>
    </div>
    <BriefCheck notify={notify} />
    </div>
  );
}
