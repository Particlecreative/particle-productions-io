import { useCallback, useEffect, useState } from 'react';
import { Quote, Loader2, ScanText, ExternalLink, RefreshCw } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { LANE_LABEL, relTime } from './util';
import { BriefRow } from './BriefItems';

const FROM = { 'on the ad': 'printed on the ad', 'its Meta headline': 'its Meta headline (the line under the ad)', 'the ad image': 'read from the ad', 'brief copy': 'from the Monday brief', brief: 'from the Monday brief', 'brief hook': 'from the Monday brief' };

/** Winning statics → their headline opens a new video, word for word (move HEADLINE_HOOK). */
export default function HeadlineHooks({ overview, notify, onOpen, onQueued }) {
  const opts = overview?.options || {};
  const [lane, setLane] = useState('');
  const [product, setProduct] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState({});      // key → headline text (selected when present)
  const [reading, setReading] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState([]);
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await mediumApi.staticHooks({ lane, product })); } catch (e) { notify(e.message, true); } finally { setLoading(false); }
  }, [lane, product, notify]);
  useEffect(() => { load(); }, [load]);

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

  const items = data?.items || [];
  const chosen = Object.entries(pick).filter(([, h]) => h != null);
  const toggle = (w) => setPick(p => { const n = { ...p }; if (n[w.key] != null) delete n[w.key]; else n[w.key] = w.headline || ''; return n; });
  const setText = (key, text) => setPick(p => ({ ...p, [key]: text }));

  const read = async (w) => {
    setReading(w.key);
    try {
      const r = await mediumApi.readStaticHeadline(w.key);
      if (!r.ok) { notify(r.reason, true); return; }
      setData(d => ({ ...d, items: d.items.map(x => (x.key === w.key ? { ...x, headline: r.headline, headline_from: 'the ad image', candidates: [{ text: r.headline, from: 'the ad image' }, ...(x.candidates || []).filter(c => c.text.toLowerCase() !== r.headline.toLowerCase())] } : x)) }));
      setPick(p => (p[w.key] != null ? { ...p, [w.key]: r.headline } : p));
      notify('Read from the ad');
    } catch (e) { notify(e.message, true); } finally { setReading(null); }
  };

  const write = async () => {
    setBusy(true);
    try {
      const r = await mediumApi.staticHooksGenerate(chosen.map(([key, headline]) => ({ key, headline })));
      setIds(r.ids);
      setPick({});
      notify(`Writing ${r.queued} video brief${r.queued === 1 ? '' : 's'} — about a minute each${r.skipped?.length ? ` (${r.skipped.length} skipped: no headline)` : ''}`);
      load();
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="trk-glass p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
            <div className="trk-label flex items-center gap-1.5"><Quote size={13} /> Headline → Hook</div>
            <p className="mt-1 text-sm trk-muted">A static that won already proved its headline stops the scroll — ranked by Upspring on Particle’s own ROAS. Pick winners, check the headline, and Medium writes a video that opens with it word for word — plus two more hook versions, so the test shows whether the words or the idea did the work.</p>
          </div>
          <label className="grid gap-1"><span className="trk-label">Lane</span>
            <select className="trk-input" value={lane} onChange={(e) => setLane(e.target.value)}><option value="">All lanes</option>{(opts.lanes || []).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
          </label>
          <label className="grid gap-1"><span className="trk-label">Product</span>
            <select className="trk-input" value={product} onChange={(e) => setProduct(e.target.value)}><option value="">All products</option>{(opts.products || []).map(p => <option key={p} value={p}>{p}</option>)}</select>
          </label>
          <button type="button" className="trk-btn" onClick={load} disabled={loading} aria-label="Reload winners">{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}</button>
        </div>
      </div>

      {data && !data.available && <div className="trk-glass md-empty rounded-3xl"><div className="md-emoji" aria-hidden>🔌</div><div className="mt-3 text-[17px] font-semibold">Winning statics come from Upspring</div><div className="mt-1 md-sub">{data.reason}</div><a className="trk-btn mt-4 inline-flex" href="/medium?tab=behind&mode=sources">Go to Sources & settings</a></div>}
      {data?.available && !items.length && <div className="trk-glass p-5 text-sm trk-muted">No winning statics{lane || product ? ' for this filter' : ''} yet (winner = 80th percentile or better in its peer set, with a product).</div>}

      {items.length > 0 && (
        <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {items.map(w => {
            const on = pick[w.key] != null;
            const text = on ? pick[w.key] : w.headline;
            return (
              <div key={w.key} className="trk-glass !p-0 overflow-hidden flex flex-col" style={on ? { outline: '2px solid var(--trk-ink)', outlineOffset: -2 } : undefined}>
                {w.image && <button type="button" className="block w-full" onClick={() => toggle(w)} aria-label={`Pick ${w.label}`}><img src={w.image} alt={w.label} loading="lazy" referrerPolicy="no-referrer" className="w-full aspect-square object-cover" /></button>}
                <div className="p-4 flex flex-col gap-2.5 flex-1">
                <div className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={on} onChange={() => toggle(w)} aria-label={`Use ${w.label}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="trk-chip gray">{w.lane}</span><span className="trk-chip gray">{w.product}</span>
                      <span className="trk-chip green tabular-nums" title={`${w.percentile}th percentile on ROAS in its ${w.peer?.level || 'peer set'} (Upspring, last 90 days)`}>Top {Math.max(1, 100 - Number(w.percentile || 0))}%</span>
                      {w.briefed && <span className="trk-chip amber">hook briefed {relTime(w.briefed.at)}</span>}
                    </div>
                    <div className="mt-1 text-[12.5px] trk-muted truncate" title={w.label}>{w.label}</div>
                    <div className="text-[12px] trk-dim tabular-nums">ROAS {w.roas != null ? Number(w.roas).toFixed(2) : '—'} · ${Math.round(w.spend || 0).toLocaleString()} spend</div>
                  </div>
                </div>
                {on
                  ? <textarea className="trk-input !text-[16px] font-semibold" rows={2} value={text} onChange={(e) => setText(w.key, e.target.value)} placeholder="Type the headline exactly as it ran" aria-label="Headline" />
                  : <div className="text-[17px] font-semibold leading-snug min-h-[2.6em]">{w.headline ? `“${w.headline}”` : <span className="trk-dim font-normal text-[13px]">No headline found in its Monday brief{w.thumb ? ' — read it from the ad' : ' — tick it and type it'}</span>}</div>}
                {w.headline && <div className="text-[11.5px] trk-dim">{FROM[w.headline_from] || w.headline_from}</div>}
                {on && (w.candidates || []).length > 1 && (
                  <div className="flex flex-wrap gap-1.5">{w.candidates.map(c => (
                    <button key={c.text} type="button" className={`trk-chip ${pick[w.key] === c.text ? 'green' : 'gray'} !text-left`} onClick={() => setText(w.key, c.text)} title={FROM[c.from] || c.from}>{c.text}</button>
                  ))}</div>
                )}
                <div className="mt-auto flex flex-wrap gap-2 items-center pt-1">
                  {(w.upspring_url || w.image) && <a className="trk-btn !py-1 !text-[12px]" href={w.upspring_url || w.image} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {w.upspring_url ? 'Open in Upspring' : 'See the ad'}</a>}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(chosen.length > 0 || rows.length > 0) && (
        <div className="trk-glass p-5 sticky bottom-3 z-10">
          {chosen.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="trk-btn primary" disabled={busy || chosen.some(([, h]) => !String(h).trim())} onClick={write}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Quote size={14} />} Write {chosen.length} video brief{chosen.length === 1 ? '' : 's'}</button>
              <span className="text-[12.5px] trk-muted">{chosen.some(([, h]) => !String(h).trim()) ? 'Every picked static needs its headline.' : `About 10¢ each · up to 8 at a time · each goes to review like any brief.`}</span>
            </div>
          )}
          {rows.length > 0 && <div className={chosen.length ? 'mt-3' : ''}><div className="trk-label">This run</div>{rows.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}</div>}
        </div>
      )}
    </div>
  );
}
