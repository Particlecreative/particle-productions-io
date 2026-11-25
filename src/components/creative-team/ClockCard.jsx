// Home → My clock (Tomer, 25 Nov 2026: "quick clock in / clock out / X hours monthly"): one button, today's time,
// and the month so far against what's expected — with how much is left to the month's target.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, LogOut, Loader2, Timer, AlertTriangle } from 'lucide-react';
import { hrApi, announceClock, HR_CLOCK_EVENT, fmtHours } from '../../lib/hrService';

const pad = (n) => String(n).padStart(2, '0');
const since = (iso) => { const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };

export default function ClockCard() {
  const [clock, setClock] = useState(null);
  const [month, setMonth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [, tick] = useState(0);
  const load = useCallback(async () => {
    try { setClock(await hrApi.clock()); } catch (e) { setClock({ connected: false, error: e.message }); }
    try { setMonth(await hrApi.myMonth()); } catch { setMonth(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const h = (e) => { if (e.detail?.source !== 'home') load(); }; window.addEventListener(HR_CLOCK_EVENT, h); return () => window.removeEventListener(HR_CLOCK_EVENT, h); }, [load]);
  const toggle = async () => {
    setBusy(true); setErr(null);
    try {
      const r = clock?.open ? await hrApi.clockOut() : await hrApi.clockIn();
      const next = r?.clock || (await hrApi.clock());
      setClock(next); announceClock({ ...next, source: 'home' });
      hrApi.myMonth().then(setMonth).catch(() => null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!clock) return <div className="py-6 text-center text-gray-400"><Loader2 size={16} className="animate-spin inline" /></div>;
  if (!clock.connected) {
    return (
      <div className="flex flex-col items-start gap-2">
        <div className="text-[13px] text-gray-600">Clock in and out from here, and see your hours for the month.</div>
        <Link to="/my-hr" className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-xl text-white bg-[#0808f8] hover:bg-[#0606d0]"><Timer size={14} /> Connect BambooHR</Link>
      </div>
    );
  }
  const forgot = clock.open && clock.open_from_earlier;
  const pct = month?.pct;
  const left = month ? Math.max(0, (month.expected_month || 0) - (month.hours_to_date || 0) - (month.today_hours || 0)) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${clock.open ? 'text-emerald-600' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full ${clock.open ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />{clock.open ? 'Clocked in' : 'Not clocked in'}
          </div>
          <div className="text-[28px] font-black leading-none text-[#030b2e] tabular-nums mt-1">{clock.open && clock.since && !forgot ? since(clock.since) : fmtHours(clock.today_hours || 0)}</div>
          <div className="text-[11.5px] text-gray-400 mt-0.5">{clock.open && !forgot ? 'on the clock now' : 'today'}</div>
        </div>
        {forgot ? (
          <Link to="/my-hr" className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle size={14} /> Fix yesterday</Link>
        ) : (
          <button type="button" disabled={busy || clock.error} onClick={toggle} className={`inline-flex items-center gap-2 text-[14px] font-bold px-4 py-3 rounded-2xl text-white transition-colors disabled:opacity-60 ${clock.open ? 'bg-[#030b2e] hover:bg-[#1a2450]' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : clock.open ? <LogOut size={16} /> : <LogIn size={16} />}{clock.open ? 'Clock out' : 'Clock in'}
          </button>
        )}
      </div>
      {month?.connected && month.expected_to_date > 0 && (
        <div className="rounded-2xl bg-gray-50 px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-bold text-[#030b2e]">{fmtHours(month.hours_to_date + (month.today_hours || 0))}</span>
            <span className="text-[12px] text-gray-500">this month · {fmtHours(month.expected_to_date)} expected so far</span>
            <span className={`ml-auto text-[13px] font-black ${pct >= 100 ? 'text-emerald-600' : pct >= 90 ? 'text-lime-700' : pct >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{pct != null ? `${pct}%` : ''}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-200 overflow-hidden"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 90 ? 'bg-lime-500' : pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, ((month.hours_to_date + (month.today_hours || 0)) / Math.max(1, month.expected_month)) * 100)}%` }} /></div>
          <div className="text-[11.5px] text-gray-500 mt-1">{left != null ? `${fmtHours(left)} to the month’s ${fmtHours(month.expected_month)}` : ''}{month.days_missing ? ` · ${month.days_missing} day${month.days_missing === 1 ? '' : 's'} with no clock-in` : ''}</div>
        </div>
      )}
      {(err || clock.error) && <div className="text-[12px] text-red-600">{err || clock.error}</div>}
    </div>
  );
}
