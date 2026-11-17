// The frame every Growth-team page shares (17 Nov 2026): a title, their Monday status, and a view-only studio context —
// a task opens read-only, nothing moves. Each page is its own entry in the left panel.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plug } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { meApi } from '../../lib/meService';
import { StudioCtx, useMondayWrites } from '../studio/writes';
import TaskPanel from '../studio/TaskPanel';

let mondayCache = null;   // { data, at } — one look per few minutes across the Growth pages
export function useMondayStatus() {
  const [st, setSt] = useState(() => mondayCache?.data || null);
  useEffect(() => {
    if (mondayCache && Date.now() - mondayCache.at < 180000) return;
    meApi.monday().then((d) => { mondayCache = { data: d, at: Date.now() }; setSt(d); }).catch(() => null);
  }, []);
  return st;
}

export function MondayChip() {
  const nav = useNavigate();
  const st = useMondayStatus();
  if (!st) return null;
  return st.connected
    ? <button type="button" onClick={() => nav('/welcome')} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"><Check size={13} /> Monday: {String(st.name || 'connected').split(' ')[0]}</button>
    : <button type="button" onClick={() => nav('/welcome')} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"><Plug size={13} /> <span className="sm:hidden">Connect Monday</span><span className="hidden sm:inline">Connect your Monday</span></button>;
}

export default function GrowthShell({ eyebrow, title, sub, children, wide = true }) {
  const { isGrowth, isAdmin } = useAuth();
  const writes = useMondayWrites({ readOnly: true });
  const [panel, setPanel] = useState(null);
  const openTask = useCallback((it, data) => setPanel({ it, data }), []);
  const ctx = useMemo(() => ({ writes, openTask, readOnly: true }), [writes, openTask]);
  return (
    <StudioCtx.Provider value={ctx}>
      <div className={`${wide ? 'max-w-[2400px]' : 'max-w-[1400px]'} mx-auto pb-16`}>
        {title && (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 mb-4">
            <div className="min-w-0 flex-1 basis-[220px]">
              {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0808f8]">{eyebrow}{isAdmin && !isGrowth ? ' · as the growth team sees it' : ''}</div>}
              <h1 className="font-black uppercase leading-none text-[34px] sm:text-[48px] mt-1 break-words" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>{title}</h1>
              {sub && <p className="text-sm text-gray-500 mt-1.5 max-w-[720px]">{sub}</p>}
            </div>
            <MondayChip />
          </div>
        )}
        {children}
      </div>
      {panel && <TaskPanel it={panel.it} data={panel.data} onClose={() => setPanel(null)} />}
      {writes.toastEl}
    </StudioCtx.Provider>
  );
}
