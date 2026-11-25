// A task's conversation, Monday-style or better (Tomer, 25 Nov 2026: "updates on a ticket in CP look very low-tech —
// look how it looks on monday.com, do something similar or even better, nice easy UX/UI").
// Tabs: Updates (formatting, files, likes, seen by, pins, threaded replies, search) · Files · Activity (status, people
// and date changes from Monday's activity log). Posts, replies, likes and edits land on Monday as you when your Monday
// is connected.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import {
  Loader2, Send, AtSign, Paperclip, Smile, ThumbsUp, MessageCircle, Eye, MoreHorizontal, Pin, Link2, ExternalLink, Copy, Pencil, X,
  Search, History, Download, MessageSquare, ArrowRight, ChevronDown, ImageIcon,
} from 'lucide-react';
import { Avatar } from './Bits';
import { studioApi } from '../../lib/studioService';
import { useMondayStatus } from './mondayMe';
import { fmtDay, firstName } from './writes';
import { parseChange, fileSize, fileKind, updateLink, dayLabel, filterUpdates, orderUpdates } from './updatesKit';

const BLUE = '#0808f8';
const EMOJI = ['👍', '🙏', '🔥', '✅', '👀', '❤️', '🎉', '😂', '💡', '⚠️', '🚀', '👏'];
const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

function ago(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  if (ms < 60e3) return 'now';
  if (ms < 3600e3) return `${Math.round(ms / 60e3)}m`;
  if (ms < 86400e3) return `${Math.round(ms / 3600e3)}h`;
  if (ms < 7 * 86400e3) return `${Math.round(ms / 86400e3)}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const fullDate = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '');

// ── Monday's HTML, made safe and tidy ──────────────────────────────────────────────────────────────────────────────
const purify = typeof window !== 'undefined' ? DOMPurify(window) : null;
const TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ul', 'ol', 'li', 'a', 'span', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'div'];
const ATTR = ['href', 'target', 'rel', 'class', 'data-mention-type', 'data-mention-id', 'data-asset_id', 'colspan', 'rowspan'];
const htmlCache = new Map();
/** Formatting, tables and links stay; a file link becomes its tile below; @mentions become chips; empty lines go. */
function cleanHtml(html) {
  const src = String(html || '');
  if (!src.trim() || !purify) return '';
  if (htmlCache.has(src)) return htmlCache.get(src);
  const tpl = document.createElement('template');
  tpl.innerHTML = purify.sanitize(src.replace(/﻿/g, ''), { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTR });
  const root = tpl.content;
  root.querySelectorAll('a[data-asset_id]').forEach(a => a.remove());
  root.querySelectorAll('a').forEach(a => {
    if (/mention/i.test(a.className) || a.getAttribute('data-mention-type')) {
      const s = document.createElement('span'); s.className = 'cp-mention'; s.textContent = a.textContent; a.replaceWith(s); return;
    }
    if (!/^https?:\/\//i.test(a.getAttribute('href') || '')) { a.replaceWith(...a.childNodes); return; }
    a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); a.removeAttribute('class');
  });
  root.querySelectorAll('[class]').forEach(el => { if (el.className !== 'cp-mention') el.removeAttribute('class'); });
  root.querySelectorAll('em').forEach(el => { if (/via CP Studio\s*$/.test(el.textContent)) el.className = 'cp-sig'; });
  root.querySelectorAll('p, div').forEach(el => { if (!el.textContent.replace(/\s/g, '') && !el.querySelector('table, hr')) el.remove(); });
  let out = tpl.innerHTML.replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/g, '');
  if (!out.replace(/<[^>]*>/g, '').trim() && !/<(table|hr)\b/i.test(out)) out = '';
  htmlCache.set(src, out);
  return out;
}

function Linked({ text }) {
  return String(text || '').split(URL_RE).map((part, i) => (i % 2
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-[#0808f8] underline underline-offset-2 decoration-[#0808f8]/40 break-all">{part.length > 60 ? `${part.slice(0, 57)}…` : part}</a>
    : <Fragment key={i}>{part}</Fragment>));
}

function Body({ u, long }) {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => cleanHtml(u.html), [u.html]);
  const text = String(u.text || '').replace(/﻿/g, '').trim();
  if (!html && !text) return null;
  const isLong = long ?? ((text.length > 650) || text.split('\n').length > 12);
  return (
    <div>
      <div className={`relative ${isLong && !open ? 'max-h-[15em] overflow-hidden' : ''}`}>
        {html ? <div className="cp-update-html" dangerouslySetInnerHTML={{ __html: html }} />
          : <div className="cp-update-html whitespace-pre-wrap break-words"><Linked text={text} /></div>}
        {isLong && !open && <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white to-white/0 pointer-events-none" />}
      </div>
      {isLong && <button type="button" onClick={() => setOpen(v => !v)} className="mt-1 text-[12px] font-semibold text-[#0808f8] hover:underline">{open ? 'Show less' : 'Show more'}</button>}
    </div>
  );
}

// ── Files: picture grid + file tiles ───────────────────────────────────────────────────────────────────────────────
function FileTile({ f, compact }) {
  const k = fileKind(f.ext);
  return (
    <a href={f.url || undefined} target="_blank" rel="noopener noreferrer" title={`Download ${f.name}`}
      className={`group flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white hover:border-[#0808f8]/40 hover:shadow-sm transition-all ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'} min-w-0`}>
      <span className="flex-none rounded-lg text-white font-black flex items-center justify-center text-[9px] tracking-wide" style={{ background: k.color, width: compact ? 30 : 36, height: compact ? 30 : 36 }}>{k.label}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-gray-800 truncate">{f.name}</span>
        <span className="block text-[11px] text-gray-400 truncate">{fileSize(f.size)}{f.by ? ` · ${firstName(f.by)}` : ''}{f.at && !compact ? ` · ${fmtDay(String(f.at).slice(0, 10))}` : ''}</span>
      </span>
      <Download size={14} className="flex-none text-gray-300 group-hover:text-[#0808f8]" />
    </a>
  );
}

