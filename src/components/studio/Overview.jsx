import { useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ExternalLink, Tv, Inbox, ArrowUpDown, Plane, Mail, GripVertical, EyeOff, Eye, LayoutGrid, Check, RotateCcw, Loader2 } from 'lucide-react';
import { Avatar, Card, StatusPill, ProductTag, StackBar, Empty, hrs, DIVISION, TimelinePill } from './Bits';
import { nextWindow } from './Filters';
import Inspiration from './Inspiration';
import TaskListModal from './TaskListModal';
import { studioApi } from '../../lib/studioService';

const BOARD_LABEL = { video: 'Video', design: 'Design' };
const isNew = (it) => /form requests|ready for assign/i.test(it.group || '') || (it.status.category === 'queued' && !it.people.length);
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '–');

// ── Widget registry (order + size are per user, saved on the server) ──────
const WIDGETS = [
  { id: 'inspiration', label: 'Line of the day', size: 'full' },
  { id: 'kpis', label: 'Key numbers', size: 'full' },
  { id: 'out', label: 'Out today', size: 'full' },
  { id: 'battery_video', label: 'Video battery', size: 'half' },
  { id: 'battery_design', label: 'Design battery', size: 'half' },
  { id: 'people_video', label: 'Video editors', size: 'full' },
  { id: 'people_design', label: 'Designers', size: 'full' },
  { id: 'completed', label: 'Completed', size: 'third' },
  { id: 'requesters', label: 'By requester', size: 'third' },
  { id: 'products', label: 'By product', size: 'third' },
  { id: 'emails', label: 'Email tasks', size: 'full' },
  { id: 'new_requests', label: 'New requests', size: 'full' },
  { id: 'tasks', label: 'All tasks', size: 'full' },
];
const SPAN = { full: 'md:col-span-6', half: 'md:col-span-3', third: 'md:col-span-2' };
const SIZES = [['third', '⅓'], ['half', '½'], ['full', 'Full']];

function mergeLayout(saved) {
  const known = new Map(WIDGETS.map(w => [w.id, w]));
  const out = [];
  for (const s of Array.isArray(saved) ? saved : []) {
    if (!s?.id || !known.has(s.id) || out.some(o => o.id === s.id)) continue;
    out.push({ id: s.id, size: SPAN[s.size] ? s.size : known.get(s.id).size, hidden: !!s.hidden });
  }
  for (const w of WIDGETS) if (!out.some(o => o.id === w.id)) out.push({ id: w.id, size: w.size, hidden: false });
  return out;
}

// ── Pieces ──────────────────────────────────────────────────────────────────
function Battery({ board, items, onOpen }) {
  const counts = new Map();
  for (const it of items) counts.set(it.status.label, (counts.get(it.status.label) || 0) + 1);
  const parts = board.statuses.filter(s => counts.get(s.label)).map(s => ({ key: s.label, label: s.label, value: counts.get(s.label), color: s.color, category: s.category }));
  const total = items.length;
  const done = parts.filter(p => p.category === 'delivered').reduce((a, p) => a + p.value, 0);
  const pct = total ? Math.round((done / total) * 1000) / 10 : 0;
  const open = (p) => onOpen({ title: `${board.label} · ${p.label}`, color: p.color, items: items.filter(i => i.status.label === p.label), filter: { status: { board: board.key, label: p.label } } });
  return (
    <Card title={`${board.label} battery`} subtitle={`${total} tasks · click a colour to see them`} className="h-full">
      <div className="flex items-center gap-5">
        <div className="flex-1 min-w-0"><StackBar parts={parts} height={44} rounded={false} onPart={open} /></div>
        <div className="flex-none text-right">
          <div className="text-4xl font-black text-[#030b2e] leading-none tabular-nums" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>{pct}%</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-1">Done</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
        {parts.map(p => (
          <button key={p.key} type="button" onClick={() => open(p)} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[#0808f8]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />{p.label}<span className="text-gray-400 tabular-nums">{p.value}</span>
          </button>
        ))}
        {!parts.length && <span className="text-xs text-gray-400">No tasks match these filters.</span>}
      </div>
    </Card>
  );
}

function Donut({ parts, size = 92, stroke = 16, onPart }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
      {total > 0 && parts.filter(p => p.value).map(p => {
        const len = (p.value / total) * c;
        const el = (
          <circle key={p.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} className="cursor-pointer hover:opacity-80"
            onClick={(e) => { e.stopPropagation(); onPart?.(p); }}><title>{`${p.label}: ${p.value}`}</title></circle>
        );
        off += len;
        return el;
      })}
    </svg>
  );
}

