import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Play, Star } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { initials, ensureContrast, withAlpha, formatBadge } from '../deck/format';
import { MediaImage, MediaVideo, FallbackTile } from './Media';

// ── Avatar ──────────────────────────────────────────────────────────────────
export function Avatar({ person, size = 72, ring }) {
  const [failed, setFailed] = useState(false);
  const photo = person?.photo && !failed ? person.photo : null;
  return (
    <span className="cr-avatar" style={{ width: size, height: size, fontSize: size * 0.38, boxShadow: ring ? `0 0 0 ${Math.max(2, size / 28)}px ${ring}` : undefined }}>
      {photo ? <img src={photo} alt="" onError={() => setFailed(true)} referrerPolicy="no-referrer" /> : initials(person?.name)}
    </span>
  );
}

// ── Chips ───────────────────────────────────────────────────────────────────
export function ProductChip({ product, small }) {
  if (!product?.label || product.label === '-') return null;
  const c = ensureContrast(product.color || '#8c93ff', '#030b2e', 2.6);
  return (
    <span className="cr-chip" style={{ borderColor: withAlpha(c, 0.45), background: withAlpha(c, 0.12), fontSize: small ? '0.78em' : undefined }}>
      <span className="cr-chip-dot" style={{ background: c }} />
      {product.label}
    </span>
  );
}

export function StatusChip({ status }) {
  if (!status?.label) return null;
  const c = status.color || '#8c93ff';
  return (
    <span className="cr-chip" style={{ borderColor: withAlpha(c, 0.5), background: withAlpha(c, 0.16) }}>
      <span className="cr-chip-dot" style={{ background: c }} />
      {status.label}
    </span>
  );
}

const SOURCE_STYLE = {
  monday: { label: 'Monday', dots: ['#ff3d57', '#ffcb00', '#00ca72'] },
  frame: { label: 'Frame.io', dots: ['#7b61ff'] },
  dropbox: { label: 'Dropbox', dots: ['#0061fe'] },
  figma: { label: 'Figma', dots: ['#f24e1e', '#a259ff', '#1abcfe'] },
};

/** Ticket source links (Monday / Frame.io / Dropbox / Figma). Hidden on public links unless allowed. */
export function SourceLinks({ item, size = 'small' }) {
  const links = [
    ['monday', item?.monday_url],
    ['frame', item?.links?.frame],
    ['dropbox', item?.links?.dropbox],
    ['figma', item?.links?.figma],
  ].filter(([, u]) => !!u);
  if (!links.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {links.map(([k, url]) => (
        <a
          key={k}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="cr-chip"
          style={{ fontSize: size === 'small' ? '0.72em' : undefined, textDecoration: 'none', padding: '0.22em 0.6em' }}
        >
          <span style={{ display: 'inline-flex', gap: 2 }}>
            {SOURCE_STYLE[k].dots.map((d, i) => <span key={i} className="cr-chip-dot" style={{ background: d, width: '0.42em', height: '0.42em' }} />)}
          </span>
          {SOURCE_STYLE[k].label}
        </a>
      ))}
    </span>
  );
}

// ── Delta + sparkline ───────────────────────────────────────────────────────
export function DeltaBadge({ value, invert = false, suffix = 'vs last week' }) {
  if (value == null) return null;
  const good = invert ? value < 0 : value > 0;
  const flat = value === 0;
  const color = flat ? 'var(--cr-mute)' : good ? 'var(--cr-good)' : 'var(--cr-bad)';
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="cr-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
      <Icon size={22} strokeWidth={2.4} />
      <span className="cr-num" style={{ fontWeight: 700 }}>{flat ? '0' : `${value > 0 ? '+' : ''}${value}`}</span>
      <span style={{ color: 'var(--cr-faint)', fontWeight: 400 }}>{suffix}</span>
    </span>
  );
}

