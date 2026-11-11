import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Plane, Loader2, Send, MessageSquare, Film, Folder, PenTool, Link2, CornerDownRight, Archive, AtSign } from 'lucide-react';
import { Avatar, ProductTag, hrs } from './Bits';
import { addDays, ymd } from './Filters';
import { studioApi } from '../../lib/studioService';
import { useStudio, outOn, workdays, fmtDay, firstName } from './writes';

const roleOf = (it) => (it.board === 'video' ? 'video' : 'design');
const BOARD = { video: 'Video', design: 'Design', retention: 'Email task' };
const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

function ago(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60e3))}m ago`;
  if (ms < 86400e3) return `${Math.round(ms / 3600e3)}h ago`;
  if (ms < 7 * 86400e3) return `${Math.round(ms / 86400e3)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Text with clickable links. */
function Linked({ text }) {
  return text.split(URL_RE).map((part, i) => (i % 2
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#0808f8] hover:underline break-all">{part.length > 60 ? `${part.slice(0, 57)}…` : part}</a>
    : <Fragment key={i}>{part}</Fragment>));
}

function Update({ u, data, small }) {
  const [open, setOpen] = useState(false);
  const person = (u.by && (data.people[u.by.id] || data.requesters[u.by.id])) || { name: u.by?.name || 'Monday' };
  const long = u.text.length > 420 || u.text.split('\n').length > 8;
  return (
    <div className={`flex gap-2.5 ${small ? 'mt-2' : ''}`}>
      <Avatar person={person} size={small ? 20 : 26} />
      <div className="min-w-0 flex-1">
        <div className="text-xs"><b className="text-gray-900">{u.by?.name || person.name}</b> <span className="text-gray-400">{ago(u.at)}</span></div>
        <div className={`text-[13px] text-gray-700 whitespace-pre-wrap break-words mt-0.5 ${long && !open ? 'max-h-[9.5em] overflow-hidden relative' : ''}`}>
          <Linked text={u.text} />
          {long && !open && <span className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-white" />}
        </div>
        {long && <button type="button" onClick={() => setOpen(v => !v)} className="text-[11px] font-semibold text-[#0808f8] mt-0.5">{open ? 'Show less' : 'Show more'}</button>}
        {u.replies?.map(r => (
          <div key={r.id} className="flex gap-1"><CornerDownRight size={12} className="text-gray-300 mt-3 flex-none" /><Update u={r} data={data} small /></div>
        ))}
      </div>
    </div>
  );
}

/** "@que" right before the caret → the query being typed, else null. */
function mentionQuery(text, caret) {
  const m = text.slice(0, caret).match(/(^|\s)@([^\s@]{0,30})$/u);
  return m ? m[2] : null;
}

/** The brief and the conversation from Monday, plus a reply box. Type @ to tag someone (a real Monday mention). */
function Updates({ it, data }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [tagged, setTagged] = useState([]);            // [{ id, name }] picked from the list
  const [query, setQuery] = useState(null);            // what follows "@", or null when the list is closed
  const [pick, setPick] = useState(0);
  const box = useRef(null);
  useEffect(() => {
    let on = true;
    setList(null); setErr(null);
    studioApi.updates(it.id).then(r => on && setList(r.updates || [])).catch(e => on && setErr(e.message));
    return () => { on = false; };
  }, [it.id]);

  // Everyone who can be tagged: this task's people and requester first, then the studio team and requesters
  const people = useMemo(() => {
    const all = new Map();
    const add = (p, rank) => { if (p?.id && p.name && !all.has(String(p.id))) all.set(String(p.id), { id: String(p.id), name: p.name, photo: p.photo, rank }); };
    for (const id of it.people || []) add(data.people?.[id] || data.requesters?.[id], 0);
    for (const id of it.requested_by || []) add(data.requesters?.[id] || data.people?.[id], 1);
    for (const p of Object.values(data.people || {})) add(p, 2);
    for (const p of Object.values(data.requesters || {})) add(p, 3);
    return [...all.values()];
  }, [it.id, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return people
      .filter(p => !q || p.name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [people, query]);

  const onType = (e) => {
    setText(e.target.value);
    const q = mentionQuery(e.target.value, e.target.selectionStart);
    setQuery(q); setPick(0);
  };
  const choose = (p) => {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/u, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setTagged(t => (t.some(x => x.id === p.id) ? t : [...t, { id: p.id, name: p.name }]));
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };
  const openPicker = () => {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const lead = caret > 0 && !/\s/.test(text[caret - 1]) ? ' @' : '@';
    const next = text.slice(0, caret) + lead + text.slice(caret);
    setText(next); setQuery(''); setPick(0);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret + lead.length, caret + lead.length); });
  };
  const post = async () => {
    const t = text.trim();
    if (!t || posting) return;
    const mentions = tagged.filter(p => t.includes(`@${p.name}`));
    setPosting(true); setErr(null);
    try {
      await studioApi.postUpdate(it.id, t, mentions);
      setList(l => [{ id: `new-${Date.now()}`, text: t, at: new Date().toISOString(), by: { id: 'me', name: 'You' }, replies: [] }, ...(l || [])]);
      setText(''); setTagged([]); setQuery(null);
    } catch (e) { setErr(e.message); } finally { setPosting(false); }
  };
  const onKey = (e) => {
    if (query != null && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => (i + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => (i - 1 + matches.length) % matches.length); return; }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') { e.preventDefault(); choose(matches[pick]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); }
  };
  const inText = tagged.filter(p => text.includes(`@${p.name}`));

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5"><MessageSquare size={12} /> Brief & updates</div>
      <div className="relative rounded-xl border border-gray-200 focus-within:border-[#0808f8]/50 bg-white">
        <textarea ref={box} value={text} onChange={onType} onKeyDown={onKey} rows={2} placeholder="Write an update — it’s posted on the Monday task. Type @ to tag someone"
          onBlur={() => setTimeout(() => setQuery(null), 150)}
          onClick={(e) => setQuery(mentionQuery(text, e.target.selectionStart))}
          className="w-full text-sm px-3 pt-2.5 resize-y rounded-xl focus:outline-none" />
        {query != null && matches.length > 0 && (
          <div className="absolute left-2 right-2 top-full mt-1 z-10 rounded-xl border border-gray-200 bg-white shadow-lg py-1" role="listbox" aria-label="Tag someone">
            {matches.map((p, i) => (
              <button key={p.id} type="button" role="option" aria-selected={i === pick}
                onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setPick(i)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${i === pick ? 'bg-[#0808f8]/10' : ''}`}>
                <Avatar person={p} size={20} /> <span className="truncate">{p.name}</span>
                {p.rank === 0 && <span className="ml-auto text-[10px] text-gray-400">on this task</span>}
                {p.rank === 1 && <span className="ml-auto text-[10px] text-gray-400">requester</span>}
              </button>
            ))}
          </div>
        )}
        {inText.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {inText.map(p => <span key={p.id} className="text-[11px] font-semibold text-white bg-[#0808f8] rounded-full px-2 py-0.5">@{p.name} will be notified</span>)}
          </div>
        )}
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[10px] text-gray-400 pl-1">⌘ Enter to post · @ to tag · signed with your name</span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={openPicker} title="Tag someone" aria-label="Tag someone"
              className="p-1.5 rounded-lg text-gray-500 hover:text-[#0808f8] hover:bg-[#0808f8]/10"><AtSign size={14} /></button>
            <button type="button" onClick={post} disabled={!text.trim() || posting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: '#0808f8' }}>
              {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Post
            </button>
          </span>
        </div>
      </div>
      {err && <div className="text-xs text-red-600">{err}</div>}
      {!list && !err && <div className="text-xs text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Loading from Monday…</div>}
      {list && !list.length && <div className="text-xs text-gray-400">No updates yet.</div>}
      {list?.map(u => <Update key={u.id} u={u} data={data} />)}
    </div>
  );
}

/**
 * One task, everything you'd open Monday for: status, timeline, deadline, people, the brief and updates.
 * Every change is saved to Monday straight away (with Undo).
 */
export default function TaskPanel({ it: base, data, onClose }) {
  const { writes } = useStudio();
  const it = writes.merge(base, data.generated_at);
  const today = data.today || ymd(new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [deadline, setDeadline] = useState('');
  const [who, setWho] = useState([]);
  const [askArchive, setAskArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const saved = `${it.id}|${it.timeline?.from || ''}|${it.timeline?.to || ''}|${it.deadline || ''}|${it.people.join()}`;
  useEffect(() => {
    setFrom(it.timeline?.from || ''); setTo(it.timeline?.to || ''); setDeadline(it.deadline || ''); setWho(it.people);
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !e.target?.closest?.('textarea, input')) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const statuses = data.boards?.[it.board]?.statuses || [];
  const team = Object.values(data.people || {}).filter(p => p.role === roleOf(it) || it.people.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const a = from || to;
  const b = to || from;
  const invalid = a && b && b < a;
  const next = {};
  if ((a || '') !== (it.timeline?.from || '') || (b || '') !== (it.timeline?.to || '')) next.timeline = a ? { from: a, to: b } : null;
  if ((deadline || '') !== (it.deadline || '')) next.deadline = deadline || null;
  if (who.join() !== it.people.join()) next.people = who;
  const dirty = Object.keys(next).length > 0;
  const shift = (n) => { if (a) { setFrom(addDays(a, n)); setTo(addDays(b, n)); } };
  const late = it.open && it.deadline && it.deadline < today;
  const req = it.requested_by?.map(r => data.requesters?.[r]?.name).filter(Boolean).join(', ');
  const links = [['frame', 'Frame.io', Film], ['dropbox', 'Dropbox', Folder], ['figma', 'Figma', PenTool], ['project', 'Project', Link2]]
    .filter(([k]) => it.links?.[k]);
  const life = it.life;

  return createPortal(
    <div data-task-panel className="fixed inset-0 z-[85] flex justify-end" style={{ background: 'rgba(3,11,46,.25)' }} onClick={onClose}>
      <div className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#0808f8]">{BOARD[it.board] || 'Task'}{it.division === 'tv' ? ' · TV' : ''}{it.group ? <span className="text-gray-400 normal-case tracking-normal font-semibold"> · {it.group}</span> : null}</div>
            <div className="text-lg font-bold text-[#030b2e] leading-snug">{it.name}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
              <ProductTag product={it.product} />
              {req && <span>for {req}</span>}
              {it.deadline && <span className={late ? 'text-red-600 font-semibold' : ''}>due {fmtDay(it.deadline)}{late ? ' · late' : ''}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {statuses.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Status · click to change</div>
              <div className="flex flex-wrap gap-1.5">
                {statuses.map(s => {
                  const on = s.label === it.status.label;
                  return (
                    <button key={s.label} type="button" onClick={() => !on && writes.save(it, { status: s }, data)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${on ? 'text-white border-transparent shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}
                      style={on ? { background: s.color } : undefined}>
                      {!on && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: s.color }} />}{s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-gray-50 p-3.5 flex flex-col gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Timeline</div>
              <div className="flex items-center gap-2">
                <input type="date" value={from} onChange={e => { setFrom(e.target.value); if (!to || e.target.value > to) setTo(e.target.value); }} className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white" />
                <span className="text-gray-400">→</span>
                <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {[[-7, '−1 week'], [-1, '−1 day'], [1, '+1 day'], [7, '+1 week']].map(([n, l]) => (
                  <button key={l} type="button" disabled={!a} onClick={() => shift(n)} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-600 hover:border-[#0808f8]/50 disabled:opacity-40">{l}</button>
                ))}
                {a && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="text-[11px] font-semibold px-2 py-1 rounded-md text-gray-500 hover:text-red-600">Clear</button>}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Deadline</div>
              <div className="flex items-center gap-2">
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-[calc(50%-12px)] min-w-0 text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white" />
                {deadline && <button type="button" onClick={() => setDeadline('')} className="text-[11px] font-semibold text-gray-500 hover:text-red-600">Clear</button>}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{it.board === 'video' ? 'Editor' : 'Designer'}</div>
              <div className="flex flex-wrap gap-1.5">
                {team.map(p => (
                  <button key={p.id} type="button" onClick={() => setWho(w => (w.includes(p.id) ? w.filter(x => x !== p.id) : [...w, p.id]))}
                    className={`flex items-center gap-1.5 text-xs font-semibold pl-1 pr-2.5 py-1 rounded-full border ${who.includes(p.id) ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'bg-white text-gray-700 border-gray-200 hover:border-[#0808f8]/50'}`}>
                    <Avatar person={p} size={20} /> {firstName(p.name)}
                    {a && b && workdays(a, b).some(d => outOn(p, d)) && <Plane size={11} className={who.includes(p.id) ? 'text-white/70' : 'text-gray-400'} title="Off during this timeline" />}
                  </button>
                ))}
              </div>
            </div>
            {invalid && <div className="text-xs text-red-600">The end is before the start.</div>}
            {!invalid && b && deadline && b > deadline && <div className="text-xs text-amber-700">The timeline ends after the deadline ({fmtDay(deadline)}).</div>}
            {dirty && (
              <div className="flex gap-2">
                <button type="button" disabled={invalid} onClick={() => writes.save(it, next, data)}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-40" style={{ background: '#0808f8' }}>Save to Monday</button>
                <button type="button" onClick={() => { setFrom(it.timeline?.from || ''); setTo(it.timeline?.to || ''); setDeadline(it.deadline || ''); setWho(it.people); }}
                  className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 bg-white">Cancel</button>
              </div>
            )}
          </div>

          {(life?.submitted || it.effort_total_s > 0 || links.length > 0) && (
            <div className="flex flex-col gap-2">
              {(life?.submitted || it.effort_total_s > 0) && (
                <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                  {life?.submitted && <span>Submitted <b>{fmtDay(life.submitted.slice(0, 10))}</b></span>}
                  {life?.submitted && <span>{life.started ? <>started <b>{fmtDay(life.started.slice(0, 10))}</b></> : 'not started yet'}</span>}
                  {life?.completed && <span>done <b>{fmtDay(life.completed.slice(0, 10))}</b></span>}
                  {it.effort_total_s > 0 && <span><b>{hrs(it.effort_total_s)}</b> hands-on</span>}
                  {life?.fix_rounds > 0 && <span className="text-amber-700">{life.fix_rounds} fix round{life.fix_rounds === 1 ? '' : 's'}</span>}
                </div>
              )}
              {links.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {links.map(([k, label, Icon]) => (
                    <a key={k} href={it.links[k]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:border-[#0808f8]/50 hover:text-[#0808f8]">
                      <Icon size={13} /> {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <Updates it={it} data={data} />
        </div>

        <div className="px-6 py-3 border-t border-gray-100">
          {askArchive ? (
            <div className="rounded-xl bg-red-50 border border-red-100 p-3.5">
              <div className="text-sm font-bold text-red-800">Are you sure you want to archive this task?</div>
              <div className="text-xs text-red-700/80 mt-1">“{it.name}” will be archived on Monday and leave the {BOARD[it.board] || 'board'} board and the Studio. You can restore it from the board’s Archive on Monday.</div>
              <div className="flex justify-end gap-2 mt-3">
                <button type="button" disabled={archiving} onClick={() => setAskArchive(false)} className="text-xs font-semibold px-3 py-2 rounded-lg text-gray-600 hover:bg-white">Cancel</button>
                <button type="button" disabled={archiving}
                  onClick={async () => { setArchiving(true); const ok = await writes.archive(it); setArchiving(false); if (ok) onClose(); else setAskArchive(false); }}
                  className="text-xs font-semibold px-3.5 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-60">
                  {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} Yes, archive it
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center">
              {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-gray-500 hover:text-[#0808f8] flex items-center gap-1.5">Open in Monday <ExternalLink size={12} /></a>}
              <button type="button" onClick={() => setAskArchive(true)} className="ml-auto text-xs font-semibold text-gray-500 hover:text-red-600 flex items-center gap-1.5"><Archive size={13} /> Archive</button>
            </div>
          )}
        </div>
      </div>
    </div>, document.body);
}
