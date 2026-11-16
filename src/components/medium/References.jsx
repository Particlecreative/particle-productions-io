// The reference a brief is written from — shown in Medium's brief view and in Captain HQ's check view (16 Nov 2026).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Maximize2, Paperclip } from 'lucide-react';

const REF_KIND = { winner: 'The winner it builds on', upspring: 'Upspring ad', image: 'Reference image', monday: 'Monday ticket', web: 'Web page' };
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * The reference the brief is written from — full size (the original file, not a thumbnail), and where it is on Monday.
 * b = the Medium brief ({ status, evidence.monday_refs }); pendingText = what happens before it's on Monday.
 */
export default function References({ refs, b, mondayOn, pendingText, mediumLink }) {
  const [open, setOpen] = useState(null);
  const media = refs.filter(r => r.image || r.video);
  const links = refs.filter(r => !r.image && !r.video && r.link);
  const sent = b.evidence?.monday_refs;
  const n = sent?.attached?.length || 0;
  const status = !media.length ? null
    : b.status === 'SUBMITTED'
      ? (n ? { ok: true, text: `On the Monday ticket — ${n === 1 ? 'the file is' : `${n} files are`} in Relevant Files` }
        : sent ? { ok: false, text: `Not attached on Monday${sent.failed?.length ? ` (${sent.failed.join('; ')})` : ''} — add it to the ticket by hand` }
          : { ok: false, text: 'Sent to Monday before references were attached — add it to the ticket by hand' })
      : { ok: null, text: pendingText || (mondayOn ? 'Goes into the Monday ticket’s Relevant Files when you approve' : 'Goes into the Monday ticket’s Relevant Files once Monday submission is on') };
  return (
    <section className="mt-7">
      <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
        <h3 className="md-h2">{media.length + links.length > 1 ? 'The references' : 'The reference'}</h3>
        {status && <span className="text-[12.5px] inline-flex items-center gap-1" style={{ color: status.ok === true ? 'var(--trk-green)' : status.ok === false ? 'var(--trk-amber)' : undefined }}><Paperclip size={12} className={status.ok == null ? 'trk-muted' : ''} /><span className={status.ok == null ? 'trk-muted' : ''}>{status.text}</span></span>}
        {mediumLink && <a className="ml-auto text-[12.5px] underline-offset-2 hover:underline trk-muted" href={mediumLink}>Open the brief in Medium <ExternalLink size={11} className="inline" /></a>}
      </div>
      <div className="mt-4 grid gap-4">
        {media.map((r, i) => <RefCard key={`${r.kind}:${i}`} r={r} onOpen={() => setOpen(r)} />)}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map((l, i) => <a key={i} className="trk-btn !py-1.5 !text-[12.5px] max-w-full" href={l.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} className="flex-none" /> <span className="truncate">{REF_KIND[l.kind]}: {l.label}</span></a>)}
          </div>
        )}
      </div>
      {open && <RefViewer r={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function RefCard({ r, onOpen }) {
  const [size, setSize] = useState(null);
  const st = r.stats || {};
  const perf = [st.roas != null ? `ROAS ${Number(st.roas).toFixed(2)}` : null, st.spend ? `${usd(st.spend)} spend` : null, st.purchases ? `${st.purchases} purchases` : null, st.percentile != null ? `${st.percentile}th pct` : null].filter(Boolean);
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_250px] gap-4 rounded-2xl p-3" style={{ background: 'var(--trk-glass-hi)' }}>
      <div className="rounded-xl overflow-hidden flex items-center justify-center" style={{ background: 'rgba(0,0,0,.35)' }}>
        {r.video
          ? <video src={r.video} poster={r.image || undefined} controls playsInline preload="metadata" className="w-full max-h-[540px] object-contain" onLoadedMetadata={(e) => setSize([e.currentTarget.videoWidth, e.currentTarget.videoHeight])} />
          : (
            <button type="button" onClick={onOpen} className="block w-full cursor-zoom-in" aria-label={`See ${r.label} full screen`}>
              <img src={r.image} alt={r.label} decoding="async" referrerPolicy="no-referrer" className="w-full max-h-[540px] object-contain"
                onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
            </button>
          )}
      </div>
      <div className="min-w-0 text-[13px] flex flex-col gap-2">
        <div className="text-[11px] uppercase tracking-wide trk-dim">{REF_KIND[r.kind] || 'Reference'}{r.format ? ` · ${r.format === 'video' ? 'video' : 'static'}` : ''}</div>
        <div className="font-semibold text-[14.5px] leading-snug break-words">{r.label}</div>
        {perf.length > 0 && <div className="trk-muted">{perf.join(' · ')}{st.account ? <span className="trk-dim"> · {st.account}</span> : null}</div>}
        {r.headline && <div><span className="trk-dim">On the ad:</span> “{r.headline}”</div>}
        {size && <div className="text-[12px] trk-dim">Original file · {size[0]} × {size[1]}</div>}
        <div className="flex flex-wrap gap-2 mt-auto pt-1">
          {r.video ? <a className="trk-btn !py-1 !text-[12px]" href={r.video} target="_blank" rel="noopener noreferrer"><Maximize2 size={12} /> Full size</a>
            : <button type="button" className="trk-btn !py-1 !text-[12px]" onClick={onOpen}><Maximize2 size={12} /> Full size</button>}
          {r.link && <a className="trk-btn !py-1 !text-[12px]" href={r.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> {r.kind === 'winner' || r.kind === 'upspring' ? 'Open in Upspring' : 'Open'}</a>}
        </div>
      </div>
    </div>
  );
}

/** Full screen, at the file's own resolution (never upscaled past it). Esc / click closes — only the viewer, not the brief. */
function RefViewer({ r, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 cursor-zoom-out" style={{ background: 'rgba(3,11,46,.92)' }} onClick={onClose} role="dialog" aria-label={r.label}>
      <img src={r.image} alt={r.label} referrerPolicy="no-referrer" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" style={{ maxWidth: 'min(96vw, 100%)', maxHeight: '92vh' }} />
      <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10" aria-label="Close"><X size={20} /></button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[12.5px] text-white/70 max-w-[90vw] truncate">{r.label}</div>
    </div>, document.body);
}
