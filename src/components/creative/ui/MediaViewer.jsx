import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Info, Loader2, AlertTriangle, ExternalLink, Clock, Layers, Star } from 'lucide-react';
import { m } from 'motion/react';
import { useDeck } from '../deck/DeckContext';
import { MediaImage, MediaVideo, FallbackTile } from './Media';
import { ProductChip, StatusChip, Avatar, sourcesOf, SOURCE_META } from './Bits';
import { displayName, fmtDays, shortDate } from '../deck/format';
import { creativeApi } from '../../../lib/creativeReportService';

const SOURCE_LINK = { frameio: 'frame', dropbox: 'dropbox', figma: 'figma' };

/**
 * In-deck viewer: every file behind a ticket's Frame.io / Dropbox / Figma / Monday links, browsed
 * inside the presentation (never sends the room to another site). Works on share links too —
 * listings come from the share-scoped endpoint there.
 */
export default function MediaViewer({ item, source: initialSource, onClose }) {
  const { media, snapshot, reportId, isPublic, shareToken } = useDeck();
  const sources = useMemo(() => {
    const list = sourcesOf(item, snapshot);
    const chosen = [];
    if (item.cover?.refId) chosen.push({ refId: item.cover.refId, key: item.cover.key, kind: item.cover.kind || 'image', name: item.cover.name || 'Cover' });
    for (const g of item.gallery || []) if (!chosen.some(c => c.refId === g.refId && c.key === g.key)) chosen.push(g);
    return chosen.length ? [{ source: 'selected', refs: [], files: chosen }, ...list] : list;
  }, [item, snapshot]);
  const [tab, setTab] = useState(() => (initialSource && sources.some(s => s.source === initialSource) ? initialSource : sources[0]?.source || null));
  const [listings, setListings] = useState({});
  const [idx, setIdx] = useState(0);
  const [details, setDetails] = useState(!initialSource);
  const strip = useRef(null);

  // Load every ref of the active source
  useEffect(() => {
    const s = sources.find(x => x.source === tab);
    if (!s || s.files) return undefined;
    let alive = true;
    for (const refId of s.refs) {
      if (listings[refId]) continue;
      setListings(l => ({ ...l, [refId]: { loading: true } }));
      const load = media.fixture
        ? import('../dev/fixtureStore').then(f => f.listing(reportId, refId))
        : isPublic ? creativeApi.publicListing(shareToken, refId) : creativeApi.mediaListing(reportId, refId);
      load.then(res => alive && setListings(l => ({ ...l, [refId]: { entries: res?.entries || [], error: res?.error || null } })))
        .catch(e => alive && setListings(l => ({ ...l, [refId]: { entries: [], error: e.message } })));
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sources]);
  useEffect(() => { setIdx(0); }, [tab]);

  const current = sources.find(x => x.source === tab);
  const loading = current && !current.files && current.refs.some(r => !listings[r] || listings[r].loading);
  const errors = current && !current.files ? current.refs.map(r => listings[r]?.error).filter(Boolean) : [];
  const files = useMemo(() => {
    if (!current) return [];
    if (current.files) return current.files;
    const out = [];
    for (const refId of current.refs) {
      for (const e of listings[refId]?.entries || []) {
        if (e.kind === 'image' || e.kind === 'video') out.push({ refId, key: e.key, kind: e.kind, name: e.name, version: e.version, preferred: e.preferred });
      }
    }
    // Finals / exports first, then newest version
    return out.sort((a, b) => (Number(!!b.preferred) - Number(!!a.preferred)) || ((b.version || 0) - (a.version || 0))).slice(0, 80);
  }, [current, listings]);
  const file = files[Math.min(idx, Math.max(0, files.length - 1))];

  // Figma without an API token (or a frame the API can't render): embed the live file instead
  const figmaRef = tab === 'figma' && !isPublic ? snapshot.media_refs?.[current?.refs?.[0]] : null;
  const figmaEmbed = figmaRef?.url && !loading && !files.length ? `https://www.figma.com/embed?embed_host=particle-cp&url=${encodeURIComponent(figmaRef.url)}` : null;

  useEffect(() => {
    const onKey = (e) => {
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'Escape') { stop(); onClose(); }
      else if (e.key === 'ArrowRight') { stop(); setIdx(i => Math.min(files.length - 1, i + 1)); }
      else if (e.key === 'ArrowLeft') { stop(); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        stop();
        const i = sources.findIndex(s => s.source === tab);
        const n = sources[(i + (e.key === 'ArrowDown' ? 1 : -1) + sources.length) % sources.length];
        if (n) setTab(n.source);
      } else if (e.key === 'i') { stop(); setDetails(v => !v); }
      else if ([' ', 'PageDown', 'PageUp', 'Enter', 'Backspace', 'Home', 'End', 'g', 'b', '.', 'w', 'f', 'a', 'n'].includes(e.key)) stop();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [files.length, onClose, sources, tab]);
  useEffect(() => { strip.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }, [idx]);

  const fallback = <FallbackTile color={item.product?.color} board={item.board} size={120} label={item.title} />;
  let stage;
  if (figmaEmbed) {
    stage = <iframe title="Figma" src={figmaEmbed} allowFullScreen style={{ width: '100%', height: '100%', border: 0, borderRadius: 16, background: '#1e1e1e' }} />;
  } else if (!current) {
    const vid = media.video(item);
    stage = vid
      ? <MediaVideo src={vid} poster={media.cover(item)} active controls className="" style={fit} fallback={fallback} />
      : <MediaImage src={media.cover(item)} className="" style={fit} fallback={fallback} />;
  } else if (loading && !files.length) {
    stage = <span style={{ color: 'rgba(232,236,255,.6)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 16 }}><Loader2 size={20} style={{ animation: 'cr-spin 1s linear infinite' }} /> Loading {SOURCE_META[tab]?.label || 'files'}…</span>;
  } else if (!file) {
    stage = (
      <div style={{ textAlign: 'center', color: 'rgba(232,236,255,.75)', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', fontSize: 16 }}>
        <AlertTriangle size={28} color="#fdab3d" />
        <div>{errors[0] ? friendlyError(tab, errors[0]) : `No images or videos behind this ${SOURCE_META[tab]?.label || ''} link.`}</div>
        {!isPublic && item.links?.[SOURCE_LINK[tab]] && (
          <a href={item.links[SOURCE_LINK[tab]]} target="_blank" rel="noopener noreferrer" style={{ color: '#8c93ff', fontSize: 14, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Open in {SOURCE_META[tab]?.label} <ExternalLink size={13} />
          </a>
        )}
      </div>
    );
  } else if (file.kind === 'video') {
    stage = <MediaVideo key={`${file.refId}|${file.key}`} src={media.ref(file.refId, file.key, 'play')} poster={media.ref(file.refId, file.key, 'thumb')} active controls className="" style={fit} fallback={fallback} />;
  } else {
    stage = (
      <MediaImage key={`${file.refId}|${file.key}`} src={media.ref(file.refId, file.key, 'full')} className="" style={fit}
        fallback={<MediaImage src={media.ref(file.refId, file.key, 'thumb')} className="" style={fit} fallback={fallback} />} />
    );
  }

  const people = (item.people || []).map(p => snapshot.people?.[p]).filter(Boolean);
  const turnaround = item.delivered_at && item.created_at ? (item.delivered_at - Date.parse(item.created_at)) / 86400000 : null;

  return createPortal(
    <div className="cr-deck cr-overlay" data-no-advance style={{ position: 'fixed', inset: 0, zIndex: 130 }} onClick={(e) => e.stopPropagation()}>
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,26,.96)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar: title + source tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8c93ff', fontWeight: 600 }}>
              {item.board === 'video' ? 'Video' : 'Design'}{item.product?.label && item.product.label !== '-' ? ` · ${item.product.label}` : ''}
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.caption || item.title}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sources.map(s => (
              <button key={s.source} type="button" onClick={() => setTab(s.source)} style={tabStyle(tab === s.source)}>
                {s.source === 'selected'
                  ? <><Star size={13} fill={tab === s.source ? '#fff' : 'none'} /> Selected</>
                  : <><span style={{ display: 'inline-flex', gap: 2 }}>{SOURCE_META[s.source].dots.map((d, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 9, background: d }} />)}</span>{SOURCE_META[s.source].label}{s.source === 'monday' ? ' (references)' : ''}</>}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <IconBtn onClick={() => setDetails(v => !v)} active={details} title="Details (i)"><Info size={18} /></IconBtn>
            <IconBtn onClick={onClose} title="Close (Esc)"><X size={18} /></IconBtn>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Stage */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: figmaEmbed ? 16 : '20px 72px' }}>
              <m.div key={`${tab}|${file?.refId}|${file?.key}`} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
                style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stage}
              </m.div>
              {files.length > 1 && (
                <>
                  <button type="button" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous file" style={navBtn('left', idx === 0)}><ChevronLeft size={26} /></button>
                  <button type="button" onClick={() => setIdx(i => Math.min(files.length - 1, i + 1))} disabled={idx >= files.length - 1} aria-label="Next file" style={navBtn('right', idx >= files.length - 1)}><ChevronRight size={26} /></button>
                </>
              )}
            </div>
            {/* Filmstrip */}
            {files.length > 1 && (
              <div ref={strip} style={{ flex: 'none', display: 'flex', gap: 8, padding: '10px 20px 14px', overflowX: 'auto', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                {files.map((f, i) => (
                  <button key={`${f.refId}|${f.key}`} data-i={i} type="button" onClick={() => setIdx(i)} title={f.name}
                    style={{ flex: 'none', width: 92, height: 72, borderRadius: 10, overflow: 'hidden', padding: 0, cursor: 'pointer', position: 'relative', background: '#0a1445', border: i === idx ? '2px solid #4a55ff' : '1px solid rgba(255,255,255,.12)', opacity: i === idx ? 1 : 0.72 }}>
                    <img src={media.ref(f.refId, f.key, 'thumb')} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    {f.kind === 'video' && <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,0,0,.7)', color: '#fff' }}>▶</span>}
                  </button>
                ))}
              </div>
            )}
            <div style={{ flex: 'none', textAlign: 'center', fontSize: 13, color: 'rgba(232,236,255,.55)', padding: '0 0 10px' }}>
              {file ? `${idx + 1} / ${files.length}${file.name ? ` · ${file.name}` : ''}` : ''}
              {loading && files.length > 0 ? ' · loading more…' : ''}
            </div>
          </div>

          {/* Details */}
          {details && (
            <div style={{ flex: '0 0 340px', borderLeft: '1px solid rgba(255,255,255,.08)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', color: '#e8ecff', fontSize: 15 }}>
              {item.subtitle && <div style={{ color: 'rgba(232,236,255,.7)' }}>{item.subtitle}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                <ProductChip product={item.product} />
                <StatusChip status={item.status} />
                {item.platform && <span className="cr-chip">{item.platform}</span>}
                {item.type?.label && <span className="cr-chip">{item.type.label}</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {item.delivered_at && <Fact icon={Clock} label="Delivered" value={shortDate(new Date(item.delivered_at).toISOString().slice(0, 10))} />}
                {turnaround != null && <Fact icon={Clock} label="Turnaround" value={fmtDays(turnaround)} />}
                {item.versions != null && <Fact icon={Layers} label="Versions" value={item.versions} />}
                {item.deadline && <Fact icon={Clock} label="Deadline" value={shortDate(item.deadline)} />}
              </div>
              {people.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar person={{ ...p, name: displayName(p.name) }} size={38} />
                  <div><div style={{ fontWeight: 600 }}>{displayName(p.name)}</div><div style={{ fontSize: 12, color: 'rgba(232,236,255,.6)' }}>{p.role === 'video' ? 'Video editor' : 'Designer'}</div></div>
                </div>
              ))}
              {!isPublic && item.monday_url && (
                <a href={item.monday_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#8c93ff', fontSize: 13, marginTop: 'auto' }}>
                  Open the Monday ticket <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </div>
      </m.div>
    </div>,
    document.body
  );
}

const fit = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 14, boxShadow: '0 30px 80px -20px rgba(0,0,0,.7)' };

function friendlyError(source, msg) {
  if (source === 'frameio' && /not linked to an adobe id|not connected|reconnect/i.test(msg)) return 'Frame.io isn’t connected yet, so the cut can’t be previewed here.';
  if (source === 'figma' && /token|403|not configured/i.test(msg)) return 'Figma previews need an access token (Settings).';
  return msg;
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(232,236,255,.55)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={11} /> {label}</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginTop: 3, color: '#fff' }}>{value}</div>
    </div>
  );
}

function IconBtn({ children, onClick, title, active }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      style={{ width: 38, height: 38, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', background: active ? '#4a55ff' : 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>
      {children}
    </button>
  );
}

function tabStyle(on) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 99, cursor: 'pointer',
    color: on ? '#fff' : 'rgba(232,236,255,.75)', background: on ? '#4a55ff' : 'rgba(255,255,255,.05)', border: `1px solid ${on ? '#4a55ff' : 'rgba(255,255,255,.12)'}`,
  };
}

function navBtn(side, disabled) {
  return {
    position: 'absolute', top: '50%', [side]: 14, transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 99,
    background: 'rgba(3,11,46,.75)', border: '1px solid rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
  };
}
