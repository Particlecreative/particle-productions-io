// The frame every Creative-team page shares (25 Nov 2026 — video editors & designers get their own CP): a title, their
// Monday status, and a studio context where a task opens with THEIR rights — move its status, write updates and replies,
// like — always as them on Monday; the schedule, people and deadline are the studio's (read-only facts).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useLive, useAgo } from '../../lib/useLive';
import { useAuth } from '../../context/AuthContext';
import { MondayChip } from '../studio/mondayMe';
import { StudioCtx, useMondayWrites } from '../studio/writes';
import TaskPanel from '../studio/TaskPanel';
import { studioApi } from '../../lib/studioService';

export const CREATIVE_CAN = { status: true, schedule: false, archive: false, comment: true, simple: true };

/** Their tasks (GET /api/studio/my-tasks), shared by Home and My Studio; refreshed after a change lands on Monday. */
const MyTasksCtx = createContext(null);
export const useMyTasks = () => useContext(MyTasksCtx);

/** What changed since the last look: a task that's new for you, or one someone else moved. → { [id]: { kind, at, name, status } } */
export function diffTasks(prev, next, now = Date.now()) {
  if (!prev?.items || !next?.items) return {};
  const before = new Map(prev.items.map(it => [String(it.id), it]));
  const out = {};
  for (const it of next.items) {
    const was = before.get(String(it.id));
    if (!was) out[it.id] = { kind: 'new', at: now, name: it.name, status: it.status?.label || '' };
    else if ((was.status?.label || '') !== (it.status?.label || '')) out[it.id] = { kind: 'moved', at: now, name: it.name, status: it.status?.label || '', from: was.status?.label || '' };
  }
  return out;
}

export function MyTasksProvider({ children }) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [fresh, setFresh] = useState({});   // highlighted for 2 minutes
  const last = useRef(null);
  const mine = useRef(new Set());           // status moves this person made in CP aren't "news"
  const load = useCallback(async (force = false) => {
    try {
      const d = await studioApi.myTasks(force);
      const changes = diffTasks(last.current, d);
      for (const id of Object.keys(changes)) if (changes[id].kind === 'moved' && mine.current.has(String(id))) { delete changes[id]; mine.current.delete(String(id)); }
      last.current = d;
      setState({ data: d, error: null, loading: false });
      if (Object.keys(changes).length) setFresh(f => ({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => Date.now() - v.at < 120000)), ...changes }));
    } catch (e) { setState(s => ({ ...s, error: e.message, loading: false })); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // live: every 30 s while the tab is open (Tomer, 25 Nov 2026) — new tickets and moves show without a reload
  const updatedAt = useLive(() => load(), { every: 30000 });
  const markMine = useCallback((id) => mine.current.add(String(id)), []);
  const dismiss = useCallback((id) => setFresh(f => { const n = { ...f }; delete n[id]; return n; }), []);
  // TaskPanel's data shape: boards (statuses), people, requesters
  const panelData = useMemo(() => (state.data ? {
    ...state.data, requesters: state.data.people, generated_at: state.data.generated_at, today: state.data.today,
  } : null), [state.data]);
  const value = useMemo(() => ({ ...state, panelData, reload: load, fresh, dismiss, markMine, updatedAt: updatedAt || (state.data ? Date.now() : null) }),
    [state, panelData, load, fresh, dismiss, markMine, updatedAt]);
  return <MyTasksCtx.Provider value={value}>{children}</MyTasksCtx.Provider>;
}

export default function CreativeShell({ eyebrow, title, sub, actions, children, wide = true }) {
  const { isCreative, isAdmin } = useAuth();
  const base = useMondayWrites({ readOnly: false });
  const tasks = useMyTasks();
  const markMine = tasks?.markMine;
  // a status this person moves in CP isn't "news" when the live refresh brings it back
  const writes = useMemo(() => ({ ...base, save: (it, patch, data) => { if (patch?.status && markMine) markMine(it.id); return base.save(it, patch, data); } }), [base, markMine]);
  const [panel, setPanel] = useState(null);
  const openTask = useCallback((it, data, opts = {}) => setPanel({ it, data: data || tasks?.panelData, focus: opts.focus || null }), [tasks?.panelData]);   // focus 'link': the paste box ready
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
            <LiveDot />
            <MondayChip />
          </div>
        )}
        <News onOpen={(it) => openTask(it)} />
        {children}
      </div>
      {panel && <TaskPanel it={panel.it} data={panel.data} focus={panel.focus} onClose={() => setPanel(null)} />}
      {writes.toastEl}
    </StudioCtx.Provider>
  );
}

/** "● Live · updated 12s ago" — the page refreshes itself every 30 s. */
function LiveDot() {
  const t = useMyTasks();
  const ago = useAgo(t?.updatedAt);
  if (!t) return null;
  return (
    <span title="This page updates itself every 30 seconds" className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 px-2 py-1 rounded-lg">
      <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" /><span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" /></span>
      Live{ago ? ` · ${ago}` : ''}
    </span>
  );
}

/** New for you since you opened the page: a task you were put on, or one someone else moved. */
function News({ onOpen }) {
  const t = useMyTasks();
  if (!t?.fresh) return null;
  const list = Object.entries(t.fresh).filter(([, v]) => Date.now() - v.at < 120000).slice(0, 3);
  if (!list.length) return null;
  const byId = new Map((t.data?.items || []).map(it => [String(it.id), it]));
  return (
    <div className="mb-4 flex flex-col gap-2">
      {list.map(([id, v]) => {
        const it = byId.get(String(id));
        return (
          <div key={id} className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-[#0808f8]/25 bg-[#0808f8]/5 text-sm animate-[fadeIn_.3s_ease]">
            <Sparkles size={15} className="text-[#0808f8] flex-none" />
            <span className="min-w-0 flex-1 truncate">
              <b className="text-[#030b2e]">{v.kind === 'new' ? 'New for you' : 'Moved'}</b>
              <span className="text-gray-600"> · {v.name}{v.kind === 'moved' ? ` → ${v.status}` : v.status ? ` · ${v.status}` : ''}</span>
            </span>
            {it && <button type="button" onClick={() => { onOpen(it); t.dismiss(id); }} className="text-[12px] font-semibold text-[#0808f8] hover:underline flex-none">Open</button>}
            <button type="button" onClick={() => t.dismiss(id)} className="p-1 rounded-md text-gray-400 hover:text-gray-700 flex-none" aria-label="Dismiss"><X size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}

/** A small "New" / "Moved" badge on a task that changed while the page was open (2 minutes). */
export function FreshBadge({ id }) {
  const t = useMyTasks();
  const f = t?.fresh?.[id];
  if (!f || Date.now() - f.at > 120000) return null;
  return <span className="inline-flex items-center text-[9.5px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500 text-white flex-none">{f.kind === 'new' ? 'New' : 'Moved'}</span>;
}