/** "Natalie's work" — click a slice / status to see exactly those tasks. */
function PersonCard({ person, items, upcoming = [], boards, onOpen, today }) {
  const counts = new Map();
  for (const it of items) {
    const st = boards[it.board]?.statuses.find(s => s.label === it.status.label);
    const k = it.status.label;
    const e = counts.get(k) || { key: k, label: k, value: 0, color: st?.color || it.status.color || '#c4c4c4', order: st ? boards[it.board].statuses.indexOf(st) : 99 };
    e.value++;
    counts.set(k, e);
  }
  const parts = [...counts.values()].sort((a, b) => a.order - b.order);
  const active = items.filter(i => i.active_now);
  const out = (person.out || []).find(o => o.start <= today && o.end >= today);
  const first = person.name.split(' ')[0];
  const openPart = (p) => onOpen({ title: `${first} · ${p.label}`, person, color: p.color, items: items.filter(i => i.status.label === p.label), filter: { people: [person.id] } });
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <button type="button" onClick={() => onOpen({ title: `${first}’s work`, person, items, filter: { people: [person.id] } })} className="flex items-center gap-2.5 mb-3 w-full text-left">
        <Avatar person={person} size={34} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[#030b2e] truncate hover:text-[#0808f8]">{first}’s work</div>
          <div className="text-[11px] text-gray-500">{person.role === 'video' ? 'Video editor' : 'Designer'}</div>
        </div>
        {out && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1" title={out.name || 'Out'}><Plane size={10} /> Out</span>}
      </button>
      <div className="flex items-center gap-3">
        <Donut parts={parts} onPart={openPart} />
        <div className="flex-1 min-w-0 grid grid-cols-1 gap-0.5">
          {parts.slice(0, 6).map(p => (
            <button key={p.key} type="button" onClick={() => openPart(p)} className="flex items-center gap-1.5 text-[11px] text-gray-600 min-w-0 rounded px-1 -mx-1 hover:bg-gray-50 hover:text-[#0808f8]">
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: p.color }} />
              <span className="truncate flex-1 text-left">{p.label}</span>
              <span className="tabular-nums text-gray-900 font-semibold">{p.value}</span>
            </button>
          ))}
          {parts.length > 6 && <div className="text-[10px] text-gray-400">+{parts.length - 6} more</div>}
          {!parts.length && <div className="text-[11px] text-gray-400">Nothing scheduled in this period</div>}
        </div>
      </div>
      {upcoming.length > 0 && (
        <button type="button" onClick={() => onOpen({ title: `${first} · next week`, person, items: upcoming })}
          className="mt-2 w-full text-left text-[11px] font-semibold text-[#0808f8] bg-[#0808f8]/5 hover:bg-[#0808f8]/10 rounded-lg px-2.5 py-1.5">
          {upcoming.length} task{upcoming.length === 1 ? '' : 's'} next week →
        </button>
      )}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
        <span><b className="text-gray-900 tabular-nums">{items.length}</b> this period</span>
        <button type="button" onClick={() => onOpen({ title: `${first} · active now`, person, items: active })} className="hover:text-[#0808f8]"><b className="text-gray-900 tabular-nums">{active.length}</b> active</button>
        <span className="ml-auto" title="Time on active tasks this period"><b className="text-gray-900 tabular-nums">{hrs(person.effort_s)}</b> worked</span>
      </div>
    </div>
  );
}

