import { useState } from 'react';
import { useDeck } from '../deck/DeckContext';
import { Reveal } from '../motion/Motion';
import { EditableText } from '../ui/Bits';

export function DeckLogo() {
  const { brand } = useDeck();
  const [failed, setFailed] = useState(false);
  if (brand?.logo_url && !failed) {
    return <img className="cr-logo-img" src={brand.logo_url} alt={brand?.name || 'Particle'} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
  }
  return <span className="cr-wordmark">{(brand?.name || 'Particle').toUpperCase()}</span>;
}

/** Slide surface: theme, layout mode, footer with logo / week / page. */
export function SlideFrame({ slide, active, children, footer = true, theme, style, className = '' }) {
  const { layout, mode, snapshot, pageOf } = useDeck();
  const th = theme || slide.options?.theme || 'dark';
  const page = pageOf ? pageOf(slide.key) : null;
  return (
    <div
      className={`cr-slide ${className}`}
      data-layout={layout}
      data-theme={th}
      data-mode={mode}
      data-active={active ? 'true' : 'false'}
      role="group"
      aria-roledescription="slide"
      aria-label={page ? `${page.index} of ${page.total}: ${slide.text?.title || slide.type}` : slide.text?.title}
      style={style}
    >
      <div className="cr-safe">{children}</div>
      {footer && (
        <div className="cr-footer">
          <DeckLogo />
          <span className="cr-footer-sep" />
          <span className="cr-footer-brand">Creative Weekly</span>
          <span className="cr-footer-sep" />
          <span>{snapshot?.week?.label}</span>
          {page && <span className="cr-footer-page">{String(page.index).padStart(2, '0')} / {String(page.total).padStart(2, '0')}</span>}
        </div>
      )}
    </div>
  );
}

/** Eyebrow + title + optional subtitle, all inline-editable in the editor. */
export function SlideHeader({ slide, align = 'left', subtitle = true, titleClass = 'cr-title', style, children }) {
  const { editText } = useDeck();
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  const t = slide.text || {};
  return (
    <div style={{ textAlign: align, display: 'flex', flexDirection: 'column', gap: 18, ...style }}>
      {'eyebrow' in t && (
        <Reveal i={0} y={14}>
          <EditableText className="cr-eyebrow" value={t.eyebrow} onCommit={set('eyebrow')} placeholder="Eyebrow" />
        </Reveal>
      )}
      <Reveal i={1}>
        <EditableText className={titleClass} value={t.title} onCommit={set('title')} placeholder="Title" />
      </Reveal>
      {subtitle && 'subtitle' in t && (t.subtitle || slide.custom || slide.type === 'person' || slide.type === 'cover') && (
        <Reveal i={2}>
          <EditableText className="cr-sub" value={t.subtitle} onCommit={set('subtitle')} placeholder="Add a subtitle" multiline />
        </Reveal>
      )}
      {children}
    </div>
  );
}
