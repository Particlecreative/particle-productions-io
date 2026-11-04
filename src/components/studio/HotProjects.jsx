import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Flame, Plus, RefreshCw, Loader2, AlertTriangle, X, Search, ExternalLink, Film, Folder, PenTool, GripVertical, Check,
  CheckCircle2, Clock3, BadgeCheck, Pencil, Trash2, MessageSquare, Link2, CalendarClock, UserRound, Sparkles,
} from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { useStudio } from './writes';
import { Avatar, StatusPill, ProductTag, TimelinePill, Empty, DIVISION, CATEGORY, CATEGORY_ORDER, NAVY, ELECTRIC, hrs } from './Bits';

// Hot Projects — the big projects the studio is running right now, pinned by the team, with all their Monday data.
const STALE_MS = 2 * 60 * 1000;
const DISPLAY = '"Sofia Sans Extra Condensed", sans-serif';
const HEALTH = {
  on_track: { label: 'On track', color: '#00a35c', bg: '#e6f8ef', Icon: CheckCircle2 },
  at_risk: { label: 'At risk', color: '#d97a00', bg: '#fff3e0', Icon: AlertTriangle },
  late: { label: 'Late', color: '#d83a52', bg: '#fdecee', Icon: Clock3 },
  done: { label: 'Delivered', color: '#037f4c', bg: '#e6f4ee', Icon: BadgeCheck },
};
// The road every ticket travels; Fixes counts as Working, Paused / Stuck flag the step it stopped at
const STEPS = [['queued', 'Brief'], ['in_progress', 'Working'], ['review', 'Review'], ['delivered', 'Done']];
const STEP_OF = { queued: 0, in_progress: 1, fixes: 1, review: 2, delivered: 3 };
const TIMERS = [['working', 'Working time'], ['review', 'Reviewing time'], ['lifecycle', 'Request → completion'], ['stuck', 'Time stuck'], ['upload', 'Time to upload']];
let cache = null; // { data, at } — coming back to the tab is instant

