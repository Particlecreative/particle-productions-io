import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, ChevronUp, ChevronDown, X, Maximize2 } from 'lucide-react';
import { studioApi } from '../../lib/studioService';

const KEY = 'cp_studio_inspiration_collapsed';
const FONT = '"Sofia Sans Extra Condensed", "Arial Narrow", sans-serif';

/** Today's movie line + a still from the same film (TMDB). Same for everyone, changes daily. */
export default function Inspiration() {
  const [d, setD] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [big, setBig] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { studioApi.inspiration().then(setD).catch(() => setD(null)); }, []);
  useEffect(() => {
    if (!big) return undefined;
    const k = (e) => { if (e.key === 'Escape') setBig(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [big]);
  const toggle = () => setCollapsed(v => { try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  if (!d) return <div className="h-[132px] rounded-3xl bg-[#030b2e]/90 animate-pulse" />;

  if (collapsed) {
    return (
      <div className="relative rounded-3xl overflow-hidden text-white flex items-center gap-3 px-6 py-4" style={{ background: '#030b2e' }}>
        <Film size={14} className="text-[#8c93ff] flex-none" />
        <span className="truncate text-base font-black uppercase" style={{ fontFamily: FONT }}>“{d.line}”</span>
        <span className="text-xs text-white/60 flex-none hidden md:inline">{d.title} · {d.year}</span>
        <button type="button" onClick={toggle} title="Show" className="ml-auto w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center flex-none"><ChevronDown size={16} /></button>
      </div>
    );
  }

  return (
    <div className="relative rounded-3xl overflow-hidden text-white md:min-h-[280px]" style={{ background: '#030b2e' }}>
      {d.image_url ? (
        // The still is never covered: on top on phones (bottom edge fades), on the right on desktop (left edge fades into the text)
        <button type="button" onClick={() => setBig(true)} title="View the still"
          className="group relative block w-full h-52 md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-[68%] cursor-zoom-in
            [-webkit-mask-image:linear-gradient(180deg,#000_65%,transparent)] [mask-image:linear-gradient(180deg,#000_65%,transparent)]
            md:[-webkit-mask-image:linear-gradient(90deg,transparent_0%,#000_28%)] md:[mask-image:linear-gradient(90deg,transparent_0%,#000_28%)]">
          <img src={d.image_url} alt={`Still from ${d.title}`} onLoad={() => setLoaded(true)}
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 30%', opacity: loaded ? 1 : 0, transform: loaded ? 'scale(1.03)' : 'scale(1)', transition: 'opacity 1s ease, transform 14s ease' }} />
          <span className="absolute bottom-3 right-4 flex items-center gap-1.5 text-[10px] text-white/70 bg-black/30 rounded-full px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={10} /> View still</span>
        </button>
      ) : (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(700px 300px at 85% -20%, rgba(8,8,248,.6), transparent 60%)' }} />
      )}
      <div className={`relative flex flex-col justify-end gap-2 px-6 pb-10 md:px-8 md:pt-8 md:max-w-[52%] md:min-h-[280px] pointer-events-none ${d.image_url ? '-mt-4 md:mt-0' : 'pt-8 min-h-[200px]'}`}>
        <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#8c93ff] flex items-center gap-2"><Film size={12} /> Line of the day</div>
        <blockquote className="text-3xl md:text-[44px] leading-[1.0] font-black uppercase" style={{ fontFamily: FONT }}>“{d.line}”</blockquote>
        <div className="text-sm text-white/80 mt-1"><span className="font-semibold text-white">{d.title}</span> · {d.year}{d.director ? ` · ${d.director}` : ''}</div>
      </div>
      {d.source === 'TMDB' && (
        <a href={d.tmdb_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 left-6 md:left-8 text-[10px] text-white/40 hover:text-white/80">Still via TMDB</a>
      )}
      <button type="button" onClick={toggle} title="Collapse" className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center backdrop-blur"><ChevronUp size={16} /></button>

      {big && d.image_url && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" style={{ background: 'rgba(2,6,26,.92)' }} onClick={() => setBig(false)}>
          <figure className="max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={d.image_url.replace('/w1280/', '/original/')} alt={`Still from ${d.title}`} className="max-w-full max-h-[78vh] rounded-xl shadow-2xl object-contain" />
            <figcaption className="text-center text-white">
              <div className="text-2xl font-black uppercase" style={{ fontFamily: FONT }}>“{d.line}”</div>
              <div className="text-sm text-white/70">{d.title} · {d.year}{d.director ? ` · ${d.director}` : ''}</div>
            </figcaption>
          </figure>
          <button type="button" onClick={() => setBig(false)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"><X size={18} /></button>
        </div>, document.body)}
    </div>
  );
}
