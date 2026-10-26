import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Check, Archive } from 'lucide-react';
import { libraryApi, PROMPT_BOXES } from '../../lib/libraryService';
import AddFiles from './AddFiles';
import '../tracker/tracker.css';

/** "PRD26-20 is completed — where are the finals?" TV master, digital versions, sound stems as Dropbox links. */
export default function CompletionPrompt({ productionId, remaining, onDone }) {
  const [p, setP] = useState(null);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    let alive = true;
    libraryApi.production(productionId).then(({ production, can_edit: canEdit }) => {
      if (!alive) return;
      // Already in the Library (or not allowed to add) — nothing to ask
      if (!canEdit || !production || production.items.some(i => i.category === 'tv_master' || i.category === 'digital')) onDone();
      else setP(production);
    }).catch(() => alive && onDone());
    return () => { alive = false; };
  }, [productionId, onDone]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onDone(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onDone]);

  if (!p) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" style={{ background: 'rgba(3,11,46,.72)' }}>
      <div className="trk trk-canvas w-full max-w-[720px] max-h-[94vh] overflow-y-auto trk-scroll p-6 md:p-8" role="dialog" aria-label={`Add ${p.name} to the Library`}>
        <div className="flex items-center gap-2 trk-eyebrow"><Archive size={13} /> The Library{remaining > 0 ? ` · ${remaining} more after this` : ''}</div>
        <h2 className="trk-title text-[44px] md:text-[56px] mt-2">{p.name} is completed</h2>
        <p className="mt-2 text-[14px] trk-muted">Add its finals so everyone can pull them from the Library — paste the Dropbox links. A whole folder works too: the files are sorted by their names.</p>
        {saved ? (
          <div className="mt-6 flex flex-col gap-4">
            <div className="trk-chip green !text-[13px] !px-3 !py-2 self-start"><Check size={14} /> {saved} file{saved > 1 ? 's' : ''} added to the Library</div>
            <div className="flex gap-2">
              <RouterLink to={`/library?p=${encodeURIComponent(p.id)}`} className="trk-btn primary" onClick={onDone}>Open in the Library</RouterLink>
              <button type="button" className="trk-btn" onClick={onDone}>Done</button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <AddFiles productionId={p.id} boxes={PROMPT_BOXES} saveLabel="Save to the Library" onCancel={onDone}
              onSaved={(prod) => setSaved(prod?.items?.length || 1)} />
            <div className="mt-3 text-[11px] trk-dim">Choose “Later” and it waits under “Completed — waiting for the finals” in the Library.</div>
          </div>
        )}
      </div>
    </div>
  );
}
