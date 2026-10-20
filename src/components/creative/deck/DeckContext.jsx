import { createContext, useContext } from 'react';

const DeckCtx = createContext(null);

export function DeckProvider({ value, children }) {
  return <DeckCtx.Provider value={value}>{children}</DeckCtx.Provider>;
}

export function useDeck() {
  const ctx = useContext(DeckCtx);
  if (!ctx) throw new Error('useDeck must be used inside <DeckProvider>');
  return ctx;
}

const MEDIA_BASE = '/api/creative-reports/m';

/**
 * Media URL builder. URLs are always under /api/ (the service worker caches everything else),
 * gated by a report-scoped token. Fixture mode (offline dev) returns inline SVG thumbnails.
 */
export function makeMedia({ reportId, token, snapshot, picks = {} }) {
  const fixture = token === 'fixture';
  const q = `?mt=${encodeURIComponent(token || '')}`;
  const ref = (refId, key, variant = 'thumb') => {
    if (fixture) return snapshot?.items?.[snapshot?.media_refs?.[refId]?.item_id]?.fixture_thumb || null;
    return `${MEDIA_BASE}/${reportId}/${refId}/${encodeURIComponent(key || '_')}/${variant}${q}`;
  };
  const itemThumb = (id) => {
    if (fixture) return snapshot?.items?.[id]?.fixture_thumb || null;
    return `${MEDIA_BASE}/${reportId}/item/${encodeURIComponent(id)}/thumb${q}`;
  };
  /** Best still for a ticket: chosen cover → auto pick. */
  const cover = (item) => {
    if (!item) return null;
    if (item.cover?.refId) return ref(item.cover.refId, item.cover.key, 'thumb');
    if (!item.media_refs?.length && !fixture) return null;
    return itemThumb(item.id);
  };
  /** Playable video URL if the ticket's best visual is a video (needs picks). */
  const video = (item) => {
    if (fixture || !item) return null;
    if (item.cover?.refId && item.cover.kind === 'video') return ref(item.cover.refId, item.cover.key, 'play');
    if (item.cover?.refId) return null;
    const p = picks?.[item.id];
    return p && p.kind === 'video' ? ref(p.refId, p.key, 'play') : null;
  };
  const kindOf = (item) => item?.cover?.kind || picks?.[item?.id]?.kind || null;
  return { ref, itemThumb, cover, video, kindOf, fixture };
}
