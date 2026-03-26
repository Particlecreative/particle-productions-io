import { useState, useEffect } from 'react';
import { Plus, Copy, Pencil, Trash2, ExternalLink, Check, LayoutGrid, List,
         ChevronUp, ChevronDown, Settings, X, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getLinks, createLink, updateLink, deleteLink, generateId,
  getLinkCategories, saveLinkCategories, DEFAULT_LINK_CATEGORIES,
} from '../../lib/dataService';
import FileUploadButton from '../shared/FileUploadButton';

// Kept for backward-compat (Links.jsx imports this)
export const LINK_CATEGORIES = DEFAULT_LINK_CATEGORIES;

export default function LinksTab({ productionId }) {
  const { isEditor } = useAuth();
  const [links, setLinks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [viewMode, setViewMode] = useState('card');
  const [addingTo, setAddingTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [managingCats, setManagingCats] = useState(false);

  useEffect(() => {
    async function load() {
      const [linksRes, catsRes] = await Promise.all([
        Promise.resolve(getLinks(productionId)),
        Promise.resolve(getLinkCategories(productionId)),
      ]);
      setLinks(Array.isArray(linksRes) ? linksRes : []);
      setCategories(Array.isArray(catsRes) ? catsRes : []);
    }
    load();
  }, [productionId]);

  async function refresh() {
    const [linksRes, catsRes] = await Promise.all([
      Promise.resolve(getLinks(productionId)),
      Promise.resolve(getLinkCategories(productionId)),
    ]);
    setLinks(Array.isArray(linksRes) ? linksRes : []);
    setCategories(Array.isArray(catsRes) ? catsRes : []);
  }

  // ── Link CRUD ──────────────────────────────────────────────────────────────
  function handleAdd(category) {
    if (!isEditor) return;
    if (!newTitle.trim() || !newUrl.trim()) return;
    createLink({
      id: generateId('lnk'),
      production_id: productionId,
      category,
      title: newTitle,
      url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`,
    });
    setAddingTo(null); setNewTitle(''); setNewUrl('');
    refresh();
  }

  function handleEdit(id) {
    const link = links.find(l => l.id === id);
    setEditingId(id); setNewTitle(link.title); setNewUrl(link.url);
  }

  function handleSaveEdit(id) {
    if (!isEditor) return;
    updateLink(id, { title: newTitle, url: newUrl });
    setEditingId(null); setNewTitle(''); setNewUrl('');
    refresh();
  }

  function handleDelete(id) {
    if (!isEditor) return;
    if (!confirm('Delete this link?')) return;
    deleteLink(id);
    refresh();
  }

  function moveLink(id, dir) {
    const link = links.find(l => l.id === id);
    const catLinks = links
      .filter(l => l.category === link.category)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = catLinks.findIndex(l => l.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= catLinks.length) return;
    const a = catLinks[idx], b = catLinks[swapIdx];
    const ao = a.order ?? idx, bo = b.order ?? swapIdx;
    updateLink(a.id, { order: bo });
    updateLink(b.id, { order: ao });
    refresh();
  }

  const sortedLinks = (catId) =>
    links.filter(l => l.category === catId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const sharedProps = {
    isEditor, editingId, newTitle, newUrl, setNewTitle, setNewUrl,
    onEdit: handleEdit, onSaveEdit: handleSaveEdit, onDelete: handleDelete, onMove: moveLink,
  };

  const toolbar = (
    <div className="flex items-center gap-2">
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      {isEditor && (
        <button
          onClick={() => setManagingCats(true)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors"
        >
          <Settings size={13} /> Categories
        </button>
      )}
    </div>
  );

  // ── CARD VIEW ──────────────────────────────────────────────────────────────
  const content = viewMode === 'card' ? (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mt-4">
      {categories.map(cat => {
        const catLinks = sortedLinks(cat.id);
        return (
          <div key={cat.id} className="brand-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>{cat.label}</h3>
              {isEditor && (
                <button onClick={() => { setAddingTo(cat.id); setNewTitle(''); setNewUrl(''); }}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div className="space-y-2">
              {catLinks.map((link, idx) => (
                <LinkCard key={link.id} link={link} {...sharedProps}
                  isFirst={idx === 0} isLast={idx === catLinks.length - 1} />
              ))}
              {catLinks.length === 0 && !addingTo && (
                <div className="text-xs text-gray-300 py-2 text-center">No links yet</div>
              )}
              {addingTo === cat.id && (
                <AddForm title={newTitle} url={newUrl}
                  onTitle={setNewTitle} onUrl={setNewUrl}
                  onAdd={() => handleAdd(cat.id)}
                  onCancel={() => setAddingTo(null)}
                  productionId={productionId}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    // ── LIST VIEW ────────────────────────────────────────────────────────────
    <div className="space-y-3 mt-4">
      {categories.map(cat => {
        const catLinks = sortedLinks(cat.id);
        if (catLinks.length === 0 && !addingTo) return (
          <div key={cat.id} className="brand-card py-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-400">{cat.label}</span>
            {isEditor && (
              <button onClick={() => { setAddingTo(cat.id); setNewTitle(''); setNewUrl(''); }}
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <Plus size={12} /> Add link
              </button>
            )}
          </div>
        );
        return (
          <div key={cat.id} className="brand-card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b"
              style={{ borderColor: 'var(--brand-border)', background: 'var(--brand-bg)' }}>
              <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{cat.label}</span>
              <span className="text-xs text-gray-400">{catLinks.length} link{catLinks.length !== 1 ? 's' : ''}</span>
              {isEditor && (
                <button onClick={() => { setAddingTo(cat.id); setNewTitle(''); setNewUrl(''); }}
                  className="ml-3 p-1 rounded hover:bg-gray-100 text-gray-400">
                  <Plus size={13} />
                </button>
              )}
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--brand-border)' }}>
              {catLinks.map((link, idx) => (
                <LinkRow key={link.id} link={link} {...sharedProps}
                  isFirst={idx === 0} isLast={idx === catLinks.length - 1} />
              ))}
              {addingTo === cat.id && (
                <div className="px-4 py-3">
                  <AddForm title={newTitle} url={newUrl}
                    onTitle={setNewTitle} onUrl={setNewUrl}
                    onAdd={() => handleAdd(cat.id)}
                    onCancel={() => setAddingTo(null)}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      {toolbar}
      {content}
      {managingCats && (
        <CategoryManagerModal
          productionId={productionId}
          categories={categories}
          links={links}
          onClose={() => { setManagingCats(false); refresh(); }}
        />
      )}
    </div>
  );
}

/* ─── Category Manager Modal ───────────────────────────────── */
function CategoryManagerModal({ productionId, categories, links, onClose }) {
  const [cats, setCats] = useState(() => categories.map((c, i) => ({ ...c, order: c.order ?? i })));
  const [newLabel, setNewLabel] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');

  function persist(updated) {
    setCats(updated);
    saveLinkCategories(productionId, updated);
  }

  function moveUp(idx) {
    if (idx === 0) return;
    const next = [...cats];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    persist(next.map((c, i) => ({ ...c, order: i })));
  }

  function moveDown(idx) {
    if (idx === cats.length - 1) return;
    const next = [...cats];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    persist(next.map((c, i) => ({ ...c, order: i })));
  }

  function startEdit(cat) {
    setEditingCatId(cat.id);
    setEditingLabel(cat.label);
  }

  function saveEdit(catId) {
    if (!editingLabel.trim()) { setEditingCatId(null); return; }
    persist(cats.map(c => c.id === catId ? { ...c, label: editingLabel.trim() } : c));
    setEditingCatId(null);
  }

  function deleteCategory(catId) {
    const linksInCat = links.filter(l => l.category === catId);
    if (linksInCat.length > 0) {
      if (!confirm(`This category has ${linksInCat.length} link(s). They will keep this category ID but won't show until you re-add this category. Delete anyway?`)) return;
    }
    persist(cats.filter(c => c.id !== catId));
  }

  function addCategory() {
    const label = newLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (cats.find(c => c.id === id)) { alert('Category with that ID already exists.'); return; }
    const next = [...cats, { id, label, order: cats.length }];
    persist(next);
    setNewLabel('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-800">Manage Link Categories</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="space-y-1 mb-4 max-h-72 overflow-y-auto">
          {cats.map((cat, idx) => (
            <div key={cat.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => moveUp(idx)} disabled={idx === 0}
                  className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                  <ChevronUp size={11} />
                </button>
                <button onClick={() => moveDown(idx)} disabled={idx === cats.length - 1}
                  className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                  <ChevronDown size={11} />
                </button>
              </div>

              {/* Label */}
              {editingCatId === cat.id ? (
                <input
                  autoFocus
                  className="flex-1 text-sm border rounded px-2 py-1 outline-none"
                  style={{ borderColor: 'var(--brand-border)' }}
                  value={editingLabel}
                  onChange={e => setEditingLabel(e.target.value)}
                  onBlur={() => saveEdit(cat.id)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(cat.id); if (e.key === 'Escape') setEditingCatId(null); }}
                />
              ) : (
                <span
                  className="flex-1 text-sm cursor-pointer hover:text-blue-600"
                  onClick={() => startEdit(cat)}
                  title="Click to rename"
                >
                  {cat.label}
                </span>
              )}

              {/* Link count */}
              <span className="text-[10px] text-gray-400 shrink-0">
                {links.filter(l => l.category === cat.id).length}
              </span>

              {/* Delete */}
              <button
                onClick={() => deleteCategory(cat.id)}
                className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Delete category"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add Category</label>
          <div className="flex gap-2">
            <input
              className="brand-input flex-1 text-sm"
              placeholder="Category name…"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
            />
            <button onClick={addCategory} className="btn-cta px-4 text-sm">Add</button>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="btn-secondary">Done</button>
        </div>
      </div>
    </div>
  );
}

/* ─── View Toggle ──────────────────────────────────────────── */
function ViewToggle({ mode, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
      <button onClick={() => onChange('card')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          mode === 'card' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
        <LayoutGrid size={13} /> Cards
      </button>
      <button onClick={() => onChange('list')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          mode === 'list' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
        <List size={13} /> List
      </button>
    </div>
  );
}

/* ─── Add Form ─────────────────────────────────────────────── */
function AddForm({ title, url, onTitle, onUrl, onAdd, onCancel, productionId }) {
  return (
    <div className="mt-2 space-y-2">
      <input className="brand-input text-xs" value={title} onChange={e => onTitle(e.target.value)}
        placeholder="Link title" autoFocus />
      <input className="brand-input text-xs" value={url} onChange={e => onUrl(e.target.value)}
        placeholder="https://… or upload a file below"
        onKeyDown={e => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel(); }} />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">or</span>
        <FileUploadButton
          category="links"
          subfolder={productionId ? `${new Date().getFullYear()}/${productionId}` : ''}
          accept="*/*"
          label="Upload File"
          size="sm"
          onUploaded={(data) => {
            const link = data?.drive?.viewLink || data?.dropbox?.link || '';
            if (link) onUrl(link);
            if (!title && data?.originalFileNameNoExt) onTitle(data.originalFileNameNoExt);
          }}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
        <button onClick={onAdd} className="btn-cta flex-1 text-xs py-1.5">Add</button>
      </div>
    </div>
  );
}

/* ─── Card mode: single link ───────────────────────────────── */
function LinkCard({ link, isEditor, editingId, newTitle, newUrl, setNewTitle, setNewUrl,
  onEdit, onSaveEdit, onDelete, onCancel, onMove, isFirst, isLast }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(link.url);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  if (editingId === link.id) return (
    <div className="space-y-2">
      <input className="brand-input text-xs" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
      <input className="brand-input text-xs" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={() => { setNewTitle(''); setNewUrl(''); onCancel?.(); }} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
        <button onClick={() => onSaveEdit(link.id)} className="btn-cta flex-1 text-xs py-1.5">Save</button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-1 group">
      {isEditor && (
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => onMove(link.id, -1)} disabled={isFirst}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 disabled:opacity-20">
            <ChevronUp size={11} />
          </button>
          <button onClick={() => onMove(link.id, 1)} disabled={isLast}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 disabled:opacity-20">
            <ChevronDown size={11} />
          </button>
        </div>
      )}
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        className="flex-1 text-sm text-blue-600 hover:text-blue-800 truncate flex items-center gap-1 min-w-0">
        <span className="truncate">{link.title}</span>
        <ExternalLink size={10} className="flex-shrink-0 opacity-50" />
      </a>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={handleCopy} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Copy">
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
        </button>
        {isEditor && (
          <>
            <button onClick={() => onEdit(link.id)} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Edit">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(link.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── List mode: single link row ───────────────────────────── */
function LinkRow({ link, isEditor, editingId, newTitle, newUrl, setNewTitle, setNewUrl,
  onEdit, onSaveEdit, onDelete, onMove, isFirst, isLast }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(link.url);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  if (editingId === link.id) return (
    <div className="px-4 py-3 space-y-2">
      <input className="brand-input text-xs" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
      <input className="brand-input text-xs" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={() => { setNewTitle(''); setNewUrl(''); }} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
        <button onClick={() => onSaveEdit(link.id)} className="btn-cta flex-1 text-xs py-1.5">Save</button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 group hover:bg-gray-50 transition-colors">
      {isEditor && (
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => onMove(link.id, -1)} disabled={isFirst}
            className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-500 disabled:opacity-20">
            <ChevronUp size={11} />
          </button>
          <button onClick={() => onMove(link.id, 1)} disabled={isLast}
            className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-500 disabled:opacity-20">
            <ChevronDown size={11} />
          </button>
        </div>
      )}
      <a href={link.url} target="_blank" rel="noopener noreferrer"
        className="flex-1 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5 min-w-0">
        <span className="truncate font-medium">{link.title}</span>
        <ExternalLink size={10} className="flex-shrink-0 opacity-40" />
      </a>
      <span className="text-xs text-gray-300 truncate max-w-[160px] hidden sm:block">{link.url}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={handleCopy} className="p-1.5 rounded hover:bg-gray-200 text-gray-400" title="Copy URL">
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
        </button>
        {isEditor && (
          <>
            <button onClick={() => onEdit(link.id)} className="p-1.5 rounded hover:bg-gray-200 text-gray-400" title="Edit">
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(link.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
