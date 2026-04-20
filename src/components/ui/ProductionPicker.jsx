/**
 * ProductionPicker — rich searchable production selector
 *
 * Props:
 *   productions   – array of production objects
 *   value         – currently selected production id (dropdown mode)
 *   onChange      – (id: string) => void  (dropdown mode)
 *   onSelect      – (prod: object) => void  (inline mode — gets full object)
 *   exclude       – string[] of ids to hide from list
 *   mode          – 'dropdown' (default) | 'inline'
 *   placeholder   – string shown when nothing selected
 *   required      – bool (adds asterisk to label context)
 */

import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import StageBadge from './StageBadge';

// ── Helpers ──────────────────────────────────────────────────────────────────
function parsePrd(id) {
  const m = id?.match(/PRD(\d+)-(\d+)/i);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function sortProductions(prods) {
  return [...prods].sort((a, b) => {
    const [ay, an] = parsePrd(a.id);
    const [by, bn] = parsePrd(b.id);
    if (by !== ay) return by - ay;   // year desc
    return an - bn;                   // number asc
  });
}

function groupByYear(prods) {
  const groups = [];
  let currentYear = null;
  for (const p of prods) {
    const [year] = parsePrd(p.id);
    const label = year ? `20${String(year).padStart(2, '0')}` : 'Other';
    if (label !== currentYear) {
      groups.push({ year: label, items: [] });
      currentYear = label;
    }
    groups[groups.length - 1].items.push(p);
  }
  return groups;
}

const TYPE_COLORS = {
  'Shoot':        'bg-blue-50 text-blue-600',
  'Remote Shoot': 'bg-indigo-50 text-indigo-600',
  'AI':           'bg-violet-50 text-violet-600',
};

function TypePill({ type }) {
  if (!type) return null;
  const cls = TYPE_COLORS[type] || 'bg-gray-50 text-gray-500';
  return (
    <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {type}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProductionPicker({
  productions = [],
  value = '',
  onChange,
  onSelect,
  exclude = [],
  mode = 'dropdown',
  placeholder = 'Select production…',
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (mode !== 'dropdown') return;
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mode]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Escape closes dropdown
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const q = search.toLowerCase();

  const filtered = sortProductions(
    productions.filter(p => {
      if (exclude.includes(p.id)) return false;
      if (!q) return true;
      return (
        p.id?.toLowerCase().includes(q) ||
        p.project_name?.toLowerCase().includes(q) ||
        p.production_type?.toLowerCase().includes(q) ||
        (Array.isArray(p.product_type) && p.product_type.some(t => t.toLowerCase().includes(q)))
      );
    })
  );

  const groups = groupByYear(filtered);
  const selected = productions.find(p => p.id === value);

  function handleSelect(prod) {
    if (mode === 'dropdown') {
      onChange?.(prod.id);
      setOpen(false);
      setSearch('');
    } else {
      onSelect?.(prod);
    }
  }

  // ── Inline mode (always-open list) ────────────────────────────────────────
  if (mode === 'inline') {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, PRD, type…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={13} />
            </button>
          )}
        </div>
        <ProdList groups={groups} value={value} onSelect={handleSelect} filtered={filtered} />
      </div>
    );
  }

  // ── Dropdown mode ────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-white text-sm text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all"
      >
        {selected ? (
          <span className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-[11px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0">{selected.id}</span>
            <StageBadge stage={selected.stage} />
            <span className="text-gray-800 font-medium truncate">{selected.project_name}</span>
          </span>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder}</span>
        )}
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[360px] bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, PRD, type…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          {/* List */}
          <ProdList groups={groups} value={value} onSelect={handleSelect} filtered={filtered} />
        </div>
      )}
    </div>
  );
}

// ── Shared list renderer ──────────────────────────────────────────────────────
function ProdList({ groups, value, onSelect, filtered }) {
  if (filtered.length === 0) {
    return (
      <div className="px-4 py-8 text-sm text-gray-400 text-center">
        No productions found
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-y-auto">
      {groups.map(({ year, items }) => (
        <div key={year}>
          {/* Year group header */}
          <div className="sticky top-0 px-3 py-1 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{year}</span>
            <span className="text-[10px] text-gray-300">{items.length}</span>
          </div>

          {items.map(p => {
            const isSelected = p.id === value;
            const productTypes = Array.isArray(p.product_type) ? p.product_type.slice(0, 2) : [];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-all hover:bg-gray-50 ${isSelected ? 'bg-indigo-50' : ''}`}
              >
                {/* PRD ID */}
                <span className="font-mono text-[11px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                  {p.id}
                </span>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StageBadge stage={p.stage} />
                    <span className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {p.project_name}
                    </span>
                  </div>
                  {(p.production_type || productTypes.length > 0) && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {p.production_type && <TypePill type={p.production_type} />}
                      {productTypes.map(t => (
                        <span key={t} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Check mark for selected */}
                {isSelected && <Check size={14} className="text-indigo-500 shrink-0 mt-1" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
