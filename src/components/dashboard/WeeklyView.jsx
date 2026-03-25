import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Link2,
  ExternalLink, Presentation, Clock, Edit3, ChevronDown,
} from 'lucide-react';
import {
  getWeeklyReports, getWeeklyReport, saveWeeklyReport, deleteWeeklyReport,
  getComments, getLinks, generateId,
} from '../../lib/dataService';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import StageBadge from '../ui/StageBadge';
import clsx from 'clsx';

// ─── date helpers ─────────────────────────────────────────────────────────────

// Israeli work week: Sunday = start of week
function getSundayOf(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun, 6=Sat
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
// Keep alias for backward compat
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
  return `${lo} – ${hi}`;
}

function fmtShortWeek(monday) {
  const sunday = addDays(monday, 6);
  const lo = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const hi = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${lo}–${hi}`;
}

// ─── constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'on_track',  label: 'On Track',  icon: '🟢', bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-300'  },
  { value: 'pending',   label: 'Pending',   icon: '⬜', bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-300'   },
  { value: 'at_risk',   label: 'At Risk',   icon: '🟡', bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-300'  },
  { value: 'blocked',   label: 'Blocked',   icon: '🔴', bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'    },
  { value: 'completed', label: 'Completed', icon: '🔵', bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-300'   },
];

const STATUS_SORT = { on_track: 0, pending: 1, at_risk: 2, blocked: 3, completed: 4 };

function getStatus(val) {
  return STATUSES.find(s => s.value === val) || STATUSES[1];
}

function historyDot(entries) {
  if (!entries?.length) return 'bg-gray-300';
  if (entries.some(e => e.status === 'blocked'))  return 'bg-red-500';
  if (entries.some(e => e.status === 'at_risk'))  return 'bg-amber-400';
  if (entries.every(e => e.status === 'on_track')) return 'bg-green-500';
  return 'bg-blue-400';
}

function buildEmptyEntry(prod) {
  return {
    production_id: prod.id,
    status: 'pending',
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

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = getStatus(status);
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold', s.bg, s.text)}>
      {s.icon} {s.label}
    </span>
  );
}

// ─── StatusDropdown ───────────────────────────────────────────────────────────

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

// ─── ProductionEntry (edit mode) ──────────────────────────────────────────────

function ProductionEntry({ entry, prod, comments, links, onUpdate, onRemove, isEditor }) {
  const [showComments, setShowComments] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [addLinkMode, setAddLinkMode] = useState(null); // null | 'production' | 'custom'
  const [customLink, setCustomLink] = useState({ title: '', url: '' });
  const [collapsed, setCollapsed] = useState(false);

  if (!prod) return null;

  function toggleComment(id) {
    const cur = entry.selected_comment_ids || [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    onUpdate({ selected_comment_ids: next });
  }

  function toggleCommentApproval(id) {
    const cur = entry.approved_comment_ids || [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    onUpdate({ approved_comment_ids: next });
  }

  function addProductionLink(link) {
    if ((entry.weekly_links || []).some(l => l.link_id === link.id)) return;
    onUpdate({
      weekly_links: [...(entry.weekly_links || []), {
        id: generateId('wl'),
        type: 'production',
        link_id: link.id,
        title: link.title || link.url,
        url: link.url,
        approved: false,
        approved_by: null,
        approved_at: null,
      }],
    });
    setAddLinkMode(null);
  }

  function addCustomLink() {
    if (!customLink.url.trim()) return;
    onUpdate({
      weekly_links: [...(entry.weekly_links || []), {
        id: generateId('wl'),
        type: 'custom',
        link_id: null,
        title: customLink.title.trim() || customLink.url,
        url: customLink.url.trim(),
        approved: false,
        approved_by: null,
        approved_at: null,
      }],
    });
    setCustomLink({ title: '', url: '' });
    setAddLinkMode(null);
  }

  function toggleLinkApproval(wlId) {
    onUpdate({
      weekly_links: (entry.weekly_links || []).map(l =>
        l.id === wlId ? { ...l, approved: !l.approved } : l
      ),
    });
  }

  function removeLink(wlId) {
    onUpdate({ weekly_links: (entry.weekly_links || []).filter(l => l.id !== wlId) });
  }

  const selectedComments = comments.filter(c => (entry.selected_comment_ids || []).includes(c.id));
  const availableLinks = links.filter(l => !(entry.weekly_links || []).some(wl => wl.link_id === l.id));
  const s = getStatus(entry.status);

  return (
    <div className={clsx('rounded-2xl border-l-4 bg-white shadow-sm', s.border)}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <StatusDropdown
          value={entry.status}
          onChange={v => onUpdate({ status: v })}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
            <span className="font-bold text-gray-800 text-sm truncate">{prod.project_name}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1 rounded text-gray-300 hover:text-gray-500 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <ChevronDown size={15} className={clsx('transition-transform', collapsed && '-rotate-90')} />
          </button>
          {isEditor && (
            <button
              onClick={onRemove}
              className="p-1 rounded text-gray-300 hover:text-red-400 transition-colors"
              title="Remove from weekly"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">

          {/* Weekly note */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
              Weekly Note (this report only)
            </label>
            <textarea
              value={entry.note || ''}
              onChange={e => onUpdate({ note: e.target.value })}
              placeholder="Status update, key decisions, blockers…"
              rows={2}
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:border-[var(--brand-accent)] transition-colors placeholder-gray-300"
            />
          </div>

          {/* Production comments */}
          <div>
            <button
              onClick={() => setShowComments(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
            >
              <ChevronDown size={11} className={clsx('transition-transform', !showComments && '-rotate-90')} />
              Updates from production ({selectedComments.length} selected)
            </button>

            {showComments && (
              <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-xs text-gray-400 italic pl-1">No production updates yet</p>
                ) : comments.map(c => {
                  const checked = (entry.selected_comment_ids || []).includes(c.id);
                  const approved = (entry.approved_comment_ids || []).includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={clsx(
                        'flex items-start gap-2 p-2.5 rounded-lg border transition-all cursor-pointer group',
                        checked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-transparent hover:border-gray-200'
                      )}
                      onClick={() => toggleComment(c.id)}
                    >
                      <div className={clsx(
                        'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
                        checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                      )}>
                        {checked && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-semibold text-gray-600">{c.author}</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed">{c.body}</p>
                      </div>
                      {checked && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleCommentApproval(c.id); }}
                          title={approved ? 'Approved — click to unapprove' : 'Click to approve'}
                          className={clsx(
                            'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-all border',
                            approved
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 text-gray-300 hover:border-green-400 hover:text-green-500'
                          )}
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Links */}
          <div>
            <button
              onClick={() => setShowLinks(v => !v)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
            >
              <ChevronDown size={11} className={clsx('transition-transform', !showLinks && '-rotate-90')} />
              Links ({(entry.weekly_links || []).length})
            </button>

            {showLinks && (
              <div className="mt-2 space-y-1.5">
                {(entry.weekly_links || []).map(wl => (
                  <div key={wl.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                    <button
                      onClick={() => toggleLinkApproval(wl.id)}
                      title={wl.approved ? 'Approved — click to remove' : 'Click to approve'}
                      className={clsx(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 border transition-all',
                        wl.approved
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 text-gray-300 hover:border-green-400 hover:text-green-500'
                      )}
                    >
                      ✓
                    </button>
                    <a
                      href={wl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-xs text-blue-600 hover:underline truncate flex items-center gap-1"
                    >
                      <ExternalLink size={9} className="flex-shrink-0" />
                      {wl.title || wl.url}
                    </a>
                    {wl.type === 'custom' && (
                      <span className="text-[9px] text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded-full">custom</span>
                    )}
                    <button onClick={() => removeLink(wl.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                ))}

                {/* Add link controls */}
                {addLinkMode === null && isEditor && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setAddLinkMode('production')}
                      disabled={availableLinks.length === 0}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all disabled:opacity-40"
                    >
                      + From production
                    </button>
                    <button
                      onClick={() => setAddLinkMode('custom')}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all"
                    >
                      + Custom link
                    </button>
                  </div>
                )}

                {addLinkMode === 'production' && (
                  <div className="space-y-1 pt-1">
                    {availableLinks.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">All production links already added</p>
                    ) : availableLinks.map(l => (
                      <button
                        key={l.id}
                        onClick={() => addProductionLink(l)}
                        className="w-full flex items-center gap-2 text-left text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        <Link2 size={10} className="text-blue-500 flex-shrink-0" />
                        <span className="truncate text-blue-700">{l.title || l.url}</span>
                        <span className="text-blue-400 text-[10px] ml-auto">{l.category}</span>
                      </button>
                    ))}
                    <button onClick={() => setAddLinkMode(null)} className="text-[11px] text-gray-400 hover:text-gray-600 mt-1">
                      Cancel
                    </button>
                  </div>
                )}

                {addLinkMode === 'custom' && (
                  <div className="space-y-2 pt-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Title (optional)"
                      value={customLink.title}
                      onChange={e => setCustomLink(p => ({ ...p, title: e.target.value }))}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--brand-accent)]"
                    />
                    <input
                      type="url"
                      placeholder="https://…"
                      value={customLink.url}
                      onChange={e => setCustomLink(p => ({ ...p, url: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomLink(); if (e.key === 'Escape') setAddLinkMode(null); }}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[var(--brand-accent)]"
                    />
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

// ─── PresentCard ──────────────────────────────────────────────────────────────

function PresentCard({ entry, prod }) {
  if (!prod) return null;
  const s = getStatus(entry.status);

  return (
    <div className={clsx(
      'rounded-2xl border-2 bg-white shadow-md flex flex-col min-h-[220px]',
      s.border
    )}>
      {/* Card header */}
      <div className={clsx('rounded-t-2xl px-5 py-4', s.bg)}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{s.icon}</span>
          <span className={clsx('text-xs font-black uppercase tracking-wider', s.text)}>{s.label}</span>
        </div>
        <h3 className="font-black text-gray-900 text-base leading-tight">{prod.project_name}</h3>
        <span className="font-mono text-[10px] text-gray-400">{prod.id}</span>
      </div>

      {/* Card body */}
      <div className="flex-1 px-5 py-4 space-y-3">
        {/* Weekly note */}
        {entry.note && (
          <p className="text-sm text-gray-700 leading-relaxed">{entry.note}</p>
        )}

        {/* Approved updates */}
        {(entry.selected_comment_ids || []).length > 0 && (
          <div className="space-y-1.5">
            {entry.selected_comment_ids.map(cid => {
              const approved = (entry.approved_comment_ids || []).includes(cid);
              // We need to pass comment text — done via prod entries lookup in parent
              return (
                <div key={cid} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className={clsx(
                    'flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] mt-0.5',
                    approved ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  )}>
                    {approved ? '✓' : '•'}
                  </span>
                  <span className={clsx(approved && 'font-medium text-gray-800')} data-comment-id={cid}>
                    {/* text filled in by parent via CommentTextFill */}
                    <CommentBodyPlaceholder cid={cid} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Links */}
        {(entry.weekly_links || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {entry.weekly_links.map(wl => (
              <a
                key={wl.id}
                href={wl.url}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium',
                  wl.approved
                    ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                )}
              >
                {wl.approved ? '✅' : '🔗'} {wl.title || wl.url}
              </a>
            ))}
          </div>
        )}

        {/* Stage badge */}
        <div className="pt-1">
          <StageBadge stage={prod.stage} />
        </div>
      </div>
    </div>
  );
}

// Tiny helper — PresentCard gets comment text via a context-free lookup
function CommentBodyPlaceholder({ cid }) {
  return <span className="text-[11px]">{window.__weeklyComments?.[cid] || '…'}</span>;
}

// ─── PresentationMode ─────────────────────────────────────────────────────────

function PresentationMode({ report, productions, commentsByProd, brand, onClose }) {
  // Build a flat comment lookup { id → body }
  useEffect(() => {
    const lookup = {};
    Object.values(commentsByProd).forEach(arr =>
      arr.forEach(c => { lookup[c.id] = c.body; })
    );
    window.__weeklyComments = lookup;
    return () => { delete window.__weeklyComments; };
  }, [commentsByProd]);

  const sorted = [...(report.entries || [])].sort(
    (a, b) => (STATUS_SORT[a.status] ?? 9) - (STATUS_SORT[b.status] ?? 9)
  );

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Header bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--brand-primary)' }}>
              {brand?.name || 'Productions'}
            </div>
            <h1 className="text-xl font-black text-gray-900">{report.title}</h1>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition-all"
        >
          <X size={15} />
          Exit Presentation
        </button>
      </div>

      {/* Cards */}
      <div className="p-8">
        {sorted.length === 0 ? (
          <div className="text-center py-20 text-gray-400">No productions in this report</div>
        ) : (
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

// ─── HistorySidebar ───────────────────────────────────────────────────────────

function HistorySidebar({ history, weekStart, onSelect, onDelete, isEditor }) {
  const weekStr = toDateStr(weekStart);

  return (
    <div className="w-40 flex-shrink-0 flex flex-col gap-1">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-1">History</div>
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

// ─── AddProductionModal ───────────────────────────────────────────────────────

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
          placeholder="Search productions…"
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

// ─── Main WeeklyView ──────────────────────────────────────────────────────────

export default function WeeklyView({ productions, brandId, selectedYear }) {
  const { user, isEditor } = useAuth();
  const { brand } = useBrand();

  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('edit');          // 'edit' | 'present'
  const [dirty, setDirty] = useState(false);
  const [commentsByProd, setCommentsByProd] = useState({});
  const [linksByProd, setLinksByProd] = useState({});
  const [showAddProd, setShowAddProd] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Arrow key navigation — prev/next week when no input is focused
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft')  setWeekStart(d => addDays(d, -7));
      if (e.key === 'ArrowRight') setWeekStart(d => addDays(d,  7));
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Load report + history when week or brand changes
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

  // Auto-save debounced
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
    const weekEnd = addDays(weekStart, 6);
    const activeProds = productions.filter(p =>
      p.stage !== 'Completed' && overlapsWeek(p, weekStart, weekEnd)
    );
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
      entries: activeProds.map(buildEmptyEntry),
    };
    const cByP = {}, lByP = {};
    await Promise.all(activeProds.map(async p => {
      const [comments, links] = await Promise.all([
        Promise.resolve(getComments(p.id)),
        Promise.resolve(getLinks(p.id)),
      ]);
      cByP[p.id] = Array.isArray(comments) ? comments : [];
      lByP[p.id] = Array.isArray(links) ? links : [];
    }));
    setCommentsByProd(cByP);
    setLinksByProd(lByP);
    await Promise.resolve(saveWeeklyReport(newReport));
    setReport(newReport);
    const allReports = await Promise.resolve(getWeeklyReports(brandId));
    setHistory(Array.isArray(allReports) ? allReports : []);
    setDirty(false);
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

  const weekEnd = addDays(weekStart, 6);
  const existingProdIds = (report?.entries || []).map(e => e.production_id);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (mode === 'present' && report) {
    return (
      <PresentationMode
        report={report}
        productions={productions}
        commentsByProd={commentsByProd}
        brand={brand}
        onClose={() => setMode('edit')}
      />
    );
  }

  return (
    <div className="flex gap-5 items-start">

      {/* ── History sidebar ─────────────────────────────────────────────── */}
      <HistorySidebar
        history={history}
        weekStart={weekStart}
        onSelect={d => setWeekStart(getMondayOf(d))}
        onDelete={handleDeleteReport}
        isEditor={isEditor}
      />

      {/* ── Main panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Header bar */}
        <div className="brand-card p-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Week nav */}
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
                    {report && <Edit3 size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </h2>
                )}
                <p className="text-[11px] text-gray-400">
                  {report ? `${(report.entries || []).length} productions` : 'No report yet'}
                  {dirty && <span className="ml-2 text-amber-500">• saving…</span>}
                  {!dirty && report && <span className="ml-2 text-green-500">• saved</span>}
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
            </div>

            {/* Actions */}
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
                <button
                  onClick={() => setMode('present')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm"
                  style={{ background: 'var(--brand-accent)' }}
                >
                  <Presentation size={13} />
                  Present
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {!report ? (
          <div className="brand-card py-16 text-center">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="font-black text-gray-700 text-lg mb-2">No weekly report for this week</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
              Create a weekly report to track production status, curate updates, and present to stakeholders.
            </p>
            {isEditor ? (
              <button
                onClick={createReport}
                className="btn-cta inline-flex items-center gap-2"
              >
                <Plus size={15} />
                Create Weekly Report
              </button>
            ) : (
              <p className="text-sm text-gray-400">Ask an editor or admin to create this week's report.</p>
            )}
          </div>
        ) : (

          /* Production entries */
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
                  comments={commentsByProd[entry.production_id] || []}
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

      {/* Add Production modal */}
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
