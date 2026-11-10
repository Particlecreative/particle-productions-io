import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2 } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import HistoryImport from './HistoryImport';
import ReviewQueue from './ReviewQueue';

const TYPES = [
  ['term', 'Approved terms', 'Exact spelling — product names, ingredients, hashtags'],
  ['rule', 'Rules', 'Instructions, e.g. “Prices always $29.99”, “Never write cure”'],
  ['do_not_flag', 'Do not flag', 'Intentional slang or creator spellings'],
  ['learned', 'Learned corrections', 'From feedback and past comments'],
  ['insight', 'Reviewer insights', '💡 Heads-up suggestions, never typo comments'],
];
const LABEL = Object.fromEntries(TYPES.map(([k, l]) => [k, l]));

/**
 * The Brain — what the Captain knows. Items are added to his instructions at check time (the AI is never retrained).
 * Anything learned automatically waits in the review queue until an admin approves it.
 */
export default function Brain({ notify, isAdmin }) {
  const [items, setItems] = useState(null);
  const [type, setType] = useState('term');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [discipline, setDiscipline] = useState('both');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setItems((await captainApi.brain()).items); } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => (items || []).filter(i => i.status === 'pending'), [items]);
  const byType = useMemo(() => {
    const m = {};
    for (const i of items || []) if (i.status === 'approved') (m[i.type] ||= []).push(i);
    return m;
  }, [items]);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy('add');
    try {
      await captainApi.addBrain({ type, title: title.trim(), content: content.trim() || null, discipline });
      setTitle(''); setContent('');
      notify('Added — used from the next check');
      load();
    } catch (err) { notify(err.message, true); } finally { setBusy(null); }
  };
  const update = async (i, patch, msg) => {
    setBusy(`u${i.id}`);
    try { await captainApi.updateBrain(i.id, patch); if (msg) notify(msg); load(); } catch (err) { notify(err.message, true); } finally { setBusy(null); }
  };
  const remove = async (i) => {
    if (!window.confirm(`Remove “${i.title}” from the Brain?`)) return;
    setBusy(`d${i.id}`);
    try { await captainApi.deleteBrain(i.id); load(); } catch (err) { notify(err.message, true); } finally { setBusy(null); }
  };

  if (!items) return <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>;
  return (
    <div className="space-y-5">
      <p className="text-sm trk-muted max-w-[760px]">The Captain “learns” by remembering what the team teaches him and what reviewers have said before. Everything here is added to his instructions on every check — the AI model itself is never retrained.</p>

      <HistoryImport notify={notify} isAdmin={isAdmin} />

      {pending.length > 0 && <ReviewQueue items={pending} isAdmin={isAdmin} notify={notify} reload={load} />}

      {isAdmin && (
        <form className="trk-glass p-5 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1.4fr)_130px_auto] items-end" onSubmit={add}>
          <label className="grid gap-1"><span className="trk-label">Type</span>
            <select className="trk-input" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="grid gap-1"><span className="trk-label">{type === 'term' ? 'Term' : 'Title'}</span>
            <input className="trk-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'term' ? 'e.g. Gravité' : type === 'rule' ? 'e.g. CTA wording' : 'e.g. obsessed!!'} />
          </label>
          <label className="grid gap-1"><span className="trk-label">{type === 'rule' ? 'The rule' : 'Note (optional)'}</span>
            <input className="trk-input" value={content} onChange={(e) => setContent(e.target.value)} placeholder={type === 'rule' ? 'e.g. The CTA must say “Shop Now”' : ''} />
          </label>
          <label className="grid gap-1"><span className="trk-label">For</span>
            <select className="trk-input" value={discipline} onChange={(e) => setDiscipline(e.target.value)}><option value="both">Video + design</option><option value="video">🎬 Video</option><option value="design">🎨 Design</option></select>
          </label>
          <button type="submit" className="trk-btn primary" disabled={busy === 'add' || !title.trim()}>{busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</button>
        </form>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {TYPES.map(([k, l, hint]) => (
          <div key={k} className="trk-glass p-5">
            <div className="flex items-baseline gap-2"><div className="trk-label">{l}</div><span className="text-[12px] trk-dim">{(byType[k] || []).length}</span></div>
            <div className="text-[12px] trk-muted mt-0.5">{hint}</div>
            <div className="mt-3 space-y-1.5">
              {!(byType[k] || []).length && <div className="text-[13px] trk-dim">Nothing yet.</div>}
              {(byType[k] || []).map(i => (
                <div key={i.id} className="flex items-start gap-2 text-[14px]" style={{ opacity: i.active ? 1 : 0.45 }}>
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold">{i.title}</span>
                    {i.discipline !== 'both' && <span className="trk-chip gray ml-2">{i.discipline === 'video' ? '🎬' : '🎨'}</span>}
                    {i.content && <div className="text-[12.5px] trk-muted">{i.content}</div>}
                  </div>
                  {isAdmin && (
                    <span className="flex gap-1 shrink-0">
                      <button type="button" className="trk-btn !py-1 !px-2 !text-[11px]" disabled={busy === `u${i.id}`} onClick={() => update(i, { active: !i.active })}>{i.active ? 'On' : 'Off'}</button>
                      <button type="button" className="trk-btn !py-1 !px-2" aria-label={`Remove ${i.title}`} disabled={busy === `d${i.id}`} onClick={() => remove(i)}><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
