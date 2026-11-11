import { useEffect, useState } from 'react';
import { Loader2, Wand2, Factory, Minus, Plus, X } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { LANE_LABEL, MOVE_INFO, money } from './util';
import { BriefRow } from './BriefItems';

const EXAMPLES = [
  '20 Neck Cream statics for Black Friday with code BF30 (30% off, ends Nov 30) — half for SFY listicles, half direct. Plus 6 videos testing the mirror hook.',
  '10 new hooks for our best Face Cream video, and 5 fresh takes for Hand Cream in a UGC style.',
  'A full Valentine’s set for WAC: 8 statics and 4 videos for Gravité, playful, gift angle.',
];

/** Say what you need in plain words → Medium plans the batch → you check it → it writes them all. */
export default function MassProduction({ notify, onOpen, onQueued }) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(null);
  const [ids, setIds] = useState([]);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!ids.length) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await mediumApi.briefs({ ids: ids.join(',') });
        if (!stop) setRows(r.briefs);
        if (r.briefs.some(b => ['QUEUED', 'WRITING'].includes(b.status))) setTimeout(() => !stop && tick(), 6000);
        else onQueued?.();
      } catch (e) { notify(e.message, true); }
    };
    tick();
    return () => { stop = true; };
  }, [ids, notify, onQueued]);

  const makePlan = async (e) => {
    e?.preventDefault();
    setBusy('plan');
    try { setPlan(await mediumApi.massPlan(text)); } catch (err) { notify(err.message, true); } finally { setBusy(null); }
  };
  const groups = plan?.groups || [];
  const total = groups.reduce((n, g) => n + g.count, 0);
  const setCount = (i, d) => setPlan(p => ({ ...p, groups: p.groups.map((g, k) => (k === i ? { ...g, count: Math.min(12, Math.max(1, g.count + d)) } : g)) }));
  const drop = (i) => setPlan(p => ({ ...p, groups: p.groups.filter((_, k) => k !== i) }));
  const produce = async () => {
    if (total > 15 && !window.confirm(`Write ${total} briefs now? About ${money(total * 0.15)} — they’ll arrive over the next ${Math.ceil(total * 1.2)} minutes.`)) return;
    setBusy('produce');
    try {
      const r = await mediumApi.massProduce({ ...plan, groups }, text);
      setIds(r.ids); setPlan(null);
      notify(`Writing ${r.queued} briefs — they arrive one by one in Briefs`);
    } catch (err) { notify(err.message, true); } finally { setBusy(null); }
  };

  return (
    <div className="max-w-[1100px] space-y-6">
      <form className="trk-glass rounded-3xl p-5 sm:p-7 grid gap-4" onSubmit={makePlan}>
        <div>
          <h3 className="md-h2">What do you need?</h3>
          <p className="md-sub mt-1">Write it the way you’d brief a team — how many, which products, which lanes, any sale or deadline. Medium turns it into a plan first; nothing is written until you say go.</p>
        </div>
        <textarea className="trk-input !text-[15px] leading-relaxed" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLES[0]} aria-label="What you need" />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.slice(1).map(x => <button key={x} type="button" className="trk-chip gray !text-left !py-1.5 hover:opacity-80" onClick={() => setText(x)}>{x}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="trk-btn primary !px-5 !py-2.5" disabled={busy === 'plan' || text.trim().length < 10}>{busy === 'plan' ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Plan it</button>
          <span className="md-sub">Planning takes a few seconds and costs about 1¢.</span>
        </div>
      </form>

      {plan && (
        <div className="trk-glass rounded-3xl p-5 sm:p-7">
          <h3 className="md-h2">The plan</h3>
          {plan.summary && <p className="mt-1 text-[15px] leading-relaxed">{plan.summary}</p>}
          {plan.question && <p className="mt-2 text-[14px]" style={{ color: 'var(--trk-amber)' }}><b>Medium asks:</b> {plan.question} <span className="trk-dim">— add the answer above and plan again, or go ahead.</span></p>}
          {plan.capped && <p className="mt-2 text-[13px] trk-muted">Medium writes up to 40 briefs per run — this plan covers the first 40.</p>}
          <div className="mt-4 grid gap-2">
            {groups.map((g, i) => {
              const [emoji, label] = MOVE_INFO[g.move] || ['📝', g.move];
              return (
                <div key={i} className="md-row !items-start !cursor-default" style={{ background: 'var(--trk-glass)' }}>
                  <span className="text-[20px]" aria-hidden>{g.format === 'design' ? '🎨' : '🎬'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold" style={{ color: 'var(--trk-text)' }}>{g.product} · {g.format === 'design' ? 'Statics' : 'Videos'}{g.lane !== 'Particle' ? ` · ${LANE_LABEL[g.lane] || g.lane}` : ''}</div>
                    <div className="text-[13.5px] trk-muted">{emoji} {label}{g.campaign ? ` · ${g.campaign}` : ''}{g.angle ? ` — ${g.angle}` : ''}</div>
                    {g.note && <div className="text-[12.5px] trk-dim mt-0.5 line-clamp-2">{g.note}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-none">
                    <button type="button" className="trk-btn !p-1.5" aria-label="Fewer" onClick={() => setCount(i, -1)}><Minus size={12} /></button>
                    <span className="tabular-nums font-semibold w-6 text-center">{g.count}</span>
                    <button type="button" className="trk-btn !p-1.5" aria-label="More" onClick={() => setCount(i, 1)}><Plus size={12} /></button>
                    <button type="button" className="trk-btn !p-1.5 ml-1" aria-label="Remove this group" onClick={() => drop(i)}><X size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="trk-btn primary !px-5 !py-2.5" disabled={busy === 'produce' || !total || total > 40} onClick={produce}>{busy === 'produce' ? <Loader2 size={15} className="animate-spin" /> : <Factory size={15} />} Produce {total} brief{total === 1 ? '' : 's'}</button>
            <span className="md-sub">About {money(total * 0.15)} · each one is written in the team’s style and checked by Captain Caption; anything under 75 gets improved before it reaches you.</span>
            <button type="button" className="trk-btn ml-auto" onClick={makePlan} disabled={busy === 'plan'}>Plan again</button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="trk-glass rounded-3xl p-5">
          <div className="flex items-baseline gap-2"><h3 className="md-h2 !text-[17px]">This run</h3><span className="md-sub">{rows.filter(b => !['QUEUED', 'WRITING'].includes(b.status)).length} of {rows.length} written</span></div>
          <div className="mt-2">{rows.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}</div>
        </div>
      )}
    </div>
  );
}
