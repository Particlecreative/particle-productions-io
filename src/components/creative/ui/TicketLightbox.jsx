import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ExternalLink, Clock, Layers, User } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useDeck } from '../deck/DeckContext';
import { MediaImage, MediaVideo, FallbackTile } from './Media';
import { ProductChip, SourceLinks, StatusChip, Avatar } from './Bits';
import { displayName, fmtDays, shortDate } from '../deck/format';
import { creativeApi } from '../../../lib/creativeReportService';

/**
 * Full-screen ticket view (presenter + share page): media carousel + facts + source links.
 * Internally (not on share links) it can browse every file behind the ticket's Dropbox / Frame.io links.
 */
export default function TicketLightbox({ item, onClose }) {
  const { media, snapshot, reportId, isPublic } = useDeck();
  const [files, setFiles] = useState(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
    setFiles(null);
    if (!item) return undefined;
    let alive = true;
    const base = [];
    if (item.cover?.refId) base.push({ refId: item.cover.refId, key: item.cover.key, kind: item.cover.kind || 'image', name: 'Cover' });
    for (const g of item.gallery || []) base.push({ ...g, name: g.name || '' });
    if (!base.length) base.push({ auto: true, kind: media.kindOf(item) || 'image', name: '' });
    setFiles(base);
    if (isPublic || media.fixture) return undefined;
    // Internal: browse every file behind the ticket's media links
    (async () => {
      const extra = [];
      for (const refId of item.media_refs || []) {
        const r = snapshot.media_refs?.[refId];
        if (!r || ['figma', 'link'].includes(r.kind)) continue;
        try {
          const res = await creativeApi.mediaListing(reportId, refId);
          for (const e of (res.entries || []).slice(0, 24)) {
            if (e.kind === 'image' || e.kind === 'video') extra.push({ refId, key: e.key, kind: e.kind, name: e.name });
          }
        } catch { /* listing is best-effort */ }
      }
      if (alive && extra.length) {
        setFiles(prev => {
          const seen = new Set((prev || []).map(f => `${f.refId}|${f.key}`));
          return [...(prev || []), ...extra.filter(f => !seen.has(`${f.refId}|${f.key}`))];
        });
      }
    })();
    return () => { alive = false; };
  }, [item, isPublic, media, reportId, snapshot]);

  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); setIdx(i => Math.min((files?.length || 1) - 1, i + 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); setIdx(i => Math.max(0, i - 1)); }
      else if ([' ', 'PageDown', 'PageUp', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, files, onClose]);

  const current = files?.[idx];
  const people = useMemo(() => (item?.people || []).map(p => snapshot.people?.[p]).filter(Boolean), [item, snapshot]);

  if (!item) return null;
  const fallback = <FallbackTile color={item.product?.color} board={item.board} size={120} label={item.title} />;
  let mediaEl;
  if (!current || current.auto) {
    const vid = media.video(item);
    mediaEl = vid
      ? <MediaVideo src={vid} poster={media.cover(item)} active controls className="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 18 }} fallback={fallback} />
      : <MediaImage src={media.cover(item)} className="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 18 }} fallback={fallback} />;
  } else if (current.kind === 'video') {
    mediaEl = <MediaVideo src={media.ref(current.refId, current.key, 'play')} poster={media.ref(current.refId, current.key, 'thumb')} active controls className="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 18 }} fallback={fallback} />;
  } else {
    mediaEl = <MediaImage src={media.ref(current.refId, current.key, 'full')} className="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 18 }} fallback={<MediaImage src={media.ref(current.refId, current.key, 'thumb')} className="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} fallback={fallback} />} />;
  }

  const turnaround = item.delivered_at && item.created_at ? (item.delivered_at - Date.parse(item.created_at)) / 86400000 : null;

  return createPortal(
    <div className="cr-deck" style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
      <AnimatePresence>
        <m.div
          key="lb"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,26,.92)', backdropFilter: 'blur(10px)', display: 'flex', padding: 'min(4vw, 48px)', gap: 'min(3vw, 40px)', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 600px', minWidth: 0, minHeight: '50vh', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
            <m.div key={idx} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
              style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {mediaEl}
            </m.div>
            {files?.length > 1 && (
              <>
                <button type="button" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous file" style={navBtn('left')}><ChevronLeft size={28} /></button>
                <button type="button" onClick={() => setIdx(i => Math.min(files.length - 1, i + 1))} disabled={idx >= files.length - 1} aria-label="Next file" style={navBtn('right')}><ChevronRight size={28} /></button>
                <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: 'rgba(232,236,255,.7)' }}>
                  {idx + 1} / {files.length}{current?.name ? ` · ${current.name}` : ''}
                </div>
              </>
            )}
          </div>
          <div onClick={e => e.stopPropagation()} style={{ flex: '0 1 420px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 18, color: '#e8ecff', fontSize: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: '#fff', borderRadius: 99, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8c93ff', fontWeight: 600 }}>{item.board === 'video' ? 'Video' : 'Design'}{item.type?.label ? ` · ${item.type.label}` : ''}</div>
            <div style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 44, lineHeight: 0.95, textTransform: 'uppercase', color: '#fff' }}>{item.caption || item.title}</div>
            {item.subtitle && <div style={{ color: 'rgba(232,236,255,.7)' }}>{item.subtitle}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 15 }}>
              <ProductChip product={item.product} />
              <StatusChip status={item.status} />
              {item.platform && <span className="cr-chip">{item.platform}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {item.delivered_at && <Fact icon={Clock} label="Delivered" value={shortDate(new Date(item.delivered_at).toISOString().slice(0, 10))} />}
              {turnaround != null && <Fact icon={Clock} label="Turnaround" value={fmtDays(turnaround)} />}
              {item.versions != null && <Fact icon={Layers} label="Versions" value={item.versions} />}
              {item.deadline && <Fact icon={Clock} label="Deadline" value={shortDate(item.deadline)} />}
            </div>
            {people.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {people.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar person={{ ...p, name: displayName(p.name) }} size={40} />
                    <div><div style={{ fontWeight: 600 }}>{displayName(p.name)}</div><div style={{ fontSize: 13, color: 'rgba(232,236,255,.6)' }}><User size={12} style={{ display: 'inline' }} /> {p.role === 'video' ? 'Video editor' : 'Designer'}</div></div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 15 }}><SourceLinks item={item} size="normal" /></div>
            {item.monday_url && (
              <a href={item.monday_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#8c93ff', fontSize: 14 }}>
                Open the Monday ticket <ExternalLink size={14} />
              </a>
            )}
          </div>
        </m.div>
      </AnimatePresence>
    </div>,
    document.body
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(232,236,255,.55)', display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={12} /> {label}</div>
      <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: '#fff' }}>{value}</div>
    </div>
  );
}

function navBtn(side) {
  return {
    position: 'absolute', top: '50%', [side]: 8, transform: 'translateY(-50%)', width: 56, height: 56, borderRadius: 99,
    background: 'rgba(3,11,46,.7)', border: '1px solid rgba(255,255,255,.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  };
}
