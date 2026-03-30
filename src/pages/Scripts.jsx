import { useState, useEffect } from 'react';
import {
  FileText, Plus, Search, CheckCircle, Eye, Archive, ChevronDown, ChevronRight,
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
  archived: 'bg-gray-100 text-gray-400',
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

  useEffect(() => {
    fetchAll();
    // Restore selected script from URL
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('script_id');
    if (sid) setSelectedId(sid);
  }, []);

  // Update URL when script changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('script_id', selectedId);
    else url.searchParams.delete('script_id');
    window.history.replaceState(null, '', url);
  }, [selectedId]);

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
    } catch (e) { console.error(e); }
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
    setScripts(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
  }

  // Group scripts by production
  const filtered = scripts.filter(s =>
    !search ||
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    productions.find(p => p.id === s.production_id)?.name?.toLowerCase().includes(search.toLowerCase())
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
          'w-full text-left px-3 py-2.5 transition-colors border-b border-gray-100 last:border-0',
          isSelected
            ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
            : 'hover:bg-white'
        )}
      >
        <div className="flex items-start gap-2">
          <Icon size={13} className={clsx('mt-0.5 shrink-0', isSelected ? 'text-indigo-500' : 'text-gray-400')} />
          <div className="flex-1 min-w-0">
            <div className={clsx('text-xs font-medium truncate', isSelected ? 'text-indigo-700' : 'text-gray-700')}>
              {script.title}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[script.status])}>
                {script.status}
              </span>
              {script.open_comment_count > 0 && (
                <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">
                  {script.open_comment_count} comment{script.open_comment_count !== 1 ? 's' : ''}
                </span>
              )}
              <span className="text-[10px] text-gray-400">{script.scene_count ?? 0}sc</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Left panel ─────────────────────────────── */}
      <div className="w-60 shrink-0 border-r border-gray-200 bg-gray-50/60 flex flex-col h-full">
        {/* Top toolbar */}
        <div className="p-3 border-b border-gray-200 space-y-2">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} /> New Script
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search scripts..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Script list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-8 text-center text-xs text-gray-400">Loading scripts...</div>
          ) : scripts.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <FileText size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-400">No scripts yet</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Create your first script
              </button>
            </div>
          ) : (
            <>
              {/* Scripts grouped by production */}
              {Object.entries(byProduction).map(([prodId, prodScripts]) => {
                const prod = productions.find(p => p.id === prodId);
                const isOpen = !collapsed[prodId];
                return (
                  <div key={prodId}>
                    <button
                      onClick={() => toggleCollapse(prodId)}
                      className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      <span className="truncate">{prod?.project_name || prod?.name || prod?.title || 'Unknown Production'}</span>
                      <span className="ml-auto text-gray-400 font-normal">{prodScripts.length}</span>
                    </button>
                    {isOpen && (
                      <div className="pl-2">
                        {prodScripts.map(renderScriptItem)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Standalone scripts */}
              {standalone.length > 0 && (
                <div>
                  {Object.keys(byProduction).length > 0 && (
                    <div className="px-3 py-2 text-[11px] font-semibold text-gray-400">Standalone</div>
                  )}
                  {standalone.map(renderScriptItem)}
                </div>
              )}

              {filtered.length === 0 && search && (
                <div className="px-3 py-6 text-center text-xs text-gray-400">No results for "{search}"</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel ────────────────────────────── */}
      <div className="flex-1 min-w-0 h-full overflow-auto">
        {selectedId ? (
          <StoryboardEditor
            key={selectedId}
            scriptId={selectedId}
            onDeleted={handleScriptDeleted}
            onUpdated={handleScriptUpdated}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-400 gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center">
              <FileText size={36} className="text-gray-300" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-600 mb-1">No script selected</p>
              <p className="text-sm text-gray-400">Pick a script from the list or create a new one</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
            >
              <Plus size={14} /> New Script
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <NewScriptModal
          onCreated={handleScriptCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