const day = (s) => Date.parse(`${s}T12:00:00Z`);
const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);
const fmt = (d) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');
const fmtTs = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
const ago = (iso) => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60e3))}m ago`;
  if (ms < 86400e3) return `${Math.round(ms / 3600e3)}h ago`;
  if (ms < 7 * 86400e3) return `${Math.round(ms / 86400e3)}d ago`;
  return fmtTs(iso);
};
/** Calendar seconds → "3.5d" / "6h" */
const span = (s) => {
  if (!s) return '0';
  const d = s / 86400;
  if (d >= 1) return `${d >= 10 ? Math.round(d) : Math.round(d * 10) / 10}d`;
  return `${Math.max(1, Math.round(s / 3600))}h`;
};
const dueOf = (it) => it.deadline || it.timeline?.to || null;
const priorityHot = (p) => /critical|high/i.test(p?.label || '');
const nameOf = (data, uid) => data.people?.[uid]?.name || data.requesters?.[uid]?.name || 'Someone';
const first = (name) => (name || '').split(' ')[0];

function useClickAway(ref, onAway, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onAway, active]);
}

export default function HotProjects({ studioData }) {
  const { writes, openTask } = useStudio();
  const [raw, setRaw] = useState(() => cache?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [viewId, setViewId] = useState(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const d = await studioApi.hotProjects({ force });
      cache = { data: d, at: Date.now() };
      setRaw(d);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!cache || Date.now() - cache.at > STALE_MS) load(); }, [load]);
  // Effort comes from the Studio's week build — when it wasn't ready yet, check back once it should be
  useEffect(() => {
    if (!raw?.effort_pending) return undefined;
    const t = setTimeout(() => load(), 30000);
    return () => clearTimeout(t);
  }, [raw, load]);

  // Edits made in the task panel show here straight away
  const data = useMemo(() => (raw ? { ...raw, items: raw.items.map(it => writes.merge(it, raw.generated_at)) } : null), [raw, writes.merge]); // eslint-disable-line react-hooks/exhaustive-deps
  const itemsById = useMemo(() => new Map((data?.items || []).map(i => [i.id, i])), [data]);
  const projects = useMemo(() => (data?.projects || []).map(p => ({ ...p, main: itemsById.get(p.item_id), relatedItems: (p.related_ids || []).map(id => itemsById.get(id)).filter(Boolean) })), [data, itemsById]);
  const today = data?.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  // The task panel wants the Studio's people (roles, time off); our own map is the fallback
  const panelData = useMemo(() => studioData || (data ? { ...data, generated_at: data.generated_at } : null), [studioData, data]);
  const editTask = (it) => openTask(it, panelData);

  const patchLocal = (fn) => setRaw((r) => { const next = fn(r); cache = { data: next, at: cache?.at || Date.now() }; return next; });
  const reorder = async (ids) => {
    patchLocal(r => ({ ...r, projects: ids.map(id => r.projects.find(p => p.id === id)).filter(Boolean) }));
    try { await studioApi.orderHot(ids); } catch (e) { setError(e.message); load(true); }
  };
  const remove = async (p) => {
    patchLocal(r => ({ ...r, projects: r.projects.filter(x => x.id !== p.id) }));
    setViewId(null);
    try { await studioApi.removeHot(p.id); } catch (e) { setError(e.message); load(true); }
  };
  const update = async (p, patch) => {
    patchLocal(r => ({ ...r, projects: r.projects.map(x => (x.id === p.id ? { ...x, ...patch } : x)) }));
    try {
      await studioApi.updateHot(p.id, patch);
      if (patch.related) load(true); // the related tickets' data comes from Monday
    } catch (e) { setError(e.message); load(true); }
  };

  const viewing = projects.find(p => p.id === viewId);

  return (
    <div className="flex flex-col gap-5">
      <Hero projects={projects} data={data} today={today} loading={loading} onAdd={() => setAdding(true)} onRefresh={() => load(true)} />

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
          <button type="button" onClick={() => load(true)} className="ml-auto font-semibold underline">Try again</button>
        </div>
      )}
      {data?.warnings?.length > 0 && <div className="text-xs text-amber-700">{data.warnings.join(' · ')}</div>}

      {!data ? (
        !error && (
          <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-3">
            <Loader2 className="animate-spin" />
            <span className="text-sm">Reading the hot projects from Monday…</span>
          </div>
        )
      ) : !projects.length ? (
        <FirstRun onAdded={() => load(true)} onBrowse={() => setAdding(true)} />
      ) : (
        <ProjectGrid projects={projects} data={data} today={today} onOpen={(p) => setViewId(p.id)} onReorder={reorder} />
      )}

      {adding && <AddProjects onClose={() => setAdding(false)} onAdded={() => load(true)} />}
      {viewing && (
        <ProjectView p={viewing} data={data} today={today} onClose={() => setViewId(null)}
          onEditTask={editTask} onRemove={() => remove(viewing)} onUpdate={(patch) => update(viewing, patch)} />
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────
function Hero({ projects, data, today, loading, onAdd, onRefresh }) {
  const live = projects.filter(p => p.main);
  const counts = { on_track: 0, at_risk: 0, late: 0, done: 0 };
  for (const p of live) counts[p.health?.key || 'on_track']++;
  const next = live.filter(p => p.main.open && dueOf(p.main) && dueOf(p.main) >= today).sort((a, b) => dueOf(a.main).localeCompare(dueOf(b.main)))[0];
  const week = live.reduce((a, p) => a + [p.main, ...p.relatedItems].reduce((s, it) => s + (it.effort_week_s || 0), 0), 0);
  return (
    <section className="relative overflow-hidden rounded-3xl text-white px-6 py-5"
      style={{ background: `radial-gradient(90% 160% at 100% 0%, rgba(255,106,0,.45) 0%, rgba(255,106,0,0) 50%), radial-gradient(70% 120% at 0% 100%, rgba(8,8,248,.55) 0%, rgba(8,8,248,0) 60%), ${NAVY}` }}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-none" style={{ background: 'linear-gradient(135deg,#ff8a00,#ff3d00)', boxShadow: '0 8px 24px rgba(255,90,0,.35)' }}>
            <Flame size={26} />
          </span>
          <div className="min-w-0">
            <h2 className="text-4xl font-black uppercase leading-none tracking-tight" style={{ fontFamily: DISPLAY }}>Hot Projects</h2>
            <p className="text-sm text-white/65 mt-1">The big projects the studio is running right now — live from Monday.</p>
          </div>
        </div>
        <div className="flex items-stretch gap-2 flex-wrap">
          <HeroStat value={live.length} label={live.length === 1 ? 'project' : 'projects'} />
          {['on_track', 'at_risk', 'late'].map(k => <HeroStat key={k} value={counts[k]} label={HEALTH[k].label} dot={HEALTH[k].color} dim={!counts[k]} />)}
          {week > 0 && <HeroStat value={hrs(week)} label="worked this week" />}
          {next && <HeroStat value={fmt(dueOf(next.main))} label={`next due · ${next.title || next.main.title}`} wide />}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data && <span className="hidden md:inline text-xs text-white/50">Updated {ago(data.generated_at)}</span>}
          <button type="button" onClick={onRefresh} disabled={loading} title="Refresh from Monday"
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-white text-[#030b2e] hover:bg-orange-50 transition-colors shadow">
            <Plus size={16} /> Add projects
          </button>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label, dot, dim, wide }) {
  return (
    <div className={`rounded-2xl bg-white/[.07] border border-white/10 px-3.5 py-2 ${dim ? 'opacity-50' : ''} ${wide ? 'max-w-[220px]' : ''}`}>
      <div className="text-2xl font-black tabular-nums leading-none" style={{ fontFamily: DISPLAY }}>{value}</div>
      <div className="flex items-center gap-1.5 text-[11px] text-white/60 mt-1 truncate">
        {dot && <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: dot }} />}
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

// ── Cards ───────────────────────────────────────────────────────────────────
function ProjectGrid({ projects, data, today, onOpen, onReorder }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = projects.map(p => p.id);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => { if (over && active.id !== over.id) onReorder(arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))); }}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))' }}>
          {projects.map(p => <SortableCard key={p.id} p={p} data={data} today={today} onOpen={() => onOpen(p)} />)}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({ p, data, today, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined, opacity: isDragging ? 0.85 : 1 }}>
      {p.main
        ? <ProjectCard p={p} data={data} today={today} onOpen={onOpen} handle={{ ...attributes, ...listeners }} />
        : <MissingCard p={p} handle={{ ...attributes, ...listeners }} />}
    </div>
  );
}

function Handle({ handle, light }) {
  return (
    <button type="button" {...handle} onClick={(e) => e.stopPropagation()} aria-label="Drag to reorder"
      className={`p-1 rounded-lg cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 focus-visible:opacity-100 ${light ? 'text-white hover:bg-white/10' : 'text-gray-400 hover:bg-gray-100'}`}>
      <GripVertical size={16} />
    </button>
  );
}

function PriorityChip({ priority, onDark }) {
  if (!priority?.label) return null;
  const hot = priorityHot(priority);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={onDark ? { background: hot ? 'rgba(255,106,0,.22)' : 'rgba(255,255,255,.12)', color: hot ? '#ffb27a' : 'rgba(255,255,255,.8)' } : { background: `${priority.color || '#c4c4c4'}1f`, color: priority.color || '#666' }}>
      {hot && <Flame size={11} />}{priority.label.replace(/[⚠️️]/g, '').trim()}
    </span>
  );
}

function HealthChip({ health, big }) {
  const h = HEALTH[health?.key] || HEALTH.on_track;
  const Icon = h.Icon;
  return (
    <span className={`inline-flex items-center gap-1 font-bold rounded-full whitespace-nowrap ${big ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5'}`}
      style={{ background: h.bg, color: h.color }} title={health?.reasons?.join(' · ') || h.label}>
      <Icon size={big ? 13 : 12} /> {h.label}
    </span>
  );
}

