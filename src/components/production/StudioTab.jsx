import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, ExternalLink, X, Search, Loader2, AlertCircle,
  MessageSquare, Sparkles, Copy, Check, ChevronRight, Calendar,
  User, Zap, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

const VIDEO_BOARD  = '5433027071';
const DESIGN_BOARD = '8036329818';
const VIDEO_FORM   = 'https://wkf.ms/3PVukOV';
const DESIGN_FORM  = 'https://wkf.ms/4sKgeP9';

const STATUS_STYLES = {
  'Done':           { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'Approved':       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'Working on it':  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400'  },
  'In Progress':    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'   },
  'Stuck':          { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500'    },
  'Waiting':        { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  dot: 'bg-purple-500' },
  'Review':         { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    dot: 'bg-cyan-500'   },
  'Cancelled':      { bg: 'bg-gray-100',   text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400'   },
  '__default':      { bg: 'bg-gray-100',   text: 'text-gray-500',    border: 'border-gray-200',    dot: 'bg-gray-400'   },
};

const TYPE_CFG = {
  Video:  { gradient: 'from-violet-600 to-purple-700', badge: 'bg-violet-50 text-violet-700 border-violet-200', icon: '🎬' },
  Design: { gradient: 'from-pink-500 to-rose-600',     badge: 'bg-pink-50 text-pink-700 border-pink-200',       icon: '🎨' },
  TV:     { gradient: 'from-blue-600 to-indigo-700',   badge: 'bg-blue-50 text-blue-700 border-blue-200',       icon: '📺' },
};

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
  const deptCol = item.column_values?.find(cv =>
    ['department', 'type', 'channel', 'category'].some(k => cv.title?.toLowerCase().includes(k))
  );
  if (deptCol?.text?.toLowerCase().includes('tv')) return 'TV';
  const g = item.group?.title?.toLowerCase() || '';
  const n = item.name?.toLowerCase() || '';
  if (g.includes('tv') || n.startsWith('tv ') || n.includes(' tv ')) return 'TV';
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

// Match a Monday item to a production by name
function itemMatchesProduction(item, production) {
  if (!production) return true;
  const prodName = (production.project_name || production.id || '').toLowerCase();
  if (!prodName) return true;
  const itemName = item.name.toLowerCase();
  // Check item name or text columns for the production name
  if (itemName.includes(prodName) || prodName.includes(itemName.split(' ')[0])) return true;
  const textMatch = item.column_values?.some(cv =>
    cv.text && cv.text.toLowerCase().includes(prodName)
  );
  return textMatch || false;
}

export default function StudioTab({ productionId, production }) {
  const { token } = useAuth();
  const [items, setItems]                   = useState([]);
  const [allItems, setAllItems]             = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const [showAll, setShowAll]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [selectedItem, setSelectedItem]     = useState(null);
  const [updates, setUpdates]               = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);
  const [brief, setBrief]                   = useState(null);
  const [briefItemId, setBriefItemId]       = useState(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [copied, setCopied]                 = useState(false);

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
      all.sort((a, b) => (b.updates?.[0]?.created_at || '').localeCompare(a.updates?.[0]?.created_at || ''));
      setAllItems(all);
      // Filter to this production
      setItems(all.filter(i => itemMatchesProduction(i, production)));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token, production]);

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
    setGeneratingBrief(true); setBriefItemId(item.id); setBrief(null);
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
    } catch (err) { alert('Brief generation failed: ' + err.message); }
    finally { setGeneratingBrief(false); }
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
      `**Creative Direction:** ${brief.creative_direction}`, '',
      `**Timeline:** ${brief.timeline?.deadline || 'TBD'}`,
      `**Notes:** ${brief.notes}`,
    ].join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const displayItems = showAll ? allItems : items;
  const filtered = displayItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-base" style={{ color: 'var(--brand-primary)' }}>Studio</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {items.length > 0
              ? `${items.length} ticket${items.length !== 1 ? 's' : ''} linked to this production`
              : 'No tickets linked yet — showing all recent tickets below'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={VIDEO_FORM} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all">
            🎬 Video
          </a>
          <a href={DESIGN_FORM} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:border-pink-300 hover:text-pink-700 hover:bg-pink-50 transition-all">
            🎨 Design
          </a>
          <button onClick={loadItems} disabled={loading}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 transition-all">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Toggle if no matched items */}
      {items.length === 0 && allItems.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
          <span>No tickets found matching "{production?.project_name}"</span>
          <button onClick={() => setShowAll(true)} className="ml-auto font-semibold underline hover:text-amber-900">
            Show all recent
          </button>
        </div>
      )}

      {showAll && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold">Showing all tickets</span>
          <button onClick={() => setShowAll(false)} className="text-indigo-500 hover:text-indigo-700 underline">
            Show production only
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
          <AlertCircle size={13} /> {error}
          <button onClick={loadItems} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Search */}
      {filtered.length > 3 && (
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full pl-8 pr-8 py-2 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:border-indigo-300 transition-all" />
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-4 min-h-0">
        {/* List */}
        <div className={clsx('flex-1', selectedItem && 'max-w-sm')}>
          {loading && filtered.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-2">🎬</div>
              <div className="text-sm">No tickets yet</div>
              <div className="text-xs text-gray-300 mt-1">Submit a request using the buttons above</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => (
                <MiniTicketCard
                  key={item.id}
                  item={item}
                  isSelected={selectedItem?.id === item.id}
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
          <MiniDetailPanel
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

function MiniTicketCard({ item, isSelected, onOpen, onGenerateBrief, generatingBrief }) {
  const status = getStatus(item);
  const type   = TYPE_CFG[item._type] || TYPE_CFG.Video;
  const assignee = getColValue(item, 'person', 'assignee', 'owner');
  const deadline = getColValue(item, 'deadline', 'due', 'date');

  return (
    <div
      onClick={onOpen}
      className={clsx(
        'group relative rounded-xl border bg-white transition-all cursor-pointer',
        isSelected
          ? 'border-indigo-300 shadow-sm ring-1 ring-indigo-200'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      )}
    >
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b', type.gradient)} />
      <div className="pl-4 pr-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="text-base flex-shrink-0">{type.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-semibold text-gray-800 leading-snug line-clamp-2 flex-1">{item.name}</p>
              <ChevronRight size={12} className={clsx('flex-shrink-0 mt-0.5 text-gray-400 transition-transform', isSelected && 'rotate-90 text-indigo-500')} />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', type.badge)}>{item._type}</span>
              {status.label && (
                <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex items-center gap-1', status.bg, status.text, status.border)}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full', status.dot)} />{status.label}
                </span>
              )}
              {deadline && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Calendar size={9} />{deadline}</span>}
              {assignee && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><User size={9} />{assignee}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onGenerateBrief(); }} disabled={generatingBrief}
            className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800">
            {generatingBrief ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            Brief
          </button>
          <a href={`https://monday.com/boards/${item._boardId}/pulses/${item.id}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="ml-auto text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5">
            Monday <ExternalLink size={9} />
          </a>
        </div>
      </div>
    </div>
  );
}

function MiniDetailPanel({ item, updates, loadingUpdates, brief, generatingBrief, onGenerateBrief, onCopyBrief, copied, onClose }) {
  const type   = TYPE_CFG[item._type] || TYPE_CFG.Video;
  const status = getStatus(item);
  const cols   = (item.column_values || []).filter(cv => cv.text && cv.text.trim() && cv.type !== 'color');

  return (
    <div className="w-80 flex-shrink-0 flex flex-col rounded-2xl border border-gray-200 shadow-lg bg-white overflow-hidden">
      <div className={clsx('px-4 py-3 bg-gradient-to-r text-white flex-shrink-0', type.gradient)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-white/60 mb-0.5">{type.icon} {item._type}</div>
            <h4 className="text-sm font-black leading-snug">{item.name}</h4>
            {status.label && (
              <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-white/70" />{status.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg bg-white/10 hover:bg-white/25 transition-colors flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Columns */}
        {cols.length > 0 && (
          <div className="px-4 pt-3 pb-2">
            <div className="space-y-1">
              {cols.slice(0, 6).map(cv => (
                <div key={cv.id} className="flex items-start gap-2 text-[11px]">
                  <span className="text-gray-400 w-24 flex-shrink-0 truncate">{cv.title}</span>
                  <span className="text-gray-700 flex-1 leading-snug">{cv.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monday link */}
        <div className="px-4 pb-3">
          <a href={`https://monday.com/boards/${item._boardId}/pulses/${item.id}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
            Open in Monday <ExternalLink size={10} />
          </a>
        </div>

        {/* Brief */}
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 overflow-hidden">
            <div className="px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1"><Sparkles size={11} className="text-indigo-500" /> AI Brief</span>
              <button onClick={onGenerateBrief} disabled={generatingBrief}
                className={clsx('flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all',
                  generatingBrief ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                {generatingBrief ? <Loader2 size={9} className="animate-spin" /> : <Zap size={9} />}
                {brief ? 'Regen' : 'Generate'}
              </button>
            </div>
            {brief && (
              <div className="border-t border-indigo-100 px-3 py-3 bg-white/60 space-y-2">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[11px] font-black text-gray-900 flex-1">{brief.title}</p>
                  <button onClick={onCopyBrief} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 hover:bg-indigo-100 text-[10px] text-gray-500 hover:text-indigo-700 flex-shrink-0">
                    {copied ? <Check size={9} /> : <Copy size={9} />}{copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {brief.objective && <p className="text-[10px] text-gray-600 leading-relaxed">{brief.objective}</p>}
                {brief.tone && <p className="text-[10px] text-indigo-600 font-semibold">Tone: {brief.tone}</p>}
                {brief.timeline?.deadline && (
                  <p className="text-[10px] text-gray-500 flex items-center gap-1"><Calendar size={9} /> {brief.timeline.deadline}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Updates */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Updates</span>
            {loadingUpdates && <Loader2 size={10} className="animate-spin text-gray-400" />}
          </div>
          {updates.length === 0 && !loadingUpdates ? (
            <p className="text-[11px] text-gray-300 text-center py-4">No updates</p>
          ) : (
            <div className="space-y-2">
              {updates.slice(0, 8).map(u => {
                const body = stripHtml(u.body);
                if (!body) return null;
                const name = u.creator?.name || 'Unknown';
                return (
                  <div key={u.id} className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-black text-white"
                      style={{ background: avatarColor(name) }}>
                      {initials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-gray-700">{name} <span className="font-normal text-gray-400">{timeAgo(u.created_at)}</span></div>
                      <p className="text-[10px] text-gray-600 leading-relaxed line-clamp-3">{body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
