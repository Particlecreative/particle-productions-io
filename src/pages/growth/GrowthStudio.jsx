// Growth Studio (Tomer, 17 Nov 2026): the growth team's one place in CP — their briefs (Medium), new tickets, the
// campaigns, a read-only studio workload with the stats, the Ads Library (AfterLife's Fresh to test), the TV Library and
// the productions as timelines (no money). The server allows Growth only these (backend/src/middleware/auth.js).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, PenLine, Sparkles, Megaphone, GanttChart, Smartphone, Tv, Clapperboard, Check, Plug, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { studioApi } from '../../lib/studioService';
import { mediumApi } from '../../lib/mediumService';
import { meApi } from '../../lib/meService';
import { StudioCtx, useMondayWrites } from '../../components/studio/writes';
import { sundayOf, addDays, ymd } from '../../components/studio/Filters';
import Workload from '../../components/studio/Workload';
import Campaigns from '../../components/studio/Campaigns';
import TicketCreator from '../../components/studio/TicketCreator';
import TaskPanel from '../../components/studio/TaskPanel';
import WorkStats from '../../components/studio/WorkStats';
import AdsLibrary from '../../components/growth/AdsLibrary';
import GrowthProductions from '../../components/growth/GrowthProductions';
import MediumPage from '../medium/MediumPage';
import { TvLibrary } from '../library/LibraryPage';
import { SKIP_KEY } from './Welcome';

const TABS = [
  ['overview', 'Overview', LayoutDashboard],
  ['briefs', 'Briefs', PenLine],
  ['ticket', 'New ticket', Sparkles],
  ['campaigns', 'Campaigns', Megaphone],
  ['workload', 'Workload', GanttChart],
  ['ads', 'Ads Library', Smartphone],
  ['tv', 'TV Library', Tv],
  ['productions', 'Productions', Clapperboard],
];
const first = (n) => String(n || '').trim().split(/\s+/)[0];
const STATUS = { QUEUED: ['Writing', '#9aa1c7'], WRITING: ['Writing', '#9aa1c7'], PENDING_REVIEW: ['Waiting for you', '#fdab3d'], APPROVED: ['Approved', '#579bfc'], SUBMITTED: ['On Monday', '#00c875'], REJECTED: ['Rejected', '#c4c4c4'], DROPPED: ['Needs a fix', '#e2445c'], ERROR: ['Failed', '#e2445c'] };

