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

// ── Ticket tile ─────────────────────────────────────────────────────────────
export function TicketTile({ item, active = true, showTitle = true, showLinks = true, onClick, style, className = '', titleClamp = 2, big = false }) {
  const { media, mode } = useDeck();
  if (!item) return null;
  const poster = media.cover(item);
  const vid = media.video(item);
  const badge = formatBadge(item);
  const fallback = <FallbackTile color={item.product?.color || '#4a55ff'} board={item.board} size={big ? 96 : 56} />;
  return (
    <div
      className={`cr-tile ${onClick ? 'cr-clickable' : ''} ${className}`}
      data-highlight={item.highlighted ? 'true' : 'false'}
      style={style}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(item); } : undefined}
    >
      {/* Only hero-size tiles autoplay; gallery tiles show the poster frame (opens full video in the lightbox) */}
      {vid && big && mode !== 'thumb' && active
        ? <MediaVideo src={vid} poster={poster} active={active} fallback={fallback} />
        : <MediaImage src={poster} fallback={fallback} kenBurns={big} />}
      {showTitle && <div className="cr-tile-shade" />}
      {badge && <span className="cr-tile-badge">{badge}</span>}
      {!(vid && big && active) && media.kindOf(item) === 'video' && (
        <span style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)', width: big ? 96 : 60, height: big ? 96 : 60, borderRadius: 99, background: 'rgba(3,11,46,.55)', border: '1px solid rgba(255,255,255,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
          <Play size={big ? 40 : 24} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
        </span>
      )}
      {item.highlighted && (
        <span style={{ position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: 99, background: '#4a55ff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(8,8,248,.6)' }}>
          <Star size={20} color="#fff" fill="#fff" />
        </span>
      )}
      {showTitle && (
        <div className="cr-tile-body">
          <div className={`cr-clamp-${titleClamp}`} style={{ fontWeight: 700, fontSize: big ? 'var(--t-h3)' : 'calc(var(--t-small) * 1.05)', lineHeight: 1.18, color: '#fff' }}>
            {item.caption || item.title}
          </div>
          {(item.subtitle || item.product?.label) && (
            <div className="cr-clamp-1" style={{ marginTop: 6, fontSize: big ? 'var(--t-small)' : 'calc(var(--t-small) * 0.82)', color: 'rgba(232,236,255,.72)' }}>
              {[item.product?.label !== '-' ? item.product?.label : null, item.subtitle].filter(Boolean).join(' · ')}
            </div>
          )}
          {showLinks && <div style={{ marginTop: 10 }}><SourceLinks item={item} /></div>}
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
