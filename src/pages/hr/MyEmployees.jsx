// My employees (Tomer, 25 Nov 2026): the month so far — hours vs. expected with % (who did more, who less), vacation left,
// days off (vacation / sick), approvals; and each person's days read for you, with the tickets they worked on.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, X, Ticket, Clock, TreePalm, Thermometer, Download, Search } from 'lucide-react';
import { hrApi, fmtHours, initials, colorFor, addDays, ilToday } from '../../lib/hrService';
import { Requests } from './HRPanel';

const TITLE = 'text-[#030b2e] dark:text-gray-100';
const MUTED = 'text-gray-400 dark:text-gray-500';
const thisMonth = () => ilToday().slice(0, 7);
const shift = (m, n) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const monthName = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const tone = (pct) => (pct == null ? 'bg-gray-300' : pct >= 100 ? 'bg-emerald-500' : pct >= 90 ? 'bg-lime-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-500');
const toneText = (pct) => (pct == null ? MUTED : pct >= 100 ? 'text-emerald-600' : pct >= 90 ? 'text-lime-700' : pct >= 80 ? 'text-amber-600' : 'text-red-600');
const KIND = { vacation: ['Vacation', 'bg-teal-500', TreePalm], sick: ['Sick', 'bg-rose-500', Thermometer], other: ['Out', 'bg-gray-400', Clock], holiday: ['Holiday', 'bg-violet-400', Clock] };

function Avatar({ name, photo, size = 32 }) {
  return photo ? <img src={photo} alt="" className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
    : <span className="rounded-full flex items-center justify-center text-white font-bold flex-none" style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.36 }}>{initials(name)}</span>;
}

function Card({ title, sub, action, children, className = '' }) {
  return (
    <section className={`rounded-3xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 p-5 ${className}`}>
      {(title || action) && <header className="flex items-center gap-2 mb-3"><div className="min-w-0 flex-1"><h2 className={`text-[15px] font-bold ${TITLE}`}>{title}</h2>{sub && <div className={`text-[12px] ${MUTED}`}>{sub}</div>}</div>{action}</header>}
      {children}
    </section>
  );
}

/** A month of small squares: hours per day (darker = more), days off in their colour. */
function DayStrip({ days, month, expected = 9 }) {
  const list = Object.entries(days || {}).filter(([d]) => d.startsWith(month)).sort();
  return (
    <div className="flex gap-[3px] flex-wrap">
      {list.map(([d, v]) => {
        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
        const k = typeof v === 'string' ? KIND[v] : null;
        const bg = k ? k[1] : dow > 4 ? 'bg-gray-100 dark:bg-white/5' : !v ? 'bg-red-100 dark:bg-red-500/20' : '';
        const op = typeof v === 'number' && v > 0 ? Math.min(1, 0.25 + v / (expected * 1.2)) : 1;
        return <span key={d} title={`${d}: ${k ? k[0] : v ? fmtHours(v) : dow > 4 ? 'weekend' : 'no clock-in'}`} className={`w-[11px] h-[11px] rounded-[3px] ${bg}`} style={typeof v === 'number' && v > 0 ? { background: '#0808f8', opacity: op } : undefined} />;
      })}
    </div>
  );
}

