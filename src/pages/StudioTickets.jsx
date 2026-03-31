import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, ExternalLink, X, Search, Loader2, AlertCircle,
  Sparkles, Copy, Check, Calendar, User, Zap, ArrowRight,
  Plus, ChevronDown, Send, Link2, BarChart2, Film,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import clsx from 'clsx';

// ─── Constants ────────────────────────────────────────────────────────────────
const VIDEO_BOARD  = '5433027071';
const DESIGN_BOARD = '8036329818';
const VIDEO_FORM   = 'https://wkf.ms/3PVukOV';
const DESIGN_FORM  = 'https://wkf.ms/4sKgeP9';
const API = import.meta.env.VITE_API_URL || '';

// Monday-style status color map (approximate by label text)
const STATUS_PALETTE = {
  'done':           '#00c875', 'approved':       '#00c875',
  'working on it':  '#fdab3d', 'in progress':    '#579bfc',
  'stuck':          '#e2445c', 'waiting':        '#a25ddc',
  'review':         '#0086c0', 'cancelled':      '#c4c4c4',
  'ready for':      '#e2445c', 'new request':    '#007eb5',
};
function statusColor(label) {
  const k = (label || '').toLowerCase();
  for (const [key, color] of Object.entries(STATUS_PALETTE)) {
    if (k.includes(key)) return color;
  }
  return '#c4c4c4';
}

// Column display config — maps title patterns to how we render them
const COL_DEFS = [
  { key: 'status',     titles: ['status'],                  width: 130, label: 'Status',      render: 'status'   },
  { key: 'product',    titles: ['product', 'bundle'],       width: 130, label: 'Product',     render: 'status'   },
  { key: 'dept',       titles: ['department', 'depart'],    width: 100, label: 'Dept',        render: 'status'   },
  { key: 'priority',   titles: ['priority'],                width: 90,  label: 'Priority',    render: 'status'   },
  { key: 'deadline',   titles: ['deadline', 'due date'],    width: 100, label: 'Deadline',    render: 'date'     },
  { key: 'timeline',   titles: ['timeline'],                width: 130, label: 'Timeline',    render: 'timeline' },
  { key: 'requester',  titles: ['requested', 'requester', 'contact', 'name'], width: 110, label: 'Requested by', render: 'person' },
  { key: 'designer',   titles: ['design', 'assigned'],      width: 100, label: 'Designer',    render: 'person'   },
  { key: 'created',    titles: ['created'],                 width: 100, label: 'Created',     render: 'date'     },
  { key: 'dropbox',    titles: ['dropbox'],                 width: 90,  label: 'Dropbox',     render: 'link'     },
  { key: 'figma',      titles: ['figma'],                   width: 70,  label: 'Figma',       render: 'link'     },
];

