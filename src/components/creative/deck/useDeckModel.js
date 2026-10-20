import { useMemo } from 'react';
import { buildDeck, visibleSlides } from './buildDeck';
import { makeMedia } from './DeckContext';

/** report + overrides → resolved slides, visible slides, page lookup and media URL builder. */
export function useDeckModel({ report, overrides, mediaToken, picks }) {
  const snapshot = report?.snapshot;
  const narrative = report?.narrative;
  const template = report?.template;
  const ov = overrides ?? report?.overrides ?? {};

  const slides = useMemo(
    () => (snapshot ? buildDeck(template, snapshot, ov, narrative) : []),
    [template, snapshot, ov, narrative]
  );
  const visible = useMemo(() => visibleSlides(slides), [slides]);
  const pageIndex = useMemo(() => {
    const m = new Map();
    visible.forEach((s, i) => m.set(s.key, i + 1));
    return m;
  }, [visible]);
  const pageOf = useMemo(() => (key) => {
    const i = pageIndex.get(key);
    return i ? { index: i, total: visible.length } : null;
  }, [pageIndex, visible.length]);
  const media = useMemo(
    () => makeMedia({ reportId: report?.id, token: mediaToken, snapshot, picks }),
    [report?.id, mediaToken, snapshot, picks]
  );
  return { slides, visible, pageOf, media, snapshot, narrative, overrides: ov };
}
