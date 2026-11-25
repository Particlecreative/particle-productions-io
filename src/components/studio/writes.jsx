import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Undo2, X } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { addDays } from './Filters';

// When the last write reached Monday — cached data older than this is stale
let lastWrite = 0;
export const lastWriteAt = () => lastWrite;

const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
export const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const firstName = (name) => (name || '').split(' ')[0];
export const workdays = (from, to) => { const o = []; for (let d = from; d <= to; d = addDays(d, 1)) if (dow(d) <= 4) o.push(d); return o; };

/** Whole workdays (Sun–Thu) since an ISO time, up to today in Israel — "entered Working on Sunday" is 3 by Wednesday. */
export function workdaysSince(iso, today) {
  if (!iso) return 0;
  const from = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return from >= today ? 0 : workdays(addDays(from, 1), today).length;
}

export function outOn(person, day) {
  return (person?.out || []).find(o => o.start <= day && o.end >= day) || null;
}

/** Vacations layer: a task can't start or end on a day off (crossing one is fine, with a note). */
export function checkSchedule(data, peopleIds, from, to) {
  for (const uid of peopleIds) {
    const p = data?.people?.[uid];
    if (!p) continue;
    const hit = [from, to].map(day => [day, outOn(p, day)]).find(([, o]) => o);
    if (hit) return { error: `${firstName(p.name)} is ${hit[1].type === 'holiday' ? `off (${hit[1].name || 'holiday'})` : 'on vacation'} on ${fmtDay(hit[0])} — not saved` };
  }
  for (const uid of peopleIds) {
    const crosses = workdays(from, to).find(day => outOn(data?.people?.[uid], day));
    if (crosses) return { note: ` · spans a day off (${fmtDay(crosses)})` };
  }
  return {};
}

/** Fields shown in the CP for a change (a status also decides open / active). */
function display(next) {
  const out = { ...next };
  if (next.status) {
    out.open = next.status.category !== 'delivered';
    out.active_now = ['in_progress', 'fixes'].includes(next.status.category);
  }
  return out;
}
/** What the API takes. */
function body(it, next) {
  const b = { board: it.board, current_people: it.people };
  if ('timeline' in next) b.timeline = next.timeline;
  if ('people' in next) b.people = next.people;
  if ('deadline' in next) b.deadline = next.deadline;
  if ('status' in next) b.status = next.status?.label;
  return b;
}

export const StudioCtx = createContext(null);
export const useStudio = () => useContext(StudioCtx);

/**
 * Optimistic Monday writes with Undo, shared by every Studio tab — a change made in the Workload shows on the
 * dashboard straight away. Overrides apply until data newer than the edit arrives.
 */
