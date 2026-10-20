import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MonitorPlay, RotateCcw } from 'lucide-react';
import DeckShell from '../deck/DeckShell';
import SlideStage, { SlideThumbFrame } from '../deck/SlideStage';
import SlideRenderer from '../deck/SlideRenderer';
import { useDeckKeys } from '../deck/hooks';

/**
 * Presenter console (second window): current + next slide, speaker notes, timer, clock.
 * Synced with the audience window over BroadcastChannel; either window can drive.
 */
export default function PresenterConsole({ model, deckValue, channel }) {
  const slides = model.visible;
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [fontSize, setFontSize] = useState(22);
  const bc = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(channel);
    bc.current = ch;
    ch.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'goto' && msg.seq > seq.current) { seq.current = msg.seq; setIndex(msg.index); }
    };
    ch.postMessage({ type: 'hello' });
    return () => ch.close();
  }, [channel]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const go = (i) => {
    const idx = Math.max(0, Math.min(slides.length - 1, i));
    setIndex(idx);
    bc.current?.postMessage({ type: 'goto', index: idx, build: 0, seq: ++seq.current });
  };
  useDeckKeys({
    ArrowRight: () => go(index + 1), ' ': () => go(index + 1), PageDown: () => go(index + 1),
    ArrowLeft: () => go(index - 1), PageUp: () => go(index - 1),
    Home: () => go(0), End: () => go(slides.length - 1),
  });

  const value = useMemo(() => ({
    ...deckValue, mode: 'thumb', layout: 'canvas', motionLevel: 'static', snapshot: model.snapshot, overrides: model.overrides,
    narrative: model.narrative, media: model.media, pageOf: model.pageOf, buildStep: 99,
  }), [deckValue, model]);

  const elapsed = Math.floor((now - startedAt) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const cur = slides[index];
  const next = slides[index + 1];

  return (
    <DeckShell value={value}>
      <div style={{ position: 'fixed', inset: 0, background: '#02061a', color: '#e8ecff', display: 'grid', gridTemplateColumns: '1.6fr 1fr', gridTemplateRows: 'auto 1fr auto', gap: 18, padding: 18 }}>
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 16, fontSize: 15 }}>
          <MonitorPlay size={18} color="#8c93ff" />
          <b>Presenter console</b>
          <span style={{ opacity: 0.6 }}>Slide {index + 1} of {slides.length}{cur?.section ? ` · ${cur.section}` : ''}</span>
          <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontSize: 28, fontWeight: 700 }}>{mm}:{ss}</span>
          <button type="button" onClick={() => setStartedAt(Date.now())} title="Reset timer" style={btn}><RotateCcw size={16} /></button>
          <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style={{ minHeight: 0, borderRadius: 16, overflow: 'hidden', border: '2px solid #4a55ff' }}>
          <SlideStage style={{ width: '100%', height: '100%', background: '#000' }}>
            {cur && <SlideRenderer slide={cur} active={false} />}
          </SlideStage>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8c93ff' }}>Next</div>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,.14)', flex: 'none' }}>
            {next ? <SlideThumbFrame width={420}><SlideRenderer slide={next} active={false} /></SlideThumbFrame> : <div style={{ padding: 30, opacity: 0.5 }}>End of deck</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8c93ff' }}>Notes</div>
            <button type="button" style={{ ...btn, marginLeft: 'auto' }} onClick={() => setFontSize(s => Math.max(14, s - 2))}>A−</button>
            <button type="button" style={btn} onClick={() => setFontSize(s => Math.min(40, s + 2))}>A+</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontSize, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: 16 }}>
            {cur?.notes || <span style={{ opacity: 0.45 }}>No notes. Add them under the canvas in the editor.</span>}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', paddingBottom: 4 }}>
          <button type="button" style={btn} onClick={() => go(index - 1)}><ChevronLeft size={18} /></button>
          {slides.map((s, i) => (
            <button key={s.key} type="button" onClick={() => go(i)}
              style={{ flex: 'none', padding: 0, border: 0, borderRadius: 8, overflow: 'hidden', outline: i === index ? '2px solid #4a55ff' : '1px solid rgba(255,255,255,.12)', cursor: 'pointer', background: 'none' }}>
              <SlideThumbFrame width={128}><SlideRenderer slide={s} active={false} /></SlideThumbFrame>
            </button>
          ))}
          <button type="button" style={btn} onClick={() => go(index + 1)}><ChevronRight size={18} /></button>
        </div>
      </div>
    </DeckShell>
  );
}

const btn = { background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
