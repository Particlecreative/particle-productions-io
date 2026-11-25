// "Now working on" (Tomer, 25 Nov 2026): the creative's task in Working, with a running timer, in the header.
// The timer counts from when the task went into Working — or from today's clock-in when that's later (My HR connected),
// and stops counting while they're clocked out. Click → the task opens in My Studio.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { hrApi, HR_CLOCK_EVENT } from '../../lib/hrService';
import { useLive } from '../../lib/useLive';

const pad = (n) => String(n).padStart(2, '0');
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export default function NowWorking({ className = '' }) {
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [hr, setHr] = useState(null);
  const [, tick] = useState(0);
  const load = useCallback(async () => {
    try { setList((await studioApi.nowWorking()).working || []); } catch { setList([]); }
    try { setHr(await hrApi.clock()); } catch { setHr(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(load, { every: 120000 });
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const h = () => load(); window.addEventListener(HR_CLOCK_EVENT || 'cp-hr-clock', h); return () => window.removeEventListener(HR_CLOCK_EVENT || 'cp-hr-clock', h); }, [load]);
  if (!list?.length) return null;
  const top = list[0];
  const clockedOut = hr?.connected && !hr.open;
  const clockIn = hr?.connected && hr.open && hr.since ? Date.parse(hr.since) : null;
  const from = Math.max(top.since_ms || 0, clockIn || 0) || null;
  const label = top.title || String(top.name || '').split('|').pop().trim();
  return (
    <button type="button" onClick={() => nav(`/my-studio?task=${top.id}`)}
      title={`Working on: ${top.name}${list.length > 1 ? ` (+${list.length - 1} more in Working)` : ''}${clockedOut ? ' — you’re clocked out' : ''}`}
      className={`items-center gap-2 max-w-[300px] rounded-full pl-1 pr-3 py-1 text-[12px] font-semibold border transition-colors ${clockedOut ? 'border-gray-200 text-gray-500' : 'border-[#0808f8]/25 bg-[#0808f8]/5 text-[#030b2e] hover:bg-[#0808f8]/10'} ${className}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-none ${clockedOut ? 'bg-gray-200 text-gray-500' : 'bg-[#0808f8] text-white'}`}>
        {clockedOut ? <Pause size={11} /> : <Play size={11} className="ml-0.5" />}
      </span>
      <span className="truncate min-w-0">{label}</span>
      {from && !clockedOut && <span className="tabular-nums text-[#0808f8] flex-none">{clock(Date.now() - from)}</span>}
      {list.length > 1 && <span className="text-gray-400 flex-none">+{list.length - 1}</span>}
    </button>
  );
}
