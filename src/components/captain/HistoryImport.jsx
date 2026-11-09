import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Play } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import { relTime, money } from './util';

/**
 * Brain bootstrap, step A: a read-only copy of every past reviewer comment (Frame.io videos + the Figma Media Ads files)
 * since 2025. Nothing is posted, edited or resolved. The AI steps only run after the report below is approved.
 */
export default function HistoryImport({ notify, isAdmin }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setS(await captainApi.importStatus()); } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  const running = s?.run?.status === 'running';
  useEffect(() => { if (!running) return undefined; const t = setInterval(load, 10000); return () => clearInterval(t); }, [running, load]);

  const start = async () => {
    if (!window.confirm('Start reading every past Frame.io and Figma (Media Ads) comment since 2025? It’s read-only and runs in the background for a few hours.')) return;
    setBusy(true);
    try { await captainApi.importStart(); notify('History import started'); setTimeout(load, 3000); } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };

  if (!s) return null;
  const by = Object.fromEntries((s.comments || []).map(c => [c.source, c]));
  const assets = Object.fromEntries((s.assets || []).map(a => [a.source, a]));
  const pct = s.progress?.all ? Math.round((s.progress.done / s.progress.all) * 100) : 0;
  const plan = s.run?.plan || {};

  return (
    <div className="trk-glass p-5">
      <div className="flex flex-wrap items-center gap-3">
        <History size={16} className="trk-muted" />
        <div className="trk-label">Learn from history</div>
        {s.run && <span className={`trk-chip ${running ? 'amber' : 'green'}`}>{running ? `Reading… ${pct}%` : `Read ${relTime(s.run.finished_at || s.run.started_at)}`}</span>}
        {isAdmin && !running && (
          <button type="button" className="trk-btn !py-1.5 ml-auto" onClick={start} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {s.run ? 'Read again' : 'Start'}</button>
        )}
      </div>
      <p className="text-[13px] trk-muted mt-1 max-w-[820px]">
        Reads every reviewer comment since {s.run?.since ? new Date(s.run.since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Jan 2025'} — Frame.io videos and the Figma <b>Media Ads</b> files — tied to their Monday tasks. Read-only. Nothing is learned until the report is approved and the results pass the review queue.
      </p>

      {!s.run && <div className="mt-3 text-[13px] trk-dim">Not started yet.</div>}
      {s.run && (
        <>
          {running && (
            <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'var(--trk-glass-hi)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--trk-electric)' }} />
            </div>
          )}
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="🎬 Video comments" value={by.frameio?.n || 0} sub={`${assets.frameio?.items || 0} tasks · ${assets.frameio?.n || 0} video rounds${plan.frameio ? ` of ${plan.frameio.items} tasks queued` : ''}`} />
            <Stat label="🎨 Design comments" value={by.figma?.n || 0} sub={`${by.figma?.matched || 0} matched to a task · ${plan.figma?.files ?? '–'} Media Ads files`} />
            <Stat label="Reviewers" value={(by.frameio?.authors || 0) + (by.figma?.authors || 0)} sub={(s.authors || []).slice(0, 3).map(a => a.author).filter(Boolean).join(', ')} />
            <Stat label="AI to analyse (estimate)" value={money(s.estimate?.total || 0)} sub="Only spent after you approve" />
          </div>
          {s.progress?.failed > 0 && <div className="mt-3 text-[12px]" style={{ color: 'var(--trk-amber)' }}>{s.progress.failed} item{s.progress.failed === 1 ? '' : 's'} couldn’t be read (no access or deleted) — skipped.</div>}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="trk-label">{label}</div>
      <div className="cc-stat mt-1">{typeof value === 'number' ? value.toLocaleString('en-US') : value}</div>
      {sub && <div className="text-[12px] trk-muted mt-1">{sub}</div>}
    </div>
  );
}
