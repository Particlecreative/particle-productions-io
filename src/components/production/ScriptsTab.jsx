import { useState, useEffect } from 'react';
import { Plus, FileText, CheckCircle, Clock, Archive, Eye, ChevronDown, ChevronRight, Search } from 'lucide-react';
import StoryboardEditor from '../scripts/StoryboardEditor';
import NewScriptModal from '../scripts/NewScriptModal';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-500',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
};
const STATUS_ICONS = {
  draft: FileText,
  review: Eye,
  approved: CheckCircle,
  archived: Archive,
};

export default function ScriptsTab({ productionId, production }) {
  const [scripts, setScripts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const brandId = production?.brand_id;

  useEffect(() => {
    fetchScripts();
  }, [productionId]);

  // Sync selected script from URL param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('script_id');
    if (sid) setSelectedId(sid);
  }, []);

  // Keep URL in sync when selection changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('script_id', selectedId);
    else url.searchParams.delete('script_id');
    window.history.replaceState(null, '', url);
  }, [selectedId]);

  async function fetchScripts() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/scripts?production_id=${productionId}`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setScripts(Array.isArray(data) ? data : []);
      // Auto-select first script if none selected
      if (!selectedId && data.length > 0) setSelectedId(data[0].id);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function handleScriptCreated(script) {
    setScripts(prev => [script, ...prev]);
    setSelectedId(script.id);
    setShowModal(false);
  }

  function handleScriptDeleted(id) {
    setScripts(prev => prev.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(scripts.find(s => s.id !== id)?.id || null);
  }

  function handleScriptUpdated(updated) {
    setScripts(prev => {
      const exists = prev.some(s => s.id === updated.id);
      if (!exists) { setSelectedId(updated.id); return [updated, ...prev]; }
      return prev.map(s => s.id === updated.id ? { ...s, ...updated } : s);
    });
  }

  const filtered = scripts.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading scripts...
      </div>
    );
  }

  return (
    <div className="flex gap-0 h-full min-h-[600px]">
      {/* Left panel — script list */}
      <div className="w-56 shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/50">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Plus size={14} />
            New Script
          </button>
          {scripts.length > 3 && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-gray-400 text-xs">
              {scripts.length === 0 ? (
                <>
                  <FileText size={24} className="mx-auto mb-2 opacity-40" />
                  No scripts yet
                </>
              ) : 'No results'}
            </div>
          ) : (
            filtered.map(script => {
              const Icon = STATUS_ICONS[script.status] || FileText;
              const isSelected = script.id === selectedId;
              return (
                <button
                  key={script.id}
                  onClick={() => setSelectedId(script.id)}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-0 transition-colors',
                    isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : 'hover:bg-white'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon size={13} className={clsx('mt-0.5 shrink-0', isSelected ? 'text-indigo-500' : 'text-gray-400')} />
                    <div className="flex-1 min-w-0">
                      <div className={clsx('text-xs font-medium truncate', isSelected ? 'text-indigo-700' : 'text-gray-700')}>
                        {script.title}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_COLORS[script.status])}>
                          {script.status}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {script.scene_count ?? 0} scenes
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel — editor */}
      <div className="flex-1 min-w-0">
        {selectedId ? (
          <StoryboardEditor
            key={selectedId}
            scriptId={selectedId}
            defaultProductionId={productionId}
            defaultBrandId={brandId}
            onDeleted={handleScriptDeleted}
            onUpdated={handleScriptUpdated}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <FileText size={40} className="opacity-30" />
            <p className="text-sm">Select a script or create a new one</p>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Plus size={14} /> New Script
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <NewScriptModal
          defaultProductionId={productionId}
          defaultBrandId={brandId}
          onCreated={handleScriptCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
