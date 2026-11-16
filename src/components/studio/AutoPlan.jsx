// Workload → ✨ Auto-plan: the timeline follows the work (Tomer, 16 Nov 2026). The rules in plain words, the switch,
// the new task lengths, and everything it changed — each with Undo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Undo2, Play, ArrowRightLeft, AlertTriangle, Minus, Plus, X } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { useAuth } from '../../context/AuthContext';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayText = (d) => (d ? DAY.format(new Date(`${d}T12:00:00Z`)) : '—');
const span = (t) => (!t ? 'no dates' : t.from === t.to ? dayText(t.from) : `${dayText(t.from)} → ${dayText(t.to)}`);
const when = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const first = (n) => String(n || '').split(' ')[0];
const KIND = { start: { icon: Play, color: '#0808f8', label: 'Started' }, room: { icon: ArrowRightLeft, color: '#00a36c', label: 'Made room' }, note: { icon: AlertTriangle, color: '#d97706', label: 'Heads-up' } };

export default function AutoPlan({ onChanged }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  const load = useCallback(() => studioApi.autoplan().then(setSt).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const s = st?.settings;
  const on = s?.mode === 'on';
  const todays = (st?.recent || []).filter(r => r.kind !== 'note' && !r.undone_at && new Date(r.at).toDateString() === new Date().toDateString()).length;
  const save = async (patch) => {
    setBusy('save'); setErr(null);
    try { const r = await studioApi.saveAutoplan(patch); setSt(x => ({ ...x, settings: r.settings })); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const undo = async (r) => {
    setBusy(r.id); setErr(null);
    try { await studioApi.undoAutoplan(r.id); await load(); onChanged?.(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} title="Auto-plan — the timeline follows the work"
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${open ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0808f8]/50'}`}>
        <Sparkles size={14} className={open ? '' : 'text-[#0808f8]'} /> Auto-plan
        {s && <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-gray-300'}`} />}
        {todays > 0 && <span className={`tabular-nums rounded-full px-1.5 text-[10px] ${open ? 'bg-white/20' : 'bg-[#0808f8] text-white'}`}>{todays}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[70] w-[min(440px,calc(100vw-24px))] bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 text-left select-text">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[#030b2e]">Auto-plan — the timeline follows the work</div>
              <div className="text-[11.5px] text-gray-500 mt-0.5">Checks every 2 minutes. Every change goes to Monday — and can be undone here.</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-md hover:bg-gray-100 text-gray-400" aria-label="Close"><X size={14} /></button>
          </div>
          {!s ? <div className="py-6 text-center text-gray-400"><Loader2 size={16} className="inline animate-spin" /></div> : (
            <>
              <ul className="mt-3 grid gap-1.5 text-[12.5px] text-gray-700">
                <li>▶ <b>Someone starts a task</b> (moves it to Working) → its timeline starts <b>that day</b> — early or late. Work picked up again after Paused or Fixes Round keeps its dates.</li>
                <li>⏱ It gets today’s length: <b>{s.video_days} day{s.video_days === 1 ? '' : 's'} for video, {s.design_days} for design</b> — Captain Caption reviews, so nobody waits days for feedback. TV productions keep theirs.</li>
                <li>⚖️ If that puts them over capacity (<b>2 a day</b> for an editor, <b>4</b> for a designer, or anything on a TV-production day), their <b>tasks that haven’t started</b> move to the first days with room — lowest priority and most slack first. <b>Critical</b> work and work <b>due within 2 days</b> stay, and nothing is moved past its deadline.</li>
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3 py-2.5 border-y border-gray-100">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  {[['on', 'On'], ['off', 'Off']].map(([k, l]) => (
                    <button key={k} type="button" disabled={!isAdmin || busy === 'save'} onClick={() => save({ mode: k })}
                      className={`text-xs font-semibold px-3 py-1 rounded-md ${s.mode === k ? (k === 'on' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-800 shadow-sm') : 'text-gray-500'}`}>{l}</button>
                  ))}
                </div>
                {[['video_days', '🎬 Video'], ['design_days', '🎨 Design']].map(([k, l]) => (
                  <span key={k} className="flex items-center gap-1 text-xs text-gray-600">
                    {l}
                    <button type="button" disabled={!isAdmin || busy === 'save' || s[k] <= 1} onClick={() => save({ [k]: s[k] - 1 })} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" aria-label={`Fewer days for ${l}`}><Minus size={11} /></button>
                    <b className="tabular-nums w-3 text-center">{s[k]}</b>
                    <button type="button" disabled={!isAdmin || busy === 'save' || s[k] >= 10} onClick={() => save({ [k]: s[k] + 1 })} className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30" aria-label={`More days for ${l}`}><Plus size={11} /></button>
                    <span className="text-gray-400">day{s[k] === 1 ? '' : 's'}</span>
                  </span>
                ))}
                {!isAdmin && <span className="text-[11px] text-gray-400">Only admins change these</span>}
              </div>
              {err && <div className="mt-2 text-[12px] text-red-600">{err}</div>}
              <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">What it did · last 7 days</div>
              <div className="mt-1.5 max-h-[300px] overflow-y-auto grid gap-1.5 pr-1">
                {!(st.recent || []).length && <div className="text-[12px] text-gray-400 py-3 text-center">Nothing yet — it acts the next time someone starts a task.</div>}
                {(st.recent || []).map(r => {
                  const K = KIND[r.kind] || KIND.note;
                  return (
                    <div key={r.id} className={`rounded-xl border border-gray-100 px-2.5 py-2 ${r.undone_at ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
                        <K.icon size={11} style={{ color: K.color }} /> <span className="font-semibold" style={{ color: K.color }}>{K.label}</span>
                        {r.person_name && <span>· {first(r.person_name)}</span>}
                        <span className="ml-auto">{when(r.at)}</span>
                      </div>
                      <div className="text-[12px] font-semibold text-gray-900 leading-snug mt-0.5 truncate" title={r.item_name}>{r.item_name}</div>
                      {r.after && <div className="text-[11.5px] text-gray-600 mt-0.5"><span className="line-through text-gray-400">{span(r.before)}</span> → <b>{span(r.after)}</b></div>}
                      <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{r.why}</div>
                      {r.undone_at
                        ? <div className="text-[10.5px] text-gray-400 mt-1">Undone{r.undone_by ? ` by ${first(r.undone_by)}` : ''}</div>
                        : r.kind !== 'note' && (
                          <button type="button" onClick={() => undo(r)} disabled={busy === r.id} className="mt-1 text-[11px] font-semibold text-[#0808f8] hover:underline inline-flex items-center gap-1">
                            {busy === r.id ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />} Undo
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
