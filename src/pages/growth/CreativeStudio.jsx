// Creative Studio (Growth team, 17 Nov 2026): Overview (the studio right now + their briefs), Workload (view only),
// By product (24 Nov: every product week by week, video / design, Meta or not) and My requests (the tickets they asked for, from their own Monday user). Briefs Creator, New ticket, Campaign Tracker,
// Ads Library, TV Productions and TV Library are their own entries in the left panel.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, GanttChart, Inbox, ArrowRight, Loader2, Boxes } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { studioApi } from '../../lib/studioService';
import { mediumApi } from '../../lib/mediumService';
import { meApi } from '../../lib/meService';
import { sundayOf, addDays, ymd } from '../../components/studio/Filters';
import Workload from '../../components/studio/Workload';
import WorkStats from '../../components/studio/WorkStats';
import ProductWeeks from '../../components/studio/ProductWeeks';
import GrowthShell, { useMondayStatus } from '../../components/growth/GrowthShell';
import MyRequests from '../../components/growth/MyRequests';
import { SKIP_KEY } from './Welcome';

const TABS = [['overview', 'Overview', LayoutDashboard], ['workload', 'Workload', GanttChart], ['products', 'By product', Boxes], ['requests', 'My requests', Inbox]];
const first = (n) => String(n || '').trim().split(/\s+/)[0];
const STATUS = { QUEUED: ['Writing', '#9aa1c7'], WRITING: ['Writing', '#9aa1c7'], PENDING_REVIEW: ['Waiting for you', '#fdab3d'], APPROVED: ['Approved', '#579bfc'], SUBMITTED: ['On Monday', '#00c875'], REJECTED: ['Rejected', '#c4c4c4'], DROPPED: ['Needs a fix', '#e2445c'], ERROR: ['Failed', '#e2445c'] };
const WORKLOAD_F = { preset: 'this_week', division: 'all', people: [], requesters: [], product: '', brands: [], colorBy: '', q: '', status: null };

export default function CreativeStudio() {
  const { user, isGrowth } = useAuth();
  const { brandId } = useBrand();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (k) => setParams(k === 'overview' ? {} : { tab: k });
  const monday = useMondayStatus();

  // First visit: connect Monday (unless they skipped)
  useEffect(() => {
    if (!isGrowth || !monday || monday.connected) return;
    let skipped = false;
    try { skipped = localStorage.getItem(SKIP_KEY) === '1'; } catch { /* ignore */ }
    if (!skipped) nav('/welcome', { replace: true });
  }, [monday, isGrowth, nav]);
  useEffect(() => { const l = TABS.find(([k]) => k === tab)?.[1]; if (l) meApi.pageView(`Creative Studio · ${l}`); }, [tab]);

  if (brandId && brandId !== 'particle') return <div className="p-10 text-center text-sm text-gray-500">The Creative Studio works on Particle — switch to the Particle brand.</div>;

  return (
    <GrowthShell eyebrow="Creative Studio" title={user?.name ? `Hi ${first(user.name)}` : 'Creative Studio'}>
      <nav className="grid grid-cols-2 sm:flex gap-1 p-1 mb-4 rounded-2xl bg-white border border-gray-200 w-full sm:w-fit" role="tablist" aria-label="Creative Studio">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex items-center justify-center gap-1.5 text-[13px] sm:text-sm font-semibold px-2 sm:px-3.5 py-2 rounded-xl whitespace-nowrap transition-colors ${tab === k ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            style={tab === k ? { background: '#030b2e' } : undefined}>
            <Icon size={15} className="hidden sm:block" /> {k === 'requests' ? <><span className="sm:hidden">Requests</span><span className="hidden sm:inline">{label}</span></> : label}
          </button>
        ))}
      </nav>
      {tab === 'overview' && <Overview setTab={setTab} monday={monday} />}
      {tab === 'workload' && <Workload f={WORKLOAD_F} />}
      {tab === 'products' && <ProductWeeks />}
      {tab === 'requests' && <MyRequests />}
    </GrowthShell>
  );
}

/** The studio right now (stats), their briefs, and where to start. */
function Overview({ setTab, monday }) {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [briefs, setBriefs] = useState(null);
  useEffect(() => {
    const from = sundayOf(ymd(new Date()));
    studioApi.dashboard({ from, to: addDays(from, 13), lite: true }).then(setData).catch(() => setData({ items: [] }));
    mediumApi.briefs({ mine: 1 }).then(r => setBriefs(r.briefs || [])).catch(() => setBriefs([]));
  }, []);
  const waiting = (briefs || []).filter(b => b.status === 'PENDING_REVIEW').length;
  const H2 = ({ children }) => <h2 className="font-black uppercase text-[22px] sm:text-[24px] leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>{children}</h2>;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ['/medium?tab=create', '✍️', 'Write a brief', 'Medium writes it in the team’s style — you approve it'],
          ['/new-ticket', '✨', 'New ticket', 'Tell it what you need — it fills the Monday form'],
          ['?tab=requests', '📥', 'My requests', 'Where the tickets you asked for are right now'],
        ].map(([to, emoji, title, sub]) => (
          <button key={title} type="button" onClick={() => (to.startsWith('?') ? setTab('requests') : nav(to))} className="group text-left rounded-2xl bg-white border border-gray-200 px-5 py-4 hover:border-[#0808f8]/50 hover:shadow-sm transition-all">
            <div className="text-2xl" aria-hidden="true">{emoji}</div>
            <div className="mt-1 font-black uppercase text-[22px] leading-none flex items-center gap-1.5" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>{title} <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" /></div>
            <div className="text-xs text-gray-500 mt-1">{sub}</div>
          </button>
        ))}
      </div>

      <section>
        <div className="flex items-baseline gap-2 mb-2"><H2>The studio right now</H2><button type="button" onClick={() => setTab('workload')} className="text-xs font-semibold text-[#0808f8] hover:underline">Workload →</button></div>
        {data ? <WorkStats items={data.items || []} /> : <div className="py-10 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline gap-2 mb-2">
          <H2>Your briefs</H2>
          {waiting > 0 && <span className="text-xs font-semibold text-amber-700">{waiting} waiting for you</span>}
          <button type="button" onClick={() => nav('/medium?tab=briefs')} className="text-xs font-semibold text-[#0808f8] hover:underline ml-auto">Briefs Creator →</button>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {!briefs && <div className="py-8 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
          {briefs && !briefs.length && <div className="py-8 text-center text-sm text-gray-500">No briefs yet — <button type="button" className="font-semibold text-[#0808f8] underline" onClick={() => nav('/medium?tab=create')}>write your first one</button>.</div>}
          {(briefs || []).slice(0, 6).map(b => {
            const [label, color] = STATUS[b.status] || [b.status, '#c4c4c4'];
            return (
              <button key={b.id} type="button" onClick={() => nav(`/medium?tab=briefs&brief=${b.id}`)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f5f6ff]">
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