export default function GrowthStudio() {
  const { user, isGrowth, isAdmin } = useAuth();
  const { brandId } = useBrand();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (k) => setParams(k === 'overview' ? {} : { tab: k });
  const [monday, setMonday] = useState(null);
  const writes = useMondayWrites({ readOnly: true });
  const [panel, setPanel] = useState(null);
  const openTask = useCallback((it, data) => setPanel({ it, data }), []);
  const ctx = useMemo(() => ({ writes, openTask, readOnly: true }), [writes, openTask]);

  // First visit: connect Monday (unless they skipped)
  useEffect(() => {
    meApi.monday().then((s) => {
      setMonday(s);
      let skipped = false;
      try { skipped = localStorage.getItem(SKIP_KEY) === '1'; } catch { /* ignore */ }
      if (isGrowth && !s.connected && !skipped) nav('/welcome', { replace: true });
    }).catch(() => null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Team activity: which tab they opened
  useEffect(() => { const l = TABS.find(([k]) => k === tab)?.[1]; if (l) meApi.pageView(`Growth Studio · ${l}`); }, [tab]);

  if (brandId && brandId !== 'particle' && ['briefs', 'ticket', 'campaigns', 'workload', 'overview'].includes(tab)) {
    return <div className="p-10 text-center text-sm text-gray-500">The Growth Studio works on Particle — switch to the Particle brand.</div>;
  }

  return (
    <StudioCtx.Provider value={ctx}>
      <div className="max-w-[2400px] mx-auto pb-16">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0808f8]">Growth Studio{isAdmin && !isGrowth ? ' · what the growth team sees' : ''}</div>
            <h1 className="font-black uppercase leading-none text-[40px] sm:text-[52px] mt-1" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>
              {user?.name ? `Hi ${first(user.name)}` : 'Growth Studio'}
            </h1>
          </div>
          <div className="ml-auto">
            {monday?.connected ? (
              <button type="button" onClick={() => nav('/welcome')} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200"><Check size={13} /> Monday: {monday.name || 'connected'}</button>
            ) : monday && (
              <button type="button" onClick={() => nav('/welcome')} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200"><Plug size={13} /> Connect your Monday</button>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 p-1 mb-4 rounded-2xl bg-white border border-gray-200 w-fit max-w-full" role="tablist" aria-label="Growth Studio">
          {TABS.map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl transition-colors ${tab === k ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={tab === k ? { background: '#030b2e' } : undefined}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>

        {tab === 'overview' && <Overview setTab={setTab} monday={monday} />}
        {tab === 'briefs' && <MediumPage growth />}
        {tab === 'ticket' && <TicketCreator />}
        {tab === 'campaigns' && <Campaigns />}
        {tab === 'workload' && <Workload f={{ preset: 'this_week', division: 'all', people: [], requesters: [], product: '', brands: [], colorBy: '', q: '', status: null }} />}
        {tab === 'ads' && <AdsLibrary />}
        {tab === 'tv' && <TvLibrary />}
        {tab === 'productions' && <GrowthProductions />}
      </div>
      {panel && <TaskPanel it={panel.it} data={panel.data} onClose={() => setPanel(null)} />}
      {writes.toastEl}
    </StudioCtx.Provider>
  );
}

/** The studio right now (stats), their briefs, and where to start. */
function Overview({ setTab, monday }) {
  const [data, setData] = useState(null);
  const [briefs, setBriefs] = useState(null);
  useEffect(() => {
    const today = ymd(new Date());
    const from = sundayOf(today);
    studioApi.dashboard({ from, to: addDays(from, 13), lite: true }).then(setData).catch(() => setData({ items: [] }));
    mediumApi.briefs({ mine: 1 }).then(r => setBriefs(r.briefs || [])).catch(() => setBriefs([]));
  }, []);
  const waiting = (briefs || []).filter(b => b.status === 'PENDING_REVIEW').length;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid md:grid-cols-3 gap-3">
        {[
          ['briefs', '✍️', 'Write a brief', 'Medium writes it in the team’s style — you approve it'],
          ['ticket', '✨', 'New ticket', 'Tell it what you need — it fills the Monday form'],
          ['ads', '📱', 'Ads Library', 'Fresh to test — finished creative that never ran'],
        ].map(([k, emoji, title, sub]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="group text-left rounded-2xl bg-white border border-gray-200 px-5 py-4 hover:border-[#0808f8]/50 hover:shadow-sm transition-all">
            <div className="text-2xl" aria-hidden="true">{emoji}</div>
            <div className="mt-1 font-black uppercase text-[22px] leading-none flex items-center gap-1.5" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>{title} <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" /></div>
            <div className="text-xs text-gray-500 mt-1">{sub}</div>
          </button>
        ))}
      </div>

      <section>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="font-black uppercase text-[24px] leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>The studio right now</h2>
          <button type="button" onClick={() => setTab('workload')} className="text-xs font-semibold text-[#0808f8] hover:underline">See the workload →</button>
        </div>
        {data ? <WorkStats items={data.items || []} /> : <div className="py-10 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
      </section>

      <section>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="font-black uppercase text-[24px] leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>Your briefs</h2>
          {waiting > 0 && <span className="text-xs font-semibold text-amber-700">{waiting} waiting for you</span>}
          <button type="button" onClick={() => setTab('briefs')} className="text-xs font-semibold text-[#0808f8] hover:underline ml-auto">All your briefs →</button>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {!briefs && <div className="py-8 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
          {briefs && !briefs.length && <div className="py-8 text-center text-sm text-gray-500">No briefs yet — <button type="button" className="font-semibold text-[#0808f8] underline" onClick={() => setTab('briefs')}>write your first one</button>.</div>}
          {(briefs || []).slice(0, 6).map(b => {
            const [label, color] = STATUS[b.status] || [b.status, '#c4c4c4'];
            return (
              <button key={b.id} type="button" onClick={() => setTab('briefs')} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f5f6ff]">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate text-[#030b2e]">{b.hook || b.ticket_name || 'Brief'}</span>
                  <span className="block text-[11px] text-gray-400 truncate">{[b.format === 'design' ? 'Static' : 'Video', b.product, b.ticket_name].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color, background: `${color}1f` }}>{label}</span>
              </button>
            );
          })}
        </div>
        {monday && !monday.connected && <div className="text-[11px] text-gray-400 mt-2">Your Monday isn’t connected — what you send is created by CP’s account, with your name in it.</div>}
      </section>
    </div>
  );
}