export function Sparkline({ values = [], width = 300, height = 72, color = '#4a55ff', highlightLast = true }) {
  const { motionLevel } = useDeck();
  const gid = `sg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const vals = values.map(v => (Number.isFinite(v) ? v : 0));
  if (vals.length < 2) return null;
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const pad = 6;
  const pts = vals.map((v, i) => [pad + (i * (width - pad * 2)) / (vals.length - 1), height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg className="cr-spark" data-animate={motionLevel !== 'static'} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path className="cr-spark-line" d={d} pathLength="1" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {highlightLast && <circle cx={last[0]} cy={last[1]} r="7" fill="#fff" stroke={color} strokeWidth="3.5" />}
    </svg>
  );
}

// ── Media sources behind a ticket (from its media refs, so it works on share links too) ──
const SOURCE_OF_KIND = { frameio: 'frameio', dropbox_folder: 'dropbox', dropbox_file: 'dropbox', figma: 'figma', monday_asset: 'monday' };
export const SOURCE_META = {
  frameio: { label: 'Frame.io', dots: ['#7b61ff'] },
  dropbox: { label: 'Dropbox', dots: ['#0061fe'] },
  figma: { label: 'Figma', dots: ['#f24e1e', '#a259ff', '#1abcfe'] },
  monday: { label: 'Monday files', dots: ['#ff3d57', '#ffcb00', '#00ca72'] },
};

/** [{ source, refs: [refId] }] in presenting order: designs lead with Figma/Dropbox, videos with Frame.io. */
export function sourcesOf(item, snapshot) {
  const by = new Map();
  for (const refId of item?.media_refs || []) {
    const s = SOURCE_OF_KIND[snapshot?.media_refs?.[refId]?.kind];
    if (!s) continue;
    if (!by.has(s)) by.set(s, []);
    by.get(s).push(refId);
  }
  const order = item?.board === 'design' ? ['figma', 'dropbox', 'frameio', 'monday'] : ['frameio', 'dropbox', 'figma', 'monday'];
  return order.filter(s => by.has(s)).map(s => ({ source: s, refs: by.get(s) }));
}

function SourceDots({ source, size }) {
  return (
    <span style={{ display: 'inline-flex', gap: Math.max(1, size * 0.08) }}>
      {SOURCE_META[source].dots.map((d, i) => <span key={i} style={{ width: size * 0.32, height: size * 0.32, borderRadius: 99, background: d }} />)}
    </span>
  );
}

/** Small round buttons that open the ticket's files inside the deck (never navigates away). */
export function SourceButtons({ item, size = 34 }) {
  const { snapshot, openViewer, mode } = useDeck();
  const list = sourcesOf(item, snapshot).filter(s => s.source !== 'monday');
  if (!list.length || mode === 'thumb') return null;
  return (
    <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }} data-no-advance>
      {list.map(s => (
        <button
          key={s.source}
          type="button"
          className="cr-src-btn"
          title={`Open ${SOURCE_META[s.source].label}`}
          aria-label={`Open ${SOURCE_META[s.source].label}`}
          onClick={openViewer ? (e) => { e.stopPropagation(); openViewer(item, s.source); } : undefined}
          style={{ width: size, height: size }}
        >
          <SourceDots source={s.source} size={size} />
        </button>
      ))}
    </span>
  );
}

/** Product label that opens every ticket of that product (division / person scoped). */
export function ProductButton({ product, color, count, filter, size = 'small', style }) {
  const { openProduct, mode } = useDeck();
  if (!product) return null;
  const c = ensureContrast(color || '#8c93ff', '#030b2e', 2.6);
  const clickable = !!openProduct && mode !== 'thumb';
  const Tag = clickable ? 'button' : 'span'; // thumbnails live inside rail buttons
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      className={`cr-chip ${clickable ? 'cr-chip-btn' : ''}`}
      onClick={clickable ? (e) => { e.stopPropagation(); openProduct({ ...filter, product }); } : undefined}
      style={{ borderColor: withAlpha(c, 0.45), background: withAlpha(c, 0.12), fontSize: size === 'small' ? 'calc(var(--t-small) * .9)' : 'var(--t-body)', cursor: clickable ? 'pointer' : 'default', ...style }}
    >
      <span className="cr-chip-dot" style={{ background: c }} />
      {product}
      {count != null && <span className="cr-num" style={{ opacity: 0.75, fontWeight: 700 }}>{count}</span>}
    </Tag>
  );
}

// ── Ticket tile ─────────────────────────────────────────────────────────────
/**
 * Work tile built for a TV across the room: the whole creative is shown (contain, never cropped)
 * over a soft blur of itself; caption sits below the image; chrome stays small.
 */
export function TicketTile({ item, active = true, showTitle = true, showLinks = true, onClick, style, className = '', titleClamp = 2, big = false }) {
  const { media, mode } = useDeck();
  if (!item) return null;
  const poster = media.cover(item);
  const vid = media.video(item);
  const badge = formatBadge(item);
  const tv = item.division === 'tv' || (!item.division && /^(tv|special project)/i.test(item.department?.label || ''));
  const fallback = <FallbackTile color={item.product?.color || '#4a55ff'} board={item.board} size={big ? 96 : 56} />;
  const productLabel = item.product?.label && item.product.label !== '-' ? item.product.label : null;
  return (
    <div
      className={`cr-tile cr-tile2 ${onClick ? 'cr-clickable' : ''} ${className}`}
      data-highlight={item.highlighted ? 'true' : 'false'}
      style={style}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(item); } : undefined}
    >
      <div className="cr-tile2-media">
        {poster && <div className="cr-tile2-backdrop" style={{ backgroundImage: `url("${poster}")` }} />}
        {/* Only hero-size tiles autoplay; gallery tiles show the poster (the viewer plays the full video) */}
        {vid && big && mode !== 'thumb' && active
          ? <MediaVideo src={vid} poster={poster} active={active} className="cr-tile2-img" fallback={fallback} />
          : <MediaImage src={poster} className="cr-tile2-img" fallback={fallback} />}
        <span style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
          {badge && <span className="cr-tile-badge" style={{ position: 'static' }}>{badge}</span>}
          {tv && <span className="cr-tile-badge" style={{ position: 'static', background: '#ff8a3d', color: '#1a0b00' }}>TV</span>}
        </span>
        {!(vid && big && active) && media.kindOf(item) === 'video' && (
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: big ? 76 : 48, height: big ? 76 : 48, borderRadius: 99, background: 'rgba(3,11,46,.5)', border: '1px solid rgba(255,255,255,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
            <Play size={big ? 32 : 20} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
          </span>
        )}
        {item.highlighted && (
          <span style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 99, background: '#4a55ff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(8,8,248,.6)' }}>
            <Star size={17} color="#fff" fill="#fff" />
          </span>
        )}
      </div>
      {showTitle && (
        <div className="cr-tile2-cap">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={`cr-clamp-${titleClamp}`} style={{ fontWeight: 700, fontSize: big ? 'var(--t-body)' : 'calc(var(--t-small) * 1.02)', lineHeight: 1.18, color: 'var(--cr-white)' }}>
              {item.caption || item.title}
            </div>
            {(item.subtitle || productLabel) && (
              <div className="cr-clamp-1" style={{ marginTop: 4, fontSize: 'calc(var(--t-small) * 0.8)', color: 'var(--cr-mute)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {productLabel && <span className="cr-chip-dot" style={{ background: ensureContrast(item.product?.color || '#8c93ff', '#030b2e', 2.6), width: 10, height: 10 }} />}
                <span className="cr-clamp-1">{[productLabel, item.subtitle].filter(Boolean).join(' · ')}</span>
              </div>
            )}
          </div>
          {showLinks && <SourceButtons item={item} size={big ? 38 : 30} />}
        </div>
      )}
    </div>
  );
}

// ── Inline editable text (edit mode only) ──────────────────────────────────
/**
 * Uncontrolled contentEditable: DOM text is only synced while unfocused, so the caret never jumps.
 * Enter commits (unless multiline), Esc reverts, blur commits. Paste is forced to plain text.
 */
export function EditableText({ value, onCommit, placeholder = 'Click to edit', as: Tag = 'div', className = '', style, multiline = false, dir = 'auto' }) {
  const { editable } = useDeck();
  const ref = useRef(null);
  const focused = useRef(false);

  useEffect(() => {
    if (ref.current && !focused.current && ref.current.textContent !== (value ?? '')) ref.current.textContent = value ?? '';
  }, [value]);

  if (!editable || !onCommit) return <Tag className={className} style={style} dir={dir}>{value}</Tag>;

  const commit = () => {
    const next = (ref.current?.textContent ?? '').replace(/ /g, ' ').trim();
    if (next !== (value ?? '').trim()) onCommit(next);
  };
  return (
    <Tag
      ref={ref}
      className={`${className} cr-editable`}
      style={style}
      dir={dir}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); ref.current?.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); if (ref.current) ref.current.textContent = value ?? ''; ref.current?.blur(); }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, multiline ? t : t.replace(/\s*\n+\s*/g, ' '));
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
