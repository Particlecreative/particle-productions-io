import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Minus, Plus, ChevronDown } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { LANE_LABEL, MOVE_LABEL } from './util';
import { BriefRow } from './StrategyRoom';

/** Lane → product → format → move → count → Generate. Each brief arrives with its Why, its Test, a score and the Captain's check. */
export default function Generator({ overview, notify, onOpen, onQueued }) {
  const opts = overview?.options || {};
  const [f, setF] = useState({ lane: 'Particle', product: '', format: 'video', move: 'NEW_ANGLE', kind: '', count: 2, note: '', template: '', campaign: '', code: '', tier: '', ends: '', article_url: '', source_product: '', source_lane: '', source: '' });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState([]);
  const [rows, setRows] = useState([]);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  useEffect(() => {
    if (!ids.length) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await mediumApi.briefs({ ids: ids.join(',') });
        if (!stop) setRows(r.briefs);
        if (r.briefs.some(b => ['QUEUED', 'WRITING'].includes(b.status))) setTimeout(() => !stop && tick(), 4000);
        else onQueued?.();
      } catch (e) { notify(e.message, true); }
    };
    tick();
    return () => { stop = true; };
  }, [ids, notify, onQueued]);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const offer = f.code || f.tier || f.ends ? { code: f.code, tier: f.tier, ends: f.ends } : null;
      const r = await mediumApi.generate({ ...f, count: Number(f.count), kind: f.kind || null, offer });
      setIds(r.ids);
      notify(`Writing ${r.queued} brief${r.queued === 1 ? '' : 's'} — about a minute each`);
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  };

  const magazine = f.lane !== 'Particle';
  return (
    <div className="grid xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
      <form className="trk-glass p-5 grid gap-3" onSubmit={run}>
        <p className="text-sm trk-muted">Pick a lane, a product and a move. Medium does the rest — in house style.</p>
        <label className="grid gap-1"><span className="trk-label">Lane</span>
          <select className="trk-input" value={f.lane} onChange={set('lane')}>{(opts.lanes || ['Particle']).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
        </label>
        <label className="grid gap-1"><span className="trk-label">Product</span>
          <input className="trk-input" list="md-products" value={f.product} onChange={set('product')} placeholder="e.g. Neck Cream" required />
          <datalist id="md-products">{(opts.products || []).map(p => <option key={p} value={p} />)}</datalist>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1"><span className="trk-label">Format</span>
            <select className="trk-input" value={f.format} onChange={set('format')}><option value="video">🎬 Video</option><option value="design">🎨 Static</option></select>
          </label>
          <label className="grid gap-1"><span className="trk-label">How many</span>
            <div className="flex items-center gap-2">
              <button type="button" className="trk-btn !p-2" aria-label="Fewer" onClick={() => setF(x => ({ ...x, count: Math.max(1, x.count - 1) }))}><Minus size={13} /></button>
              <span className="tabular-nums font-semibold w-6 text-center" aria-live="polite">{f.count}</span>
              <button type="button" className="trk-btn !p-2" aria-label="More" onClick={() => setF(x => ({ ...x, count: Math.min(6, x.count + 1) }))}><Plus size={13} /></button>
            </div>
          </label>
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="trk-label mb-1">Move</legend>
          {Object.entries(opts.moves || {}).map(([k, d]) => (
            <label key={k} className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="radio" name="move" value={k} checked={f.move === k} onChange={set('move')} className="mt-1" />
              <span><b>{MOVE_LABEL[k] || k}</b> <span className="trk-muted">— {d}</span></span>
            </label>
          ))}
        </fieldset>
        {f.move === 'TRANSFER_PRODUCT' && (
          <label className="grid gap-1"><span className="trk-label">Transfer from product (the winner)</span>
            <input className="trk-input" list="md-products" value={f.source_product} onChange={set('source_product')} placeholder="e.g. Face Cream" />
            <span className="text-[12px] trk-dim">Same lane, only the product changes. The analyst checks claims, proof and saturation first — a transfer the target can’t carry is blocked.</span>
          </label>
        )}
        {f.move === 'TRANSFER_LANE' && (
          <label className="grid gap-1"><span className="trk-label">Transfer from lane</span>
            <select className="trk-input" value={f.source_lane} onChange={set('source_lane')}><option value="">Pick the lane it won in</option>{(opts.lanes || []).filter(l => l !== f.lane).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
          </label>
        )}
        {f.move.startsWith('TRANSFER_') && (
          <label className="grid gap-1"><span className="trk-label">The winning concept (optional)</span>
            <input className="trk-input" value={f.source} onChange={set('source')} placeholder="e.g. SFY “Understand the Why” — thinnest skin fact → narrator" />
          </label>
        )}
        {magazine && (
          <label className="grid gap-1"><span className="trk-label">Destination article</span>
            <input className="trk-input" list="md-articles" value={f.article_url} onChange={set('article_url')} placeholder="https://… (the ad must point at an article that exists)" />
            <datalist id="md-articles">{(overview?.articles || []).filter(a => a.lane === f.lane && !a.opportunity).map(a => <option key={a.url} value={a.url}>{a.title || a.url}</option>)}</datalist>
            <span className="text-[12px] trk-dim">{(overview?.articles || []).filter(a => a.lane === f.lane && !a.opportunity).length} {f.lane} articles known from past tickets. No article yet? Medium logs an Article Opportunity for the editor.</span>
          </label>
        )}
        <label className="grid gap-1"><span className="trk-label">Note to Medium (optional)</span>
          <textarea className="trk-input" rows={3} value={f.note} onChange={set('note')} placeholder="e.g. Lean on the wedding season; keep it under 30 seconds" />
        </label>
        <button type="button" className="text-[12.5px] trk-muted flex items-center gap-1 hover:underline justify-self-start" onClick={() => setMore(!more)} aria-expanded={more}><ChevronDown size={13} style={{ transform: more ? 'rotate(180deg)' : 'none' }} /> Template, kind of job, sale offer</button>
        {more && (
          <div className="grid gap-3">
            <label className="grid gap-1"><span className="trk-label">Kind of job</span>
              <select className="trk-input" value={f.kind} onChange={set('kind')}><option value="">Medium decides from the move</option>{(opts.kinds || []).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            </label>
            <label className="grid gap-1"><span className="trk-label">Named template</span><input className="trk-input" value={f.template} onChange={set('template')} placeholder="e.g. Receipt Vertical" /></label>
            <label className="grid gap-1"><span className="trk-label">Campaign</span><input className="trk-input" value={f.campaign} onChange={set('campaign')} placeholder="e.g. Christmas 2026" /></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1"><span className="trk-label">Code</span><input className="trk-input" value={f.code} onChange={set('code')} placeholder="XMAS30" /></label>
              <label className="grid gap-1"><span className="trk-label">%</span><input className="trk-input" inputMode="numeric" value={f.tier} onChange={set('tier')} placeholder="30" /></label>
              <label className="grid gap-1"><span className="trk-label">Ends</span><input type="date" className="trk-input" value={f.ends} onChange={set('ends')} /></label>
            </div>
          </div>
        )}
        <button type="submit" className="trk-btn primary justify-center" disabled={busy || !f.product.trim()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate {f.count} brief{f.count === 1 ? '' : 's'}</button>
        <p className="text-[12px] trk-dim">Each brief: written in house style from 3 of the team’s own briefs, style-checked, scored, then proofread by Captain Caption. About 5–10¢ each. Source winners come from AfterLife once its feed is live.</p>
      </form>

      <div className="trk-glass p-5 min-h-[240px]">
        <div className="trk-label">This run</div>
        {!rows.length && <div className="py-12 text-center trk-muted text-sm">Nothing generated yet. Choose your settings and press Generate.</div>}
        {rows.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}
      </div>
    </div>
  );
}
