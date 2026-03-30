import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '../../context/BrandContext';
import {
  getProductions, getAllLineItems, getAllCasting, getSuppliers,
} from '../../lib/dataService';
import clsx from 'clsx';

const ALL_YEARS = [2024, 2025, 2026, 2027, 2028];
const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const CATEGORIES = {
  production: { icon: '📋', label: 'Productions' },
  lineitem:   { icon: '💰', label: 'Budget Items' },
  cast:       { icon: '🎭', label: 'Cast Members' },
  supplier:   { icon: '🏢', label: 'Suppliers' },
  script:     { icon: '📝', label: 'Scripts' },
};

function Highlight({ text = '', query }) {
  if (!query || !text) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

export default function GlobalSearch({ open, onClose }) {
  const { brandId } = useBrand();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  // Cache async data so useMemo can search synchronously
  const [cachedProds, setCachedProds]         = useState([]);
  const [cachedLineItems, setCachedLineItems] = useState([]);
  const [cachedCast, setCachedCast]           = useState([]);
  const [cachedSuppliers, setCachedSuppliers] = useState([]);
  const [cachedScripts, setCachedScripts]     = useState([]);

  useEffect(() => {
    if (open) { setQuery(''); setActiveIdx(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // Fetch all searchable data when brand changes
  useEffect(() => {
    async function fetchData() {
      try {
        const prodsPerYear = await Promise.all(
          ALL_YEARS.map(yr => Promise.resolve(getProductions(brandId, yr)))
        );
        const prodMap = new Map();
        prodsPerYear.forEach(list => {
          (Array.isArray(list) ? list : []).forEach(p => { if (!prodMap.has(p.id)) prodMap.set(p.id, p); });
        });
        setCachedProds([...prodMap.values()]);

        const [lineItems, casting, suppliers, scriptsRes] = await Promise.all([
          Promise.resolve(getAllLineItems()),
          Promise.resolve(getAllCasting()),
          Promise.resolve(getSuppliers(brandId)),
          jwt() ? fetch(`${API}/api/scripts`, { headers: { Authorization: `Bearer ${jwt()}` } }).then(r => r.ok ? r.json() : []) : Promise.resolve([]),
        ]);
        setCachedLineItems(Array.isArray(lineItems) ? lineItems : []);
        setCachedCast(Array.isArray(casting) ? casting : []);
        setCachedSuppliers(Array.isArray(suppliers) ? suppliers : []);
        setCachedScripts(Array.isArray(scriptsRes) ? scriptsRes : []);
      } catch (e) { console.warn('GlobalSearch fetch error:', e); }
    }
    fetchData();
  }, [brandId]);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const q = query.toLowerCase();
    const items = [];

    try {
      const prodIds = new Set(cachedProds.map(p => p.id));

      cachedProds.forEach(p => {
        const fields = [p.id, p.project_name, p.producer, p.production_type, p.stage, p.notes];
        if (fields.some(f => String(f || '').toLowerCase().includes(q))) {
          items.push({ type: 'production', id: p.id, label: p.project_name, sub: `${p.id} · ${p.stage || '—'} · ${p.production_type || '—'}`, url: `/production/${p.id}` });
        }
      });

      // Budget line items
      cachedLineItems.filter(li => prodIds.has(li.production_id)).slice(0, 300).forEach(li => {
        if ([li.item, li.full_name, li.type, li.vendor].some(f => String(f || '').toLowerCase().includes(q))) {
          items.push({ type: 'lineitem', id: li.id, label: li.item || li.full_name || 'Line Item', sub: `${li.production_id} · ${li.type || '—'}`, url: `/production/${li.production_id}` });
        }
      });

      // Cast members
      cachedCast.filter(c => prodIds.has(c.production_id)).slice(0, 300).forEach(c => {
        if ([c.name, c.role, c.character, c.agency].some(f => String(f || '').toLowerCase().includes(q))) {
          items.push({ type: 'cast', id: c.id, label: c.name || 'Cast', sub: `${c.role || '—'} · ${c.production_id}`, url: `/production/${c.production_id}` });
        }
      });

      // Suppliers
      cachedSuppliers.slice(0, 100).forEach(s => {
        if ([s.name, s.category, s.contact_name, s.email].some(f => String(f || '').toLowerCase().includes(q))) {
          items.push({ type: 'supplier', id: s.id, label: s.name || 'Supplier', sub: s.category || '—', url: '/suppliers' });
        }
      });

      // Scripts
      cachedScripts.slice(0, 200).forEach(s => {
        if ([s.title, s.project_name, s.status].some(f => String(f || '').toLowerCase().includes(q))) {
          const sub = [s.project_name, s.status, `${s.scene_count ?? 0} scenes`].filter(Boolean).join(' · ');
          const url = s.production_id
            ? `/production/${s.production_id}?tab=Scripts&script_id=${s.id}`
            : `/scripts?script_id=${s.id}`;
          items.push({ type: 'script', id: s.id, label: s.title || 'Untitled Script', sub, url });
        }
      });
    } catch (e) { console.warn('GlobalSearch error:', e); }

    // Group by category (max 5 each)
    const grouped = {};
    Object.keys(CATEGORIES).forEach(cat => { grouped[cat] = []; });
    items.forEach(item => { if (grouped[item.type] && grouped[item.type].length < 5) grouped[item.type].push(item); });

    const flat = [];
    Object.entries(grouped).forEach(([cat, catItems]) => {
      if (catItems.length > 0) {
        flat.push({ type: 'header', cat });
        catItems.forEach(item => flat.push(item));
      }
    });
    return flat;
  }, [query, cachedProds, cachedLineItems, cachedCast, cachedSuppliers, cachedScripts]);

  const navigableItems = results.filter(r => r.type !== 'header');

  function goTo(item) { if (item.url) { navigate(item.url); onClose(); } }

  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, navigableItems.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && navigableItems[activeIdx]) goTo(navigableItems[activeIdx]);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, activeIdx, navigableItems, onClose]);

  useEffect(() => { setActiveIdx(0); }, [results.length]);

  if (!open) return null;

  let navIdx = -1;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search productions, scripts, cast, budget items, suppliers…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 text-base outline-none bg-transparent text-gray-800 placeholder-gray-400"
          />
          {query && <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>}
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="py-10 text-center text-gray-400">
              <Search size={22} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Type to search across productions, scripts, cast, budget items, suppliers…</p>
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                {['production name', 'script title', 'cast member', 'budget item', 'supplier'].map(h => (
                  <span key={h} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">{h}</span>
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              No results for "<strong className="text-gray-600">{query}</strong>"
            </div>
          ) : (
            <div className="py-1">
              {results.map((item, i) => {
                if (item.type === 'header') {
                  const cat = CATEGORIES[item.cat];
                  return (
                    <div key={`h-${item.cat}`} className="px-4 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{cat.label}</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                  );
                }
                navIdx++;
                const currentNavIdx = navIdx;
                const cat = CATEGORIES[item.type];
                const isActive = currentNavIdx === activeIdx;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    className={clsx('w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors', isActive ? 'bg-blue-50' : 'hover:bg-gray-50')}
                    onClick={() => goTo(item)}
                    onMouseEnter={() => setActiveIdx(currentNavIdx)}
                  >
                    <span className="text-base flex-shrink-0">{cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate"><Highlight text={item.label} query={query} /></div>
                      <div className="text-xs text-gray-400 truncate"><Highlight text={item.sub} query={query} /></div>
                    </div>
                    {isActive && <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-400">
          <span><kbd className="border border-gray-200 rounded px-1 py-0.5 font-mono mr-1">↑↓</kbd>navigate</span>
          <span><kbd className="border border-gray-200 rounded px-1 py-0.5 font-mono mr-1">↵</kbd>open</span>
          <span><kbd className="border border-gray-200 rounded px-1 py-0.5 font-mono mr-1">esc</kbd>close</span>
          <span className="ml-auto">Search across all data</span>
        </div>
      </div>
    </div>
  );
}
