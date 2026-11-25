// Home — the Creative team's day (Tomer, 25 Nov 2026: "give the creative team the full experience to arrange their
// dashboard"). What's late and due, what still needs your Frame.io / Figma link, what changed for you, your ads on air,
// the week ahead, the team weekly and your AfterLife — each a card you can move or hide (saved for you).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Sparkles, KanbanSquare, ArrowUp, ArrowDown, EyeOff, Eye, SlidersHorizontal, Check, Bell, Radio, CalendarDays, Presentation, Gauge,
  Link2, AlertTriangle, Clock, ArrowRight, Loader2, Film, PieChart, Trophy, Timer,
} from 'lucide-react';
import Inspiration from '../../components/studio/Inspiration';
import WeekWheel from '../../components/creative-team/WeekWheel';
import MyMonth from '../../components/creative-team/MyMonth';
import ClockCard from '../../components/creative-team/ClockCard';
import CreativeShell, { MyTasksProvider, useMyTasks, FreshBadge } from '../../components/creative-team/CreativeShell';
import { useStudio, fmtDay, firstName } from '../../components/studio/writes';
import { smartSort, urgency, dueWords, nextStatus } from '../../components/studio/kanban';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { getViewOrder, saveViewOrder } from '../../lib/dataService';
import { onairApi } from '../../lib/onairService';
import { creativeApi } from '../../lib/creativeReportService';
import { meApi } from '../../lib/meService';
import { routeOf, NOTIFY_LOOK } from '../../lib/notifyRoute';

