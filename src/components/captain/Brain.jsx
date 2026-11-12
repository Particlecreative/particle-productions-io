import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, Search, X } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import HistoryImport from './HistoryImport';
import ReviewQueue from './ReviewQueue';
import EmailExport from './EmailExport';

const TYPES = [
  ['term', 'Approved terms', 'Exact spelling — product names, ingredients, hashtags'],
  ['rule', 'Rules', 'Instructions, e.g. “Prices always $29.99”, “Never write cure”'],
  ['do_not_flag', 'Do not flag', 'Intentional slang or creator spellings'],
  ['learned', 'Learned corrections', 'From feedback and past comments'],
  ['insight', 'Reviewer insights', '💡 Heads-up suggestions, never typo comments'],
  ['offer', 'Offer calendar', 'Each campaign’s code, discount % and end date — briefs are checked against it'],
  ['price', 'Price list', 'List price per product — sale prices in briefs are checked against it'],
  ['claim', 'Claims sheet', 'Approved claims — a brief may only claim what is here'],
  ['layout_limit', 'Layout limits', 'Max characters per element and size, per named template'],
];
const FACTS = new Set(['offer', 'price', 'claim', 'layout_limit']);
const LANES = ['Particle', 'SFY', 'GT', 'WAC'];
const TITLE_LABEL = { term: 'Term', offer: 'Campaign', price: 'Product', claim: 'The claim', layout_limit: 'Template' };
const TITLE_HINT = { term: 'e.g. Gravité', rule: 'e.g. CTA wording', offer: 'e.g. Christmas 2026', price: 'e.g. Neck Cream', claim: 'e.g. Firms, lifts and moisturizes', layout_limit: 'e.g. 5 Bucks. 5 Problems.' };
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
  const [brand, setBrand] = useState('');
  const [lane, setLane] = useState('');
  const [fact, setFact] = useState({ code: '', tiers: '', starts: '', ends: '', list_price: '', limits: '', product: '' });
  const setF = (k) => (e) => setFact(f => ({ ...f, [k]: e.target.value }));
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try { setItems((await captainApi.brain()).items); } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  // One search across everything: title, wording, products, reviewers, example comments
  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return () => true;
    return (i) => {
      const ev = i.evidence || {};
      const hay = [i.title, i.content, i.type, i.discipline, ...(ev.products || []), ...(ev.reviewers || []), ...(ev.examples || []).map(x => `${x.text} ${x.found || ''} ${x.fix || ''}`), ...(Array.isArray(i.scope?.product) ? i.scope.product : [i.scope?.product])]
        .filter(Boolean).join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    };
  }, [q]);
  const pending = useMemo(() => (items || []).filter(i => i.status === 'pending' && matches(i)), [items, matches]);
  const byType = useMemo(() => {
    const m = {};
    for (const i of items || []) if (i.status === 'approved' && matches(i)) (m[i.type] ||= []).push(i);
    return m;
  }, [items, matches]);
  const approvedCount = Object.values(byType).reduce((a, l) => a + l.length, 0);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy('add');
    try {
      const scope = { ...(brand ? { brand } : {}), ...(lane ? { lane } : {}), ...(type === 'claim' && fact.product.trim() ? { product: fact.product.trim() } : {}) };
      const data = type === 'offer' ? { code: fact.code, tiers: fact.tiers, starts: fact.starts || null, ends: fact.ends || null }
        : type === 'price' ? { list_price: fact.list_price } : undefined;   // layout limits are parsed from the text
      await captainApi.addBrain({ type, title: title.trim(), content: type === 'layout_limit' ? fact.limits : content.trim() || null, discipline, scope, data });
      setTitle(''); setContent(''); setFact({ code: '', tiers: '', starts: '', ends: '', list_price: '', limits: '', product: '' });
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

      {isAdmin && <EmailExport notify={notify} />}

      <div className="trk-glass p-3 flex items-center gap-2">
        <Search size={16} className="trk-dim ml-1" />
        <input className="flex-1 bg-transparent outline-none text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Brain — a word, product, rule or reviewer (e.g. “money-back”, “Gravité”, “Aviad”)" aria-label="Search the Brain" />
        {q && <span className="text-[12px] trk-muted whitespace-nowrap">{pending.length} in review · {approvedCount} approved</span>}
        {q && <button type="button" className="trk-btn !py-1 !px-2" aria-label="Clear search" onClick={() => setQ('')}><X size={13} /></button>}
      </div>

      {pending.length > 0 && <ReviewQueue items={pending} isAdmin={isAdmin} notify={notify} reload={load} />}

      {isAdmin && (
        <form className="trk-glass p-5 grid gap-3" onSubmit={add}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[170px_minmax(0,1fr)_minmax(0,1.4fr)_120px_120px_110px_auto] items-end">
            <label className="grid gap-1"><span className="trk-label">Type</span>
              <select className="trk-input" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="grid gap-1"><span className="trk-label">{TITLE_LABEL[type] || 'Title'}</span>
              <input className="trk-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TITLE_HINT[type] || 'e.g. obsessed!!'} />
            </label>
            {FACTS.has(type) && type !== 'claim' ? (
              <div className="hidden 2xl:block text-[12px] trk-muted self-center">{type === 'offer' ? 'Code, discount and dates below.' : type === 'price' ? 'Price below.' : 'Limits below.'}</div>
            ) : (
              <label className="grid gap-1"><span className="trk-label">{type === 'rule' ? 'The rule' : type === 'claim' ? 'Source (optional)' : 'Note (optional)'}</span>
                <input className="trk-input" value={content} onChange={(e) => setContent(e.target.value)} placeholder={type === 'rule' ? 'e.g. The CTA must say “Shop Now”' : type === 'claim' ? 'e.g. Clinical study, Mar 2026' : ''} />
              </label>
            )}
            <label className="grid gap-1"><span className="trk-label">For</span>
              <select className="trk-input" value={discipline} onChange={(e) => setDiscipline(e.target.value)}><option value="both">Video + design</option><option value="video">🎬 Video</option><option value="design">🎨 Design</option></select>
            </label>
            <label className="grid gap-1"><span className="trk-label">Brand</span>
              <select className="trk-input" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">All brands</option><option value="Particle">Particle</option><option value="Ashford">Ashford</option></select>
            </label>
            <label className="grid gap-1"><span className="trk-label">Lane</span>
              <select className="trk-input" value={lane} onChange={(e) => setLane(e.target.value)} title="Particle direct, Science For You, Gentleman Today, We Are Colognes"><option value="">All lanes</option>{LANES.map(l => <option key={l} value={l}>{l}</option>)}</select>
            </label>
            <button type="submit" className="trk-btn primary" disabled={busy === 'add' || !title.trim()}>{busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</button>
          </div>
          {type === 'offer' && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1"><span className="trk-label">Code</span><input className="trk-input" value={fact.code} onChange={setF('code')} placeholder="XMAS30" /></label>
              <label className="grid gap-1"><span className="trk-label">Discount %</span><input className="trk-input" value={fact.tiers} onChange={setF('tiers')} placeholder="25, 30" /></label>
              <label className="grid gap-1"><span className="trk-label">Starts</span><input type="date" className="trk-input" value={fact.starts} onChange={setF('starts')} /></label>
              <label className="grid gap-1"><span className="trk-label">Ends</span><input type="date" className="trk-input" value={fact.ends} onChange={setF('ends')} /></label>
            </div>
          )}
          {type === 'price' && (
            <label className="grid gap-1 max-w-[220px]"><span className="trk-label">List price ($)</span><input className="trk-input" inputMode="decimal" value={fact.list_price} onChange={setF('list_price')} placeholder="59" /></label>
          )}
          {type === 'claim' && (
            <label className="grid gap-1 max-w-[320px]"><span className="trk-label">Product (empty = every product)</span><input className="trk-input" value={fact.product} onChange={setF('product')} placeholder="Neck Cream" /></label>
          )}
          {type === 'layout_limit' && (
            <label className="grid gap-1"><span className="trk-label">Limits — one per line: element, size, max characters</span>
              <textarea className="trk-input min-h-[88px] font-mono !text-[13px]" value={fact.limits} onChange={setF('limits')} placeholder={'headline 9x16: 32\nheadline 4x5: 40\nsubtitle * 60   (* = every size; no element = headline)'} />
            </label>
          )}
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
                    {i.scope?.brand && <span className="trk-chip gray ml-2">{i.scope.brand}</span>}
                    {i.scope?.lane && <span className="trk-chip gray ml-2" title="Only for this lane">{[].concat(i.scope.lane).join(' / ')}</span>}
                    {k === 'claim' && i.scope?.product && <span className="trk-chip gray ml-2">{[].concat(i.scope.product).join(', ')}</span>}
                    {i.content && <div className="text-[12.5px] trk-muted whitespace-pre-line">{i.content}</div>}
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
