// My month (Tomer, 25 Nov 2026): the person's own numbers — delivered, worked per task, review rounds, on time, ads live
// on Meta. Months back with ◀ ▶. The time figures come from Time tracking (Working while clocked in).
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { timetrackApi, fmtDur } from '../../lib/timetrackService';

const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const shift = (m, n) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const label = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Stat({ value, label: l, hint, tone }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-3 py-2.5 min-w-0" title={hint}>
      <div className={`text-[22px] font-black leading-none truncate ${tone || 'text-[#030b2e]'}`}>{value}</div>
      <div className="text-[11.5px] font-semibold text-gray-500 mt-1 truncate">{l}</div>
    </div>
  );
}

export default function MyMonth({ ads = [] }) {
  const [month, setMonth] = useState(thisMonth);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    setD(null); setErr(null);
    timetrackApi.me(month).then(r => { if (alive) setD(r); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [month]);
  const now = thisMonth();
  // ads of theirs that started (or still ran) this month — from On Air (AfterLife)
  // ran on Meta in that month: first spend on or before the month's end, last spend on or after its start (On Air keeps ~2 weeks)
  const live = ads.filter(c => { const a = String(c.first_spend || '').slice(0, 7), b = String(c.last_spend || c.first_spend || '').slice(0, 7); return a && a <= month && (b >= month || (c.live && month === now)); }).length;
  const k = d?.kpis;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMonth(m => shift(m, -1))} className="p-1 rounded-lg text-gray-400 hover:text-[#030b2e] hover:bg-gray-100" aria-label="Month before"><ChevronLeft size={15} /></button>
        <span className="text-[12.5px] font-bold text-[#030b2e] min-w-[120px] text-center">{label(month)}</span>
        <button type="button" disabled={month >= now} onClick={() => setMonth(m => shift(m, 1))} className="p-1 rounded-lg text-gray-400 hover:text-[#030b2e] hover:bg-gray-100 disabled:opacity-30" aria-label="Month after"><ChevronRight size={15} /></button>
      </div>
      {err ? <div className="text-[12.5px] text-gray-400 py-4 text-center">Couldn’t load your month ({err}).</div>
        : !d ? <div className="py-6 text-center text-gray-400"><Loader2 size={16} className="animate-spin inline" /> <span className="text-[12px]">Counting your month…</span></div>
          : d.connected === false ? <div className="text-[12.5px] text-gray-400 py-4 text-center">Connect your Monday to see your month.</div>
            : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Stat value={k?.delivered ?? 0} label="Delivered" hint="Tasks approved this month" />
                  <Stat value={k?.median_worked_ms != null ? fmtDur(k.median_worked_ms) : '–'} label="Worked per task" hint="Median time in Working while you were clocked in" />
                  <Stat value={k?.avg_review_rounds != null ? k.avg_review_rounds : '–'} label="Review rounds" hint="Average times a task went to review" tone={k?.avg_review_rounds > 2 ? 'text-amber-600' : undefined} />
                  <Stat value={k?.on_time_pct != null ? `${k.on_time_pct}%` : '–'} label="On time" hint="Delivered by the deadline" tone={k?.on_time_pct != null && k.on_time_pct < 70 ? 'text-red-600' : 'text-emerald-600'} />
                </div>
                <div className="flex items-center gap-2 text-[12px] text-gray-500 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#030b2e]"><span className="w-2 h-2 rounded-full bg-emerald-500" />{live} ad{live === 1 ? '' : 's'} live on Meta</span>
                  {k?.busy_ms ? <span>· {fmtDur(k.busy_ms)} on tasks{k.clocked_ms ? ` of ${fmtDur(k.clocked_ms)} clocked` : ''}</span> : null}
                  {k?.estimated ? <span className="text-gray-400">· some time estimated</span> : null}
                </div>
              </>
            )}
    </div>
  );
}