function Files({ files, openImage, compact, gallery }) {
  if (!files?.length) return null;
  const pics = files.filter(f => f.image && (f.thumb || f.url));
  const docs = files.filter(f => !(f.image && (f.thumb || f.url)));
  return (
    <div className="flex flex-col gap-2">
      {pics.length > 0 && (
        <div className={`grid gap-2 ${gallery ? 'grid-cols-3' : pics.length === 1 ? 'grid-cols-1' : compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {pics.map(f => (
            <button key={f.id} type="button" onClick={() => openImage(f, pics)} className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group" title={f.name}>
              <img src={f.thumb || f.url} alt={f.name} loading="lazy" referrerPolicy="no-referrer" className={`w-full object-cover ${gallery ? 'aspect-square' : pics.length === 1 ? 'max-h-[260px]' : 'aspect-[4/3]'} group-hover:scale-[1.02] transition-transform`} />
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && <div className="grid gap-1.5">{docs.map(f => <FileTile key={f.id} f={f} compact={compact} />)}</div>}
    </div>
  );
}

function Lightbox({ box, onClose }) {
  const [i, setI] = useState(box.index);
  const f = box.list[i];
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === 'ArrowRight') setI(n => Math.min(box.list.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [box, onClose]);
  return createPortal(
    <div data-lightbox className="fixed inset-0 z-[96] bg-black/85 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <img src={f.url || f.thumb} alt={f.name} referrerPolicy="no-referrer" className="max-h-[82vh] max-w-[92vw] rounded-lg shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
      <div className="mt-3 flex items-center gap-3 text-white text-sm" onClick={(e) => e.stopPropagation()}>
        <span className="truncate max-w-[50vw]">{f.name}</span>
        {box.list.length > 1 && <span className="text-white/60">{i + 1} / {box.list.length}</span>}
        {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold hover:underline"><Download size={14} /> Download</a>}
      </div>
      <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close"><X size={18} /></button>
    </div>, document.body);
}

// ── Typing with @mentions, emoji, files ────────────────────────────────────────────────────────────────────────────
function mentionQuery(text, caret) {
  const m = text.slice(0, caret).match(/(^|\s)@([^\s@]{0,30})$/u);
  return m ? m[2] : null;
}

function useMentions(people, initial = '') {
  const [text, setText] = useState(initial);
  const [tagged, setTagged] = useState([]);
  const [query, setQuery] = useState(null);
  const [pick, setPick] = useState(0);
  const ref = useRef(null);
  const matches = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    return people.filter(p => !q || p.name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).slice(0, 6);
  }, [people, query]);
  const caretAt = (pos) => requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  const onChange = (e) => { setText(e.target.value); setQuery(mentionQuery(e.target.value, e.target.selectionStart)); setPick(0); };
  const choose = (p) => {
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/u, `@${p.name} `);
    setText(before + text.slice(caret));
    setTagged(t => (t.some(x => x.id === p.id) ? t : [...t, { id: p.id, name: p.name }]));
    setQuery(null); caretAt(before.length);
  };
  const insert = (s) => {
    const caret = ref.current?.selectionStart ?? text.length;
    const lead = s === '@' && caret > 0 && !/\s/.test(text[caret - 1]) ? ' @' : s;
    setText(text.slice(0, caret) + lead + text.slice(caret));
    if (s === '@') { setQuery(''); setPick(0); }
    caretAt(caret + lead.length);
  };
  const onKeyNav = (e) => {
    if (query == null || !matches.length) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setPick(i => (i + 1) % matches.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setPick(i => (i - 1 + matches.length) % matches.length); return true; }
    if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') { e.preventDefault(); choose(matches[pick]); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null); return true; }
    return false;
  };
  const reset = () => { setText(''); setTagged([]); setQuery(null); };
  const mentions = () => tagged.filter(p => text.includes(`@${p.name}`));
  return { text, setText, ref, query, setQuery, matches, pick, setPick, onChange, choose, insert, onKeyNav, reset, mentions };
}

function MentionMenu({ m }) {
  if (m.query == null || !m.matches.length) return null;
  return (
    <div className="absolute left-2 right-2 top-full mt-1 z-20 rounded-xl border border-gray-200 bg-white shadow-xl py-1" role="listbox" aria-label="Tag someone">
      {m.matches.map((p, i) => (
        <button key={p.id} type="button" role="option" aria-selected={i === m.pick}
          onMouseDown={(e) => { e.preventDefault(); m.choose(p); }} onMouseEnter={() => m.setPick(i)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${i === m.pick ? 'bg-[#0808f8]/10' : ''}`}>
          <Avatar person={p} size={22} /> <span className="truncate">{p.name}</span>
          {p.rank === 0 && <span className="ml-auto text-[10px] text-gray-400">on this task</span>}
          {p.rank === 1 && <span className="ml-auto text-[10px] text-gray-400">requester</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * The writing box — for a new update, a reply or an edit. compact: starts as one line ("Write a reply…") and opens on click.
 * onSubmit({ text, mentions, files }) → false keeps what was typed.
 */
function Composer({ people, meP, placeholder, compact = false, initial = '', allowFiles = true, submitLabel = 'Update', hint, onSubmit, onCancel, autoFocus = false }) {
  const m = useMentions(people, initial);
  const [open, setOpen] = useState(!compact || !!initial);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (open && (autoFocus || compact)) requestAnimationFrame(() => m.ref.current?.focus()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // grow with the text
  useEffect(() => { const el = m.ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(260, el.scrollHeight)}px`; }, [m.text, open, m.ref]);
  // copy now: a FileList empties when the input is reset or the drop event ends
  const addFiles = (list) => { if (!allowFiles) return; const picked = [...(list || [])]; if (picked.length) setFiles(f => [...f, ...picked].slice(0, 5)); };
  const canSend = (m.text.trim() || files.length) && !busy;
  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const ok = await onSubmit({ text: m.text.trim(), mentions: m.mentions(), files });
      if (ok !== false) { m.reset(); setFiles([]); setEmoji(false); if (compact) setOpen(false); }
    } finally { setBusy(false); }
  };
  const onKey = (e) => {
    if (m.onKeyNav(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); return; }
    if (e.key === 'Escape' && (compact || onCancel) && !m.text.trim()) { e.preventDefault(); e.stopPropagation(); if (onCancel) onCancel(); else setOpen(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full flex items-center gap-2.5 text-left">
        {meP && <Avatar person={meP} size={26} />}
        <span className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-[13px] text-gray-400 hover:border-gray-300">{placeholder}</span>
      </button>
    );
  }
  return (
    <div className={`flex gap-2.5 ${compact ? '' : ''}`}>
      {compact && meP && <Avatar person={meP} size={26} />}
      <div className={`relative flex-1 min-w-0 rounded-xl border bg-white transition-shadow ${drag ? 'border-[#0808f8] ring-2 ring-[#0808f8]/15' : 'border-gray-200 focus-within:border-[#0808f8]/50 focus-within:ring-2 focus-within:ring-[#0808f8]/10'}`}
        onDragOver={(e) => { if (allowFiles && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDrag(true); } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { if (!allowFiles) return; e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}>
        <textarea ref={m.ref} value={m.text} onChange={m.onChange} onKeyDown={onKey} rows={compact ? 1 : 3} placeholder={placeholder}
          onBlur={() => setTimeout(() => m.setQuery(null), 150)}
          onClick={(e) => m.setQuery(mentionQuery(m.text, e.target.selectionStart))}
          onPaste={(e) => { const pics = [...(e.clipboardData?.files || [])]; if (pics.length && allowFiles) { e.preventDefault(); addFiles(pics); } }}
          className="w-full text-[13.5px] leading-relaxed px-3.5 pt-2.5 pb-1 resize-none rounded-xl focus:outline-none bg-transparent" />
        <MentionMenu m={m} />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 text-[11.5px] font-semibold bg-gray-100 text-gray-700 rounded-lg pl-2 pr-1 py-1 max-w-[220px]">
                {f.type?.startsWith('image/') ? <ImageIcon size={12} className="flex-none" /> : <Paperclip size={12} className="flex-none" />}
                <span className="truncate">{f.name}</span><span className="text-gray-400 font-normal flex-none">{fileSize(f.size)}</span>
                <button type="button" onClick={() => setFiles(x => x.filter((_, j) => j !== i))} className="p-0.5 rounded hover:bg-gray-200 flex-none" aria-label={`Remove ${f.name}`}><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        {m.mentions().length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pb-1.5">
            {m.mentions().map(p => <span key={p.id} className="text-[11px] font-semibold text-white bg-[#0808f8] rounded-full px-2 py-0.5">@{p.name} will be notified</span>)}
          </div>
        )}
        {drag && <div className="absolute inset-0 rounded-xl bg-[#0808f8]/5 flex items-center justify-center text-[12.5px] font-semibold text-[#0808f8] pointer-events-none">Drop to attach</div>}
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <button type="button" onClick={() => m.insert('@')} title="Mention someone" aria-label="Mention someone" className="p-1.5 rounded-lg text-gray-500 hover:text-[#0808f8] hover:bg-[#0808f8]/10"><AtSign size={15} /></button>
          {allowFiles && <>
            <button type="button" onClick={() => fileRef.current?.click()} title="Attach files (or drop / paste them)" aria-label="Attach files" className="p-1.5 rounded-lg text-gray-500 hover:text-[#0808f8] hover:bg-[#0808f8]/10"><Paperclip size={15} /></button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </>}
          <span className="relative">
            <button type="button" onClick={() => setEmoji(v => !v)} title="Emoji" aria-label="Emoji" className={`p-1.5 rounded-lg hover:text-[#0808f8] hover:bg-[#0808f8]/10 ${emoji ? 'text-[#0808f8] bg-[#0808f8]/10' : 'text-gray-500'}`}><Smile size={15} /></button>
            {emoji && (
              <span className="absolute left-0 bottom-full mb-1 z-20 grid grid-cols-6 gap-0.5 p-1.5 rounded-xl border border-gray-200 bg-white shadow-xl w-[200px]">
                {EMOJI.map(e => <button key={e} type="button" onMouseDown={(ev) => { ev.preventDefault(); m.insert(e); setEmoji(false); }} className="text-[18px] leading-none p-1.5 rounded-lg hover:bg-gray-100">{e}</button>)}
              </span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline text-[10.5px] text-gray-400">{hint || '⌘ Enter'}</span>
            {onCancel && <button type="button" onClick={onCancel} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100">Cancel</button>}
            <button type="button" onClick={submit} disabled={!canSend}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 shadow-sm" style={{ background: BLUE }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {submitLabel}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── One update ─────────────────────────────────────────────────────────────────────────────────────────────────────
function Pill({ label, color }) {
  if (!label) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-400">empty</span>;
  return <span className="text-[11.5px] font-semibold px-2.5 py-0.5 rounded text-white whitespace-nowrap" style={{ background: color || '#c4c4c4' }}>{label}</span>;
}

function ChangeRow({ u, change, ctx }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-[12.5px] text-gray-600">
      <Avatar person={ctx.personOf(u.by)} size={22} />
      <span><b className="text-gray-800">{firstName(u.by?.name) || 'Someone'}</b> changed <b className="text-gray-800">{change.column}</b></span>
      <Pill label={change.from} color={ctx.colorOf(change.from)} />
      <ArrowRight size={13} className="text-gray-400" />
      <Pill label={change.to} color={ctx.colorOf(change.to)} />
      <span className="ml-auto text-[11.5px] text-gray-400" title={fullDate(u.at)}>{ago(u.at)}</span>
    </div>
  );
}

function Menu({ items, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-[5]" onClick={onClose} />
      <div className="absolute right-0 top-8 z-[6] w-48 rounded-xl border border-gray-200 bg-white shadow-xl py-1 text-[13px]">
        {items.filter(Boolean).map(([Icon, label, fn]) => (
          <button key={label} type="button" onClick={() => { onClose(); fn(); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50">
            <Icon size={14} className="text-gray-400" /> {label}
          </button>
        ))}
      </div>
    </>
  );
}

function LikeButton({ u, ctx, small }) {
  const liked = !!ctx.myId && u.likes.some(l => l.id === ctx.myId);
  const names = u.likes.map(l => l.name || ctx.personOf({ id: l.id }).name).filter(Boolean);
  return (
    <button type="button" disabled={ctx.readOnly} onClick={() => ctx.onLike(u, !liked)}
      title={names.length ? `Liked by ${names.join(', ')}` : (ctx.myId ? 'Like' : 'Connect your Monday to like')}
      className={`flex items-center gap-1.5 ${small ? 'text-[11.5px] px-1.5 py-0.5' : 'text-[12.5px] px-2.5 py-1.5'} rounded-lg font-semibold transition-colors disabled:opacity-60 ${liked ? 'text-[#0808f8] bg-[#0808f8]/10' : 'text-gray-500 hover:bg-gray-100'}`}>
      <ThumbsUp size={small ? 12 : 14} className={liked ? 'fill-[#0808f8]/20' : ''} /> {liked ? 'Liked' : 'Like'}{u.likes.length ? <span className="tabular-nums">· {u.likes.length}</span> : null}
    </button>
  );
}

function Reply({ r, ctx }) {
  return (
    <div className="flex gap-2.5">
      <Avatar person={ctx.personOf(r.by)} size={26} />
      <div className="min-w-0 flex-1">
        <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
          <div className="text-[12px] mb-0.5"><b className="text-gray-900">{r.by?.name || 'Monday'}</b> <span className="text-gray-400" title={fullDate(r.at)}>{ago(r.at)}</span></div>
          <div className="text-[13px]"><Body u={r} /></div>
          {r.files?.length > 0 && <div className="mt-2"><Files files={r.files} openImage={ctx.openImage} compact /></div>}
        </div>
        <div className="mt-0.5"><LikeButton u={r} ctx={ctx} small /></div>
      </div>
    </div>
  );
}

function UpdateCard({ u, ctx }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [allReplies, setAllReplies] = useState(false);
  const replies = useMemo(() => [...(u.replies || [])].sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))), [u.replies]);
  const hidden = allReplies ? 0 : Math.max(0, replies.length - 3);
  const own = !!ctx.myId && u.by?.id === ctx.myId;
  const simple = !/<(table|ul|ol|img)\b/i.test(u.html || '');
  const link = updateLink(ctx.it.monday_url, u.id);
  const copy = (s, what) => navigator.clipboard?.writeText(s).then(() => ctx.flash(`${what} copied`)).catch(() => null);
  const seenNames = u.seen.map(s => s.name || ctx.personOf({ id: s.id }).name).filter(Boolean);

  return (
    <article className={`rounded-2xl border bg-white shadow-[0_1px_2px_rgba(3,11,46,.04)] ${u.pinned ? 'border-amber-200' : 'border-gray-200'}`}>
      {u.pinned && <div className="flex items-center gap-1.5 px-4 pt-2.5 text-[11px] font-bold uppercase tracking-wider text-amber-600"><Pin size={11} /> Pinned to top</div>}
      <div className="px-4 pt-3.5 pb-3">
        <header className="flex items-center gap-2.5">
          <Avatar person={ctx.personOf(u.by)} size={34} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[14px] font-bold text-gray-900 truncate">{u.by?.name || 'Monday'}</div>
            <div className="text-[11.5px] text-gray-400" title={fullDate(u.at)}>{ago(u.at)}</div>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setMenu(v => !v)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="More"><MoreHorizontal size={16} /></button>
            {menu && <Menu onClose={() => setMenu(false)} items={[
              [Copy, 'Copy text', () => copy(String(u.text || '').replace(/﻿/g, '').trim(), 'Text')],
              link && [Link2, 'Copy link', () => copy(link, 'Link')],
              link && [ExternalLink, 'Open on Monday', () => window.open(link, '_blank', 'noopener')],
              own && simple && !ctx.readOnly && [Pencil, 'Edit', () => setEditing(true)],
            ]} />}
          </div>
        </header>
        <div className="mt-2.5 text-[13.5px] text-gray-800">
          {editing ? (
            <Composer people={ctx.people} initial={String(u.text || '').replace(/﻿/g, '').trim()} allowFiles={false} submitLabel="Save" hint="⌘ Enter to save" autoFocus
              onCancel={() => setEditing(false)} onSubmit={async (p) => { const ok = await ctx.onEdit(u, p); if (ok) setEditing(false); return ok; }} />
          ) : <Body u={u} />}
        </div>
        {u.files?.length > 0 && <div className="mt-3"><Files files={u.files} openImage={ctx.openImage} /></div>}
      </div>

      <footer className="flex items-center gap-1 px-2.5 py-1.5 border-t border-gray-100">
        <LikeButton u={u} ctx={ctx} />
        {!ctx.readOnly && <button type="button" onClick={() => setReplying(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><MessageCircle size={14} /> Reply</button>}
        {replies.length > 0 && <span className="text-[11.5px] text-gray-400 px-1">{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</span>}
        {u.seen.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11.5px] text-gray-400 pr-1.5" title={`Seen by ${seenNames.join(', ')}`}>
            <Eye size={13} /> {u.seen.length}
          </span>
        )}
      </footer>

      {(replies.length > 0 || replying) && (
        <div className="border-t border-gray-100 bg-gray-50/70 rounded-b-2xl px-4 py-3 flex flex-col gap-2.5">
          {hidden > 0 && <button type="button" onClick={() => setAllReplies(true)} className="self-start flex items-center gap-1 text-[12px] font-semibold text-[#0808f8] hover:underline"><ChevronDown size={13} /> Show {hidden} earlier repl{hidden === 1 ? 'y' : 'ies'}</button>}
          {replies.slice(hidden).map(r => <Reply key={r.id} r={r} ctx={ctx} />)}
          {!ctx.readOnly && (
            <Composer key={replying ? 'open' : 'closed'} compact={!replying} autoFocus={replying} people={ctx.people} meP={ctx.meP} placeholder="Write a reply and mention others with @" submitLabel="Reply"
              onCancel={replying ? () => setReplying(false) : undefined}
              onSubmit={async (p) => { const ok = await ctx.onReply(u, p); if (ok) setReplying(false); return ok; }} />
          )}
        </div>
      )}
    </article>
  );
}

// ── Activity ───────────────────────────────────────────────────────────────────────────────────────────────────────
const range = (r) => (!r ? '' : !r.to || r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} – ${fmtDay(r.to)}`);
function ActivityLine({ e, ctx }) {
  const who = <b className="text-gray-800">{firstName(e.by?.name || ctx.personOf(e.by).name) || 'Monday'}</b>;
  const names = (list) => list.map((p, i) => <Fragment key={p.id}>{i ? ', ' : ''}<b className="text-gray-800">{firstName(p.name || ctx.personOf(p).name) || 'someone'}</b></Fragment>);
  switch (e.kind) {
    case 'created': return <span>{who} created the task</span>;
    case 'status': return <span className="inline-flex flex-wrap items-center gap-1.5">{who} {e.from ? 'moved it' : 'set it to'} {e.from && <><Pill label={e.from} color={ctx.colorOf(e.from)} /><ArrowRight size={12} className="text-gray-400" /></>}<Pill label={e.to} color={ctx.colorOf(e.to)} /></span>;
    case 'people': return <span>{who}{e.added.length ? <> put {names(e.added)} on it</> : null}{e.added.length && e.removed.length ? ' ·' : ''}{e.removed.length ? <> took {names(e.removed)} off it</> : null}</span>;
    case 'timeline': return <span>{who} {!e.to ? 'cleared the timeline' : !e.from ? <>set the timeline to <b className="text-gray-800">{range(e.to)}</b></> : <>moved the timeline <span className="line-through text-gray-400">{range(e.from)}</span> → <b className="text-gray-800">{range(e.to)}</b></>}</span>;
    case 'deadline': return <span>{who} {!e.to ? 'cleared the deadline' : !e.from ? <>set the deadline to <b className="text-gray-800">{fmtDay(e.to)}</b></> : <>moved the deadline <span className="line-through text-gray-400">{fmtDay(e.from)}</span> → <b className="text-gray-800">{fmtDay(e.to)}</b></>}</span>;
    default: return null;
  }
}

function ActivityTab({ act, ctx }) {
  if (act == null) return <Loading line="Reading the task’s history from Monday…" />;
  if (act.error) return <div className="text-[12.5px] text-red-600">{act.error}</div>;
  if (!act.length) return <Empty icon={History} title="No history yet" line="Status moves, people and date changes show here." />;
  const days = [];
  for (const e of act) { const d = dayLabel(e.at); const last = days[days.length - 1]; if (last?.d === d) last.rows.push(e); else days.push({ d, rows: [e] }); }
  return (
    <div className="flex flex-col gap-4">
      {days.map(day => (
        <section key={day.d}>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{day.d}</div>
          <ol className="relative border-l-2 border-gray-100 ml-3 flex flex-col gap-3">
            {day.rows.map(e => (
              <li key={e.id} className="relative pl-5">
                <span className="absolute -left-[13px] top-0"><Avatar person={ctx.personOf(e.by)} size={22} ring="#fff" /></span>
                <div className="flex items-start gap-2 text-[12.5px] text-gray-600 leading-relaxed">
                  <div className="flex-1 min-w-0"><ActivityLine e={e} ctx={ctx} /></div>
                  <span className="flex-none text-[11px] text-gray-400 pt-0.5">{timeOf(e.at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

// ── Bits ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function Loading({ line }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {[0, 1].map(i => (
        <div key={i} className="rounded-2xl border border-gray-100 p-4 animate-pulse">
          <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-gray-100" /><div className="h-3 w-28 rounded bg-gray-100" /></div>
          <div className="mt-3 h-3 w-full rounded bg-gray-100" /><div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
        </div>
      ))}
      <div className="text-[11.5px] text-gray-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {line}</div>
    </div>
  );
}
function Empty({ icon: Icon, title, line }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 py-10 px-6 text-center">
      <div className="mx-auto w-11 h-11 rounded-2xl flex items-center justify-center text-[#0808f8] bg-[#0808f8]/10"><Icon size={20} /></div>
      <div className="mt-3 text-[14px] font-bold text-gray-800">{title}</div>
      <div className="mt-1 text-[12.5px] text-gray-500">{line}</div>
    </div>
  );
}

// ── The panel ──────────────────────────────────────────────────────────────────────────────────────────────────────
export default function TaskUpdates({ it, data, readOnly = false }) {
  const me = useMondayStatus();
  const [tab, setTab] = useState('updates');
  const [st, setSt] = useState({ list: null, files: [], itemName: '', more: false, page: 1 });
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [box, setBox] = useState(null);
  const [act, setAct] = useState(null);
  const noteTimer = useRef(null);

  const flash = useCallback((s) => { setNote(s); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(null), 4000); }, []);
  const load = useCallback(async () => {
    try {
      const r = await studioApi.updates(it.id, 1);
      setSt({ list: r.updates || [], files: r.files || [], itemName: r.item_name || it.name, more: !!r.more, page: 1 });
      setErr(null);
    } catch (e) { setErr(e.message); setSt(s => ({ ...s, list: s.list || [] })); }
  }, [it.id, it.name]);
  useEffect(() => { setSt({ list: null, files: [], itemName: '', more: false, page: 1 }); setAct(null); setTab('updates'); setQ(''); setFilter('all'); load(); }, [it.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== 'activity' || act != null) return;
    studioApi.activity(it.id).then(r => setAct(r.events || [])).catch(e => setAct({ error: e.message }));
  }, [tab, act, it.id]);

  const loadMore = async () => {
    setMoreBusy(true);
    try {
      const r = await studioApi.updates(it.id, st.page + 1);
      setSt(s => { const seen = new Set(s.list.map(u => u.id)); return { ...s, list: [...s.list, ...(r.updates || []).filter(u => !seen.has(u.id))], more: !!r.more, page: s.page + 1 }; });
    } catch (e) { setErr(e.message); } finally { setMoreBusy(false); }
  };

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

  const statuses = data.boards?.[it.board]?.statuses || [];
  const labels = useMemo(() => statuses.map(s => s.label), [statuses]);
  const myId = me?.connected && me.monday_user_id ? String(me.monday_user_id) : null;
  const personOf = useCallback((by) => (by?.id && (data.people?.[by.id] || data.requesters?.[by.id])) || { name: by?.name || 'Monday' }, [data]);
  const meP = myId ? { ...personOf({ id: myId }), name: personOf({ id: myId }).name !== 'Monday' ? personOf({ id: myId }).name : (me?.name || 'You') } : { name: me?.name || 'You' };
  const colorOf = useCallback((label) => statuses.find(s => String(s.label).toLowerCase() === String(label || '').toLowerCase())?.color || null, [statuses]);
  const changeOf = useCallback((u) => parseChange(u, st.itemName || it.name, labels), [st.itemName, it.name, labels]);

  // one update (or reply) changed in place
  const patch = (id, fn) => setSt(s => ({ ...s, list: (s.list || []).map(u => (u.id === id ? fn(u) : { ...u, replies: (u.replies || []).map(r => (r.id === id ? fn(r) : r)) })) }));

  const ctx = {
    it, data, readOnly, people, myId, meP, personOf, colorOf, flash,
    openImage: (f, list) => setBox({ list, index: Math.max(0, list.indexOf(f)) }),
    onLike: async (u, on) => {
      if (!myId) { flash('Connect your Monday (top of the Studio) to like — a like shows your name'); return; }
      patch(u.id, x => ({ ...x, likes: on ? [...x.likes, { id: myId, name: meP.name }] : x.likes.filter(l => l.id !== myId) }));
      try { await studioApi.likeUpdate(it.id, u.id, on); } catch (e) {
        patch(u.id, x => ({ ...x, likes: on ? x.likes.filter(l => l.id !== myId) : [...x.likes, { id: myId, name: meP.name }] }));
        flash(e.message);
      }
    },
    onReply: async (u, p) => {
      try {
        const r = await studioApi.postUpdate(it.id, { ...p, parentId: u.id });
        if (r?.refused) flash('Monday didn’t accept your connection, so CP’s account posted it with your name. Reconnect your Monday.');
        else if (r?.failed?.length) flash(`${r.failed.length} file${r.failed.length === 1 ? '' : 's'} didn’t upload — ${r.failed[0]}`);
        await load();
        return true;
      } catch (e) { flash(e.message); return false; }
    },
    onEdit: async (u, p) => {
      try { const r = await studioApi.editUpdate(it.id, u.id, p.text, p.mentions); patch(u.id, x => ({ ...x, html: r.html || x.html, text: p.text })); flash('Updated on Monday'); return true; } catch (e) { flash(e.message); return false; }
    },
  };

  const post = async (p) => {
    try {
      const r = await studioApi.postUpdate(it.id, p);
      if (r?.refused) flash('Monday didn’t accept your connection, so CP’s account posted it with your name. Reconnect your Monday.');
      else if (r?.failed?.length) flash(`${r.failed.length} file${r.failed.length === 1 ? '' : 's'} didn’t upload — ${r.failed[0]}`);
      else flash(r?.as_user ? 'Posted on Monday as you' : 'Posted on Monday');
      await load();
      return true;
    } catch (e) { flash(e.message); return false; }
  };

  const list = st.list;
  const ordered = useMemo(() => orderUpdates(list || []), [list]);
  const anyChange = useMemo(() => ordered.some(u => changeOf(u)), [ordered, changeOf]);
  const shown = useMemo(() => filterUpdates(ordered, {
    q, filter, isChange: (u) => !!changeOf(u),
    textOf: (u) => { const c = changeOf(u); return c ? `${c.column} ${c.from} ${c.to}` : u.text; },   // a status line's text repeats the task name
  }), [ordered, q, filter, changeOf]);
  const tabs = [['updates', MessageSquare, 'Updates', list ? `${list.length}${st.more ? '+' : ''}` : null], ['files', Paperclip, 'Files', st.files.length || null], ['activity', History, 'Activity', null]];

  return (
    <section className="flex flex-col gap-3.5" aria-label="Updates">
      <div className="flex items-center gap-1 border-b border-gray-200 -mx-1" role="tablist">
        {tabs.map(([k, Icon, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors ${tab === k ? 'text-[#030b2e]' : 'text-gray-500 hover:text-gray-800'}`}>
            <Icon size={14} /> {label}{n ? <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${tab === k ? 'bg-[#0808f8]/10 text-[#0808f8]' : 'bg-gray-100 text-gray-500'}`}>{n}</span> : null}
            {tab === k && <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full" style={{ background: BLUE }} />}
          </button>
        ))}
      </div>

      {note && <div className="text-[12px] font-semibold text-[#030b2e] bg-[#0808f8]/[0.07] rounded-lg px-3 py-2" role="status">{note}</div>}

      {tab === 'updates' && (
        <>
          {readOnly
            ? <div className="text-[12px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">View only — open the task on Monday to write an update.</div>
            : <Composer people={people} meP={meP} placeholder="Write an update and mention others with @" submitLabel="Update"
                hint={`⌘ Enter · ${me?.connected ? 'posts as you on Monday' : 'signed with your name'}`} onSubmit={post} />}

          {list && list.length >= 4 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex-1 min-w-[160px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search updates, people, files" aria-label="Search updates"
                  className="w-full text-[12.5px] pl-8 pr-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#0808f8]/50" />
              </label>
              {anyChange && (
                <span className="flex rounded-lg border border-gray-200 p-0.5 text-[11.5px] font-semibold">
                  {[['all', 'All'], ['comments', 'Comments'], ['changes', 'Status changes']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setFilter(k)} className={`px-2 py-1 rounded-md ${filter === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:text-gray-800'}`}>{l}</button>
                  ))}
                </span>
              )}
            </div>
          )}

          {err && <div className="text-[12px] text-red-600">{err}</div>}
          {!list && !err && <Loading line="Loading from Monday…" />}
          {list && !list.length && !err && <Empty icon={MessageSquare} title="No updates yet" line={readOnly ? 'Nothing has been written on this task.' : 'Write the first one — it’s posted on the Monday task.'} />}
          {list && list.length > 0 && !shown.length && <div className="text-[12.5px] text-gray-500 text-center py-6">Nothing matches “{q}”.</div>}
          <div className="flex flex-col gap-3">
            {shown.map(u => { const c = changeOf(u); return c ? <ChangeRow key={u.id} u={u} change={c} ctx={ctx} /> : <UpdateCard key={u.id} u={u} ctx={ctx} />; })}
          </div>
          {st.more && !q && filter === 'all' && (
            <button type="button" onClick={loadMore} disabled={moreBusy} className="self-center flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:border-[#0808f8]/40 hover:text-[#0808f8] disabled:opacity-60">
              {moreBusy ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={13} />} Show older updates
            </button>
          )}
        </>
      )}

      {tab === 'files' && (
        !list ? <Loading line="Loading from Monday…" />
          : st.files.length ? (
            <div className="flex flex-col gap-2">
              <div className="text-[12px] text-gray-500">{st.files.length} file{st.files.length === 1 ? '' : 's'} on this task — from its updates and file columns. Click to open or download.</div>
              <Files files={st.files} openImage={ctx.openImage} gallery />
            </div>
          ) : <Empty icon={Paperclip} title="No files yet" line={readOnly ? 'Nobody has attached a file to this task.' : 'Attach one to an update — drop it in, paste it or use the 📎.'} />
      )}

      {tab === 'activity' && <ActivityTab act={act} ctx={ctx} />}

      {box && <Lightbox box={box} onClose={() => setBox(null)} />}
    </section>
  );
}
