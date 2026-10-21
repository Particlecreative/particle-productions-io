import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Plane, Info, ExternalLink } from 'lucide-react';
import { Avatar, Card, ProductTag, StatusPill, Empty, hrs } from './Bits';
import { addDays } from './Filters';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');
const dayOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();

function days(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One person's day: clock in/out (BambooHR), time on active tasks, out-of-office. */
function DayCell({ date, person, today, bamboo }) {
  const clock = person.clock_by_day?.[date];
  const work = person.effort_by_day?.[date] || 0;
  const out = (person.out || []).find(o => o.start <= date && o.end >= date);
  const weekend = dayOf(date) > 4;
  const future = date > today;
  const clocked = clock ? clock.hours * 3600 : 0;
  const base = bamboo ? clocked : 10 * 3600;
  const pct = base ? Math.min(100, (work / base) * 100) : 0;
  if (out) {
    return (
      <div className="h-[58px] rounded-lg flex flex-col items-center justify-center text-[10px] text-gray-400 gap-0.5" title={out.name || 'Out'}
        style={{ background: 'repeating-linear-gradient(135deg,#f3f4f6 0 6px,#e9eaee 6px 12px)' }}>
        <Plane size={12} /> {out.type === 'holiday' ? 'Holiday' : 'Off'}
      </div>
    );
  }
  if (weekend && !clock && !work) return <div className="h-[58px] rounded-lg" style={{ background: 'repeating-linear-gradient(135deg,#fafafa 0 6px,#f3f4f6 6px 12px)' }} />;
  if (future) return <div className="h-[58px] rounded-lg bg-gray-50" />;
  return (
    <div className={`h-[58px] rounded-lg border px-2 py-1.5 flex flex-col justify-between ${clock?.open ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-100 bg-white'}`}
      title={bamboo ? `Clocked ${hrs(clocked, { zero: '0' })} · on active tasks ${hrs(work, { zero: '0' })}` : `On active tasks ${hrs(work, { zero: '0' })}`}>
      <div className="text-[10px] text-gray-500 tabular-nums truncate">
        {clock ? `${time(clock.in)}–${clock.open ? 'now' : time(clock.out)}` : bamboo ? <span className="text-amber-600">no clock-in</span> : ' '}
      </div>
      <div className="flex items-end justify-between gap-1">
        <span className="text-sm font-bold text-gray-900 tabular-nums leading-none">{hrs(work, { zero: '0' })}</span>
        {bamboo && clock && <span className="text-[10px] text-gray-400 tabular-nums leading-none">/ {hrs(clocked, { zero: '0' })}</span>}
      </div>
      <div className="h-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#0808f8]" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function PersonTasks({ person, items }) {
  const rows = items
    .map(it => ({ it, mine: it.effort_by_person?.[person.id] || 0 }))
    .filter(r => r.mine > 0 || r.it.active_now)
    .sort((a, b) => b.mine - a.mine);
  const max = Math.max(1, ...rows.map(r => r.mine));
  if (!rows.length) return <div className="text-xs text-gray-400 py-3 px-2">No active task time in this period.</div>;
  return (
    <div className="divide-y divide-gray-50">
      {rows.map(({ it, mine }) => (
        <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_160px_64px_64px_70px_20px] items-center gap-3 py-2 px-2 text-xs">
          <div className="min-w-0">
            <div className="truncate text-gray-900" title={it.name}>{it.name}</div>
            <div className="flex items-center gap-2 mt-0.5"><ProductTag product={it.product} /><StatusPill status={it.status} small /></div>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#0808f8]" style={{ width: `${(mine / max) * 100}%` }} /></div>
          <div className="text-right font-bold text-gray-900 tabular-nums" title="This person’s time on the task in this period">{hrs(mine)}</div>
          <div className="text-right text-gray-500 tabular-nums" title="All time on the task (everyone, whole life)">{hrs(it.effort_total_s)}</div>
          <div className="text-right text-gray-400 tabular-nums" title="Monday timer (reference)">{it.timer_s ? `⏱ ${hrs(it.timer_s)}` : ''}</div>
          <div>{it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]"><ExternalLink size={13} /></a>}</div>
        </div>
      ))}
    </div>
  );
}

export default function TimeTracking({ data, items, range }) {
  const [open, setOpen] = useState(() => new Set());
  const bamboo = data.effort_source === 'bamboohr';
  const cols = useMemo(() => days(range.from, range.to), [range]);
  const showDays = cols.length <= 14;
  const people = Object.values(data.people)
    .filter(p => items.some(i => i.people.includes(p.id)) || p.effort_s || p.clocked_s)
    .sort((a, b) => (a.role === b.role ? (b.effort_s || 0) - (a.effort_s || 0) : a.role === 'design' ? -1 : 1));
  const toggle = (id) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-start gap-3 text-sm text-gray-600">
          <Info size={16} className="text-[#0808f8] flex-none mt-0.5" />
          <div>
            A task counts only while it’s <b>Working</b> or in <b>Fixes Round</b>, and only while its person is {bamboo ? <b>clocked in on BambooHR</b> : <b>within Sun–Thu 09:00–19:00</b>}.
            Paused, review, nights and weekends never count. When someone has several tasks active at once, that time is split between them, so a person’s total never exceeds the hours they actually worked.
            {!bamboo && <span className="block mt-1 text-xs text-amber-700">Connect BambooHR (Connections tab) to use real clock-in / clock-out instead of fixed hours.</span>}
          </div>
        </div>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Clock size={15} className="text-[#0808f8]" /> Time tracking</span>}
        subtitle={bamboo ? 'Each day: clock-in–out · hours on active tasks / hours clocked' : 'Each day: hours on active tasks'} pad={false}>
        <div className="overflow-x-auto px-4 pb-4">
          {people.length ? (
            <table className="w-full border-separate" style={{ borderSpacing: '6px 6px' }}>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="text-left font-semibold px-1 w-[220px]">Person</th>
                  {showDays && cols.map(d => (
                    <th key={d} className={`font-semibold min-w-[92px] ${d === data.today ? 'text-[#0808f8]' : ''}`}>{DOW[dayOf(d)]} <span className="font-normal">{Number(d.slice(8))}</span></th>
                  ))}
                  <th className="text-right font-semibold px-1">On tasks</th>
                  {bamboo && <th className="text-right font-semibold px-1">Clocked</th>}
                  {bamboo && <th className="text-right font-semibold px-1" title="Clocked in, but no task in Working / Fixes — usually a status that wasn’t updated">Not on a task</th>}
                </tr>
              </thead>
              <tbody>
                {people.map(p => {
                  const isOpen = open.has(p.id);
                  const unassignedPct = p.clocked_s ? Math.round((p.unassigned_s / p.clocked_s) * 100) : null;
                  return [
                    <tr key={p.id}>
                      <td className="px-1">
                        <button type="button" onClick={() => toggle(p.id)} className="flex items-center gap-2 text-left w-full">
                          {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                          <Avatar person={p} size={28} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-gray-900 truncate">{p.name}</span>
                            <span className="block text-[11px] text-gray-400">{p.role === 'video' ? 'Video editor' : 'Designer'}{bamboo && p.bamboo === false ? ' · not in BambooHR' : ''}</span>
                          </span>
                        </button>
                      </td>
                      {showDays && cols.map(d => <td key={d}><DayCell date={d} person={p} today={data.today} bamboo={bamboo && p.bamboo !== false} /></td>)}
                      <td className="text-right px-1 text-sm font-bold text-gray-900 tabular-nums">{hrs(p.effort_s, { zero: '0' })}</td>
                      {bamboo && <td className="text-right px-1 text-sm text-gray-600 tabular-nums">{p.clocked_s != null ? hrs(p.clocked_s, { zero: '0' }) : '–'}</td>}
                      {bamboo && (
                        <td className={`text-right px-1 text-sm tabular-nums ${unassignedPct > 35 ? 'text-amber-600 font-semibold' : 'text-gray-500'}`}>
                          {p.unassigned_s != null ? `${hrs(p.unassigned_s, { zero: '0' })}${unassignedPct != null ? ` · ${unassignedPct}%` : ''}` : '–'}
                        </td>
                      )}
                    </tr>,
                    isOpen && (
                      <tr key={`${p.id}-tasks`}>
                        <td colSpan={(showDays ? cols.length : 0) + (bamboo ? 4 : 2)} className="bg-gray-50/70 rounded-xl">
                          <PersonTasks person={p} items={items.filter(i => i.people.includes(p.id))} />
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          ) : <Empty>No time tracked for these filters.</Empty>}
        </div>
      </Card>

      <Card title="Effort per task" subtitle="Where the hours went in this period (all people) · Total = the task’s whole life">
        <TaskEffort items={items} people={data.people} />
      </Card>
    </div>
  );
}

function TaskEffort({ items, people }) {
  const rows = items.filter(i => i.effort_s > 0).sort((a, b) => b.effort_s - a.effort_s).slice(0, 40);
  const max = Math.max(1, ...rows.map(r => r.effort_s));
  if (!rows.length) return <Empty>No active task time in this period.</Empty>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(it => (
        <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,220px)_56px_56px] items-center gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex -space-x-1.5 flex-none">{it.people.map(p => people[p] && <Avatar key={p} person={people[p]} size={20} ring="#fff" />)}</div>
            <span className="truncate text-gray-800" title={it.name}>{it.name}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(it.effort_s / max) * 100}%`, background: it.product?.color || '#0808f8' }} /></div>
          <div className="text-right font-bold text-gray-900 tabular-nums">{hrs(it.effort_s)}</div>
          <div className="text-right text-gray-500 tabular-nums">{hrs(it.effort_total_s)}</div>
        </div>
      ))}
    </div>
  );
}
