import { Sparkles } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, m, EASE } from '../motion/Motion';
import { EditableText } from '../ui/Bits';
import { MediaImage } from '../ui/Media';
import { SlideFrame, SlideHeader, DeckLogo } from './SlideFrame';
import { decorate } from './specs';

// ── Cover ───────────────────────────────────────────────────────────────────
export function CoverSlide({ slide, active }) {
  const { snapshot, overrides, media, editText, layout, motionLevel } = useDeck();
  const { vm, text } = slide;
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  const mosaic = slide.options.mosaic !== false ? vm.mosaic.map(id => decorate(snapshot, overrides, id)) : [];
  const year = vm.week?.year;
  return (
    <SlideFrame slide={slide} active={active}>
      {mosaic.length > 0 && (
        <div className="cr-hide-sm" style={{ position: 'absolute', inset: '-4% -4% -4% 38%', zIndex: 0, overflow: 'hidden' }}>
          <div className={motionLevel === 'static' ? '' : 'cr-drift'} style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '1fr', gap: 14, transform: 'rotate(-6deg) scale(1.15)', transformOrigin: 'center' }}>
            {Array.from({ length: 16 }, (_, i) => mosaic[i % mosaic.length]).map((it, i) => (
              <m.div
                key={i}
                className="cr-tile"
                initial={motionLevel === 'static' ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 0.85, scale: 1 }}
                transition={{ duration: 1.2, ease: EASE, delay: 0.15 + (i % 8) * 0.06 }}
                style={{ borderRadius: 18 }}
              >
                <MediaImage src={media.cover(it)} fallback={<div className="cr-tile-media" style={{ background: it?.product?.color || '#0a1445', opacity: 0.4 }} />} />
              </m.div>
            ))}
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #030b2e 0%, rgba(3,11,46,.92) 22%, rgba(3,11,46,.55) 55%, rgba(3,11,46,.75) 100%)' }} />
        </div>
      )}
      <div className="cr-col" style={{ position: 'relative', zIndex: 1, height: '100%', justifyContent: 'space-between' }}>
        <div className="cr-col" style={{ gap: 26, maxWidth: layout === 'canvas' ? 1100 : '100%', marginTop: layout === 'canvas' ? 40 : 0 }}>
          <Reveal i={0} y={14}>
            <EditableText className="cr-eyebrow" value={text.eyebrow} onCommit={set('eyebrow')} placeholder="Eyebrow" />
          </Reveal>
          <Reveal i={1} y={40}>
            <EditableText className="cr-display" value={text.title} onCommit={set('title')} placeholder="Title" style={{ fontSize: 'calc(var(--t-display) * 1.25)' }} />
          </Reveal>
          <Reveal i={2}>
            <div className="cr-h3 cr-num" style={{ color: '#fff', fontWeight: 300, fontFamily: 'var(--cr-font-sub)' }}>
              {vm.week?.label}{year ? `, ${year}` : ''}{vm.week?.partial ? <span className="cr-small" style={{ marginLeft: 16 }}>· week in progress</span> : null}
            </div>
          </Reveal>
          <Reveal i={3}>
            <EditableText className="cr-sub" value={text.subtitle} onCommit={set('subtitle')} placeholder="Prepared for…" />
          </Reveal>
        </div>
        <div className="cr-row cr-keep-row" style={{ gap: layout === 'canvas' ? 72 : 28, marginBottom: layout === 'canvas' ? 8 : 48, marginTop: layout === 'canvas' ? 0 : 40 }}>
          {vm.kpis.map((k, i) => (
            <Reveal key={k.key} i={4 + i} y={30}>
              <div className="cr-col" style={{ gap: 10 }}>
                <CountUp className="cr-kpi-num" value={k.value} delay={0.5 + i * 0.12} style={{ fontSize: 'calc(var(--t-kpi) * 0.78)' }} />
                <span className="cr-small" style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>{k.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Bullet list (shared by exec summary, updates, closing) ──────────────────
export function BulletList({ slide, bullets, numbered = true, size = 'var(--t-h3)', startI = 2, max = 7 }) {
  const { editBullets } = useDeck();
  const builds = slide.options?.builds;
  const commit = (idx) => (editBullets ? (v) => {
    const next = [...bullets];
    if (v) next[idx] = v; else next.splice(idx, 1);
    editBullets(slide.key, next);
  } : undefined);
  return (
    <div className="cr-col" style={{ gap: 26 }}>
      {bullets.slice(0, max).map((b, idx) => (
        <Reveal key={idx} i={startI + idx} build={builds ? idx + 1 : 0} x={-24} y={0}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            {numbered ? (
              <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: `calc(${size} * 1.3)`, color: 'var(--cr-electric-ink)', minWidth: '1.4em', lineHeight: 1 }}>
                {String(idx + 1).padStart(2, '0')}
              </span>
            ) : (
              <span style={{ width: 14, height: 14, borderRadius: 99, background: 'var(--cr-electric-ink)', flex: 'none', transform: 'translateY(-0.2em)' }} />
            )}
            <EditableText value={typeof b === 'string' ? b : b.text} onCommit={commit(idx)} multiline
              style={{ fontSize: size, lineHeight: 1.28, fontWeight: 500, color: 'var(--cr-ice)', flex: 1 }} placeholder="Empty bullet (deleted on save)" />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

// ── Executive summary ───────────────────────────────────────────────────────
export function ExecSummarySlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 96, height: '100%' }}>
        <div className="cr-col cr-fixed-sm" style={{ width: layout === 'canvas' ? 560 : 'auto', flex: 'none', justifyContent: 'space-between' }}>
          <SlideHeader slide={slide} />
          {vm.source === 'ai' && (
            <Reveal i={3}>
              <span className="cr-chip" style={{ alignSelf: 'flex-start' }}><Sparkles size={18} /> Written with Claude from this week’s data</span>
            </Reveal>
          )}
        </div>
        <div className="cr-col cr-fill" style={{ justifyContent: 'center' }}>
          <BulletList slide={slide} bullets={vm.bullets} />
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Section divider ─────────────────────────────────────────────────────────
export function SectionSlide({ slide, active }) {
  const { editText, layout } = useDeck();
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  return (
    <SlideFrame slide={slide} active={active} theme={slide.options.theme || 'electric'}>
      <div className="cr-row" style={{ height: '100%', alignItems: 'center', gap: 80 }}>
        {slide.vm.number ? (
          <Reveal i={0} y={60} scale={0.9}>
            <div style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: layout === 'canvas' ? 520 : 200, lineHeight: 0.8, color: '#030b2e', letterSpacing: '-0.03em' }}>
              {slide.vm.number}
            </div>
          </Reveal>
        ) : null}
        <div className="cr-col" style={{ gap: 24 }}>
          <Reveal i={1}>
            <EditableText className="cr-display" value={slide.text.title} onCommit={set('title')} placeholder="Section title" />
          </Reveal>
          <Reveal i={2}>
            <EditableText className="cr-sub" value={slide.text.subtitle} onCommit={set('subtitle')} placeholder="Subtitle" style={{ color: 'rgba(255,255,255,.82)' }} />
          </Reveal>
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Custom slide ────────────────────────────────────────────────────────────
export function CustomSlide({ slide, active }) {
  const { editBody, snapshot, overrides, media, layout } = useDeck();
  const img = slide.vm.imageItem && snapshot.items?.[slide.vm.imageItem] ? decorate(snapshot, overrides, slide.vm.imageItem) : null;
  const withImage = slide.options.layout === 'image' && img;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 80, height: '100%' }}>
        <div className="cr-col cr-fill" style={{ gap: 40 }}>
          <SlideHeader slide={slide} />
          <Reveal i={3}>
            <EditableText
              value={slide.vm.body}
              onCommit={editBody ? (v) => editBody(slide.key, v) : undefined}
              multiline
              placeholder="Write anything — notes, an announcement, a decision you need."
              style={{ fontSize: 'var(--t-h3)', lineHeight: 1.35, whiteSpace: 'pre-wrap', color: 'var(--cr-ice)', fontWeight: 400 }}
            />
          </Reveal>
        </div>
        {withImage && (
          <Reveal i={4} className="cr-tile cr-ratio-sm" style={{ position: 'relative', width: layout === 'canvas' ? 720 : '100%', flex: 'none', height: '100%' }}>
            <MediaImage src={media.cover(img)} kenBurns />
          </Reveal>
        )}
      </div>
    </SlideFrame>
  );
}

// ── Closing ─────────────────────────────────────────────────────────────────
export function ClosingSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  return (
    <SlideFrame slide={slide} active={active} footer={false}>
      <div className="cr-row" style={{ height: '100%', gap: 96 }}>
        <div className="cr-col cr-fixed-sm" style={{ width: layout === 'canvas' ? 640 : 'auto', flex: 'none', justifyContent: 'space-between' }}>
          <SlideHeader slide={slide} />
          <Reveal i={6}><div style={{ transform: 'scale(1.6)', transformOrigin: 'left bottom' }}><DeckLogo /></div></Reveal>
        </div>
        <div className="cr-col cr-fill" style={{ justifyContent: 'center' }}>
          <BulletList slide={slide} bullets={vm.bullets} numbered={false} />
        </div>
      </div>
    </SlideFrame>
  );
}
