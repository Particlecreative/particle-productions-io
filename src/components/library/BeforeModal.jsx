import { useEffect, useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { groupCommercials, CommercialRow } from './parts';

/**
 * "Before 2026": every commercial with no CP production (mostly the TV Commercials sheet), by product.
 * Editors can attach a commercial to a production — that choice sticks through every sheet sync.
 */
export default function BeforeModal({ items, productions, canEdit, onClose, onMove, onError }) {
  const [q, setQ] = useState('');
  const [product, setProduct] = useState('');
  const [onAir, setOnAir] = useState(false);
  const [market, setMarket] = useState('');
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const groups = useMemo(() => groupCommercials(items), [items]);
  const products = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(g.product || 'All products', (m.get(g.product || 'All products') || 0) + 1);
    return [...m.entries()];
  }, [groups]);
  const markets = useMemo(() => [...new Set(items.map(i => i.market).filter(Boolean))], [items]);
  const needle = q.trim().toLowerCase();
  const shown = groups.filter(g =>
    (!product || (g.product || 'All products') === product) &&
    (!onAir || g.items.some(i => i.on_air)) &&
    (!market || g.items.some(i => i.market === market)) &&
    (!needle || [g.title, g.product, g.notes, ...g.items.map(i => i.code), ...g.items.map(i => i.vanity)].filter(Boolean).some(v => String(v).toLowerCase().includes(needle))));
  const byProduct = new Map();
  for (const g of shown) {
    const k = g.product || 'All products';
    if (!byProduct.has(k)) byProduct.set(k, []);
    byProduct.get(k).push(g);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center p-0 md:p-6" style={{ background: 'rgba(3,11,46,.7)' }} onClick={onClose}>
      <div className="trk trk-canvas w-full max-w-[1400px] flex flex-col overflow-hidden !rounded-none md:!rounded-[32px]" onClick={e => e.stopPropagation()} role="dialog" aria-label="Before 2026">
        <div className="p-5 md:p-8 pb-4 flex-none">
          <div className="flex items-start gap-4">
            <div className="min-w-0">
              <div className="trk-eyebrow">The Library · commercials with no CP production</div>
              <h2 className="trk-title text-[56px] md:text-[88px] mt-2">Before 2026</h2>
              <div className="mt-1 text-[14px] trk-muted">{groups.length} commercials · {items.length} files · {items.filter(i => i.on_air).length} checked in the sheet</div>
            </div>
            <button type="button" onClick={onClose} className="trk-btn !p-2 ml-auto" aria-label="Close"><X size={16} /></button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-[360px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" />
              <input className="trk-input !pl-9 !rounded-full" placeholder="Search names, codes, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="trk-seg overflow-x-auto max-w-full">
              <button type="button" className={!product ? 'on' : ''} onClick={() => setProduct('')}>All</button>
              {products.map(([p, n]) => <button key={p} type="button" className={product === p ? 'on' : ''} onClick={() => setProduct(product === p ? '' : p)}>{p} <span className="opacity-60">{n}</span></button>)}
            </div>
            {markets.length > 1 && (
              <div className="trk-seg">
                {markets.map(m => <button key={m} type="button" className={market === m ? 'on' : ''} onClick={() => setMarket(market === m ? '' : m)}>{m}</button>)}
              </div>
            )}
            <button type="button" className="trk-btn" onClick={() => setOnAir(v => !v)} style={onAir ? { background: 'rgba(47,211,138,.18)', borderColor: 'rgba(47,211,138,.5)' } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: '#2fd38a' }} /> Checked only
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto trk-scroll px-5 md:px-8 pb-8">
          {[...byProduct.entries()].map(([p, list]) => (
            <div key={p} className="mt-5 first:mt-1">
              <div className="trk-label mb-2">{p} · {list.length}</div>
              <div className="flex flex-col gap-2">
                {list.map(g => (
                  <CommercialRow key={g.key} group={g} onError={onError} right={canEdit && (
                    <select value="" title="This commercial belongs to a CP production" className="trk-input !w-auto max-w-full !py-1 !text-[12px] flex-none"
                      onChange={(e) => e.target.value && onMove(g, e.target.value)}>
                      <option value="">Link to a production…</option>
                      {productions.map(x => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}
                    </select>
                  )} />
                ))}
              </div>
            </div>
          ))}
          {!shown.length && <div className="py-16 text-center trk-muted text-sm">{groups.length ? 'Nothing matches.' : 'Nothing here yet — connect the TV Commercials sheet from the Library.'}</div>}
        </div>
      </div>
    </div>
  );
}
