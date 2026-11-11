import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Sparkles, Wand2, BookOpen, FlaskConical, CalendarDays } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { mediumApi } from '../../lib/mediumService';
import StrategyRoom from '../../components/medium/StrategyRoom';
import Generator from '../../components/medium/Generator';
import Freeform from '../../components/medium/Freeform';
import Sources from '../../components/medium/Sources';
import Lab, { Holiday } from '../../components/medium/Lab';
import BriefDrawer from '../../components/medium/BriefDrawer';
import '../../components/tracker/tracker.css';
import '../../components/captain/captain.css';

const TABS = [
  ['room', 'Strategy Room', LayoutDashboard],
  ['generate', 'Brief Generator', Sparkles],
  ['freeform', 'Freeform Brief', Wand2],
  ['learns', 'What it learns from', BookOpen],
  ['lab', 'A/B Lab & Transfers', FlaskConical],
  ['holiday', 'Holiday Builder', CalendarDays],
];

function Pill({ ok, warn, label, title }) {
  return <span className="trk-chip gray" title={title}><span className="cc-dot" style={{ background: ok ? 'var(--trk-green)' : warn ? 'var(--trk-amber)' : 'var(--trk-red)' }} /> {label}</span>;
}

/**
 * MEDIUM 🔮 — the creative strategy room. It talks to the afterlife (what won) and brings back the next brief:
 * written in the team's house style, scored, proofread by Captain Caption, and approved by a person.
 */
export default function MediumPage() {
  const { isAdmin } = useAuth();
  const { brandId } = useBrand();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'room';
  const open = params.get('brief');
  const [overview, setOverview] = useState(null);
  const [briefs, setBriefs] = useState([]);
  const [toast, setToast] = useState(null);

  const notify = useCallback((text, error = false) => setToast({ text, error }), []);
  const load = useCallback(async () => {
    try {
      const [o, b] = await Promise.all([mediumApi.overview(), mediumApi.briefs({})]);
      setOverview(o); setBriefs(b.briefs);
    } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!briefs.some(b => ['QUEUED', 'WRITING'].includes(b.status))) return undefined;
    const t = setInterval(load, 6000); return () => clearInterval(t);
  }, [briefs, load]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const setParam = useCallback((key, value) => setParams(prev => { const n = new URLSearchParams(prev); if (value) n.set(key, value); else n.delete(key); return n; }), [setParams]);
  const go = useCallback((t) => setParam('tab', t), [setParam]);
  const openBrief = useCallback((id) => setParam('brief', id), [setParam]);

  if (brandId && brandId !== 'particle') return <div className="p-10 text-center text-sm text-gray-500">Medium works for Particle — switch to the Particle brand to use it.</div>;

  const src = overview?.sources || {};
  return (
    <div className="trk cc md max-w-[2400px] mx-auto pb-16">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="trk-eyebrow">Creative strategy room · Particle</div>
            <h1 className="trk-title text-[52px] sm:text-[76px] md:text-[92px] mt-2">Medium <span aria-hidden>🔮</span></h1>
            <p className="mt-2 text-[15px] trk-muted max-w-[760px]">Talks to the afterlife and brings back the next brief: what won and why, written in the team’s house style, scored, proofread by Captain Caption — and approved by a person before anything is made.</p>
          </div>
          {overview && (
            <div className="ml-auto flex flex-wrap gap-2 justify-end">
              <Pill ok={src.afterlife?.connected} label="AfterLife" title={src.afterlife?.reason || 'Winners feed connected'} />
              <Pill ok={false} warn={src.upspring?.snapshot} label="Upspring" title={src.upspring?.snapshot ? 'Account read pasted in (not synced)' : 'Not connected on the server yet'} />
              <Pill ok={(src.corpus?.used || 0) > 0} label={`Corpus ${src.corpus?.used || 0}`} title="Briefs Medium learns the house style from" />
              <Pill ok={src.worker?.alive} label="Worker" />
              <span className="trk-chip amber" title="Briefs are written, checked and approved in CP; nothing is created on Monday">Shadow mode</span>
            </div>
          )}
        </div>

        <div className="mt-7 trk-seg overflow-x-auto max-w-full" role="tablist">
          {TABS.map(([key, label, Icon]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => go(key)}><Icon size={13} /> {label}</button>
          ))}
        </div>

        <div className="mt-6">
          {tab === 'room' && <StrategyRoom overview={overview} briefs={briefs} onOpen={openBrief} go={go} />}
          {tab === 'generate' && <Generator overview={overview} notify={notify} onOpen={openBrief} onQueued={load} />}
          {tab === 'freeform' && <Freeform overview={overview} notify={notify} onOpen={openBrief} onQueued={load} />}
          {tab === 'learns' && <Sources overview={overview} notify={notify} isAdmin={isAdmin} reload={load} />}
          {tab === 'lab' && <Lab overview={overview} notify={notify} />}
          {tab === 'holiday' && <Holiday overview={overview} />}
        </div>
      </div>

      {open && <BriefDrawer id={open} isAdmin={isAdmin} notify={notify} onClose={() => setParam('brief', '')} onChanged={load} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg" style={{ background: toast.error ? '#ff5c7a' : '#0808f8', color: '#fff' }} role="status">{toast.text}</div>
      )}
    </div>
  );
}
