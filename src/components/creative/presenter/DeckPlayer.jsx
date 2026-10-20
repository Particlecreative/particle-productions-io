import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronLeft, ChevronRight, Grid3x3, Maximize2, Minimize2, X, StickyNote, Play, Pause } from 'lucide-react';
import SlideStage, { SlideThumbFrame } from '../deck/SlideStage';
import SlideRenderer from '../deck/SlideRenderer';
import DeckShell from '../deck/DeckShell';
import { useDeck, DeckProvider } from '../deck/DeckContext';
import { useDeckOverlays } from '../ui/Overlays';
import { slideVariants } from '../motion/Motion';
import { useDeckNavigation, useDeckKeys, useIdle, useWakeLock, useFullscreenState, requestFullscreen, exitFullscreen } from '../deck/hooks';

/**
 * Full-viewport deck player for live presenting and the public share link.
 * props:
 *   model        useDeckModel() result
 *   deckValue    extra DeckContext values (brand, reportId, isPublic…)
 *   variant      'present' | 'share'
 *   initialIndex starting slide
 *   onExit       () => void   (present only)
 *   channel      BroadcastChannel name for presenter-console sync
 */
export default function DeckPlayer({ model, deckValue, variant = 'present', initialIndex = 0, onExit, channel, onIndexChange }) {
  const slides = model.visible;
  const nav = useDeckNavigation(slides, { initialIndex });
  const [grid, setGrid] = useState(false);
  const [screen, setScreen] = useState(null); // 'black' | 'white' | null
  const [notes, setNotes] = useState(false);
  const [kiosk, setKiosk] = useState(false);
  const overlays = useDeckOverlays();
  const lightbox = overlays.open;
  const [digits, setDigits] = useState('');
  const idle = useIdle(2400);
  const fs = useFullscreenState();
  const slide = slides[nav.index];
  const present = variant === 'present';
  useWakeLock(present);

  // ── Presenter-console sync (same browser, any window can drive) ──
  const bc = useRef(null);
  const seq = useRef(0);
  const remote = useRef(false);
  useEffect(() => {
    if (!channel || typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(channel);
    bc.current = ch;
    ch.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'goto' && msg.seq > seq.current) {
        seq.current = msg.seq;
        remote.current = true;
        nav.setState({ index: msg.index, build: msg.build || 0, dir: msg.index >= nav.index ? 1 : -1 });
      } else if (msg.type === 'hello') {
        ch.postMessage({ type: 'goto', index: nav.index, build: nav.build, seq: ++seq.current });
      } else if (msg.type === 'screen') {
        setScreen(msg.value || null);
      }
    };
    ch.postMessage({ type: 'hello' });
    return () => { ch.close(); bc.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);
  useEffect(() => {
    onIndexChange?.(nav.index);
    if (remote.current) { remote.current = false; return; }
    bc.current?.postMessage({ type: 'goto', index: nav.index, build: nav.build, seq: ++seq.current });
  }, [nav.index, nav.build, onIndexChange]);

  // ── Kiosk / per-slide auto-advance ──
  useEffect(() => {
    const sec = slide?.options?.autoAdvanceSec || (kiosk ? 9 : 0);
    if (!sec || grid || lightbox || screen) return undefined;
    const t = setTimeout(() => { if (nav.index < slides.length - 1) nav.next(); else if (kiosk) nav.goto(0); }, sec * 1000);
    return () => clearTimeout(t);
  }, [slide, kiosk, nav, grid, lightbox, screen, slides.length]);

  // ── Preload the next two slides' images ──
  useEffect(() => {
    for (const s of slides.slice(nav.index + 1, nav.index + 3)) {
      const ids = s.vm?.items || s.vm?.tickets || s.vm?.mosaic || [];
      for (const id of ids.slice(0, 8)) {
        const it = model.snapshot?.items?.[id];
        const u = it && model.media.cover({ ...it, ...(model.overrides?.tickets?.[id] || {}) });
        if (u) { const img = new Image(); img.decoding = 'async'; img.src = u; }
      }
    }
  }, [nav.index, slides, model]);

  const toggleFs = useCallback(() => { if (fs) exitFullscreen(); else requestFullscreen(); }, [fs]);
  const exit = useCallback(() => { exitFullscreen(); onExit?.(); }, [onExit]);

  useDeckKeys({
    ArrowRight: () => nav.next(), ArrowDown: () => nav.next(), ' ': () => nav.next(), PageDown: () => nav.next(),
    Enter: () => { if (digits) { nav.goto(Number(digits) - 1); setDigits(''); } else nav.next(); },
    ArrowLeft: () => nav.prev(), ArrowUp: () => nav.prev(), PageUp: () => nav.prev(), Backspace: () => nav.prev(),
    Home: () => nav.goto(0), End: () => nav.goto(slides.length - 1, { built: true }),
    g: () => setGrid(v => !v),
    n: present ? () => setNotes(v => !v) : undefined,
    b: () => { const v = screen === 'black' ? null : 'black'; setScreen(v); bc.current?.postMessage({ type: 'screen', value: v }); },
    '.': () => { const v = screen === 'black' ? null : 'black'; setScreen(v); bc.current?.postMessage({ type: 'screen', value: v }); },
    w: () => setScreen(s => (s === 'white' ? null : 'white')),
    f: toggleFs,
    a: () => setKiosk(v => !v),
    Escape: () => {
      if (screen) { setScreen(null); return; }
      if (grid) { setGrid(false); return; }
      if (fs) { exitFullscreen(); return; }
      if (present) exit();
    },
    ...Object.fromEntries('0123456789'.split('').map(d => [d, () => setDigits(s => (s + d).slice(-3))])),
  }, { enabled: !lightbox });

  useEffect(() => { if (!digits) return undefined; const t = setTimeout(() => setDigits(''), 1800); return () => clearTimeout(t); }, [digits]);

  // ── Touch swipe ──
  const touch = useRef(null);
  const onTouchStart = (e) => { if (e.touches.length === 1 && !(window.visualViewport && window.visualViewport.scale > 1.01)) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (dx < 0) nav.next(); else nav.prev(); }
  };

  const value = useMemo(() => ({
    ...deckValue,
    mode: variant,
    layout: 'canvas',
    motionLevel: 'full',
    snapshot: model.snapshot,
    overrides: model.overrides,
    narrative: model.narrative,
    media: model.media,
    pageOf: model.pageOf,
    buildStep: nav.build,
    onTicket: overlays.api.openViewer,
    openViewer: overlays.api.openViewer,
    openProduct: overlays.api.openProduct,
  }), [deckValue, variant, model, nav.build, overlays.api]);

  const transition = slide?.options?.transition || 'push';
  const variants = slideVariants[transition] || slideVariants.push;
  const progress = slides.length ? ((nav.index + 1) / slides.length) * 100 : 0;

  return (
    <DeckShell value={value}>
      <div
        className="cr-present-root"
        data-idle={idle && !grid ? 'true' : 'false'}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={(e) => {
          // Click to advance (left 22% goes back) — but never when clicking a ticket, link or control
          if (grid || screen || lightbox) return;
          if (e.target.closest?.('.cr-clickable, a, button, video, input, textarea, [data-no-advance]')) return;
          if (e.clientX < window.innerWidth * 0.22) nav.prev(); else nav.next();
        }}
      >
        <SlideStage style={{ position: 'absolute', inset: 0 }}>
          <AnimatePresence initial={false} custom={nav.dir} mode="sync">
            {slide && (
              <m.div
                key={slide.key}
                custom={nav.dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                style={{ position: 'absolute', inset: 0 }}
              >
                <SlideRenderer slide={slide} active />
              </m.div>
            )}
          </AnimatePresence>
        </SlideStage>


        {/* HUD */}
        <div className="cr-hud" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
          <div className="cr-progress-bar" style={{ width: `${progress}%` }} />
          <div style={{ position: 'absolute', top: 18, right: 18, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
            {present && <HudBtn onClick={() => setNotes(v => !v)} active={notes} title="Speaker notes (N)"><StickyNote size={18} /></HudBtn>}
            <HudBtn onClick={() => setKiosk(v => !v)} active={kiosk} title="Auto-advance (A)">{kiosk ? <Pause size={18} /> : <Play size={18} />}</HudBtn>
            <HudBtn onClick={() => setGrid(v => !v)} active={grid} title="All slides (G)"><Grid3x3 size={18} /></HudBtn>
            <HudBtn onClick={toggleFs} title="Fullscreen (F)">{fs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</HudBtn>
            {present && onExit && <HudBtn onClick={exit} title="Exit (Esc)"><X size={18} /></HudBtn>}
          </div>
          <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
            <HudBtn onClick={() => nav.prev()} title="Previous"><ChevronLeft size={20} /></HudBtn>
            <span style={{ fontSize: 14, color: 'rgba(232,236,255,.85)', fontVariantNumeric: 'tabular-nums', background: 'rgba(3,11,46,.6)', padding: '8px 14px', borderRadius: 99, border: '1px solid rgba(255,255,255,.1)', minWidth: 110, textAlign: 'center' }}>
              {digits ? `Go to ${digits}…` : `${String(nav.index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}${slide?.section ? ` · ${slide.section}` : ''}`}
            </span>
            <HudBtn onClick={() => nav.next()} title="Next"><ChevronRight size={20} /></HudBtn>
          </div>
        </div>

        {notes && present && slide && (
          <div data-no-advance style={{ position: 'absolute', left: 24, bottom: 70, maxWidth: 560, maxHeight: '40vh', overflow: 'auto', zIndex: 6, background: 'rgba(3,11,46,.92)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, padding: '16px 20px', color: '#e8ecff', fontSize: 18, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8c93ff', marginBottom: 8 }}>Speaker notes</div>
            {slide.notes || <span style={{ opacity: 0.5 }}>No notes for this slide.</span>}
          </div>
        )}

        {grid && (
          <GridOverview slides={slides} current={nav.index} onPick={(i) => { nav.goto(i); setGrid(false); }} onClose={() => setGrid(false)} />
        )}

        {screen && <div onClick={() => setScreen(null)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: screen === 'white' ? '#fff' : '#000' }} />}
        {overlays.element}
        <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {slide ? `Slide ${nav.index + 1} of ${slides.length}: ${slide.text?.title || slide.type}` : ''}
        </div>
      </div>
    </DeckShell>
  );
}

function HudBtn({ children, onClick, title, active }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: 40, height: 40, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: '#fff', background: active ? '#4a55ff' : 'rgba(3,11,46,.62)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(8px)',
      }}
    >
      {children}
    </button>
  );
}

function GridOverview({ slides, current, onPick, onClose }) {
  const [sel, setSel] = useState(current);
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const cols = Math.max(1, Math.floor((ref.current?.clientWidth || 1200) / 330));
      const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (map[e.key]) { e.preventDefault(); e.stopImmediatePropagation(); setSel(s => Math.max(0, Math.min(slides.length - 1, s + map[e.key]))); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); onPick(sel); }
      else if (e.key === 'Escape' || e.key === 'g') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [sel, slides.length, onPick, onClose]);
  useEffect(() => { ref.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  return (
    <m.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ position: 'absolute', inset: 0, zIndex: 40, background: '#02061a', overflowY: 'auto', padding: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 22, alignContent: 'start' }}>
      {slides.map((s, i) => (
        <button key={s.key} data-i={i} type="button" onClick={() => onPick(i)}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', borderRadius: 14, outline: i === sel ? '3px solid #4a55ff' : i === current ? '2px solid rgba(255,255,255,.4)' : 'none', outlineOffset: 3 }}>
          <SlideThumbFrame width={300} style={{ borderRadius: 12 }}>
            <SlideThumb slide={s} />
          </SlideThumbFrame>
          <div style={{ color: 'rgba(232,236,255,.8)', fontSize: 13, marginTop: 8, display: 'flex', gap: 8 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#8c93ff' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.text?.title || s.type}</span>
          </div>
        </button>
      ))}
    </m.div>
  );
}

/** Static thumbnail render (no motion, no video) — reuses the surrounding DeckContext. */
export function SlideThumb({ slide }) {
  return <ThumbContext><SlideRenderer slide={slide} active={false} /></ThumbContext>;
}

function ThumbContext({ children }) {
  const ctx = useDeck();
  const value = useMemo(() => ({ ...ctx, mode: 'thumb', motionLevel: 'static', editable: false, onTicket: undefined, openViewer: undefined, openProduct: undefined, editText: undefined, editBullets: undefined, editBody: undefined }), [ctx]);
  return <DeckProvider value={value}>{children}</DeckProvider>;
}
