import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { X, ExternalLink, Link2, Film, Music, FileText, Plus } from 'lucide-react';
import { CATEGORY, CATEGORY_ORDER } from '../../lib/libraryService';
import { groupCommercials, FileRow, CommercialRow } from './parts';
import AddFiles from './AddFiles';

const ICON = { tv_master: Film, digital: Film, sound: Music, other: FileText };
const shortDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null);

/** One production's finals: TV masters, digital versions, sound stems, other files and the old CP links. */
export default function ProductionDrawer({ p, productions, canEdit, onClose, onSaved, onMove, onRemove, onError }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const has = (c) => p.items.some(i => i.category === c);
  const moveSelect = (group) => canEdit && (
    <select value="" title="Move to another production" className="trk-input !w-auto max-w-full !py-1 !text-[12px] flex-none"
      onChange={(e) => { const v = e.target.value; if (v) onMove(group, v === '__before' ? null : v); }}>
      <option value="">Move…</option>
      {productions.filter(x => x.id !== p.id).map(x => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}
      <option value="__before">Before 2026</option>
    </select>
  );

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose} style={{ background: 'rgba(3,11,46,.55)' }}>
      <aside className="trk trk-drawer h-full w-full max-w-[760px] overflow-y-auto trk-scroll" onClick={e => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="trk-eyebrow">{p.id} · {p.stage}{p.completed_at ? ` · completed ${shortDate(p.completed_at)}` : ''}</div>
              <h2 className="trk-title text-5xl mt-2">{p.name}</h2>
              <div className="mt-2 text-[13px] trk-muted">
                {[p.product_type?.join(' · '), p.production_type, p.delivery_date && `Delivered ${shortDate(p.delivery_date)}`, p.air_date && `On air ${shortDate(p.air_date)}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button type="button" onClick={onClose} className="trk-btn !p-2" aria-label="Close"><X size={16} /></button>
          </div>
          <div className="mt-4">
            <RouterLink to={`/production/${encodeURIComponent(p.id)}`} className="trk-btn"><ExternalLink size={14} /> Open in CP</RouterLink>
          </div>

          {CATEGORY_ORDER.filter(c => has(c) || c !== 'other').map(c => {
            const items = p.items.filter(i => i.category === c);
            const Icon = ICON[c];
            return (
              <div key={c} className="trk-section">
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={14} className="trk-muted" />
                  <span className="trk-label">{CATEGORY[c].plural} · {items.length}</span>
                  <span className="text-[11px] trk-dim">{CATEGORY[c].hint}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {groupCommercials(items).map(g => (g.items[0].source === 'sheet'
                    ? <CommercialRow key={g.key} group={g} onError={onError} right={moveSelect(g)} />
                    : g.items.map(it => <FileRow key={it.id} item={it} canEdit={canEdit} onRemove={onRemove} onError={onError} />)))}
                  {!items.length && <div className="text-[12px] trk-dim">{c === 'tv_master' ? 'No TV master yet.' : c === 'digital' ? 'No digital versions yet.' : 'No sound stems yet.'}</div>}
                </div>
              </div>
            );
          })}

          {canEdit && (
            <div className="trk-section">
              <div className="flex items-center gap-2 mb-3"><Plus size={14} className="trk-muted" /><span className="trk-label">Add files</span></div>
              <AddFiles productionId={p.id} onSaved={onSaved} />
            </div>
          )}

          {p.other_links?.length > 0 && (
            <div className="trk-section">
              <div className="flex items-center gap-2 mb-3"><Link2 size={14} className="trk-muted" /><span className="trk-label">Other links · from the production board</span></div>
              <div className="flex flex-col gap-1.5">
                {p.other_links.map(l => (
                  <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] trk-link truncate">
                    <Link2 size={12} className="flex-none trk-dim" /><span className="truncate">{l.title}</span><span className="text-[10px] trk-dim">{l.category}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