const WIDGETS = {
  line: { label: 'Line of the day', icon: Film, full: true, bare: true },
  focus: { label: 'Today', icon: AlertTriangle, wide: true },
  clock: { label: 'My clock', icon: Timer },
  wheel: { label: 'My week', icon: PieChart, wide: true },
  month: { label: 'My month', icon: Trophy },
  links: { label: 'Waiting for your link', icon: Link2 },
  news: { label: 'For you', icon: Bell },
  onair: { label: 'Your ads on air', icon: Radio },
  week: { label: 'Coming up', icon: CalendarDays },
  weekly: { label: 'Team Weekly', icon: Presentation },
  afterlife: { label: 'My AfterLife', icon: Gauge },
};
const DEFAULT_LAYOUT = { order: ['line', 'focus', 'clock', 'links', 'wheel', 'month', 'news', 'onair', 'week', 'weekly', 'afterlife'], hidden: [] };
/** A saved layout + cards added since: each new card goes where it sits in the default order (not at the end). */
function mergeOrder(saved) {
  const order = saved.filter(k => WIDGETS[k]);
  DEFAULT_LAYOUT.order.forEach((k, i) => {
    if (order.includes(k)) return;
    const before = DEFAULT_LAYOUT.order.slice(0, i).reverse().find(x => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
  });
  return order;
}
const KEY = 'creative-home';
const hello = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' })); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 60000; return m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

function Card({ id, edit, first, last, onUp, onDown, onHide, children, action }) {
  const W = WIDGETS[id];
  return (
    W.bare && !edit ? <section className="md:col-span-2 lg:col-span-3 min-w-0">{children}</section> :
    <section className={`rounded-3xl bg-white border border-gray-200 shadow-[0_1px_3px_rgba(3,11,46,.05)] p-5 flex flex-col min-w-0 ${W.full ? 'md:col-span-2 lg:col-span-3' : W.wide ? 'lg:col-span-2' : ''} ${edit ? 'ring-2 ring-[#0808f8]/15' : ''}`}>
      <header className="flex items-center gap-2 mb-3">
        <W.icon size={15} className="text-[#0808f8]" />
        <h2 className="font-bold text-[14.5px] text-[#030b2e]">{W.label}</h2>
        <span className="ml-auto flex items-center gap-1">
          {edit ? (
            <>
              <button type="button" disabled={first} onClick={onUp} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" disabled={last} onClick={onDown} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button>
              <button type="button" onClick={onHide} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Hide"><EyeOff size={14} /></button>
            </>
          ) : action}
        </span>
      </header>
      {children}
    </section>
  );
}

const Empty = ({ children }) => <div className="text-[13px] text-gray-400 py-4 text-center">{children}</div>;

function TaskRow({ it, today, onOpen, extra }) {
  const u = urgency(it, today);
  return (
    <button type="button" onClick={() => onOpen(it)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#0808f8]/[0.04] text-left">
      <span className="w-1 self-stretch rounded-full" style={{ background: it.product?.color || '#c4c4c4' }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0"><span className="text-[13.5px] font-semibold text-[#030b2e] truncate">{it.title || it.name}</span><FreshBadge id={it.id} /></span>
        <span className="block text-[11.5px] text-gray-400 truncate">{[it.product?.label, it.status?.label].filter(Boolean).join(' · ')}</span>
      </span>
      {extra}
      {dueWords(it, today) && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md flex-none ${u === 'overdue' ? 'bg-red-50 text-red-700' : u === 'today' ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-500'}`}>{dueWords(it, today)}</span>}
    </button>
  );
}

function HomeBody() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, loading, panelData, reload } = useMyTasks();
  const { writes, openTask } = useStudio();
  const { notifications = [], markRead } = useNotifications() || {};
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [edit, setEdit] = useState(false);
  const [media, setMedia] = useState(null);
  const [weekly, setWeekly] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    Promise.resolve(getViewOrder(KEY, user.id)).then(p => {
      if (p && Array.isArray(p.order)) setLayout({ order: mergeOrder(p.order), hidden: (p.hidden || []).filter(k => WIDGETS[k]) });
    }).catch(() => null);
    onairApi.media().then(setMedia).catch(() => setMedia({ creatives: [] }));
    creativeApi.list().then(r => setWeekly((r.reports || []).filter(x => x.deck === 'team').sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)))[0] || null)).catch(() => setWeekly(null));
  }, [user?.id]);
  const save = (next) => { setLayout(next); if (user?.id) Promise.resolve(saveViewOrder(KEY, user.id, next, false)).catch(() => null); };
  const move = (k, d) => { const o = [...layout.order]; const i = o.indexOf(k); const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; save({ ...layout, order: o }); };
  const hide = (k) => save({ ...layout, hidden: [...new Set([...layout.hidden, k])] });
  const unhide = (k) => save({ ...layout, hidden: layout.hidden.filter(x => x !== k) });

  const today = data?.today;
  const items = useMemo(() => (data?.items || []).map(it => writes.merge(it, data.generated_at)), [data, writes]);
  const open = useCallback((it, opts) => openTask(it, panelData, opts), [openTask, panelData]);
  const openItems = items.filter(it => it.open);
  const ranked = today ? smartSort(openItems, today) : [];
  const counts = today ? ['overdue', 'today', 'soon'].map(k => openItems.filter(it => urgency(it, today) === k).length) : [0, 0, 0];
  const needLink = openItems.filter(it => ['in_progress', 'fixes'].includes(it.status?.category) && ((it.board === 'video' && !it.links?.frame) || (it.board === 'design' && !it.links?.figma)));
  const coming = today ? openItems.filter(it => it.deadline && it.deadline >= today).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 6) : [];
  const me = String(user?.name || '').toLowerCase().trim();
  const myAds = (media?.creatives || []).filter(c => String(c.maker || '').toLowerCase().trim() === me);
  const news = notifications.slice(0, 6);
  const go = (n) => { if (!n.read) markRead?.(n.id); const r = routeOf(n, user?.role); if (r?.to) nav(r.to); else if (r?.href) window.open(r.href, '_blank', 'noopener'); };

  const body = {
    line: edit ? <div className="text-[13px] text-gray-500">Today’s movie line — the same one the studio sees.</div> : <Inspiration />,
    wheel: <WeekWheel items={items} people={data?.people || {}} today={today} onOpen={open} Row={TaskRow} />,
    month: <MyMonth ads={myAds} />,
    clock: <ClockCard />,
    focus: (
      <>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[['Overdue', counts[0], 'bg-red-50 text-red-700'], ['Due today', counts[1], 'bg-orange-50 text-orange-700'], ['Next 2 days', counts[2], 'bg-amber-50 text-amber-700']].map(([l, n, cls]) => (
            <div key={l} className={`rounded-2xl px-3 py-2.5 ${cls}`}><div className="text-[24px] font-black leading-none">{n}</div><div className="text-[12px] font-semibold mt-1">{l}</div></div>
          ))}
        </div>
        {loading && !data ? <div className="py-6 text-center text-gray-400"><Loader2 className="inline animate-spin" size={16} /></div>
          : ranked.length ? <div className="flex flex-col">{ranked.slice(0, 6).map(it => {
            const nxt = nextStatus(it, data.boards?.[it.board]?.statuses);
            return <TaskRow key={it.id} it={it} today={today} onOpen={open} extra={nxt && <span onClick={(e) => { e.stopPropagation(); if (writes.save(it, { status: nxt }, panelData)) setTimeout(() => reload(true), 2500); }} role="button" className="hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-dashed text-gray-500 hover:text-[#030b2e] flex-none" style={{ borderColor: nxt.color }}><ArrowRight size={11} />{nxt.label}</span>} />;
          })}</div> : <Empty>Nothing open — enjoy it ✨</Empty>}
      </>
    ),
    links: needLink.length ? <div className="flex flex-col">{needLink.slice(0, 5).map(it => <TaskRow key={it.id} it={it} today={today} onOpen={(x) => open(x, { focus: 'link' })} extra={<span className="text-[11px] font-semibold text-[#0808f8] flex-none">+ {it.board === 'video' ? 'Frame.io' : 'Figma'}</span>} />)}</div>
      : <Empty>Every task you’re working on has its link ✓</Empty>,
    news: news.length ? <div className="flex flex-col gap-1">{news.map(n => {
      const look = NOTIFY_LOOK[n.type] || { emoji: '•', color: '#9ca3af' };
      return (
        <button key={n.id} type="button" onClick={() => go(n)} className={`flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-gray-50 ${n.read ? '' : 'bg-[#0808f8]/[0.04]'}`}>
          <span className="w-7 h-7 rounded-full flex-none flex items-center justify-center text-[12px] font-bold text-white" style={{ background: look.color }}>{look.emoji}</span>
          <span className="min-w-0 flex-1 text-[12.5px] text-gray-700 leading-snug line-clamp-2">{n.message}</span>
          <span className="text-[11px] text-gray-400 flex-none">{ago(n.created_at)}</span>
        </button>
      );
    })}</div> : <Empty>Nothing new. When your tasks move or someone writes, it shows here.</Empty>,
    onair: !media ? <div className="py-6 text-center text-gray-400"><Loader2 className="inline animate-spin" size={16} /></div>
      : myAds.length ? (
        <>
          <div className="text-[13px] text-gray-600 mb-2"><b className="text-[#030b2e] text-[20px]">{myAds.filter(c => c.live).length}</b> running · {myAds.length} in the last two weeks</div>
          <div className="grid grid-cols-3 gap-2">{myAds.slice(0, 6).map(c => (
            <button key={c.key} type="button" onClick={() => nav('/on-air')} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100" title={c.label}>
              {c.thumb && <img src={c.thumb} alt="" className="w-full h-full object-cover" />}
              <span className={`absolute left-1 top-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${c.live ? 'bg-emerald-500 text-white' : 'bg-gray-700/80 text-white'}`}>{c.live ? 'Live' : 'Ended'}</span>
            </button>
          ))}</div>
        </>
      ) : <Empty>None of yours ran on Meta in the last two weeks.</Empty>,
    week: coming.length ? <div className="flex flex-col">{coming.map(it => <TaskRow key={it.id} it={it} today={today} onOpen={open} extra={<span className="text-[11px] text-gray-400 flex-none">{fmtDay(it.deadline)}</span>} />)}</div>
      : <Empty>No deadlines coming up.</Empty>,
    weekly: weekly ? (
      <a href={`/creative-reports/${weekly.id}/present`} className="block rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg,#030b2e,#0808f8)' }}>
        <div className="text-[11px] uppercase tracking-wider text-white/60 font-bold">Latest</div>
        <div className="text-[20px] font-black mt-0.5">{weekly.week_label || `Week of ${fmtDay(String(weekly.week_start).slice(0, 10))}`}</div>
        <div className="text-[12.5px] text-white/75 mt-1">{weekly.totals?.delivered ?? 0} delivered · watch it →</div>
      </a>
    ) : <Empty>The team weekly comes out on Sunday.</Empty>,
    afterlife: (
      <button type="button" onClick={() => nav('/my-afterlife')} className="w-full text-left rounded-2xl p-4 border border-gray-200 hover:border-[#0808f8]/40 hover:shadow-sm">
        <div className="text-[14px] font-bold text-[#030b2e]">How your work does on Meta</div>
        <div className="text-[12.5px] text-gray-500 mt-1">Your spend, ROAS, hook and hold — and every creative of yours that ran. Opens your AfterLife →</div>
      </button>
    ),
  };

  const shown = layout.order.filter(k => !layout.hidden.includes(k));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => nav('/new-ticket')} className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-xl text-white" style={{ background: '#0808f8' }}><Plus size={15} /> New ticket</button>
        <button type="button" onClick={() => nav('/medium')} className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700"><Sparkles size={15} /> New brief</button>
        <button type="button" onClick={() => nav('/my-studio')} className="flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700"><KanbanSquare size={15} /> My board</button>
        <button type="button" onClick={() => setEdit(v => !v)} className={`ml-auto flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-xl border ${edit ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'border-gray-200 bg-white text-gray-600'}`}>
          {edit ? <><Check size={15} /> Done</> : <><SlidersHorizontal size={15} /> Arrange</>}
        </button>
      </div>
      {edit && layout.hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-gray-400">Hidden:</span>
          {layout.hidden.map(k => <button key={k} type="button" onClick={() => unhide(k)} className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-600 hover:border-[#0808f8] hover:text-[#0808f8]"><Eye size={12} /> {WIDGETS[k].label}</button>)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3 md:grid-cols-2 items-start">
        {shown.map((k, i) => (
          <Card key={k} id={k} edit={edit} first={i === 0} last={i === shown.length - 1} onUp={() => move(k, -1)} onDown={() => move(k, 1)} onHide={() => hide(k)}
            action={k === 'news' ? <button type="button" onClick={() => document.querySelector('[data-bell]')?.click()} className="text-[12px] font-semibold text-[#0808f8]">All</button>
              : k === 'focus' ? <button type="button" onClick={() => nav('/my-studio')} className="text-[12px] font-semibold text-[#0808f8]">Board →</button> : null}>
            {body[k]}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function CreativeHome() {
  const { user } = useAuth();
  useEffect(() => { meApi.pageView('Home'); }, []);
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Jerusalem' });
  return (
    <MyTasksProvider>
      <CreativeShell eyebrow={date} title={`${hello()}, ${firstName(user?.name) || 'there'}`} sub="Your day at a glance — arrange it the way you like.">
        <HomeBody />
      </CreativeShell>
    </MyTasksProvider>
  );
}
