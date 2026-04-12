import { useState, useEffect } from 'react';
import { X, LayoutTemplate } from 'lucide-react';
import { useLists } from '../../context/ListsContext';
import { useAuth } from '../../context/AuthContext';
import { generateId, bulkCreateLineItems } from '../../lib/dataService';
import { TEMPLATES } from '../../lib/productionTemplates';
import clsx from 'clsx';

const PROD_TYPES = ['Shoot', 'Remote Shoot', 'AI'];
const YEARS = [2024, 2025, 2026, 2027, 2028];

export default function NewProductionModal({ brandId, onClose, onCreate, existingProductions = [], existingCount, selectedYear = 2026 }) {
  const { lists } = useLists();
  const { isEditor } = useAuth();

  // Find gaps and next available ID for a given year
  function getIdInfo(year) {
    const prefix = `PRD${String(year).slice(2)}-`;
    const usedNums = new Set();
    let maxNum = 0;
    (existingProductions || []).forEach(p => {
      if (p.id?.startsWith(prefix)) {
        const num = parseInt(p.id.replace(prefix, ''), 10);
        if (!isNaN(num)) {
          usedNums.add(num);
          if (num > maxNum) maxNum = num;
        }
      }
    });
    if (maxNum === 0 && existingCount) maxNum = existingCount;
    // Find gaps (missing numbers in sequence)
    const gaps = [];
    for (let i = 1; i <= maxNum; i++) {
      if (!usedNums.has(i)) gaps.push(i);
    }
    const nextNum = maxNum + 1;
    const nextId = `${prefix}${String(nextNum).padStart(2, '0')}`;
    const gapIds = gaps.map(n => `${prefix}${String(n).padStart(2, '0')}`);
    return { nextId, gapIds, prefix };
  }

  function getNextId(year) {
    return getIdInfo(year).nextId;
  }

  const [form, setForm] = useState({
    id: getNextId(selectedYear),
    project_name: '',
    product_type: [],
    production_type: 'Shoot',
    producer: '',
    planned_start: '',
    planned_end: '',
    planned_budget_2026: '',
    estimated_budget: '',
    actual_spent: 0,
    stage: 'Pending',
    brand_id: brandId,
    production_year: selectedYear,
    timeline_mode: 'manual',
  });

  const [useTemplate, setUseTemplate] = useState(false);
  const [errors, setErrors] = useState({});

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleYearChange(year) {
    setForm(f => ({
      ...f,
      production_year: year,
      id: getNextId(year),
    }));
  }

  function toggleType(t) {
    setForm(f => ({
      ...f,
      product_type: f.product_type.includes(t)
        ? f.product_type.filter(x => x !== t)
        : [...f.product_type, t],
    }));
  }

  function handleProdTypeChange(pt) {
    const next = form.production_type === pt ? '' : pt;
    setForm(f => ({ ...f, production_type: next }));
    if (next) setUseTemplate(true);
    else setUseTemplate(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!isEditor) return;

    // Validation
    const errs = {};
    if (!form.project_name.trim()) errs.project_name = 'Project name is required';
    const budget = parseFloat(form.planned_budget_2026);
    if (form.planned_budget_2026 !== '' && !isNaN(budget) && budget < 0) errs.planned_budget_2026 = 'Budget cannot be negative';
    if (form.planned_start && form.planned_end && form.planned_end < form.planned_start) errs.planned_end = 'End date must be after start date';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});

    const prod = onCreate({
      ...form,
      planned_budget_2026: parseFloat(form.planned_budget_2026) || 0,
      estimated_budget: parseFloat(form.estimated_budget) || parseFloat(form.planned_budget_2026) || 0,
    });

    // Bulk-create template line items if toggled and we have a production back
    if (useTemplate && form.production_type && prod?.id) {
      const tplItems = TEMPLATES[form.production_type] || [];
      if (tplItems.length > 0) {
        bulkCreateLineItems(tplItems.map(t => ({
          id: generateId('li'),
          production_id: prod.id,
          item: t.item,
          type: t.type,
          planned_budget: parseFloat(t.planned_budget) || 0,
          currency_code: t.currency_code || 'ILS',
          actual_spent: 0,
          payment_status: 'Not Paid',
          status: 'Not Started',
          full_name: '',
          notes: '',
          invoice_stage: 'pending',
          invoice_status: '',
        })));
      }
    }
  }

  const templateCount = form.production_type ? (TEMPLATES[form.production_type]?.length || 0) : 0;
  const typeIcon = { 'AI': '🤖', 'Shoot': '🎬', 'Remote Shoot': '📡' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>New Production</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Year + ID + Stage */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Year</label>
              <select
                className="brand-input"
                value={form.production_year}
                onChange={e => handleYearChange(Number(e.target.value))}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">ID</label>
              <input className="brand-input font-mono" value={form.id} onChange={e => set('id', e.target.value)} required />
              {(() => {
                const { gapIds } = getIdInfo(form.production_year || selectedYear);
                if (gapIds.length === 0) return null;
                return (
                  <div className="mt-1.5">
                    <p className="text-[9px] text-amber-600 font-semibold mb-1">Missing numbers you can fill:</p>
                    <div className="flex flex-wrap gap-1">
                      {gapIds.slice(0, 8).map(gId => (
                        <button key={gId} type="button" onClick={() => set('id', gId)}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors ${form.id === gId ? 'border-amber-400 bg-amber-50 text-amber-700 font-bold' : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:bg-amber-50'}`}>
                          {gId}
                        </button>
                      ))}
                      {gapIds.length > 8 && <span className="text-[9px] text-gray-400">+{gapIds.length - 8} more</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stage</label>
              <select className="brand-input" value={form.stage} onChange={e => set('stage', e.target.value)}>
                {lists.stages.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Project Name *</label>
            <input
              autoFocus
              className={clsx('brand-input', errors.project_name && 'border-red-400')}
              value={form.project_name}
              onChange={e => { set('project_name', e.target.value); setErrors(er => ({ ...er, project_name: '' })); }}
              required
              placeholder="e.g. Particle Face Cream Campaign"
            />
            {errors.project_name && <p className="text-xs text-red-500 mt-1">{errors.project_name}</p>}
          </div>

          {/* Production Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Production Type</label>
            <div className="flex gap-2">
              {PROD_TYPES.map(pt => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => handleProdTypeChange(pt)}
                  className={clsx(
                    'flex-1 px-2 py-2 rounded-xl border text-xs font-bold transition-all',
                    form.production_type === pt
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  )}
                >
                  {typeIcon[pt]} {pt}
                </button>
              ))}
            </div>

            {/* Template toggle — appears when production type is selected */}
            {form.production_type && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200">
                <LayoutTemplate size={13} className="text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-blue-700">Use template</div>
                  <div className="text-[10px] text-blue-500 leading-tight">
                    Auto-fill {templateCount} line items for {form.production_type}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUseTemplate(v => !v)}
                  aria-label="Toggle template"
                  className={clsx(
                    'w-9 h-5 rounded-full transition-colors relative shrink-0',
                    useTemplate ? 'bg-blue-500' : 'bg-gray-300'
                  )}
                >
                  <div className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                    useTemplate ? 'left-4' : 'left-0.5'
                  )} />
                </button>
              </div>
            )}
          </div>

          {/* Product Types */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Product Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {lists.productTypes.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={clsx(
                    'px-2.5 py-1 text-xs rounded-full border transition-all font-medium',
                    form.product_type.includes(t) ? 'border-transparent text-white' : 'border-gray-200 text-gray-500 bg-white'
                  )}
                  style={form.product_type.includes(t) ? { background: 'var(--brand-accent)' } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Producer */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Producer</label>
            <input className="brand-input" value={form.producer} onChange={e => set('producer', e.target.value)} placeholder="Producer name" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Date</label>
              <input type="date" className="brand-input" value={form.planned_start} onChange={e => { set('planned_start', e.target.value); setErrors(er => ({ ...er, planned_end: '' })); }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End Date</label>
              <input type="date" className={clsx('brand-input', errors.planned_end && 'border-red-400')} value={form.planned_end} onChange={e => { set('planned_end', e.target.value); setErrors(er => ({ ...er, planned_end: '' })); }} />
              {errors.planned_end && <p className="text-xs text-red-500 mt-1">{errors.planned_end}</p>}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {form.production_year} Planned Budget ($)
            </label>
            <input
              type="number"
              min="0"
              className={clsx('brand-input', errors.planned_budget_2026 && 'border-red-400')}
              value={form.planned_budget_2026}
              onChange={e => { set('planned_budget_2026', e.target.value); setErrors(er => ({ ...er, planned_budget_2026: '' })); }}
              placeholder="0"
            />
            {errors.planned_budget_2026 && <p className="text-xs text-red-500 mt-1">{errors.planned_budget_2026}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-cta flex-1">
              {useTemplate && form.production_type
                ? `Create + Load ${form.production_type} Template`
                : 'Create Production'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
