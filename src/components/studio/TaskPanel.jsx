import { useEffect, useState } from 'react';
import TaskTime from '../timetrack/TaskTime';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Plane, Loader2, Film, Folder, PenTool, Link2, Archive, ChevronDown, ArrowRight, Flag } from 'lucide-react';
import { nextStatus, priorityRank } from './kanban';
import { linkInfo } from './updatesKit';
import { studioApi } from '../../lib/studioService';
import { Avatar, ProductTag, hrs } from './Bits';
import { addDays, ymd } from './Filters';
import TaskUpdates from './TaskUpdates';
import { useStudio, outOn, workdays, fmtDay, firstName } from './writes';

const roleOf = (it) => (it.board === 'video' ? 'video' : 'design');
const BOARD = { video: 'Video', design: 'Design', retention: 'Email task' };
/**
 * One task, everything you'd open Monday for: status, timeline, deadline, people, the brief and updates.
 * Every change is saved to Monday straight away (with Undo).
 */
export default function TaskPanel({ it: base, data, onClose, focus = null }) {
  const { writes, readOnly = false, can: canCtx } = useStudio();   // readOnly: the Growth Studio sees the task, never changes it
  // What this person may do here (25 Nov 2026): the Creative team moves its own status and talks, the studio schedules
  const can = canCtx || { status: !readOnly, schedule: !readOnly, archive: !readOnly, comment: !readOnly, simple: false };
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
    const k = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[data-lightbox]') && !e.target?.closest?.('textarea, input')) onClose(); };   // a picture open on top closes first
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
  // links the Delivery box above doesn't already show (Growth sees them all here, read-only)
  const shownAbove = (can.status || can.schedule) && DELIVERY[it.board] ? [...DELIVERY[it.board].map(r => r[0]), 'dropbox'] : [];
  const links = [['frame', 'Frame.io', Film], ['dropbox', 'Dropbox', Folder], ['figma', 'Figma', PenTool], ['project', 'Project', Link2]]
    .filter(([k]) => it.links?.[k] && !shownAbove.includes(k));
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
          {!can.status && !can.comment && <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">View only — the studio schedules and moves tasks. Open it in Monday to comment.</div>}
          <fieldset disabled={!can.status && !can.schedule} className="contents">
          {statuses.length > 0 && can.simple && <SimpleStatus it={it} statuses={statuses} onMove={(s) => writes.save(it, { status: s }, data)} />}
          {statuses.length > 0 && !can.simple && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Status{readOnly ? '' : ' · click to change'}</div>
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

          {(can.status || can.schedule) && DELIVERY[it.board] && <DeliveryLinks it={it} statuses={statuses} writes={writes} can={can} focus={focus} />}
          {!can.schedule && <Facts it={it} data={data} late={late} />}
          {can.schedule && <div className="rounded-xl bg-gray-50 p-3.5 flex flex-col gap-3">
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
            {dirty && !readOnly && (
              <div className="flex gap-2">
                <button type="button" disabled={invalid} onClick={() => writes.save(it, next, data)}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-40" style={{ background: '#0808f8' }}>Save to Monday</button>
                <button type="button" onClick={() => { setFrom(it.timeline?.from || ''); setTo(it.timeline?.to || ''); setDeadline(it.deadline || ''); setWho(it.people); }}
                  className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 bg-white">Cancel</button>
              </div>
            )}
          </div>}
          </fieldset>

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

          <TaskTime board={it.board} itemId={it.id} />
          <TaskUpdates it={it} data={data} readOnly={!can.comment} />
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
              {can.archive && <button type="button" onClick={() => setAskArchive(true)} className="ml-auto text-xs font-semibold text-gray-500 hover:text-red-600 flex items-center gap-1.5"><Archive size={13} /> Archive</button>}
            </div>
          )}
        </div>
      </div>
    </div>, document.body);
}

/**
 * The Creative team's status (25 Nov 2026 — "why do I need to see all statuses"): where it is now, the next step in one
 * click (Working → Review…), and every other status tucked into a menu.
 */
