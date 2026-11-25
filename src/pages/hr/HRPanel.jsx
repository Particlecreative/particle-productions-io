// Team HR (Tomer, 25 Nov 2026): everyone, from CP, through the company BambooHR (Studio → Connections).
// Today (in now · not in yet · done · off), a Sun–Thu timesheet for any week, time-off requests waiting for an answer
// (approve / deny, with a note), who's out for the next 30 days, and who connected My HR and Monday — with a ready message.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, RefreshCw, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Check, X, Plug, CalendarRange, Inbox, Copy, CheckCircle2,
  XCircle, Clock, Sun, Coffee, TreePalm, PartyPopper, Timer, MessageSquare, Sparkles,
} from 'lucide-react';
import {
  hrApi, EXPECTED_DAY_HOURS, ilToday, addDays, dowOf, daysBetween, fmtHours, fmtTime, fmtDay, fmtRange, initials, colorFor, isWorkday,
} from '../../lib/hrService';

const TITLE = 'text-[#030b2e] dark:text-gray-100';
const META = 'text-gray-500 dark:text-gray-400';
const MUTED = 'text-gray-400 dark:text-gray-500';
const INPUT = 'w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[13px] text-[#030b2e] dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0808f8]/30';
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Card({ title, icon: Icon, sub, action, children, className = '', flush = false }) {
  return (
    <section className={`rounded-3xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 shadow-[0_1px_3px_rgba(3,11,46,.05)] ${flush ? 'pt-5 pb-4' : 'p-5'} min-w-0 ${className}`}>
      {title && (
        <header className={`flex flex-wrap items-center gap-x-2 gap-y-2 mb-4 ${flush ? 'px-5' : ''}`}>
          {Icon && <Icon size={15} className="text-[#0808f8] dark:text-[#8b8bff]" />}
          <h2 className={`font-bold text-[14.5px] ${TITLE}`}>{title}</h2>
          {sub && <span className={`text-[12px] ${MUTED}`}>{sub}</span>}
          {action && <span className="ml-auto flex items-center gap-1.5">{action}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

function Avatar({ name, photo, size = 30 }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} style={style} className="rounded-full object-cover flex-none" />;
  return <span style={{ ...style, background: colorFor(name) }} className="rounded-full flex-none inline-flex items-center justify-center font-bold text-white">{initials(name)}</span>;
}

function Notice({ tone = 'amber', icon: Icon = AlertTriangle, children }) {
  const cls = {
    amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/20',
    rose: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:border-rose-400/20',
    blue: 'bg-[#0808f8]/[0.05] text-[#030b2e] border-[#0808f8]/15 dark:bg-[#8b8bff]/10 dark:text-gray-100 dark:border-[#8b8bff]/20',
  }[tone];
  return <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12.5px] leading-snug ${cls}`}><Icon size={14} className="flex-none mt-0.5" /><div className="min-w-0">{children}</div></div>;
}

const amountWords = (n, unit) => { const v = Number(n) || 0; if (unit === 'hours') return fmtHours(v); return `${v % 1 ? v.toFixed(1) : v} ${v === 1 ? 'day' : 'days'}`; };
const ago = (iso) => { if (!iso) return ''; const m = (Date.now() - Date.parse(iso)) / 60000; if (!Number.isFinite(m)) return ''; return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const nextWorkday = (ymd) => { let d = addDays(ymd, 1); while (!isWorkday(d)) d = addDays(d, 1); return d; };

// ── today ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GROUPS = [
  { key: 'in', label: 'In now', icon: Clock, dot: 'bg-emerald-500', head: 'text-emerald-700 dark:text-emerald-300', tint: 'bg-emerald-50/60 dark:bg-emerald-400/[0.06]' },
  { key: 'not_in', label: 'Not in yet', icon: Coffee, dot: 'bg-amber-500', head: 'text-amber-700 dark:text-amber-300', tint: 'bg-amber-50/60 dark:bg-amber-400/[0.06]' },
  { key: 'done', label: 'Done for today', icon: CheckCircle2, dot: 'bg-sky-500', head: 'text-sky-700 dark:text-sky-300', tint: 'bg-sky-50/60 dark:bg-sky-400/[0.06]' },
  { key: 'off', label: 'Off today', icon: TreePalm, dot: 'bg-violet-500', head: 'text-violet-700 dark:text-violet-300', tint: 'bg-violet-50/60 dark:bg-violet-400/[0.06]' },
];

function TodayBoard({ board, today }) {
  const now = useNow(30000);
  const weekend = !isWorkday(today);
  const by = { in: [], not_in: [], done: [], off: [] };
  for (const p of board || []) (by[p.state === 'weekend' ? 'not_in' : p.state] || by.not_in).push(p);
  const line = (p) => {
    if (p.state === 'in') {
      const h = p.since ? (now - Date.parse(p.since)) / 3600000 : p.hours;
      return p.from_yesterday ? `still in since ${fmtDay(p.since?.slice(0, 10), { weekday: 'short' })} ${fmtTime(p.since)}` : `since ${fmtTime(p.since)} · ${fmtHours(h, { zero: '0m' })}`;
    }
    if (p.state === 'done') return `${fmtTime(p.in)}–${p.no_out ? 'no clock-out' : fmtTime(p.out)} · ${fmtHours(p.hours)}`;
    if (p.state === 'off') return p.until && p.until > today ? `${p.label} · back ${fmtDay(nextWorkday(p.until))}` : p.label;
    return p.job_title || (weekend ? 'Weekend' : '');
  };
  return (
    <Card title="Today" icon={Sun} sub={fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}>
      {weekend && <div className="mb-4"><Notice tone="blue" icon={Coffee}>It’s the weekend — nobody’s expected in today.</Notice></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {GROUPS.map(g => (
          <div key={g.key} className={`rounded-2xl ${g.tint} border border-gray-100 dark:border-white/5 p-3 min-w-0`}>
            <div className={`flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider ${g.head}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${g.dot} ${g.key === 'in' ? 'animate-pulse' : ''}`} />
              {g.key === 'not_in' && weekend ? 'Not working today' : g.label}
              <span className="ml-auto tabular-nums text-[13px]">{by[g.key].length}</span>
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {by[g.key].map(p => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-xl bg-white dark:bg-white/[0.04] px-2 py-1.5 shadow-[0_1px_2px_rgba(3,11,46,.04)]">
                  <Avatar name={p.name} photo={p.photo_url} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12.5px] font-semibold truncate ${TITLE}`}>{p.name}</div>
                    <div className={`text-[11px] truncate tabular-nums ${p.no_out ? 'text-amber-600 dark:text-amber-300' : MUTED}`}>{line(p)}</div>
                  </div>
                </li>
              ))}
              {!by[g.key].length && <li className={`text-[12px] py-2 text-center ${MUTED}`}>Nobody</li>}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── the week ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function GridCell({ c, date, today }) {
  if (!c) return <span className={MUTED}>·</span>;
  if (c.off && !c.hours) return <div className="rounded-lg px-1.5 py-1 bg-violet-50 dark:bg-violet-400/10 text-violet-700 dark:text-violet-300 text-[11px] font-semibold truncate" title={c.off}>{c.off}</div>;
  if (c.missing) return <div className="rounded-lg px-1.5 py-1 bg-rose-50 dark:bg-rose-400/10 text-rose-600 dark:text-rose-300 text-[11px] font-semibold whitespace-nowrap">No clock-in</div>;
  if (!c.hours) return <span className={`${MUTED} text-[13px]`}>{date > today ? '' : '–'}</span>;
  const tone = c.open ? 'bg-emerald-50 dark:bg-emerald-400/10' : c.short ? 'bg-amber-50 dark:bg-amber-400/10' : c.no_out ? 'bg-amber-50/70 dark:bg-amber-400/[0.07]' : 'bg-gray-50 dark:bg-white/[0.04]';
  return (
    <div className={`rounded-lg px-1.5 py-1 ${tone}`} title={`${fmtTime(c.in)}–${c.open ? 'now' : c.no_out ? 'no clock-out (counted until 19:00, at most 10h)' : fmtTime(c.out)}`}>
      <div className={`font-bold tabular-nums text-[12.5px] ${c.short ? 'text-amber-700 dark:text-amber-300' : TITLE}`}>{fmtHours(c.hours)}{c.open && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 align-middle animate-pulse" />}</div>
      <div className={`text-[10.5px] tabular-nums truncate ${c.no_out ? 'text-amber-600 dark:text-amber-300' : MUTED}`}>{fmtTime(c.in)}–{c.open ? 'now' : c.no_out ? 'no out' : fmtTime(c.out)}</div>
    </div>
  );
}

function WeekGrid({ data, onWeek }) {
  const { days = [], grid = [], today, this_week: thisWeek, week_start: ws } = data;
  const expectedDay = data.expected_day_hours || EXPECTED_DAY_HOURS;
  const cols = days.filter(d => isWorkday(d) || grid.some(r => r.cells?.[d]?.hours > 0));
  const holidays = data.holidays_week || [];
  const isThis = ws === thisWeek;
  const label = isThis ? 'This week' : ws === addDays(thisWeek, -7) ? 'Last week' : fmtRange(ws, addDays(ws, 4), { day: 'numeric', month: 'short' });
  const nav = (
    <div className="flex items-center gap-1.5">
      <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
        <button type="button" onClick={() => onWeek(addDays(ws, -7))} className={`p-1.5 ${META} hover:bg-gray-50 dark:hover:bg-white/5`} aria-label="Previous week"><ChevronLeft size={16} /></button>
        <span className={`px-2 text-[12.5px] font-semibold min-w-[118px] text-center ${TITLE}`}>{label}<span className={`block text-[10.5px] font-normal ${MUTED}`}>{fmtRange(ws, addDays(ws, 4), { day: 'numeric', month: 'short' })}</span></span>
        <button type="button" disabled={isThis} onClick={() => onWeek(addDays(ws, 7))} className={`p-1.5 ${META} hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-30`} aria-label="Next week"><ChevronRight size={16} /></button>
      </div>
      {!isThis && <button type="button" onClick={() => onWeek(null)} className="text-[12px] font-semibold text-[#0808f8] dark:text-[#8b8bff] px-2 py-1 rounded-lg hover:bg-[#0808f8]/[0.06]">This week</button>}
    </div>
  );
  return (
    <Card title="Timesheet" icon={CalendarRange} sub={`hours per day · ${fmtHours(expectedDay)} expected Sun–Thu`} action={nav} flush>
      {data.errors?.timesheets && <div className="px-5 mb-3"><Notice>{data.errors.timesheets}</Notice></div>}
      {grid.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left border-separate border-spacing-0">
            <thead>
              <tr className={`text-[11px] uppercase tracking-wider ${MUTED}`}>
                <th className="sticky left-0 z-[1] bg-white dark:bg-[#0d1117] font-semibold pl-4 sm:pl-5 pr-2 sm:pr-3 py-2 w-[150px] sm:w-[200px]">Person</th>
                {cols.map(d => {
                  const hol = holidays.find(h => h.start <= d && h.end >= d);
                  return (
                    <th key={d} className={`font-semibold px-1.5 py-2 text-center ${d === today ? 'text-[#0808f8] dark:text-[#8b8bff]' : ''}`}>
                      {DAY[dowOf(d)]}<span className="block normal-case tracking-normal font-normal text-[10.5px]">{fmtDay(d, { day: 'numeric', month: 'short' })}</span>
                      {hol && <span className="mt-0.5 inline-flex items-center gap-0.5 normal-case tracking-normal text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300" title={hol.name}><PartyPopper size={10} />{hol.name}</span>}
                    </th>
                  );
                })}
                <th className="font-semibold pl-2 pr-5 py-2 text-right w-[130px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.map(r => {
                // this week: finished days only (today isn't over yet); other weeks: the whole week
                const low = isThis ? r.expected_to_date > 0 && (r.total_to_date ?? r.total) < r.expected_to_date - 0.5 : r.expected > 0 && r.total < r.expected - 0.5;
                const pct = r.expected ? Math.min(1, r.total / r.expected) : 0;
                return (
                  <tr key={r.id} className="group">
                    <td className="sticky left-0 z-[1] bg-white dark:bg-[#0d1117] group-hover:bg-gray-50 dark:group-hover:bg-[#161b22] pl-4 sm:pl-5 pr-2 sm:pr-3 py-1.5 border-t border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={r.name} photo={r.photo_url} size={28} />
                        <div className="min-w-0">
                          <div className={`text-[12.5px] font-semibold truncate ${TITLE}`}>{r.name}</div>
                          <div className={`text-[10.5px] truncate ${MUTED}`}>{r.job_title || (r.tracked ? '' : 'doesn’t clock in')}</div>
                        </div>
                      </div>
                    </td>
                    {cols.map(d => <td key={d} className={`px-1 py-1.5 text-center border-t border-gray-100 dark:border-white/5 group-hover:bg-gray-50/70 dark:group-hover:bg-white/[0.02] ${d === today ? 'bg-[#0808f8]/[0.025] dark:bg-[#8b8bff]/[0.04]' : ''}`}><GridCell c={r.cells?.[d]} date={d} today={today} /></td>)}
                    <td className="pl-2 pr-5 py-1.5 text-right border-t border-gray-100 dark:border-white/5 group-hover:bg-gray-50/70 dark:group-hover:bg-white/[0.02]">
                      <div className={`text-[13px] font-black tabular-nums ${low ? 'text-amber-700 dark:text-amber-300' : TITLE}`}>{fmtHours(r.total)}<span className={`text-[11px] font-semibold ${MUTED}`}> / {fmtHours(r.expected)}</span></div>
                      <div className="mt-1 ml-auto h-1 w-[90px] rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden"><div className={`h-full rounded-full ${pct >= 1 ? 'bg-emerald-500' : low ? 'bg-amber-400' : 'bg-[#0808f8] dark:bg-[#8b8bff]'}`} style={{ width: `${pct * 100}%` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <div className={`px-5 py-8 text-center text-[13px] ${MUTED}`}>No clock-ins this week yet.</div>}
      <div className={`px-5 mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] ${META}`}>
        {[['bg-amber-100 dark:bg-amber-400/30', `Under ${fmtHours(expectedDay)}`], ['bg-rose-100 dark:bg-rose-400/30', 'No clock-in on a work day'], ['bg-violet-100 dark:bg-violet-400/30', 'Time off / holiday'], ['bg-emerald-100 dark:bg-emerald-400/30', 'Clocked in now']].map(([c, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded ${c}`} />{t}</span>
        ))}
        <span>“no out” = forgot to clock out (counted until 19:00, at most 10h)</span>
      </div>
    </Card>
  );
}

// ── requests ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function RequestCard({ r, onAnswered }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  async function answer(kind) {
    setBusy(kind);
    setErr(null);
    try {
      await (kind === 'approve' ? hrApi.approve(r.id, note.trim() || undefined) : hrApi.deny(r.id, note.trim() || undefined));
      setDone(kind);
      setTimeout(() => onAnswered?.(), 1400);
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  }
  const soon = r.start && daysBetween(ilToday(), r.start) <= 3;
  return (
    <li className={`rounded-2xl border p-3.5 transition-all ${done ? 'opacity-60 border-gray-100 dark:border-white/5' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02]'}`}>
      <div className="flex items-start gap-3">
        <Avatar name={r.name} photo={r.photo_url} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`text-[13.5px] font-bold ${TITLE}`}>{r.name}</span>
            <span className="text-[11px] font-semibold rounded-md px-1.5 py-0.5 bg-[#0808f8]/[0.07] text-[#0808f8] dark:bg-[#8b8bff]/10 dark:text-[#b4b4ff]">{r.type?.name || 'Time off'}</span>
            {soon && <span className="text-[11px] font-semibold rounded-md px-1.5 py-0.5 bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">soon</span>}
          </div>
          <div className={`text-[12.5px] mt-0.5 ${META}`}><b className={TITLE}>{fmtRange(r.start, r.end)}</b> · {amountWords(r.amount, r.unit)}{r.created ? <span className={MUTED}> · asked {ago(r.created)}</span> : null}</div>
          {r.note && <div className={`mt-1.5 text-[12.5px] italic ${META}`}>“{r.note}”</div>}
        </div>
      </div>
      {done ? (
        <div className={`mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold ${done === 'approve' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          {done === 'approve' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{done === 'approve' ? 'Approved' : 'Not approved'}{r.cp_user_id ? ' — they’ll see it in CP' : ''}
        </div>
      ) : (
        <>
          {noteOpen && <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="A note for them (optional)" className={`${INPUT} mt-3 resize-none`} />}
          {err && <div className="mt-2"><Notice tone="rose">{err}</Notice></div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={!!busy} onClick={() => answer('approve')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-60">{busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}Approve</button>
            <button type="button" disabled={!!busy} onClick={() => answer('deny')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-400/30 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-400/10 px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-60">{busy === 'deny' ? <Loader2 size={13} className="animate-spin" /> : <X size={14} />}Deny</button>
            {!noteOpen && <button type="button" onClick={() => setNoteOpen(true)} className={`inline-flex items-center gap-1 text-[12px] font-semibold ${META} hover:text-[#030b2e] dark:hover:text-gray-100 px-1.5`}><MessageSquare size={13} />Add a note</button>}
          </div>
        </>
      )}
    </li>
  );
}

function Requests({ data, onAnswered, wide = false }) {
  const list = data.requests || [];
  return (
    <Card title="Waiting for you" icon={Inbox} sub={list.length ? `${list.length} time-off ${list.length === 1 ? 'request' : 'requests'}` : null}>
      {data.errors?.requests ? <Notice>{data.errors.requests}</Notice>
        : list.length ? <ul className={`grid grid-cols-1 gap-2.5 ${wide && list.length > 1 ? 'lg:grid-cols-2' : ''}`}>{list.map(r => <RequestCard key={r.id} r={r} onAnswered={onAnswered} />)}</ul>
          : (
            <div className="py-6 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center mb-2"><Sparkles size={17} className="text-emerald-600 dark:text-emerald-300" /></div>
              <div className={`text-[13px] font-semibold ${TITLE}`}>All answered</div>
              <div className={`text-[12px] ${MUTED}`}>New time-off requests you can approve show up here.</div>
            </div>
          )}
    </Card>
  );
}

// ── who's out (30 days) ───────────────────────────────────────────────────────────────────────────────────────────────
function WhosOut({ data }) {
  const today = data.today;
  const N = 31;
  const dates = Array.from({ length: N }, (_, i) => addDays(today, i));
  const holidays = data.whos_out?.holidays || [];
  const rows = useMemo(() => {
    const m = new Map();
    for (const p of data.whos_out?.people || []) {
      const k = p.employee_id || p.name;
      if (!m.has(k)) m.set(k, { key: k, name: p.name, photo_url: p.photo_url, spans: [] });
      m.get(k).spans.push(p);
    }
    return [...m.values()].sort((a, b) => a.spans[0].start.localeCompare(b.spans[0].start));
  }, [data.whos_out]);
  const idx = (d) => Math.max(0, Math.min(N - 1, daysBetween(today, d)));
  const holidayOn = (d) => holidays.find(h => h.start <= d && h.end >= d);
  const cols = { gridTemplateColumns: `repeat(${N}, minmax(22px, 1fr))` };
  return (
    <Card title="Who’s out" icon={TreePalm} sub="next 30 days">
      {data.errors?.whos_out && <div className="mb-3"><Notice>{data.errors.whos_out}</Notice></div>}
      {holidays.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {holidays.map(h => <span key={`${h.name}${h.start}`} className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 dark:bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300 px-2.5 py-1 text-[11.5px] font-semibold"><PartyPopper size={12} />{h.name} · {fmtRange(h.start, h.end)}</span>)}
        </div>
      )}
      {!rows.length ? <div className={`py-6 text-center text-[13px] ${MUTED}`}>Nobody has time off booked in the next 30 days.</div> : (
        <>
          {/* phones: a list */}
          <ul className="sm:hidden flex flex-col gap-2">
            {rows.flatMap(r => r.spans.map(s => (
              <li key={`${r.key}${s.start}`} className="flex items-center gap-3">
                <Avatar name={r.name} photo={r.photo_url} size={30} />
                <div className="min-w-0"><div className={`text-[13px] font-semibold truncate ${TITLE}`}>{r.name}</div><div className={`text-[11.5px] ${MUTED}`}>{fmtRange(s.start, s.end)}</div></div>
              </li>
            )))}
          </ul>
          {/* wider: a timeline */}
          <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
            <div className="min-w-[820px]">
              <div className="flex">
                <div className="w-[160px] flex-none" />
                <div className="flex-1 grid" style={cols}>
                  {dates.map(d => {
                    const hol = holidayOn(d);
                    const first = d.endsWith('-01') || d === today;
                    return (
                      <div key={d} title={hol ? hol.name : fmtDay(d)} className={`text-center pb-1.5 ${d === today ? 'text-[#0808f8] dark:text-[#8b8bff] font-bold' : hol ? 'text-fuchsia-600 dark:text-fuchsia-300 font-semibold' : !isWorkday(d) ? MUTED : META}`}>
                        <div className="text-[9.5px] leading-none h-3">{first ? fmtDay(d, { month: 'short' }) : ''}</div>
                        <div className="text-[9.5px] leading-none mt-0.5">{DAY[dowOf(d)][0]}</div>
                        <div className="text-[11px] tabular-nums leading-tight">{Number(d.slice(8))}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {rows.map(r => (
                <div key={r.key} className="flex items-center border-t border-gray-100 dark:border-white/5">
                  <div className="w-[160px] flex-none flex items-center gap-2 py-1.5 pr-2 min-w-0">
                    <Avatar name={r.name} photo={r.photo_url} size={24} />
                    <span className={`text-[12px] font-semibold truncate ${TITLE}`}>{r.name}</span>
                  </div>
                  <div className="flex-1 grid h-9 items-center" style={cols}>
                    {dates.map((d, i) => (
                      <div key={d} style={{ gridColumn: i + 1, gridRow: 1 }} className={`h-full ${holidayOn(d) ? 'bg-fuchsia-50 dark:bg-fuchsia-400/[0.07]' : !isWorkday(d) ? 'bg-gray-50 dark:bg-white/[0.025]' : ''} ${d === today ? 'border-x border-[#0808f8]/20 dark:border-[#8b8bff]/25' : ''}`} />
                    ))}
                    {r.spans.map(s => (
                      <div key={s.start} style={{ gridColumn: `${idx(s.start) + 1} / ${idx(s.end) + 2}`, gridRow: 1 }} title={`${r.name} · ${fmtRange(s.start, s.end)}`}
                        className="relative z-[1] h-6 mx-0.5 rounded-lg bg-gradient-to-r from-[#0808f8] to-[#5b5bff] dark:from-[#5b5bff] dark:to-[#8b8bff] shadow-sm flex items-center px-2 overflow-hidden">
                        <span className="text-[10.5px] font-semibold text-white truncate">{fmtRange(s.start, s.end, { day: 'numeric', month: 'short' })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ── connections ───────────────────────────────────────────────────────────────────────────────────────────────────────
const inviteText = (origin) => `Hi! You can now clock in and out, ask for time off and see your hours right inside CP — no need to open BambooHR.

To set it up (about a minute):
1. Open CP → My HR: ${origin}/my-hr
2. Follow the steps there to make your own BambooHR API key
3. Paste it and click “Connect BambooHR”

Bonus: CP reminds you at 10:00 if you forgot to clock in, and at 19:00 if you’re still clocked in.`;

function Yes({ on, label, since }) {
  return on
    ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300" title={since ? `since ${fmtDay(String(since).slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}` : undefined}><CheckCircle2 size={14} />{label || 'Yes'}</span>
    : <span className={`inline-flex items-center gap-1 text-[12px] ${MUTED}`}><XCircle size={14} />Not yet</span>;
}

function Connections({ data }) {
  const [only, setOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const list = data.connections || [];
  const hrN = list.filter(c => c.hr?.connected).length;
  const monN = list.filter(c => c.monday).length;
  const shown = only ? list.filter(c => !c.hr?.connected) : list;
  const text = inviteText(typeof window !== 'undefined' ? window.location.origin : '');
  async function copy() {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* ignore */ } t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Card title="Connected to CP" icon={Plug} sub={`${hrN} of ${list.length} connected My HR · ${monN} connected Monday`} action={
      <div className="inline-flex rounded-xl bg-gray-100 dark:bg-white/5 p-0.5 text-[12px] font-semibold">
        {[['Everyone', false], ['Not connected', true]].map(([l, v]) => (
          <button key={l} type="button" onClick={() => setOnly(v)} className={`px-2.5 py-1 rounded-[10px] ${only === v ? 'bg-white dark:bg-white/10 text-[#030b2e] dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{l}</button>
        ))}
      </div>
    }>
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
        <div className="min-w-0">
          <div className="hidden md:grid grid-cols-[1.5fr_0.8fr_0.9fr_0.8fr_1.1fr] gap-3 px-2 pb-2 text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
            <span>Person</span><span>Role</span><span>My HR</span><span>Monday</span><span>In BambooHR as</span>
          </div>
          <ul className="flex flex-col">
            {shown.map(c => (
              <li key={c.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1.5fr_0.8fr_0.9fr_0.8fr_1.1fr] items-center gap-x-3 gap-y-1 px-2 py-2 border-t border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={c.name} photo={c.avatar_url} size={28} />
                  <div className="min-w-0"><div className={`text-[12.5px] font-semibold truncate ${TITLE}`}>{c.name}</div><div className={`text-[10.5px] truncate ${MUTED}`}>{c.email}</div></div>
                </div>
                <span className={`text-[12px] ${META} md:block hidden`}>{c.role}</span>
                <span className="md:block flex items-center gap-3 justify-end md:justify-start">
                  <Yes on={c.hr?.connected} label={c.hr?.error ? 'Key stopped working' : 'Connected'} since={c.hr?.connected_at} />
                  <span className="md:hidden"><Yes on={c.monday} label="Monday" /></span>
                </span>
                <span className="hidden md:block"><Yes on={c.monday} label="Connected" /></span>
                <span className={`hidden md:block text-[12px] truncate ${c.bamboo ? META : MUTED}`}>{c.bamboo?.name || (data.connected ? 'No match' : '—')}</span>
              </li>
            ))}
            {!shown.length && <li className={`py-6 text-center text-[13px] ${MUTED}`}>Everyone’s connected 🎉</li>}
          </ul>
        </div>
        <div className="min-w-0 rounded-2xl bg-[#0808f8]/[0.035] dark:bg-[#8b8bff]/[0.07] border border-[#0808f8]/10 dark:border-[#8b8bff]/15 p-4 self-start">
          <div className={`text-[13px] font-bold ${TITLE}`}>Send this to the team</div>
          <p className={`text-[12px] mt-0.5 mb-3 ${META}`}>A ready message — paste it in Slack or WhatsApp.</p>
          <pre className={`whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 max-h-[220px] overflow-auto ${META}`}>{text}</pre>
          <button type="button" onClick={copy} className={`mt-3 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-[#0808f8] hover:bg-[#0606d0] text-white'}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy message'}</button>
        </div>
      </div>
    </Card>
  );
}

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function HRPanel() {
  const navigate = useNavigate();
  const [week, setWeek] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (w = week, { quiet = false } = {}) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try { setData(await hrApi.team(w || undefined)); setError(null); } catch (e) { setError(e.message || 'Couldn’t load the HR panel'); } finally { setLoading(false); setRefreshing(false); }
  }, [week]);
  useEffect(() => { load(week, { quiet: !!data }); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(week, { quiet: true }); }, 2 * 60000);
    return () => clearInterval(t);
  }, [load, week]);

  const pending = data?.requests?.length || 0;
  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-0 pb-16">
      <header className="flex items-start gap-3 mb-6 mt-2 sm:mt-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#0808f8] dark:text-[#8b8bff]"><Users size={13} />HR</div>
          <h1 className={`mt-1 text-[26px] sm:text-[30px] font-black tracking-tight leading-tight ${TITLE}`}>Team HR</h1>
          <p className={`mt-1 text-[13.5px] ${META}`}>Who’s in, hours and time off — everyone, live from BambooHR.{pending ? <> <b className="text-amber-700 dark:text-amber-300">{pending} waiting for you.</b></> : null}</p>
        </div>
        <button type="button" onClick={() => load(week, { quiet: true })} aria-label="Refresh" className="flex-none p-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-[#030b2e] dark:hover:text-gray-100">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </header>

      {loading && !data ? (
        <div className="flex flex-col gap-5">{[180, 320, 240].map(h => <div key={h} className="rounded-3xl bg-gray-100 dark:bg-white/5 animate-pulse" style={{ height: h }} />)}</div>
      ) : error && !data ? (
        <Card>
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto text-amber-500" size={22} />
            <div className={`mt-2 text-[14px] font-semibold ${TITLE}`}>Couldn’t load the HR panel</div>
            <div className={`text-[12.5px] ${META}`}>{error}</div>
            <button type="button" onClick={() => load(week)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0808f8] text-white px-3.5 py-2 text-[13px] font-bold"><RefreshCw size={14} />Try again</button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {error && <Notice tone="rose">{error}</Notice>}
          {!data.connected ? (
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0808f8]/[0.07] dark:bg-[#8b8bff]/10 flex items-center justify-center flex-none"><Plug size={22} className="text-[#0808f8] dark:text-[#8b8bff]" /></div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] font-bold ${TITLE}`}>Connect the company BambooHR first</div>
                  <p className={`text-[13px] mt-0.5 ${META}`}>{data.reason || 'The HR panel reads everyone’s clock and time off through the company’s BambooHR connection.'} Paste it once in Studio → Connections, then come back.</p>
                </div>
                <button type="button" onClick={() => navigate('/studio?tab=connections')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0808f8] hover:bg-[#0606d0] text-white px-4 py-2 text-[13px] font-bold flex-none">Open Studio → Connections<ChevronRight size={15} /></button>
              </div>
            </Card>
          ) : data.error ? (
            <Notice tone="rose">BambooHR: {data.error}</Notice>
          ) : (
            <>
              {pending > 0 && <Requests wide data={data} onAnswered={() => load(week, { quiet: true })} />}
              <TodayBoard board={data.board} today={data.today} />
              <WeekGrid data={data} onWeek={(w) => setWeek(w && w !== data.this_week ? w : null)} />
              <div className={`grid grid-cols-1 ${pending ? '' : 'xl:grid-cols-[1fr_1.8fr]'} gap-5`}>
                {!pending && <Requests data={data} onAnswered={() => load(week, { quiet: true })} />}
                <WhosOut data={data} />
              </div>
            </>
          )}
          <Connections data={data} />
          <p className={`text-[11px] text-center ${MUTED}`}><Timer size={11} className="inline -mt-0.5 mr-1" />Hours come from BambooHR time tracking · {fmtHours(data.expected_day_hours || EXPECTED_DAY_HOURS)} is a full day, Sun–Thu · updated {fmtTime(data.generated_at)}</p>
        </div>
      )}
    </div>
  );
}
