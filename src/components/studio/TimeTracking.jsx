import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Plane, Info, ExternalLink, Users, Sparkles, ArrowUpDown, Hourglass } from 'lucide-react';
import { Avatar, Card, ProductTag, StatusPill, Empty, hrs, Seg, CATEGORY } from './Bits';
import { addDays } from './Filters';
import { useStudio } from './writes';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;
// "delivered" mid-life = approved, then reopened later — that gap isn't part of the task's life
const PHASES = ['queued', 'in_progress', 'fixes', 'review', 'paused', 'stuck', 'other'];
const PHASE_LABEL = { queued: 'Waiting' };
const phaseLabel = (k) => PHASE_LABEL[k] || CATEGORY[k]?.label || k;
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');
const dayOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Jerusalem' }) : null);
const first = (name) => (name || '').split(' ')[0];
const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

/** ms → "5h" / "3.5d" / "18d" */
function dur(ms) {
  if (ms == null || !Number.isFinite(ms)) return '–';
  if (ms < DAY_MS) return `${Math.max(1, Math.round(ms / 3600000))}h`;
  const d = ms / DAY_MS;
  return `${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)}d`;
}

function days(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A task's life: submitted → completed (or now), and where that time went. */
function lifeOf(it, nowMs) {
  const l = it.life;
  if (!l?.submitted) return null;
  const a = Date.parse(l.submitted);
  const b = l.completed ? Date.parse(l.completed) : nowMs;
  const reopened = (l.phases?.delivered || 0) * 1000;
  return {
    ms: Math.max(0, b - a - reopened),
    reopened,
    wait: l.started ? Math.max(0, Date.parse(l.started) - a) : null,
    done: !!l.completed,
    phases: l.phases || {},
    fixes: l.fix_rounds || 0,
    partial: !!l.partial,
  };
}

// One person selected → their share of each task; otherwise everyone's
const periodS = (it, who) => (who ? it.effort_by_person?.[who] || 0 : it.effort_s || 0);
const totalS = (it, who) => (who ? Object.values(it.effort_days?.[who] || {}).reduce((a, s) => a + s, 0) : it.effort_total_s || 0);

function LifeBar({ life, height = 8 }) {
  const parts = life ? PHASES.map(k => [k, life.phases[k] || 0]).filter(([, v]) => v > 0) : [];
  const sum = parts.reduce((a, [, v]) => a + v, 0);
  if (!sum) return <div className="rounded-full bg-gray-100" style={{ height }} title="No status history" />;
  return (
    <div className="flex rounded-full overflow-hidden bg-gray-100" style={{ height }}>
      {parts.map(([k, v]) => <span key={k} style={{ width: `${(v / sum) * 100}%`, background: CATEGORY[k]?.color || '#d0d4e4' }} title={`${phaseLabel(k)} · ${dur(v * 1000)}`} />)}
    </div>
  );
}

function PhaseLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {['queued', 'in_progress', 'fixes', 'review', 'paused', 'stuck'].map(k => (
        <span key={k} className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY[k].color }} />{phaseLabel(k)}</span>
      ))}
    </div>
  );
}

