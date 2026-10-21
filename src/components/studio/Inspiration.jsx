import { useEffect, useState } from 'react';
import { Film, ChevronUp, ChevronDown } from 'lucide-react';
import { studioApi } from '../../lib/studioService';

const KEY = 'cp_studio_inspiration_collapsed';

/** Today's movie line + a still from the same film (TMDB). Same for everyone, changes daily. */
export default function Inspiration() {
  const [d, setD] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  useEffect(() => { studioApi.inspiration().then(setD).catch(() => setD(null)); }, []);
  const toggle = () => setCollapsed(v => { try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  if (!d) return <div className="h-[132px] rounded-3xl bg-[#030b2e]/90 animate-pulse" />;
  return (
    <div className="relative rounded-3xl overflow-hidden text-white" style={{ background: '#030b2e', minHeight: collapsed ? 64 : 210, transition: 'min-height .5s cubic-bezier(.16,1,.3,1)' }}>
      {d.image_url && (
        <img src={d.image_url} alt={`Still from ${d.title}`} onLoad={() => setLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 1.2s ease, transform 20s ease', transform: loaded ? 'scale(1.06)' : 'scale(1)' }} />
      )}
      <div className="absolute inset-0" style={{ background: d.image_url
        ? 'linear-gradient(90deg, rgba(3,11,46,.92) 0%, rgba(3,11,46,.7) 45%, rgba(3,11,46,.15) 100%)'
        : 'radial-gradient(700px 300px at 85% -20%, rgba(8,8,248,.6), transparent 60%), #030b2e' }} />
      <div className={`relative flex ${collapsed ? 'items-center' : 'flex-col justify-end'} gap-2 px-7 ${collapsed ? 'py-4' : 'pt-7 pb-6'} h-full`} style={{ minHeight: collapsed ? 64 : 210 }}>
        <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-[#8c93ff] flex items-center gap-2 flex-none">
          <Film size={12} /> Line of the day
        </div>
        <blockquote className={`${collapsed ? 'text-base truncate ml-3' : 'text-3xl md:text-[40px] leading-[1.02] max-w-3xl'} font-black uppercase`}
          style={{ fontFamily: '"Sofia Sans Extra Condensed", "Arial Narrow", sans-serif', letterSpacing: '.005em' }}>
          “{d.line}”
        </blockquote>
        {!collapsed && (
          <div className="text-sm text-white/80">
            <span className="font-semibold text-white">{d.title}</span> · {d.year}{d.director ? ` · ${d.director}` : ''}
          </div>
        )}
      </div>
      {!collapsed && d.source === 'TMDB' && (
        <a href={d.tmdb_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-4 text-[10px] text-white/45 hover:text-white/80">Still via TMDB</a>
      )}
      <button type="button" onClick={toggle} title={collapsed ? 'Show' : 'Collapse'}
        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
    </div>
  );
}
