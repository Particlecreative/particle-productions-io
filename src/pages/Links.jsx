import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Copy, Pencil, Trash2, Check, LayoutGrid, List, X } from 'lucide-react';
import ExportMenu from '../components/ui/ExportMenu';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { getAllLinks, getProductions, updateLink, deleteLink } from '../lib/dataService';
import { LINK_CATEGORIES } from '../components/production/LinksTab';
import clsx from 'clsx';

export default function Links() {
  const { brandId } = useBrand();
  const { isEditor } = useAuth();

  const [links, setLinks] = useState([]);
  const [productions, setProductions] = useState([]);
  const [filter, setFilter] = useState('');
  const [filterPrdId, setFilterPrdId] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProd, setFilterProd] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

  useEffect(() => { load(); }, [brandId]);

  async function load() {
    const prods = await Promise.resolve(getProductions(brandId));
    const prodsArr = Array.isArray(prods) ? prods : [];
    setProductions(prodsArr);
    const prodIds = new Set(prodsArr.map(p => p.id));
    const linksRes = await Promise.resolve(getAllLinks());
    setLinks((Array.isArray(linksRes) ? linksRes : []).filter(l => prodIds.has(l.production_id)));
  }

  function handleEdit(link) {
    setEditingId(link.id);
    setEditTitle(link.title);
    setEditUrl(link.url);
  }

  function handleSaveEdit(id) {
    updateLink(id, { title: editTitle, url: editUrl });
    setEditingId(null);
    load();
  }

  function handleDelete(id) {
    if (!confirm('Delete this link?')) return;
    deleteLink(id);
    load();
  }

  const prodMap = useMemo(() => {
    const m = {};
    productions.forEach(p => { m[p.id] = p; });
    return m;
  }, [productions]);

  const filtered = useMemo(() => {
    let list = links;
    if (filterProd) list = list.filter(l => l.production_id === filterProd);
    if (filterPrdId) {
      const q = filterPrdId.toLowerCase();
      list = list.filter(l => {
        const prod = prodMap[l.production_id];
        return (prod?.production_id || l.production_id).toLowerCase().includes(q);
      });
    }
    if (filterCategory) list = list.filter(l => l.category === filterCategory);
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.url || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [links, filter, filterPrdId, filterCategory, filterProd, prodMap]);

  const hasFilters = filter || filterPrdId || filterCategory || filterProd;

  // ── CARD VIEW ──────────────────────────────────────────────────────────────
  const cardsByCategory = useMemo(() => {
    const map = {};
    LINK_CATEGORIES.forEach(cat => {
      const catLinks = filtered.filter(l => l.category === cat.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (catLinks.length > 0) map[cat.id] = { cat, links: catLinks };
    });
    return Object.values(map);
  }, [filtered]);

  const LINKS_EXPORT_COLS = [
    { key: 'production_name', label: 'Production' },
    { key: 'production_id_val', label: 'PRD' },
    { key: 'category', label: 'Category' },
    { key: 'title', label: 'Title' },
    { key: 'url', label: 'URL' },
  ];
  const linksExportRows = useMemo(() =>
    filtered.map(l => ({
      ...l,
      production_name: prodMap[l.production_id]?.project_name || l.production_id,
      production_id_val: prodMap[l.production_id]?.id || '',
    })), [filtered, prodMap]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-3xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          All Links
        </h1>
        <div className="flex items-center gap-3">
          <ExportMenu rows={linksExportRows} columns={LINKS_EXPORT_COLS} filename="links" title="All Links" />
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            <button onClick={() => setViewMode('list')}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                viewMode === 'list' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700')}>
              <List size={13} /> List
            </button>
            <button onClick={() => setViewMode('card')}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                viewMode === 'card' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700')}>
              <LayoutGrid size={13} /> Cards
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar — text + PRD search */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          className="brand-input"
          style={{ width: 200 }}
          placeholder="Search title / URL…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <input
          className="brand-input font-mono"
          style={{ width: 130 }}
          placeholder="PRD number…"
          value={filterPrdId}
          onChange={e => setFilterPrdId(e.target.value)}
        />
        <select
          className="brand-input"
          style={{ width: 200 }}
          value={filterProd}
          onChange={e => setFilterProd(e.target.value)}
        >
          <option value="">All productions</option>
          {productions.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>
        {hasFilters && (
          <button
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
            onClick={() => { setFilter(''); setFilterPrdId(''); setFilterCategory(''); setFilterProd(''); }}
          >
            <X size={12} /> Clear
          </button>
        )}
        <div className="ml-auto text-sm text-gray-400">{filtered.length} link{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Category pill filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterCategory('')}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
            !filterCategory
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
          )}
        >
          All
        </button>
        {LINK_CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setFilterCategory(filterCategory === c.id ? '' : c.id)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
              filterCategory === c.id
                ? 'text-white border-transparent shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
            )}
            style={filterCategory === c.id ? { background: c.color || 'var(--brand-accent)', borderColor: c.color || 'var(--brand-accent)' } : {}}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="brand-card text-center py-16">
          <div className="text-5xl mb-4">🔗</div>
          <div className="text-gray-400 font-semibold mb-1">
            {hasFilters ? 'No links match your filters.' : 'No links yet.'}
          </div>
          <div className="text-gray-300 text-xs">
            {hasFilters
              ? 'Try adjusting your search or category filter.'
              : 'Add links from individual production boards.'}
          </div>
        </div>
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === 'list' && filtered.length > 0 && (
        <div
          className="brand-card p-0 overflow-hidden"
          style={{ opacity: 1, transform: 'translateY(0)', transition: 'opacity 0.2s, transform 0.2s' }}
        >
          <div className="table-scroll-wrapper">
            <table className="data-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Production</th>
                  <th style={{ minWidth: 80 }}>PRD</th>
                  <th style={{ minWidth: 120 }}>Category</th>
                  <th style={{ minWidth: 180 }}>Title</th>
                  <th style={{ minWidth: 200 }}>URL</th>
                  {isEditor && <th style={{ width: 80 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(link => {
                  const prod = prodMap[link.production_id];
                  const cat = LINK_CATEGORIES.find(c => c.id === link.category);
                  if (editingId === link.id) return (
                    <tr key={link.id}>
                      <td className="text-xs text-gray-500">{prod?.project_name || link.production_id}</td>
                      <td className="font-mono text-xs text-gray-400">{prod?.id || ''}</td>
                      <td className="text-xs">{cat?.label || link.category}</td>
                      <td>
                        <input className="brand-input text-xs" value={editTitle}
                          onChange={e => setEditTitle(e.target.value)} autoFocus />
                      </td>
                      <td>
                        <input className="brand-input text-xs" value={editUrl}
                          onChange={e => setEditUrl(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(link.id); if (e.key === 'Escape') setEditingId(null); }} />
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200">Cancel</button>
                          <button onClick={() => handleSaveEdit(link.id)} className="text-xs btn-cta px-2 py-1">Save</button>
                        </div>
                      </td>
                    </tr>
                  );
                  return (
                    <tr
                      key={link.id}
                      className="group"
                      style={{
                        borderLeft: cat?.color ? `3px solid ${cat.color}` : '3px solid transparent',
                      }}
                    >
                      <td>
                        <span className="text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>
                          {prod?.project_name || link.production_id}
                        </span>
                      </td>
                      <td className="font-mono text-xs text-gray-400">{prod?.id || ''}</td>
                      <td className="text-xs text-gray-500">{cat?.label || link.category}</td>
                      <td>
                        <a href={link.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                          <span>{link.title}</span>
                          <ExternalLink size={10} className="opacity-40 flex-shrink-0" />
                        </a>
                      </td>
                      <td className="text-xs text-gray-300 truncate max-w-[200px]">{link.url}</td>
                      {isEditor && (
                        <td>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CopyButton url={link.url} />
                            <button onClick={() => handleEdit(link)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Pencil size={12} /></button>
                            <button onClick={() => handleDelete(link.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CARD VIEW ──────────────────────────────────────────────────────── */}
      {viewMode === 'card' && filtered.length > 0 && (
        <div
          className="space-y-6"
          style={{ animation: 'fadeIn 0.2s ease' }}
        >
          {cardsByCategory.map(({ cat, links: catLinks }) => (
            <div key={cat.id}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ background: cat.color || 'var(--brand-accent)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>{cat.label}</h3>
                <span className="text-xs text-gray-400">({catLinks.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {catLinks.map(link => {
                  const prod = prodMap[link.production_id];
                  if (editingId === link.id) return (
                    <div key={link.id} className="brand-card space-y-2">
                      <input className="brand-input text-xs" value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus />
                      <input className="brand-input text-xs" value={editUrl} onChange={e => setEditUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(link.id); if (e.key === 'Escape') setEditingId(null); }} />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                        <button onClick={() => handleSaveEdit(link.id)} className="btn-cta flex-1 text-xs py-1.5">Save</button>
                      </div>
                    </div>
                  );
                  return (
                    <div
                      key={link.id}
                      className="brand-card group overflow-hidden"
                      style={{
                        borderLeft: `4px solid ${cat.color || 'var(--brand-accent)'}`,
                        paddingLeft: 16,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <a href={link.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 min-w-0">
                          <span className="truncate font-medium">{link.title}</span>
                          <ExternalLink size={10} className="flex-shrink-0 opacity-40" />
                        </a>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <CopyButton url={link.url} />
                          {isEditor && (
                            <>
                              <button onClick={() => handleEdit(link)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><Pencil size={12} /></button>
                              <button onClick={() => handleDelete(link.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 text-xs text-gray-400 truncate">{prod?.project_name || link.production_id}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ url }) {
  const [copied, setCopied] = useState(false);
  const [popping, setPopping] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setPopping(true);
    setTimeout(() => setCopied(false), 1500);
    setTimeout(() => setPopping(false), 300);
  }
  return (
    <button
      onClick={handleCopy}
      className={clsx('p-1.5 rounded hover:bg-gray-100 text-gray-400', popping && 'card-pop')}
      title="Copy URL"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
    </button>
  );
}
