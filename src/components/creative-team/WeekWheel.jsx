// "My week" wheel (Tomer, 25 Nov 2026: "a dashboard wheel of the weekly tasks + statuses, and being able to see data back
// and forward — by priority, by requester, by campaign type, by product"). A task belongs to a week when its timeline
// touches the week, else when its deadline falls in it; undated open tasks count in the current week.
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { studioApi } from '../../lib/studioService';

const DAY = 86400000;
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const at = (d) => Date.parse(`${d}T12:00:00Z`);
export const sundayOf = (d) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return ymd(x.getTime()); };
export const addDays = (d, n) => ymd(at(d) + n * DAY);

/** Does the task belong to the week [from, to] (YYYY-MM-DD, Sun–Sat)? */
export function inWeek(it, from, to, today) {
  const current = today >= from && today <= to;
  const tl = it.timeline;
  if (tl?.from || tl?.to) {
    const a = tl.from || tl.to, b = tl.to || tl.from;
    if (a <= to && b >= from) return true;
    return !!it.open && current && b < from;   // still open after its dates → it's on this week's plate (carried over)
  }
  if (it.deadline) return (it.deadline >= from && it.deadline <= to) || (!!it.open && current && it.deadline < from);
  return !!it.open && current;
}
/** Is the task carried over from an earlier week (still open, its dates already past)? */
export const carried = (it, from) => !!it.open && ((it.timeline?.to || it.timeline?.from || it.deadline || '9999') < from);
// Monday's near-black labels (e.g. #333333) vanish on a dark page — use a mid grey that reads in both themes
const readable = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); if (!m) return c; const n = parseInt(m[1], 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l < 0.25 ? '#7b8494' : c; };

const GREY = '#c4c4c4';
const PALETTE = ['#0808f8', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#00a9a5', '#ff7a1a', '#579bfc', '#9cd326', '#ff158a'];
export const BY = [['status', 'Status'], ['priority', 'Priority'], ['requester', 'Requester'], ['campaign', 'Campaign type'], ['product', 'Product'], ['type', 'Type']];

/** Slices of the wheel: [{ key, label, color, items }] biggest first (pure). */
export function slices(items, by, { people = {}, groups = null } = {}) {
  const m = new Map();
  const add = (key, label, color, it) => { const k = key || '—'; if (!m.has(k)) m.set(k, { key: k, label: label || k, color: color || null, items: [] }); m.get(k).items.push(it); };
  for (const it of items) {
    if (by === 'status') add(it.status?.label || 'No status', it.status?.label, it.status?.color, it);
    else if (by === 'priority') add(it.priority?.label || 'No priority', it.priority?.label || 'No priority', it.priority?.color || GREY, it);
    else if (by === 'product') add(it.product?.label || 'No product', it.product?.label || 'No product', it.product?.color, it);
    else if (by === 'type') add(it.type?.label || 'No type', it.type?.label || 'No type', it.type?.color, it);
    else if (by === 'requester') {
      const ids = it.requested_by?.length ? it.requested_by : [null];
      for (const id of ids) add(id ? `r${id}` : 'none', id ? (people[id]?.name || 'Someone') : 'Nobody named', null, it);
    } else if (by === 'campaign') {
      const labels = String(it.campaign || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!labels.length) add('none', 'No campaign', GREY, it);
      const seen = new Set();
      for (const l of labels) {
        const gk = groups?.of?.[l];
        const g = gk ? (groups.groups || []).find(x => x.key === gk) : null;
        const key = g ? `g:${g.key}` : `c:${l}`;
        if (seen.has(key)) continue;
        seen.add(key);
        add(key, g ? g.name : l, g?.color || null, it);
      }
    }
  }
  const out = [...m.values()].sort((a, b) => b.items.length - a.items.length);
  let i = 0;
  for (const s of out) s.color = s.color ? readable(s.color) : PALETTE[i++ % PALETTE.length];
  return out;
}

function Donut({ parts, size = 168, stroke = 22, active, onPick, center }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const gap = parts.length > 1 ? 3 : 0;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none" role="img" aria-label="Your week by group">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth={stroke} />
      {total > 0 && parts.map(p => {
        const len = (p.n / total) * C;
        const dash = Math.max(0.5, len - gap);
        const el = (
          <circle key={p.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={active === p.key ? stroke + 6 : stroke}
            strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ cursor: 'pointer', transition: 'stroke-width .15s, opacity .15s', opacity: active && active !== p.key ? 0.35 : 1 }}
            onClick={() => onPick(p.key)}><title>{`${p.label}: ${p.n}`}</title></circle>
        );
        off += len;
        return el;
      })}
      <foreignObject x={stroke} y={stroke} width={size - stroke * 2} height={size - stroke * 2}>
        <div className="w-full h-full flex flex-col items-center justify-center text-center">{center}</div>
      </foreignObject>
    </svg>
  );
}

