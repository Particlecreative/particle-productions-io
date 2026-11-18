// Your own Monday connection (lib/mondayUser.js on the server): what the Studio, Growth pages and the task panel show.
// Connected → what you do from CP (scheduling, assigning, comments, tickets, briefs) lands on Monday as you.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plug } from 'lucide-react';
import { meApi } from '../../lib/meService';

let mondayCache = null;   // { data, at } — one look per few minutes across pages
export function useMondayStatus() {
  const [st, setSt] = useState(() => mondayCache?.data || null);
  useEffect(() => {
    if (mondayCache && Date.now() - mondayCache.at < 180000) return;
    meApi.monday().then((d) => { mondayCache = { data: d, at: Date.now() }; setSt(d); }).catch(() => null);
  }, []);
  return st;
}

export function MondayChip({ title }) {
  const nav = useNavigate();
  const st = useMondayStatus();
  if (!st) return null;
  return st.connected
    ? <button type="button" onClick={() => nav('/welcome')} title={title || 'What you do here lands on Monday as you'} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"><Check size={13} /> Monday: {String(st.name || 'connected').split(' ')[0]}</button>
    : <button type="button" onClick={() => nav('/welcome')} title={title || 'Connect your Monday so what you do here shows as you on Monday'} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"><Plug size={13} /> <span className="sm:hidden">Connect Monday</span><span className="hidden sm:inline">Connect your Monday</span></button>;
}
