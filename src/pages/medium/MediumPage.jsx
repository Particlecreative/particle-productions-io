import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Home, PenLine, Inbox, Telescope, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { mediumApi } from '../../lib/mediumService';
import Today from '../../components/medium/Today';
import Create from '../../components/medium/Create';
import Briefs from '../../components/medium/Briefs';
import Behind from '../../components/medium/Behind';
import Market from '../../components/medium/Market';
import BriefDrawer from '../../components/medium/BriefDrawer';
import '../../components/tracker/tracker.css';
import '../../components/captain/captain.css';
import '../../components/medium/medium.css';

const TABS = [
  ['today', 'Today', Home],
  ['create', 'Create', PenLine],
  ['briefs', 'Briefs', Inbox],
  ['market', 'Market Watch', Globe],
  ['behind', 'Behind the scenes', Telescope],
];
// old links (?tab=generate…) still land in the right place
const LEGACY = { room: ['today'], generate: ['create', 'winner'], freeform: ['create', 'idea'], hooks: ['create', 'hooks'], holiday: ['create', 'holiday'], learns: ['behind', 'sources'], lab: ['behind', 'tests'] };

function hello(name) {
  const h = new Date().getHours();
  const first = String(name || '').trim().split(/\s+/)[0];
  return `${h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
}

/**
 * MEDIUM 🔮 — the creative strategy room. It studies what won and drafts the next briefs in the team's house style;
 * Captain Caption proofreads them; a person approves before anything is made.
 */
export default function MediumPage() {
  const { isAdmin, user } = useAuth();
  const { brandId } = useBrand();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const legacy = LEGACY[raw];
  const tab = legacy ? legacy[0] : TABS.some(t => t[0] === raw) ? raw : 'today';
  const sub = (legacy && legacy[1]) || params.get('mode') || '';
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
    const ok = params.get('upspring'), err = params.get('upspring_error');
    if (!ok && !err) return;
    notify(ok ? 'Upspring connected — ranking Particle’s ads now (about a minute)' : `Upspring didn’t connect: ${err}`, !!err);
    setParams(prev => { const n = new URLSearchParams(prev); n.delete('upspring'); n.delete('upspring_error'); return n; });
  }, [params, notify, setParams]);
  useEffect(() => {
    if (!briefs.some(b => ['QUEUED', 'WRITING'].includes(b.status))) return undefined;
    const t = setInterval(load, 6000); return () => clearInterval(t);
  }, [briefs, load]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const setParam = useCallback((key, value) => setParams(prev => { const n = new URLSearchParams(prev); if (value) n.set(key, value); else n.delete(key); return n; }), [setParams]);
  const go = useCallback((t, mode) => setParams(prev => { const n = new URLSearchParams(prev); n.set('tab', t); if (mode) n.set('mode', mode); else n.delete('mode'); return n; }), [setParams]);
  const setSub = useCallback((mode) => go(tab, mode), [go, tab]);
  const openBrief = useCallback((id) => setParam('brief', id), [setParam]);

  if (brandId && brandId !== 'particle') return <div className="p-10 text-center text-sm text-gray-500">Medium works for Particle — switch to the Particle brand to use it.</div>;

  const waiting = briefs.filter(b => b.status === 'PENDING_REVIEW').length;
  const mondayOn = !!(overview?.monday_submit ?? overview?.sources?.monday?.submit);
  return (
    <div className="trk cc md max-w-[2400px] mx-auto pb-16">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        <div className="trk-eyebrow">🔮 Medium · creative strategy</div>
        <h1 className="md-hello mt-3">{hello(user?.name)}</h1>
        <p className="md-lead mt-3">Medium studies what won and drafts your next briefs in the team’s style. Captain Caption proofreads every line — and nothing gets made until you approve it.</p>

        <nav className="md-tabs mt-8" role="tablist" aria-label="Medium">
          {TABS.map(([key, label, Icon]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : ''} onClick={() => go(key)}>
              <Icon size={16} /> {label}{key === 'briefs' && waiting > 0 && <span className="md-count">{waiting}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-8">
          {tab === 'today' && <Today overview={overview} briefs={briefs} onOpen={openBrief} go={go} />}
          {tab === 'create' && <Create mode={sub} setMode={setSub} overview={overview} notify={notify} onOpen={openBrief} onQueued={load} />}
          {tab === 'briefs' && <Briefs briefs={briefs} overview={overview} onOpen={openBrief} />}
          {tab === 'market' && <Market notify={notify} isAdmin={isAdmin} go={go} />}
          {tab === 'behind' && <Behind part={sub} setPart={setSub} overview={overview} notify={notify} isAdmin={isAdmin} reload={load} onOpen={openBrief} />}
        </div>
      </div>

      {open && <BriefDrawer id={open} isAdmin={isAdmin} mondayOn={mondayOn} notify={notify} onClose={() => setParam('brief', '')} onChanged={load} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg" style={{ background: toast.error ? '#ff5c7a' : '#0808f8', color: '#fff' }} role="status">{toast.text}</div>
      )}
    </div>
  );
}
