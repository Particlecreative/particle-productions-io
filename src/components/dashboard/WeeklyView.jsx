import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Link2,
  ExternalLink, Presentation, Clock, Edit3, ChevronDown,
  Calendar as CalendarIcon, FileText, Copy, Share2,
} from 'lucide-react';
import {
  getWeeklyReports, getWeeklyReport, saveWeeklyReport, deleteWeeklyReport,
  getComments, getLinks, generateId, getProductions,
} from '../../lib/dataService';
import { getHoliday } from '../../lib/holidays';
import { getAllGanttEvents, createGanttEvent, DEFAULT_PHASES } from '../../lib/ganttService';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import StageBadge from '../ui/StageBadge';
import FileUploadButton, { getDriveThumbnail } from '../shared/FileUploadButton';
import clsx from 'clsx';

// ============================================================================
// SHARED DATE HELPERS
// ============================================================================

function getSundayOf(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function getMondayOf(d) { return getSundayOf(d); }

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function fmtWeekLabel(sunday) {
  const saturday = addDays(sunday, 6);
  const lo = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const hi = saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${lo} \u2013 ${hi}`;
}

function fmtShortWeek(monday) {
  const sunday = addDays(monday, 6);
  const lo = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const hi = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${lo}\u2013${hi}`;
}

// ============================================================================
// WEEKLY REPORTS CONSTANTS & HELPERS
// ============================================================================

const STATUSES = [
  { value: 'on_track',  label: 'On Track',  icon: '\uD83D\uDFE2', bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300'  },
  { value: 'pending',   label: 'Pending',   icon: '\u2B1C',       bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300'   },
  { value: 'at_risk',   label: 'At Risk',   icon: '\uD83D\uDFE1', bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300'  },
  { value: 'blocked',   label: 'Blocked',   icon: '\uD83D\uDD34', bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'    },
  { value: 'completed', label: 'Completed', icon: '\uD83D\uDD35', bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300'   },
];

const STATUS_SORT = { on_track: 0, pending: 1, at_risk: 2, blocked: 3, completed: 4 };

function getStatus(val) {
  return STATUSES.find(s => s.value === val) || STATUSES[1];
}

function historyDot(entries) {
  if (!entries?.length) return 'bg-gray-300';
  return 'bg-blue-400';
}

function buildEmptyEntry(prod) {
  return {
    production_id: prod.id,
    note: '',
    selected_comment_ids: [],
    approved_comment_ids: [],
    weekly_links: [],
  };
}

function overlapsWeek(prod, weekStart, weekEnd) {
  const start = prod.planned_start ? new Date(prod.planned_start + 'T00:00:00') : null;
  const end   = prod.planned_end   ? new Date(prod.planned_end   + 'T00:00:00') : null;
  if (!start && !end) return true;
  if (start && start > weekEnd)   return false;
  if (end   && end   < weekStart) return false;
  return true;
}

// ============================================================================
// CALENDAR CONSTANTS
// ============================================================================

const PRODUCTION_COLORS = ['#0808f8','#030b2e','#27AE60','#F5A623','#E74C3C','#9B59B6','#3498DB','#00BCD4'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20
const DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  // Leading blanks from previous month
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    cells.push({ date: d, outside: true });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), outside: false });
  }
  // Trailing to fill 6 rows
  while (cells.length < 42) {
    const d = cells.length - startDay - daysInMonth + 1;
    cells.push({ date: new Date(year, month + 1, d), outside: true });
  }
  return cells;
}

function getWeekDates(anchorDate) {
  const sunday = getSundayOf(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

function isWeekend(date) {
  const d = date.getDay();
  return d === 5 || d === 6; // Fri, Sat
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventOverlapsDate(ev, dateStr) {
  return ev.start <= dateStr && ev.end >= dateStr;
}

function eventOverlapsRange(ev, rangeStart, rangeEnd) {
  return ev.start <= rangeEnd && ev.end >= rangeStart;
}

function phaseColor(phase) {
  const p = DEFAULT_PHASES.find(ph => ph.id === phase || ph.name === phase);
  return p ? p.color : '#6B7280';
}

// ============================================================================
// StatusBadge
// ============================================================================

function StatusBadge({ status }) {
  const s = getStatus(status);
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold', s.bg, s.text)}>
      {s.icon} {s.label}
    </span>
  );
}

// ============================================================================
// StatusDropdown
// ============================================================================

function StatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const s = getStatus(value);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={clsx(
          'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all',
          s.bg, s.text, s.border
        )}
      >
        {s.icon} {s.label} <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[130px]">
          {STATUSES.map(st => (
            <button
              key={st.value}
              onClick={e => { e.stopPropagation(); onChange(st.value); setOpen(false); }}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors',
                st.value === value && 'bg-gray-50 font-semibold'
              )}
            >
              {st.icon} {st.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ProductionEntry (edit mode)
// ============================================================================

function ProductionEntry({ entry, prod, links, onUpdate, onRemove, isEditor }) {
  const [showLinks, setShowLinks] = useState(false);
  const [addLinkMode, setAddLinkMode] = useState(null);
  const [customLink, setCustomLink] = useState({ title: '', url: '' });
  const [collapsed, setCollapsed] = useState(false);
  const [editingBulletLink, setEditingBulletLink] = useState(null);
  const [bulletLinkDraft, setBulletLinkDraft] = useState('');
  const bulletRef = useRef(null);

  if (!prod) return null;

  // Backward compat: use long_text or fall back to note
  const longText = entry.long_text ?? entry.note ?? '';
  const bullets = entry.bullets || [];

  function addBullet() {
    const next = [...bullets, { id: crypto.randomUUID(), text: '', link: '' }];
    onUpdate({ bullets: next });
    setTimeout(() => bulletRef.current?.focus(), 50);
  }
  function updateBullet(id, patch) {
    onUpdate({ bullets: bullets.map(b => b.id === id ? { ...b, ...patch } : b) });
  }
  function removeBullet(id) {
    onUpdate({ bullets: bullets.filter(b => b.id !== id) });
  }
  function saveBulletLink(id) {
    updateBullet(id, { link: bulletLinkDraft.trim() });
    setEditingBulletLink(null);
    setBulletLinkDraft('');
  }

  function addProductionLink(link) {
    if ((entry.weekly_links || []).some(l => l.link_id === link.id)) return;
    onUpdate({
      weekly_links: [...(entry.weekly_links || []), {
        id: generateId('wl'), type: 'production', link_id: link.id,
        title: link.title || link.url, url: link.url, approved: false,
      }],
    });
    setAddLinkMode(null);
  }
  function addCustomLink() {
    if (!customLink.url.trim()) return;
    onUpdate({
      weekly_links: [...(entry.weekly_links || []), {
        id: generateId('wl'), type: 'custom', link_id: null,
        title: customLink.title.trim() || customLink.url, url: customLink.url.trim(), approved: false,
      }],
    });
    setCustomLink({ title: '', url: '' });
    setAddLinkMode(null);
  }
  function removeLink(wlId) {
    onUpdate({ weekly_links: (entry.weekly_links || []).filter(l => l.id !== wlId) });
  }

  const availableLinks = links.filter(l => !(entry.weekly_links || []).some(wl => wl.link_id === l.id));

  return (
    <div className="rounded-2xl border-l-4 bg-white shadow-sm border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <StageBadge stage={prod.stage} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
            <span className="font-bold text-gray-800 text-sm truncate">{prod.project_name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded text-gray-300 hover:text-gray-500 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}>
            <ChevronDown size={15} className={clsx('transition-transform', collapsed && '-rotate-90')} />
          </button>
          {isEditor && (
            <button onClick={onRemove} className="p-1 rounded text-gray-300 hover:text-red-400 transition-colors" title="Remove from weekly">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">

          {/* Notes (long text) */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Notes</label>
            {isEditor ? (
              <textarea
                value={longText}
                onChange={e => onUpdate({ long_text: e.target.value })}
                placeholder="Status update, key decisions, blockers\u2026"
                rows={2}
                className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:border-[var(--brand-accent)] transition-colors placeholder-gray-300"
              />
            ) : longText ? (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{longText}</p>
            ) : null}
          </div>

          {/* Key Points (bullets) */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Key Points</label>
            <div className="space-y-1">
              {bullets.map((b, i) => (
                <div key={b.id} className="group flex items-start gap-2 py-1 rounded-lg hover:bg-gray-50 px-1 -mx-1 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--brand-accent)', opacity: 0.6 }} />
                  <div className="flex-1 min-w-0">
                    {isEditor ? (
                      <input
                        ref={i === bullets.length - 1 ? bulletRef : undefined}
                        className="w-full text-sm text-gray-700 bg-transparent border-none outline-none placeholder:text-gray-300"
                        placeholder="Key point\u2026"
                        value={b.text}
                        onChange={e => updateBullet(b.id, { text: e.target.value })}
                      />
                    ) : (
                      <span className="text-sm text-gray-700">{b.text}</span>
                    )}
                    {editingBulletLink === b.id && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input autoFocus className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-300"
                          placeholder="https://\u2026" value={bulletLinkDraft}
                          onChange={e => setBulletLinkDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveBulletLink(b.id); if (e.key === 'Escape') setEditingBulletLink(null); }} />
                        <button onClick={() => saveBulletLink(b.id)} className="p-1 rounded hover:bg-green-50 text-green-500"><Check size={13} /></button>
                        <button onClick={() => setEditingBulletLink(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={13} /></button>
                      </div>
                    )}
                  </div>
                  {b.link && editingBulletLink !== b.id && (
                    <a href={b.link} target="_blank" rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors flex-shrink-0" title={b.link}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {isEditor && editingBulletLink !== b.id && (
                    <div className="flex items-center gap-0.5 sm:opacity-0 opacity-60 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => { setEditingBulletLink(b.id); setBulletLinkDraft(b.link || ''); }}
                        className={`p-1 rounded hover:bg-blue-50 transition-colors ${b.link ? 'text-blue-400' : 'text-gray-300 hover:text-blue-400'}`}
                        title={b.link ? 'Edit link' : 'Add link'}>
                        <Link2 size={11} />
                      </button>
                      <button onClick={() => removeBullet(b.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors" title="Remove">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {isEditor && (
              <button onClick={addBullet}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-[var(--brand-accent)] transition-colors mt-1.5 py-0.5">
                <Plus size={12} /> Add point
              </button>
            )}
          </div>

          {/* Links */}
          <div>
            <button onClick={() => setShowLinks(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
              <ChevronDown size={11} className={clsx('transition-transform', !showLinks && '-rotate-90')} />
              Links ({(entry.weekly_links || []).length})
            </button>

            {showLinks && (
              <div className="mt-2 space-y-1.5">
                {(entry.weekly_links || []).map(wl => (
                  <div key={wl.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                    <a href={wl.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-xs text-blue-600 hover:underline truncate flex items-center gap-1">
                      <ExternalLink size={9} className="flex-shrink-0" />
                      {wl.title || wl.url}
                    </a>
                    {isEditor && (
                      <button onClick={() => removeLink(wl.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}

                {addLinkMode === null && isEditor && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setAddLinkMode('production')} disabled={availableLinks.length === 0}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all disabled:opacity-40">
                      + From production
                    </button>
                    <button onClick={() => setAddLinkMode('custom')}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all">
                      + Custom link
                    </button>
                  </div>
                )}

                {addLinkMode === 'production' && (
                  <div className="space-y-1 pt-1">
                    {availableLinks.map(l => (
                      <button key={l.id} onClick={() => addProductionLink(l)}
                        className="w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
                        <Link2 size={10} className="text-blue-500 flex-shrink-0" />
                        <span className="truncate text-blue-700">{l.title || l.url}</span>
                      </button>
                    ))}
                    <button onClick={() => setAddLinkMode(null)} className="text-[11px] text-gray-400 hover:text-gray-600 mt-1">Cancel</button>
                  </div>
                )}

                {addLinkMode === 'custom' && (
                  <div className="space-y-2 pt-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <input autoFocus type="text" placeholder="Title (optional)" value={customLink.title}
                      onChange={e => setCustomLink(p => ({ ...p, title: e.target.value }))}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--brand-accent)]" />
                    <input type="url" placeholder="https://\u2026" value={customLink.url}
                      onChange={e => setCustomLink(p => ({ ...p, url: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomLink(); if (e.key === 'Escape') setAddLinkMode(null); }}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--brand-accent)]" />
                    <div className="flex gap-2">
                      <button onClick={addCustomLink} className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors">Add</button>
                      <button onClick={() => { setAddLinkMode(null); setCustomLink({ title: '', url: '' }); }} className="text-[11px] text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GeneralUpdatesSection
// ============================================================================

function GeneralUpdatesSection({ updates = [], onUpdate, isEditor, prevWeekUpdates, subfolder }) {
  const [editingLink, setEditingLink] = useState(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const newRef = useRef(null);

  function addDot() {
    const next = [...updates, { id: crypto.randomUUID(), text: '', link: '', file: null }];
    onUpdate(next);
    setTimeout(() => newRef.current?.focus(), 50);
  }

  function updateDot(id, patch) {
    onUpdate(updates.map(d => d.id === id ? { ...d, ...patch } : d));
  }

  function removeDot(id) {
    onUpdate(updates.filter(d => d.id !== id));
  }

  function copyFromLastWeek() {
    if (!prevWeekUpdates?.length) return;
    const copied = prevWeekUpdates.map(d => ({ ...d, id: crypto.randomUUID() }));
    onUpdate([...updates, ...copied]);
  }

  function openLinkEditor(dot) {
    setEditingLink(dot.id);
    setLinkDraft(dot.link || '');
  }

  function saveLink(id) {
    updateDot(id, { link: linkDraft.trim() });
    setEditingLink(null);
    setLinkDraft('');
  }

  function handleFileUploaded(dotId, data) {
    updateDot(dotId, {
      file: {
        name: data.originalFileName || 'File',
        view_url: data.drive?.viewLink || '',
        download_url: data.drive?.downloadLink || '',
        mime_type: data.originalMimeType || '',
      }
    });
  }

  return (
    <>
    <div className="brand-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--brand-accent)' }} />
          <h3 className="text-sm font-bold text-gray-700">General Updates</h3>
          {updates.length > 0 && (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              {updates.length}
            </span>
          )}
        </div>
      </div>

      {/* Dots list */}
      <div className="px-5 py-3">
        {updates.length === 0 && !isEditor && (
          <p className="text-xs text-gray-400 italic py-2">No general updates for this week.</p>
        )}

        <div className="space-y-1">
          {updates.map((dot, i) => (
            <div key={dot.id} className="group rounded-lg hover:bg-gray-50 px-1 -mx-1 py-1.5 transition-colors">
              <div className="flex items-start gap-2">
                {/* Dot marker */}
                <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--brand-accent)', opacity: 0.7 }} />

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {isEditor ? (
                    <input
                      ref={i === updates.length - 1 ? newRef : undefined}
                      className="w-full text-sm text-gray-700 bg-transparent border-none outline-none placeholder:text-gray-300"
                      placeholder="Type an update..."
                      value={dot.text}
                      onChange={e => updateDot(dot.id, { text: e.target.value })}
                    />
                  ) : (
                    <span className="text-sm text-gray-700">{dot.text}</span>
                  )}

                  {/* Link editor popover */}
                  {editingLink === dot.id && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input
                        autoFocus
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-300"
                        placeholder="https://..."
                        value={linkDraft}
                        onChange={e => setLinkDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveLink(dot.id); if (e.key === 'Escape') setEditingLink(null); }}
                      />
                      <button onClick={() => saveLink(dot.id)} className="p-1 rounded hover:bg-green-50 text-green-500"><Check size={13} /></button>
                      <button onClick={() => setEditingLink(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={13} /></button>
                    </div>
                  )}
                </div>

                {/* Link icon */}
                {dot.link && editingLink !== dot.id && (
                  <a href={dot.link} target="_blank" rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors flex-shrink-0" title={dot.link}>
                    <ExternalLink size={13} />
                  </a>
                )}

                {/* Editor controls */}
                {isEditor && editingLink !== dot.id && (
                  <div className="flex items-center gap-0.5 sm:opacity-0 opacity-60 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openLinkEditor(dot)}
                      className={`p-1 rounded hover:bg-blue-50 transition-colors ${dot.link ? 'text-blue-400' : 'text-gray-300 hover:text-blue-400'}`}
                      title={dot.link ? 'Edit link' : 'Add link'}>
                      <Link2 size={12} />
                    </button>
                    <FileUploadButton
                      category="weekly-reports"
                      subfolder={subfolder}
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                      label=""
                      size="sm"
                      className={`!p-1 !px-1 !border-none !shadow-none !bg-transparent ${dot.file ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}
                      onUploaded={data => handleFileUploaded(dot.id, data)}
                    />
                    <button onClick={() => removeDot(dot.id)}
                      className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors" title="Remove">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Attached file display */}
              {dot.file && (
                <div className="ml-4 mt-1.5 flex items-center gap-2">
                  {dot.file.mime_type?.startsWith('image/') ? (
                    <div className="cursor-pointer rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow"
                      onClick={() => setLightbox(dot.file)}>
                      <img src={getDriveThumbnail(dot.file.view_url, 120)} alt={dot.file.name}
                        className="h-16 w-auto object-cover" />
                    </div>
                  ) : (
                    <a href={dot.file.view_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline bg-blue-50 rounded-lg px-2.5 py-1.5">
                      <FileText size={12} />
                      {dot.file.name}
                    </a>
                  )}
                  {isEditor && (
                    <button onClick={() => updateDot(dot.id, { file: null })}
                      className="p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors" title="Remove file">
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        {isEditor && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50">
            <button onClick={addDot}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[var(--brand-accent)] transition-colors py-1">
              <Plus size={13} /> Add update
            </button>
            {prevWeekUpdates?.length > 0 && (
              <button onClick={copyFromLastWeek}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[var(--brand-accent)] transition-colors py-1 ml-2">
                <Copy size={12} /> Copy from last week
              </button>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Image Lightbox */}
    {lightbox && (
      <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
        <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"><X size={20} /></button>
        <img src={getDriveThumbnail(lightbox.view_url, 1200)} alt={lightbox.name} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs bg-black/40 px-3 py-1 rounded-full">{lightbox.name}</div>
      </div>
    )}
    </>
  );
}

// ============================================================================
// CreativeWeeklyLink
// ============================================================================

function CreativeWeeklyLink({ link, onUpdate, isEditor }) {
  const val = link || { label: '', url: '' };

  return (
    <div className="brand-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <h3 className="text-sm font-bold text-gray-700">Creative Weekly Link</h3>
        </div>
      </div>

      <div className="px-5 py-3">
        {isEditor ? (
          <div className="space-y-2">
            <input
              className="w-full text-sm text-gray-700 bg-transparent border-none outline-none placeholder:text-gray-300"
              placeholder="Link title (e.g. Weekly Moodboard)"
              value={val.label}
              onChange={e => onUpdate({ ...val, label: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <Link2 size={13} className="text-gray-300 flex-shrink-0" />
              <input
                className="flex-1 text-xs text-gray-500 bg-transparent border-none outline-none placeholder:text-gray-300"
                placeholder="https://..."
                value={val.url}
                onChange={e => onUpdate({ ...val, url: e.target.value })}
              />
              {val.url && (
                <a
                  href={val.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors flex-shrink-0"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        ) : val.url ? (
          <a
            href={val.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm hover:underline py-1"
            style={{ color: 'var(--brand-accent)' }}
          >
            <ExternalLink size={14} />
            {val.label || val.url}
          </a>
        ) : (
          <p className="text-xs text-gray-400 italic py-1">No creative link set for this week.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PresentCard
// ============================================================================

function PresentCard({ entry, prod }) {
  if (!prod) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-md flex flex-col min-h-[220px]">
      <div className="rounded-t-2xl px-5 py-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <StageBadge stage={prod.stage} />
        </div>
        <h3 className="font-black text-gray-900 text-base leading-tight mt-2">{prod.project_name}</h3>
        <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
      </div>

      <div className="flex-1 px-5 py-4 space-y-3">
        {/* Notes */}
        {(entry.long_text || entry.note) && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{entry.long_text || entry.note}</p>
        )}

        {/* Key Points */}
        {(entry.bullets || []).length > 0 && (
          <div className="space-y-1.5">
            {entry.bullets.map(b => (
              <div key={b.id} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0" style={{ background: 'var(--brand-accent)', opacity: 0.5 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 leading-relaxed">{b.text}</p>
                  {b.link && (
                    <a href={b.link} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] mt-0.5 hover:underline" style={{ color: 'var(--brand-accent)' }}>
                      <ExternalLink size={9} />
                      {(() => { try { return new URL(b.link).hostname; } catch { return 'Link'; } })()}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        {(entry.weekly_links || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {entry.weekly_links.map(wl => (
              <a key={wl.id} href={wl.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-all font-medium">
                🔗 {wl.title || wl.url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PresentationMode
// ============================================================================

function PresentationMode({ report, productions, brand, onClose }) {

  const STAGE_SORT = { 'Production': 0, 'Pre Production': 1, 'Post': 2, 'Pending': 3, 'Paused': 4, 'Completed': 5 };
  const sorted = [...(report.entries || [])].sort((a, b) => {
    const pa = productions.find(p => p.id === a.production_id);
    const pb = productions.find(p => p.id === b.production_id);
    return (STAGE_SORT[pa?.stage] ?? 9) - (STAGE_SORT[pb?.stage] ?? 9);
  });

  const weekDate = (() => {
    try {
      const [y, m, d] = report.week_start.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } catch { return report.week_start; }
  })();

  const generalUpdates = report.general_updates || [];
  const creativeLink = report.creative_link;
  const hasOverview = generalUpdates.length > 0 || creativeLink?.url;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-50 to-white overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-gray-200/80 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm" style={{ background: 'var(--brand-accent)' }}>
            {(brand?.name || 'P')[0]}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">
              {brand?.name || 'Productions'}
            </div>
            <h1 className="text-lg font-black text-gray-900 leading-tight">{report.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-gray-500">{weekDate}</div>
            <div className="text-[10px] text-gray-400">{sorted.length} production{sorted.length !== 1 ? 's' : ''}</div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-100 transition-all"
          >
            <X size={15} />
            Exit
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

        {/* Overview section: General Updates + Creative Link side by side */}
        {hasOverview && (
          <div className={`grid gap-5 ${generalUpdates.length > 0 && creativeLink?.url ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {/* General Updates */}
            {generalUpdates.length > 0 && (
              <div className={`bg-white rounded-2xl border border-gray-200 p-7 shadow-sm ${creativeLink?.url ? 'lg:col-span-2' : ''}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-accent)', opacity: 0.12 }}>
                    <FileText size={15} style={{ color: 'var(--brand-accent)' }} />
                  </div>
                  <h2 className="text-base font-black text-gray-800">General Updates</h2>
                </div>
                <div className="space-y-3">
                  {generalUpdates.map(dot => (
                    <div key={dot.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-[7px] flex-shrink-0" style={{ background: 'var(--brand-accent)', opacity: 0.5 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed">{dot.text}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {dot.link && (
                            <a href={dot.link} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--brand-accent)' }}>
                              <ExternalLink size={11} />
                              {(() => { try { return new URL(dot.link).hostname; } catch { return 'Link'; } })()}
                            </a>
                          )}
                          {dot.file && (
                            dot.file.mime_type?.startsWith('image/')
                              ? <img src={getDriveThumbnail(dot.file.view_url, 120)} alt={dot.file.name} className="h-12 rounded-md border border-gray-200 mt-1" />
                              : <a href={dot.file.view_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
                                  <FileText size={11} /> {dot.file.name}
                                </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creative Weekly Link */}
            {creativeLink?.url && (
              <div className="bg-white rounded-2xl border border-purple-100 p-7 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Link2 size={15} className="text-purple-500" />
                  </div>
                  <h2 className="text-base font-black text-gray-800">Creative Link</h2>
                </div>
                <a
                  href={creativeLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 p-4 rounded-xl bg-purple-50/60 hover:bg-purple-50 border border-purple-100 transition-all"
                >
                  <ExternalLink size={16} className="text-purple-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-purple-700 group-hover:underline truncate">
                      {creativeLink.label || 'View Link'}
                    </p>
                    <p className="text-[11px] text-purple-400 truncate">
                      {(() => { try { return new URL(creativeLink.url).hostname; } catch { return creativeLink.url; } })()}
                    </p>
                  </div>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        {hasOverview && sorted.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Productions</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        {/* Production cards */}
        {sorted.length === 0 && !hasOverview ? (
          <div className="text-center py-20 text-gray-400">No content in this report</div>
        ) : sorted.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {sorted.map(entry => {
              const prod = productions.find(p => p.id === entry.production_id);
              return <PresentCard key={entry.production_id} entry={entry} prod={prod} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// HistorySidebar
// ============================================================================

function HistorySidebar({ history, weekStart, onSelect, onDelete, isEditor }) {
  const weekStr = toDateStr(weekStart);
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_weekly_history_collapsed')); } catch { return false; }
  });

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('cp_weekly_history_collapsed', JSON.stringify(next));
  }

  if (collapsed) {
    return (
      <div className="flex-shrink-0">
        <button onClick={toggle}
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-all"
          title="Show history">
          <Clock size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-40 flex-shrink-0 flex flex-col gap-1">
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">History</div>
        <button onClick={toggle} className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors" title="Collapse">
          <ChevronLeft size={12} />
        </button>
      </div>
      {history.length === 0 && (
        <p className="text-xs text-gray-400 italic px-1">No saved reports yet</p>
      )}
      {history.map(r => {
        const monday = new Date(r.week_start + 'T00:00:00');
        const isActive = r.week_start === weekStr;
        const dot = historyDot(r.entries);
        return (
          <div
            key={r.id}
            className={clsx(
              'group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all text-xs',
              isActive
                ? 'bg-[var(--brand-accent)] text-white font-semibold shadow-sm'
                : 'hover:bg-gray-100 text-gray-600'
            )}
            onClick={() => onSelect(new Date(r.week_start + 'T00:00:00'))}
          >
            <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', isActive ? 'bg-white/80' : dot)} />
            <span className="flex-1 leading-tight">{fmtShortWeek(monday)}</span>
            {isEditor && !isActive && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(r.id); }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-400 transition-all"
                title="Delete this weekly"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// AddProductionModal
// ============================================================================

function AddProductionModal({ productions, existingIds, onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const available = productions.filter(p =>
    !existingIds.includes(p.id) &&
    (p.project_name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Add Production</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Search productions\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="brand-input w-full mb-3"
        />
        <div className="max-h-72 overflow-y-auto space-y-1">
          {available.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">All productions already added or no matches</p>
          ) : available.map(p => (
            <button
              key={p.id}
              onClick={() => { onAdd(p); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left border border-transparent hover:border-gray-200"
            >
              <StageBadge stage={p.stage} />
              <div>
                <div className="text-sm font-semibold text-gray-800">{p.project_name}</div>
                <div className="font-mono text-[10px] text-gray-400">{p.id}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WeekStrip (for Weekly Reports tab)
// ============================================================================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WORK_DAYS = new Set([0, 1, 2, 3, 4]);

function WeekStrip({ weekStart, showUS, showIL }) {
  const today = toDateStr(new Date());
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_LABELS.map((label, i) => {
        const day = addDays(weekStart, i);
        const dateStr = toDateStr(day);
        const isWorkDay = WORK_DAYS.has(i);
        const isToday = dateStr === today;
        const holidays = getHoliday(dateStr, showUS, showIL);
        const usHoliday = holidays.find(h => h.country === 'US');
        const ilHoliday = holidays.find(h => h.country === 'IL');

        const tooltipParts = holidays.map(h =>
          h.country === 'US' ? `\u{1F1FA}\u{1F1F8} ${h.name}` : `\u{1F1EE}\u{1F1F1} ${h.nameHe || h.name}`
        );
        const tooltip = tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined;

        return (
          <div
            key={i}
            title={tooltip}
            className={clsx(
              'relative rounded-xl px-2 py-2 text-center transition-all border',
              !isWorkDay && 'opacity-50',
              !isWorkDay && !usHoliday && !ilHoliday && 'bg-gray-100 border-gray-200',
              isWorkDay && !usHoliday && !ilHoliday && 'bg-white border-gray-200',
              isToday && 'ring-2 ring-[var(--brand-accent)] ring-offset-1',
            )}
            style={{
              ...(!isWorkDay && !usHoliday && !ilHoliday ? {
                backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(156,163,175,0.15) 3px, rgba(156,163,175,0.15) 5px)',
              } : {}),
            }}
          >
            {usHoliday && (
              <div className="absolute inset-0 rounded-xl bg-blue-100/70 border border-blue-200 pointer-events-none" />
            )}
            {ilHoliday && !usHoliday && (
              <div className="absolute inset-0 rounded-xl pointer-events-none border border-sky-200"
                style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #e0f2fe 100%)' }}
              />
            )}
            {ilHoliday && usHoliday && (
              <div className="absolute inset-0 rounded-xl pointer-events-none border border-blue-200"
                style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #e0f2fe 50%, #f0f9ff 100%)' }}
              />
            )}

            <div className="relative z-10">
              <div className={clsx(
                'text-[10px] font-bold uppercase tracking-wider',
                isWorkDay ? 'text-gray-500' : 'text-gray-400'
              )}>
                {label}
              </div>
              <div className={clsx(
                'text-sm font-bold mt-0.5',
                isToday ? 'text-[var(--brand-accent)]' : isWorkDay ? 'text-gray-800' : 'text-gray-400'
              )}>
                {day.getDate()}
              </div>
              {holidays.length > 0 && (
                <div className="text-[9px] font-semibold mt-0.5 leading-tight truncate"
                  style={{ color: usHoliday ? '#2563eb' : '#0284c7' }}
                >
                  {holidays[0].name}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// HolidayToggles
// ============================================================================

function HolidayToggles({ showUS, showIL, onToggleUS, onToggleIL }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onToggleUS}
        title={showUS ? 'Hide US holidays' : 'Show US holidays'}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all',
          showUS
            ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
            : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
        )}
      >
        {'\u{1F1FA}\u{1F1F8}'}
      </button>
      <button
        onClick={onToggleIL}
        title={showIL ? 'Hide Israeli holidays' : 'Show Israeli holidays'}
        className={clsx(
          'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all',
          showIL
            ? 'bg-sky-50 border-sky-300 text-sky-700 shadow-sm'
            : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
        )}
      >
        {'\u{1F1EE}\u{1F1F1}'}
      </button>
    </div>
  );
}

// ============================================================================
// WeeklyReportsTab -- wraps all existing Weekly Reports functionality
// ============================================================================

function WeeklyReportsTab({ productions, brandId, selectedYear }) {
  const { user, isEditor } = useAuth();
  const { brand } = useBrand();

  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('edit');
  const [dirty, setDirty] = useState(false);
  const [commentsByProd, setCommentsByProd] = useState({});
  const [linksByProd, setLinksByProd] = useState({});
  const [showAddProd, setShowAddProd] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const [showUSHolidays, setShowUSHolidays] = useState(() => {
    try { return localStorage.getItem('weeklyView_showUS') !== 'false'; } catch { return true; }
  });
  const [showILHolidays, setShowILHolidays] = useState(() => {
    try { return localStorage.getItem('weeklyView_showIL') !== 'false'; } catch { return true; }
  });

  function toggleUS() {
    setShowUSHolidays(v => {
      const next = !v;
      try { localStorage.setItem('weeklyView_showUS', String(next)); } catch {}
      return next;
    });
  }
  function toggleIL() {
    setShowILHolidays(v => {
      const next = !v;
      try { localStorage.setItem('weeklyView_showIL', String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft')  setWeekStart(d => addDays(d, -7));
      if (e.key === 'ArrowRight') setWeekStart(d => addDays(d,  7));
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    async function load() {
      const weekStr = toDateStr(weekStart);
      const loaded = await Promise.resolve(getWeeklyReport(brandId, weekStr));
      setReport(loaded || null);
      setDirty(false);
      const allReports = await Promise.resolve(getWeeklyReports(brandId));
      setHistory(Array.isArray(allReports) ? allReports : []);

      if (loaded) {
        const cByP = {}, lByP = {};
        await Promise.all((loaded.entries || []).map(async e => {
          const [comments, links] = await Promise.all([
            Promise.resolve(getComments(e.production_id)),
            Promise.resolve(getLinks(e.production_id)),
          ]);
          cByP[e.production_id] = Array.isArray(comments) ? comments : [];
          lByP[e.production_id] = Array.isArray(links) ? links : [];
        }));
        setCommentsByProd(cByP);
        setLinksByProd(lByP);
      }
    }
    load();
  }, [brandId, weekStart]);

  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!dirty || !report) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await Promise.resolve(saveWeeklyReport(report));
      setDirty(false);
      const allReports = await Promise.resolve(getWeeklyReports(brandId));
      setHistory(Array.isArray(allReports) ? allReports : []);
    }, 800);
    return () => clearTimeout(saveTimerRef.current);
  }, [report, dirty, brandId]);

  function patchReport(patch) {
    setReport(r => ({ ...r, ...patch }));
    setDirty(true);
  }

  function updateEntry(prodId, patch) {
    setReport(r => ({
      ...r,
      entries: (r.entries || []).map(e =>
        e.production_id === prodId ? { ...e, ...patch } : e
      ),
    }));
    setDirty(true);
  }

  async function createReport() {
    const weekStr = toDateStr(weekStart);
    const newReport = {
      id: generateId('wr'),
      brand_id: brandId,
      week_start: weekStr,
      title: `Week of ${fmtWeekLabel(weekStart)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by_id: user?.id,
      created_by_name: user?.name,
      entries: [],
      general_updates: [],
      creative_link: null,
    };
    await Promise.resolve(saveWeeklyReport(newReport));
    setReport(newReport);
    setCommentsByProd({});
    setLinksByProd({});
    const allReports = await Promise.resolve(getWeeklyReports(brandId));
    setHistory(Array.isArray(allReports) ? allReports : []);
    setDirty(false);
  }

  const [shareLoading, setShareLoading] = useState(false);
  async function shareReport() {
    if (!report) return;
    setShareLoading(true);
    try {
      const API = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('cp_auth_token');
      const res = await fetch(`${API}/api/weekly-reports/${report.id}/share`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const { share_token } = await res.json();
      const url = `${window.location.origin}/weekly/${share_token}`;
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard!');
    } catch (err) {
      console.error('Share error:', err);
    }
    setShareLoading(false);
  }

  async function addProduction(prod) {
    const entry = buildEmptyEntry(prod);
    setReport(r => ({ ...r, entries: [...(r.entries || []), entry] }));
    const [comments, links] = await Promise.all([
      Promise.resolve(getComments(prod.id)),
      Promise.resolve(getLinks(prod.id)),
    ]);
    setCommentsByProd(p => ({ ...p, [prod.id]: Array.isArray(comments) ? comments : [] }));
    setLinksByProd(p => ({ ...p, [prod.id]: Array.isArray(links) ? links : [] }));
    setDirty(true);
  }

  function removeEntry(prodId) {
    setReport(r => ({ ...r, entries: (r.entries || []).filter(e => e.production_id !== prodId) }));
    setDirty(true);
  }

  async function handleDeleteReport(id) {
    await Promise.resolve(deleteWeeklyReport(id));
    const allReports = await Promise.resolve(getWeeklyReports(brandId));
    setHistory(Array.isArray(allReports) ? allReports : []);
    if (report?.id === id) {
      setReport(null);
      setDirty(false);
    }
  }

  const existingProdIds = (report?.entries || []).map(e => e.production_id);

  if (mode === 'present' && report) {
    return (
      <PresentationMode
        report={report}
        productions={productions}
        brand={brand}
        onClose={() => setMode('edit')}
      />
    );
  }

  return (
    <div className="flex gap-5 items-start">
      <HistorySidebar
        history={history}
        weekStart={weekStart}
        onSelect={d => setWeekStart(getMondayOf(d))}
        onDelete={handleDeleteReport}
        isEditor={isEditor}
      />

      <div className="flex-1 min-w-0 space-y-4">
        {/* Header bar */}
        <div className="brand-card p-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekStart(d => addDays(d, -7))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-all"
              >
                <ChevronLeft size={15} />
              </button>
              <div>
                {editingTitle && report ? (
                  <input
                    autoFocus
                    className="font-bold text-gray-800 text-base border-b-2 outline-none bg-transparent"
                    style={{ borderColor: 'var(--brand-accent)' }}
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={() => { patchReport({ title: titleDraft }); setEditingTitle(false); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { patchReport({ title: titleDraft }); setEditingTitle(false); } }}
                  />
                ) : (
                  <h2
                    className="font-bold text-gray-800 text-base cursor-text flex items-center gap-1.5 group"
                    onClick={() => { if (report) { setTitleDraft(report.title); setEditingTitle(true); } }}
                    title={report ? 'Click to rename' : undefined}
                  >
                    {report ? report.title : `Week of ${fmtWeekLabel(weekStart)}`}
                    {report && <Edit3 size={12} className="text-gray-300 sm:opacity-0 opacity-60 sm:group-hover:opacity-100 transition-opacity" />}
                  </h2>
                )}
                <p className="text-[11px] text-gray-400">
                  {report ? `${(report.entries || []).length} productions` : 'No report yet'}
                  {dirty && <span className="ml-2 text-amber-500">\u2022 saving\u2026</span>}
                </p>
              </div>
              <button
                onClick={() => setWeekStart(d => addDays(d, 7))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-all"
              >
                <ChevronRight size={15} />
              </button>
              <button
                onClick={() => setWeekStart(getMondayOf(new Date()))}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
              >
                <Clock size={11} /> Today
              </button>
              <div className="w-px h-5 bg-gray-200 mx-1" />
              <HolidayToggles
                showUS={showUSHolidays}
                showIL={showILHolidays}
                onToggleUS={toggleUS}
                onToggleIL={toggleIL}
              />
            </div>

            <div className="flex items-center gap-2">
              {report && isEditor && (
                <button
                  onClick={() => setShowAddProd(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)] transition-all"
                >
                  <Plus size={13} />
                  Add Production
                </button>
              )}
              {report && (
                <>
                  <button
                    onClick={shareReport}
                    disabled={shareLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
                  >
                    <Share2 size={13} />
                    {shareLoading ? 'Copying…' : 'Share'}
                  </button>
                  <button
                    onClick={() => setMode('present')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm"
                    style={{ background: 'var(--brand-accent)' }}
                  >
                    <Presentation size={13} />
                    Present
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Week day strip */}
        <div className="brand-card p-3">
          <WeekStrip weekStart={weekStart} showUS={showUSHolidays} showIL={showILHolidays} />
        </div>

        {/* General Updates + Creative Link */}
        {report && (
          <>
            <GeneralUpdatesSection
              updates={report.general_updates || []}
              onUpdate={val => patchReport({ general_updates: val })}
              isEditor={isEditor}
              subfolder={`${new Date(weekStart).getFullYear()}/Week of ${fmtWeekLabel(weekStart)}`}
              prevWeekUpdates={(() => {
                const prev = toDateStr(addDays(weekStart, -7));
                const prevReport = history.find(r => r.week_start === prev);
                return prevReport?.general_updates || [];
              })()}
            />
            <CreativeWeeklyLink
              link={report.creative_link}
              onUpdate={val => patchReport({ creative_link: val })}
              isEditor={isEditor}
            />
          </>
        )}

        {/* Empty state */}
        {!report ? (
          <div className="brand-card py-16 text-center">
            <div className="text-5xl mb-4">{'\uD83D\uDCCB'}</div>
            <h3 className="font-black text-gray-700 text-lg mb-2">No weekly report for this week</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
              Create a weekly report to track production status, curate updates, and present to stakeholders.
            </p>
            {isEditor ? (
              <button onClick={createReport} className="btn-cta inline-flex items-center gap-2">
                <Plus size={15} />
                Create Weekly Report
              </button>
            ) : (
              <p className="text-sm text-gray-400">Ask an editor or admin to create this week's report.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {(report.entries || []).length === 0 ? (
              <div className="brand-card py-12 text-center text-gray-400">
                <p className="text-sm mb-3">No productions in this report.</p>
                {isEditor && (
                  <button onClick={() => setShowAddProd(true)} className="btn-secondary text-xs inline-flex items-center gap-1">
                    <Plus size={12} /> Add Production
                  </button>
                )}
              </div>
            ) : (report.entries || []).map(entry => {
              const prod = productions.find(p => p.id === entry.production_id);
              return (
                <ProductionEntry
                  key={entry.production_id}
                  entry={entry}
                  prod={prod}
                  links={linksByProd[entry.production_id] || []}
                  onUpdate={patch => updateEntry(entry.production_id, patch)}
                  onRemove={() => removeEntry(entry.production_id)}
                  isEditor={isEditor}
                />
              );
            })}
          </div>
        )}
      </div>

      {showAddProd && (
        <AddProductionModal
          productions={productions}
          existingIds={existingProdIds}
          onAdd={addProduction}
          onClose={() => setShowAddProd(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// CALENDAR: Add Event Modal
// ============================================================================

function AddEventModal({ initialDate, initialHour, productions, onSave, onClose }) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(initialDate || toDateStr(new Date()));
  const [startTime, setStartTime] = useState(initialHour != null ? `${String(initialHour).padStart(2,'0')}:00` : '');
  const [endDate, setEndDate] = useState(initialDate || toDateStr(new Date()));
  const [endTime, setEndTime] = useState(initialHour != null ? `${String(initialHour + 1).padStart(2,'0')}:00` : '');
  const [fullDay, setFullDay] = useState(initialHour == null);
  const [productionId, setProductionId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createGanttEvent({
        production_id: productionId || productions[0]?.id || 'general',
        name: productionId ? title.trim() : `[General] ${title.trim()}`,
        start_date: startDate,
        end_date: endDate || startDate,
        phase: 'Custom',
        start_time: fullDay ? null : startTime,
        end_time: fullDay ? null : endTime,
        full_day: fullDay,
      });
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>New Event</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Title</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Event name"
              className="brand-input w-full"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>

          {/* Full day toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fullDay}
              onChange={e => setFullDay(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Full day</span>
          </label>

          {/* Date/time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
                className="brand-input w-full"
              />
            </div>
            {!fullDay && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Start time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="brand-input w-full"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                min={startDate}
                className="brand-input w-full"
              />
            </div>
            {!fullDay && (
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">End time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="brand-input w-full"
                />
              </div>
            )}
          </div>

          {/* Production dropdown */}
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Production</label>
            <select
              value={productionId}
              onChange={e => setProductionId(e.target.value)}
              className="brand-input w-full"
            >
              <option value="">📌 General (all productions)</option>
              {productions.map(p => (
                <option key={p.id} value={p.id}>{p.id} — {p.project_name}</option>
              ))}
            </select>
          </div>

          {/* Save */}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="btn-cta text-sm px-5 py-2 disabled:opacity-50"
            >
              {saving ? 'Saving\u2026' : 'Save Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CALENDAR: Mini Month Navigator (sidebar)
// ============================================================================

function MiniMonth({ year, month, selectedDate, onSelect }) {
  const cells = getMonthGrid(year, month);
  const todayStr = toDateStr(new Date());
  const selectedStr = selectedDate ? toDateStr(selectedDate) : '';

  return (
    <div>
      <div className="text-xs font-bold text-gray-700 mb-1.5 text-center">
        {MONTH_NAMES[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {DAY_NAMES_SHORT.map(d => (
          <div key={d} className="text-[9px] font-bold text-gray-400 text-center pb-0.5">{d[0]}</div>
        ))}
        {cells.map((cell, i) => {
          const ds = toDateStr(cell.date);
          const isToday = ds === todayStr;
          const isSelected = ds === selectedStr;
          return (
            <button
              key={i}
              onClick={() => onSelect(cell.date)}
              className={clsx(
                'text-[10px] w-6 h-6 rounded-full flex items-center justify-center transition-all mx-auto',
                cell.outside && 'text-gray-300',
                !cell.outside && !isToday && !isSelected && 'text-gray-600 hover:bg-gray-100',
                isToday && !isSelected && 'font-bold text-blue-600 bg-blue-50',
                isSelected && 'bg-[var(--brand-accent)] text-white font-bold',
              )}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// CALENDAR: Main CalendarTab
// ============================================================================

function CalendarTab({ productions, brandId }) {
  const { brand } = useBrand();

  const [viewMode, setViewMode] = useState('month'); // month | week | day
  const [anchor, setAnchor] = useState(new Date()); // anchor date for navigation
  const [showAddEvent, setShowAddEvent] = useState(null); // null or { date, hour? }
  const [refreshKey, setRefreshKey] = useState(0);

  // Production visibility filter
  const [visibleProdIds, setVisibleProdIds] = useState(() => new Set(productions.map(p => p.id)));

  // Holiday toggles
  const [showUS, setShowUS] = useState(true);
  const [showIL, setShowIL] = useState(true);

  // Update visible prods when productions change
  useEffect(() => {
    setVisibleProdIds(new Set(productions.map(p => p.id)));
  }, [productions]);

  // Production color map
  const prodColorMap = useMemo(() => {
    const map = {};
    productions.forEach((p, i) => {
      map[p.id] = PRODUCTION_COLORS[i % PRODUCTION_COLORS.length];
    });
    return map;
  }, [productions]);

  // Load all calendar events
  const [ganttEvents, setGanttEvents] = useState([]);
  useEffect(() => {
    async function loadGantt() {
      const ge = await Promise.resolve(getAllGanttEvents());
      setGanttEvents(Array.isArray(ge) ? ge : []);
    }
    loadGantt();
  }, []);

  const calendarEvents = useMemo(() => {
    const events = [];

    // Gantt events
    ganttEvents.forEach(ge => {
      if (!visibleProdIds.has(ge.production_id)) return;
      events.push({
        id: ge.id,
        title: ge.name,
        start: ge.start_date,
        end: ge.end_date || ge.start_date,
        color: phaseColor(ge.phase) || prodColorMap[ge.production_id] || '#6B7280',
        type: 'gantt',
        productionId: ge.production_id,
        phase: ge.phase,
        startTime: ge.start_time || null,
        endTime: ge.end_time || null,
        fullDay: ge.full_day !== false,
      });
    });

    // Production timelines
    productions.forEach(p => {
      if (!visibleProdIds.has(p.id)) return;
      if (p.planned_start && p.planned_end) {
        events.push({
          id: `timeline-${p.id}`,
          title: p.project_name,
          start: p.planned_start,
          end: p.planned_end,
          color: prodColorMap[p.id] || '#6B7280',
          type: 'timeline',
          productionId: p.id,
          fullDay: true,
        });
      }
      // Shoot dates
      if (p.shoot_date) {
        events.push({
          id: `shoot-${p.id}`,
          title: `Shoot: ${p.project_name}`,
          start: p.shoot_date,
          end: p.shoot_date,
          color: '#E74C3C',
          type: 'shoot',
          productionId: p.id,
          fullDay: true,
        });
      }
      // Delivery / air dates
      if (p.delivery_date) {
        events.push({
          id: `delivery-${p.id}`,
          title: `Delivery: ${p.project_name}`,
          start: p.delivery_date,
          end: p.delivery_date,
          color: '#9B59B6',
          type: 'delivery',
          productionId: p.id,
          fullDay: true,
        });
      }
      if (p.air_date) {
        events.push({
          id: `air-${p.id}`,
          title: `Air: ${p.project_name}`,
          start: p.air_date,
          end: p.air_date,
          color: '#F5A623',
          type: 'air',
          productionId: p.id,
          fullDay: true,
        });
      }
    });

    return events;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productions, visibleProdIds, prodColorMap, refreshKey]);

  // Navigation
  function goPrev() {
    setAnchor(d => {
      const nd = new Date(d);
      if (viewMode === 'month') nd.setMonth(nd.getMonth() - 1);
      else if (viewMode === 'week') nd.setDate(nd.getDate() - 7);
      else nd.setDate(nd.getDate() - 1);
      return nd;
    });
  }
  function goNext() {
    setAnchor(d => {
      const nd = new Date(d);
      if (viewMode === 'month') nd.setMonth(nd.getMonth() + 1);
      else if (viewMode === 'week') nd.setDate(nd.getDate() + 7);
      else nd.setDate(nd.getDate() + 1);
      return nd;
    });
  }
  function goToday() {
    setAnchor(new Date());
  }

  // Mini month nav
  const miniYear = anchor.getFullYear();
  const miniMonth = anchor.getMonth();

  // Title
  let headerTitle = '';
  if (viewMode === 'month') {
    headerTitle = `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  } else if (viewMode === 'week') {
    const sun = getSundayOf(anchor);
    const sat = addDays(sun, 6);
    headerTitle = `${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else {
    headerTitle = anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function toggleProd(id) {
    setVisibleProdIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllProds() { setVisibleProdIds(new Set(productions.map(p => p.id))); }
  function selectNoneProds() { setVisibleProdIds(new Set()); }

  function handleEventSaved() {
    setShowAddEvent(null);
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="flex gap-4 items-start">
      {/* ---- LEFT SIDEBAR ---- */}
      <div className="w-52 flex-shrink-0 space-y-5">
        {/* Mini calendar navigator */}
        <div className="brand-card p-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => {
              const nd = new Date(miniYear, miniMonth - 1, 1);
              setAnchor(nd);
            }} className="p-0.5 rounded hover:bg-gray-100 text-gray-400"><ChevronLeft size={14}/></button>
            <button onClick={() => {
              const nd = new Date(miniYear, miniMonth + 1, 1);
              setAnchor(nd);
            }} className="p-0.5 rounded hover:bg-gray-100 text-gray-400"><ChevronRight size={14}/></button>
          </div>
          <MiniMonth
            year={miniYear}
            month={miniMonth}
            selectedDate={anchor}
            onSelect={d => setAnchor(d)}
          />
        </div>

        {/* Production filters */}
        <div className="brand-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Productions</span>
            <div className="flex gap-1">
              <button onClick={selectAllProds} className="text-[10px] text-blue-500 hover:underline">All</button>
              <span className="text-gray-300">|</span>
              <button onClick={selectNoneProds} className="text-[10px] text-blue-500 hover:underline">None</button>
            </div>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {productions.map(p => (
              <label key={p.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleProdIds.has(p.id)}
                  onChange={() => toggleProd(p.id)}
                  className="w-3.5 h-3.5 rounded border-gray-300"
                  style={{ accentColor: prodColorMap[p.id] }}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: prodColorMap[p.id] }}
                />
                <span className="text-xs text-gray-700 truncate">{p.project_name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Holiday toggles */}
        <div className="brand-card p-3">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Holidays</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowUS(v => !v)}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                showUS ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-400'
              )}
            >
              {'\u{1F1FA}\u{1F1F8}'} US
            </button>
            <button
              onClick={() => setShowIL(v => !v)}
              className={clsx(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                showIL ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-gray-200 text-gray-400'
              )}
            >
              {'\u{1F1EE}\u{1F1F1}'} IL
            </button>
          </div>
        </div>
      </div>

      {/* ---- MAIN CALENDAR AREA ---- */}
      <div className="flex-1 min-w-0">
        {/* Top bar: navigation + view toggles */}
        <div className="brand-card p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={goPrev} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"><ChevronLeft size={16}/></button>
              <button onClick={goNext} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"><ChevronRight size={16}/></button>
              <button onClick={goToday} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium">
                <Clock size={12}/> Today
              </button>
              <h2 className="text-base font-bold text-gray-800 ml-2">{headerTitle}</h2>
            </div>
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {['month','week','day'].map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize',
                    viewMode === m ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        {viewMode === 'month' && (
          <MonthGrid
            anchor={anchor}
            events={calendarEvents}
            showUS={showUS}
            showIL={showIL}
            onCellClick={dateStr => setShowAddEvent({ date: dateStr })}
            prodColorMap={prodColorMap}
          />
        )}
        {viewMode === 'week' && (
          <WeekGrid
            anchor={anchor}
            events={calendarEvents}
            showUS={showUS}
            showIL={showIL}
            onSlotClick={(dateStr, hour) => setShowAddEvent({ date: dateStr, hour })}
            prodColorMap={prodColorMap}
          />
        )}
        {viewMode === 'day' && (
          <DayGrid
            anchor={anchor}
            events={calendarEvents}
            showUS={showUS}
            showIL={showIL}
            onSlotClick={(dateStr, hour) => setShowAddEvent({ date: dateStr, hour })}
            prodColorMap={prodColorMap}
          />
        )}
      </div>

      {/* Add event modal */}
      {showAddEvent && (
        <AddEventModal
          initialDate={showAddEvent.date}
          initialHour={showAddEvent.hour}
          productions={productions}
          onSave={handleEventSaved}
          onClose={() => setShowAddEvent(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// CALENDAR: Month Grid
// ============================================================================

function MonthGrid({ anchor, events, showUS, showIL, onCellClick, prodColorMap }) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const cells = getMonthGrid(year, month);
  const todayStr = toDateStr(new Date());
  const MAX_EVENTS = 3;

  return (
    <div className="brand-card overflow-hidden">
      {/* Header row */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_NAMES_SHORT.map((d, i) => (
          <div key={d} className={clsx(
            'text-[11px] font-bold text-center py-2 uppercase tracking-wider',
            (i === 5 || i === 6) ? 'text-gray-400 bg-gray-50' : 'text-gray-500'
          )}>
            {d}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const dateStr = toDateStr(cell.date);
          const dayOfWeek = cell.date.getDay();
          const isWkend = dayOfWeek === 5 || dayOfWeek === 6;
          const isToday = dateStr === todayStr;
          const holidays = getHoliday(dateStr, showUS, showIL);
          const dayEvents = events.filter(ev => eventOverlapsDate(ev, dateStr));
          const shown = dayEvents.slice(0, MAX_EVENTS);
          const overflow = dayEvents.length - MAX_EVENTS;

          return (
            <div
              key={i}
              onClick={() => onCellClick(dateStr)}
              className={clsx(
                'min-h-[100px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors hover:bg-blue-50/30',
                isWkend && 'bg-gray-50/80',
                cell.outside && 'opacity-40',
              )}
            >
              {/* Date number */}
              <div className="flex items-center gap-1 mb-0.5">
                <span className={clsx(
                  'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                  isToday && 'bg-[var(--brand-accent)] text-white',
                  !isToday && !cell.outside && 'text-gray-700',
                  !isToday && cell.outside && 'text-gray-400',
                )}>
                  {cell.date.getDate()}
                </span>
                {/* Holiday dots */}
                {holidays.map((h, hi) => (
                  <span
                    key={hi}
                    title={h.country === 'US' ? h.name : (h.nameHe || h.name)}
                    className={clsx(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      h.country === 'US' ? 'bg-blue-500' : 'bg-sky-400'
                    )}
                  />
                ))}
              </div>
              {/* Events */}
              <div className="space-y-0.5">
                {shown.map(ev => (
                  <div
                    key={ev.id}
                    title={ev.title}
                    className={clsx(
                      'text-[10px] leading-tight px-1.5 py-0.5 rounded truncate font-medium',
                      ev.type === 'timeline' && 'border border-dashed opacity-70',
                      ev.type === 'shoot' && 'flex items-center gap-0.5',
                      ev.type === 'delivery' || ev.type === 'air' ? 'flex items-center gap-0.5' : '',
                    )}
                    style={{
                      background: ev.type === 'timeline' ? `${ev.color}15` : `${ev.color}20`,
                      color: ev.color,
                      borderColor: ev.type === 'timeline' ? ev.color : 'transparent',
                    }}
                  >
                    {ev.type === 'shoot' && <span className="text-red-500">{'\u2022'}</span>}
                    {(ev.type === 'delivery' || ev.type === 'air') && <span>{'\u25C6'}</span>}
                    {ev.title}
                  </div>
                ))}
                {overflow > 0 && (
                  <div className="text-[10px] text-gray-400 font-medium pl-1">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// CALENDAR: Week Grid
// ============================================================================

function WeekGrid({ anchor, events, showUS, showIL, onSlotClick, prodColorMap }) {
  const days = getWeekDates(anchor);
  const todayStr = toDateStr(new Date());
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const todayDayStr = toDateStr(now);

  // All-day events
  const allDayEvents = events.filter(ev => ev.fullDay);
  // Timed events (approximate -- place at start hour or 9am)
  const timedEvents = events.filter(ev => !ev.fullDay);

  return (
    <div className="brand-card overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200">
        <div className="border-r border-gray-100" />
        {days.map((d, i) => {
          const ds = toDateStr(d);
          const isToday = ds === todayStr;
          const wkend = isWeekend(d);
          const holidays = getHoliday(ds, showUS, showIL);
          return (
            <div key={i} className={clsx(
              'text-center py-2 border-r border-gray-100',
              wkend && 'bg-gray-50',
            )}>
              <div className="text-[10px] font-bold text-gray-400 uppercase">{DAY_NAMES_SHORT[d.getDay()]}</div>
              <div className={clsx(
                'text-sm font-bold mx-auto w-7 h-7 flex items-center justify-center rounded-full',
                isToday && 'bg-[var(--brand-accent)] text-white',
                !isToday && 'text-gray-700',
              )}>
                {d.getDate()}
              </div>
              {holidays.length > 0 && (
                <div className="text-[9px] text-blue-500 font-medium truncate px-1">{holidays[0].name}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-200 min-h-[32px]">
        <div className="text-[9px] text-gray-400 font-medium px-1 py-1 border-r border-gray-100 flex items-center justify-center">
          All day
        </div>
        {days.map((d, i) => {
          const ds = toDateStr(d);
          const dayAllDay = allDayEvents.filter(ev => eventOverlapsDate(ev, ds));
          const wkend = isWeekend(d);
          return (
            <div key={i} className={clsx(
              'border-r border-gray-100 p-0.5 space-y-0.5',
              wkend && 'bg-gray-50/50',
            )}>
              {dayAllDay.slice(0, 2).map(ev => (
                <div
                  key={ev.id}
                  title={ev.title}
                  className={clsx(
                    'text-[9px] px-1 py-0.5 rounded truncate font-medium',
                    ev.type === 'timeline' && 'border border-dashed opacity-70',
                  )}
                  style={{
                    background: ev.type === 'timeline' ? `${ev.color}15` : `${ev.color}20`,
                    color: ev.color,
                    borderColor: ev.type === 'timeline' ? ev.color : 'transparent',
                  }}
                >
                  {ev.type === 'shoot' && '\u2022 '}
                  {(ev.type === 'delivery' || ev.type === 'air') && '\u25C6 '}
                  {ev.title}
                </div>
              ))}
              {dayAllDay.length > 2 && (
                <div className="text-[9px] text-gray-400 pl-1">+{dayAllDay.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hour rows */}
      <div className="relative max-h-[600px] overflow-y-auto">
        {HOURS.map(hour => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-gray-50 min-h-[48px]">
            <div className="text-[10px] text-gray-400 font-medium px-2 py-1 border-r border-gray-100 text-right">
              {hour > 12 ? `${hour - 12}PM` : hour === 12 ? '12PM' : `${hour}AM`}
            </div>
            {days.map((d, i) => {
              const ds = toDateStr(d);
              const wkend = isWeekend(d);
              // Find timed events at this hour
              const hourEvents = timedEvents.filter(ev => {
                if (!eventOverlapsDate(ev, ds)) return false;
                const evHour = ev.startTime ? parseInt(ev.startTime.split(':')[0], 10) : 9;
                return evHour === hour;
              });
              const isNowRow = ds === todayDayStr && hour <= currentHour && currentHour < hour + 1;
              return (
                <div
                  key={i}
                  onClick={() => onSlotClick(ds, hour)}
                  className={clsx(
                    'border-r border-gray-50 px-0.5 py-0.5 cursor-pointer hover:bg-blue-50/30 transition-colors relative',
                    wkend && 'bg-gray-50/30',
                  )}
                >
                  {/* Current time line */}
                  {isNowRow && (
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
                      style={{ top: `${((currentHour - hour) * 100)}%` }}
                    >
                      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                    </div>
                  )}
                  {hourEvents.map(ev => (
                    <div
                      key={ev.id}
                      title={ev.title}
                      className="text-[10px] px-1.5 py-1 rounded font-medium truncate mb-0.5"
                      style={{
                        background: `${ev.color}25`,
                        color: ev.color,
                        borderLeft: `3px solid ${ev.color}`,
                      }}
                    >
                      {ev.startTime && <span className="opacity-70">{ev.startTime} </span>}
                      {ev.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CALENDAR: Day Grid
// ============================================================================

function DayGrid({ anchor, events, showUS, showIL, onSlotClick, prodColorMap }) {
  const dateStr = toDateStr(anchor);
  const todayStr = toDateStr(new Date());
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isToday = dateStr === todayStr;
  const holidays = getHoliday(dateStr, showUS, showIL);

  const dayAllDay = events.filter(ev => ev.fullDay && eventOverlapsDate(ev, dateStr));
  const dayTimed = events.filter(ev => !ev.fullDay && eventOverlapsDate(ev, dateStr));

  return (
    <div className="brand-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-gray-200">
        <div className={clsx(
          'text-lg font-bold px-3 py-1 rounded-xl',
          isToday && 'bg-[var(--brand-accent)] text-white',
          !isToday && 'text-gray-700',
        )}>
          {anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {holidays.map((h, i) => (
          <span key={i} className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-1 rounded-full">
            {h.country === 'US' ? '\u{1F1FA}\u{1F1F8}' : '\u{1F1EE}\u{1F1F1}'} {h.name}
          </span>
        ))}
      </div>

      {/* All-day */}
      {dayAllDay.length > 0 && (
        <div className="p-2 border-b border-gray-100 space-y-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">All Day</div>
          {dayAllDay.map(ev => (
            <div
              key={ev.id}
              className={clsx(
                'text-xs px-2.5 py-1.5 rounded-lg font-medium',
                ev.type === 'timeline' && 'border border-dashed opacity-70',
              )}
              style={{
                background: ev.type === 'timeline' ? `${ev.color}15` : `${ev.color}15`,
                color: ev.color,
                borderColor: ev.type === 'timeline' ? ev.color : 'transparent',
              }}
            >
              {ev.type === 'shoot' && '\u2022 '}
              {(ev.type === 'delivery' || ev.type === 'air') && '\u25C6 '}
              {ev.title}
            </div>
          ))}
        </div>
      )}

      {/* Hour rows */}
      <div className="relative max-h-[600px] overflow-y-auto">
        {HOURS.map(hour => {
          const hourEvents = dayTimed.filter(ev => {
            const evHour = ev.startTime ? parseInt(ev.startTime.split(':')[0], 10) : 9;
            return evHour === hour;
          });
          const isNowRow = isToday && hour <= currentHour && currentHour < hour + 1;

          return (
            <div
              key={hour}
              onClick={() => onSlotClick(dateStr, hour)}
              className="flex border-b border-gray-50 min-h-[56px] cursor-pointer hover:bg-blue-50/30 transition-colors relative"
            >
              {/* Time label */}
              <div className="w-16 flex-shrink-0 text-[11px] text-gray-400 font-medium px-2 py-1.5 border-r border-gray-100 text-right">
                {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
              </div>
              {/* Events */}
              <div className="flex-1 px-2 py-1 relative">
                {isNowRow && (
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{ top: `${((currentHour - hour) * 100)}%` }}
                  >
                    <div className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                  </div>
                )}
                {hourEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="text-xs px-3 py-2 rounded-lg font-medium mb-1"
                    style={{
                      background: `${ev.color}18`,
                      color: ev.color,
                      borderLeft: `4px solid ${ev.color}`,
                    }}
                  >
                    <div className="font-bold">{ev.title}</div>
                    {ev.startTime && ev.endTime && (
                      <div className="text-[10px] opacity-70 mt-0.5">{ev.startTime} \u2013 {ev.endTime}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN EXPORT: WeeklyView with 2 tabs
// ============================================================================

export default function WeeklyView({ productions, brandId, selectedYear }) {
  const [activeTab, setActiveTab] = useState('reports');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200 pb-0">
        <button
          onClick={() => setActiveTab('calendar')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px',
            activeTab === 'calendar'
              ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          )}
        >
          <CalendarIcon size={15} />
          Calendar
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px',
            activeTab === 'reports'
              ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          )}
        >
          <FileText size={15} />
          Weekly Reports
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'calendar' ? (
        <CalendarTab productions={productions} brandId={brandId} />
      ) : (
        <WeeklyReportsTab productions={productions} brandId={brandId} selectedYear={selectedYear} />
      )}
    </div>
  );
}