const TYPE_CFG = {
  Video:  { gradient: 'from-violet-600 to-purple-700', color: '#7c3aed', badge: 'bg-violet-50 text-violet-700 border-violet-200', icon: '🎬', board: VIDEO_BOARD,  form: VIDEO_FORM  },
  Design: { gradient: 'from-pink-500 to-rose-600',     color: '#e11d48', badge: 'bg-pink-50 text-pink-700 border-pink-200',       icon: '🎨', board: DESIGN_BOARD, form: DESIGN_FORM },
  TV:     { gradient: 'from-blue-600 to-indigo-700',   color: '#1d4ed8', badge: 'bg-blue-50 text-blue-700 border-blue-200',       icon: '📺', board: VIDEO_BOARD,  form: VIDEO_FORM  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function mondayQuery(gql, token, variables) {
  const res = await fetch('/api/monday/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query: gql, variables }),
  });
  if (!res.ok) throw new Error(`Monday API ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'Monday query failed');
  return data.data;
}

function getItemType(item, boardId) {
  const deptCol = item.column_values?.find(cv =>
    ['department', 'type', 'channel', 'category'].some(k => cv.title?.toLowerCase().includes(k))
  );
  if (deptCol?.text?.toLowerCase().includes('tv')) return 'TV';
  const g = item.group?.title?.toLowerCase() || '';
  if (g.includes('tv') || item.name?.toLowerCase().startsWith('tv ')) return 'TV';
  if (boardId === DESIGN_BOARD) return 'Design';
  return 'Video';
}

function findCol(item, def) {
  return item.column_values?.find(cv =>
    def.titles.some(t => cv.title?.toLowerCase().includes(t))
  );
}

function stripHtml(h) { return h?.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || ''; }

function timeAgo(str) {
  if (!str) return '';
  const m = Math.floor((Date.now() - new Date(str)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name) { return (name || '?').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase(); }
function avatarBg(name) {
  const c = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#3b82f6','#10b981','#8b5cf6'];
  let h = 0; for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) % c.length;
  return c[h];
}

// ─── Cell renderers ───────────────────────────────────────────────────────────
function StatusCell({ text }) {
  if (!text) return <span className="text-gray-300 text-xs">—</span>;
  const color = statusColor(text);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold text-white truncate max-w-[120px]"
      style={{ background: color }}>
      {text}
    </span>
  );
}
function DateCell({ text }) {
  if (!text) return <span className="text-gray-300 text-xs">—</span>;
  return <span className="text-xs text-gray-600 whitespace-nowrap">{text}</span>;
}
function TimelineCell({ text }) {
  if (!text) return <span className="text-gray-300 text-xs">—</span>;
  return <span className="text-[11px] text-gray-500 whitespace-nowrap">{text}</span>;
}
function PersonCell({ text }) {
  if (!text) return <span className="text-gray-300 text-xs">—</span>;
  const names = text.split(',').map(s => s.trim()).filter(Boolean);
  return (
    <div className="flex -space-x-1">
      {names.slice(0, 3).map((n, i) => (
        <div key={i} className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white ring-1 ring-white"
          style={{ background: avatarBg(n) }} title={n}>
          {initials(n)}
        </div>
      ))}
      {names.length > 3 && (
        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600 ring-1 ring-white">
          +{names.length - 3}
        </div>
      )}
    </div>
  );
}
function LinkCell({ text }) {
  if (!text) return <span className="text-gray-300 text-xs">—</span>;
  const url = text.startsWith('http') ? text : `https://${text}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-[11px] text-blue-500 hover:text-blue-700 hover:underline">
      <Link2 size={10} /> Link
    </a>
  );
}

function renderCell(item, def) {
  const col = findCol(item, def);
  const text = col?.text || '';
  switch (def.render) {
    case 'status':   return <StatusCell text={text} />;
    case 'date':     return <DateCell text={text} />;
    case 'timeline': return <TimelineCell text={text} />;
    case 'person':   return <PersonCell text={text} />;
    case 'link':     return <LinkCell text={text} />;
    default:         return <span className="text-xs text-gray-600 truncate">{text || '—'}</span>;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StudioTickets() {
  const { token } = useAuth();
  const { brandId } = useBrand();

  const [items, setItems]                   = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [typeFilter, setTypeFilter]         = useState('All');
  const [requesterFilter, setRequesterFilter] = useState('All');
  const [productionFilter, setProductionFilter] = useState('');
  const [search, setSearch]                 = useState('');
  const [productions, setProductions]       = useState([]);
  const [selectedItem, setSelectedItem]     = useState(null);
  const [updates, setUpdates]               = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [brief, setBrief]                   = useState(null);
  const [briefItemId, setBriefItemId]       = useState(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [copied, setCopied]                 = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [syncingGantt, setSyncingGantt]     = useState(false);
  const [ganttSynced, setGanttSynced]       = useState(null);

  // Load Monday items
  const loadItems = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const data = await mondayQuery(`{
        boards(ids: [${VIDEO_BOARD}, ${DESIGN_BOARD}]) {
          id name
          items_page(limit: 150) {
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
      all.sort((a, b) => (b.updates?.[0]?.created_at || '').localeCompare(a.updates?.[0]?.created_at || ''));
      setItems(all);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  // Load system productions for filter
  const loadProductions = useCallback(async () => {
    if (!token || !brandId) return;
    try {
      const res = await fetch(`${API}/api/productions?brand_id=${encodeURIComponent(brandId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) setProductions(await res.json());
    } catch { /* ignore */ }
  }, [token, brandId]);

  useEffect(() => { loadItems(); loadProductions(); }, [loadItems, loadProductions]);

  async function openItem(item) {
    setSelectedItem(item);
    setBrief(null); setGanttSynced(null);
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
    setGeneratingBrief(true); setBriefItemId(item.id); setBrief(null);
    if (selectedItem?.id !== item.id) await openItem(item);
    try {
      const res = await fetch(`${API}/api/briefs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ item_id: item.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Brief generation failed');
      setBrief(json.brief);
    } catch (err) { alert('Brief generation failed: ' + err.message); }
    finally { setGeneratingBrief(false); }
  }

  async function syncToGantt(item, productionId) {
    const timelineCol = findCol(item, { titles: ['timeline'] });
    const text = timelineCol?.text || '';
    // Parse date range like "Jan 1 - Jan 15" or "2026-01-01 - 2026-01-15"
    const parts = text.split(/[-–—]/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) { alert('No timeline dates found on this ticket'); return; }
    const start = new Date(parts[0]); const end = new Date(parts[1]);
    if (isNaN(start) || isNaN(end)) { alert('Could not parse timeline dates: ' + text); return; }
    setSyncingGantt(true);
    try {
      const res = await fetch(`${API}/api/gantt/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          production_id: productionId,
          title: `[Studio] ${item.name}`,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          color: '#6366f1',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setGanttSynced(productionId);
    } catch (err) { alert('Gantt sync failed: ' + err.message); }
    finally { setSyncingGantt(false); }
  }

  function copyBrief() {
    if (!brief) return;
    const t = [`# ${brief.title}`, '', `**Objective:** ${brief.objective}`, '',
      `**Audience:** ${brief.target_audience}`, `**Tone:** ${brief.tone}`, '',
      `**Key Messages:**`, ...(brief.key_messages || []).map(m => `• ${m}`), '',
      `**Creative Direction:** ${brief.creative_direction}`, '',
      `**Timeline:** ${brief.timeline?.deadline || 'TBD'}`, `**Notes:** ${brief.notes}`].join('\n');
    navigator.clipboard.writeText(t);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  // Derived filters
  const allRequesters = [...new Set(items.map(i => findCol(i, { titles: ['requested', 'requester', 'contact', 'name'] })?.text || '').filter(Boolean))].sort();

  const filtered = items.filter(item => {
    if (typeFilter !== 'All' && item._type !== typeFilter) return false;
    if (requesterFilter && requesterFilter !== 'All') {
      const r = (findCol(item, { titles: ['requested', 'requester', 'contact', 'name'] })?.text || '').toLowerCase();
      if (!r.includes(requesterFilter.toLowerCase())) return false;
    }
    if (productionFilter) {
      const prodName = productions.find(p => p.id === productionFilter)?.project_name?.toLowerCase() || productionFilter.toLowerCase();
      const match = item.name.toLowerCase().includes(prodName) ||
        item.column_values?.some(cv => cv.text?.toLowerCase().includes(prodName));
      if (!match) return false;
    }
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { All: items.length, Video: 0, Design: 0, TV: 0 };
  items.forEach(i => { counts[i._type] = (counts[i._type] || 0) + 1; });

  return (
    <div className="flex flex-col min-h-0" style={{ height: 'calc(100vh - 120px)' }}>

      {/* ── Hero Header ── */}
      <div className="relative mb-4 rounded-2xl overflow-hidden flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(ellipse at 15% 60%, rgba(129,140,248,.35) 0%, transparent 55%), radial-gradient(ellipse at 75% 20%, rgba(192,132,252,.22) 0%, transparent 50%)' }} />
        <div className="relative px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Studio</h1>
            <p className="text-indigo-300/70 text-[12px] mt-0.5">Video · Design · TV — synced live from Monday.com</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBriefModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold shadow-lg shadow-indigo-900/40 transition-all">
              <Sparkles size={12} /> New Brief
            </button>
            <a href={VIDEO_FORM} target="_blank" rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all">🎬</a>
            <a href={DESIGN_FORM} target="_blank" rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all">🎨</a>
            <button onClick={loadItems} disabled={loading}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        {/* Stats */}
        <div className="relative border-t border-white/10 px-6 py-2 flex gap-5">
          {Object.entries(counts).map(([t, n]) => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="text-white font-black text-sm">{n}</span>
              <span className="text-white/40 text-[11px]">{TYPE_CFG[t]?.icon || ''} {t}</span>
            </div>
          ))}
          {productionFilter && (
            <div className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30">
              <span className="text-[10px] text-indigo-200 font-semibold">
                {productions.find(p => p.id === productionFilter)?.project_name || productionFilter}
              </span>
              <button onClick={() => setProductionFilter('')} className="text-indigo-300 hover:text-white">
                <X size={10} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0 flex-wrap">
        {/* Type */}
        <div className="flex gap-0.5 bg-gray-100 rounded-xl p-0.5">
          {['All', 'Video', 'Design', 'TV'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={clsx('px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                typeFilter === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
              {TYPE_CFG[t]?.icon || ''} {t}
            </button>
          ))}
        </div>

        {/* Production filter */}
        <div className="relative">
          <Film size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={productionFilter} onChange={e => setProductionFilter(e.target.value)}
            className="pl-7 pr-6 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer hover:border-gray-300 transition-all min-w-[140px]">
            <option value="">All productions</option>
            {productions.map(p => (
              <option key={p.id} value={p.id}>{p.project_name || p.id}</option>
            ))}
          </select>
        </div>

        {/* Requester */}
        <div className="relative">
          <User size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select value={requesterFilter} onChange={e => setRequesterFilter(e.target.value)}
            className="pl-7 pr-6 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none cursor-pointer hover:border-gray-300 transition-all">
            <option value="All">All requesters</option>
            {allRequesters.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full pl-8 pr-7 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 transition-all" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={11} /></button>}
        </div>

        <div className="text-[11px] text-gray-400 ml-auto">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* ── Content area ── */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* Table */}
        <div className="flex-1 min-w-0 overflow-auto rounded-xl border border-gray-200 bg-white">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-red-600 bg-red-50 border-b border-red-100">
              <AlertCircle size={13} /> {error}
              <button onClick={loadItems} className="ml-auto underline">Retry</button>
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <Loader2 size={24} className="animate-spin mb-3 opacity-50" />
              <span className="text-sm">Loading Monday.com tickets…</span>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <th className="w-8 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left sticky left-0 bg-gray-50 min-w-[260px]">Project</th>
                  {COL_DEFS.map(d => (
                    <th key={d.key} className="px-3 py-2.5 text-left whitespace-nowrap" style={{ width: d.width }}>{d.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={COL_DEFS.length + 3} className="text-center py-16 text-gray-400">
                      <div className="text-3xl mb-2">🎬</div>
                      <div className="text-sm">{search || typeFilter !== 'All' || productionFilter ? 'No matching tickets' : 'No tickets yet'}</div>
                    </td>
                  </tr>
                ) : (
                  filtered.map(item => (
                    <TableRow
                      key={item.id}
                      item={item}
                      isSelected={selectedItem?.id === item.id}
                      onClick={() => selectedItem?.id === item.id ? setSelectedItem(null) : openItem(item)}
                    />
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail / Updates panel */}
        {selectedItem && (
          <DetailPanel
            item={selectedItem}
            updates={updates}
            loadingUpdates={loadingUpdates}
            brief={briefItemId === selectedItem.id ? brief : null}
            generatingBrief={generatingBrief && briefItemId === selectedItem.id}
            onGenerateBrief={() => handleGenerateBrief(selectedItem)}
            onCopyBrief={copyBrief}
            copied={copied}
            productions={productions}
            onSyncGantt={(prodId) => syncToGantt(selectedItem, prodId)}
            syncingGantt={syncingGantt}
            ganttSynced={ganttSynced}
            onClose={() => setSelectedItem(null)}
            token={token}
          />
        )}
      </div>

      {/* Brief creation modal */}
      {showBriefModal && (
        <BriefModal
          token={token}
          productions={productions}
          brandId={brandId}
          onClose={() => setShowBriefModal(false)}
          onCreated={() => { setShowBriefModal(false); loadItems(); }}
        />
      )}
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────
function TableRow({ item, isSelected, onClick }) {
  const type = TYPE_CFG[item._type] || TYPE_CFG.Video;
  const lastUpdate = item.updates?.[0]?.created_at;

  return (
    <tr
      onClick={onClick}
      className={clsx(
        'border-b border-gray-100 cursor-pointer transition-colors group',
        isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50/70'
      )}
    >
      {/* Type stripe */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <div className="w-1 h-6 rounded-full flex-shrink-0" style={{ background: type.color }} />
          <span className="text-base leading-none">{type.icon}</span>
        </div>
      </td>

      {/* Name (sticky) */}
      <td className={clsx('px-3 py-2 sticky left-0 transition-colors', isSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-gray-50/70')}>
        <div className="font-semibold text-gray-800 text-xs leading-snug line-clamp-2 max-w-[280px]">{item.name}</div>
        {item.group?.title && (
          <div className="text-[10px] text-gray-400 mt-0.5">{item.group.title}</div>
        )}
      </td>

      {/* Dynamic columns */}
      {COL_DEFS.map(def => (
        <td key={def.key} className="px-3 py-2" style={{ width: def.width }}>
          {renderCell(item, def)}
        </td>
      ))}

      {/* Last updated */}
      <td className="px-3 py-2 text-right">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(lastUpdate)}</span>
      </td>
    </tr>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({ item, updates, loadingUpdates, brief, generatingBrief, onGenerateBrief, onCopyBrief, copied, productions, onSyncGantt, syncingGantt, ganttSynced, onClose, token }) {
  const type    = TYPE_CFG[item._type] || TYPE_CFG.Video;
  const cols    = (item.column_values || []).filter(cv => cv.text?.trim() && cv.type !== 'color');
  const timeline = findCol(item, { titles: ['timeline'] });
  const [syncProd, setSyncProd] = useState('');
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  async function postComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await mondayQuery(`
        mutation { create_update(item_id: ${item.id}, body: ${JSON.stringify(newComment.trim())}) { id } }
      `, token);
      setNewComment('');
      // Optimistically add to updates
    } catch (err) { alert('Could not post comment: ' + err.message); }
    finally { setPostingComment(false); }
  }

  return (
    <div className="w-[340px] flex-shrink-0 flex flex-col rounded-2xl border border-gray-200 shadow-xl bg-white overflow-hidden">
      {/* Header */}
      <div className={clsx('flex-shrink-0 px-4 py-3.5 bg-gradient-to-r text-white', type.gradient)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-white/60 mb-0.5">{type.icon} {item._type} · {item._boardName}</div>
            <h3 className="text-[13px] font-black leading-snug">{item.name}</h3>
            {item.group?.title && <div className="text-[10px] text-white/60 mt-0.5">{item.group.title}</div>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg bg-white/10 hover:bg-white/25 transition-colors flex-shrink-0">
            <X size={13} />
          </button>
        </div>
        <a href={`https://monday.com/boards/${item._boardId}/pulses/${item.id}`} target="_blank" rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors">
          <ExternalLink size={9} /> Open in Monday
        </a>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Field grid */}
        <div className="px-4 pt-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-2">
          {COL_DEFS.filter(d => findCol(item, d)?.text).slice(0, 8).map(def => {
            const col = findCol(item, def);
            return (
              <div key={def.key}>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{def.label}</div>
                <div>{renderCell(item, def)}</div>
              </div>
            );
          })}
        </div>

        {/* Gantt sync */}
        {timeline?.text && (
          <div className="px-4 pb-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart2 size={12} className="text-indigo-500" />
                <span className="text-[11px] font-bold text-gray-700">Sync to Production Timeline</span>
              </div>
              <div className="text-[10px] text-gray-500 mb-2">Timeline: <span className="font-semibold">{timeline.text}</span></div>
              <div className="flex gap-2">
                <select value={syncProd} onChange={e => setSyncProd(e.target.value)}
                  className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-300">
                  <option value="">Select production…</option>
                  {productions.map(p => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
                </select>
                <button
                  onClick={() => syncProd && onSyncGantt(syncProd)}
                  disabled={!syncProd || syncingGantt}
                  className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all',
                    !syncProd || syncingGantt ? 'bg-gray-100 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                  {syncingGantt ? <Loader2 size={10} className="animate-spin" /> : <ArrowRight size={10} />}
                  {ganttSynced ? 'Synced!' : 'Sync'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Brief */}
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden">
            <div className="px-3 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                <Sparkles size={11} className="text-indigo-500" /> AI Brief
              </span>
              <button onClick={onGenerateBrief} disabled={generatingBrief}
                className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                  generatingBrief ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm')}>
                {generatingBrief ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                {brief ? 'Regen' : 'Generate'}
              </button>
            </div>
            {brief && (
              <div className="border-t border-indigo-100 px-3 py-3 bg-white/60 space-y-2">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[11px] font-black text-gray-900 flex-1 leading-snug">{brief.title}</p>
                  <button onClick={onCopyBrief}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-indigo-100 text-[10px] text-gray-500 hover:text-indigo-700 flex-shrink-0">
                    {copied ? <Check size={9} /> : <Copy size={9} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {brief.objective && <p className="text-[10px] text-gray-600 leading-relaxed">{brief.objective}</p>}
                {brief.tone && <div className="text-[10px] text-indigo-600 font-semibold">Tone: {brief.tone}</div>}
                {brief.deliverables?.length > 0 && (
                  <div className="space-y-0.5">
                    {brief.deliverables.map((d, i) => (
                      <div key={i} className="text-[10px] bg-indigo-50 rounded px-1.5 py-0.5 text-indigo-700 font-medium">
                        {d.quantity || 1}× {d.type} · {d.platform}
                      </div>
                    ))}
                  </div>
                )}
                {brief.timeline?.deadline && (
                  <div className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Calendar size={9} /> {brief.timeline.deadline}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Updates */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Updates</span>
            {loadingUpdates && <Loader2 size={10} className="animate-spin text-gray-400" />}
            <span className="ml-auto text-[10px] text-gray-300">{updates.length}</span>
          </div>
          {updates.length === 0 && !loadingUpdates ? (
            <p className="text-[11px] text-gray-300 text-center py-6">No updates yet</p>
          ) : (
            <div className="space-y-3">
              {updates.map(u => <UpdateBubble key={u.id} update={u} />)}
            </div>
          )}
        </div>

        {/* Add comment */}
        <div className="px-4 pb-4 mt-2">
          <div className="flex gap-2 items-end">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
              placeholder="Add update to Monday…"
              rows={2}
              className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-300 resize-none transition-all"
            />
            <button onClick={postComment} disabled={!newComment.trim() || postingComment}
              className={clsx('p-2 rounded-xl transition-all flex-shrink-0',
                newComment.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400')}>
              {postingComment ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Update Bubble ────────────────────────────────────────────────────────────
function UpdateBubble({ update }) {
  const [exp, setExp] = useState(false);
  const body  = stripHtml(update.body);
  const name  = update.creator?.name || 'Unknown';
  const long  = body.length > 200;
  const text  = !exp && long ? body.slice(0, 200) + '…' : body;
  if (!body) return null;
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white ring-1 ring-white"
        style={{ background: avatarBg(name) }}>
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-bold text-gray-800">{name}</span>
          <span className="text-[10px] text-gray-400">{timeAgo(update.created_at)}</span>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
          {long && <button onClick={() => setExp(v => !v)} className="text-[10px] text-indigo-500 font-semibold mt-1">{exp ? 'Less' : 'More'}</button>}
        </div>
        {update.replies?.length > 0 && (
          <div className="ml-3 mt-1.5 pl-3 border-l-2 border-gray-100 space-y-1.5">
            {update.replies.map(r => (
              <div key={r.id} className="flex gap-1.5">
                <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-black text-white"
                  style={{ background: avatarBg(r.creator?.name || '') }}>
                  {initials(r.creator?.name)}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-700">{r.creator?.name} </span>
                  <span className="text-[10px] text-gray-600">{stripHtml(r.body)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Brief Creation Modal ─────────────────────────────────────────────────────
function BriefModal({ token, productions, brandId, onClose, onCreated }) {
  const [type, setType]           = useState('Video');
  const [prodId, setProdId]       = useState('');
  const [prompt, setPrompt]       = useState('');
  const [brief, setBrief]         = useState(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating]   = useState(false);
  const textRef = useRef(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true); setBrief(null);
    const prod = productions.find(p => p.id === prodId);
    const ctx = [
      prod ? `Production: ${prod.project_name} (ID: ${prod.id}, type: ${prod.production_type || ''})` : '',
      `Request type: ${type}`,
      `Brief request: ${prompt}`,
    ].filter(Boolean).join('\n');
    try {
      const res = await fetch(`${API}/api/briefs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ item_id: null, extra_context: ctx }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setBrief(json.brief);
    } catch (err) { alert('Generation failed: ' + err.message); }
    finally { setGenerating(false); }
  }

  async function createInMonday() {
    if (!brief) return;
    setCreating(true);
    const boardId = TYPE_CFG[type]?.board || VIDEO_BOARD;
    try {
      await mondayQuery(`
        mutation { create_item(board_id: "${boardId}", item_name: ${JSON.stringify(brief.title)}) { id } }
      `, token);
      onCreated();
    } catch (err) { alert('Could not create in Monday: ' + err.message); setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-300" />
            <h2 className="text-base font-black text-white">New Studio Brief</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Type */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Type</div>
            <div className="flex gap-2">
              {['Video', 'Design', 'TV'].map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={clsx('flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                    type === t
                      ? `border-transparent text-white bg-gradient-to-r ${TYPE_CFG[t].gradient}`
                      : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  {TYPE_CFG[t].icon} {t}
                </button>
              ))}
            </div>
          </div>

          {/* Production */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Production</div>
            <div className="relative">
              <Film size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select value={prodId} onChange={e => setProdId(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-indigo-300 appearance-none">
                <option value="">Select production (optional)</option>
                {productions.map(p => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
              </select>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">What do you need?</div>
            <textarea
              ref={textRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) generate(); }}
              placeholder="e.g. 30s video for the Gillette launch, Instagram + YouTube, energetic tone, show the product in use, deadline end of April…"
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 resize-none transition-all leading-relaxed"
            />
            <div className="text-[10px] text-gray-400 mt-1">Press ⌘↵ to generate</div>
          </div>

          {/* Generate */}
          {!brief && (
            <button onClick={generate} disabled={!prompt.trim() || generating}
              className={clsx('w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                prompt.trim() && !generating
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generating ? 'Claude is generating your brief…' : 'Generate Brief'}
            </button>
          )}

          {/* Brief preview */}
          {brief && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-black text-gray-900">{brief.title}</h3>
                <button onClick={() => setBrief(null)} className="text-[10px] text-gray-400 hover:text-gray-600 underline flex-shrink-0">Edit</button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {brief.objective && <div className="col-span-2"><span className="text-gray-400 font-semibold">Objective: </span><span className="text-gray-700">{brief.objective}</span></div>}
                {brief.target_audience && <div><span className="text-gray-400 font-semibold">Audience: </span><span className="text-gray-700">{brief.target_audience}</span></div>}
                {brief.tone && <div><span className="text-gray-400 font-semibold">Tone: </span><span className="text-gray-700">{brief.tone}</span></div>}
                {brief.timeline?.deadline && <div><span className="text-gray-400 font-semibold">Deadline: </span><span className="text-gray-700">{brief.timeline.deadline}</span></div>}
              </div>
              {brief.deliverables?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {brief.deliverables.map((d, i) => (
                    <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[11px] font-semibold">
                      {d.quantity || 1}× {d.type} · {d.platform}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={generate} disabled={generating}
                  className="flex-1 py-2 rounded-xl border border-indigo-200 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-all">
                  {generating ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null} Regenerate
                </button>
                <button onClick={createInMonday} disabled={creating}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-1.5 transition-all">
                  {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Create in Monday
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