function PersonDrawer({ id, onClose }) {
  const today = ilToday();
  const RANGES = [['2w', 'Last 2 weeks', addDays(today, -13), today], ['month', 'This month', `${today.slice(0, 7)}-01`, today], ['last', 'Last month', `${shift(today.slice(0, 7), -1)}-01`, addDays(`${today.slice(0, 7)}-01`, -1)]];
  const [range, setRange] = useState('2w');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    const r = RANGES.find(x => x[0] === range);
    setD(null); setErr(null);
    hrApi.teamPerson(id, r[2], r[3]).then(x => { if (alive) setD(x); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [id, range]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-[#030b2e]/40" onClick={onClose}>
      <div className="w-full max-w-[720px] h-full overflow-y-auto bg-white dark:bg-[#161b22] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-[1] bg-white/95 dark:bg-[#161b22]/95 backdrop-blur px-6 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-3">
          {d?.employee ? <Avatar name={d.employee.name} photo={d.employee.photo_url} size={40} /> : <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5" />}
          <div className="min-w-0 flex-1"><div className={`text-[17px] font-bold truncate ${TITLE}`}>{d?.employee?.name || '…'}</div><div className={`text-[12px] ${MUTED}`}>{d?.employee?.job_title || 'Working hours, read for you'}</div></div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex gap-1">
            {RANGES.map(([k, l]) => <button key={k} type="button" onClick={() => setRange(k)} className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg ${range === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}>{l}</button>)}
          </div>
          {err && <div className="text-[13px] text-red-600 flex items-center gap-2"><AlertTriangle size={15} />{err}</div>}
          {!d && !err && <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin inline" /> <span className="text-[13px]">Reading the clock and the board…</span></div>}
          {d && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[['Clocked', fmtHours(d.totals.hours)], ['Expected', fmtHours(d.totals.expected)], ['%', d.totals.pct != null ? `${d.totals.pct}%` : '—'], ['On tasks', fmtHours(d.totals.on_tasks_hours)]].map(([l, v], i) => (
                  <div key={l} className="rounded-2xl bg-gray-50 dark:bg-white/5 px-3 py-2.5"><div className={`text-[20px] font-black ${i === 2 ? toneText(d.totals.pct) : TITLE}`}>{v}</div><div className={`text-[11.5px] font-semibold ${MUTED}`}>{l}</div></div>
                ))}
              </div>
              {d.balances?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {d.balances.filter(b => !b.unlimited).map(b => <span key={b.name} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-white/5 text-gray-700 dark:text-gray-200"><span className={`w-2 h-2 rounded-full ${KIND[b.kind]?.[1] || 'bg-gray-400'}`} />{b.name}: <b className={TITLE}>{b.balance ?? '—'} {b.units}</b> left · {b.used_ytd} used this year</span>)}
                </div>
              )}
              {d.tickets?.length > 0 && (
                <div>
                  <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${MUTED}`}>Tickets in this time · hours in Working while clocked in</div>
                  <div className="flex flex-col gap-1">
                    {d.tickets.map(t => {
                      const max = d.tickets[0].hours || 1;
                      return (
                        <a key={t.id} href={t.url || undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                          <Ticket size={13} className={t.board === 'design' ? 'text-violet-500' : 'text-[#0808f8]'} />
                          <span className={`truncate flex-1 min-w-0 ${TITLE}`}>{t.name}</span>
                          <span className="w-24 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden flex-none"><span className="block h-full bg-[#0808f8] rounded-full" style={{ width: `${(t.hours / max) * 100}%` }} /></span>
                          <span className="tabular-nums font-semibold w-14 text-right flex-none text-gray-700 dark:text-gray-200">{fmtHours(t.hours)}</span>
                          <span className={`text-[11px] w-12 text-right flex-none ${MUTED}`}>{t.days}d</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              {d.tickets_error && <div className="text-[12px] text-amber-600">Tickets couldn’t be read ({d.tickets_error}) — hours only.</div>}
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${MUTED}`}>Day by day</div>
                <div className="flex flex-col gap-2">
                  {d.days.filter(x => x.workday || x.hours).map(x => (
                    <div key={x.date} className="rounded-2xl border border-gray-200 dark:border-white/10 p-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-bold ${TITLE}`}>{new Date(`${x.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                        {x.off && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full text-white ${KIND[x.off_kind]?.[1] || 'bg-gray-400'}`}>{x.off}</span>}
                        {x.holiday && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{x.holiday}</span>}
                        <span className={`ml-auto tabular-nums text-[13px] font-black ${x.hours >= d.expected_day_hours - 0.25 ? 'text-emerald-600' : x.hours ? 'text-amber-600' : MUTED}`}>{x.hours ? fmtHours(x.hours) : '—'}</span>
                      </div>
                      <p className="text-[12.5px] text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{x.summary}</p>
                      {x.tasks?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{x.tasks.slice(0, 5).map(t => <span key={t.id} className="text-[11px] px-2 py-0.5 rounded-md bg-[#0808f8]/8 text-[#0808f8] dark:text-[#a9b1ff] max-w-[260px] truncate">{t.name} · {fmtHours(t.ms / 3600000)}</span>)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyEmployees() {
  const [month, setMonth] = useState(thisMonth);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [team, setTeam] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('pct');
  const load = useCallback(async () => {
    setD(null); setErr(null);
    try { setD(await hrApi.teamMonth(month)); } catch (e) { setErr(e.message); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  const loadTeam = useCallback(() => hrApi.team().then(setTeam).catch(() => setTeam(null)), []);
  useEffect(() => { loadTeam(); }, [loadTeam]);
  // who's out (typed) for the approval cards' "also out then"
  const [outList, setOutList] = useState([]);
  useEffect(() => { hrApi.out(ilToday(), addDays(ilToday(), 120)).then(r => setOutList(r.people || [])).catch(() => setOutList([])); }, []);
  const people = useMemo(() => {
    const list = (d?.people || []).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
    const by = { pct: (a, b) => (b.pct ?? -1) - (a.pct ?? -1), hours: (a, b) => b.hours_to_date - a.hours_to_date, name: (a, b) => a.name.localeCompare(b.name), off: (a, b) => b.off_days - a.off_days, vacation: (a, b) => (vac(b) ?? -1) - (vac(a) ?? -1) }[sort];
    return [...list].sort(by);
  }, [d, q, sort]);
  const now = thisMonth();
  const csv = () => {
    const rows = [['Name', 'Job', 'Hours to date', 'Expected to date', '%', 'Month target', 'Left to target', 'Days worked', 'Short days', 'Missing days', 'No clock-out', 'Days off', 'Avg start', 'Vacation left']];
    for (const p of d.people) rows.push([p.name, p.job_title || '', p.hours_to_date, p.expected_to_date, p.pct ?? '', p.expected_month, p.remaining_to_target, p.days_worked, p.days_short, p.days_missing, p.days_no_out, p.off_days, p.avg_start || '', vac(p) ?? '']);
    const blob = new Blob([rows.map(r => r.map(x => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `team-hours-${month}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const max = Math.max(1, ...people.map(p => Math.max(p.expected_to_date, p.hours_to_date)));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5">
          <button type="button" onClick={() => setMonth(m => shift(m, -1))} className="p-2 text-gray-500 hover:text-[#030b2e]"><ChevronLeft size={16} /></button>
          <span className={`px-2 text-[13px] font-bold min-w-[130px] text-center ${TITLE}`}>{monthName(month)}</span>
          <button type="button" disabled={month >= now} onClick={() => setMonth(m => shift(m, 1))} className="p-2 text-gray-500 hover:text-[#030b2e] disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" className="text-[13px] pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 w-44 focus:outline-none" /></label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="text-[13px] px-3 py-2 rounded-xl border border-gray-200 bg-white">
          <option value="pct">Sort: % of expected</option><option value="hours">Sort: hours</option><option value="off">Sort: days off</option><option value="vacation">Sort: vacation left</option><option value="name">Sort: name</option>
        </select>
        {d?.people?.length > 0 && <button type="button" onClick={csv} className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-gray-900"><Download size={14} /> CSV for the month</button>}
      </div>

      {err && <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {err}</div>}
      {!d && !err && <div className="py-20 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>}
      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[['Team, so far', d.team.pct != null ? `${d.team.pct}%` : '—', 'of the hours expected', toneText(d.team.pct)], ['Hours clocked', fmtHours(d.team.hours_to_date), `of ${fmtHours(d.team.expected_to_date)} expected`], ['Days off', d.team.off_days, 'vacation, sick and other (workdays)'], ['Missing days', d.team.missing, 'workdays with no clock-in', d.team.missing ? 'text-red-600' : ''], ['No clock-out', d.team.no_out, 'days someone forgot', d.team.no_out ? 'text-amber-600' : '']].map(([l, v, s, c]) => (
              <div key={l} className="rounded-3xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/10 px-4 py-3">
                <div className={`text-[11px] font-bold uppercase tracking-wider ${MUTED}`}>{l}</div>
                <div className={`text-[26px] font-black leading-tight ${c || TITLE}`}>{v}</div>
                <div className={`text-[11.5px] ${MUTED}`}>{s}</div>
              </div>
            ))}
          </div>

          <Card title="Who did more, who did less" sub={`Hours on finished days against what’s expected (workdays that aren’t off × ${d.expected_day_hours}h). Click someone for their days and tickets.`}>
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-white/5">
              {people.map(p => (
                <button key={p.id} type="button" onClick={() => setOpen(p.id)} className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 py-3 text-left hover:bg-gray-50/70 dark:hover:bg-white/[0.02] -mx-2 px-2 rounded-xl">
                  <span className="flex items-center gap-2.5 lg:w-56 min-w-0 flex-none">
                    <Avatar name={p.name} photo={p.photo_url} />
                    <span className="min-w-0"><span className={`block text-[13.5px] font-bold truncate ${TITLE}`}>{p.name}</span><span className={`block text-[11.5px] truncate ${MUTED}`}>{p.job_title || '—'}{p.avg_start ? ` · starts ~${p.avg_start}` : ''}</span></span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="relative block h-3 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                      <span className={`absolute inset-y-0 left-0 rounded-full ${tone(p.pct)}`} style={{ width: `${(p.hours_to_date / max) * 100}%` }} />
                      <span className="absolute inset-y-0 w-0.5 bg-[#030b2e]/60 dark:bg-white/60" style={{ left: `${(p.expected_to_date / max) * 100}%` }} title="Expected so far" />
                    </span>
                    <span className="mt-1.5 flex items-center gap-2"><DayStrip days={p.days} month={month} expected={d.expected_day_hours} /></span>
                  </span>
                  <span className="flex items-center gap-4 flex-none text-[12px]">
                    <span className="text-right w-20"><span className={`block text-[17px] font-black tabular-nums ${toneText(p.pct)}`}>{p.pct != null ? `${p.pct}%` : '—'}</span><span className={MUTED}>{fmtHours(p.hours_to_date)} / {fmtHours(p.expected_to_date)}</span></span>
                    <span className="w-24"><span className={`block font-semibold ${TITLE}`}>{fmtHours(p.remaining_to_target)}</span><span className={MUTED}>to month target</span></span>
                    <span className="w-24"><span className={`block font-semibold ${TITLE}`}>{vac(p) != null ? `${vac(p)} ${vacUnits(p)}` : '—'}</span><span className={MUTED}>vacation left</span></span>
                    <span className="w-28 flex flex-wrap gap-1">
                      {p.off.map((o, i) => { const k = KIND[o.kind] || KIND.other; return <span key={i} title={`${o.type}: ${o.start} – ${o.end}`} className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md text-white ${k[1]}`}>{k[0]}</span>; })}
                      {p.days_missing > 0 && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-red-50 text-red-700">{p.days_missing} missing</span>}
                      {p.days_no_out > 0 && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700">{p.days_no_out} no out</span>}
                    </span>
                  </span>
                </button>
              ))}
              {!people.length && <div className={`py-10 text-center text-[13px] ${MUTED}`}>Nobody clocked in this month yet.</div>}
            </div>
          </Card>
        </>
      )}

      {team?.requests && <Requests data={team} onAnswered={() => { loadTeam(); load(); }} wide balances={Object.fromEntries((d?.people || []).map(p => [String(p.id), p.balances]))} out={outList} />}
      {open && <PersonDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function vac(p) { const b = (p.balances || []).find(x => x.kind === 'vacation' && !x.unlimited); return b?.balance ?? null; }
function vacUnits(p) { return (p.balances || []).find(x => x.kind === 'vacation')?.units || 'days'; }