export function useMondayWrites({ readOnly = false } = {}) {
  const [local, setLocal] = useState({}); // id → { fields, at }
  const [toast, setToast] = useState(null);
  const [toastHover, setToastHover] = useState(false);
  const put = (id, fields) => setLocal(l => ({ ...l, [id]: { fields: { ...(l[id]?.fields || {}), ...fields }, at: Date.now() } }));

  const merge = useCallback((it, generatedAt) => {
    const o = local[it.id];
    if (!o || (generatedAt && Date.parse(generatedAt) > o.at)) return it;
    return { ...it, ...o.fields };
  }, [local]);

  const apply = useCallback(async (it, next, label) => {
    const prev = {};
    for (const k of Object.keys(next)) prev[k] = k === 'timeline' || k === 'deadline' ? (it[k] || null) : it[k];
    put(it.id, display(next));
    try {
      const r = await studioApi.patchItem(it.id, body(it, next));
      lastWrite = Date.now();
      setToast({
        head: r?.as_user ? 'Updated on Monday as you' : 'Updated on Monday',
        text: r?.refused ? `${label} · from CP’s account (Monday didn’t accept your connection — reconnect it)` : label,
        undo: async () => {
          setToast(null);
          put(it.id, display(prev));
          try { await studioApi.patchItem(it.id, body({ ...it, ...next }, prev)); lastWrite = Date.now(); } catch (e) { setToast({ error: true, text: e.message }); }
        },
      });
    } catch (e) {
      put(it.id, display(prev));
      setToast({ error: true, text: e.message });
    }
  }, []);

  /** Archive on Monday (after the user confirmed). Hidden in every tab at once; Monday's API has no un-archive. */
  const archive = useCallback(async (it) => {
    if (readOnly) { setToast({ error: true, text: 'View only — the studio manages tasks' }); return false; }
    put(it.id, { archived: true });
    try {
      const r = await studioApi.archiveItem(it.id);
      lastWrite = Date.now();
      setToast({ head: r?.as_user ? 'Archived on Monday as you' : 'Archived on Monday', text: `${it.title || it.name.slice(0, 50)} · restore it from the board’s Archive on Monday if needed` });
      return true;
    } catch (e) {
      put(it.id, { archived: false });
      setToast({ error: true, text: e.message });
      return false;
    }
  }, [readOnly]);

  /** Save a change to Monday. next: { timeline?, people?, status? (board status object), deadline? }. Returns false if blocked. */
  const save = useCallback((it, next, data) => {
    if (readOnly) { setToast({ error: true, text: 'View only — the studio schedules and moves tasks' }); return false; }
    const title = it.title || it.name.slice(0, 40);
    const parts = [];
    if (next.timeline) {
      const chk = checkSchedule(data, next.people || it.people, next.timeline.from, next.timeline.to);
      if (chk.error) { setToast({ error: true, text: chk.error }); return false; }
      parts.push(`${fmtDay(next.timeline.from)}${next.timeline.to !== next.timeline.from ? `–${fmtDay(next.timeline.to)}` : ''}${chk.note || ''}`);
    } else if ('timeline' in next) parts.push('unscheduled');
    if (next.people && next.people.join() !== it.people.join()) parts.push(`→ ${next.people.map(id => firstName(data?.people?.[id]?.name)).join(', ') || 'no one'}`);
    if (next.status) parts.push(`→ ${next.status.label}`);
    if ('deadline' in next) parts.push(next.deadline ? `deadline ${fmtDay(next.deadline)}` : 'deadline cleared');
    apply(it, next, `${title}: ${parts.join(' · ') || 'updated'}`);
    return true;
  }, [apply, readOnly]);

  /**
   * The same kind of change on many tasks at once (Tomer, 24 Nov 2026 — select tasks in a list, change their status
   * or deadline together). nextOf(it) → the change for that task, or null to leave it. Optimistic, three at a time,
   * one toast and one Undo for all of them; a task Monday refuses goes back and is counted.
   */
  const saveMany = useCallback(async (items, nextOf, label) => {
    if (readOnly) { setToast({ error: true, text: 'View only — the studio schedules and moves tasks' }); return false; }
    const jobs = items.map(it => ({ it, next: nextOf(it) })).filter(j => j.next && Object.keys(j.next).length);
    if (!jobs.length) return false;
    for (const j of jobs) {
      j.prev = {};
      for (const k of Object.keys(j.next)) j.prev[k] = k === 'timeline' || k === 'deadline' ? (j.it[k] || null) : j.it[k];
      put(j.it.id, display(j.next));
    }
    setToast({ head: 'Updating Monday', text: `${jobs.length} task${jobs.length === 1 ? '' : 's'} · ${label}…` });
    const run = async (list, pick) => {
      const failed = []; let asUser = false; let i = 0;
      const worker = async () => {
        while (i < list.length) {
          const j = list[i++];
          try { const r = await studioApi.patchItem(j.it.id, body(pick === 'prev' ? { ...j.it, ...j.next } : j.it, j[pick])); asUser = asUser || !!r?.as_user; }
          catch (e) { failed.push({ j, error: e.message }); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      return { failed, asUser };
    };
    const { failed, asUser } = await run(jobs, 'next');
    lastWrite = Date.now();
    for (const f of failed) put(f.j.it.id, display(f.j.prev));
    const bad = new Set(failed.map(f => f.j));
    const ok = jobs.filter(j => !bad.has(j));
    if (!ok.length) { setToast({ error: true, text: `Nothing changed — ${failed[0]?.error || 'Monday refused'}` }); return false; }
    setToast({
      head: asUser ? 'Updated on Monday as you' : 'Updated on Monday',
      text: `${ok.length} task${ok.length === 1 ? '' : 's'} · ${label}${failed.length ? ` · ${failed.length} not saved (${failed[0].error})` : ''}`,
      error: false,
      undo: async () => {
        setToast({ head: 'Undoing', text: `${ok.length} task${ok.length === 1 ? '' : 's'}…` });
        for (const j of ok) put(j.it.id, display(j.prev));
        const u = await run(ok, 'prev');
        lastWrite = Date.now();
        setToast(u.failed.length ? { error: true, text: `${u.failed.length} couldn’t be undone — ${u.failed[0].error}` } : { head: 'Undone on Monday', text: `${ok.length} task${ok.length === 1 ? '' : 's'} back as they were` });
      },
    });
    return true;
  }, [readOnly]);

  useEffect(() => {
    if (!toast || toastHover) return undefined;
    const t = setTimeout(() => setToast(null), toast.error ? 7000 : 12000);
    return () => clearTimeout(t);
  }, [toast, toastHover]);

  const toastEl = toast ? createPortal(
    <div onMouseEnter={() => setToastHover(true)} onMouseLeave={() => setToastHover(false)}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] px-4 py-2.5 rounded-full text-sm shadow-xl flex items-center gap-3 max-w-[92vw] ${toast.error ? 'bg-red-600 text-white' : 'bg-[#030b2e] text-white'}`}>
      {toast.error ? <AlertTriangle size={15} className="flex-none" /> : null}
      <span className="truncate">{toast.error ? toast.text : `${toast.head || 'Updated on Monday'} · ${toast.text}`}</span>
      {toast.undo && <button type="button" onClick={toast.undo} className="flex items-center gap-1 font-semibold text-[#8c93ff] hover:text-white flex-none"><Undo2 size={14} /> Undo</button>}
      <button type="button" onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 flex-none"><X size={14} /></button>
    </div>, document.body) : null;

  // patch: show a change at once everywhere (e.g. a pasted Frame.io link) — the caller wrote it to Monday itself
  return useMemo(() => ({ merge, save, saveMany, archive, setToast, toastEl, readOnly, patch: put }), [merge, save, saveMany, archive, toastEl, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps
}