/** Brief → Working → Review → Done, with where this ticket is (and whether it stopped there). */
function Stepper({ it, onDark }) {
  const cat = it.status.category;
  const lastMoving = [...(it.journey || [])].reverse().find(s => STEP_OF[s.category] != null)?.category;
  const at = STEP_OF[cat] ?? STEP_OF[lastMoving] ?? 0;
  const halted = cat === 'stuck' ? '#e2445c' : cat === 'paused' ? '#9d99b9' : null;
  const done = cat === 'delivered';
  const line = onDark ? 'rgba(255,255,255,.18)' : '#e5e7eb';
  return (
    <div className="flex items-center gap-1.5" aria-label={`Stage: ${STEPS[at][1]}`}>
      {STEPS.map(([k, label], i) => {
        const past = i < at || done;
        const cur = i === at && !done;
        const color = cur ? (halted || (cat === 'fixes' ? CATEGORY.fixes.color : CATEGORY[k]?.color || ELECTRIC)) : past ? (onDark ? '#7ea2ff' : ELECTRIC) : line;
        return (
          <div key={k} className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="relative flex items-center gap-1.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: color, boxShadow: cur ? `0 0 0 3px ${color}40` : undefined }} />
              <span className={`text-[10px] font-semibold uppercase tracking-wider truncate ${cur ? '' : onDark ? 'text-white/45' : 'text-gray-400'}`}
                style={cur ? { color: onDark ? '#fff' : NAVY } : undefined}>
                {cur && cat === 'fixes' ? 'Fixes' : cur && halted ? (cat === 'stuck' ? 'Stuck' : 'Paused') : label}
              </span>
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 min-w-[8px]" style={{ background: past ? (onDark ? '#7ea2ff' : ELECTRIC) : line }} />}
          </div>
        );
      })}
    </div>
  );
}

