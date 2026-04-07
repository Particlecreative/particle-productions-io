import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Package, Edit3, Check, Loader2, Film, Search } from 'lucide-react';
import { toast } from '../../lib/toast';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * UniversalBlocks — Reusable scene templates panel.
 * Users can save, browse, and insert pre-built scene blocks into scripts.
 */
export default function UniversalBlocks({ brandId, onInsert, onClose, selectedScenes }) {
  const [blocks, setBlocks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  // Create block form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createCategory, setCreateCategory] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit block
  const [editingBlock, setEditingBlock] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');

  useEffect(() => { loadBlocks(); }, [brandId]);

  const loadBlocks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/scripts/blocks?brand_id=${brandId}`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setBlocks(data.blocks || []);
      setCategories(data.categories || []);
    } catch {}
    setLoading(false);
  };

  // New block scenes state (for manual creation without selection)
  const [newBlockScenes, setNewBlockScenes] = useState([{ location: '', what_we_see: '', what_we_hear: '', duration: '' }]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    const scenesToSave = selectedScenes?.length > 0 ? selectedScenes : newBlockScenes.filter(s => s.what_we_see || s.what_we_hear);
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/scripts/blocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({
          brand_id: brandId,
          name: createName.trim(),
          category: createCategory.trim() || 'general',
          scenes: scenesToSave,
        }),
      });
      const data = await res.json();
      if (data.id) {
        toast.success(`Block "${createName}" saved`);
        setShowCreate(false);
        setCreateName('');
        setCreateCategory('');
        loadBlocks();
      } else {
        toast.error(data.error || 'Failed to create block');
      }
    } catch (err) {
      toast.error('Failed to create block');
    }
    setCreating(false);
  };

  const handleDelete = async (blockId, blockName) => {
    if (!confirm(`Delete block "${blockName}"? This cannot be undone.`)) return;
    try {
      await fetch(`${API}/api/scripts/blocks/${blockId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      toast.success('Block deleted');
      loadBlocks();
    } catch {
      toast.error('Failed to delete block');
    }
  };

  const handleUpdate = async (blockId) => {
    try {
      const res = await fetch(`${API}/api/scripts/blocks/${blockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ name: editName.trim(), category: editCategory.trim() || 'general' }),
      });
      const data = await res.json();
      if (data.id) {
        toast.success('Block updated');
        setEditingBlock(null);
        loadBlocks();
      }
    } catch {
      toast.error('Failed to update block');
    }
  };

  const handleInsert = (block) => {
    // Deep clone scenes with new UUIDs
    const clonedScenes = (block.scenes || []).map(s => ({
      ...s,
      id: crypto.randomUUID(),
      images: (s.images || []).map(img => ({ ...img, id: crypto.randomUUID() })),
    }));
    onInsert(clonedScenes);
    toast.success(`Inserted "${block.name}" (${clonedScenes.length} scene${clonedScenes.length !== 1 ? 's' : ''})`);
  };

  const filteredBlocks = blocks.filter(b => {
    if (activeCategory !== 'all' && b.category !== activeCategory) return false;
    if (search && !b.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const allCategories = ['all', ...categories];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
              <Package size={18} className="text-indigo-500" /> Universal Blocks
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus size={12} /> New Block
              </button>
              <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
            </div>
          </div>

          {/* Search + Category tabs */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search blocks..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-indigo-300"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Create Block Form */}
        {showCreate && (
          <div className="px-6 py-4 border-b border-gray-100 bg-indigo-50/50 shrink-0 max-h-[50vh] overflow-y-auto">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              {selectedScenes?.length > 0
                ? `Save ${selectedScenes.length} scene${selectedScenes.length !== 1 ? 's' : ''} as a reusable block`
                : 'Create a new reusable block'}
            </p>
            <div className="flex gap-2 mb-2">
              <input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="Block name (e.g. Final CTA)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-300"
                autoFocus
              />
              <input
                value={createCategory}
                onChange={e => setCreateCategory(e.target.value)}
                placeholder="Category"
                list="block-categories"
                className="w-32 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-indigo-300"
              />
              <datalist id="block-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            {/* Scene inputs when no selection */}
            {(!selectedScenes || selectedScenes.length === 0) && (
              <div className="space-y-2 mb-2">
                {newBlockScenes.map((s, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-2 bg-white space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-gray-400">Scene {i + 1}</span>
                      {newBlockScenes.length > 1 && (
                        <button onClick={() => setNewBlockScenes(prev => prev.filter((_, j) => j !== i))} className="text-[9px] text-red-400 hover:text-red-600 ml-auto">Remove</button>
                      )}
                    </div>
                    <input value={s.location} onChange={e => setNewBlockScenes(prev => prev.map((sc, j) => j === i ? { ...sc, location: e.target.value } : sc))}
                      placeholder="Location" className="w-full text-xs border border-gray-100 rounded px-2 py-1 outline-none" />
                    <textarea value={s.what_we_see} onChange={e => setNewBlockScenes(prev => prev.map((sc, j) => j === i ? { ...sc, what_we_see: e.target.value } : sc))}
                      placeholder="What We See" rows={2} className="w-full text-xs border border-gray-100 rounded px-2 py-1 outline-none resize-none" />
                    <textarea value={s.what_we_hear} onChange={e => setNewBlockScenes(prev => prev.map((sc, j) => j === i ? { ...sc, what_we_hear: e.target.value } : sc))}
                      placeholder="What We Hear" rows={2} className="w-full text-xs border border-gray-100 rounded px-2 py-1 outline-none resize-none text-indigo-700 italic" />
                  </div>
                ))}
                <button onClick={() => setNewBlockScenes(prev => [...prev, { location: '', what_we_see: '', what_we_hear: '', duration: '' }])}
                  className="text-[10px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                  <Plus size={10} /> Add Scene
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Save Block
              </button>
            </div>
          </div>
        )}

        {/* Blocks List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
          ) : filteredBlocks.length === 0 ? (
            <div className="text-center py-12">
              <Package size={32} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400 font-medium">
                {blocks.length === 0 ? 'No blocks yet' : 'No blocks match your search'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Select scenes in a script and click "Save Selection as Block" to create one
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredBlocks.map(block => (
                <div
                  key={block.id}
                  className="group border border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
                  onClick={() => handleInsert(block)}
                >
                  {editingBlock === block.id ? (
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none" autoFocus />
                      <input value={editCategory} onChange={e => setEditCategory(e.target.value)}
                        placeholder="Category" list="block-categories-edit"
                        className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none" />
                      <datalist id="block-categories-edit">
                        {categories.map(c => <option key={c} value={c} />)}
                      </datalist>
                      <button onClick={() => handleUpdate(block.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={14} /></button>
                      <button onClick={() => setEditingBlock(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {/* Thumbnail or icon */}
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                        {block.thumbnail_url ? (
                          <img src={block.thumbnail_url} alt="" className="w-full h-full rounded-lg object-cover" />
                        ) : (
                          <Film size={16} className="text-indigo-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{block.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{block.category}</span>
                          <span className="text-[10px] text-gray-400">{(block.scenes || []).length} scene{(block.scenes || []).length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {/* Actions — visible on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditingBlock(block.id); setEditName(block.name); setEditCategory(block.category); }}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit block"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(block.id, block.name)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete block"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
