// Home — the Creative team's day (Tomer, 25 Nov 2026: "give the creative team the full experience to arrange their
// dashboard"). What's late and due, what still needs your Frame.io / Figma link, what changed for you, your ads on air,
// the week ahead, the team weekly and your AfterLife — each a card you can move or hide (saved for you).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Sparkles, KanbanSquare, ArrowUp, ArrowDown, EyeOff, Eye, SlidersHorizontal, Check, Bell, Radio, CalendarDays, Presentation, Gauge,
  Link2, AlertTriangle, Clock, ArrowRight, Loader2, Film, PieChart, Trophy, Timer, GripVertical, RotateCcw,
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

// size = how wide on a big screen (of 6 columns): third 2 · half 3 · twothirds 4 · full 6
const WIDGETS = {
  line: { label: 'Line of the day', icon: Film, size: 'full', bare: true },
  focus: { label: 'Today', icon: AlertTriangle, size: 'twothirds' },
  clock: { label: 'My clock', icon: Timer, size: 'third' },
  wheel: { label: 'My week', icon: PieChart, size: 'twothirds' },
  month: { label: 'My month', icon: Trophy, size: 'third' },
  links: { label: 'Waiting for your link', icon: Link2, size: 'third' },
  news: { label: 'For you', icon: Bell, size: 'third' },
  onair: { label: 'Your ads on air', icon: Radio, size: 'third' },
  week: { label: 'Coming up', icon: CalendarDays, size: 'third' },
  weekly: { label: 'Team Weekly', icon: Presentation, size: 'third' },
  afterlife: { label: 'My AfterLife', icon: Gauge, size: 'third' },
};
const SIZES = [['third', '⅓', 2], ['half', '½', 3], ['twothirds', '⅔', 4], ['full', 'Full', 6]];
const SPAN = { third: 'md:col-span-1 lg:col-span-2', half: 'md:col-span-1 lg:col-span-3', twothirds: 'md:col-span-2 lg:col-span-4', full: 'md:col-span-2 lg:col-span-6' };
const ROW = 8, GAP = 16;   // the grid packs cards like a dashboard: 8px rows, each card spans as many as its height needs
const DEFAULT_LAYOUT = { order: ['line', 'focus', 'clock', 'links', 'wheel', 'month', 'news', 'week', 'onair', 'weekly', 'afterlife'], hidden: [], sizes: {} };
const sizeOf = (layout, k) => layout.sizes?.[k] || WIDGETS[k].size;
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

/**
 * A card you can drag anywhere (the ⠿ grip) and resize — ⅓ ½ ⅔ Full in its header, or drag its bottom-right corner
 * (25 Nov 2026: "be able to change sizes of widgets at Home and free dragging of locations"). Its height decides how
 * many 8px rows it takes, so cards pack without holes.
 */
