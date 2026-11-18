// The frame every Growth-team page shares (17 Nov 2026): a title, their Monday status, and a view-only studio context —
// a task opens read-only, nothing moves. Each page is its own entry in the left panel.
import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMondayStatus, MondayChip } from '../studio/mondayMe';
import { StudioCtx, useMondayWrites } from '../studio/writes';
import TaskPanel from '../studio/TaskPanel';

export { useMondayStatus, MondayChip };

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
