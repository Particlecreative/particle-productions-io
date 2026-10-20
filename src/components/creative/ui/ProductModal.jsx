import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { m } from 'motion/react';
import { useDeck } from '../deck/DeckContext';
import { TicketTile } from './Bits';
import { decorate, productBreakdown } from '../slides/specs';
import { DIVISIONS } from '../slides/divisions';
import { displayName, ensureContrast } from '../deck/format';

/**
 * Drill-down from a product label: every ticket of that product in the division (or for one person),
 * grouped delivered / in progress / planned. Clicking a tile opens its files in the viewer.
 */
export default function ProductModal({ filter, onClose, onOpenItem }) {
  const { snapshot, overrides } = useDeck();
  const groups = useMemo(() => productBreakdown(snapshot, overrides, filter), [snapshot, overrides, filter]);
  const sample = groups[0]?.ids?.[0] ? snapshot.items[groups[0].ids[0]] : null;
  const color = ensureContrast(sample?.product?.color || '#8c93ff', '#030b2e', 2.6);
  const person = filter.uid ? snapshot.people?.[filter.uid] : null;
  const total = groups.reduce((a, g) => a + g.ids.length, 0);

  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('[data-cr-viewer-open]')) return; // the file viewer on top handles keys first
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      else if ([' ', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Enter', 'Backspace', 'Home', 'End', 'g', 'b', '.', 'w', 'f', 'a', 'n'].includes(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="cr-deck cr-overlay" data-no-advance style={{ position: 'fixed', inset: 0, zIndex: 125 }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,26,.94)', backdropFilter: 'blur(10px)', overflowY: 'auto' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1500, margin: '0 auto', padding: '28px 28px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
            <span style={{ width: 18, height: 18, borderRadius: 99, background: color, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8c93ff', fontWeight: 600 }}>
                {person ? displayName(person.name) : DIVISIONS[filter.division]?.label || 'All'} · {total} {total === 1 ? 'project' : 'projects'}
              </div>
              <div style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 52, lineHeight: 0.95, textTransform: 'uppercase', color: '#fff' }}>{filter.product}</div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ width: 42, height: 42, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}><X size={20} /></button>
          </div>
          {groups.map(g => (
            <section key={g.key} style={{ marginBottom: 30 }}>
              <div style={{ fontSize: 13, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(232,236,255,.65)', fontWeight: 600, marginBottom: 12 }}>{g.label} · {g.ids.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                {g.ids.map(id => {
                  const it = decorate(snapshot, overrides, id);
                  return (
                    <div key={id} style={{ position: 'relative', aspectRatio: '4 / 5' }}>
                      <TicketTile item={it} onClick={onOpenItem} style={{ position: 'absolute', inset: 0 }} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {!groups.length && <div style={{ color: 'rgba(232,236,255,.6)', fontSize: 16, padding: '40px 0' }}>Nothing else for this product right now.</div>}
        </div>
      </m.div>
    </div>,
    document.body
  );
}
