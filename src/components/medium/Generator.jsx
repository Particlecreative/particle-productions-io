import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Minus, Plus, ChevronDown } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { LANE_LABEL, MOVE_INFO } from './util';
import { BriefRow } from './BriefItems';

function Step({ n, title, children }) {
  return (
    <section>
      <div className="flex items-baseline gap-2.5"><span className="font-bold text-[15px]" style={{ color: 'var(--trk-ink)' }}>{n}</span><h3 className="md-h2 !text-[17px]">{title}</h3></div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Lane → product → format → move → count → Generate. Each brief arrives with its Why, its Test, a score and the Captain's check. */
export default function Generator({ overview, notify, onOpen, onQueued }) {
  const opts = overview?.options || {};
  const [f, setF] = useState({ lane: 'Particle', product: '', format: 'video', move: 'NEW_ANGLE', kind: '', count: 2, note: '', template: '', campaign: '', code: '', tier: '', ends: '', article_url: '', source_product: '', source_lane: '', source: '', headline: '' });
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
  const moves = Object.keys(MOVE_INFO).filter(k => (!opts.moves || k in opts.moves) && k !== 'FREEFORM' && k !== 'HEADLINE_HOOK');
  const top = (opts.products || []).slice(0, 8);
  return (
    <div className="max-w-[1100px] space-y-6">
      <form className="trk-glass rounded-3xl p-5 sm:p-7 grid gap-7" onSubmit={run}>
        <Step n="1" title="Which product?">
          <div className="flex flex-wrap gap-2">
            {top.map(p => <button key={p} type="button" className={`trk-btn !py-1.5 ${f.product === p ? 'primary' : ''}`} onClick={() => setF(x => ({ ...x, product: p }))}>{p}</button>)}
          </div>
          <input className="trk-input mt-2 max-w-[360px]" list="md-products" value={f.product} onChange={set('product')} placeholder="…or type any product" aria-label="Product" required />
          <datalist id="md-products">{(opts.products || []).map(p => <option key={p} value={p} />)}</datalist>
        </Step>

        <Step n="2" title="What kind of brief?">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Kind of brief">
            {moves.map(k => { const [emoji, label, line] = MOVE_INFO[k]; return (
              <button key={k} type="button" role="radio" aria-checked={f.move === k} className={`md-action !min-h-0 !p-4 ${f.move === k ? 'on' : ''}`} onClick={() => setF(x => ({ ...x, move: k }))}>
                <span className="flex items-center gap-2"><span className="text-[20px]" aria-hidden>{emoji}</span><span className="md-action-title !mt-0 !text-[15px]">{label}</span></span>
                <span className="md-action-line">{line}</span>
              </button>
            ); })}
          </div>
          {f.move === 'TRANSFER_PRODUCT' && (
            <label className="grid gap-1 mt-4 max-w-[420px]"><span className="md-doc-label">Which product did it win on?</span>
              <input className="trk-input" list="md-products" value={f.source_product} onChange={set('source_product')} placeholder="e.g. Face Cream" />
              <span className="text-[12.5px] trk-dim">Medium checks the claims and proof first — if the new product can’t carry it, it says so instead of writing it.</span>
            </label>
          )}
          {f.move === 'TRANSFER_LANE' && (
            <label className="grid gap-1 mt-4 max-w-[420px]"><span className="md-doc-label">Which lane did it win in?</span>
              <select className="trk-input" value={f.source_lane} onChange={set('source_lane')}><option value="">Pick the lane</option>{(opts.lanes || []).filter(l => l !== f.lane).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
            </label>
          )}
          {(f.move.startsWith('TRANSFER_') || ['ITERATE', 'REFRESH', 'REVIVE'].includes(f.move)) && (
            <label className="grid gap-1 mt-4"><span className="md-doc-label">Which winner? (optional — Medium picks from Upspring’s top ads if empty)</span>
              <input className="trk-input" value={f.source} onChange={set('source')} placeholder="e.g. the Neck Cream “Mirror Timer” video, or a Monday link" />
            </label>
          )}
        </Step>

        <Step n="3" title="The details">
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="grid gap-1"><span className="md-doc-label">Where it runs</span>
              <select className="trk-input" value={f.lane} onChange={set('lane')}>{(opts.lanes || ['Particle']).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
            </label>
            <label className="grid gap-1"><span className="md-doc-label">Format</span>
              <select className="trk-input" value={f.format} onChange={set('format')}><option value="video">🎬 Video</option><option value="design">🎨 Static</option></select>
            </label>
            <div className="grid gap-1"><span className="md-doc-label">How many versions</span>
              <div className="flex items-center gap-2">
                <button type="button" className="trk-btn !p-2" aria-label="Fewer" onClick={() => setF(x => ({ ...x, count: Math.max(1, x.count - 1) }))}><Minus size={13} /></button>
                <span className="tabular-nums font-semibold w-6 text-center text-[16px]" aria-live="polite">{f.count}</span>
                <button type="button" className="trk-btn !p-2" aria-label="More" onClick={() => setF(x => ({ ...x, count: Math.min(6, x.count + 1) }))}><Plus size={13} /></button>
              </div>
            </div>
          </div>
          {magazine && (
            <label className="grid gap-1 mt-4"><span className="md-doc-label">The article the ad leads to</span>
              <input className="trk-input" list="md-articles" value={f.article_url} onChange={set('article_url')} placeholder="https://…" />
              <datalist id="md-articles">{(overview?.articles || []).filter(a => a.lane === f.lane && !a.opportunity).map(a => <option key={a.url} value={a.url}>{a.title || a.url}</option>)}</datalist>
              <span className="text-[12.5px] trk-dim">{(overview?.articles || []).filter(a => a.lane === f.lane && !a.opportunity).length || 'No'} {LANE_LABEL[f.lane] || f.lane} articles known. No article yet? Medium flags it for the editor.</span>
            </label>
          )}
          <label className="grid gap-1 mt-4"><span className="md-doc-label">Anything Medium should know? (optional)</span>
            <textarea className="trk-input" rows={2} value={f.note} onChange={set('note')} placeholder="e.g. Lean on wedding season; a 60-second testimonial cut" />
          </label>
          <button type="button" className="mt-3 text-[13px] trk-muted flex items-center gap-1 hover:underline" onClick={() => setMore(!more)} aria-expanded={more}><ChevronDown size={14} style={{ transform: more ? 'rotate(180deg)' : 'none' }} /> Template, campaign, sale code</button>
          {more && (
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
              <label className="grid gap-1"><span className="md-doc-label">Kind of job</span>
                <select className="trk-input" value={f.kind} onChange={set('kind')}><option value="">Medium decides</option>{(opts.kinds || []).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
              </label>
              <label className="grid gap-1"><span className="md-doc-label">Named template</span><input className="trk-input" value={f.template} onChange={set('template')} placeholder="e.g. Receipt Vertical" /></label>
              <label className="grid gap-1"><span className="md-doc-label">Campaign</span><input className="trk-input" value={f.campaign} onChange={set('campaign')} placeholder="e.g. Christmas 2026" /></label>
              <div className="grid grid-cols-3 gap-2">
                <label className="grid gap-1"><span className="md-doc-label">Code</span><input className="trk-input" value={f.code} onChange={set('code')} placeholder="XMAS30" /></label>
                <label className="grid gap-1"><span className="md-doc-label">% off</span><input className="trk-input" inputMode="numeric" value={f.tier} onChange={set('tier')} placeholder="30" /></label>
                <label className="grid gap-1"><span className="md-doc-label">Ends</span><input type="date" className="trk-input" value={f.ends} onChange={set('ends')} /></label>
              </div>
            </div>
          )}
        </Step>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="trk-btn primary !px-5 !py-2.5 !text-[14px]" disabled={busy || !f.product.trim()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Write {f.count} brief{f.count === 1 ? '' : 's'}</button>
          <span className="md-sub">About a minute and 5–25¢ each. Each one is written in the team’s style and checked by Captain Caption — if it scores under 75, Medium improves it before it reaches you.</span>
        </div>
      </form>

      {rows.length > 0 && (
        <div className="trk-glass rounded-3xl p-5">
          <h3 className="md-h2 !text-[17px]">This run</h3>
          <div className="mt-2">{rows.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}</div>
        </div>
      )}
    </div>
  );
}
