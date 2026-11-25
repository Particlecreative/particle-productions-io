// My Studio's Monday-style toolbar (25 Nov 2026): saved views, quick filters, the filter panel (every field, with counts),
// sort, group by and the table's columns. All of it is saved for the person (usePrefs in MyStudio).
import { useState } from 'react';
import { Filter, ArrowUpDown, Rows3, Columns3, X, Check, Bookmark, Plus, Trash2, ArrowUp, ArrowDown, Zap } from 'lucide-react';
import { FIELDS, GROUPS, SORTS, COLUMNS, QUICK, EMPTY_FILTERS, optionsOf, toggleQuick, isQuickOn, activeCount } from './boardTools';

function Pop({ open, onClose, children, width = 'w-72', align = 'left' }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[40]" onClick={onClose} />
      <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-2 z-[41] ${width} max-w-[calc(100vw-24px)] rounded-2xl border border-gray-200 bg-white shadow-2xl`}>{children}</div>
    </>
  );
}

function Btn({ icon: Icon, label, active, count, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border transition-colors ${active ? 'border-[#0808f8]/40 bg-[#0808f8]/5 text-[#0808f8]' : 'border-gray-200 bg-white text-gray-600 hover:text-gray-900'}`}>
      <Icon size={14} />{label}{count ? <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#0808f8] text-white text-[10.5px] flex items-center justify-center">{count}</span> : null}
    </button>
  );
}

