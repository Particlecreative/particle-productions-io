import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Clock, Plug, Loader2, AlertTriangle, Lock, GanttChart, Sparkles, Megaphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { studioApi } from '../../lib/studioService';
import Filters, { applyFilters, presetRange, inPeriod } from '../../components/studio/Filters';
import Overview from '../../components/studio/Overview';
import TimeTracking from '../../components/studio/TimeTracking';
import Connections from '../../components/studio/Connections';
import Workload from '../../components/studio/Workload';
import TicketCreator from '../../components/studio/TicketCreator';
import Campaigns from '../../components/studio/Campaigns';
import TaskPanel from '../../components/studio/TaskPanel';
import { StudioCtx, useMondayWrites } from '../../components/studio/writes';

const TABS = [
  ['overview', 'Creative Control', LayoutDashboard],
  ['workload', 'Workload', GanttChart],
  ['campaigns', 'Campaigns', Megaphone],
  ['ticket', 'New ticket', Sparkles],
  ['time', 'Time tracking', Clock],
  ['connections', 'Connections', Plug],
];
const PREF_KEY = 'cp_studio_filters_v1';

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null') || {}; } catch { return {}; }
}

/** Studio Control — the creative studio's management panel (replaces the old Studio list). */
export default function StudioPage() {
  const { isEditor } = useAuth();
  const { brandId, switchBrand } = useBrand();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const [f, setFState] = useState(() => ({ preset: 'this_week', division: 'all', people: [], requesters: [], product: '', q: '', status: null, ...loadPrefs() }));
  const setF = useCallback((next) => {
    setFState(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ preset: next.preset, from: next.from, to: next.to, division: next.division })); } catch { /* ignore */ }
  }, []);
  const range = useMemo(() => (f.preset === 'custom' && f.from && f.to ? { from: f.from, to: f.to } : presetRange(f.preset)), [f.preset, f.from, f.to]);
  const [raw, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadedAt = useRef(0);

  const load = useCallback(async (force = false, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { setData(await studioApi.dashboard({ ...range, force })); loadedAt.current = Date.now(); } catch (e) { if (!quiet) setError(e.message); } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { if (isEditor && brandId === 'particle') load(); }, [load, isEditor, brandId]);
  // Stay live: refresh quietly when you come back to the tab, and every 5 minutes while it's open
  useEffect(() => {
    if (!isEditor || brandId !== 'particle') return undefined;
    const tick = () => { if (document.visibilityState === 'visible' && loadedAt.current && Date.now() - loadedAt.current > 5 * 60 * 1000) load(false, true); };
    const t = setInterval(tick, 60 * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [load, isEditor, brandId]);

  // Changes saved from any tab show everywhere straight away
  const writes = useMondayWrites();
  const data = useMemo(() => (raw ? {
    ...raw,
    items: raw.items.map(it => writes.merge(it, raw.generated_at)).filter(it => !it.archived),
    emails: (raw.emails || []).map(e => writes.merge(e, raw.generated_at)).filter(e => !e.archived),
  } : null), [raw, writes.merge]); // eslint-disable-line react-hooks/exhaustive-deps
  const [panel, setPanel] = useState(null); // { it, data }
  const openTask = useCallback((it, d) => setPanel({ it, data: d || data }), [data]);
  const ctx = useMemo(() => ({ writes, openTask }), [writes, openTask]);
  // The panel follows the latest copy of its task
  const panelIt = panel && ([...(data?.items || []), ...(data?.emails || [])].find(i => i.id === panel.it.id && i.board === panel.it.board) || panel.it);

  // allItems = everything open now + finished with a timeline in the period; items = what the period's timeline holds
  const allItems = useMemo(() => (data ? applyFilters(data.items, f) : []), [data, f]);
  const items = useMemo(() => allItems.filter(it => inPeriod(it, range)), [allItems, range]);
  // The period without the bar's filters — so a card can say what the filters are hiding
  const periodAll = useMemo(() => (data ? data.items.filter(it => inPeriod(it, range)) : []), [data, range]);
  const emails = useMemo(() => (data?.emails || []).filter(e =>
    (!f.people.length || e.people.some(p => f.people.includes(p))) &&
    (!f.product || e.product?.label === f.product) &&
    (!f.q.trim() || e.name.toLowerCase().includes(f.q.trim().toLowerCase())) &&
    (f.division === 'all' || f.division === 'design')), [data, f]);

  if (brandId !== 'particle') {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center p-10 rounded-3xl text-white" style={{ background: '#030b2e' }}>
        <h2 className="text-3xl font-black uppercase" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>Particle only</h2>
        <p className="mt-2 opacity-70">The Studio reads Particle’s Creative Studio boards on Monday.</p>
        <button type="button" onClick={() => switchBrand('particle')} className="mt-6 px-5 py-2.5 rounded-full font-semibold" style={{ background: '#0808f8' }}>Switch to Particle</button>
      </div>
    );
  }
  if (!isEditor) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center p-10 rounded-3xl border border-gray-200 bg-white">
        <Lock className="mx-auto text-gray-400" />
        <h2 className="mt-3 text-xl font-bold text-gray-800">Editors only</h2>
        <p className="mt-1 text-gray-500 text-sm">The Studio shows per-person workload and time, so it’s limited to Editors and Admins.</p>
      </div>
    );
  }

  return (
    <StudioCtx.Provider value={ctx}>
    <div className="max-w-[2400px] mx-auto pb-16">
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <h1 className="brand-title text-4xl" style={{ color: 'var(--brand-primary)' }}>Studio</h1>
          <p className="text-sm text-gray-500 mt-1">Design, Video and TV &amp; Special Productions — live from Monday, managed here.</p>
        </div>
        <nav className="ml-auto flex flex-wrap gap-1 p-1 rounded-2xl bg-white border border-gray-200">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setParams(k === 'overview' ? {} : { tab: k })}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${tab === k ? 'text-white shadow' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
              style={tab === k ? { background: '#030b2e' } : undefined}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
      </div>

      {!['connections', 'ticket', 'campaigns'].includes(tab) && (
        <Filters f={f} setF={setF} range={range} data={data} loading={loading} onRefresh={() => load(true)} showDivision={tab !== 'workload'} showPeriod={tab !== 'workload'} />
      )}

      {error && (
        <div className="my-3 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
          <button type="button" onClick={() => load(true)} className="ml-auto font-semibold underline">Try again</button>
        </div>
      )}
      {data?.warnings?.length > 0 && !['connections', 'campaigns'].includes(tab) && (
        <div className="my-2 text-xs text-amber-700">{data.warnings.join(' · ')}</div>
      )}

      {tab === 'connections' ? (
        <Connections onChanged={() => load(true)} />
      ) : tab === 'ticket' ? (
        <TicketCreator />
      ) : tab === 'workload' ? (
        <Workload f={f} />
      ) : tab === 'campaigns' ? (
        <Campaigns />
      ) : !data ? (
        <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" />
          <span className="text-sm">Reading the Monday boards…</span>
        </div>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {tab === 'overview' && <Overview data={data} items={items} allItems={allItems} periodAll={periodAll} range={range} emails={emails} f={f} setF={setF} goTab={(k) => setParams(k === 'overview' ? {} : { tab: k })} />}
          {tab === 'time' && <TimeTracking data={data} items={items} allItems={allItems} range={range} f={f} setF={setF} />}
        </div>
      )}
      {panel && <TaskPanel it={panelIt} data={panel.data?.generated_at === data?.generated_at ? data : panel.data} onClose={() => setPanel(null)} />}
      {writes.toastEl}
    </div>
    </StudioCtx.Provider>
  );
}
