// The frame every Creative-team page shares (25 Nov 2026 — video editors & designers get their own CP): a title, their
// Monday status, and a studio context where a task opens with THEIR rights — move its status, write updates and replies,
// like — always as them on Monday; the schedule, people and deadline are the studio's (read-only facts).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MondayChip } from '../studio/mondayMe';
import { StudioCtx, useMondayWrites } from '../studio/writes';
import TaskPanel from '../studio/TaskPanel';
import { studioApi } from '../../lib/studioService';

export const CREATIVE_CAN = { status: true, schedule: false, archive: false, comment: true, simple: true };

/** Their tasks (GET /api/studio/my-tasks), shared by Home and My Studio; refreshed after a change lands on Monday. */
const MyTasksCtx = createContext(null);
export const useMyTasks = () => useContext(MyTasksCtx);

export function MyTasksProvider({ children }) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async (force = false) => {
    try {
      const d = await studioApi.myTasks(force);
      setState({ data: d, error: null, loading: false });
    } catch (e) { setState(s => ({ ...s, error: e.message, loading: false })); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => load(), 3 * 60 * 1000); return () => clearInterval(t); }, [load]);
  // TaskPanel's data shape: boards (statuses), people, requesters
  const panelData = useMemo(() => (state.data ? {
    ...state.data, requesters: state.data.people, generated_at: state.data.generated_at, today: state.data.today,
  } : null), [state.data]);
  const value = useMemo(() => ({ ...state, panelData, reload: load }), [state, panelData, load]);
  return <MyTasksCtx.Provider value={value}>{children}</MyTasksCtx.Provider>;
}

export default function CreativeShell({ eyebrow, title, sub, actions, children, wide = true }) {
  const { isCreative, isAdmin } = useAuth();
  const writes = useMondayWrites({ readOnly: false });
  const [panel, setPanel] = useState(null);
  const openTask = useCallback((it, data, opts = {}) => setPanel({ it, data, focus: opts.focus || null }), []);   // focus 'link': the paste box ready
  const ctx = useMemo(() => ({ writes, openTask, readOnly: false, can: CREATIVE_CAN }), [writes, openTask]);
  return (
    <StudioCtx.Provider value={ctx}>
      <div className={`${wide ? 'max-w-[2400px]' : 'max-w-[1400px]'} mx-auto pb-16`}>
        {title && (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 mb-5">
            <div className="min-w-0 flex-1 basis-[220px]">
              {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0808f8]">{eyebrow}{isAdmin && !isCreative ? ' · as the creative team sees it' : ''}</div>}
              <h1 className="font-black uppercase leading-none text-[34px] sm:text-[48px] mt-1 break-words" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>{title}</h1>
              {sub && <p className="text-sm text-gray-500 mt-1.5 max-w-[720px]">{sub}</p>}
            </div>
            {actions}
            <MondayChip />
          </div>
        )}
        {children}
      </div>
      {panel && <TaskPanel it={panel.it} data={panel.data} focus={panel.focus} onClose={() => setPanel(null)} />}
      {writes.toastEl}
    </StudioCtx.Provider>
  );
}
