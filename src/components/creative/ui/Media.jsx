import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Film, PenTool, Play } from 'lucide-react';
import { withAlpha } from '../deck/format';

/** Branded placeholder: product-colour gradient + discipline icon. Never a broken-image glyph. */
export function FallbackTile({ color = '#4a55ff', board = 'design', label, size = 64 }) {
  const Icon = board === 'video' ? Film : PenTool;
  return (
    <div
      className="cr-tile-fallback"
      style={{ background: `radial-gradient(120% 90% at 20% 10%, ${withAlpha(color, 0.55)}, transparent 60%), linear-gradient(160deg, #0d1a5c, #030b2e)` }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: 0.85 }}>
        <Icon size={size} strokeWidth={1.2} color="#e8ecff" />
        {label ? <span className="cr-small" style={{ maxWidth: '80%', textAlign: 'center' }}>{label}</span> : null}
      </div>
    </div>
  );
}

export function MediaImage({ src, alt = '', className = 'cr-tile-media', style, fallback, kenBurns = false, onLoad }) {
  // State is keyed by src, so a load event that lands before effects run (cached / data: URLs) is never lost
  const [st, setSt] = useState({ src: null, loaded: false, failed: false });
  const cur = st.src === src ? st : { src, loaded: false, failed: !src };
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !cur.loaded && el.complete && el.naturalWidth > 0) setSt({ src, loaded: true, failed: false });
  });
  if (cur.failed) return fallback || null;
  return (
    <>
      {!cur.loaded && <div className="cr-tile-media cr-skeleton" />}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`${className}${kenBurns ? ' cr-kenburns' : ''}`}
        style={{ opacity: cur.loaded ? 1 : 0, transition: 'opacity .5s ease', ...style }}
        onLoad={(e) => { setSt({ src, loaded: true, failed: false }); onLoad?.(e); }}
        onError={() => setSt({ src, loaded: false, failed: true })}
      />
    </>
  );
}

/**
 * Muted looping preview video. `muted` is set imperatively (React doesn't reliably reflect the
 * attribute, which breaks iOS autoplay). Falls back to the poster with a play button when autoplay
 * is refused (iOS Low Power Mode). Releases the decoder on unmount.
 */
export function MediaVideo({ src, poster, active = true, className = 'cr-tile-media', style, fallback, controls = false }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(!src);

  useEffect(() => { setFailed(!src); setBlocked(false); }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el || failed) return undefined;
    el.muted = true;
    el.defaultMuted = true;
    if (active) {
      const p = el.play();
      if (p?.catch) p.catch((e) => { if (e?.name === 'NotAllowedError') setBlocked(true); });
    } else {
      el.pause();
    }
    return undefined;
  }, [active, src, failed]);

  useEffect(() => () => {
    const el = ref.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
  }, []);

  if (failed) {
    return poster ? <MediaImage src={poster} className={className} style={style} fallback={fallback} /> : (fallback || null);
  }
  return (
    <>
      <video
        ref={ref}
        className={className}
        style={style}
        src={src}
        poster={poster || undefined}
        muted
        playsInline
        loop
        autoPlay={active}
        preload={active ? 'auto' : 'metadata'}
        disablePictureInPicture
        disableRemotePlayback
        controls={controls}
        onError={() => setFailed(true)}
      />
      {blocked && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ref.current?.play(); setBlocked(false); }}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,11,46,.35)', border: 0, cursor: 'pointer' }}
          aria-label="Play preview"
        >
          <span style={{ width: 96, height: 96, borderRadius: 99, background: 'rgba(255,255,255,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={40} color="#030b2e" fill="#030b2e" />
          </span>
        </button>
      )}
    </>
  );
}