function Countdown({ it, today, big, compact }) {
  if (!it.open) return <span className={`${big ? 'text-sm' : 'text-xs'} font-semibold text-emerald-700`}>Delivered {fmtTs(it.life?.completed)}</span>;
  const due = dueOf(it);
  if (!due) return <span className={`${big ? 'text-sm' : 'text-xs'} text-gray-400`}>No deadline</span>;
  const d = daysBetween(today, due);
  const late = d < 0;
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-black tabular-nums leading-none ${big ? 'text-4xl' : 'text-2xl'}`} style={{ fontFamily: DISPLAY, color: late ? '#d83a52' : d <= 2 ? '#d97a00' : NAVY }}>
        {late ? -d : d === 0 ? 'Today' : d}
      </span>
      {d !== 0 && <span className={`${big ? 'text-sm' : 'text-xs'} font-semibold ${late ? 'text-[#d83a52]' : 'text-gray-500'}`}>{late ? `${-d === 1 ? 'day' : 'days'} late` : `${d === 1 ? 'day' : 'days'} left`}</span>}
      {!compact && <span className="text-xs text-gray-400">· {it.deadline ? 'deadline' : 'timeline ends'} {fmt(due)}</span>}
    </span>
  );
}

function Links({ it, size = 15 }) {
  const links = [
    [it.monday_url, 'Open in Monday', ExternalLink],
    [it.links?.frame, 'Frame.io', Film],
    [it.links?.dropbox, 'Dropbox', Folder],
    [it.links?.figma, 'Figma', PenTool],
    [it.links?.project, 'Project link', Link2],
  ].filter(([u]) => u);
  return (
    <span className="flex items-center gap-0.5">
      {links.map(([url, title, Icon]) => (
        <a key={title} href={url} target="_blank" rel="noopener noreferrer" title={title} onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#030b2e] hover:bg-gray-100">
          <Icon size={size} />
        </a>
      ))}
    </span>
  );
}

function ProjectCard({ p, data, today, onOpen, handle }) {
  const it = p.main;
  const all = [it, ...p.relatedItems];
  const div = DIVISION[it.division] || DIVISION[it.board];
  const effort = all.reduce((a, x) => a + (x.effort_total_s || 0), 0);
  const effortWeek = all.reduce((a, x) => a + (x.effort_week_s || 0), 0);
  const fixes = all.reduce((a, x) => a + (x.fix_rounds || 0), 0);
  const updates = all.reduce((a, x) => a + (x.updates?.count || 0), 0);
  const people = [...new Set(all.flatMap(x => x.people))].map(uid => data.people[uid]).filter(Boolean);
  const askers = [...new Set(it.requested_by)].map(uid => data.people[uid]).filter(Boolean);
  const latest = all.flatMap(x => x.updates?.recent || []).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
  const daysIn = it.life?.submitted ? Math.max(1, Math.round((Date.now() - Date.parse(it.life.submitted)) / 86400000)) : null;
  const glow = it.product?.color && it.product.label !== '-' ? it.product.color : '#4a55ff';
  return (
    <article role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="group h-full flex flex-col rounded-3xl overflow-hidden bg-white border border-gray-200 shadow-[0_1px_2px_rgba(3,11,46,.05)] hover:shadow-[0_14px_40px_-12px_rgba(3,11,46,.35)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4a55ff]">
      <header className="relative px-5 pt-4 pb-4 text-white"
        style={{ background: `radial-gradient(110% 130% at 100% 0%, ${glow}66 0%, ${glow}00 55%), linear-gradient(140deg, ${NAVY} 0%, #0b1a63 100%)` }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <PriorityChip priority={it.priority} onDark />
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/80">{div.label}</span>
          <span className="ml-auto flex items-center gap-1"><HealthChip health={p.health} /><Handle handle={handle} light /></span>
        </div>
        <h3 className="mt-3 text-[30px] leading-[0.95] font-black uppercase tracking-tight line-clamp-2" style={{ fontFamily: DISPLAY }} title={it.name}>
          {p.title || it.title || it.name}
        </h3>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-white/65 min-w-0">
          {it.product?.label && it.product.label !== '-' && <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="w-2 h-2 rounded-full" style={{ background: glow }} />{it.product.label}</span>}
          <span className="truncate">{[it.platform, it.type?.label, it.campaign].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="mt-3.5"><Stepper it={it} onDark /></div>
      </header>

      <div className="flex-1 flex flex-col gap-3.5 px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPill status={it.status} small />
          {it.status_since && <span className="text-[11px] text-gray-500">for {ago(it.status_since).replace(' ago', '')}</span>}
          {daysIn && <span className="ml-auto text-[11px] text-gray-400">Day {daysIn}</span>}
        </div>
        <JourneyBar it={it} height={8} />

        <div className="grid grid-cols-4 gap-2">
          <MiniStat value={effort ? hrs(effort) : (it.timers?.working?.s ? hrs(it.timers.working.s) : '–')} label={effort ? 'effort' : 'Monday timer'} sub={effortWeek ? `${hrs(effortWeek)} this week` : null} />
          <MiniStat value={it.versions ?? '–'} label="versions" />
          <MiniStat value={fixes} label={fixes === 1 ? 'fix round' : 'fix rounds'} warn={fixes >= 3} />
          <MiniStat value={updates} label="updates" />
        </div>

        <div className="flex items-end justify-between gap-3">
          <Countdown it={it} today={today} />
          {it.timeline?.from && <TimelinePill timeline={it.timeline} today={today} small color={it.open ? (dueOf(it) < today ? '#e2445c' : '#579bfc') : '#00c875'} />}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center -space-x-1.5">
            {people.slice(0, 4).map(x => <Avatar key={x.id} person={x} size={26} ring="#fff" />)}
            {!people.length && <span className="text-xs text-red-500 font-semibold">Nobody assigned</span>}
          </span>
          {askers.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500 min-w-0">
              <span>for</span>
              <span className="flex -space-x-1">{askers.slice(0, 3).map(x => <Avatar key={x.id} person={x} size={20} ring="#fff" />)}</span>
              <span className="truncate">{askers.map(x => first(x.name)).join(', ')}</span>
            </span>
          )}
        </div>

        {latest && (
          <div className="rounded-2xl bg-gray-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <MessageSquare size={12} /> <b className="text-gray-700">{latest.by?.name || 'Monday'}</b> · {ago(latest.at)}
            </div>
            <p className="text-[13px] text-gray-700 mt-0.5 line-clamp-2 break-words">{latest.text}</p>
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1 border-t border-gray-100 -mx-1 px-1">
          <Links it={it} size={14} />
          {p.relatedItems.length > 0 && <span className="text-[11px] font-semibold text-gray-500">+{p.relatedItems.length} related {p.relatedItems.length === 1 ? 'ticket' : 'tickets'}</span>}
          {p.note && <span className="ml-auto text-[11px] text-gray-400 truncate max-w-[45%]" title={p.note}>📝 {p.note}</span>}
        </div>
      </div>
    </article>
  );
}

function MissingCard({ p, handle }) {
  return (
    <article className="h-full rounded-3xl border border-dashed border-gray-300 bg-white p-5 flex flex-col gap-2">
      <div className="flex items-center"><span className="text-sm font-bold text-gray-500">{p.title || `Monday item ${p.item_id}`}</span><span className="ml-auto"><Handle handle={handle} /></span></div>
      <p className="text-xs text-gray-400">This item isn't on Monday any more (archived or deleted). Remove it from Hot Projects in its menu, or restore it on Monday.</p>
    </article>
  );
}

function MiniStat({ value, label, sub, warn }) {
  return (
    <div className="rounded-2xl bg-[#f5f6fb] px-2.5 py-2 min-w-0">
      <div className="text-xl font-black tabular-nums leading-none" style={{ fontFamily: DISPLAY, color: warn ? '#d97a00' : NAVY }}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-1 truncate">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 truncate">{sub}</div>}
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────────
/** The ticket's life as one bar: each stretch in a status, in Monday's colour, with a hover tooltip. */
function JourneyBar({ it, height = 10, showDeadline = false, today }) {
  const [tip, setTip] = useState(null); // { x, s }
  const ref = useRef(null);
  const segs = it.journey || [];
  if (!segs.length) return null;
  const a = Date.parse(segs[0].from);
  const b = Date.parse(segs[segs.length - 1].to);
  const due = showDeadline && it.deadline ? Date.parse(`${it.deadline}T19:00:00+03:00`) : null;
  const end = Math.max(b, due || 0);
  const scale = Math.max(1, end - a);
  return (
    <div className="relative" ref={ref} onMouseLeave={() => setTip(null)}>
      <div className="flex w-full overflow-hidden rounded-full bg-gray-100" style={{ height, gap: 2 }}>
        {segs.map((s, i) => {
          const w = ((Date.parse(s.to) - Date.parse(s.from)) / scale) * 100;
          return (
            <div key={i} style={{ width: `${w}%`, minWidth: 2, background: s.color || CATEGORY[s.category]?.color || '#c4c4c4' }}
              onMouseEnter={(e) => { const r = ref.current.getBoundingClientRect(); setTip({ x: e.clientX - r.left, s }); }} />
          );
        })}
      </div>
      {due && due > a && (
        <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-[#d83a52] rounded" style={{ left: `${Math.min(100, ((due - a) / scale) * 100)}%` }} title={`Deadline ${fmt(it.deadline)}`} />
      )}
      {showDeadline && (
        <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
          <span>{fmtTs(segs[0].from)} · submitted</span>
          {due && <span className="text-[#d83a52] font-semibold">deadline {fmt(it.deadline)}</span>}
          <span>{it.open ? `today · ${fmt(today)}` : `done ${fmtTs(it.life?.completed)}`}</span>
        </div>
      )}
      {tip && (
        <div className="absolute z-20 -top-2 -translate-y-full -translate-x-1/2 pointer-events-none px-2.5 py-1.5 rounded-lg bg-[#030b2e] text-white text-[11px] whitespace-nowrap shadow-lg"
          style={{ left: Math.min(Math.max(tip.x, 60), (ref.current?.offsetWidth || 200) - 60) }}>
          <b>{tip.s.label}</b> · {span((Date.parse(tip.s.to) - Date.parse(tip.s.from)) / 1000)}
          <div className="text-white/60">{fmtTs(tip.s.from)} → {Date.parse(tip.s.to) >= Date.now() - 60000 ? 'now' : fmtTs(tip.s.to)}</div>
        </div>
      )}
    </div>
  );
}

/** Calendar time per status category — where the project's days went. */
function TimeInStatus({ items }) {
  const phases = {};
  for (const it of items) for (const [k, s] of Object.entries(it.life?.phases || {})) phases[k] = (phases[k] || 0) + s;
  const rows = CATEGORY_ORDER.filter(k => phases[k] > 0).map(k => ({ k, s: phases[k] }));
  const max = Math.max(1, ...rows.map(r => r.s));
  const sum = rows.reduce((a, r) => a + r.s, 0);
  if (!rows.length) return <Empty>No status history on Monday yet.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ k, s }) => (
        <div key={k} className="grid items-center gap-3" style={{ gridTemplateColumns: '84px 1fr 72px' }}>
          <span className="text-xs font-semibold text-gray-600">{CATEGORY[k].label}</span>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden" title={`${CATEGORY[k].label}: ${span(s)}`}>
            <div className="h-full rounded-full" style={{ width: `${(s / max) * 100}%`, background: CATEGORY[k].color, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
          </div>
          <span className="text-xs tabular-nums text-gray-700 text-right"><b>{span(s)}</b> <span className="text-gray-400">{Math.round((s / sum) * 100)}%</span></span>
        </div>
      ))}
    </div>
  );
}

/** Studio effort per day (Working / Fixes time while clocked in, split between parallel tasks). */
function EffortByDay({ items, data }) {
  const [tip, setTip] = useState(null);
  const byDay = {};
  const byPerson = {};
  for (const it of items) {
    for (const [uid, days] of Object.entries(it.effort_days || {})) {
      for (const [d, s] of Object.entries(days)) {
        byDay[d] = (byDay[d] || 0) + s;
        byPerson[uid] = (byPerson[uid] || 0) + s;
      }
    }
  }
  const days = Object.keys(byDay).sort().slice(-21);
  if (!days.length) return <Empty>No Working / Fixes time recorded yet.</Empty>;
  const max = Math.max(...days.map(d => byDay[d]));
  const people = Object.entries(byPerson).sort((a, b) => b[1] - a[1]);
  const pmax = Math.max(1, ...people.map(([, s]) => s));
  return (
    <div className="flex flex-col gap-4">
      <div className="relative" onMouseLeave={() => setTip(null)}>
        <div className="flex items-end gap-1 h-24 border-b border-gray-200">
          {days.map(d => (
            <div key={d} className="flex-1 h-full flex items-end" onMouseEnter={() => setTip(d)}>
              <div className="w-full rounded-t" style={{ height: `${Math.max(4, (byDay[d] / max) * 100)}%`, background: tip === d ? '#4a55ff' : ELECTRIC, transition: 'height .5s cubic-bezier(.16,1,.3,1)' }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>{fmt(days[0])}</span><span>{fmt(days[days.length - 1])}</span></div>
        {tip && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-lg bg-[#030b2e] text-white text-[11px] whitespace-nowrap pointer-events-none">
            {fmt(tip)} · <b>{hrs(byDay[tip])}</b>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {people.map(([uid, s]) => (
          <div key={uid} className="grid items-center gap-2.5" style={{ gridTemplateColumns: '22px 110px 1fr 44px' }}>
            <Avatar person={data.people[uid] || { name: '?' }} size={22} />
            <span className="text-xs text-gray-700 truncate">{nameOf(data, uid)}</span>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(s / pmax) * 100}%`, background: ELECTRIC }} /></div>
            <span className="text-xs tabular-nums font-semibold text-right">{hrs(s)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Project view ────────────────────────────────────────────────────────────
function Section({ title, sub, right, children }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4">
      <header className="flex items-start gap-2 mb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold" style={{ color: NAVY }}>{title}</h4>
          {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
        </div>
        {right && <div className="ml-auto flex-none">{right}</div>}
      </header>
      {children}
    </section>
  );
}

function Fact({ label, children }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="w-28 flex-none text-[11px] font-semibold uppercase tracking-wider text-gray-400 pt-0.5">{label}</span>
      <span className="text-[13px] text-gray-800 min-w-0">{children}</span>
    </div>
  );
}

function ProjectView({ p, data, today, onClose, onEditTask, onRemove, onUpdate }) {
  const it = p.main;
  const all = [it, ...p.relatedItems];
  const [title, setTitle] = useState(p.title || '');
  const [renaming, setRenaming] = useState(false);
  const [note, setNote] = useState(p.note || '');
  const [askRemove, setAskRemove] = useState(false);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !renaming) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, renaming]);
  if (!it) return null;
  const div = DIVISION[it.division] || DIVISION[it.board];
  const glow = it.product?.color && it.product.label !== '-' ? it.product.color : '#4a55ff';
  const effort = all.reduce((a, x) => a + (x.effort_total_s || 0), 0);
  const changes = all.flatMap(x => [
    ...(x.deadline_moves || []).map(m => ({ ...m, kind: 'deadline', item: x })),
    ...(x.timeline_moves || []).map(m => ({ ...m, kind: 'timeline', item: x })),
    ...(x.reassignments || []).map(m => ({ ...m, kind: 'people', item: x })),
  ]).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const updates = all.flatMap(x => (x.updates?.recent || []).map(u => ({ ...u, item: x }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 4);
  const saveTitle = () => { setRenaming(false); if ((p.title || '') !== title.trim()) onUpdate({ title: title.trim() }); };

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-3 sm:p-6" style={{ background: 'rgba(3,11,46,.55)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[1180px] rounded-3xl bg-[#f4f5fa] shadow-2xl overflow-hidden" role="dialog" aria-label={p.title || it.title}>
        {/* Hero */}
        <header className="relative px-6 sm:px-8 pt-6 pb-6 text-white"
          style={{ background: `radial-gradient(80% 140% at 100% 0%, ${glow}70 0%, ${glow}00 55%), radial-gradient(60% 120% at 0% 100%, rgba(255,106,0,.25) 0%, rgba(255,106,0,0) 60%), linear-gradient(140deg, ${NAVY} 0%, #0b1a63 100%)` }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Flame size={16} className="text-orange-400" />
            <PriorityChip priority={it.priority} onDark />
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/80">{div.label}</span>
            <HealthChip health={p.health} big />
            <span className="ml-auto flex items-center gap-1">
              <Links it={it} size={16} />
              <button type="button" onClick={onClose} className="ml-1 p-2 rounded-xl hover:bg-white/10" aria-label="Close"><X size={18} /></button>
            </span>
          </div>
          {renaming ? (
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} placeholder={it.title}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(p.title || ''); setRenaming(false); } }}
              className="mt-3 w-full bg-white/10 rounded-xl px-3 py-1 text-4xl font-black uppercase outline-none" style={{ fontFamily: DISPLAY }} />
          ) : (
            <h2 className="group mt-3 text-5xl leading-[0.95] font-black uppercase tracking-tight flex items-start gap-2" style={{ fontFamily: DISPLAY }}>
              <span>{p.title || it.title || it.name}</span>
              <button type="button" onClick={() => setRenaming(true)} title="Rename (CP only — Monday keeps its name)" className="mt-2 p-1 rounded-lg opacity-40 hover:opacity-100 hover:bg-white/10"><Pencil size={16} /></button>
            </h2>
          )}
          <p className="mt-1 text-sm text-white/60 truncate" title={it.name}>{it.name}</p>
          <div className="mt-5 grid gap-5 items-end" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <Stepper it={it} onDark />
            <div className="flex items-center gap-2">
              <StatusPill status={it.status} />
              {it.status_since && <span className="text-xs text-white/60">since {fmtTs(it.status_since)}</span>}
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 min-w-0">
            {/* Headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BigStat label={it.open ? 'To the deadline' : 'Delivered'} sub={it.open && dueOf(it) ? `${it.deadline ? 'Deadline' : 'Timeline ends'} ${fmt(dueOf(it))}` : null}>
                <Countdown it={it} today={today} big compact />
              </BigStat>
              <BigStat label="Effort" value={effort ? hrs(effort) : '–'} sub={data.effort_pending ? 'still calculating…' : `${hrs(all.reduce((a, x) => a + (x.effort_week_s || 0), 0), { zero: '0' })} this week`} />
              <BigStat label="Fix · review rounds" value={`${all.reduce((a, x) => a + (x.fix_rounds || 0), 0)} · ${all.reduce((a, x) => a + (x.review_rounds || 0), 0)}`} sub={`${it.versions ?? '–'} ${it.versions === 1 ? 'version' : 'versions'}`} />
              <BigStat label="Moves" value={changes.filter(c => c.kind !== 'people').length} sub={`${(it.deadline_moves || []).length} deadline · ${(it.timeline_moves || []).length} timeline`} />
            </div>
            {p.health?.reasons?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-2xl text-sm" style={{ background: HEALTH[p.health.key]?.bg, color: HEALTH[p.health.key]?.color }}>
                <AlertTriangle size={15} /> <b>{HEALTH[p.health.key]?.label}:</b> {p.health.reasons.join(' · ')}
              </div>
            )}

            <Section title="Journey" sub="Every status since the request, in Monday's colours — hover a stretch for its dates">
              <div className="pt-2"><JourneyBar it={it} height={18} showDeadline today={today} /></div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
                {[...new Map((it.journey || []).map(s => [s.label, s])).values()].map(s => (
                  <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-gray-600"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color || CATEGORY[s.category]?.color }} />{s.label}</span>
                ))}
              </div>
            </Section>

            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Where the time went" sub={`Calendar time in each stage${p.relatedItems.length ? ', all tickets' : ''}`}>
                <TimeInStatus items={all} />
              </Section>
              <Section title="Effort" sub="Working / Fixes time while clocked in, split between parallel tasks">
                {data.effort_pending ? <Empty>Still calculating — refresh in a minute.</Empty> : <EffortByDay items={all} data={data} />}
              </Section>
            </div>

            <Section title="Monday timers" sub="As Monday's automations report them — for reference">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {TIMERS.filter(([k]) => it.timers?.[k]).map(([k, label]) => (
                  <div key={k} className="rounded-xl bg-[#f5f6fb] px-3 py-2">
                    <div className="text-lg font-black tabular-nums" style={{ fontFamily: DISPLAY, color: NAVY }}>{it.timers[k].s ? hrs(it.timers[k].s) : '–'}</div>
                    <div className="flex items-center gap-1 text-[10px] text-gray-500">
                      {it.timers[k].running && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Running now" />}{label}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Latest updates" right={<button type="button" onClick={() => onEditTask(it)} className="text-xs font-semibold text-[#0808f8] hover:underline">All updates · reply</button>}>
              {!updates.length ? <Empty>No updates on Monday yet.</Empty> : (
                <div className="flex flex-col gap-3">
                  {updates.map(u => (
                    <div key={u.id} className="flex gap-2.5">
                      <Avatar person={data.people[u.by?.id] || { name: u.by?.name || 'Monday' }} size={26} />
                      <div className="min-w-0">
                        <div className="text-xs"><b className="text-gray-900">{u.by?.name || 'Monday'}</b> <span className="text-gray-400">{ago(u.at)}{u.item.id !== it.id ? ` · on ${u.item.title}` : ''}</span></div>
                        <p className="text-[13px] text-gray-700 whitespace-pre-wrap break-words line-clamp-4">{u.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <Section title="Project" right={<button type="button" onClick={() => onEditTask(it)} className="text-xs font-semibold text-[#0808f8] hover:underline">Edit on Monday</button>}>
              <Fact label="Requested by">{it.requested_by.map(uid => nameOf(data, uid)).join(', ') || '—'}</Fact>
              <Fact label="Assigned to">
                {it.people.length ? <span className="flex flex-wrap items-center gap-1.5">{it.people.map(uid => <span key={uid} className="flex items-center gap-1"><Avatar person={data.people[uid] || { name: '?' }} size={18} />{nameOf(data, uid)}</span>)}</span> : <span className="text-red-500 font-semibold">Nobody</span>}
              </Fact>
              <Fact label="Product">{it.product?.label && it.product.label !== '-' ? <ProductTag product={it.product} /> : '—'}</Fact>
              <Fact label="Type · platform">{[it.type?.label, it.platform].filter(Boolean).join(' · ') || '—'}</Fact>
              {it.campaign && <Fact label="Campaign">{it.campaign}</Fact>}
              {it.tv?.production_id && <Fact label="Production">{it.tv.production_id} · {it.tv.name}</Fact>}
              <Fact label="Timeline">{it.timeline?.from ? <TimelinePill timeline={it.timeline} today={today} small color={it.open ? '#579bfc' : '#00c875'} /> : '—'}</Fact>
              <Fact label="Deadline">{fmt(it.deadline)}</Fact>
              <Fact label="Requested">{fmtTs(it.life?.submitted)}{it.life?.assigned && ` · assigned ${fmtTs(it.life.assigned)}`}</Fact>
              <Fact label="Started">{fmtTs(it.life?.started)}{it.life?.completed && ` · done ${fmtTs(it.life.completed)}`}</Fact>
              <Fact label="Pinned">{fmtTs(p.added_at)}{p.added_by ? ` by ${p.added_by}` : ''}</Fact>
            </Section>

            <Section title="Note for the team" sub="Only in the CP">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== (p.note || '')) onUpdate({ note }); }}
                rows={3} placeholder="What matters on this one right now…"
                className="w-full text-sm rounded-xl border border-gray-200 px-3 py-2 outline-none focus:border-[#4a55ff] resize-y" />
            </Section>

            <Section title="Changes" sub="Deadline and timeline moves, reassignments">
              {!changes.length ? <Empty>Nothing moved — dates and people are as first set.</Empty> : (
                <ol className="flex flex-col gap-2">
                  {changes.slice(0, 12).map((c, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px]">
                      <span className="mt-0.5 flex-none text-gray-400">{c.kind === 'people' ? <UserRound size={14} /> : <CalendarClock size={14} />}</span>
                      <span className="min-w-0">
                        {c.kind === 'deadline' && <>Deadline <b>{fmt(c.from)}</b> → <b className={c.to > c.from ? 'text-[#d83a52]' : 'text-emerald-700'}>{fmt(c.to)}</b></>}
                        {c.kind === 'timeline' && <>Timeline end <b>{fmt(c.from.to)}</b> → <b className={c.to.to > c.from.to ? 'text-[#d83a52]' : 'text-emerald-700'}>{fmt(c.to.to)}</b></>}
                        {c.kind === 'people' && <>Reassigned <b>{c.from.map(u => first(nameOf(data, u))).join(', ')}</b> → <b>{c.to.map(u => first(nameOf(data, u))).join(', ') || 'nobody'}</b></>}
                        <span className="block text-[11px] text-gray-400">{fmtTs(c.at)}{c.by ? ` · by ${nameOf(data, c.by)}` : ''}{c.item.id !== it.id ? ` · ${c.item.title}` : ''}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Related p={p} data={data} today={today} onEditTask={onEditTask} onUpdate={onUpdate} />

            <div className="flex items-center justify-end gap-2 pt-1">
              {askRemove ? (
                <>
                  <span className="text-xs text-gray-500">Remove from Hot Projects? (Monday isn't changed)</span>
                  <button type="button" onClick={() => setAskRemove(false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white">Keep</button>
                  <button type="button" onClick={onRemove} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#d83a52] text-white">Remove</button>
                </>
              ) : (
                <button type="button" onClick={() => setAskRemove(true)} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#d83a52] px-3 py-1.5 rounded-lg hover:bg-white">
                  <Trash2 size={13} /> Remove from Hot Projects
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BigStat({ label, value, sub, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1">{children || <span className="text-3xl font-black tabular-nums leading-none" style={{ fontFamily: DISPLAY, color: NAVY }}>{value}</span>}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}

/** Other tickets that belong to the project (the digital cutdowns of a TV spot, the statics of a launch…). */
function Related({ p, data, today, onEditTask, onUpdate }) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  useEffect(() => {
    if (!picking) return undefined;
    let on = true;
    const t = setTimeout(() => {
      studioApi.hotSuggestions({ q: q.trim() || p.main.campaign || p.main.title }).then(r => on && setFound(r.suggestions)).catch(() => on && setFound([]));
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [picking, q, p.main.campaign, p.main.title]);
  const add = (it) => { onUpdate({ related: [...p.related, { board: it.board, item_id: it.id }] }); setPicking(false); setQ(''); };
  const drop = (id) => onUpdate({ related: p.related.filter(r => String(r.item_id) !== id) });
  return (
    <Section title="Related tickets" sub="Other Monday tickets that are part of this project"
      right={!picking && <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1 text-xs font-semibold text-[#0808f8] hover:underline"><Plus size={13} />Add</button>}>
      {p.relatedItems.length === 0 && !picking && <p className="text-xs text-gray-400">None yet — add the cutdowns, statics or versions that belong to it.</p>}
      <div className="flex flex-col gap-1.5">
        {p.relatedItems.map(it => (
          <div key={it.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-gray-50">
            <button type="button" onClick={() => onEditTask(it)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
              <StatusPill status={it.status} small />
              <span className="text-[13px] text-gray-800 truncate">{it.title || it.name}</span>
            </button>
            <span className="text-[11px] text-gray-400 whitespace-nowrap">{it.open ? `due ${fmt(dueOf(it))}` : 'done'}</span>
            <button type="button" onClick={() => drop(it.id)} className="p-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-[#d83a52]" aria-label="Remove related ticket"><X size={13} /></button>
          </div>
        ))}
      </div>
      {picking && (
        <div className="mt-2 rounded-xl border border-gray-200 p-2">
          <label className="relative block">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search open tickets"
              className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg bg-gray-50 outline-none focus:bg-white" />
          </label>
          <div className="max-h-56 overflow-y-auto mt-1">
            {found == null ? <div className="py-4 text-center"><Loader2 size={16} className="animate-spin inline text-gray-400" /></div>
              : !found.length ? <p className="text-xs text-gray-400 p-2">No open tickets match.</p>
                : found.slice(0, 20).map(({ item }) => (
                  <button key={item.id} type="button" onClick={() => add(item)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-[#f5f6ff]">
                    <StatusPill status={item.status} small /><span className="text-[13px] truncate">{item.title || item.name}</span>
                    <Plus size={13} className="ml-auto text-gray-400 flex-none" />
                  </button>
                ))}
          </div>
          <button type="button" onClick={() => setPicking(false)} className="text-xs text-gray-500 mt-1 px-2">Cancel</button>
        </div>
      )}
    </Section>
  );
}

// ── Adding projects ─────────────────────────────────────────────────────────
function SuggestionRow({ s, today, people, added, busy, onAdd }) {
  const it = s.item;
  const div = DIVISION[it.division] || DIVISION[it.board];
  const due = dueOf(it);
  const late = due && due < today;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[#f5f6ff] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <PriorityChip priority={it.priority} />
          <span className="text-sm font-semibold text-[#030b2e] truncate" title={it.name}>{it.title || it.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 min-w-0 flex-wrap">
          <span className="font-semibold" style={{ color: div.color }}>{div.label}</span>
          <StatusPill status={it.status} small />
          <ProductTag product={it.product} />
          {it.requested_by.length > 0 && <span className="truncate">for {it.requested_by.map(uid => first(people[uid]?.name)).filter(Boolean).join(', ')}</span>}
          {due && <span className={late ? 'text-[#d83a52] font-semibold' : ''}>· due {fmt(due)}</span>}
        </div>
        {s.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {s.reasons.map(r => <span key={r} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700">{r}</span>)}
          </div>
        )}
      </div>
      <button type="button" onClick={onAdd} disabled={added || busy}
        className={`flex-none flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-colors ${added ? 'bg-emerald-50 text-emerald-700' : 'bg-[#030b2e] text-white hover:bg-[#0808f8]'} disabled:cursor-default`}>
        {added ? <><Check size={14} /> Added</> : busy ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> Add</>}
      </button>
    </div>
  );
}

function useSuggestions(q, requester) {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let on = true;
    setErr(null);
    const t = setTimeout(() => {
      studioApi.hotSuggestions({ q: q.trim(), requester }).then(r => on && setRes(r)).catch(e => on && setErr(e.message));
    }, q ? 250 : 0);
    return () => { on = false; clearTimeout(t); };
  }, [q, requester]);
  return [res, err];
}

function AddProjects({ onClose, onAdded }) {
  const [q, setQ] = useState('');
  const [requester, setRequester] = useState('');
  const [res, err] = useSuggestions(q, requester);
  const [added, setAdded] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const [addErr, setAddErr] = useState(null);
  const box = useRef(null);
  const close = useCallback(() => { if (added.size) onAdded(); onClose(); }, [added, onAdded, onClose]);
  useClickAway(box, close);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  const add = async (it) => {
    setBusy(it.id); setAddErr(null);
    try { await studioApi.addHot(it.id); setAdded(s => new Set(s).add(it.id)); } catch (e) { setAddErr(e.message); } finally { setBusy(null); }
  };
  const today = res?.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-start justify-center p-3 sm:p-8 overflow-y-auto" style={{ background: 'rgba(3,11,46,.5)', backdropFilter: 'blur(3px)' }}>
      <div ref={box} className="w-full max-w-[760px] rounded-3xl bg-white shadow-2xl overflow-hidden" role="dialog" aria-label="Add hot projects">
        <header className="px-6 pt-5 pb-4 text-white" style={{ background: `radial-gradient(90% 160% at 100% 0%, rgba(255,106,0,.45) 0%, rgba(255,106,0,0) 55%), ${NAVY}` }}>
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-orange-300" />
            <h3 className="text-2xl font-black uppercase tracking-tight" style={{ fontFamily: DISPLAY }}>Add hot projects</h3>
            <button type="button" onClick={close} className="ml-auto p-2 rounded-xl hover:bg-white/10" aria-label="Close"><X size={18} /></button>
          </div>
          <p className="text-xs text-white/60 mt-0.5">Suggested from open Video + Design tickets — priority first, then TV &amp; SP, who asked, size and urgency.</p>
          <label className="relative block mt-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every open ticket by name or campaign"
              className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-white/10 text-white placeholder-white/40 outline-none focus:bg-white/15" />
          </label>
        </header>
        <div className="px-4 pt-3 flex flex-wrap gap-1.5">
          <Chip on={!requester} onClick={() => setRequester('')}>Anyone</Chip>
          {(res?.requesters || []).map(r => (
            <Chip key={r.id} on={requester === r.id} onClick={() => setRequester(requester === r.id ? '' : r.id)} title={r.hot ? `Asked for ${r.hot} of the hot projects` : undefined}>
              <Avatar person={r} size={16} /> {r.name.split(' ')[0]} <span className="opacity-50">{r.n}</span>{r.hot > 0 && <Flame size={11} className="text-orange-500" />}
            </Chip>
          ))}
        </div>
        <div className="p-2 pb-4 max-h-[60vh] overflow-y-auto">
          {err ? <div className="m-3 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>
            : !res ? <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>
              : !res.suggestions.length ? <Empty>{q ? 'No open tickets match.' : 'No open tickets to suggest right now.'}</Empty>
                : res.suggestions.map(s => (
                  <SuggestionRow key={s.item.id} s={s} today={today} people={res.people || {}} added={added.has(s.item.id)} busy={busy === s.item.id} onAdd={() => add(s.item)} />
                ))}
          {addErr && <div className="mx-3 mt-2 text-xs text-red-600">{addErr}</div>}
        </div>
        <footer className="flex items-center gap-3 px-6 py-3 border-t border-gray-100 bg-gray-50/60">
          <span className="text-xs text-gray-500">{res ? `${res.total} open ${res.total === 1 ? 'ticket' : 'tickets'}${q || requester ? ' match' : ''}` : ''}</span>
          <button type="button" onClick={close} className="ml-auto text-sm font-semibold px-4 py-2 rounded-xl bg-[#030b2e] text-white">{added.size ? `Done · ${added.size} added` : 'Done'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Chip({ on, onClick, children, title }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`flex items-center gap-1.5 text-xs font-semibold pl-1.5 pr-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
      {children}
    </button>
  );
}

/** Nothing pinned yet: the top suggestions right on the page. */
function FirstRun({ onAdded, onBrowse }) {
  const [res, err] = useSuggestions('', '');
  const [added, setAdded] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const today = res?.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const add = async (it) => {
    setBusy(it.id);
    try { await studioApi.addHot(it.id); setAdded(s => new Set(s).add(it.id)); } finally { setBusy(null); }
  };
  return (
    <section className="rounded-3xl bg-white border border-gray-200 p-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-bold" style={{ color: NAVY }}>Pick the projects that matter most right now</h3>
          <p className="text-sm text-gray-500 mt-0.5">Here are the open tickets that look biggest — by priority, who asked, size and how soon they're due.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onBrowse} className="text-sm font-semibold px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100">Search all tickets</button>
          {added.size > 0 && <button type="button" onClick={onAdded} className="text-sm font-semibold px-4 py-2 rounded-xl bg-[#030b2e] text-white">Show {added.size} hot {added.size === 1 ? 'project' : 'projects'}</button>}
        </div>
      </div>
      <div className="mt-3">
        {err ? <div className="px-3 py-2 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>
          : !res ? <div className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>
            : !res.suggestions.length ? <Empty>No open tickets to suggest right now.</Empty>
              : res.suggestions.slice(0, 8).map(s => <SuggestionRow key={s.item.id} s={s} today={today} people={res.people || {}} added={added.has(s.item.id)} busy={busy === s.item.id} onAdd={() => add(s.item)} />)}
      </div>
    </section>
  );
}
