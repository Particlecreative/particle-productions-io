// My HR (Tomer, 25 Nov 2026): every CP user connects their own BambooHR and does it all here — clock in / out with a live
// timer, today's and this week's hours, time off (balances, ask, cancel a pending one), who's out, their own details.
// Not connected: a friendly how-to (with a drawing of BambooHR's menu) and a paste box. The key never comes back here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import MyEmployees from './MyEmployees';
import {
  Clock, LogIn, LogOut, TreePalm, Users, MoreHorizontal, RefreshCw, ExternalLink, Unplug, KeyRound, Lock, ShieldCheck,
  Check, Loader2, AlertTriangle, PartyPopper, Briefcase, Building2, MapPin, Mail, Phone, Gift, Plus, Eye, EyeOff, Bell, StickyNote,
  MousePointer2, UserRound, Send, Timer, ChevronDown, Sparkles, ArrowRight, ArrowLeft, X,
} from 'lucide-react';
import {
  hrApi, EXPECTED_DAY_HOURS, ilToday, addDays, dowOf, daysBetween, fmtHours, fmtTimer, fmtTime, fmtDay, fmtRange, initials, colorFor,
  firstName, isWorkday, HR_CLOCK_EVENT, announceClock,
} from '../../lib/hrService';

// ── little building blocks ────────────────────────────────────────────────────────────────────────────────────────────
const TITLE = 'text-[#030b2e] dark:text-gray-100';
const META = 'text-gray-500 dark:text-gray-400';
const MUTED = 'text-gray-400 dark:text-gray-500';
const INPUT = 'w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[13px] text-[#030b2e] dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0808f8]/30 focus:border-[#0808f8]/50 [color-scheme:light] dark:[color-scheme:dark]';

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Card({ title, icon: Icon, action, children, className = '', pad = 'p-5' }) {
  return (
    <section className={`rounded-3xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 shadow-[0_1px_3px_rgba(3,11,46,.05)] ${pad} min-w-0 ${className}`}>
      {title && (
        <header className="flex items-center gap-2 mb-4">
          {Icon && <Icon size={15} className="text-[#0808f8] dark:text-[#8b8bff]" />}
          <h2 className={`font-bold text-[14.5px] ${TITLE}`}>{title}</h2>
          {action && <span className="ml-auto flex items-center gap-1">{action}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

function Avatar({ name, photo, size = 32, ring = false }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} style={style} className={`rounded-full object-cover flex-none ${ring ? 'ring-2 ring-white dark:ring-[#0d1117]' : ''}`} />;
  return <span style={{ ...style, background: colorFor(name) }} className={`rounded-full flex-none inline-flex items-center justify-center font-bold text-white ${ring ? 'ring-2 ring-white dark:ring-[#0d1117]' : ''}`}>{initials(name)}</span>;
}

const STATUS = {
  requested: { label: 'Waiting', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' },
  denied: { label: 'Not approved', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' },
  canceled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400' },
  superceded: { label: 'Replaced', cls: 'bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400' },
};
const Pill = ({ status }) => { const s = STATUS[status] || STATUS.requested; return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md flex-none ${s.cls}`}>{s.label}</span>; };
const amountWords = (n, unit) => { const v = Number(n) || 0; if (unit === 'hours') return fmtHours(v); return `${v % 1 ? v.toFixed(1) : v} ${v === 1 ? 'day' : 'days'}`; };
const hello = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' })); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function Notice({ tone = 'amber', icon: Icon = AlertTriangle, children }) {
  const cls = {
    amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:border-amber-400/20',
    rose: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-400/10 dark:text-rose-200 dark:border-rose-400/20',
    blue: 'bg-[#0808f8]/[0.05] text-[#030b2e] border-[#0808f8]/15 dark:bg-[#8b8bff]/10 dark:text-gray-100 dark:border-[#8b8bff]/20',
    green: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:border-emerald-400/20',
  }[tone];
  return <div className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-[12.5px] leading-snug ${cls}`}><Icon size={14} className="flex-none mt-0.5" /><div className="min-w-0">{children}</div></div>;
}

// ── the clock ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function WeekBars({ days, expected, today }) {
  const shown = (days || []).filter(d => d.workday || d.hours > 0);
  const top = Math.max(expected * 1.2, ...shown.map(d => d.hours || 0), 1);
  const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <div className="relative flex items-end gap-2 sm:gap-3 h-[100px]">
      {/* bars are 64px tall and sit 16px above the bottom (12px day letter + 4px gap) */}
      <div className="absolute inset-x-0 border-t border-dashed border-white/30 pointer-events-none" style={{ bottom: `${16 + (expected / top) * 64}px` }} title={`${fmtHours(expected)} — a full day`} />
      {shown.map(d => {
        const h = d.hours || 0;
        const pct = Math.min(1, h / top);
        const isToday = d.date === today;
        return (
          <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center gap-1" title={`${fmtDay(d.date)} · ${d.off ? d.off.name : fmtHours(h)}${d.no_out ? ' · no clock-out recorded' : ''}`}>
            <span className={`h-3 text-[10.5px] tabular-nums leading-3 ${h ? 'text-white/80' : 'text-white/30'}`}>{d.off && !h ? (d.off.type === 'holiday' ? '🎉' : 'Off') : h >= 0.05 ? (Math.round(h * 10) / 10) : d.open ? 'now' : d.future ? '' : '–'}</span>
            <div className="w-full max-w-[34px] h-[64px] rounded-lg bg-white/[0.07] flex items-end overflow-hidden">
              <div className={`w-full rounded-lg transition-[height] duration-700 ${d.off && !h ? 'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,.18)_0_4px,transparent_4px_8px)] h-full' : isToday ? (d.open ? 'bg-emerald-400' : 'bg-[#fff]') : h >= expected - 0.25 ? 'bg-white/70' : 'bg-amber-300/80'}`}
                style={d.off && !h ? undefined : { height: `${Math.max(h ? 6 : 0, pct * 100)}%` }} />
            </div>
            <span className={`h-3 text-[10.5px] font-semibold leading-3 ${isToday ? 'text-white' : 'text-white/45'}`}>{LETTER[d.dow]}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClockCard({ clock, today, onChanged }) {
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [endAt, setEndAt] = useState('18:00');
  const [local, setLocal] = useState(null); // what we just did, until the fresh numbers arrive
  useEffect(() => { setLocal(null); }, [clock]);
  const c = { ...clock, ...(local || {}) };
  const expectedDay = c.expected_day_hours || EXPECTED_DAY_HOURS;

  if (!clock?.enabled) {
    return (
      <section className="rounded-3xl p-6 text-white relative overflow-clip" style={{ background: 'linear-gradient(135deg,#030b2e 0%,#0b1660 60%,#1a1aa8 120%)' }}>
        <div className="flex items-center gap-2 text-white/70 text-[12px] font-semibold uppercase tracking-wider"><Clock size={14} />Clock</div>
        <p className="mt-3 text-[15px] font-semibold">Clocking in from CP isn’t available for you yet</p>
        <p className="mt-1 text-[13px] text-white/70 max-w-[520px]">{clock?.error || 'BambooHR didn’t share your time tracking.'}</p>
      </section>
    );
  }

  const running = c.open && c.since ? Math.max(0, (now - Date.parse(c.since)) / 1000) : 0;
  const live = c.open && !c.open_from_earlier;
  const todayH = (c.today_closed_hours || 0) + (live ? running / 3600 : 0);
  const weekH = (c.week_closed_hours || 0) + (live ? running / 3600 : 0);
  const expWeek = c.expected_week_hours || 0;
  const pct = expWeek ? Math.min(1, weekH / expWeek) : 0;
  const days = (c.days || []).map(d => (d.date === today && live ? { ...d, hours: todayH, open: true } : d));

  async function act(kind) {
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'in') {
        const r = await hrApi.clockIn(note.trim() || undefined);
        setLocal({ open: true, since: r?.clock?.since || new Date().toISOString(), open_from_earlier: false });
        setNote(''); setNoteOpen(false);
        announceClock({ ...(r?.clock || {}), open: true, source: 'my-hr' });
      } else {
        const r = await hrApi.clockOut(kind === 'late' ? { date: c.open_date, end: endAt } : {});
        setLocal({ open: false, since: null, open_from_earlier: false, today_closed_hours: kind === 'late' ? c.today_closed_hours : todayH });
        announceClock({ ...(r?.clock || {}), open: false, source: 'my-hr' });
      }
      onChanged?.();
    } catch (e) {
      setErr(e.message);
      if (e.status === 409 || e.status === 404) onChanged?.();
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-3xl text-white relative overflow-clip shadow-[0_10px_40px_-12px_rgba(8,8,248,.45)] dark:shadow-[0_10px_40px_-12px_rgba(8,8,248,.25)]"
      style={{ background: 'linear-gradient(135deg,#030b2e 0%,#0a1458 55%,#1c1cc9 125%)' }}>
      {/* soft lights — in their own clipped layer, so the card never becomes scrollable */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-40 transition-colors duration-700" style={{ background: live ? '#10b981' : '#0808f8' }} />
        <div className="absolute -bottom-32 -left-10 w-72 h-72 rounded-full blur-3xl opacity-25 bg-[#5b5bff]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:18px_18px]" />
      </div>

      <div className="relative p-5 sm:p-7">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${c.open ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/75'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.open ? 'bg-emerald-400 animate-pulse' : 'bg-white/50'}`} />
            {c.open ? (c.open_from_earlier ? `Still clocked in since ${fmtDay(c.open_date, { weekday: 'short' })}` : 'Clocked in') : 'Not clocked in'}
          </span>
          <span className="ml-auto text-[12px] text-white/60">{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-end gap-5">
          <div className="min-w-0 flex-1">
            {live ? (
              <>
                <div className="text-[13px] text-white/60">On the clock since {fmtTime(c.since)}</div>
                <div className="text-[52px] sm:text-[64px] leading-none font-black tabular-nums tracking-tight mt-1">{fmtTimer(running)}</div>
              </>
            ) : (
              <>
                <div className="text-[13px] text-white/60">{todayH > 0 ? 'Today so far' : isWorkday(today) ? 'Ready when you are' : 'It’s the weekend'}</div>
                <div className="text-[52px] sm:text-[64px] leading-none font-black tabular-nums tracking-tight mt-1">{todayH > 0 ? fmtHours(todayH) : '0h'}</div>
              </>
            )}
          </div>
          {!c.open_from_earlier && (
            <div className="flex flex-col items-stretch sm:items-end gap-2">
              <button type="button" disabled={busy} onClick={() => act(c.open ? 'out' : 'in')}
                className={`group inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-4 text-[15px] font-bold transition-all active:scale-[0.98] disabled:opacity-70 ${c.open
                  ? 'bg-white/10 hover:bg-white/15 border border-white/25 text-white'
                  : 'bg-[#fff] text-[#030b2e] hover:shadow-[0_0_0_6px_rgba(255,255,255,.12)]'}`}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : c.open ? <LogOut size={18} /> : <LogIn size={18} />}
                {c.open ? 'Clock out' : 'Clock in'}
              </button>
              {!c.open && (noteOpen
                ? <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') act('in'); if (e.key === 'Escape') setNoteOpen(false); }} maxLength={200} placeholder="A note for today (optional)" className="w-full sm:w-[230px] rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-[12.5px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30" />
                : <button type="button" onClick={() => setNoteOpen(true)} className="inline-flex items-center justify-center gap-1 text-[12px] text-white/55 hover:text-white"><StickyNote size={12} />Add a note</button>)}
            </div>
          )}
        </div>

        {c.open_from_earlier && (
          <div className="mt-5 rounded-2xl bg-amber-300/10 border border-amber-200/25 p-4">
            <p className="text-[13.5px] font-semibold text-amber-100">Looks like you forgot to clock out on {fmtDay(c.open_date, { weekday: 'long', day: 'numeric', month: 'short' })} (in at {fmtTime(c.since)}).</p>
            <p className="text-[12.5px] text-amber-100/70 mt-0.5">What time did you finish that day? Then you can clock in for today.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="time" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="rounded-xl bg-white/10 border border-white/25 px-3 py-2 text-[14px] text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-white/30" />
              <button type="button" disabled={busy || !endAt} onClick={() => act('late')} className="inline-flex items-center gap-2 rounded-xl bg-[#fff] text-[#030b2e] px-4 py-2 text-[13px] font-bold disabled:opacity-60">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}Clock out at {endAt || '…'}
              </button>
            </div>
          </div>
        )}

        {err && <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/15 border border-rose-300/25 px-3 py-2 text-[12.5px] text-rose-100"><AlertTriangle size={14} className="flex-none mt-0.5" />{err}</div>}

        <div className="mt-6 rounded-2xl bg-white/[0.06] border border-white/10 p-4 grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-5">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">Today</div>
              <div className="text-[22px] font-black tabular-nums mt-0.5">{fmtHours(todayH)}</div>
              <div className="text-[11.5px] text-white/50">of {fmtHours(expectedDay)}{(c.entries_today || []).length > 1 ? ` · ${c.entries_today.length} clock-ins` : ''}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">This week</div>
              <div className="text-[22px] font-black tabular-nums mt-0.5">{fmtHours(weekH)}<span className="text-[13px] font-semibold text-white/45"> / {fmtHours(expWeek)}</span></div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className={`h-full rounded-full ${pct >= 1 ? 'bg-emerald-400' : 'bg-[#fff]'}`} style={{ width: `${pct * 100}%` }} /></div>
            </div>
          </div>
          <WeekBars days={days} expected={expectedDay} today={today} />
        </div>
      </div>
    </section>
  );
}

// ── time off ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function RequestForm({ types, onDone, onCancel }) {
  const today = ilToday();
  const [typeId, setTypeId] = useState(types[0]?.id || '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [half, setHalf] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const type = types.find(t => t.id === typeId);
  const units = type?.units || 'days';
  const oneDay = from && to && from === to;
  const canHalf = units === 'hours' && oneDay;
  useEffect(() => { if (!canHalf) setHalf(false); }, [canHalf]);
  const preview = useMemo(() => {
    if (!from || !to || to < from) return null;
    const n = daysBetween(from, to);
    let work = 0;
    let weekend = 0;
    for (let i = 0; i <= n; i++) { if (isWorkday(addDays(from, i))) work += 1; else weekend += 1; }
    const amount = units === 'hours' ? work * EXPECTED_DAY_HOURS * (half ? 0.5 : 1) : work;
    return { work, weekend, amount };
  }, [from, to, units, half]);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (!typeId) return setErr('Pick the kind of time off');
    if (!from || !to) return setErr('Pick the dates');
    if (to < from) return setErr('The last day is before the first day');
    setBusy(true);
    try {
      const r = await hrApi.requestTimeOff({ type_id: typeId, start: from, end: to, note: note.trim() || undefined, half_day: half || undefined });
      onDone?.(r?.amount != null ? `${amountWords(r.amount, r.units || units)} of ${type?.name || 'time off'}` : (type?.name || 'time off'));
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#0808f8]/15 dark:border-[#8b8bff]/20 bg-[#0808f8]/[0.025] dark:bg-[#8b8bff]/[0.05] p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-3">
          <span className={`block text-[11.5px] font-semibold mb-1 ${META}`}>Kind of time off</span>
          <div className="flex flex-wrap gap-1.5">
            {types.map(t => (
              <button key={t.id} type="button" onClick={() => setTypeId(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold border transition-colors ${typeId === t.id
                  ? 'border-[#0808f8] bg-[#0808f8] text-white dark:border-[#8b8bff] dark:bg-[#8b8bff] dark:text-[#030b2e]'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/20'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: t.color || '#9ca3af' }} />{t.name}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className={`block text-[11.5px] font-semibold mb-1 ${META}`}>First day</span>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (!to || e.target.value > to) setTo(e.target.value); }} className={INPUT} required />
        </label>
        <label className="block">
          <span className={`block text-[11.5px] font-semibold mb-1 ${META}`}>Last day</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={INPUT} required />
        </label>
        <div className="flex items-end">
          {canHalf ? (
            <button type="button" onClick={() => setHalf(h => !h)} className={`w-full inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold ${half ? 'border-[#0808f8] text-[#0808f8] bg-[#0808f8]/[0.06] dark:border-[#8b8bff] dark:text-[#b4b4ff] dark:bg-[#8b8bff]/10' : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 bg-white dark:bg-white/5'}`}>
              <span className={`w-4 h-4 rounded-md border flex items-center justify-center ${half ? 'bg-[#0808f8] border-[#0808f8] dark:bg-[#8b8bff] dark:border-[#8b8bff]' : 'border-gray-300 dark:border-white/20'}`}>{half && <Check size={11} className="text-white dark:text-[#030b2e]" />}</span>
              Half a day
            </button>
          ) : (
            <div className={`w-full text-[12px] ${MUTED} pb-2`}>{preview ? (preview.weekend ? 'Fri & Sat aren’t counted' : '') : ''}</div>
          )}
        </div>
        <label className="block sm:col-span-3">
          <span className={`block text-[11.5px] font-semibold mb-1 ${META}`}>Note for your manager <span className={MUTED}>(optional)</span></span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Family trip" className={`${INPUT} resize-none`} />
        </label>
      </div>
      {preview && (
        <div className={`mt-3 text-[12.5px] ${META}`}>
          {preview.amount > 0
            ? <>That’s <b className={TITLE}>{amountWords(preview.amount, units)}</b>{units === 'hours' && !half ? ` (${preview.work} work ${preview.work === 1 ? 'day' : 'days'})` : ''}. BambooHR double-checks holidays and your balance.</>
            : <>Those days are already off (Friday / Saturday).</>}
        </div>
      )}
      {err && <div className="mt-3"><Notice tone="rose">{err}</Notice></div>}
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={busy || !preview?.amount} className="inline-flex items-center gap-2 rounded-xl bg-[#0808f8] hover:bg-[#0606d0] text-white px-4 py-2 text-[13px] font-bold disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send request
        </button>
        <button type="button" onClick={onCancel} className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${META} hover:bg-gray-100 dark:hover:bg-white/5`}>Cancel</button>
      </div>
    </form>
  );
}

function RequestRow({ r, color, onCancelled }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function cancel() {
    setBusy(true);
    setErr(null);
    try { await hrApi.cancelTimeOff(r.id); onCancelled?.(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  const past = r.end && r.end < ilToday();
  return (
    <li className={`py-2.5 ${past ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="w-1 self-stretch rounded-full flex-none" style={{ background: color || '#c4c4c4' }} />
        <div className="min-w-0 flex-1">
          <div className={`text-[13.5px] font-semibold truncate ${TITLE}`}>{r.type?.name || 'Time off'} <span className={`font-normal ${META}`}>· {amountWords(r.amount, r.unit)}</span></div>
          <div className={`text-[11.5px] truncate ${MUTED}`}>{fmtRange(r.start, r.end)}{r.note ? ` · “${r.note}”` : ''}</div>
          {r.manager_note && <div className={`text-[11.5px] mt-0.5 ${META}`}>Manager: “{r.manager_note}”</div>}
        </div>
        <Pill status={r.status} />
        {r.status === 'requested' && !ask && (
          <button type="button" onClick={() => setAsk(true)} className={`text-[12px] font-semibold px-2 py-1 rounded-lg ${META} hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10 dark:hover:text-rose-300`}>Cancel</button>
        )}
      </div>
      {ask && (
        <div className="mt-2 ml-4 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className={META}>Cancel this request?</span>
          <button type="button" disabled={busy} onClick={cancel} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 text-white px-2.5 py-1 font-semibold disabled:opacity-60">{busy && <Loader2 size={12} className="animate-spin" />}Yes, cancel it</button>
          <button type="button" onClick={() => setAsk(false)} className={`rounded-lg px-2.5 py-1 font-semibold ${META} hover:bg-gray-100 dark:hover:bg-white/5`}>Keep it</button>
          {err && <span className="text-rose-600 dark:text-rose-300">{err}</span>}
        </div>
      )}
    </li>
  );
}

function TimeOffCard({ timeOff, onChanged }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null);
  const [all, setAll] = useState(false);
  const types = timeOff?.types || [];
  const balances = timeOff?.balances || [];
  const requests = timeOff?.requests || [];
  const colorOf = (id) => types.find(t => t.id === String(id))?.color || null;
  const shown = all ? requests : requests.slice(0, 5);
  const errs = timeOff?.errors || {};
  return (
    <Card title="Time off" icon={TreePalm} action={!open && types.length > 0 && (
      <button type="button" onClick={() => { setOpen(true); setSent(null); }} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0808f8] hover:bg-[#0606d0] text-white px-3 py-1.5 text-[12.5px] font-bold"><Plus size={14} />Ask for time off</button>
    )}>
      {balances.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
          {balances.map(b => (
            <div key={b.type_id || b.name} className="relative rounded-2xl border border-gray-200 dark:border-white/10 bg-gradient-to-br from-white to-gray-50/80 dark:from-white/[0.04] dark:to-white/[0.01] p-3.5 overflow-hidden">
              <span className="absolute -right-6 -top-6 w-16 h-16 rounded-full opacity-[0.12]" style={{ background: b.color || '#0808f8' }} />
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: b.color || '#9ca3af' }} /><span className={`text-[12px] font-semibold truncate ${META}`}>{b.name}</span></div>
              <div className={`mt-1.5 text-[26px] leading-none font-black tabular-nums ${TITLE}`}>
                {b.unlimited ? '∞' : b.balance == null ? '–' : b.units === 'hours' ? fmtHours(b.balance) : (b.balance % 1 ? b.balance.toFixed(1) : b.balance)}
                {!b.unlimited && b.units !== 'hours' && b.balance != null && <span className={`text-[12px] font-semibold ml-1 ${MUTED}`}>{Math.abs(b.balance) === 1 ? 'day' : 'days'}</span>}
              </div>
              <div className={`mt-1 text-[11px] ${MUTED}`}>{b.unlimited ? 'No limit' : `left · used ${b.units === 'hours' ? fmtHours(b.used_ytd, { zero: '0h' }) : `${b.used_ytd || 0}`} this year`}</div>
            </div>
          ))}
        </div>
      ) : errs.balances ? <div className="mb-4"><Notice tone="amber">Balances: {errs.balances}</Notice></div> : null}

      {sent && <div className="mb-4"><Notice tone="green" icon={Check}>Sent — {sent}. Your manager gets it in BambooHR; you’ll see the answer here.</Notice></div>}
      {open && <RequestForm types={types} onCancel={() => setOpen(false)} onDone={(what) => { setOpen(false); setSent(what); onChanged?.(); }} />}
      {!types.length && errs.types && <div className="mb-4"><Notice tone="amber">{errs.types}</Notice></div>}

      <div className="flex items-center gap-2 mb-1">
        <h3 className={`text-[12px] font-bold uppercase tracking-wider ${MUTED}`}>Your requests</h3>
      </div>
      {errs.requests ? <Notice tone="amber">{errs.requests}</Notice>
        : requests.length ? (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-white/5">{shown.map(r => <RequestRow key={r.id} r={r} color={colorOf(r.type?.id)} onCancelled={onChanged} />)}</ul>
            {requests.length > 5 && <button type="button" onClick={() => setAll(a => !a)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0808f8] dark:text-[#8b8bff]">{all ? 'Show fewer' : `Show all ${requests.length}`}<ChevronDown size={13} className={all ? 'rotate-180' : ''} /></button>}
          </>
        ) : <div className={`text-[13px] py-3 ${MUTED}`}>No requests yet. When you ask for time off, it shows here with its answer.</div>}
    </Card>
  );
}

// ── who's out ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function WhosOutCard({ whosOut, today, weekStart }) {
  const [tab, setTab] = useState(0);
  const from = addDays(weekStart, tab * 7);
  const to = addDays(from, 6);
  const people = (whosOut?.people || []).filter(p => p.start <= to && p.end >= from).sort((a, b) => a.start.localeCompare(b.start));
  const holidays = (whosOut?.holidays || []).filter(h => h.start <= to && h.end >= from);
  return (
    <Card title="Who’s out" icon={Users} action={
      <div className="inline-flex rounded-xl bg-gray-100 dark:bg-white/5 p-0.5 text-[12px] font-semibold">
        {['This week', 'Next week'].map((l, i) => (
          <button key={l} type="button" onClick={() => setTab(i)} className={`px-2.5 py-1 rounded-[10px] ${tab === i ? 'bg-white dark:bg-white/10 text-[#030b2e] dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{l}</button>
        ))}
      </div>
    }>
      {whosOut?.error && !people.length ? <Notice tone="amber">{whosOut.error}</Notice> : (
        <>
          {holidays.map(h => (
            <div key={`${h.name}${h.start}`} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-fuchsia-50 to-amber-50 dark:from-fuchsia-400/10 dark:to-amber-400/10 px-3 py-2.5 mb-2">
              <span className="w-8 h-8 rounded-full bg-white dark:bg-white/10 flex items-center justify-center flex-none"><PartyPopper size={15} className="text-fuchsia-600 dark:text-fuchsia-300" /></span>
              <div className="min-w-0"><div className={`text-[13px] font-semibold truncate ${TITLE}`}>{h.name || 'Holiday'}</div><div className={`text-[11.5px] ${META}`}>{fmtRange(h.start, h.end)} · everyone’s off</div></div>
            </div>
          ))}
          {people.length ? (
            <ul className="flex flex-col gap-1">
              {people.map(p => {
                const now = p.start <= today && p.end >= today;
                return (
                  <li key={`${p.id}${p.start}`} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5">
                    <Avatar name={p.name} photo={p.photo_url} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13px] font-semibold truncate ${TITLE}`}>{p.name}{p.is_me && <span className="ml-1.5 text-[10.5px] font-bold text-[#0808f8] dark:text-[#8b8bff] bg-[#0808f8]/[0.07] dark:bg-[#8b8bff]/10 rounded px-1.5 py-0.5 align-middle">You</span>}</div>
                      <div className={`text-[11.5px] truncate ${MUTED}`}>{fmtRange(p.start, p.end)}{p.end >= today ? ` · back ${fmtDay(nextWorkday(p.end), { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</div>
                    </div>
                    {now && <span className="text-[10.5px] font-bold text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-400/10 rounded-md px-1.5 py-0.5">Out today</span>}
                  </li>
                );
              })}
            </ul>
          ) : !holidays.length && (
            <div className="py-6 text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center mb-2"><Sparkles size={17} className="text-emerald-600 dark:text-emerald-300" /></div>
              <div className={`text-[13px] font-semibold ${TITLE}`}>Everyone’s in {tab ? 'next week' : 'this week'}</div>
              <div className={`text-[12px] ${MUTED}`}>Nobody has time off booked.</div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
const nextWorkday = (ymd) => { let d = addDays(ymd, 1); while (!isWorkday(d)) d = addDays(d, 1); return d; };

// ── my details ────────────────────────────────────────────────────────────────────────────────────────────────────────
function DetailsCard({ profile, error }) {
  if (!profile) return <Card title="My details" icon={UserRound}><Notice tone="amber">{error || 'BambooHR didn’t share your details.'}</Notice></Card>;
  const a = profile.anniversary;
  const rows = [
    profile.manager && [UserRound, 'Manager', profile.manager],
    profile.hire_date && [Briefcase, 'Started', fmtDay(profile.hire_date, { day: 'numeric', month: 'long', year: 'numeric' })],
    profile.email && [Mail, 'Email', profile.email],
    profile.mobile && [Phone, 'Mobile', profile.mobile],
    profile.location && [MapPin, 'Location', profile.location],
  ].filter(Boolean);
  return (
    <Card pad="p-0" className="overflow-hidden">
      <div className="h-16 bg-gradient-to-r from-[#0808f8] via-[#3b3bff] to-[#7a5cff] dark:from-[#1a1a8a] dark:via-[#2a2ab0] dark:to-[#4b3aa8]" />
      <div className="px-5 pb-5 -mt-8">
        <Avatar name={profile.name} photo={profile.photo_url} size={64} ring />
        <div className={`mt-2 text-[17px] font-black leading-tight ${TITLE}`}>{profile.name}</div>
        {profile.job_title && <div className={`text-[13px] ${META}`}>{profile.job_title}</div>}
        {(profile.department || profile.division) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[profile.department, profile.division].filter(Boolean).map(t => <span key={t} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 px-2 py-0.5"><Building2 size={11} />{t}</span>)}
          </div>
        )}
        {a && (
          <div className={`mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5 ${a.is_today ? 'bg-gradient-to-r from-amber-100 to-pink-100 dark:from-amber-400/15 dark:to-pink-400/15' : 'bg-amber-50/70 dark:bg-amber-400/[0.07]'}`}>
            <Gift size={16} className="text-amber-600 dark:text-amber-300 flex-none" />
            <div className="min-w-0 text-[12.5px]">
              {a.is_today
                ? <span className={`font-bold ${TITLE}`}>Happy work anniversary — {a.years_at_next} {a.years_at_next === 1 ? 'year' : 'years'} today! 🎉</span>
                : <><span className={`font-semibold ${TITLE}`}>{a.years_at_next} {a.years_at_next === 1 ? 'year' : 'years'}</span><span className={META}> on {fmtDay(a.next_date, { day: 'numeric', month: 'short' })} · in {a.days_until} {a.days_until === 1 ? 'day' : 'days'}</span></>}
            </div>
          </div>
        )}
        {rows.length > 0 && (
          <dl className="mt-4 flex flex-col gap-2.5">
            {rows.map(([Icon, k, v]) => (
              <div key={k} className="flex items-center gap-3 min-w-0">
                <Icon size={14} className={`flex-none ${MUTED}`} />
                <dt className={`text-[12px] w-[68px] flex-none ${MUTED}`}>{k}</dt>
                <dd className={`text-[12.5px] font-medium truncate ${TITLE}`}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className={`mt-4 text-[11px] ${MUTED}`}>Something wrong here? It comes from BambooHR — ask HR to fix it there.</p>
      </div>
    </Card>
  );
}

// ── connect ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function BambooDrawing() {
  return (
    <div aria-hidden="true" className="relative rounded-2xl border border-gray-200 dark:border-white/10 bg-[#f6f7f2] dark:bg-[#11161d] overflow-hidden h-[260px] select-none">
      {/* window bar */}
      <div className="flex items-center gap-1.5 px-3 h-7 bg-white dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/10">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" /><span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" /><span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 h-4 flex-1 max-w-[220px] rounded-md bg-gray-100 dark:bg-white/5 text-[9.5px] text-gray-400 dark:text-gray-500 flex items-center px-2">yourcompany.bamboohr.com</span>
      </div>
      <div className="flex h-[calc(100%-28px)]">
        {/* BambooHR's left rail */}
        <div className="w-12 bg-[#3a7d1e] dark:bg-[#2f6418] flex flex-col items-center py-3 gap-3">
          <span className="w-6 h-6 rounded-lg bg-white/90" />
          {[0, 1, 2, 3].map(i => <span key={i} className="w-5 h-5 rounded-md bg-white/25" />)}
          <span className="mt-auto relative">
            <span className="block w-7 h-7 rounded-full bg-[#fde68a] ring-2 ring-white text-[9px] font-black text-[#7c4a03] flex items-center justify-center">You</span>
            <span className="absolute -inset-1.5 rounded-full border-2 border-[#0808f8] animate-ping opacity-40" />
          </span>
        </div>
        {/* page */}
        <div className="flex-1 p-4 relative">
          <div className="h-3 w-28 rounded bg-gray-300/70 dark:bg-white/10" />
          <div className="mt-3 grid grid-cols-3 gap-2">{[0, 1, 2].map(i => <div key={i} className="h-12 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200/70 dark:border-white/5" />)}</div>
          <div className="mt-2 h-16 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200/70 dark:border-white/5" />
          {/* the menu that opens from your name */}
          <div className="absolute left-2 bottom-3 w-[168px] rounded-xl bg-white dark:bg-[#1b222c] border border-gray-200 dark:border-white/10 shadow-xl p-1.5 text-[11.5px]">
            <div className="px-2 py-1.5 border-b border-gray-100 dark:border-white/5 mb-1">
              <div className="font-bold text-gray-800 dark:text-gray-100">Your Name</div>
              <div className="text-[10px] text-gray-400">Your job title</div>
            </div>
            {['My Info', 'Account Settings'].map(t => <div key={t} className="px-2 py-1 rounded-md text-gray-500 dark:text-gray-400">{t}</div>)}
            <div className="relative px-2 py-1 rounded-md bg-[#0808f8]/10 dark:bg-[#8b8bff]/15 text-[#0808f8] dark:text-[#b4b4ff] font-bold flex items-center gap-1.5 ring-1 ring-[#0808f8]/40 dark:ring-[#8b8bff]/40">
              <KeyRound size={11} />API Keys
              <MousePointer2 size={16} className="absolute -right-4 top-2 text-[#030b2e] dark:text-white fill-white dark:fill-[#030b2e] drop-shadow" />
            </div>
            <div className="px-2 py-1 rounded-md text-gray-500 dark:text-gray-400">Log Out</div>
          </div>
          {/* the key you'll get */}
          <div className="absolute right-3 top-14 w-[150px] rounded-xl bg-white dark:bg-[#1b222c] border border-gray-200 dark:border-white/10 shadow-lg p-2.5 text-[10.5px] hidden sm:block">
            <div className="font-bold text-gray-800 dark:text-gray-100 mb-1.5">Add New Key</div>
            <div className="rounded-md border border-gray-200 dark:border-white/10 px-1.5 py-1 text-gray-600 dark:text-gray-300 mb-1.5">CP</div>
            <div className="rounded-md bg-[#3a7d1e] text-white text-center font-bold py-1">Generate Key</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectScreen({ companySubdomain, reconnect = false, onConnected }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [sub, setSub] = useState('');
  const [editSub, setEditSub] = useState(!companySubdomain);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const k = key.trim();
  const looksOk = /^[A-Za-z0-9]{20,80}$/.test(k);
  const site = (editSub ? sub.trim().replace(/^https?:\/\//, '').replace(/\.bamboohr\.com.*$/, '') : companySubdomain) || null;
  const bambooUrl = site ? `https://${site}.bamboohr.com` : 'https://www.bamboohr.com/login';

  async function connect(e) {
    e.preventDefault();
    setErr(null);
    if (!looksOk) { setErr('That doesn’t look like a BambooHR API key yet — it’s one long run of letters and numbers.'); return; }
    if (editSub && !sub.trim()) { setErr('Type your company’s BambooHR name — the part before .bamboohr.com'); return; }
    setBusy(true);
    try { await hrApi.connect(k, editSub ? sub.trim() : undefined); setKey(''); onConnected?.(); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const STEPS = [
    ['Open BambooHR', <>Sign in at <a href={bambooUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0808f8] dark:text-[#8b8bff] hover:underline inline-flex items-center gap-0.5">{site ? `${site}.bamboohr.com` : 'bamboohr.com'}<ExternalLink size={11} /></a> like you always do.</>],
    ['Click your name', 'Your name and photo are in the bottom-left corner. Click them to open your menu.'],
    ['Choose “API Keys”', 'Don’t see it? Your BambooHR account isn’t allowed to make keys yet — ask HR to switch it on for you.'],
    ['Add a new key', 'Click “Add New Key”, call it “CP”, then click “Generate Key”.'],
    ['Copy it and paste it here', 'BambooHR shows the key only once — copy all of it. (If you lose it, just make a new one.)'],
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5 lg:gap-8 items-start">
      <div className="min-w-0">
        {reconnect
          ? <Notice tone="amber">BambooHR no longer accepts your key (it may have been deleted). Make a new one and paste it below — it takes a minute.</Notice>
          : (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {[[Clock, 'Clock in & out'], [TreePalm, 'Time off'], [Users, 'Who’s out'], [Bell, 'Reminders at 10:00 & 19:00']].map(([I, t]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-[#0808f8]/[0.06] dark:bg-[#8b8bff]/10 text-[#0808f8] dark:text-[#b4b4ff] px-2.5 py-1 text-[12px] font-semibold"><I size={12} />{t}</span>
              ))}
            </div>
          )}
        <ol className="relative mt-4 flex flex-col gap-4">
          <span className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-[#0808f8]/30 via-[#0808f8]/15 to-transparent dark:from-[#8b8bff]/40 dark:via-[#8b8bff]/15" />
          {STEPS.map(([t, d], i) => (
            <li key={t} className="relative flex gap-3.5">
              <span className="relative z-[1] w-8 h-8 flex-none rounded-full bg-[#0808f8] dark:bg-[#8b8bff] text-white dark:text-[#030b2e] text-[13px] font-black flex items-center justify-center shadow-[0_0_0_4px] shadow-white dark:shadow-[#0d1117]">{i + 1}</span>
              <div className="min-w-0 pt-1">
                <div className={`text-[14px] font-bold ${TITLE}`}>{t}</div>
                <div className={`text-[13px] leading-relaxed ${META}`}>{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="min-w-0 flex flex-col gap-4">
        <BambooDrawing />
        <form onSubmit={connect} className="rounded-3xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 shadow-[0_1px_3px_rgba(3,11,46,.05)] p-5">
          <label className="block">
            <span className={`flex items-center gap-1.5 text-[13px] font-bold mb-1.5 ${TITLE}`}><KeyRound size={14} className="text-[#0808f8] dark:text-[#8b8bff]" />Your BambooHR API key</span>
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false}
                placeholder="Paste the key here" className={`${INPUT} font-mono pr-20 py-2.5`} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {k && (looksOk ? <Check size={15} className="text-emerald-500" /> : <span className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-300">{k.length < 20 ? 'too short' : 'check it'}</span>)}
                <button type="button" onClick={() => setShow(s => !s)} className={`p-1 rounded-md ${MUTED} hover:text-gray-600 dark:hover:text-gray-300`} aria-label={show ? 'Hide key' : 'Show key'}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </span>
            </div>
          </label>
          <div className="mt-3">
            {editSub ? (
              <label className="block">
                <span className={`block text-[12px] font-semibold mb-1 ${META}`}>Company in BambooHR</span>
                <div className="flex items-center rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 focus-within:ring-2 focus-within:ring-[#0808f8]/30 overflow-hidden">
                  <span className={`pl-3 text-[13px] ${MUTED}`}>https://</span>
                  <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="yourcompany" className="flex-1 min-w-0 bg-transparent px-1 py-2 text-[13px] text-[#030b2e] dark:text-gray-100 focus:outline-none" />
                  <span className={`pr-3 text-[13px] ${MUTED}`}>.bamboohr.com</span>
                </div>
              </label>
            ) : (
              <div className={`text-[12px] ${MUTED}`}>Company: <b className={META}>{companySubdomain}.bamboohr.com</b> · <button type="button" onClick={() => setEditSub(true)} className="text-[#0808f8] dark:text-[#8b8bff] font-semibold hover:underline">different one?</button></div>
            )}
          </div>
          {err && <div className="mt-3"><Notice tone="rose">{err}</Notice></div>}
          <button type="submit" disabled={busy || !k} className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0808f8] hover:bg-[#0606d0] text-white px-4 py-3 text-[14px] font-bold disabled:opacity-50 transition-colors">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}{reconnect ? 'Connect again' : 'Connect BambooHR'}
          </button>
          <div className={`mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed ${MUTED}`}>
            <Lock size={13} className="flex-none mt-0.5" />
            <span>Your key is encrypted and kept on CP’s server. Nobody can see it again — not you, not admins. CP only uses it for what you click here and to check your clock for the 10:00 / 19:00 reminders. Disconnect any time (and you can delete the key in BambooHR too).</span>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── the welcome popup (Tomer, 25 Nov 2026: "on My HR, start with a popup — let's connect your BambooHR") ──────────────
function ConnectPopup({ companySubdomain, reconnect, onConnected, onLater }) {
  const [step, setStep] = useState(reconnect ? 2 : 1);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onLater(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onLater]);
  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-[#030b2e]/55 backdrop-blur-sm p-0 sm:p-6" onClick={onLater}>
      <div className={`w-full ${step === 1 ? 'sm:max-w-[520px]' : 'sm:max-w-[1040px]'} max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#161b22] shadow-2xl transition-all`} onClick={(e) => e.stopPropagation()}>
        {step === 1 ? (
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(520px 260px at 85% -10%, rgba(8,8,248,.28), transparent 60%), radial-gradient(420px 220px at 0% 110%, rgba(0,200,117,.18), transparent 60%)' }} />
            <div className="relative px-7 pt-8 pb-7">
              <div className="w-14 h-14 rounded-2xl bg-[#0808f8] text-white flex items-center justify-center shadow-[0_10px_30px_-8px_rgba(8,8,248,.7)]"><Timer size={26} /></div>
              <h2 className={`mt-5 text-[28px] font-black tracking-tight leading-tight ${TITLE}`}>Let’s connect your BambooHR</h2>
              <p className={`mt-2 text-[14px] leading-relaxed ${META}`}>One minute, once — then your day lives in CP: no more opening BambooHR to clock in or ask for a day off.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {[[Clock, 'Clock in & out', 'From any page — the pill at the top'], [TreePalm, 'Time off', 'Ask, see your balance, cancel'], [Bell, 'Reminders', '10:00 if you forgot to clock in, 19:00 to clock out'], [Users, 'Who’s out', 'This week and next, at a glance']].map(([I, t, d]) => (
                  <div key={t} className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] p-3">
                    <I size={16} className="text-[#0808f8] dark:text-[#8b8bff]" />
                    <div className={`mt-1.5 text-[13px] font-bold ${TITLE}`}>{t}</div>
                    <div className={`text-[11.5px] leading-snug ${META}`}>{d}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-2">
                <button type="button" onClick={() => setStep(2)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0808f8] hover:bg-[#0606d0] text-white px-4 py-3 text-[14.5px] font-bold">Let’s do it <ArrowRight size={16} /></button>
                <button type="button" onClick={onLater} className={`px-4 py-3 rounded-2xl text-[13.5px] font-semibold ${META} hover:bg-gray-100 dark:hover:bg-white/5`}>Later</button>
              </div>
              <div className={`mt-3 flex items-center gap-1.5 text-[11.5px] ${MUTED}`}><Lock size={12} /> Your key is encrypted — nobody can see it, not even admins.</div>
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              {!reconnect && <button type="button" onClick={() => setStep(1)} className={`p-1.5 rounded-lg ${MUTED} hover:bg-gray-100 dark:hover:bg-white/5`} aria-label="Back"><ArrowLeft size={16} /></button>}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#0808f8] dark:text-[#8b8bff]">Step 2 of 2</div>
                <div className={`text-[20px] font-black tracking-tight ${TITLE}`}>{reconnect ? 'Connect BambooHR again' : 'Make a key in BambooHR and paste it'}</div>
              </div>
              <button type="button" onClick={onLater} className={`p-2 rounded-xl ${MUTED} hover:bg-gray-100 dark:hover:bg-white/5`} aria-label="Close"><X size={16} /></button>
            </div>
            <ConnectScreen companySubdomain={companySubdomain} reconnect={reconnect} onConnected={onConnected} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── settings menu ─────────────────────────────────────────────────────────────────────────────────────────────────────
function SettingsMenu({ subdomain, onRefresh, onDisconnect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const item = 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Settings" className="p-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-[#030b2e] dark:hover:text-gray-100"><MoreHorizontal size={16} /></button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-56 z-30 rounded-2xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 shadow-xl p-1.5">
          <button type="button" onClick={() => { setOpen(false); onRefresh(); }} className={`${item} text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5`}><RefreshCw size={14} />Refresh from BambooHR</button>
          {subdomain && <a href={`https://${subdomain}.bamboohr.com`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={`${item} text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5`}><ExternalLink size={14} />Open BambooHR</a>}
          <div className="my-1 border-t border-gray-100 dark:border-white/5" />
          <button type="button" onClick={() => { setOpen(false); onDisconnect(); }} className={`${item} text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-400/10`}><Unplug size={14} />Disconnect BambooHR</button>
        </div>
      )}
    </div>
  );
}

function DisconnectDialog({ onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function go() {
    setBusy(true);
    try { await hrApi.disconnect(); announceClock({ connected: false, source: 'my-hr' }); onDone(); } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[#030b2e]/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-400/10 flex items-center justify-center mb-3"><Unplug size={18} className="text-rose-600 dark:text-rose-300" /></div>
        <h3 className={`text-[16px] font-black ${TITLE}`}>Disconnect BambooHR?</h3>
        <p className={`mt-1 text-[13px] leading-relaxed ${META}`}>CP forgets your key straight away. Clocking in, time off and reminders stop here until you connect again. You can also delete the key in BambooHR → API Keys.</p>
        {err && <div className="mt-3"><Notice tone="rose">{err}</Notice></div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={`rounded-xl px-3.5 py-2 text-[13px] font-semibold ${META} hover:bg-gray-100 dark:hover:bg-white/5`}>Keep it</button>
          <button type="button" disabled={busy} onClick={go} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 text-[13px] font-bold disabled:opacity-60">{busy && <Loader2 size={14} className="animate-spin" />}Disconnect</button>
        </div>
      </div>
    </div>
  );
}

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function Skeleton() {
  const b = 'rounded-3xl bg-gray-100 dark:bg-white/5 animate-pulse';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 flex flex-col gap-5"><div className={`${b} h-[330px]`} /><div className={`${b} h-[260px]`} /></div>
      <div className="flex flex-col gap-5"><div className={`${b} h-[300px]`} /><div className={`${b} h-[220px]`} /></div>
    </div>
  );
}

export default function MyHR() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState(() => { try { return (isAdmin && sessionStorage.getItem('cp_myhr_tab')) || 'me'; } catch { return 'me'; } });
  useEffect(() => { try { sessionStorage.setItem('cp_myhr_tab', tab); } catch { /* ignore */ } }, [tab]);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [askDisconnect, setAskDisconnect] = useState(false);
  const [popupClosed, setPopupClosed] = useState(false);

  const load = useCallback(async ({ fresh = false, quiet = false } = {}) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try { setData(await hrApi.me(fresh)); setError(null); } catch (e) { setError(e.message || 'Couldn’t load My HR'); } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // the header pill clocked in / out → show it here too; and a quiet refresh every 5 minutes
  useEffect(() => {
    const h = (e) => { if (e.detail?.source !== 'my-hr') load({ quiet: true }); };
    window.addEventListener(HR_CLOCK_EVENT, h);
    const t = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, 5 * 60000);
    return () => { window.removeEventListener(HR_CLOCK_EVENT, h); clearInterval(t); };
  }, [load]);

  const connected = data?.connected && !data?.needs_reconnect;
  const name = data?.profile?.first_name || firstName(data?.name);
  const today = data?.today || ilToday();
  const quiet = () => load({ quiet: true });

  return (
    <div className="max-w-[1280px] mx-auto px-3 sm:px-0 pb-16">
      <header className="flex items-start gap-3 mb-6 mt-2 sm:mt-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#0808f8] dark:text-[#8b8bff]"><Timer size={13} />My HR</div>
          <h1 className={`mt-1 text-[26px] sm:text-[30px] font-black tracking-tight leading-tight ${TITLE}`}>
            {connected ? `${hello()}${name ? `, ${name}` : ''}` : data?.needs_reconnect ? 'Connect BambooHR again' : 'Your BambooHR, right here in CP'}
          </h1>
          <p className={`mt-1 text-[13.5px] ${META}`}>
            {connected
              ? <>{fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })} · from your BambooHR</>
              : 'Clock in and out, ask for time off and see your hours — without opening BambooHR. Connecting takes about a minute.'}
          </p>
        </div>
        {connected && (
          <div className="flex items-center gap-2 flex-none">
            <button type="button" onClick={() => load({ fresh: true, quiet: true })} aria-label="Refresh" className="p-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-[#030b2e] dark:hover:text-gray-100">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <SettingsMenu subdomain={data?.subdomain} onRefresh={() => load({ fresh: true, quiet: true })} onDisconnect={() => setAskDisconnect(true)} />
          </div>
        )}
      </header>

      {/* Me / My employees (25 Nov 2026 — admins supervise the team from here) */}
      {isAdmin && (
        <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-white/10">
          {[['me', 'Me'], ['employees', 'My employees']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-2 text-[13.5px] font-semibold border-b-2 -mb-px ${tab === k ? 'border-[#0808f8] text-[#030b2e] dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{l}</button>
          ))}
        </div>
      )}
      {tab === 'employees' && isAdmin ? <MyEmployees />
        : loading && !data ? <Skeleton />
        : error && !data ? (
          <Card>
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto text-amber-500" size={22} />
              <div className={`mt-2 text-[14px] font-semibold ${TITLE}`}>Couldn’t load My HR</div>
              <div className={`text-[12.5px] ${META}`}>{error}</div>
              <button type="button" onClick={() => load()} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0808f8] text-white px-3.5 py-2 text-[13px] font-bold"><RefreshCw size={14} />Try again</button>
            </div>
          </Card>
        )
          : !connected ? <ConnectScreen companySubdomain={data?.company_subdomain || data?.subdomain || null} reconnect={!!data?.needs_reconnect} onConnected={() => { load(); announceClock({ source: 'my-hr-connect' }); }} />
            : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 flex flex-col gap-5 min-w-0">
                  <ClockCard clock={data.clock} today={today} onChanged={quiet} />
                  <TimeOffCard timeOff={data.time_off} onChanged={quiet} />
                </div>
                <div className="flex flex-col gap-5 min-w-0">
                  <DetailsCard profile={data.profile} error={data.profile_error} />
                  <WhosOutCard whosOut={data.whos_out} today={today} weekStart={data.week_start || addDays(today, -dowOf(today))} />
                </div>
              </div>
            )}

      {askDisconnect && <DisconnectDialog onClose={() => setAskDisconnect(false)} onDone={() => { setAskDisconnect(false); load(); }} />}
      {tab === 'me' && data && !connected && !popupClosed && !error && (
        <ConnectPopup companySubdomain={data?.company_subdomain || data?.subdomain || null} reconnect={!!data?.needs_reconnect}
          onConnected={() => { setPopupClosed(true); load(); announceClock({ source: 'my-hr-connect' }); }} onLater={() => setPopupClosed(true)} />
      )}
    </div>
  );
}