/** Pick a designer / video editor (sets the dashboard's People filter). */
function PeoplePicker({ data, f, setF }) {
  const people = Object.values(data.people).filter(p => p.role === 'design' || p.role === 'video');
  const sel = f.people;
  const pick = (id) => setF({ ...f, people: id == null ? [] : (sel.length === 1 && sel[0] === id ? [] : [id]) });
  const chip = (on) => `flex items-center gap-1.5 text-xs font-semibold py-1 rounded-full border transition-colors ${on ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0808f8]/50'}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => pick(null)} className={`${chip(!sel.length)} px-3`}><Users size={13} /> Everyone</button>
      {['design', 'video'].map(role => (
        <Fragment key={role}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 ml-2 mr-0.5">{role === 'design' ? 'Designers' : 'Video editors'}</span>
          {people.filter(p => p.role === role).sort((a, b) => a.name.localeCompare(b.name)).map(p => (
            <button key={p.id} type="button" onClick={() => pick(p.id)} className={`${chip(sel.includes(p.id))} pl-1 pr-2.5`} title={`${p.name} · ${hrs(p.effort_s, { zero: '0' })} on tasks this period`}>
              <Avatar person={p} size={20} /> {first(p.name)}
              <span className={`tabular-nums font-normal ${sel.includes(p.id) ? 'text-white/60' : 'text-gray-400'}`}>{hrs(p.effort_s, { zero: '0' })}</span>
            </button>
          ))}
        </Fragment>
      ))}
    </div>
  );
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
    <div className={`h-[58px] rounded-lg border px-2 py-1.5 flex flex-col justify-between ${clock?.open ? 'border-emerald-300 bg-emerald-50/40' : clock?.no_out ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 bg-white'}`}
      title={`${bamboo ? `Clocked ${hrs(clocked, { zero: '0' })} · on active tasks ${hrs(work, { zero: '0' })}` : `On active tasks ${hrs(work, { zero: '0' })}`}${clock?.no_out ? ' · no clock-out recorded — counted until 19:00 (at most 10h)' : ''}`}>
      <div className="text-[10px] text-gray-500 tabular-nums truncate">
        {clock ? (clock.no_out ? <>{time(clock.in)}–<span className="text-amber-700">no clock-out</span></> : `${time(clock.in)}–${clock.open ? 'now' : time(clock.out)}`) : bamboo ? <span className="text-amber-600">no clock-in</span> : ' '}
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
  const { openTask } = useStudio();
  const rows = items
    .map(it => ({ it, mine: it.effort_by_person?.[person.id] || 0 }))
    .filter(r => r.mine > 0 || r.it.active_now)
    .sort((a, b) => b.mine - a.mine);
  const max = Math.max(1, ...rows.map(r => r.mine));
  if (!rows.length) return <div className="text-xs text-gray-400 py-3 px-2">No active task time in this period.</div>;
  return (
    <div className="divide-y divide-gray-50">
      {rows.map(({ it, mine }) => (
        <div key={it.id} onClick={() => openTask(it)} className="grid grid-cols-[minmax(0,1fr)_160px_64px_64px_20px] items-center gap-3 py-2 px-2 text-xs cursor-pointer rounded-lg hover:bg-white">
          <div className="min-w-0">
            <div className="truncate text-gray-900" title={it.name}>{it.name}</div>
            <div className="flex items-center gap-2 mt-0.5"><ProductTag product={it.product} /><StatusPill status={it.status} small /></div>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#0808f8]" style={{ width: `${(mine / max) * 100}%` }} /></div>
          <div className="text-right font-bold text-gray-900 tabular-nums" title="This person’s time on the task in this period">{hrs(mine)}</div>
          <div className="text-right text-gray-500 tabular-nums" title="All hands-on time on the task (everyone, whole life)">{hrs(it.effort_total_s)}</div>
          <div>{it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-300 hover:text-[#0808f8]"><ExternalLink size={13} /></a>}</div>
        </div>
      ))}
    </div>
  );
}

export default function TimeTracking({ data, items, allItems, range, f, setF }) {
  const [open, setOpen] = useState(() => new Set());
  const [howOpen, setHowOpen] = useState(false);
  const bamboo = data.effort_source === 'bamboohr';
  const who = f.people.length === 1 ? f.people[0] : null;
  const cols = useMemo(() => days(range.from, range.to), [range]);
  const showDays = cols.length <= 14;
  const people = Object.values(data.people)
    .filter(p => (!f.people.length || f.people.includes(p.id)) && (allItems.some(i => i.people.includes(p.id)) || p.effort_s || p.clocked_s))
    .sort((a, b) => (a.role === b.role ? (b.effort_s || 0) - (a.effort_s || 0) : a.role === 'design' ? -1 : 1));
  const toggle = (id) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Work done this period on tasks whose timeline is another week
  const outside = useMemo(() => allItems.filter(i => periodS(i, who) > 0 && !items.includes(i)), [allItems, items, who]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <PeoplePicker data={data} f={f} setF={setF} />
        <button type="button" onClick={() => setHowOpen(v => !v)} className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#0808f8]">
          <Info size={14} /> How time is counted
        </button>
      </div>
      {howOpen && (
        <Card>
          <div className="text-sm text-gray-600">
            A task counts only while it’s <b>Working</b> or in <b>Fixes Round</b>, and only while its person is {bamboo ? <b>clocked in on BambooHR</b> : <b>within Sun–Thu 09:00–19:00</b>}.
            Paused, review, nights and weekends never count. When someone has several tasks active at once, that time is split between them, so a person’s total never exceeds the hours they actually worked.
            A task’s <b>life</b> runs from when it was submitted on Monday to when it was completed (or until now), split by the status it was in.
            {!bamboo && <span className="block mt-1 text-xs text-amber-700">Connect BambooHR (Connections tab) to use real clock-in / clock-out instead of fixed hours.</span>}
          </div>
        </Card>
      )}

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
                          <PersonTasks person={p} items={allItems.filter(i => i.people.includes(p.id))} />
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

      <Card title="Effort per task"
        subtitle={`Tasks with a timeline in this period${who ? ` · ${first(data.people[who]?.name)}’s hands-on time only` : ''} · click a task to see its life and each day’s hours against the hours clocked in`}
        right={<PhaseLegend />}>
        <TaskEffort items={items} outside={outside} data={data} who={who} bamboo={bamboo} />
      </Card>

      <Card title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-[#0808f8]" /> Smart stats</span>}
        subtitle="Who asks for what, how much studio time it takes, and how long it takes to get done · tasks with a timeline in this period">
        <GroupStats items={items} data={data} who={who} f={f} setF={setF} />
      </Card>
    </div>
  );
}

// ── Effort per task ─────────────────────────────────────────────────────────
const SORTS = [['period', 'Hours this period'], ['total', 'Hours in total'], ['life', 'Longest life'], ['wait', 'Longest wait'], ['fixes', 'Most fix rounds']];

function TaskEffort({ items, outside, data, who, bamboo }) {
  const [sort, setSort] = useState('period');
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(30);
  const [withOutside, setWithOutside] = useState(false);
  const nowMs = Date.parse(data.generated_at) || Date.now();
  const rows = useMemo(() => {
    const list = withOutside ? [...items, ...outside] : items;
    const val = {
      period: (r) => r.p, total: (r) => r.t, life: (r) => r.life?.ms ?? -1,
      wait: (r) => r.life?.wait ?? (r.life && !r.life.done ? r.life.ms : -1), fixes: (r) => r.life?.fixes ?? -1,
    }[sort];
    return list.map(it => ({ it, life: lifeOf(it, nowMs), p: periodS(it, who), t: totalS(it, who) }))
      .sort((a, b) => (val(b) - val(a)) || (b.t - a.t));
  }, [items, outside, withOutside, sort, who, nowMs]);
  if (!items.length && !outside.length) return <Empty>No tasks with a timeline in this period.</Empty>;
  const outsideS = outside.reduce((a, i) => a + periodS(i, who), 0);
  const req = (it) => it.requested_by?.map(r => first(data.requesters[r]?.name)).filter(Boolean).join(', ');
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Seg value={sort} onChange={setSort} options={SORTS} />
      </div>
      <div className="hidden md:grid grid-cols-[16px_minmax(0,1fr)_minmax(120px,240px)_64px_64px_52px_44px] gap-3 px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
        <span /><span>Task</span><span>Life · submitted → done</span>
        <span className="text-right" title="Hands-on time in this period">Period</span>
        <span className="text-right" title="All hands-on time, whole life">Worked</span>
        <span className="text-right" title="Calendar time from submission to completion (or until now)">Life</span>
        <span className="text-right" title="Times it went back to Fixes Round">Fixes</span>
      </div>
      {rows.slice(0, limit).map(({ it, life, p, t }) => {
        const isOpen = openId === it.id;
        const r = req(it);
        return (
          <Fragment key={`${it.board}:${it.id}`}>
            <button type="button" onClick={() => setOpenId(isOpen ? null : it.id)}
              className={`grid grid-cols-[16px_minmax(0,1fr)_56px_56px] md:grid-cols-[16px_minmax(0,1fr)_minmax(120px,240px)_64px_64px_52px_44px] items-center gap-3 py-2 px-2 text-xs text-left rounded-lg border-b border-gray-50 ${isOpen ? 'bg-[#0808f8]/[0.04]' : 'hover:bg-gray-50'} ${!items.includes(it) ? 'opacity-70' : ''}`}>
              {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex -space-x-1.5 flex-none">{it.people.map(pid => data.people[pid] && <Avatar key={pid} person={data.people[pid]} size={20} ring="#fff" />)}</div>
                  <span className="truncate text-[13px] text-gray-900" title={it.name}>{it.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 min-w-0">
                  <ProductTag product={it.product} />
                  {r && <span className="truncate">for {r}</span>}
                  {life && <span className="whitespace-nowrap">{fmtDate(it.life.submitted)} → {life.done ? fmtDate(it.life.completed) : 'open'}</span>}
                  {!life?.done && <StatusPill status={it.status} small />}
                </div>
              </div>
              <div className="hidden md:block"><LifeBar life={life} /></div>
              <div className="text-right font-bold text-gray-900 tabular-nums">{hrs(p)}</div>
              <div className="text-right text-gray-600 tabular-nums">{hrs(t)}</div>
              <div className="hidden md:block text-right text-gray-600 tabular-nums">{life ? dur(life.ms) : '–'}</div>
              <div className={`hidden md:block text-right tabular-nums ${life?.fixes >= 3 ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>{life?.fixes ? `${life.fixes}×` : '–'}</div>
            </button>
            {isOpen && <TaskLifeDetail it={it} life={life} data={data} who={who} bamboo={bamboo} />}
          </Fragment>
        );
      })}
      {rows.length > limit && <button type="button" onClick={() => setLimit(l => l + 40)} className="text-xs font-semibold text-gray-500 hover:text-gray-800 pt-3">Show more ({rows.length - limit})</button>}
      {outside.length > 0 && (
        <button type="button" onClick={() => setWithOutside(v => !v)} className="mt-3 self-start text-xs text-gray-500 hover:text-[#0808f8]">
          {withOutside ? 'Hide' : 'Show'} {outside.length} task{outside.length === 1 ? '' : 's'} with another week’s timeline that also got {hrs(outsideS)} of work this period
        </button>
      )}
    </div>
  );
}

function Fact({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 px-3 py-2 min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm font-bold text-gray-900 truncate">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
  );
}

function workdaysBetween(aIso, bMs) {
  let n = 0;
  const end = new Date(bMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  for (let d = new Date(aIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); d <= end && n < 400; d = addDays(d, 1)) if (dayOf(d) <= 4) n++;
  return n;
}

/** A task's whole story: when it was asked for, when work started, where the time went, and each day's hands-on hours vs. hours clocked in. */
function TaskLifeDetail({ it, life, data, who, bamboo }) {
  const { openTask } = useStudio();
  const rows = [];
  for (const [uid, byDay] of Object.entries(it.effort_days || {})) {
    if (who && uid !== who) continue;
    for (const [d, s] of Object.entries(byDay)) if (s > 0) rows.push({ d, uid, s });
  }
  rows.sort((a, b) => a.d.localeCompare(b.d) || a.uid.localeCompare(b.uid));
  const clockOf = (r) => (data.people[r.uid]?.clock_by_day?.[r.d]?.hours || 0) * 3600;
  const scale = Math.max(1, ...rows.map(r => Math.max(clockOf(r), r.s)));
  const handsOn = rows.reduce((a, r) => a + r.s, 0);
  const workedDays = new Set(rows.map(r => r.d)).size;
  const parts = life ? PHASES.map(k => [k, life.phases[k] || 0]).filter(([, v]) => v > 0) : [];
  const phaseSum = parts.reduce((a, [, v]) => a + v, 0);
  const requester = it.requested_by?.map(r => data.requesters[r]?.name).filter(Boolean).join(', ');
  const nowMs = Date.parse(data.generated_at) || Date.now();
  const lifeEnd = it.life?.completed ? Date.parse(it.life.completed) : nowMs;
  return (
    <div className="mx-1 md:mx-2 mb-3 mt-1 rounded-xl bg-gray-50 border border-gray-100 p-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Fact label="Submitted" value={fmtDate(it.life?.submitted) || '–'} sub={requester ? `by ${requester}` : ''} />
        <Fact label="Work started" value={fmtDate(it.life?.started) || 'Not yet'} sub={life?.wait != null ? `after ${dur(life.wait)} waiting` : ''} />
        <Fact label={life?.done ? 'Completed' : 'Now'} value={life?.done ? fmtDate(it.life.completed) : it.status.label} sub={it.deadline ? `deadline ${fmtDate(`${it.deadline}T12:00:00Z`)}` : ''} />
        <Fact label="Life" value={life ? dur(life.ms) : '–'} sub={it.life?.submitted ? `${workdaysBetween(it.life.submitted, lifeEnd)} workdays${life?.reopened ? ' · see note' : ''}` : ''} />
        <Fact label="Hands-on" value={hrs(handsOn, { zero: '0' })} sub={workedDays ? `on ${workedDays} day${workedDays === 1 ? '' : 's'}` : 'never active while clocked in'} />
      </div>

      {life && phaseSum > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Where its life went</div>
          <LifeBar life={life} height={14} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
            {parts.map(([k, v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY[k]?.color || '#d0d4e4' }} />
                {phaseLabel(k)} <b className="text-gray-900 tabular-nums">{dur(v * 1000)}</b><span className="text-gray-400 tabular-nums">{Math.round((v / phaseSum) * 100)}%</span>
              </span>
            ))}
            {life.fixes > 0 && <span className="text-amber-700 font-semibold">{life.fixes} fix round{life.fixes === 1 ? '' : 's'}</span>}
          </div>
          {life.reopened > 0 && <div className="text-[11px] text-gray-500 mt-1">It was approved, then reopened {dur(life.reopened)} later — that gap isn’t counted in its life.</div>}
          {life.partial && <div className="text-[11px] text-amber-700 mt-1">Part of this task’s history is older than 6 months or missing, so its life may be longer.</div>}
        </div>
      )}

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
          Day by day · hands-on time vs. {bamboo ? 'hours clocked in that day' : 'the 09:00–19:00 workday'}
        </div>
        {rows.length ? (
          <div className="flex flex-col gap-1.5">
            {rows.map(r => {
              const p = data.people[r.uid];
              const c = p?.clock_by_day?.[r.d];
              const clocked = bamboo ? clockOf(r) : 10 * 3600;
              const pct = clocked ? Math.round((r.s / clocked) * 100) : null;
              return (
                <div key={`${r.d}:${r.uid}`} className="grid grid-cols-[92px_minmax(0,110px)_minmax(0,1fr)] md:grid-cols-[110px_130px_minmax(0,1fr)_200px] items-center gap-3 text-xs">
                  <span className="text-gray-600 tabular-nums">{fmtDay(r.d)}</span>
                  <span className="flex items-center gap-1.5 min-w-0"><Avatar person={p || { name: '?' }} size={18} /><span className="truncate">{first(p?.name) || 'Former teammate'}</span></span>
                  <div className="h-3 rounded-full bg-gray-200/80 overflow-hidden" style={{ width: `${(Math.max(clocked, r.s) / (bamboo ? scale : 10 * 3600)) * 100}%`, minWidth: 8 }}
                    title={c ? `Clocked ${time(c.in)}–${c.open ? 'now' : time(c.out)}` : ''}>
                    <div className="h-full rounded-full bg-[#0808f8]" style={{ width: `${clocked ? Math.min(100, (r.s / Math.max(clocked, r.s)) * 100) : 100}%` }} />
                  </div>
                  <span className="col-span-3 md:col-span-1 text-right tabular-nums text-gray-500">
                    <b className="text-gray-900">{hrs(r.s)}</b>
                    {bamboo ? (c ? <> of {hrs(clocked)} clocked · <b className={pct >= 50 ? 'text-[#0808f8]' : 'text-gray-700'}>{pct}%</b> of the day</> : ' · no clock-in that day') : <> · {pct}% of a 10h day</>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : <div className="text-xs text-gray-400">No hands-on time recorded — it was never in Working / Fixes Round while {who ? first(data.people[who]?.name) : 'its person'} was {bamboo ? 'clocked in' : 'within work hours'}.</div>}
      </div>

      <div className="flex items-center gap-4">
        <button type="button" onClick={() => openTask(it)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#0808f8' }}>Open task — status, dates, updates</button>
        {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-gray-500 flex items-center gap-1 hover:text-[#0808f8]">Open in Monday <ExternalLink size={12} /></a>}
      </div>
    </div>
  );
}

// ── Smart stats (by requester / product / type / person) ───────────────────
const GROUPS = [['requester', 'Requester'], ['product', 'Product'], ['type', 'Type'], ['person', 'Designer / editor']];

function groupKeys(it, by) {
  if (by === 'requester') return it.requested_by?.length ? it.requested_by : ['none'];
  if (by === 'product') return [it.product?.label && it.product.label !== '-' ? it.product.label : 'none'];
  if (by === 'type') return [it.type?.label || 'none'];
  return it.people.length ? it.people : ['none'];
}

function GroupStats({ items, data, who, f, setF }) {
  const [by, setBy] = useState('requester');
  const [sort, setSort] = useState(['hours', -1]);
  const nowMs = Date.parse(data.generated_at) || Date.now();
  const { groups, totalHours, insights, lifeMix } = useMemo(() => {
    const m = new Map();
    let total = 0;
    const mix = {};
    const allFix = [];
    for (const it of items) {
      const life = lifeOf(it, nowMs);
      const p = periodS(it, who);
      total += p;
      if (life?.done && !life.partial) {
        for (const [k, v] of Object.entries(life.phases)) if (k !== 'delivered') mix[k] = (mix[k] || 0) + v;
        allFix.push(life.fixes);
      }
      const keys = groupKeys(it, by);
      for (const k of keys) {
        const g = m.get(k) || { key: k, items: [], hours: 0, worked: [], life: [], wait: [], fixes: [], done: 0 };
        g.items.push(it);
        // Shares add up to 100%: a person gets their own hours; a shared request splits its hours between requesters
        g.hours += by === 'person' ? (it.effort_by_person?.[k] || 0) : by === 'requester' ? p / keys.length : p;
        if (life?.done) {
          g.done++;
          if (!life.partial) { g.life.push(life.ms); g.fixes.push(life.fixes); }
          const t = totalS(it, who);
          if (t) g.worked.push(t);
        }
        if (life?.wait != null) g.wait.push(life.wait);
        m.set(k, g);
      }
    }
    const label = (k) => (k === 'none' ? (by === 'requester' ? 'No requester' : by === 'person' ? 'Unassigned' : 'Not set')
      : by === 'requester' ? data.requesters[k]?.name || 'Unknown' : by === 'person' ? data.people[k]?.name || 'Former teammate' : k);
    const list = [...m.values()].map(g => ({
      ...g,
      label: label(g.key),
      person: by === 'requester' ? data.requesters[g.key] : by === 'person' ? data.people[g.key] : null,
      color: by === 'product' ? g.items[0]?.product?.color : null,
      share: total ? g.hours / total : 0,
      avgWorked: avg(g.worked), avgLife: avg(g.life), avgWait: avg(g.wait), avgFix: avg(g.fixes),
    }));

    // Plain-language findings — only the ones the numbers support
    const out = [];
    const named = list.filter(g => g.key !== 'none');
    const top = [...named].sort((a, b) => b.hours - a.hours)[0];
    if (top && total && top.share >= 0.2) {
      out.push(by === 'person' ? `${top.label} put in ${Math.round(top.share * 100)}% of the hands-on hours (${hrs(top.hours)}).`
        : by === 'requester' ? `Requests from ${top.label} took ${Math.round(top.share * 100)}% of the studio’s hands-on hours (${hrs(top.hours)}).`
          : `${top.label} took ${Math.round(top.share * 100)}% of the studio’s hands-on hours (${hrs(top.hours)}).`);
    }
    const studioFix = avg(allFix);
    const fixy = named.filter(g => g.fixes.length >= 2 && g.avgFix != null).sort((a, b) => b.avgFix - a.avgFix)[0];
    if (fixy && studioFix != null && fixy.avgFix >= 1 && fixy.avgFix >= studioFix * 1.4) {
      out.push(`${fixy.label}: ${Math.round(fixy.avgFix * 10) / 10} fix rounds per finished task — the studio average is ${Math.round(studioFix * 10) / 10}.`);
    }
    const timed = named.filter(g => g.life.length >= 2).sort((a, b) => a.avgLife - b.avgLife);
    if (timed.length >= 2 && timed[timed.length - 1].avgLife > timed[0].avgLife * 1.5) {
      out.push(`Fastest from request to done: ${timed[0].label} (${dur(timed[0].avgLife)}). Slowest: ${timed[timed.length - 1].label} (${dur(timed[timed.length - 1].avgLife)}).`);
    }
    const mixSum = Object.values(mix).reduce((a, v) => a + v, 0);
    if (mixSum) {
      const working = ((mix.in_progress || 0) + (mix.fixes || 0)) / mixSum;
      const [bigK, bigV] = Object.entries(mix).filter(([k]) => !['in_progress', 'fixes'].includes(k)).sort((a, b) => b[1] - a[1])[0] || [];
      const where = { queued: 'waiting to be started', review: 'in review / approval', paused: 'paused', stuck: 'stuck' }[bigK];
      if (where && bigV / mixSum >= 0.25) out.push(`A finished task spends ${Math.round((bigV / mixSum) * 100)}% of its life ${where}, and ${Math.round(working * 100)}% in Working / Fixes.`);
    }
    const waiting = items.filter(it => it.open && !it.life?.started && it.life?.submitted && nowMs - Date.parse(it.life.submitted) > 5 * DAY_MS);
    if (waiting.length) out.push(`${waiting.length} open task${waiting.length === 1 ? ' has' : 's have'} waited more than 5 days without being started.`);
    return { groups: list, totalHours: total, insights: out, lifeMix: mix };
  }, [items, by, who, data, nowMs]);

  const [k, dir] = sort;
  const val = { name: (g) => g.label.toLowerCase(), tasks: (g) => g.items.length, hours: (g) => g.hours, worked: (g) => g.avgWorked ?? -1, life: (g) => g.avgLife ?? -1, wait: (g) => g.avgWait ?? -1, fixes: (g) => g.avgFix ?? -1 }[k];
  const sorted = [...groups].sort((a, b) => { const x = val(a); const y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  const maxHours = Math.max(1, ...groups.map(g => g.hours));
  const filterOn = (g) => {
    if (g.key === 'none' || by === 'type') return null;
    if (by === 'requester') return { ...f, requesters: f.requesters.length === 1 && f.requesters[0] === g.key ? [] : [g.key] };
    if (by === 'product') return { ...f, product: f.product === g.key ? '' : g.key };
    return { ...f, people: f.people.length === 1 && f.people[0] === g.key ? [] : [g.key] };
  };
  const active = (g) => (by === 'requester' ? f.requesters.includes(g.key) : by === 'product' ? f.product === g.key : by === 'person' ? f.people.includes(g.key) : false);
  const Head = ({ id, children, right }) => (
    <button type="button" onClick={() => setSort([id, k === id ? -dir : (id === 'name' ? 1 : -1)])} className={`inline-flex items-center gap-1 hover:text-gray-700 ${right ? 'justify-end w-full' : ''}`}>
      {children}{k === id && <ArrowUpDown size={10} />}
    </button>
  );
  const mixSum = Object.values(lifeMix).reduce((a, v) => a + v, 0);

  if (!items.length) return <Empty>No tasks with a timeline in this period.</Empty>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Seg value={by} onChange={setBy} options={GROUPS} />
        <span className="text-xs text-gray-400">{hrs(totalHours, { zero: '0' })} hands-on this period across {items.length} tasks</span>
      </div>

      {(insights.length > 0 || mixSum > 0) && (
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          {insights.length > 0 && (
            <ul className="flex flex-col gap-2">
              {insights.map(t => (
                <li key={t} className="flex items-start gap-2 text-sm text-gray-700"><Sparkles size={14} className="text-[#0808f8] flex-none mt-0.5" />{t}</li>
              ))}
            </ul>
          )}
          {mixSum > 0 && (
            <div className="rounded-xl bg-gray-50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1.5"><Hourglass size={12} /> Life of a finished task, on average</div>
              <LifeBar life={{ phases: lifeMix }} height={14} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {PHASES.filter(p => lifeMix[p]).map(p => (
                  <span key={p} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY[p]?.color || '#d0d4e4' }} />{phaseLabel(p)} <b className="tabular-nums">{Math.round((lifeMix[p] / mixSum) * 100)}%</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="py-2 px-2 font-bold"><Head id="name">{GROUPS.find(g => g[0] === by)[1]}</Head></th>
              <th className="py-2 px-2 font-bold text-right"><Head id="tasks" right>Tasks</Head></th>
              <th className="py-2 px-2 font-bold w-[30%]"><Head id="hours">Hands-on this period</Head></th>
              <th className="py-2 px-2 font-bold text-right" title="Average hands-on hours per finished task"><Head id="worked" right>Per task</Head></th>
              <th className="py-2 px-2 font-bold text-right" title="Average time from submission to completion"><Head id="life" right>Turnaround</Head></th>
              <th className="py-2 px-2 font-bold text-right" title="Average time before work started"><Head id="wait" right>Wait to start</Head></th>
              <th className="py-2 px-2 font-bold text-right" title="Average fix rounds per finished task"><Head id="fixes" right>Fix rounds</Head></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(g => {
              const next = filterOn(g);
              return (
                <tr key={g.key} onClick={next ? () => setF(next) : undefined} title={next ? (active(g) ? 'Clear this filter' : 'Filter the Studio to this') : undefined}
                  className={`border-b border-gray-50 ${next ? 'cursor-pointer hover:bg-gray-50' : ''} ${active(g) ? 'bg-[#0808f8]/[0.05]' : ''}`}>
                  <td className="py-2 px-2">
                    <span className="flex items-center gap-2 min-w-0">
                      {g.person ? <Avatar person={g.person} size={22} /> : <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: g.color || '#c4c4c4' }} />}
                      <span className={`truncate ${g.key === 'none' ? 'text-gray-400' : 'text-gray-900 font-medium'}`}>{g.label}</span>
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{g.items.length}<span className="text-gray-400 text-xs"> · {g.done} done</span></td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-[#0808f8]" style={{ width: `${(g.hours / maxHours) * 100}%` }} /></div>
                      <span className="w-[86px] text-right text-xs tabular-nums"><b className="text-gray-900">{hrs(g.hours, { zero: '0' })}</b><span className="text-gray-400"> · {Math.round(g.share * 100)}%</span></span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{g.avgWorked != null ? hrs(g.avgWorked) : '–'}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{dur(g.avgLife)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-700">{dur(g.avgWait)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${g.avgFix >= 2 ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{g.avgFix != null ? Math.round(g.avgFix * 10) / 10 : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {by === 'requester' && <div className="text-[11px] text-gray-400">A task with two requesters counts for both, and its hours are split between them. Turnaround and fix rounds use finished tasks only.</div>}
    </div>
  );
}
