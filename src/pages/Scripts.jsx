import { useState, useEffect } from 'react';
import {
  FileText, Plus, Search, CheckCircle, Eye, Archive, ChevronDown, ChevronRight, ChevronLeft,
  Loader2, Scroll, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import StoryboardEditor from '../components/scripts/StoryboardEditor';
import NewScriptModal from '../components/scripts/NewScriptModal';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-500',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-gray-200 text-gray-400',
};
const STATUS_ICONS = { draft: FileText, review: Eye, approved: CheckCircle, archived: Archive };

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [productions, setProductions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_scripts_sidebar') ?? 'true'); } catch { return true; }
  });

  useEffect(() => {
    fetchAll();
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('script_id');
    if (sid) setSelectedId(sid);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('script_id', selectedId);
    else url.searchParams.delete('script_id');
    window.history.replaceState(null, '', url);
  }, [selectedId]);

  function toggleSidebar() {
    setSidebarOpen(v => {
      const next = !v;
      localStorage.setItem('cp_scripts_sidebar', JSON.stringify(next));
      return next;
    });
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const [scriptsRes, prodsRes] = await Promise.all([
        fetch(`${API}/api/scripts`, { headers: { Authorization: `Bearer ${jwt()}` } }),
        fetch(`${API}/api/productions`, { headers: { Authorization: `Bearer ${jwt()}` } }),
      ]);
      const [scriptsData, prodsData] = await Promise.all([scriptsRes.json(), prodsRes.json()]);
      setScripts(Array.isArray(scriptsData) ? scriptsData : []);
      setProductions(Array.isArray(prodsData) ? prodsData : []);
    } catch {}
    setLoading(false);
  }

  function handleScriptCreated(script) {
    setScripts(prev => [script, ...prev]);
    setSelectedId(script.id);
    setShowModal(false);
  }

  function handleScriptDeleted(id) {
    setScripts(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleScriptUpdated(updated) {
    setScripts(prev => {
      const exists = prev.some(s => s.id === updated.id);
      if (!exists) { setSelectedId(updated.id); return [updated, ...prev]; }
      return prev.map(s => s.id === updated.id ? { ...s, ...updated } : s);
    });
  }

  const filtered = scripts.filter(s =>
    !search ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    productions.find(p => p.id === s.production_id)?.project_name?.toLowerCase().includes(search.toLowerCase())
  );

  const standalone = filtered.filter(s => !s.production_id);
  const byProduction = {};
  filtered.filter(s => s.production_id).forEach(s => {
    if (!byProduction[s.production_id]) byProduction[s.production_id] = [];
    byProduction[s.production_id].push(s);
  });

  function toggleCollapse(prodId) {
    setCollapsed(c => ({ ...c, [prodId]: !c[prodId] }));
  }

  function renderScriptItem(script) {
    const Icon = STATUS_ICONS[script.status] || FileText;
    const isSelected = script.id === selectedId;
    return (
      <button
        key={script.id}
        onClick={() => setSelectedId(script.id)}
        className={clsx(
          'w-full text-left px-3 py-2.5 transition-all rounded-lg mx-1 mb-0.5',
          isSelected
            ? 'bg-white shadow-sm border'
            : 'hover:bg-white/80 border border-transparent'
        )}
        style={isSelected ? { borderColor: 'var(--brand-accent, #6366f1)' } : {}}
        aria-label={`Open script: ${script.title}`}
        aria-current={isSelected ? 'page' : undefined}
      >
        <div className="flex items-start gap-2.5">
          <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
            isSelected ? 'bg-opacity-20' : 'bg-gray-100')}
            style={isSelected ? { background: 'var(--brand-glow, #eef2ff)' } : {}}>
            <Icon size={13} className={isSelected ? '' : 'text-gray-400'} style={isSelected ? { color: 'var(--brand-accent, #6366f1)' } : {}} />
          </div>
          <div className="flex-1 min-w-0">
            <div className={clsx('text-xs font-semibold truncate', isSelected ? '' : 'text-gray-700')}
              style={isSelected ? { color: 'var(--brand-primary, #1e1b4b)' } : {}}>
              {script.title}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', STATUS_COLORS[script.status])}>
                {script.status}
              </span>
              {script.open_comment_count > 0 && (
                <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold">
                  {script.open_comment_count}
                </span>
              )}
              <span className="text-[9px] text-gray-400 font-mono">{script.scene_count ?? 0} scenes</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* ── Left panel — script list (collapsible) ── */}
      <div className={clsx(
        'shrink-0 border-r flex flex-col transition-all duration-200',
        'w-full md:h-full',
        selectedId && !sidebarOpen ? 'hidden md:flex md:w-0 md:overflow-hidden md:border-0' : '',
        selectedId && sidebarOpen ? 'hidden md:flex md:w-64' : '',
        !selectedId ? 'flex' : '',
      )}
        style={{ borderColor: 'var(--brand-border, #e5e7eb)', background: 'var(--brand-bg, #f9fafb)' }}
      >
        {/* Header */}
        <div className="p-3 border-b space-y-2.5" style={{ borderColor: 'var(--brand-border, #e5e7eb)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black flex items-center gap-2" style={{ color: 'var(--brand-primary, #1e1b4b)' }}>
              <Scroll size={15} style={{ color: 'var(--brand-accent, #6366f1)' }} /> Scripts
              <span className="text-[10px] font-mono text-gray-400 font-normal">{scripts.length}</span>
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--brand-accent, #6366f1)' }}
                aria-label="Create new script"
              >
                <Plus size={12} /> New
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search scripts..."
              className="w-full pl-7 pr-8 py-2 text-xs border rounded-lg bg-white outline-none focus:ring-2 transition-all"
              style={{ borderColor: 'var(--brand-border, #e5e7eb)', '--tw-ring-color': 'var(--brand-glow, #c7d2fe)' }}
              aria-label="Search scripts"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs w-5 h-5 flex items-center justify-center" aria-label="Clear search">x</button>
            )}
          </div>
        </div>

        {/* Script list */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {loading ? (
            <div className="px-3 py-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                  <div className="skeleton-block w-7 h-7 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton-block h-3 w-3/4 rounded" />
                    <div className="skeleton-block h-2.5 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : scripts.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <FileText size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">No scripts yet</p>
              <p className="text-xs text-gray-400 mb-4">Create your first script to get started</p>
              <button onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold"
                style={{ color: 'var(--brand-accent, #6366f1)' }}>
                <Plus size={12} /> Create Script
              </button>
            </div>
          ) : (
            <>
              {Object.entries(byProduction).map(([prodId, prodScripts]) => {
                const prod = productions.find(p => p.id === prodId);
                const isOpen = !collapsed[prodId];
                return (
                  <div key={prodId} className="mb-1">
                    <button
                      onClick={() => toggleCollapse(prodId)}
                      className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 transition-colors uppercase tracking-wider"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      <span className="truncate">{prod?.project_name || 'Unknown'}</span>
                      <span className="ml-auto text-gray-400 font-mono text-[10px] font-normal lowercase">{prodScripts.length}</span>
                    </button>
                    {isOpen && prodScripts.map(renderScriptItem)}
                  </div>
                );
              })}

              {standalone.length > 0 && (
                <div className="mb-1">
                  {Object.keys(byProduction).length > 0 && (
                    <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Standalone</div>
                  )}
                  {standalone.map(renderScriptItem)}
                </div>
              )}

              {filtered.length === 0 && search && (
                <div className="px-4 py-8 text-center">
                  <Search size={20} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-xs text-gray-400">No results for "{search}"</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel — editor ── */}
      <div className={clsx('flex-1 min-w-0 overflow-auto', selectedId ? 'flex flex-col h-full' : 'hidden md:flex flex-col h-full')}>
        {selectedId ? (
          <>
            {/* Mobile back + sidebar toggle */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-white shrink-0" style={{ borderColor: 'var(--brand-border, #e5e7eb)' }}>
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden flex items-center gap-1 text-xs font-semibold"
                style={{ color: 'var(--brand-accent, #6366f1)' }}
                aria-label="Back to scripts list"
              >
                <ChevronLeft size={14} /> Scripts
              </button>
              <button
                onClick={toggleSidebar}
                className="hidden md:flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <StoryboardEditor
                key={selectedId}
                scriptId={selectedId}
                onDeleted={handleScriptDeleted}
                onUpdated={handleScriptUpdated}
                productions={productions}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] md:min-h-0 text-gray-400 gap-5">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--brand-glow, #eef2ff)' }}>
              <Scroll size={32} style={{ color: 'var(--brand-accent, #6366f1)', opacity: 0.5 }} />
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-600 mb-1">No script selected</p>
              <p className="text-sm text-gray-400">Pick a script from the list or create a new one</p>
            </div>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
              style={{ background: 'var(--brand-accent, #6366f1)' }}>
              <Plus size={14} /> New Script
            </button>
          </div>
        )}
      </div>

      {/* New Script Modal */}
      {showModal && (
        <NewScriptModal
          onCreated={handleScriptCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