export default function WeekWheel({ items, people, today, onOpen, Row }) {
  const [week, setWeek] = useState(() => sundayOf(today || ymd(Date.now())));
  const [by, setBy] = useState(() => { try { return localStorage.getItem('cp_wheel_by') || 'status'; } catch { return 'status'; } });
  const [active, setActive] = useState(null);
  const [groups, setGroups] = useState(null);
  useEffect(() => { if (by === 'campaign' && !groups) studioApi.campaignGroupMap().then(setGroups).catch(() => setGroups({ groups: [], of: {} })); }, [by, groups]);
  useEffect(() => { try { localStorage.setItem('cp_wheel_by', by); } catch { /* ignore */ } setActive(null); }, [by]);
  useEffect(() => setActive(null), [week]);
  const from = week, to = addDays(week, 6);
  const thisWeek = sundayOf(today || ymd(Date.now()));
  const mine = useMemo(() => (items || []).filter(it => inWeek(it, from, to, today)), [items, from, to, today]);
  const parts = useMemo(() => slices(mine, by, { people, groups }).map(s => ({ ...s, n: s.items.length })), [mine, by, people, groups]);
  const done = mine.filter(it => it.status?.category === 'delivered').length;
  const over = mine.filter(it => carried(it, from)).length;
  const picked = active ? parts.find(p => p.key === active) : null;
  const label = week === thisWeek ? 'This week' : week === addDays(thisWeek, 7) ? 'Next week' : week === addDays(thisWeek, -7) ? 'Last week'
    : `Week of ${new Date(at(week)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  const range = `${new Date(at(from)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(at(addDays(from, 4))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  const max = Math.max(1, ...parts.map(p => p.n));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-gray-200 bg-white">
          <button type="button" onClick={() => setWeek(w => addDays(w, -7))} className="p-1.5 text-gray-500 hover:text-[#030b2e]" aria-label="Week before"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setWeek(thisWeek)} className="px-2 text-[12.5px] font-bold text-[#030b2e] min-w-[96px]" title="Back to this week">{label}</button>
          <button type="button" onClick={() => setWeek(w => addDays(w, 7))} className="p-1.5 text-gray-500 hover:text-[#030b2e]" aria-label="Week after"><ChevronRight size={16} /></button>
        </div>
        <span className="text-[11.5px] text-gray-400">{range}</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {BY.map(([k, l]) => <button key={k} type="button" onClick={() => setBy(k)} className={`text-[11.5px] font-semibold px-2 py-1 rounded-lg ${by === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{l}</button>)}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        <Donut parts={parts} active={active} onPick={(k) => setActive(a => (a === k ? null : k))}
          center={<>
            <div className="text-[34px] font-black leading-none text-[#030b2e]">{picked ? picked.n : mine.length}</div>
            <div className="text-[11px] text-gray-500 mt-1 leading-tight px-2 truncate max-w-full">{picked ? picked.label : mine.length === 1 ? 'task' : 'tasks'}</div>
            {!picked && mine.length > 0 && <div className="text-[10.5px] text-emerald-600 font-semibold mt-0.5">{done} done</div>}
            {!picked && over > 0 && <div className="text-[10px] text-red-600 font-semibold" title="Still open from earlier weeks">{over} carried over</div>}
          </>} />
        <div className="flex-1 min-w-0 w-full flex flex-col gap-1">
          {!parts.length && <div className="text-[13px] text-gray-400 py-6 text-center">Nothing on your plate this week.</div>}
          {parts.map(p => (
            <button key={p.key} type="button" onClick={() => setActive(a => (a === p.key ? null : p.key))}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${active === p.key ? 'bg-[#0808f8]/8' : 'hover:bg-gray-50'}`}>
              <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: p.color }} />
              <span className="text-[13px] text-[#030b2e] truncate min-w-0 flex-1">{p.label}</span>
              <span className="hidden sm:block w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden flex-none"><span className="block h-full rounded-full" style={{ width: `${(p.n / max) * 100}%`, background: p.color }} /></span>
              <span className="text-[12.5px] font-bold text-[#030b2e] w-6 text-right flex-none">{p.n}</span>
            </button>
          ))}
        </div>
      </div>
      {picked && (
        <div className="border-t border-gray-100 pt-2 flex flex-col">
          {picked.items.map(it => <Row key={it.id} it={it} today={today} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}
