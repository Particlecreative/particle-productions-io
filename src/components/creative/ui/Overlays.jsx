import { useCallback, useMemo, useState } from 'react';
import MediaViewer from './MediaViewer';
import ProductModal from './ProductModal';

/**
 * In-deck windows (file viewer + product drill-down). The page puts `api` into the deck context
 * and renders `<Host />` inside its DeckShell, so overlays inherit media, snapshot and share scope.
 */
export function useDeckOverlays() {
  const [viewer, setViewer] = useState(null);
  const [product, setProduct] = useState(null);
  const openViewer = useCallback((item, source) => setViewer({ item, source }), []);
  const openProduct = useCallback((filter) => setProduct(filter), []);
  const api = useMemo(() => ({ openViewer, openProduct }), [openViewer, openProduct]);
  const open = !!(viewer || product);
  const element = (
    <>
      {product && <ProductModal filter={product} onClose={() => setProduct(null)} onOpenItem={(it) => setViewer({ item: it })} />}
      {viewer && (
        <span data-cr-viewer-open>
          <MediaViewer item={viewer.item} source={viewer.source} onClose={() => setViewer(null)} />
        </span>
      )}
    </>
  );
  return { api, open, element };
}
