// The editor's / designer's bench (25 Nov 2026): the delivery checklist from "Sizes needed" (× versions), and the
// latest Frame.io version with its comment count — on the card and in the task panel.
import { useEffect, useState } from 'react';
import { Check, ListChecks, MessageSquare, Film } from 'lucide-react';
import { studioApi } from '../../lib/studioService';

/** Same rule as the server (lib/studio/craft.js boxesOf): sizes × V1…Vn for 2–6 versions, else one box per size. */
export function boxesOf(sizes = [], versions = null) {
  const s = [...new Set((sizes || []).map(x => String(x).trim()).filter(Boolean))].slice(0, 12);
  const n = Math.round(Number(versions) || 0);
  if (!s.length) return n >= 2 && n <= 12 ? Array.from({ length: n }, (_, i) => `V${i + 1}`) : [];
  if (n >= 2 && n <= 6) return s.flatMap(size => Array.from({ length: n }, (_, i) => `${size} · V${i + 1}`));
  return s;
}

const ago = (iso) => {
  if (!iso) return '';
  const m = (Date.now() - Date.parse(iso)) / 60000;
  return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** "v3 · 💬 4" — the newest Frame.io file in the task's folder. compact = the card. */
export function FrameBadge({ status, compact = false }) {
  if (!status || status.error || !status.files) return null;
  const v = status.version ? `v${status.version}` : `${status.files} file${status.files === 1 ? '' : 's'}`;
  if (compact) {
    return (
      <span title={`${status.name || 'Latest file'} · ${ago(status.modified)}${status.comments != null ? ` · ${status.comments} comment${status.comments === 1 ? '' : 's'}` : ''}`}
        className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md bg-[#5b53ff]/10 text-[#5b53ff] dark:text-[#a8a3ff]">
        <Film size={10} />{v}{status.comments ? <><span className="opacity-40">·</span><MessageSquare size={10} />{status.comments}</> : null}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2 text-[12px] text-gray-600 rounded-lg bg-white border border-gray-200 px-3 py-2">
      <Film size={13} className="text-[#5b53ff] flex-none" />
      <span className="min-w-0 flex-1 truncate"><b className="text-[#030b2e]">{v}</b> · {status.name}{status.modified ? <span className="text-gray-400"> · {ago(status.modified)}</span> : null}</span>
      {status.comments != null && <span className={`flex items-center gap-1 font-semibold flex-none ${status.comments ? 'text-[#5b53ff] dark:text-[#a8a3ff]' : 'text-gray-400'}`}><MessageSquare size={12} />{status.comments} comment{status.comments === 1 ? '' : 's'}</span>}
    </div>
  );
}

/** The latest Frame.io file for one task (the panel). */
export function useFrameStatus(it) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!it?.links?.frame) { setSt(null); return undefined; }
    studioApi.myFrame().then(r => { if (alive) setSt(r.frame?.[it.id] || null); }).catch(() => null);
    return () => { alive = false; };
  }, [it?.id, it?.links?.frame]);
  return st;
}

/** Progress on a card: "2/6". */
export function ChecklistChip({ it, done }) {
  const boxes = boxesOf(it.sizes, it.versions);
  if (!boxes.length) return null;
  const n = boxes.filter(b => (done || []).includes(b)).length;
  const all = n === boxes.length;
  return (
    <span title={`Delivery checklist: ${n} of ${boxes.length} done`} className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md ${all ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      <ListChecks size={10} />{n}/{boxes.length}
    </span>
  );
}

/** The checklist in the task panel — ticks are shared by everyone on the task (saved in CP). */
export function DeliveryChecklist({ it, can, onAllDone }) {
  const boxes = boxesOf(it.sizes, it.versions);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    setDone(null);
    if (!boxes.length) return undefined;
    studioApi.checklist(it.id).then(r => { if (alive) setDone(r.done || []); }).catch(() => { if (alive) setDone([]); });
    return () => { alive = false; };
  }, [it.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!boxes.length) return null;
  const toggle = async (b) => {
    if (!can?.status || !done) return;
    const next = done.includes(b) ? done.filter(x => x !== b) : [...done, b];
    setDone(next); setErr(null);
    try {
      await studioApi.saveChecklist(it.id, next);
      if (next.length && boxes.every(x => next.includes(x)) && !boxes.every(x => done.includes(x))) onAllDone?.();
    } catch (e) { setErr(e.message); setDone(done); }
  };
  const n = done ? boxes.filter(b => done.includes(b)).length : 0;
  return (
    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <ListChecks size={13} className="text-[#0808f8]" />
        <span className="text-[12px] font-bold text-[#030b2e]">Delivery checklist</span>
        <span className="text-[11px] text-gray-400">{it.sizes?.length ? `${it.sizes.join(' · ')}${Number(it.versions) >= 2 ? ` × ${it.versions} versions` : ''}` : `${it.versions} versions`}</span>
        <span className={`ml-auto text-[11.5px] font-bold ${n === boxes.length ? 'text-emerald-600' : 'text-gray-500'}`}>{n}/{boxes.length}</span>
      </div>
      <div className="h-1 rounded-full bg-gray-100 overflow-hidden mb-2"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(n / boxes.length) * 100}%` }} /></div>
      <div className="flex flex-wrap gap-1.5">
        {boxes.map(b => {
          const on = done?.includes(b);
          return (
            <button key={b} type="button" onClick={() => toggle(b)} disabled={!can?.status || !done}
              className={`flex items-center gap-1.5 text-[12px] font-semibold pl-1.5 pr-2.5 py-1 rounded-lg border transition-colors ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'} disabled:cursor-default`}>
              <span className={`w-4 h-4 rounded flex items-center justify-center ${on ? 'bg-emerald-500 text-white' : 'border border-gray-300'}`}>{on && <Check size={11} strokeWidth={3} />}</span>{b}
            </button>
          );
        })}
      </div>
      {err && <div className="text-[11.5px] text-red-600 mt-1.5">{err}</div>}
    </div>
  );
}
