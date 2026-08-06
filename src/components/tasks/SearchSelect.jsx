import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

// Searchable dropdown — replaces long native <select>s (e.g. picking a
// production by PRD code or name). Keyboard: arrows + Enter, Esc closes.
// items: [{ value, label, sub? }] — search matches label and sub.
export default function SearchSelect({ items, value, onChange, placeholder = 'Search…', disabled = false, className, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = items.find(i => String(i.value) === String(value));

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHi(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? items.filter(i =>
        String(i.label).toLowerCase().includes(q) || String(i.sub || '').toLowerCase().includes(q))
    : items;

  function pick(item) {
    onChange(item.value);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[hi]) pick(matches[hi]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  // keep highlighted row in view
  useEffect(() => {
    listRef.current?.children[hi]?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  return (
    <div ref={wrapRef} className={clsx('relative', className)} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center justify-between gap-1.5 text-left border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[var(--brand-accent)] disabled:opacity-60',
          buttonClassName
        )}
      >
        <span className="truncate text-xs">
          {selected ? (
            <>
              <span className="font-semibold">{selected.label}</span>
              {selected.sub && <span className="text-gray-400"> — {selected.sub}</span>}
            </>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={12} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 left-0 right-0 min-w-[230px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-gray-100 dark:border-gray-700">
            <Search size={12} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              className="w-full text-xs bg-transparent focus:outline-none text-gray-700 dark:text-gray-200"
              placeholder={placeholder}
              value={query}
              onChange={e => { setQuery(e.target.value); setHi(0); }}
              onKeyDown={onKeyDown}
            />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {matches.length === 0 && (
              <p className="text-xs text-gray-400 italic px-3 py-3">No matches</p>
            )}
            {matches.map((item, i) => (
              <button
                key={String(item.value)}
                type="button"
                onClick={() => pick(item)}
                onMouseEnter={() => setHi(i)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                  i === hi ? 'bg-blue-50 dark:bg-blue-900/20' : '',
                )}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{item.label}</span>
                  {item.sub && <span className="block text-[10px] text-gray-400 truncate">{item.sub}</span>}
                </span>
                {String(item.value) === String(value) && <Check size={12} className="shrink-0 text-[var(--brand-accent)]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
