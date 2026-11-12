import { useCallback, useEffect, useRef, useState } from 'react';
import { Tags, Loader2, Check, ArrowRight } from 'lucide-react';
import { captainApi } from '../../lib/captainService';

const TYPE = { term: 'Term', rule: 'Rule', learned: 'Learned', insight: 'Insight', do_not_flag: 'Do not flag', claim: 'Claim' };
const label = (b) => (b === 'any' ? 'Every brand' : b);

/**
 * Sort the Brain by brand (Tomer, 12 Nov 2026): the Captain learned mostly from Particle ads, so house style was often
 * filed under Particle (Clearstep and Biomella ads never saw it) and feedback from other brands' ads as "every brand".
 * The Captain proposes, item by item; nothing changes until an admin ticks and applies.
 */
export default function BrandSort({ notify, onApplied }) {
  const [s, setS] = useState(null);
  const [off, setOff] = useState(() => new Set());   // proposals the admin unticked
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await captainApi.brandSortStatus();
      setS(r);
      clearTimeout(timer.current);
      if (r.status === 'queued' || r.status === 'running') timer.current = setTimeout(load, 4000);
    } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await captainApi.brandSort();
      notify(r.already_queued ? 'Already sorting — a minute or two' : 'Sorting the Brain by brand — a minute or two');
      setOff(new Set());
      setTimeout(load, 1500);
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };

  const props = s?.proposals || [];
  const chosen = props.filter(p => !off.has(p.id));
  const apply = async () => {
    setBusy(true);
    try {
      const r = await captainApi.brandSortApply(chosen.map(p => ({ id: p.id, brand: p.to })));
      notify(`${r.changed} item${r.changed === 1 ? '' : 's'} moved to the right brand`);
      setOff(new Set());
      onApplied?.();
      load();
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };
  const toggle = (id) => setOff(cur => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const running = s?.status === 'queued' || s?.status === 'running';
  const groups = [
    ['For every brand', 'House style the Captain should apply to every brand’s ads', props.filter(p => p.to === 'any')],
    ['For one brand only', 'Names, claims, prices, audience or look that belong to one brand', props.filter(p => p.to !== 'any')],
  ].filter(([, , list]) => list.length);

  return (
    <div className="trk-glass p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-10 h-10 rounded-2xl grid place-items-center bg-[#0808f8]/10 text-[#0808f8] flex-none"><Tags size={18} /></div>
        <div className="flex-1 min-w-[260px]">
          <div className="font-semibold text-[15px]">Which brand does each lesson belong to?</div>
          <p className="text-[13px] trk-muted mt-0.5 max-w-[680px]">
            The Captain learned mostly from Particle ads. Sorting checks every item: house style (spelling, punctuation, legibility, layout) goes to every
            brand; product names, claims, prices, audience and look stay with one brand. Nothing changes until you apply.
          </p>
        </div>
        <button type="button" className="trk-btn primary inline-flex items-center gap-1.5" onClick={start} disabled={busy || running}>
          {running ? <Loader2 size={14} className="animate-spin" /> : <Tags size={14} />} {running ? 'Sorting…' : props.length ? 'Sort again' : 'Sort by brand'}
        </button>
      </div>

      {s?.status === 'failed' && <div className="mt-3 text-[12.5px] text-red-600">The last sort failed: {s.error}</div>}
      {s?.status === 'done' && !props.length && (
        <div className="mt-3 text-[12.5px] trk-muted">Every item is with the right brand{s.items ? ` (${s.items} checked)` : ''}.</div>
      )}

      {props.length > 0 && (
        <div className="mt-4 space-y-4">
          {groups.map(([title, sub, list]) => (
            <div key={title}>
              <div className="flex items-baseline gap-2 mb-1.5">
                <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--trk-text)' }}>{title}</span>
                <span className="text-[12px] trk-muted">{list.length} · {sub}</span>
              </div>
              <div className="divide-y divide-black/5">
                {list.map(p => (
                  <label key={p.id} className="flex items-start gap-2.5 py-2 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={!off.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Move “${p.title}” to ${label(p.to)}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="trk-chip gray">{TYPE[p.type] || p.type}</span>
                        {p.status === 'pending' && <span className="trk-chip gray">in the review queue</span>}
                        <span className="text-[13.5px] font-medium" style={{ color: 'var(--trk-text)' }}>{p.title}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[12px] trk-muted">
                        {label(p.from)} <ArrowRight size={11} /> <b style={{ color: 'var(--trk-text)' }}>{label(p.to)}</b>{p.why ? <span>· {p.why}</span> : null}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" className="trk-btn primary inline-flex items-center gap-1.5" onClick={apply} disabled={busy || !chosen.length}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Apply {chosen.length} of {props.length}
            </button>
            <button type="button" className="trk-btn" onClick={() => setOff(off.size ? new Set() : new Set(props.map(p => p.id)))}>{off.size ? 'Tick all' : 'Untick all'}</button>
            {s?.cost_usd != null && <span className="text-[12px] trk-muted ml-auto">{s.items} items checked · ${Number(s.cost_usd).toFixed(2)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
