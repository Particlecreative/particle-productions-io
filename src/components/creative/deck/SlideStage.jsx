import { useLayoutEffect, useRef, useState } from 'react';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/**
 * Fits a fixed 1920×1080 logical canvas into its parent (letterboxed, centred) with a CSS transform,
 * so slides render identically on a laptop, a TV and a 4K monitor.
 * No will-change: it would rasterise at 1× and blur on large screens.
 */
export default function SlideStage({ children, className = '', style, inset = 0, onScale }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ s: 0, x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.max(0, el.clientWidth - inset * 2);
      const h = Math.max(0, el.clientHeight - inset * 2);
      const s = Math.min(w / STAGE_W, h / STAGE_H);
      const next = { s, x: inset + (w - STAGE_W * s) / 2, y: inset + (h - STAGE_H * s) / 2 };
      setBox(prev => (Math.abs(prev.s - next.s) < 1e-4 && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next));
      onScale?.(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inset, onScale]);

  return (
    <div ref={ref} className={className} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      {box.s > 0 && (
        <div
          style={{
            position: 'absolute', left: 0, top: 0, width: STAGE_W, height: STAGE_H,
            transformOrigin: '0 0', transform: `translate(${box.x}px, ${box.y}px) scale(${box.s})`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Fixed-scale thumbnail of a slide (no observers — cheap for rails and grids). */
export function SlideThumbFrame({ width, children, className = '', style }) {
  const s = width / STAGE_W;
  return (
    <div className={className} style={{ position: 'relative', width, height: STAGE_H * s, overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE_W, height: STAGE_H, transformOrigin: '0 0', transform: `scale(${s})`, pointerEvents: 'none' }}>
        {children}
      </div>
    </div>
  );
}