function SimpleStatus({ it, statuses, onMove }) {
  const [open, setOpen] = useState(false);
  const nxt = nextStatus(it, statuses);
  const others = statuses.filter(s => s.label !== it.status.label && s.label !== nxt?.label);
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Status</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-bold px-3 py-1.5 rounded-lg text-white shadow-sm" style={{ background: it.status.color || '#c4c4c4' }}>{it.status.label}</span>
        {nxt && (
          <button type="button" onClick={() => onMove(nxt)}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold pl-2.5 pr-3 py-1.5 rounded-lg border-2 border-dashed hover:border-solid transition-all"
            style={{ borderColor: nxt.color, color: '#030b2e' }}>
            <ArrowRight size={14} /> Move to <span className="font-bold" style={{ color: nxt.color }}>{nxt.label}</span>
          </button>
        )}
        {others.length > 0 && (
          <span className="relative">
            <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
              Other status <ChevronDown size={13} />
            </button>
            {open && (
              <>
                <span className="fixed inset-0 z-[5]" onClick={() => setOpen(false)} />
                <span className="absolute left-0 top-full mt-1 z-[6] w-52 rounded-xl border border-gray-200 bg-white shadow-xl py-1 flex flex-col">
                  {others.map(s => (
                    <button key={s.label} type="button" onClick={() => { setOpen(false); onMove(s); }} className="flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-gray-700 hover:bg-gray-50">
                      <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: s.color }} /> {s.label}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** What the studio decided, to read (the Creative team doesn't schedule): timeline, deadline, who's on it, who asked, priority. */
function Facts({ it, data, late }) {
  const names = (ids, src) => (ids || []).map(id => src?.[id] || data.people?.[id] || data.requesters?.[id]).filter(Boolean);
  const people = names(it.people, data.people);
  const asked = names(it.requested_by, data.requesters);
  const pri = it.priority && typeof it.priority === 'object' ? it.priority : it.priority ? { label: it.priority } : null;
  const range = it.timeline?.from ? (it.timeline.to && it.timeline.to !== it.timeline.from ? `${fmtDay(it.timeline.from)} – ${fmtDay(it.timeline.to)}` : fmtDay(it.timeline.from)) : null;
  const Row = ({ label, children }) => (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className="text-[13px] text-gray-800 min-w-0">{children}</div>
    </div>
  );
  return (
    <div className="rounded-xl bg-gray-50 p-3.5 grid grid-cols-2 gap-x-4 gap-y-3">
      <Row label="Deadline">{it.deadline ? <span className={late ? 'text-red-600 font-semibold' : 'font-semibold'}>{fmtDay(it.deadline)}{late ? ' · late' : ''}</span> : <span className="text-gray-400">No deadline</span>}</Row>
      <Row label="Timeline">{range ? <span className="font-semibold">{range}</span> : <span className="text-gray-400">Not scheduled yet</span>}</Row>
      <Row label={it.board === 'video' ? 'Editor' : 'Designer'}>
        <span className="flex flex-wrap gap-1.5">{people.length ? people.map(p => <span key={p.id} className="flex items-center gap-1"><Avatar person={p} size={18} /> {firstName(p.name)}</span>) : <span className="text-gray-400">Nobody yet</span>}</span>
      </Row>
      <Row label="Requested by">
        <span className="flex flex-wrap gap-1.5">{asked.length ? asked.map(p => <span key={p.id} className="flex items-center gap-1"><Avatar person={p} size={18} /> {firstName(p.name)}</span>) : <span className="text-gray-400">—</span>}</span>
      </Row>
      {pri?.label && (
        <Row label="Priority">
          <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: priorityRank(pri) <= 1 ? (pri.color || '#e2445c') : undefined }}>
            <Flag size={12} /> {pri.label}
          </span>
        </Row>
      )}
      {it.type?.label && <Row label="Type"><span className="font-semibold">{it.type.label}</span></Row>}
    </div>
  );
}

// What the editor / designer pastes. Dropbox is made by the ticket creator (Tomer, 25 Nov 2026) — shown read-only below.
const DELIVERY = {
  video: [['frame', 'Frame.io', 'Paste the Frame.io review link', true]],
  design: [['figma', 'Figma', 'Paste the Figma link', true]],
};
const KIND_OF = { frame: 'frame', figma: 'figma', dropbox: 'dropbox' };

/**
 * Your delivery (Tomer, 25 Nov 2026): "editors and designers submit the Frame.io / Figma links — easy to find and paste;
 * once it's in, ask if they want the next status". Paste (one click reads the clipboard), check it's the right site,
 * save to Monday as you, then offer the next step (Working → Review).
 */
export function DeliveryLinks({ it, statuses, writes, can, focus }) {
  const rows = DELIVERY[it.board] || [];
  const [edit, setEdit] = useState(focus === 'link' ? rows.find(r => r[3] && !it.links?.[r[0]])?.[0] || null : null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [ask, setAsk] = useState(null);   // { status } after the main link is saved
  if (!rows.length) return null;
  const nxt = nextStatus(it, statuses);

  const save = async (kind, raw) => {
    const url = String(raw ?? val).trim();
    setErr(null);
    if (url && linkInfo(url).kind !== KIND_OF[kind]) { setErr(`That isn’t a ${rows.find(r => r[0] === kind)?.[1]} link`); return; }
    setBusy(kind);
    try {
      const r = await studioApi.setLink(it.id, kind, url);
      writes.patch?.(it.id, { links: { ...(it.links || {}), [kind]: url || null } });
      writes.setToast({ head: r?.as_user ? 'Updated on Monday as you' : 'Updated on Monday', text: `${rows.find(x => x[0] === kind)?.[1]} link ${url ? 'saved' : 'removed'}` });
      setEdit(null); setVal('');
      const main = rows.find(x => x[0] === kind)?.[3];
      if (url && main && can.simple && nxt && ['in_progress', 'fixes', 'queued', 'paused'].includes(it.status?.category)) setAsk({ status: nxt });
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const paste = async (kind) => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) { setErr('The clipboard is empty — copy the link first'); return; }
      setVal(t);
      if (linkInfo(t).kind === KIND_OF[kind]) save(kind, t); else setErr(`What you copied isn’t a ${rows.find(r => r[0] === kind)?.[1]} link`);
    } catch { setErr('Your browser didn’t allow reading the clipboard — paste with ⌘V'); }
  };
  const copy = (url, label) => navigator.clipboard?.writeText(url).then(() => writes.setToast({ head: 'Copied', text: `${label} link` })).catch(() => null);

  return (
    <div className="rounded-xl border border-[#0808f8]/15 bg-[#0808f8]/[0.025] p-3.5 flex flex-col gap-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#0808f8]">{can.simple ? 'Your delivery' : 'Delivery links'}</div>
      {rows.map(([kind, label, ph, main]) => {
        const url = it.links?.[kind];
        const info = url ? linkInfo(url) : null;
        if (url && edit !== kind) {
          return (
            <div key={kind} className="flex items-center gap-2 min-w-0">
              <a href={url} target="_blank" rel="noopener noreferrer" title={url} data-kind={info.kind} className="cp-chip min-w-0 flex-1 !max-w-none">
                <span className="cp-chip-k">{info.label}</span>{info.sub ? <span className="cp-chip-s">{info.sub}</span> : null}
              </a>
              <button type="button" onClick={() => copy(url, label)} className="text-[11.5px] font-semibold px-2 py-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-[#030b2e]">Copy</button>
              {can.status && <button type="button" onClick={() => { setEdit(kind); setVal(url); setErr(null); }} className="text-[11.5px] font-semibold px-2 py-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-[#030b2e]">Replace</button>}
            </div>
          );
        }
        if (!can.status) return <div key={kind} className="text-[12px] text-gray-400">No {label} link yet</div>;
        return (
          <div key={kind} className="flex items-center gap-1.5">
            <input value={edit === kind ? val : ''} onFocus={() => { if (edit !== kind) { setEdit(kind); setVal(''); setErr(null); } }} onChange={(e) => { setEdit(kind); setVal(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') save(kind); if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); setVal(''); } }}
              autoFocus={focus === 'link' && main && edit === kind} placeholder={ph}
              className={`flex-1 min-w-0 text-[13px] px-3 py-2 rounded-lg border bg-white focus:outline-none focus:border-[#0808f8]/60 ${main ? 'border-[#0808f8]/30' : 'border-gray-200'}`} />
            <button type="button" onClick={() => paste(kind)} disabled={!!busy} className="text-[12px] font-semibold px-2.5 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-[#030b2e] disabled:opacity-50">Paste</button>
            {edit === kind && val.trim() && (
              <button type="button" onClick={() => save(kind)} disabled={!!busy} className="text-[12px] font-semibold px-3 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: '#0808f8' }}>
                {busy === kind ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
              </button>
            )}
            {edit === kind && url && <button type="button" onClick={() => { setEdit(null); setVal(''); }} className="text-[11.5px] px-1.5 text-gray-400 hover:text-gray-700">Cancel</button>}
          </div>
        );
      })}
      {/* Dropbox — the ticket creator makes the folder; here to open or copy, not to paste */}
      {it.links?.dropbox ? (
        <div className="flex items-center gap-2 min-w-0">
          <a href={it.links.dropbox} target="_blank" rel="noopener noreferrer" title={it.links.dropbox} data-kind="dropbox" className="cp-chip min-w-0 flex-1 !max-w-none">
            <span className="cp-chip-k">Dropbox</span>{linkInfo(it.links.dropbox).sub ? <span className="cp-chip-s">{linkInfo(it.links.dropbox).sub}</span> : null}
          </a>
          <button type="button" onClick={() => copy(it.links.dropbox, 'Dropbox')} className="text-[11.5px] font-semibold px-2 py-1.5 rounded-lg text-gray-500 hover:bg-white hover:text-[#030b2e]">Copy</button>
        </div>
      ) : <div className="text-[11.5px] text-gray-400">Dropbox folder: made with the ticket — not there yet</div>}
      {err && <div className="text-[12px] text-red-600">{err}</div>}
      {ask && (
        <div className="rounded-lg bg-white border border-gray-200 p-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-[#030b2e] flex-1 min-w-[160px]">✓ Saved on Monday. Ready to send it to <b style={{ color: ask.status.color }}>{ask.status.label}</b>?</span>
          <button type="button" onClick={() => { writes.save(it, { status: ask.status }); setAsk(null); }} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: ask.status.color || '#0808f8' }}>
            <ArrowRight size={13} /> Move to {ask.status.label}
          </button>
          <button type="button" onClick={() => setAsk(null)} className="text-[12.5px] font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">Not now</button>
        </div>
      )}
    </div>
  );
}
