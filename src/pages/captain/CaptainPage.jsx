import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity as ActivityIcon, ScanText, Brain as BrainIcon, SlidersHorizontal, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { captainApi } from '../../lib/captainService';
import Activity from '../../components/captain/Activity';
import ManualCheck from '../../components/captain/ManualCheck';
import Brain from '../../components/captain/Brain';
import Insights from '../../components/captain/Insights';
import CaptainSettings from '../../components/captain/Settings';
import '../../components/tracker/tracker.css';
import '../../components/captain/captain.css';

const TABS = [
  ['activity', 'Activity', ActivityIcon],
  ['check', 'Check a link', ScanText],
  ['insights', 'Insights', BarChart3],
  ['brain', 'Brain', BrainIcon],
  ['settings', 'Settings', SlidersHorizontal],
];

function Pill({ ok, warn, label, title }) {
  const color = ok ? 'var(--trk-green)' : warn ? 'var(--trk-amber)' : 'var(--trk-red)';
  return (
    <span className="trk-chip gray" title={title}>
      <span className="cc-dot" style={{ background: color }} /> {label}
    </span>
  );
}

/**
 * Captain Caption HQ — everything the Captain has done, and how the team teaches him.
 * He proofreads Frame.io videos and Figma designs and comments exactly where the problem is.
 */
export default function CaptainPage() {
  const { isAdmin } = useAuth();
  const { brandId } = useBrand();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'activity';
  const [status, setStatus] = useState(null);
  const [toast, setToast] = useState(null);

  const loadStatus = useCallback(async () => {
    try { setStatus(await captainApi.status()); } catch (e) { setToast({ text: e.message, error: true }); }
  }, []);
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 30000); return () => clearInterval(t); }, [loadStatus]);

  // Back from the Frame.io sign-in
  useEffect(() => {
    const fio = params.get('frameio');
    if (!fio) return;
    setToast(fio === 'connected' ? { text: 'The Captain is connected to Frame.io 🧑‍✈️' } : { text: `Frame.io: ${params.get('msg') || 'sign-in failed'}`, error: true });
    const next = new URLSearchParams(params); next.delete('frameio'); next.delete('msg');
    setParams(next, { replace: true });
    loadStatus();
  }, [params, setParams, loadStatus]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const go = (t) => { const next = new URLSearchParams(params); next.set('tab', t); setParams(next); };
  const notify = (text, error = false) => setToast({ text, error });

  if (brandId && brandId !== 'particle') {
    return <div className="p-10 text-center text-sm text-gray-500">Captain Caption works for Particle — switch to the Particle brand to use it.</div>;
  }

  const posting = status?.posting?.mode;
  return (
    <div className="trk cc max-w-[2400px] mx-auto pb-16">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="trk-eyebrow">Text QC · Briefs · Frame.io · Figma</div>
            <h1 className="trk-title text-[52px] sm:text-[76px] md:text-[92px] mt-2">Captain Caption <span aria-hidden>🧑‍✈️</span></h1>
            <p className="mt-2 text-[15px] trk-muted max-w-[720px]">Proofreads every brief before it’s made, then every video and design that goes to review — and comments exactly where the problem is: on the frame in Frame.io, on the layer in Figma, with a summary on Monday.</p>
          </div>
          {status && (
            <div className="ml-auto flex flex-wrap gap-2 justify-end">
              <Pill ok={status.frameio?.connected && !status.frameio?.error} label="Frame.io" title={status.frameio?.user_name ? `Connected as ${status.frameio.user_name}` : status.frameio?.error || 'Not connected'} />
              <Pill ok={status.figma?.connected} label="Figma" title={status.figma?.user_name ? `Connected as ${status.figma.user_name}` : status.figma?.error || 'No token'} />
              <Pill ok={status.monday?.connected} warn={!status.monday?.configured} label="Monday" title={status.monday?.user_name ? `Posting as ${status.monday.user_name}` : 'The Captain’s Monday token isn’t set yet'} />
              <Pill ok={status.gemini?.configured} label="Gemini" />
              <Pill ok={status.worker?.alive} label="Worker" title={status.worker?.at ? `Last heartbeat ${new Date(status.worker.at).toLocaleTimeString()}` : 'The captain-worker hasn’t started'} />
              <span className={`trk-chip ${posting === 'live' ? 'green' : posting === 'test' ? 'amber' : 'gray'}`} title="Where the Captain is allowed to post">
                {posting === 'live' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} Posting: {posting === 'live' ? 'live' : posting === 'test' ? 'test files only' : 'off'}
              </span>
            </div>
          )}
        </div>

        <div className="mt-7 trk-seg overflow-x-auto max-w-full" role="tablist">
          {TABS.map(([key, label, Icon]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => go(key)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'activity' && <Activity notify={notify} />}
          {tab === 'check' && <ManualCheck notify={notify} isAdmin={isAdmin} status={status} onQueued={() => go('activity')} />}
          {tab === 'insights' && <Insights notify={notify} />}
          {tab === 'brain' && <Brain notify={notify} isAdmin={isAdmin} />}
          {tab === 'settings' && <CaptainSettings notify={notify} isAdmin={isAdmin} status={status} reloadStatus={loadStatus} />}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg"
          style={{ background: toast.error ? '#ff5c7a' : '#0808f8', color: '#fff' }} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
