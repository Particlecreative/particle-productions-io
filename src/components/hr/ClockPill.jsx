// The clock in the header (25 Nov 2026): "● In · 3h 12m" (green) while clocked in, an outline "Clock in" when not.
// One click clocks in / out — no confirm; it changes at once and goes back if BambooHR says no. Not connected → nothing
// (or a small "Connect HR" link with showConnect). Refreshes every 60 s and follows My HR's own clock buttons.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Timer } from 'lucide-react';
import { hrApi, fmtHours, fmtTime, HR_CLOCK_EVENT, announceClock } from '../../lib/hrService';

export default function ClockPill({ showConnect = false, className = '' }) {
  const [st, setSt] = useState(null);       // { connected, open, since, today_closed_hours }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [, tick] = useState(0);
  const errTimer = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(() => hrApi.clock().then(setSt).catch(() => null), []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    const m = setInterval(() => tick(n => n + 1), 30000); // the minutes move on their own
    const h = (e) => { if (e.detail?.source !== 'pill') load(); };
    window.addEventListener(HR_CLOCK_EVENT, h);
    return () => { clearInterval(t); clearInterval(m); window.removeEventListener(HR_CLOCK_EVENT, h); clearTimeout(errTimer.current); };
  }, [load]);

  if (!st) return null;
  if (!st.connected) {
    return showConnect ? (
      <Link to="/my-hr" className={`inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:text-[#0808f8] dark:hover:text-[#8b8bff] ${className}`}><Timer size={13} />Connect HR</Link>
    ) : null;
  }
  if (st.error && st.open == null) {
    return <Link to="/my-hr" title={st.error} className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300 dark:border-amber-400/30 px-2.5 py-1 text-[12px] font-semibold text-amber-700 dark:text-amber-300 ${className}`}><Timer size={13} />HR</Link>;
  }

  const running = st.open && st.since && !st.open_from_earlier ? (Date.now() - Date.parse(st.since)) / 3600000 : 0;
  const today = (st.today_closed_hours || 0) + running;

  async function toggle() {
    if (busy) return;
    if (st.open_from_earlier) { navigate('/my-hr'); return; } // they need to say when they finished — My HR asks
    const before = st;
    const wasOpen = !!st.open;
    setErr(null);
    setBusy(true);
    setSt(wasOpen ? { ...st, open: false, since: null, today_closed_hours: today } : { ...st, open: true, since: new Date().toISOString() });
    try {
      const r = wasOpen ? await hrApi.clockOut() : await hrApi.clockIn();
      if (r?.clock?.connected) setSt(r.clock);
      announceClock({ ...(r?.clock || {}), source: 'pill' });
    } catch (e) {
      setSt(before);
      setErr(e.message);
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErr(null), 6000);
      if (e.status === 409 || e.status === 404) load();
    } finally { setBusy(false); }
  }

  const title = err || (st.open
    ? (st.open_from_earlier ? 'You’re still clocked in from an earlier day — open My HR to fix it' : `Clocked in since ${fmtTime(st.since)} · today ${fmtHours(today)} · click to clock out`)
    : `Not clocked in${today ? ` · today ${fmtHours(today)}` : ''} · click to clock in`);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button type="button" onClick={toggle} title={title} aria-label={title}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap transition-colors ${err
          ? 'border border-rose-300 text-rose-700 bg-rose-50 dark:border-rose-400/30 dark:text-rose-300 dark:bg-rose-400/10'
          : st.open
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/25 dark:hover:bg-emerald-400/15'
            : 'border border-gray-300 text-gray-600 hover:border-[#0808f8] hover:text-[#0808f8] dark:border-white/15 dark:text-gray-300 dark:hover:border-[#8b8bff] dark:hover:text-[#8b8bff]'}`}>
        {busy ? <Loader2 size={12} className="animate-spin" />
          : st.open ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            : <LogIn size={12} />}
        {st.open ? <>In<span className="opacity-60">·</span><span className="tabular-nums">{st.open_from_earlier ? 'since earlier' : fmtHours(running, { zero: '0m' })}</span></> : 'Clock in'}
      </button>
      {err && (
        <span role="alert" className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl bg-white dark:bg-[#161b22] border border-rose-200 dark:border-rose-400/25 shadow-lg px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300">{err}</span>
      )}
    </span>
  );
}
