import { useEffect, useState } from 'react';
import { Wand2, Loader2, Plus, X } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { LANE_LABEL } from './util';
import { BriefRow } from './BriefItems';
import { PREFILL_KEY } from './Market';

/** Your idea, the way you'd say it in the hallway, crossed with everything Medium knows — then written twice. */
export default function Freeform({ overview, notify, onOpen, onQueued }) {
  const opts = overview?.options || {};
  // "Brief from this" in Market Watch hands over an idea and its reference
  const [prefill] = useState(() => { try { return JSON.parse(sessionStorage.getItem(PREFILL_KEY) || 'null'); } catch { return null; } });
  useEffect(() => { try { sessionStorage.removeItem(PREFILL_KEY); } catch { /* ignore */ } }, []);
  const [idea, setIdea] = useState(prefill?.idea || '');
  const [refs, setRefs] = useState(prefill?.references?.length ? [...prefill.references, ''] : ['']);
  const [lane, setLane] = useState(prefill?.lane || '');
  const [product, setProduct] = useState('');
  const [format, setFormat] = useState('');
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(null);
  const [row, setRow] = useState(null);

  useEffect(() => {
    if (!id) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await mediumApi.briefs({ ids: id });
        const b = r.briefs[0];
        if (stop) return;
        setRow(b);
        if (b && ['QUEUED', 'WRITING'].includes(b.status)) setTimeout(() => !stop && tick(), 4000);
        else { onQueued?.(); if (b?.status === 'PENDING_REVIEW') onOpen(b.id); }
      } catch (e) { notify(e.message, true); }
    };
    tick();
    return () => { stop = true; };
  }, [id, notify, onQueued, onOpen]);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await mediumApi.freeform({ idea, references: refs.filter(x => x.trim()), lane: lane || undefined, product: product || undefined, format: format || undefined });
      setId(r.id);
      notify('Medium is reading your idea — about a minute');
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 items-start">
      <form className="trk-glass p-5 grid gap-3" onSubmit={run}>
        <p className="text-sm trk-muted">Write it the way you’d say it in the hallway — one line or a paragraph, Hebrew or English. Medium works out the lane, product and format, crosses it with the corpus, the Brain and the evidence, and writes it twice: your idea exactly, and Medium’s sharper version. Both go through the same score and Captain Caption check.</p>
        <label className="grid gap-1"><span className="trk-label">Your idea</span>
          <textarea className="trk-input !text-[15px]" rows={6} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. A guy getting ready for his daughter’s wedding notices his neck in the mirror — like that Kizik timer ad, but for Neck Cream" required />
        </label>
        <div className="grid gap-2">
          <span className="trk-label">References</span>
          {refs.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input className="trk-input" value={r} onChange={(e) => setRefs(refs.map((x, k) => (k === i ? e.target.value : x)))} placeholder="Monday ticket, web page, image or Upspring ad…" aria-label={`Reference ${i + 1}`} />
              {refs.length > 1 && <button type="button" className="trk-btn !p-2" aria-label="Remove reference" onClick={() => setRefs(refs.filter((_, k) => k !== i))}><X size={13} /></button>}
            </div>
          ))}
          {refs.length < 8 && <button type="button" className="trk-btn !py-1.5 justify-self-start" onClick={() => setRefs([...refs, ''])}><Plus size={13} /> Add a reference</button>}
          <p className="text-[12px] trk-dim">Monday tickets, web pages, image links (mood boards, screenshots) and Upspring ads are all read.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="grid gap-1"><span className="trk-label">Lane</span>
            <select className="trk-input" value={lane} onChange={(e) => setLane(e.target.value)}><option value="">Medium decides</option>{(opts.lanes || []).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
          </label>
          <label className="grid gap-1"><span className="trk-label">Product</span>
            <input className="trk-input" list="md-ff-products" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Medium decides" />
            <datalist id="md-ff-products">{(opts.products || []).map(p => <option key={p} value={p} />)}</datalist>
          </label>
          <label className="grid gap-1"><span className="trk-label">Format</span>
            <select className="trk-input" value={format} onChange={(e) => setFormat(e.target.value)}><option value="">Medium decides</option><option value="video">🎬 Video</option><option value="design">🎨 Static</option></select>
          </label>
        </div>
        <button type="submit" className="trk-btn primary justify-self-start" disabled={busy || idea.trim().length < 12}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Write it</button>
      </form>
      <div className="trk-glass p-5">
        <div className="trk-label">Result</div>
        {!row && <div className="py-12 text-center trk-muted text-sm">Your brief appears here — with what Medium found (supports, overlaps, risks, gaps) and both versions side by side.</div>}
        {row && <BriefRow b={row} onOpen={() => onOpen(row.id)} />}
      </div>
    </div>
  );
}
