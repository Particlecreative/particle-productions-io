import { useState, useEffect, useCallback, forwardRef } from 'react';
import {
  RefreshCw, ExternalLink, X, Search, Loader2, AlertCircle,
  MessageSquare, Sparkles, Copy, Check, ChevronRight, Calendar,
  User, FileText, Zap, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

// ─── Constants ───────────────────────────────────────────────────────────────
const VIDEO_BOARD  = '5433027071';
const DESIGN_BOARD = '8036329818';
const VIDEO_FORM   = 'https://wkf.ms/3PVukOV';
const DESIGN_FORM  = 'https://wkf.ms/4sKgeP9';

const STATUS_STYLES = {
  'Done':            { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'Approved':        { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'Working on it':   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400'  },
  'In Progress':     { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'   },
  'Stuck':           { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500'    },
  'Waiting':         { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500' },
  'Review':          { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: 'bg-cyan-500'   },
  'Cancelled':       { bg: 'bg-gray-100',   text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400'   },
  '__default':       { bg: 'bg-gray-100',   text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400'   },
};

const TYPE_CFG = {
  Video:  { gradient: 'from-violet-600 to-purple-700', badge: 'bg-violet-50 text-violet-700 border-violet-200',  icon: '🎬' },
  Design: { gradient: 'from-pink-500 to-rose-600',     badge: 'bg-pink-50 text-pink-700 border-pink-200',        icon: '🎨' },
  TV:     { gradient: 'from-blue-600 to-indigo-700',   badge: 'bg-blue-50 text-blue-700 border-blue-200',        icon: '📺' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function mondayQuery(gql, token) {
  const res = await fetch('/api/monday/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query: gql }),
  });
  if (!res.ok) throw new Error(`Monday API ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Monday query failed');
  return data.data;
}

function getItemType(item, boardId) {
  const g = item.group?.title?.toLowerCase() || '';
  const n = item.name?.toLowerCase() || '';
  if (g.includes('tv') || n.startsWith('tv ') || n.includes(' tv ') || n.includes('television')) return 'TV';
  if (boardId === DESIGN_BOARD) return 'Design';
  return 'Video';
}

function getStatus(item) {
  const col = item.column_values?.find(
    cv => cv.type === 'color' || cv.id === 'status' || cv.title?.toLowerCase() === 'status'
  );
  const label = col?.text || '';
  return { label, ...(STATUS_STYLES[label] || STATUS_STYLES.__default) };
}

function getColValue(item, ...titles) {
  for (const t of titles) {
    const col = item.column_values?.find(cv => cv.title?.toLowerCase().includes(t.toLowerCase()));
    if (col?.text) return col.text;
  }
  return '';
}

function stripHtml(h) { return h?.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || ''; }

function timeAgo(str) {
  if (!str) return '';
  const m = Math.floor((Date.now() - new Date(str)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name) {
  return (name || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function avatarColor(name) {
  const colors = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#3b82f6','#10b981','#8b5cf6','#f43f5e'];
  let h = 0; for (const c of name || '') h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudioTickets() {
  const { token } = useAuth();
  const [items, setItems]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [typeFilter, setTypeFilter]       = useState('All');
  const [search, setSearch]               = useState('');
  const [selectedItem, setSelectedItem]   = useState(null);
  const [updates, setUpdates]             = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [brief, setBrief]                 = useState(null);
  const [briefItemId, setBriefItemId]     = useState(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [copied, setCopied]               = useState(false);

  const loadItems = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await mondayQuery(`{
        boards(ids: [${VIDEO_BOARD}, ${DESIGN_BOARD}]) {
          id name
          items_page(limit: 100) {
            items {
              id name state
              group { id title }
              column_values { id title text type }
              updates(limit: 2) { id body created_at creator { name } }
            }
          }
        }
      }`, token);
      const all = [];
      for (const board of data.boards || []) {
        for (const item of board.items_page?.items || []) {
          if (item.state === 'deleted') continue;
          all.push({ ...item, _boardId: board.id, _boardName: board.name, _type: getItemType(item, board.id) });
        }
      }
      // Sort by most recent update
      all.sort((a, b) => (b.updates?.[0]?.created_at || '').localeCompare(a.updates?.[0]?.created_at || ''));
      setItems(all);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadItems(); }, [loadItems]);

  async function openItem(item) {
    setSelectedItem(item);
    setBrief(null);
    setUpdates(item.updates || []);
    setLoadingUpdates(true);
    try {
      const data = await mondayQuery(`{
        items(ids: [${item.id}]) {
          updates(limit: 30) {
            id body created_at
            creator { id name }
            replies { id body created_at creator { name } }
          }
        }
      }`, token);
      setUpdates(data.items?.[0]?.updates || []);
    } catch { /* keep preview */ }
    finally { setLoadingUpdates(false); }
  }

  async function handleGenerateBrief(item) {
    setGeneratingBrief(true);
    setBriefItemId(item.id);
    setBrief(null);
    if (selectedItem?.id !== item.id) await openItem(item);
    try {
      const res = await fetch('/api/briefs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ item_id: item.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Brief generation failed');
      setBrief(json.brief);
    } catch (err) {
      alert('Brief generation failed: ' + err.message);
    } finally { setGeneratingBrief(false); }
  }

  function copyBrief() {
    if (!brief) return;
    const lines = [
      `# ${brief.title}`, '',
      `**Objective:** ${brief.objective}`, '',
      `**Target Audience:** ${brief.target_audience}`, '',
      `**Tone:** ${brief.tone}`, '',
      `**Key Messages:**`,
      ...(brief.key_messages || []).map(m => `• ${m}`), '',
      `**Deliverables:**`,
      ...(brief.deliverables || []).map(d => `• ${d.quantity || 1}× ${d.type} (${d.format}) — ${d.platform}`), '',
      `**Creative Direction:** ${brief.creative_direction}`, '',
      `**Timeline:** ${brief.timeline?.deadline || 'TBD'}`,
      ...(brief.timeline?.milestones?.length ? brief.timeline.milestones.map(m => `  • ${m}`) : []), '',
      `**Notes:** ${brief.notes}`,
    ].join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // Derived
  const counts = { All: items.length, Video: 0, Design: 0, TV: 0 };
  items.forEach(i => { counts[i._type] = (counts[i._type] || 0) + 1; });

  const filtered = items.filter(item => {
    if (typeFilter !== 'All' && item._type !== typeFilter) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-0" style={{ height: 'calc(100vh - 120px)' }}>

      {/* ── Hero Header ── */}
      <div className="relative mb-5 rounded-2xl overflow-hidden flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
        {/* glow blobs */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(ellipse at 15% 60%, rgba(129,140,248,0.35) 0%, transparent 55%), radial-gradient(ellipse at 75% 20%, rgba(192,132,252,0.25) 0%, transparent 50%)' }} />
        <div className="relative px-6 py-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-[22px] font-black text-white tracking-tight leading-none">Studio</h1>
              <p className="text-indigo-300/80 text-[13px] mt-1">Video · Design · TV — live from Monday.com</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a href={VIDEO_FORM} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all">
                🎬 Video Request
              </a>
              <a href={DESIGN_FORM} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all">
                🎨 Design Request
              </a>
              <button onClick={loadItems} disabled={loading}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Stats chips */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total', val: counts.All, color: 'text-white' },
              { label: '🎬 Video', val: counts.Video, color: 'text-violet-300' },
              { label: '🎨 Design', val: counts.Design, color: 'text-pink-300' },
              { label: '📺 TV', val: counts.TV, color: 'text-blue-300' },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10">
                <span className={clsx('text-[11px] font-black', color)}>{val}</span>
                <span className="text-white/40 text-[11px]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0 flex-wrap">
        <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1">
          {['All', 'Video', 'Design', 'TV'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                typeFilter === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}>
              {TYPE_CFG[t]?.icon || ''} {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full pl-8 pr-8 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-all" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="text-[11px] text-gray-400 ml-auto">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* ── Content ── */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* Ticket list */}
        <div className={clsx('overflow-y-auto flex-shrink-0', selectedItem ? 'w-[380px]' : 'flex-1')}>
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 mb-4">
              <AlertCircle size={14} /> {error}
              <button onClick={loadItems} className="ml-auto underline hover:text-red-800">Retry</button>
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mb-3 opacity-50" />
              <div className="text-sm">Loading Monday.com tickets…</div>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState search={search} typeFilter={typeFilter} />
          ) : (
            <div className="space-y-2 pb-4">
              {filtered.map(item => (
                <TicketCard
                  key={item.id}
                  item={item}
                  isSelected={selectedItem?.id === item.id}
                  compact={!!selectedItem}
                  onOpen={() => selectedItem?.id === item.id ? setSelectedItem(null) : openItem(item)}
                  onGenerateBrief={() => handleGenerateBrief(item)}
                  generatingBrief={generatingBrief && briefItemId === item.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedItem && (
          <ItemDetailPanel
            item={selectedItem}
            updates={updates}
            loadingUpdates={loadingUpdates}
            brief={briefItemId === selectedItem.id ? brief : null}
            generatingBrief={generatingBrief && briefItemId === selectedItem.id}
            onGenerateBrief={() => handleGenerateBrief(selectedItem)}
            onCopyBrief={copyBrief}
            copied={copied}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Ticket Card ─────────────────────────────────────────────────────────────
function TicketCard({ item, isSelected, compact, onOpen, onGenerateBrief, generatingBrief }) {
  const status  = getStatus(item);
  const type    = TYPE_CFG[item._type] || TYPE_CFG.Video;
  const assignee = getColValue(item, 'person', 'assignee', 'owner');
  const deadline = getColValue(item, 'deadline', 'due', 'date');
  const lastUpdate = item.updates?.[0];
  const updateCount = typeof item.updates?.length === 'number' ? item.updates.length : 0;

  return (
    <div
      onClick={onOpen}
      className={clsx(
        'group relative rounded-xl border bg-white transition-all cursor-pointer',
        isSelected
          ? 'border-indigo-300 shadow-md shadow-indigo-100/60 ring-1 ring-indigo-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      )}
    >
      {/* Left type stripe */}
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b', type.gradient)} />

      <div className="pl-4 pr-4 py-3">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className="text-xl flex-shrink-0 mt-0.5">{type.icon}</div>

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm text-gray-900 leading-snug line-clamp-2 flex-1">{item.name}</h3>
              <ChevronRight size={14} className={clsx('flex-shrink-0 mt-0.5 transition-transform', isSelected && 'rotate-90 text-indigo-500')} />
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', type.badge)}>
                {item._type}
              </span>
              {status.label && (
                <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', status.bg, status.text, status.border)}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', status.dot)} />
                  {status.label}
                </span>
              )}
              {item.group?.title && item.group.title !== 'Topics' && (
                <span className="text-[10px] text-gray-400 font-medium truncate">{item.group.title}</span>
              )}
            </div>

            {/* Meta row */}
            {!compact && (
              <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                {assignee && (
                  <span className="flex items-center gap-1">
                    <User size={10} /> {assignee}
                  </span>
                )}
                {deadline && (
                  <span className="flex items-center gap-1">
                    <Calendar size={10} /> {deadline}
                  </span>
                )}
                {updateCount > 0 && (
                  <span className="flex items-center gap-1">
                    <MessageSquare size={10} /> {updateCount} update{updateCount !== 1 ? 's' : ''}
                  </span>
                )}
                {lastUpdate && (
                  <span className="ml-auto flex items-center gap-1 text-gray-300">
                    {timeAgo(lastUpdate.created_at)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action bar (hover reveal) */}
        {!compact && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => { e.stopPropagation(); onGenerateBrief(); }}
              disabled={generatingBrief}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {generatingBrief
                ? <Loader2 size={11} className="animate-spin" />
                : <Sparkles size={11} />
              }
              Generate Brief
            </button>
            <a
              href={`https://monday.com/boards/${item._boardId}/pulses/${item.id}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 ml-auto transition-colors"
            >
              Open in Monday <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ search, typeFilter }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-2xl mb-4 shadow-sm">
        {search || typeFilter !== 'All' ? '🔍' : '🎬'}
      </div>
      <div className="text-sm font-semibold text-gray-700 mb-1">
        {search ? `No tickets matching "${search}"` : typeFilter !== 'All' ? `No ${typeFilter} tickets yet` : 'No tickets yet'}
      </div>
      <p className="text-xs text-gray-400 max-w-xs">
        {search || typeFilter !== 'All'
          ? 'Try changing your filters or search term.'
          : 'Submit a Video or Design request using the buttons above. They\'ll appear here automatically.'}
      </p>
    </div>
  );
}

// ─── Item Detail Panel ────────────────────────────────────────────────────────
const ItemDetailPanel = forwardRef(function ItemDetailPanel(
  { item, updates, loadingUpdates, brief, generatingBrief, onGenerateBrief, onCopyBrief, copied, onClose },
  _ref
) {
  const status   = getStatus(item);
  const type     = TYPE_CFG[item._type] || TYPE_CFG.Video;
  const assignee = getColValue(item, 'person', 'assignee', 'owner');
  const deadline = getColValue(item, 'deadline', 'due', 'date');
  const cols     = (item.column_values || []).filter(cv => cv.text && cv.text.trim() && cv.type !== 'color');

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
      {/* Panel header */}
      <div className={clsx('flex-shrink-0 px-5 py-4 bg-gradient-to-r text-white', type.gradient)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{type.icon}</span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">{item._type} · {item._boardName}</span>
            </div>
            <h2 className="font-black text-base leading-snug">{item.name}</h2>
            <div className="flex items-center gap-2 mt-2">
              {status.label && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/80" /> {status.label}
                </span>
              )}
              {item.group?.title && (
                <span className="text-[11px] text-white/60">{item.group.title}</span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/25 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* Quick meta */}
        <div className="px-5 pt-4 pb-3 grid grid-cols-2 gap-3">
          {assignee && (
            <MetaChip icon={<User size={11} />} label="Assignee" value={assignee} />
          )}
          {deadline && (
            <MetaChip icon={<Calendar size={11} />} label="Deadline" value={deadline} />
          )}
        </div>

        {/* All column values */}
        {cols.length > 0 && (
          <div className="px-5 pb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Details</div>
            <div className="space-y-1.5">
              {cols.map(cv => (
                <div key={cv.id} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 font-medium flex-shrink-0 w-28 truncate">{cv.title}</span>
                  <span className="text-gray-700 flex-1">{cv.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open in Monday */}
        <div className="px-5 pb-4">
          <a
            href={`https://monday.com/boards/${item._boardId}/pulses/${item.id}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            Open in Monday <ExternalLink size={11} />
          </a>
        </div>

        {/* Generate Brief */}
        <div className="px-5 pb-4">
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-600" />
                <span className="text-sm font-bold text-indigo-900">AI Brief Generator</span>
              </div>
              <button
                onClick={onGenerateBrief}
                disabled={generatingBrief}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  generatingBrief
                    ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200'
                )}
              >
                {generatingBrief ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {generatingBrief ? 'Generating…' : brief ? 'Regenerate' : 'Generate'}
              </button>
            </div>

            {brief && (
              <div className="border-t border-indigo-100 px-4 py-4 bg-white/60">
                <BriefView brief={brief} onCopy={onCopyBrief} copied={copied} />
              </div>
            )}

            {!brief && !generatingBrief && (
              <div className="border-t border-indigo-100 px-4 py-3 text-[11px] text-indigo-500">
                Claude reads this Monday ticket and generates a full creative brief — objective, audience, deliverables, tone, and timeline.
              </div>
            )}
          </div>
        </div>

        {/* Updates / Comments */}
        <div className="px-5 pb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Updates &amp; Comments
            </div>
            {loadingUpdates && <Loader2 size={11} className="animate-spin text-gray-400" />}
          </div>

          {updates.length === 0 && !loadingUpdates ? (
            <div className="text-center py-6 text-gray-300 text-xs">No updates yet</div>
          ) : (
            <div className="space-y-3">
              {updates.map(update => (
                <UpdateBubble key={update.id} update={update} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Meta Chip ────────────────────────────────────────────────────────────────
function MetaChip({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-xl">
      <span className="text-gray-400 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-gray-400 font-semibold">{label}</div>
        <div className="text-xs text-gray-800 font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

// ─── Update Bubble ────────────────────────────────────────────────────────────
function UpdateBubble({ update }) {
  const [expanded, setExpanded] = useState(false);
  const body     = stripHtml(update.body);
  const isLong   = body.length > 180;
  const display  = !expanded && isLong ? body.slice(0, 180) + '…' : body;
  const name     = update.creator?.name || 'Unknown';

  return (
    <div className="flex gap-2.5">
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white"
        style={{ background: avatarColor(name) }}
      >
        {initials(name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-bold text-gray-800">{name}</span>
          <span className="text-[10px] text-gray-400">{timeAgo(update.created_at)}</span>
        </div>

        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">{display}</p>
          {isLong && (
            <button onClick={() => setExpanded(v => !v)}
              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold mt-1">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Replies */}
        {update.replies?.length > 0 && (
          <div className="ml-3 mt-2 space-y-2 border-l-2 border-gray-100 pl-3">
            {update.replies.map(r => (
              <div key={r.id} className="flex gap-2">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-black text-white"
                  style={{ background: avatarColor(r.creator?.name || '') }}
                >
                  {initials(r.creator?.name || '')}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-gray-700">{r.creator?.name} <span className="font-normal text-gray-400">{timeAgo(r.created_at)}</span></div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{stripHtml(r.body)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Brief View ───────────────────────────────────────────────────────────────
function BriefView({ brief, onCopy, copied }) {
  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-black text-sm text-gray-900">{brief.title}</h3>
        <button
          onClick={onCopy}
          className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-indigo-100 text-gray-500 hover:text-indigo-700 text-[10px] font-semibold transition-all"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Sections */}
      <BriefSection label="Objective" text={brief.objective} />
      <BriefSection label="Target Audience" text={brief.target_audience} />
      <BriefSection label="Tone" text={brief.tone} />

      {brief.key_messages?.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Key Messages</div>
          <ul className="space-y-0.5">
            {brief.key_messages.map((m, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                <span className="text-indigo-400 font-bold flex-shrink-0 mt-0.5">·</span> {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.deliverables?.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Deliverables</div>
          <div className="space-y-1">
            {brief.deliverables.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] bg-indigo-50 rounded-lg px-2 py-1.5">
                <span className="font-bold text-indigo-700">{d.quantity || 1}×</span>
                <span className="text-gray-700 font-medium">{d.type}</span>
                {d.format && <span className="text-gray-400">{d.format}</span>}
                {d.platform && <span className="ml-auto text-indigo-500 font-semibold">{d.platform}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <BriefSection label="Creative Direction" text={brief.creative_direction} />

      {brief.timeline?.deadline && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Timeline</div>
          <div className="flex items-center gap-2 text-xs text-gray-700">
            <Calendar size={11} className="text-gray-400" />
            <span className="font-semibold">{brief.timeline.deadline}</span>
          </div>
          {brief.timeline.milestones?.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1 ml-4">
              <ArrowRight size={9} className="text-gray-300" /> {m}
            </div>
          ))}
        </div>
      )}

      {brief.notes && brief.notes !== 'Not specified' && (
        <BriefSection label="Notes" text={brief.notes} />
      )}
    </div>
  );
}

function BriefSection({ label, text }) {
  if (!text) return null;
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <p className="text-xs text-gray-700 leading-relaxed">{text}</p>
    </div>
  );
}