/** Saved views as tabs — "Main" plus the person's own (a name for the current filters, grouping, sort and view). */
export function ViewsBar({ views = [], active, onApply, onSave, onDelete, dirty }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => { const n = name.trim(); if (!n) return; onSave(n); setName(''); setNaming(false); };
  return (
    <div className="flex items-center gap-1 flex-wrap border-b border-gray-200 -mb-1">
      <button type="button" onClick={() => onApply(null)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${!active ? 'border-[#0808f8] text-[#030b2e]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>Main</button>
      {views.map(v => (
        <span key={v.id} className={`group flex items-center border-b-2 -mb-px ${active === v.id ? 'border-[#0808f8]' : 'border-transparent'}`}>
          <button type="button" onClick={() => onApply(v.id)} className={`pl-3 pr-1 py-2 text-[13px] font-semibold flex items-center gap-1.5 ${active === v.id ? 'text-[#030b2e]' : 'text-gray-500 hover:text-gray-800'}`}><Bookmark size={12} />{v.name}</button>
          <button type="button" onClick={() => onDelete(v.id)} title="Delete this view" className="p-1 mr-1 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={12} /></button>
        </span>
      ))}
      {naming ? (
        <span className="flex items-center gap-1 ml-1">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNaming(false); }} placeholder="Name this view" className="text-[12.5px] px-2 py-1 rounded-lg border border-gray-200 bg-white w-36 focus:outline-none focus:border-[#0808f8]/50" />
          <button type="button" onClick={save} className="p-1 rounded-md text-[#0808f8] hover:bg-[#0808f8]/10"><Check size={14} /></button>
          <button type="button" onClick={() => setNaming(false)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100"><X size={14} /></button>
        </span>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className={`ml-1 flex items-center gap-1 text-[12.5px] font-semibold px-2 py-1.5 rounded-lg ${dirty ? 'text-[#0808f8]' : 'text-gray-400'} hover:bg-gray-100`} title="Save the current filters, grouping and sort as a view">
          <Plus size={13} />{dirty ? 'Save as view' : 'New view'}
        </button>
      )}
    </div>
  );
}

/** Monday's quick filters — one click each. */
export function QuickFilters({ filters, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1 mr-1"><Zap size={11} /> Quick</span>
      {QUICK.map(([k, l]) => {
        const on = isQuickOn(filters, k);
        return <button key={k} type="button" onClick={() => onChange(toggleQuick(filters, k))} className={`text-[12px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${on ? 'border-[#0808f8] bg-[#0808f8] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>{l}</button>;
      })}
    </div>
  );
}

/** The filter panel: every field, multi-select, with how many tasks each choice has. */
export function FilterButton({ items, filters, onChange, ctx, people }) {
  const [open, setOpen] = useState(false);
  const n = activeCount(filters);
  const toggle = (field, value) => {
    const cur = new Set(filters[field] || []);
    if (cur.has(value)) cur.delete(value); else cur.add(value);
    onChange({ ...EMPTY_FILTERS, ...filters, [field]: [...cur] });
  };
  return (
    <span className="relative">
      <Btn icon={Filter} label="Filter" active={n > 0} count={n} onClick={() => setOpen(v => !v)} />
      <Pop open={open} onClose={() => setOpen(false)} width="w-[min(860px,calc(100vw-24px))]">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-gray-100">
          <span className="text-[13px] font-bold text-[#030b2e]">Filter your tasks</span>
          <span className="text-[11.5px] text-gray-400">Pick any mix — a task shows when it matches every field you set</span>
          {n > 0 && <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS })} className="ml-auto text-[12px] font-semibold text-[#0808f8] hover:underline">Clear all</button>}
        </div>
        <div className="p-4 grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] max-h-[60vh] overflow-y-auto">
          {FIELDS.map(([field, title]) => {
            const opts = optionsOf(items, field, ctx, people);
            if (!opts.length) return null;
            return (
              <div key={field} className="min-w-0">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">{title}</div>
                <div className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto pr-1">
                  {opts.map(o => {
                    const on = (filters[field] || []).includes(o.value);
                    return (
                      <button key={o.value} type="button" onClick={() => toggle(field, o.value)} className={`flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[12.5px] ${on ? 'bg-[#0808f8]/8 text-[#030b2e] font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <span className={`w-3.5 h-3.5 rounded flex-none flex items-center justify-center ${on ? 'bg-[#0808f8] text-white' : 'border border-gray-300'}`}>{on && <Check size={10} strokeWidth={3} />}</span>
                        {o.color && <span className="w-2 h-2 rounded-full flex-none" style={{ background: o.color }} />}
                        <span className="truncate flex-1 min-w-0">{o.label}</span>
                        <span className="text-[11px] text-gray-400 flex-none">{o.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Pop>
    </span>
  );
}

/** The chips under the toolbar: what's filtered, each removable. */
export function ActiveFilters({ items, filters, onChange, ctx, people }) {
  const chips = [];
  for (const [field, title] of FIELDS) {
    for (const v of filters[field] || []) {
      const quickLabel = v === '__high' ? 'High / Critical' : v === '__review' ? 'In review' : v === '__fixes' ? 'Fixes' : null;
      const o = quickLabel ? { label: quickLabel } : optionsOf(items, field, ctx, people).find(x => x.value === v) || { label: v };
      chips.push({ field, value: v, text: `${title}: ${o.label}` });
    }
  }
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(c => (
        <span key={`${c.field}:${c.value}`} className="inline-flex items-center gap-1 text-[12px] font-semibold pl-2.5 pr-1 py-0.5 rounded-full bg-[#0808f8]/8 text-[#0808f8]">
          {c.text}
          <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, ...filters, [c.field]: (filters[c.field] || []).filter(x => x !== c.value) })} className="p-0.5 rounded-full hover:bg-[#0808f8]/15"><X size={11} /></button>
        </span>
      ))}
      <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS })} className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 px-1">Clear</button>
    </div>
  );
}