function Card({ id, size, edit, onSize, onHide, children, action }) {
  const W = WIDGETS[id];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const inner = useRef(null);
  const [rows, setRows] = useState(20);
  useEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const fit = () => setRows(Math.max(1, Math.ceil((el.getBoundingClientRect().height + GAP) / (ROW + GAP))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // drag the corner: the width snaps to ⅓ · ½ · ⅔ · Full of the grid
  const startResize = (e) => {
    e.preventDefault(); e.stopPropagation();
    const grid = e.currentTarget.closest('[data-home-grid]');
    if (!grid || window.innerWidth < 1024) return;
    const colW = (grid.getBoundingClientRect().width + GAP) / 6;
    const x0 = e.clientX;
    const cols0 = SIZES.find(z => z[0] === size)?.[2] || 2;
    let last = size;
    const move = (ev) => {
      const want = Math.max(2, Math.min(6, cols0 + Math.round((ev.clientX - x0) / colW)));
      const snap = SIZES.reduce((a, z) => (Math.abs(z[2] - want) < Math.abs(a[2] - want) ? z : a), SIZES[0])[0];
      if (snap !== last) { last = snap; onSize(snap, false); }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onSize(last, true); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const controls = (
    <span className={`flex items-center gap-1 ${edit ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'} transition-opacity`}>
      <span className="hidden lg:flex p-0.5 rounded-lg bg-gray-100">
        {SIZES.map(([k, l]) => <button key={k} type="button" onClick={() => onSize(k, true)} title={`Width: ${l}`} className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-md ${size === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:text-gray-800'}`}>{l}</button>)}
      </span>
      <button type="button" onClick={onHide} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Hide this card" aria-label="Hide"><EyeOff size={13} /></button>
      <button type="button" {...attributes} {...listeners} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-grab active:cursor-grabbing touch-none" title="Drag to move" aria-label="Drag to move"><GripVertical size={14} /></button>
    </span>
  );
  return (
    <div ref={setNodeRef} style={{ gridRowEnd: `span ${rows}`, transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`group relative min-w-0 col-span-1 ${SPAN[size] || SPAN.third} ${isDragging ? 'opacity-80' : ''}`}>
      <div ref={inner}>
        {W.bare && !edit ? (
          <div className="relative">
            {children}
            <div className="absolute left-3 top-3 z-[2] rounded-xl bg-white/90 shadow px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{controls}</div>
          </div>
        ) : (
          <section className={`rounded-3xl bg-white border border-gray-200 shadow-[0_1px_3px_rgba(3,11,46,.05)] p-5 flex flex-col min-w-0 ${edit ? 'ring-2 ring-[#0808f8]/15' : ''} ${isDragging ? 'shadow-2xl' : ''}`}>
            <header className="flex items-center gap-2 mb-3 min-w-0">
              <W.icon size={15} className="text-[#0808f8] flex-none" />
              <h2 className="font-bold text-[14.5px] text-[#030b2e] truncate">{W.label}</h2>
              <span className="ml-auto flex items-center gap-1.5 flex-none">{!edit && action}{controls}</span>
            </header>
            {edit && W.bare ? <div className="text-[13px] text-gray-500">Today’s movie line — the same one the studio sees.</div> : children}
          </section>
        )}
      </div>
      <span onPointerDown={startResize} title="Drag to resize" className="hidden lg:block absolute right-1 bottom-1 w-4 h-4 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity z-[3]"
        style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(8,8,248,.45) 50%, rgba(8,8,248,.45) 60%, transparent 60%, transparent 70%, rgba(8,8,248,.45) 70%, rgba(8,8,248,.45) 80%, transparent 80%)', borderBottomRightRadius: 18 }} />
    </div>
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
      if (p && Array.isArray(p.order)) setLayout({ order: mergeOrder(p.order), hidden: (p.hidden || []).filter(k => WIDGETS[k]), sizes: Object.fromEntries(Object.entries(p.sizes || {}).filter(([k, v]) => WIDGETS[k] && SPAN[v])) });
    }).catch(() => null);
    onairApi.media().then(setMedia).catch(() => setMedia({ creatives: [] }));
    creativeApi.list().then(r => setWeekly((r.reports || []).filter(x => x.deck === 'team').sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)))[0] || null)).catch(() => setWeekly(null));
  }, [user?.id]);
  const save = (next) => { setLayout(next); if (user?.id) Promise.resolve(saveViewOrder(KEY, user.id, next, false)).catch(() => null); };
  const setSize = (k, size, persist) => { const next = { ...layout, sizes: { ...(layout.sizes || {}), [k]: size } }; if (persist) save(next); else setLayout(next); };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const o = layout.order;
    save({ ...layout, order: arrayMove(o, o.indexOf(active.id), o.indexOf(over.id)) });
  };
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
    line: <Inspiration />,
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
      {edit && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] rounded-2xl bg-[#0808f8]/5 border border-[#0808f8]/15 px-3 py-2">
          <span className="text-gray-600">Drag a card by <GripVertical size={12} className="inline" /> to move it anywhere · pick ⅓ ½ ⅔ Full (or drag its bottom-right corner) to resize · <EyeOff size={12} className="inline" /> hides it.</span>
          <button type="button" onClick={() => save({ ...DEFAULT_LAYOUT })} className="ml-auto flex items-center gap-1 font-semibold text-[#0808f8] hover:underline"><RotateCcw size={12} /> Back to the default</button>
        </div>
      )}
      {edit && layout.hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-gray-400">Hidden:</span>
          {layout.hidden.map(k => <button key={k} type="button" onClick={() => unhide(k)} className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-gray-600 hover:border-[#0808f8] hover:text-[#0808f8]"><Eye size={12} /> {WIDGETS[k].label}</button>)}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={rectSortingStrategy}>
          <div data-home-grid className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-6" style={{ gridAutoRows: `${ROW}px`, gridAutoFlow: 'row dense' }}>
            {shown.map((k) => (
              <Card key={k} id={k} size={sizeOf(layout, k)} edit={edit} onSize={(z, persist) => setSize(k, z, persist)} onHide={() => hide(k)}
                action={k === 'news' ? <button type="button" onClick={() => document.querySelector('[data-bell]')?.click()} className="text-[12px] font-semibold text-[#0808f8]">All</button>
                  : k === 'focus' ? <button type="button" onClick={() => nav('/my-studio')} className="text-[12px] font-semibold text-[#0808f8]">Board →</button> : null}>
                {body[k]}
              </Card>
            ))}
          </div>
        </SortableContext>
      </DndContext>
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
