import { useMemo, useState } from 'react';
import { Check, X, Pencil, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import { relTime } from './util';

const TYPE_LABEL = { term: 'Term', rule: 'Rule', learned: 'Learned', do_not_flag: 'Do not flag', insight: 'Insight' };
const OUTCOME = { fixed: ['✅', 'fixed in the next version'], partly: ['◐', 'partly fixed'], not_fixed: ['✗', 'not fixed'], cant_tell: ['–', "couldn't tell"] };
const PAGE = 40;

/**
 * Everything the Captain learned on his own (history import, ❌ feedback) waits here. Sorted by how often the team
 * said it; each item shows its evidence — who, which products, real example comments and whether they got fixed.
 * Nothing here is used until an admin approves it.
 */
export default function ReviewQueue({ items, isAdmin, notify, reload }) {
  const [type, setType] = useState('all');
  const [disc, setDisc] = useState('all');
  const [q, setQ] = useState('');
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(null);
  const [shown, setShown] = useState(PAGE);

  const counts = useMemo(() => {
    const m = { all: items.length };
    for (const i of items) m[i.type] = (m[i.type] || 0) + 1;
    return m;
  }, [items]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter(i => type === 'all' || i.type === type)
      .filter(i => disc === 'all' || i.discipline === disc || i.discipline === 'both')
      .filter(i => !expiredOnly || i.evidence?.possibly_expired)
      .filter(i => !s || `${i.title} ${i.content || ''} ${(i.evidence?.products || []).join(' ')} ${(i.evidence?.reviewers || []).join(' ')}`.toLowerCase().includes(s))
      .sort((a, b) => (b.evidence?.count || 1) - (a.evidence?.count || 1) || String(a.title).localeCompare(String(b.title)));
  }, [items, type, disc, q, expiredOnly]);

  const visible = list.slice(0, shown);
  const allSelected = list.length > 0 && list.every(i => sel.has(i.id));
  const toggle = (id) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleOpen = (id) => setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = async (ids, status) => {
    if (!ids.length) return;
    if (ids.length > 1 && !window.confirm(`${status === 'approved' ? 'Approve' : 'Reject'} ${ids.length} items?`)) return;
    setBusy(status);
    try {
      await captainApi.bulkBrain(ids, status);
      notify(`${ids.length} item${ids.length === 1 ? '' : 's'} ${status === 'approved' ? 'approved — used from the next check' : 'rejected'}`);
      setSel(new Set());
      await reload();
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const saveEdit = async () => {
    setBusy(`e${edit.id}`);
    try {
      await captainApi.updateBrain(edit.id, { title: edit.title, content: edit.content, discipline: edit.discipline, status: 'approved' });
      notify('Edited and approved');
      setEdit(null);
      await reload();
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };

  return (
    <div className="trk-glass p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <div className="trk-label">Review queue · {items.length}</div>
        <span className="text-[13px] trk-muted">Learned automatically — nothing here is used until it’s approved. Most-said first.</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {['all', 'rule', 'term', 'learned', 'do_not_flag', 'insight'].filter(k => k === 'all' || counts[k]).map(k => (
          <button key={k} type="button" className={`trk-btn !py-1 !px-3 !text-[12px] ${type === k ? 'primary' : ''}`} onClick={() => { setType(k); setShown(PAGE); }}>
            {k === 'all' ? 'All' : TYPE_LABEL[k]} <span className="opacity-60">{counts[k] || 0}</span>
          </button>
        ))}
        <select className="trk-input !py-1 !text-[12px] !w-auto" value={disc} onChange={(e) => setDisc(e.target.value)} aria-label="Video or design">
          <option value="all">Video + design</option><option value="video">🎬 Video</option><option value="design">🎨 Design</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12px] trk-muted"><input type="checkbox" checked={expiredOnly} onChange={(e) => setExpiredOnly(e.target.checked)} /> Possibly expired offers</label>
        <label className="ml-auto flex items-center gap-1.5 trk-input !py-1 !w-[220px]">
          <Search size={13} className="trk-dim" />
          <input className="bg-transparent outline-none text-[13px] w-full" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search" />
        </label>
      </div>

      {isAdmin && list.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 py-2" style={{ borderTop: '1px solid var(--trk-line)' }}>
          <label className="flex items-center gap-1.5 text-[12px] trk-muted">
            <input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(list.map(i => i.id)))} />
            {sel.size ? `${sel.size} selected` : `Select all ${list.length}`}
          </label>
          <button type="button" className="trk-btn !py-1.5" disabled={!sel.size || !!busy} onClick={() => bulk([...sel], 'approved')}>{busy === 'approved' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve selected</button>
          <button type="button" className="trk-btn !py-1.5" disabled={!sel.size || !!busy} onClick={() => bulk([...sel], 'rejected')}>{busy === 'rejected' ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Reject selected</button>
        </div>
      )}

      <div className="mt-1">
        {!list.length && <div className="py-4 text-[13px] trk-dim">Nothing matches.</div>}
        {visible.map(i => {
          const ev = i.evidence || {};
          const isOpen = open.has(i.id);
          const editing = edit?.id === i.id;
          return (
            <div key={i.id} className="py-3" style={{ borderTop: '1px solid var(--trk-line)' }}>
              <div className="flex items-start gap-3">
                {isAdmin && <input type="checkbox" className="mt-1.5" checked={sel.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.title}`} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="trk-chip gray">{TYPE_LABEL[i.type] || i.type}</span>
                    {i.discipline !== 'both' && <span className="trk-chip gray">{i.discipline === 'video' ? '🎬 Video' : '🎨 Design'}</span>}
                    {ev.count > 1 && <span className="trk-chip">×{ev.count}</span>}
                    {ev.confidence && <span className={`trk-chip ${ev.confidence === 'high' ? 'green' : ev.confidence === 'low' ? 'amber' : 'gray'}`}>{ev.confidence}</span>}
                    {ev.possibly_expired && <span className="trk-chip amber">⚠️ possibly expired</span>}
                  </div>
                  {editing ? (
                    <div className="mt-2 grid gap-2">
                      <input className="trk-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                      <textarea className="trk-input min-h-[64px]" value={edit.content || ''} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
                      <div className="flex gap-2">
                        <select className="trk-input !w-auto" value={edit.discipline} onChange={(e) => setEdit({ ...edit, discipline: e.target.value })}><option value="both">Video + design</option><option value="video">🎬 Video</option><option value="design">🎨 Design</option></select>
                        <button type="button" className="trk-btn primary !py-1.5" disabled={busy === `e${i.id}` || !edit.title.trim()} onClick={saveEdit}>{busy === `e${i.id}` ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save & approve</button>
                        <button type="button" className="trk-btn !py-1.5" onClick={() => setEdit(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1.5 font-semibold">{i.title}</div>
                      {i.content && <div className="text-[13.5px] trk-muted mt-0.5">{i.content}</div>}
                    </>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] trk-dim">
                    {(ev.reviewers || []).length > 0 && <span>Said by {ev.reviewers.slice(0, 4).join(', ')}</span>}
                    {(ev.products || []).length > 0 && <span>· {ev.products.slice(0, 4).join(', ')}</span>}
                    {!ev.count && <span>{i.added_by} · {relTime(i.created_at)}</span>}
                    {(ev.examples || []).length > 0 && (
                      <button type="button" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={() => toggleOpen(i.id)}>
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {ev.examples.length} example{ev.examples.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-2 grid gap-1.5">
                      {ev.examples.map(x => (
                        <div key={x.id} className="text-[12.5px] rounded-lg px-3 py-2" style={{ background: 'var(--trk-glass-hi)' }}>
                          <span className="font-medium">{x.author}</span>
                          <span className="trk-dim"> · {x.source === 'frameio' ? '🎬' : '🎨'}{x.product ? ` ${x.product}` : ''}</span>
                          {x.outcome && OUTCOME[x.outcome] && <span className="trk-dim" title={OUTCOME[x.outcome][1]}> · {OUTCOME[x.outcome][0]} {OUTCOME[x.outcome][1]}</span>}
                          <div className="mt-0.5">“{x.text}”</div>
                          {(x.found || x.fix) && <div className="mt-0.5 trk-muted"><span className="cc-strike">{x.found}</span>{x.found && x.fix ? ' → ' : ''}<span className="cc-fix">{x.fix}</span></div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {isAdmin && !editing && (
                  <span className="flex shrink-0 gap-1.5">
                    <button type="button" className="trk-btn !py-1.5 !px-2.5" aria-label={`Approve ${i.title}`} disabled={!!busy} onClick={() => bulk([i.id], 'approved')}><Check size={13} /></button>
                    <button type="button" className="trk-btn !py-1.5 !px-2.5" aria-label={`Edit ${i.title}`} onClick={() => setEdit({ id: i.id, title: i.title, content: i.content, discipline: i.discipline })}><Pencil size={13} /></button>
                    <button type="button" className="trk-btn !py-1.5 !px-2.5" aria-label={`Reject ${i.title}`} disabled={!!busy} onClick={() => bulk([i.id], 'rejected')}><X size={13} /></button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {list.length > shown && (
          <button type="button" className="trk-btn mt-3" onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</button>
        )}
      </div>
    </div>
  );
}