export function SortButton({ sort, onChange }) {
  const [open, setOpen] = useState(false);
  const cur = SORTS.find(s => s[0] === (sort?.key || 'smart'));
  return (
    <span className="relative">
      <Btn icon={ArrowUpDown} label={sort?.key && sort.key !== 'smart' ? `Sort: ${cur?.[1]}` : 'Sort'} active={sort?.key && sort.key !== 'smart'} onClick={() => setOpen(v => !v)} />
      <Pop open={open} onClose={() => setOpen(false)} width="w-64">
        <div className="p-2">
          {SORTS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => onChange({ key: k, dir: sort?.key === k ? sort.dir : 'asc' })} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left ${(sort?.key || 'smart') === k ? 'bg-[#0808f8]/8 font-semibold text-[#030b2e]' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span className="flex-1">{l}</span>{(sort?.key || 'smart') === k && <Check size={14} className="text-[#0808f8]" />}
            </button>
          ))}
          {sort?.key && sort.key !== 'smart' && (
            <div className="flex gap-1 p-1 mt-1 border-t border-gray-100 pt-2">
              {[['asc', 'Ascending', ArrowUp], ['desc', 'Descending', ArrowDown]].map(([d, l, I]) => (
                <button key={d} type="button" onClick={() => onChange({ ...sort, dir: d })} className={`flex-1 flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg ${sort.dir === d || (!sort.dir && d === 'asc') ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:bg-gray-100'}`}><I size={12} />{l}</button>
              ))}
            </div>
          )}
        </div>
      </Pop>
    </span>
  );
}

export function GroupButton({ value, onChange, allowNone = false }) {
  const [open, setOpen] = useState(false);
  const opts = allowNone ? [...GROUPS, ['none', 'No groups']] : GROUPS;
  const cur = opts.find(g => g[0] === value) || opts[0];
  return (
    <span className="relative">
      <Btn icon={Rows3} label={`Group: ${cur[1]}`} onClick={() => setOpen(v => !v)} />
      <Pop open={open} onClose={() => setOpen(false)} width="w-56">
        <div className="p-2">
          {opts.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { onChange(k); setOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-left ${value === k ? 'bg-[#0808f8]/8 font-semibold text-[#030b2e]' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span className="flex-1">{l}</span>{value === k && <Check size={14} className="text-[#0808f8]" />}
            </button>
          ))}
        </div>
      </Pop>
    </span>
  );
}

/** The table's columns: show / hide and order (↑ ↓). */
export function ColumnsButton({ columns, onChange }) {
  const [open, setOpen] = useState(false);
  const shown = columns;
  const hidden = COLUMNS.map(c => c[0]).filter(k => !shown.includes(k));
  const name = (k) => COLUMNS.find(c => c[0] === k)?.[1] || k;
  const move = (k, d) => { const o = [...shown]; const i = o.indexOf(k); const j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; onChange(o); };
  return (
    <span className="relative">
      <Btn icon={Columns3} label="Columns" onClick={() => setOpen(v => !v)} />
      <Pop open={open} onClose={() => setOpen(false)} width="w-64" align="right">
        <div className="p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-1">Shown — in this order</div>
          {shown.map((k, i) => (
            <div key={k} className="flex items-center gap-1 py-0.5">
              <button type="button" onClick={() => onChange(shown.filter(x => x !== k))} className="w-4 h-4 rounded bg-[#0808f8] text-white flex items-center justify-center flex-none"><Check size={10} strokeWidth={3} /></button>
              <span className="flex-1 text-[13px] text-gray-700 pl-1">{name(k)}</span>
              <button type="button" disabled={i === 0} onClick={() => move(k, -1)} className="p-1 text-gray-400 hover:text-gray-800 disabled:opacity-30"><ArrowUp size={12} /></button>
              <button type="button" disabled={i === shown.length - 1} onClick={() => move(k, 1)} className="p-1 text-gray-400 hover:text-gray-800 disabled:opacity-30"><ArrowDown size={12} /></button>
            </div>
          ))}
          {hidden.length > 0 && <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mt-2 mb-1">Hidden</div>}
          {hidden.map(k => (
            <button key={k} type="button" onClick={() => onChange([...shown, k])} className="w-full flex items-center gap-2 py-1 text-left">
              <span className="w-4 h-4 rounded border border-gray-300 flex-none" /><span className="text-[13px] text-gray-500">{name(k)}</span>
            </button>
          ))}
        </div>
      </Pop>
    </span>
  );
}

export { Trash2 };