function BarList({ rows, onPick, empty = 'Nothing here' }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(r => (
        <button key={r.key} type="button" onClick={() => onPick(r)} className="grid grid-cols-[minmax(0,140px)_1fr_36px] items-center gap-3 text-left rounded-lg px-1 py-0.5 hover:bg-gray-50">
          <span className="flex items-center gap-2 min-w-0 text-xs text-gray-700">
            {r.person ? <Avatar person={r.person} size={20} /> : <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: r.color || '#0808f8' }} />}
            <span className="truncate">{r.label}</span>
          </span>
          <span className="h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
            {(r.parts || [{ value: r.value, color: r.color || '#0808f8' }]).map((p, i) => <span key={i} style={{ width: `${(p.value / max) * 100}%`, background: p.color }} />)}
          </span>
          <span className="text-xs font-bold text-gray-900 tabular-nums text-right">{r.value}</span>
        </button>
      ))}
    </div>
  );
}

function TaskTable({ items: periodItems, allItems, data }) {
  const [scope, setScope] = useState('period');
  const items = scope === 'period' ? periodItems : allItems.filter(i => i.open || i.delivered_in_period);
  const [sort, setSort] = useState(['timeline', 1]);
  const [limit, setLimit] = useState(60);
  const today = data.today;
  const sorted = useMemo(() => {
    const [k, dir] = sort;
    const val = (it) => (k === 'name' ? it.name.toLowerCase()
      : k === 'people' ? (data.people[it.people[0]]?.name || '~')
        : k === 'requested_by' ? (data.requesters[it.requested_by[0]]?.name || '~')
          : k === 'status' ? it.status.label
            : k === 'deadline' ? (it.deadline || '9999')
              : k === 'timeline' ? (it.timeline?.from || '9999') : it[k] || 0);
    return [...items].sort((a, b) => { const x = val(a); const y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }, [items, sort, data]);
  const cols = [['name', 'Task'], ['people', 'Who'], ['requested_by', 'Requested by'], ['status', 'Status'], ['timeline', 'Timeline'], ['deadline', 'Deadline'], ['effort_s', 'Worked'], ['effort_total_s', 'Total']];
  return (
    <div className="overflow-x-auto">
      <div className="flex justify-end px-2 pb-2">
        <div className="inline-flex p-1 rounded-xl bg-gray-100">
          {[['period', `Timeline in this period · ${periodItems.length}`], ['all', 'Everything open']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setScope(k)} className={`text-xs px-3 py-1.5 font-semibold rounded-lg ${scope === k ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500'}`}>{label}</button>
          ))}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            {cols.map(([k, label]) => (
              <th key={k} className="py-2 px-2 font-semibold whitespace-nowrap">
                <button type="button" onClick={() => setSort([k, sort[0] === k ? -sort[1] : (['name', 'deadline', 'timeline'].includes(k) ? 1 : -1)])} className="inline-flex items-center gap-1 hover:text-gray-700">
                  {label}{sort[0] === k && <ArrowUpDown size={11} />}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map(it => {
            const late = it.open && it.deadline && it.deadline < today;
            return (
              <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="py-2 px-2 max-w-[420px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-none text-white" style={{ background: DIVISION[it.division]?.color || '#888' }}>{it.division === 'tv' ? 'TV' : BOARD_LABEL[it.board]}</span>
                    <span className="truncate text-gray-900" title={it.name}>{it.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-0.5">
                    <ProductTag product={it.product} />
                    {it.tv?.name && <span className="text-[11px] text-[#ff7a1a] flex items-center gap-1 truncate"><Tv size={10} /> {it.tv.name}</span>}
                  </div>
                </td>
                <td className="py-2 px-2"><div className="flex -space-x-1.5">{it.people.map(p => data.people[p] && <Avatar key={p} person={data.people[p]} size={24} ring="#fff" />)}</div></td>
                <td className="py-2 px-2 text-xs text-gray-600 whitespace-nowrap">{it.requested_by.map(r => data.requesters[r]?.name.split(' ')[0]).filter(Boolean).join(', ') || '–'}</td>
                <td className="py-2 px-2"><StatusPill status={it.status} small /></td>
                <td className="py-2 px-2"><TimelinePill timeline={it.timeline} today={today} color={it.status.color} small /></td>
                <td className={`py-2 px-2 text-xs whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{fmtDate(it.deadline)}</td>
                <td className="py-2 px-2 text-xs tabular-nums text-gray-900 font-semibold">{hrs(it.effort_s)}</td>
                <td className="py-2 px-2 text-xs tabular-nums text-gray-500">{hrs(it.effort_total_s)}</td>
                <td className="py-2 px-2">{it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]" title="Open in Monday"><ExternalLink size={14} /></a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > limit && <button type="button" onClick={() => setLimit(l => l + 100)} className="w-full text-xs font-semibold text-gray-500 hover:text-gray-800 py-3">Show more ({sorted.length - limit})</button>}
      {!sorted.length && <Empty>No tasks match these filters.</Empty>}
    </div>
  );
}

/** Email tasks from Retention Projects 3.0 (only Dan, Natalie and Kerry's). */
function EmailTasks({ emails, data, onOpen }) {
  const today = data.today;
  const open = emails.filter(e => e.open).sort((a, b) => (a.deadline || a.launch || '9999').localeCompare(b.deadline || b.launch || '9999'));
  const done = emails.filter(e => !e.open);
  const byStatus = new Map();
  for (const e of open) byStatus.set(e.status.label, [...(byStatus.get(e.status.label) || []), e]);
  return (
    <Card title={<span className="flex items-center gap-2"><Mail size={15} className="text-[#00a9a5]" /> Email tasks</span>}
      subtitle={`Retention Projects 3.0 · ${open.length} open${done.length ? ` · ${done.length} completed this period` : ''}`}>
      {open.length ? (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {[...byStatus.entries()].map(([label, list]) => (
              <button key={label} type="button" onClick={() => onOpen({ title: `Email · ${label}`, color: list[0].status.color, items: list })}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-white hover:brightness-110" style={{ background: list[0].status.color }}>
                {label} · {list.length}
              </button>
            ))}
          </div>
          <div className="divide-y divide-gray-100">
            {open.slice(0, 12).map(e => (
              <div key={e.id} className="flex items-center gap-3 py-2">
                <div className="flex -space-x-1.5 flex-none">{e.people.map(p => data.people[p] && <Avatar key={p} person={data.people[p]} size={22} ring="#fff" />)}</div>
                <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={e.name}>{e.name}</span>
                <ProductTag product={e.product} />
                <StatusPill status={e.status} small />
                <TimelinePill timeline={e.timeline} today={today} color={e.status.color} small />
                <span className={`text-xs flex-none w-14 text-right ${e.deadline && e.deadline < today ? 'text-red-600 font-semibold' : 'text-gray-500'}`} title={e.launch ? `Launch ${e.launch}` : 'Deadline'}>{fmtDate(e.deadline || e.launch)}</span>
                {e.monday_url && <a href={e.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]"><ExternalLink size={14} /></a>}
              </div>
            ))}
            {open.length > 12 && <button type="button" onClick={() => onOpen({ title: 'Email tasks · open', items: open })} className="text-xs font-semibold text-gray-500 hover:text-gray-800 pt-2">+{open.length - 12} more</button>}
          </div>
        </>
      ) : <Empty>No open email tasks for the studio’s designers.</Empty>}
    </Card>
  );
}

function SortableWidget({ w, editing, onSize, onHide, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`col-span-6 ${SPAN[w.size]} relative min-w-0 ${editing ? 'rounded-2xl ring-2 ring-dashed ring-[#0808f8]/30 p-1' : ''} ${w.hidden ? 'opacity-40' : ''} ${isDragging ? 'shadow-2xl' : ''}`}>
      {editing && (
        <div className="flex items-center gap-1 mb-1 px-1">
          <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded-md bg-white shadow text-gray-500" title="Drag to move"><GripVertical size={14} /></button>
          <span className="text-xs font-bold text-[#030b2e] mr-auto">{WIDGETS.find(x => x.id === w.id)?.label}</span>
          <div className="flex p-0.5 rounded-lg bg-white shadow">
            {SIZES.map(([s, label]) => (
              <button key={s} type="button" onClick={() => onSize(s)} className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${w.size === s ? 'bg-[#030b2e] text-white' : 'text-gray-500'}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={onHide} className="p-1 rounded-md bg-white shadow text-gray-500" title={w.hidden ? 'Show' : 'Hide'}>{w.hidden ? <Eye size={14} /> : <EyeOff size={14} />}</button>
        </div>
      )}
      <div className={editing ? 'pointer-events-none select-none' : ''}>{children}</div>
    </div>
  );
}

export default function Overview({ data, items, allItems, range, emails, f, setF }) {
  const [layout, setLayout] = useState(() => mergeLayout(null));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState(null);
  useEffect(() => { studioApi.getLayout().then(l => l && setLayout(mergeLayout(l))).catch(() => {}); }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const today = data.today;
  const people = Object.values(data.people);
  const next = nextWindow(range);
  const upcomingFor = (uid) => allItems.filter(i => i.open && i.people.includes(uid) && !items.includes(i) && i.timeline?.from && i.timeline.from <= next.to && (i.timeline.to || i.timeline.from) >= next.from);
  const byRole = (role) => people.filter(p => p.role === role && (items.some(i => i.people.includes(p.id)) || upcomingFor(p.id).length))
    .sort((a, b) => items.filter(i => i.people.includes(b.id)).length - items.filter(i => i.people.includes(a.id)).length);
  const delivered = items.filter(i => i.delivered_in_period);
  const open = items.filter(i => i.open);
  // Overdue is a "right now" view: any open task past its deadline, whatever its timeline
  const overdue = allItems.filter(i => i.open && i.deadline && i.deadline < today);
  const outToday = people.filter(p => (p.out || []).some(o => o.start <= today && o.end >= today));
  const kpis = [
    ['Scheduled', items.filter(i => i.open), 'text-[#030b2e]'],
    ['Delivered', delivered, 'text-emerald-600'],
    ['In review', open.filter(i => i.status.category === 'review'), 'text-violet-600'],
    ['Fixes', open.filter(i => i.status.category === 'fixes'), 'text-amber-600'],
    ['Overdue', overdue, 'text-red-600'],
  ];
  const requesterRows = Object.values(data.requesters).map(r => {
    const mine = items.filter(i => i.requested_by.includes(r.id));
    return { key: r.id, label: r.name, person: r, value: mine.length, items: mine, parts: [{ value: mine.filter(i => !i.open).length, color: '#00c875' }, { value: mine.filter(i => i.open).length, color: '#579bfc' }] };
  }).filter(r => r.value).sort((a, b) => b.value - a.value).slice(0, 10);
  const productRows = [...items.reduce((m, i) => {
    if (!i.product?.label || i.product.label === '-') return m;
    const e = m.get(i.product.label) || { key: i.product.label, label: i.product.label, color: i.product.color, value: 0, items: [] };
    e.value++; e.items.push(i);
    return m.set(i.product.label, e);
  }, new Map()).values()].sort((a, b) => b.value - a.value).slice(0, 10);
  const newRequests = allItems.filter(i => i.open && isNew(i)).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const doneBy = ['video', 'design'].map(b => ({ b, list: delivered.filter(i => i.board === b) }));
  const doneMax = Math.max(1, ...doneBy.map(d => d.list.length));
  const showBoard = (b) => data.boards[b] && (f.division === 'all' || f.division === b || (f.division === 'tv' && b === 'video'));

  const render = (id) => {
    switch (id) {
      case 'inspiration': return <Inspiration />;
      case 'kpis': return (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {kpis.map(([label, l, cls]) => (
            <button key={label} type="button" onClick={() => setList({ title: label, items: l })} className="text-left bg-white rounded-2xl border border-gray-200 px-4 py-3 hover:border-[#0808f8]/40 hover:shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
              <div className={`text-3xl font-black tabular-nums leading-tight ${cls}`} style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>{l.length}</div>
            </button>
          ))}
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3" title={data.effort_source === 'bamboohr' ? 'Clocked-in time on active tasks' : 'Active tasks within 09:00–19:00'}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Worked</div>
            <div className="text-3xl font-black tabular-nums leading-tight text-[#0808f8]" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>{hrs(people.reduce((a, p) => a + (p.effort_s || 0), 0))}</div>
          </div>
        </div>
      );
      case 'out': return outToday.length ? (
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-white rounded-2xl border border-gray-200 px-4 py-2.5">
          <Plane size={14} className="text-gray-400" /> Out today:
          {outToday.map(p => <span key={p.id} className="flex items-center gap-1.5 font-semibold text-gray-800"><Avatar person={p} size={20} />{p.name.split(' ')[0]}</span>)}
        </div>
      ) : (editing ? <div className="text-xs text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-2.5">Out today — shows when someone is off</div> : null);
      case 'battery_video': return showBoard('video') ? <Battery board={data.boards.video} items={items.filter(i => i.board === 'video')} onOpen={setList} /> : null;
      case 'battery_design': return showBoard('design') ? <Battery board={data.boards.design} items={items.filter(i => i.board === 'design')} onOpen={setList} /> : null;
      case 'people_video':
      case 'people_design': {
        const role = id === 'people_video' ? 'video' : 'design';
        const listP = byRole(role);
        if (!listP.length) return null;
        return (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{role === 'video' ? 'Video editors' : 'Designers'}</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
              {listP.map(p => <PersonCard key={p.id} person={p} items={items.filter(i => i.people.includes(p.id))} upcoming={upcomingFor(p.id)} boards={data.boards} onOpen={setList} today={today} />)}
            </div>
          </div>
        );
      }
      case 'completed': return (
        <Card title="Completed" subtitle="Delivered in this period · click a bar" className="h-full">
          <div className="flex flex-col gap-4 pt-2">
            {doneBy.map(({ b, list: l }) => (
              <button key={b} type="button" onClick={() => setList({ title: `${BOARD_LABEL[b]} · completed`, items: l })} className="text-left group">
                <div className="flex justify-between text-xs text-gray-600 mb-1"><span className="group-hover:text-[#0808f8]">{BOARD_LABEL[b]} projects</span><b className="text-gray-900 tabular-nums">{l.length}</b></div>
                <div className="h-7 rounded-lg bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-lg group-hover:brightness-110" style={{ width: `${(l.length / doneMax) * 100}%`, background: b === 'video' ? '#579bfc' : '#a25ddc', transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                </div>
              </button>
            ))}
          </div>
        </Card>
      );
      case 'requesters': return (
        <Card title="By requester" subtitle="Done vs open · click to see" className="h-full">
          <BarList rows={requesterRows} onPick={(r) => setList({ title: `Requested by ${r.label}`, person: r.person, items: r.items, filter: { requesters: [r.key] } })} />
        </Card>
      );
      case 'products': return (
        <Card title="By product" className="h-full">
          <BarList rows={productRows} onPick={(r) => setList({ title: r.label, color: r.color, items: r.items, filter: { product: r.label } })} />
        </Card>
      );
      case 'emails': return <EmailTasks emails={emails} data={data} onOpen={setList} />;
      case 'new_requests': return (
        <Card title={<span className="flex items-center gap-2"><Inbox size={15} className="text-[#0808f8]" /> New requests</span>} subtitle="Form requests and tasks waiting for someone">
          {newRequests.length ? (
            <div className="divide-y divide-gray-100">
              {newRequests.slice(0, 15).map(it => (
                <div key={it.id} className="flex items-center gap-3 py-2">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-none" style={{ background: DIVISION[it.division]?.color }}>{it.division === 'tv' ? 'TV' : BOARD_LABEL[it.board]}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={it.name}>{it.name}</span>
                  <span className="text-xs text-gray-500 flex-none">{it.requested_by.map(r => data.requesters[r]?.name.split(' ')[0]).filter(Boolean).join(', ')}</span>
                  <TimelinePill timeline={it.timeline} today={today} color={it.status.color} small />
                  <span className={`text-xs flex-none w-16 text-right ${it.deadline && it.deadline < today ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{fmtDate(it.deadline)}</span>
                  {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]"><ExternalLink size={14} /></a>}
                </div>
              ))}
              {newRequests.length > 15 && <button type="button" onClick={() => setList({ title: 'New requests', items: newRequests })} className="text-xs font-semibold text-gray-500 hover:text-gray-800 pt-2">+{newRequests.length - 15} more</button>}
            </div>
          ) : <Empty>No new requests waiting.</Empty>}
        </Card>
      );
      case 'tasks': return (
        <Card title="All tasks" subtitle="Scheduled by Monday timeline · “Worked” = time active in this period, “Total” = across the task’s life" pad={false}>
          <div className="px-3 pb-3"><TaskTable items={items} allItems={allItems} data={data} /></div>
        </Card>
      );
      default: return null;
    }
  };

  const save = async () => {
    setSaving(true);
    try { await studioApi.saveLayout(layout); setEditing(false); } finally { setSaving(false); }
  };
  const shown = editing ? layout : layout.filter(w => !w.hidden);

  return (
    <div>
      <div className="flex justify-end gap-2 mb-2">
        {editing ? (
          <>
            <button type="button" onClick={() => setLayout(mergeLayout(null))} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-gray-500 hover:bg-white"><RotateCcw size={13} /> Reset</button>
            <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white" style={{ background: '#0808f8' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save layout
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-white"><LayoutGrid size={13} /> Arrange dashboard</button>
        )}
      </div>
      {editing && <div className="mb-3 text-xs text-[#0808f8] bg-[#0808f8]/5 rounded-xl px-4 py-2.5">Drag blocks by the handle, pick a width (⅓ · ½ · Full), hide what you don’t need — then Save layout. Your layout is saved to your account.</div>}
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => { if (over && active.id !== over.id) setLayout(l => arrayMove(l, l.findIndex(x => x.id === active.id), l.findIndex(x => x.id === over.id))); }}>
        <SortableContext items={shown.map(w => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-6 gap-5 items-start">
            {shown.map(w => {
              const content = render(w.id);
              if (!content && !editing) return null;
              return (
                <SortableWidget key={w.id} w={w} editing={editing}
                  onSize={(size) => setLayout(l => l.map(x => (x.id === w.id ? { ...x, size } : x)))}
                  onHide={() => setLayout(l => l.map(x => (x.id === w.id ? { ...x, hidden: !x.hidden } : x)))}>
                  {content || <div className="text-xs text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center">{WIDGETS.find(x => x.id === w.id)?.label} — nothing for these filters</div>}
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      <TaskListModal list={list} data={data} onClose={() => setList(null)} onFilter={(patch) => setF({ ...f, ...patch })} />
    </div>
  );
}
