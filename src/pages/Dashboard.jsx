import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, EyeOff, ChevronUp, ChevronDown, MessageSquare, GripVertical, Save, X, Check, Pencil, SlidersHorizontal, RefreshCw, HelpCircle, Upload } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { useNotifications } from '../context/NotificationsContext';
import {
  getProductions,
  createProduction,
  updateProduction,
  saveViewOrder,
  getViewOrder,
  addStandardCrew,
} from '../lib/dataService';
import { getGanttEvents } from '../lib/ganttService';
import { useLists } from '../context/ListsContext';
import UpdatesPanel from '../components/updates/UpdatesPanel';
import NewProductionModal from '../components/dashboard/NewProductionModal';
import ImportProductionsModal from '../components/dashboard/ImportProductionsModal';
import PastProductionDialog from '../components/shared/PastProductionDialog';
import StageBadge from '../components/ui/StageBadge';
import clsx from 'clsx';
import { getTablePrefs, toggleColumnVisibility, getColOrder, saveColOrder } from '../lib/tablePrefs';
import WeeklyView from '../components/dashboard/WeeklyView';
import AnalysisView from '../components/dashboard/AnalysisView';

const FIELD_LABELS = {
  project_name: 'Project Name',
  producer: 'Producer',
  planned_budget_2026: 'Planned Budget',
  planned_start: 'Start Date',
  planned_end: 'End Date',
  product_type: 'Product Type',
  production_type: 'Production Type',
  id: 'Production ID',
  stage: 'Stage',
};

const YEARS = [2024, 2025, 2026, 2027, 2028];

function serializeVal(v) {
  return Array.isArray(v) ? JSON.stringify(v) : String(v ?? '');
}

// Returns the effective timeline mode for a production (backward-compatible)
function getTimelineMode(prod) {
  if (prod.timeline_mode) return prod.timeline_mode;
  return prod.timeline_sync ? 'gantt' : 'manual';
}

const DASHBOARD_TOGGLE_COLS = [
  { key: 'product_type',    label: 'Product Type' },
  { key: 'production_type', label: 'Prod. Type' },
  { key: 'producer',        label: 'Producer' },
  { key: 'timeline',        label: 'Timeline' },
  { key: 'planned_budget',  label: 'Planned Budget' },
  { key: 'est_budget',      label: 'Est. Budget' },
  { key: 'actual_spent',    label: 'Actual Spent' },
  { key: 'stage',           label: 'Stage' },
  { key: 'shoot_date',      label: 'Shoot Date', defaultHidden: true },
  { key: 'delivery_date',   label: 'Delivery Date', defaultHidden: true },
  { key: 'air_date',        label: 'On-Air Date', defaultHidden: true },
];

export default function Dashboard() {
  const { brandId } = useBrand();
  const { user, isEditor, isAdmin } = useAuth();
  const { fmt } = useCurrency();
  const { addNotification } = useNotifications();
  const { lists } = useLists();
  const navigate = useNavigate();

  const [selectedYear, setSelectedYear] = useState(2026);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastProdDialog, setPastProdDialog] = useState(null); // production to show past-dialog for

  const [productions, setProductions] = useState([]);

  // Load filters from localStorage on mount
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').hideCompleted ?? false; } catch { return false; }
  });
  const [colorByStatus, setColorByStatus] = useState(true);
  const [search, setSearch] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').search ?? ''; } catch { return ''; }
  });
  const [stageFilter, setStageFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').stageFilter ?? ''; } catch { return ''; }
  });
  const [sortConfig, setSortConfig] = useState({ key: 'id', dir: 'asc' });
  const [updatesFor, setUpdatesFor] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // Row-level editing (replaces cell-level editing)
  const [editingRow, setEditingRow] = useState(null);

  // Crew auto-populate confirmation
  const [crewConfirm, setCrewConfirm] = useState(null);

  // Column visibility
  const [hiddenCols, setHiddenCols] = useState(() => getTablePrefs('dashboard').hidden);
  const [showColPanel, setShowColPanel] = useState(false);

  // Column arrangement
  const [colOrder, setColOrder] = useState(() => getColOrder('dashboard'));
  const [dragColKey, setDragColKey] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);

  // Product type filter
  const [productTypeFilter, setProductTypeFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').productTypeFilter ?? ''; } catch { return ''; }
  });

  // Active tab
  const [activeTab, setActiveTab] = useState('productions'); // 'productions' | 'weekly' | 'analysis'

  // Drag & reorder
  const [customOrder, setCustomOrder] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Save View modal
  const [showSaveView, setShowSaveView] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  useEffect(() => {
    async function load() {
      const prods = await Promise.resolve(getProductions(brandId, selectedYear));
      setProductions(Array.isArray(prods) ? prods : []);
      if (user) {
        const saved = await Promise.resolve(getViewOrder(`dashboard_${brandId}`, user.id));
        if (saved) setCustomOrder(saved);
      }
    }
    load();
  }, [brandId, user, selectedYear]);

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cp_dash_filters', JSON.stringify({ stageFilter, productTypeFilter, hideCompleted, search }));
    } catch {}
  }, [stageFilter, productTypeFilter, hideCompleted, search]);

  // Clear filters when year changes
  useEffect(() => {
    setStageFilter('');
    setProductTypeFilter('');
    setSearch('');
    setHideCompleted(false);
    try { localStorage.removeItem('cp_dash_filters'); } catch {}
  }, [selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for keyboard shortcut to open New Production modal
  useEffect(() => {
    function handleOpenNew() { setShowNewModal(true); }
    window.addEventListener('open-new-production', handleOpenNew);
    return () => window.removeEventListener('open-new-production', handleOpenNew);
  }, []);

  async function refresh() {
    const prods = await Promise.resolve(getProductions(brandId, selectedYear));
    setProductions(Array.isArray(prods) ? prods : []);
  }

  const filtered = useMemo(() => {
    let list = [...productions];
    if (hideCompleted) list = list.filter(p => p.stage !== 'Completed');
    if (stageFilter) list = list.filter(p => p.stage === stageFilter);
    if (productTypeFilter) list = list.filter(p => (p.product_type || []).includes(productTypeFilter));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.id.toLowerCase().includes(q) ||
        p.project_name.toLowerCase().includes(q) ||
        (p.producer || '').toLowerCase().includes(q) ||
        (p.product_type || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (customOrder && !search && !stageFilter && !productTypeFilter) {
      const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
      list.sort((a, b) => {
        const ai = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
        const bi = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
        return ai - bi;
      });
    } else {
      list.sort((a, b) => {
        let av = a[sortConfig.key] ?? '';
        let bv = b[sortConfig.key] ?? '';
        if (typeof av === 'number') return sortConfig.dir === 'asc' ? av - bv : bv - av;
        return sortConfig.dir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return list;
  }, [productions, hideCompleted, stageFilter, productTypeFilter, search, sortConfig, customOrder]);

  const allProductTypes = useMemo(() =>
    [...new Set(productions.flatMap(p => p.product_type || []).filter(Boolean))].sort(),
    [productions]
  );

  const orderedCols = useMemo(() => {
    const defaultOrder = DASHBOARD_TOGGLE_COLS.map(c => c.key);
    const order = colOrder || defaultOrder;
    const full = [...new Set([...order, ...defaultOrder])];
    return full
      .filter(k => !hiddenCols.includes(k))
      .map(k => DASHBOARD_TOGGLE_COLS.find(c => c.key === k))
      .filter(Boolean);
  }, [colOrder, hiddenCols]);

  function handleSort(key) {
    setCustomOrder(null);
    setSortConfig(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  // Immediate single-field edit (stage, product type tags, ID)
  function handleInlineEdit(prodId, field, value) {
    const prod = productions.find(p => p.id === prodId);
    const oldVal = serializeVal(prod?.[field]);
    const newVal = serializeVal(value);
    updateProduction(prodId, { [field]: value }, user?.id, user?.name);
    if (oldVal !== newVal) {
      addNotification('edit', `${user?.name || 'Someone'} updated ${FIELD_LABELS[field] || field} of ${prod?.project_name || prodId}`, prodId);
    }
    refresh();
  }

  // Immediate stage change
  function handleStageChange(id, stage) {
    const prod = productions.find(p => p.id === id);
    if (prod?.stage === stage) return;
    updateProduction(id, { stage }, user?.id, user?.name);
    addNotification('stage_change', `${user?.name || 'Someone'} changed stage of ${prod?.project_name || id} to "${stage}"`, id);
    refresh();
  }

  // Immediate production type change
  function handleProductionTypeChange(prodId, productionType) {
    const prod = productions.find(p => p.id === prodId);
    if (prod?.production_type === productionType) return;
    updateProduction(prodId, { production_type: productionType }, user?.id, user?.name);
    addNotification('edit', `${user?.name || 'Someone'} set production type of ${prod?.project_name || prodId} to "${productionType || '—'}"`, prodId);
    if (productionType === 'Remote Shoot' || productionType === 'Shoot') {
      setCrewConfirm({ prodId, prodName: prod?.project_name, productionType });
    }
    refresh();
  }

  // Batch save from row-level edit (Enter / ✓)
  function handleSaveRow(prodId, pendingEdits) {
    const prod = productions.find(p => p.id === prodId);
    const changes = {};
    Object.entries(pendingEdits).forEach(([field, value]) => {
      if (serializeVal(value) !== serializeVal(prod?.[field])) {
        changes[field] = value;
      }
    });
    if (Object.keys(changes).length > 0) {
      updateProduction(prodId, changes, user?.id, user?.name);
      addNotification('edit', `${user?.name || 'Someone'} updated ${prod?.project_name || prodId}`, prodId);
    }
    setEditingRow(null);
    refresh();
  }

  function handleCreate(data) {
    const prod = createProduction(data);
    setShowNewModal(false);
    refresh();
    // If timeline is in the past, prompt for auto-complete
    if (prod?.planned_end && new Date(prod.planned_end) < new Date()) {
      setPastProdDialog(prod);
    }
    return prod;
  }

  function handleDragStart(e, id) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e, id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  }
  function handleDrop(e, targetId) {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const currentIds = filtered.map(p => p.id);
    const fromIdx = currentIds.indexOf(dragId);
    const toIdx = currentIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...currentIds];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragId);
    setCustomOrder(newOrder);
    setPendingOrder(newOrder);
    setDragId(null);
    setDragOverId(null);
  }
  function handleDragEnd() { setDragId(null); setDragOverId(null); }

  function handleSaveViewClick() {
    setPendingOrder(customOrder || filtered.map(p => p.id));
    setShowSaveView(true);
  }
  function handleSaveViewConfirm(scope) {
    const order = pendingOrder || filtered.map(p => p.id);
    const forAll = scope === 'all';
    saveViewOrder(`dashboard_${brandId}`, user.id, order, forAll);
    addNotification('view_save', `${user?.name || 'Someone'} saved view order${forAll ? ' for all users' : ''}`, null);
    setCustomOrder(order);
    setShowSaveView(false);
    setPendingOrder(null);
  }

  function handleColDrop(targetKey) {
    if (!dragColKey || dragColKey === targetKey) { setDragColKey(null); setDragOverColKey(null); return; }
    const base = DASHBOARD_TOGGLE_COLS.map(c => c.key);
    const currentOrder = colOrder || base;
    const full = [...new Set([...currentOrder, ...base])];
    const fromIdx = full.indexOf(dragColKey);
    const toIdx = full.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...full];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragColKey);
    setColOrder(newOrder);
    saveColOrder('dashboard', newOrder);
    setDragColKey(null);
    setDragOverColKey(null);
  }

  const totalBudget = productions.reduce((s, p) => s + (parseFloat(p.planned_budget_2026) || 0), 0);
  const totalSpent = productions.reduce((s, p) => s + (parseFloat(p.actual_spent) || 0), 0);
  const canSaveForAll = isAdmin || isEditor;

  const pctSpent = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const stageBreakdown = productions.reduce((m, p) => {
    const s = p.stage || 'Pending';
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});

  return (
    <div className="animate-fadeIn">
      {/* ── Bento Header Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4 mb-6">

        {/* Left: Title + Total Budget (spans 5 cols) */}
        <div className="col-span-12 md:col-span-5 brand-card flex flex-col justify-between" style={{ minHeight: 160 }}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
                Productions
              </h1>
              {isEditor && (
                <button className="btn-cta flex items-center gap-2 text-sm" onClick={() => setShowNewModal(true)}>
                  <Plus size={14} />
                  New
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {filtered.length} of {productions.length} · {selectedYear}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{selectedYear} Total Budget</div>
            <div className="text-4xl font-black tracking-tight" style={{ color: 'var(--brand-primary)', letterSpacing: '-0.04em' }}>
              {fmt(totalBudget)}
            </div>
          </div>
        </div>

        {/* Right: 3 metric cards (spans 7 cols) */}
        <div className="col-span-12 md:col-span-7 grid grid-cols-3 gap-4">

          {/* Actual Spent */}
          <div className="brand-card flex flex-col justify-between" style={{ minHeight: 160 }}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Spent</div>
            <div>
              <div className="text-3xl font-black tracking-tight text-green-600" style={{ letterSpacing: '-0.04em' }}>
                {fmt(totalSpent)}
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-green-500 transition-all duration-700" style={{ width: `${Math.min(pctSpent, 100)}%` }} />
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{pctSpent}% of budget</div>
            </div>
          </div>

          {/* Remaining */}
          <div className="brand-card flex flex-col justify-between" style={{ minHeight: 160 }}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Remaining</div>
            <div>
              <div className="text-3xl font-black tracking-tight" style={{ color: 'var(--brand-secondary)', letterSpacing: '-0.04em' }}>
                {fmt(totalBudget - totalSpent)}
              </div>
            </div>
          </div>

          {/* Stage Breakdown - mini donut */}
          <div className="brand-card flex flex-col justify-between" style={{ minHeight: 160 }}>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">By Stage</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(stageBreakdown).map(([stage, count]) => (
                <span key={stage} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {stage} <span className="text-gray-400">{count}</span>
                </span>
              ))}
            </div>
            <div className="text-2xl font-black mt-1" style={{ color: 'var(--brand-primary)' }}>
              {productions.length}
              <span className="text-xs font-medium text-gray-400 ml-1">total</span>
            </div>
          </div>
        </div>

        {customOrder && !search && !stageFilter && !productTypeFilter && (
          <div className="col-span-12">
            <button
              onClick={handleSaveViewClick}
              className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all"
            >
              <Save size={13} />
              Save This View
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Year Switcher */}
        <div className="flex items-center gap-0 border rounded-xl overflow-hidden bg-white" style={{ borderColor: 'var(--brand-border)' }}>
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => { setSelectedYear(y); setCustomOrder(null); setProductTypeFilter(''); }}
              className={clsx('px-2.5 py-1.5 text-xs font-semibold transition-all',
                selectedYear === y ? 'text-white' : 'text-gray-500 hover:bg-gray-50'
              )}
              style={selectedYear === y ? { background: 'var(--brand-accent)' } : {}}
            >
              {y}
            </button>
          ))}
        </div>
        {/* Import button */}
        {isEditor && (
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-all bg-white"
          >
            <Upload size={13} />
            Import
          </button>
        )}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="brand-input pl-8"
            style={{ width: 220 }}
          />
        </div>
        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          className="brand-input"
          style={{ width: 160 }}
        >
          <option value="">All stages</option>
          {lists.stages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {allProductTypes.length > 0 && (
          <select
            value={productTypeFilter}
            onChange={e => setProductTypeFilter(e.target.value)}
            className="brand-input"
            style={{ width: 160 }}
          >
            <option value="">All products</option>
            {allProductTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button
          onClick={() => setHideCompleted(h => !h)}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
            hideCompleted ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500'
          )}
        >
          {hideCompleted ? <EyeOff size={13} /> : <Eye size={13} />}
          {hideCompleted ? 'Show Completed' : 'Hide Completed'}
        </button>
        <button
          onClick={() => setColorByStatus(v => !v)}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
            colorByStatus ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          )}
        >
          {colorByStatus ? '⬛' : '⬜'} {colorByStatus ? 'Colors On' : 'Colors Off'}
        </button>
        {customOrder && (
          <button
            onClick={() => { setCustomOrder(null); setSortConfig({ key: 'id', dir: 'asc' }); }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100 transition-all"
          >
            <X size={13} />
            Clear custom order
          </button>
        )}
        <div className="relative">
          {showColPanel && <div className="fixed inset-0 z-10" onClick={() => setShowColPanel(false)} />}
          <button
            onClick={() => setShowColPanel(p => !p)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
              showColPanel ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
            )}
          >
            <SlidersHorizontal size={13} />
            Columns
          </button>
          {showColPanel && (
            <div className="absolute z-20 left-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[190px]">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider px-2 mb-1.5">Drag to reorder · check to show</p>
              {(() => {
                const base = DASHBOARD_TOGGLE_COLS.map(c => c.key);
                const currentOrder = colOrder || base;
                const panelCols = [...new Set([...currentOrder, ...base])]
                  .map(k => DASHBOARD_TOGGLE_COLS.find(c => c.key === k))
                  .filter(Boolean);
                return panelCols.map(({ key, label }) => (
                  <div
                    key={key}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragColKey(key); }}
                    onDragOver={e => { e.preventDefault(); setDragOverColKey(key); }}
                    onDrop={() => handleColDrop(key)}
                    onDragEnd={() => { setDragColKey(null); setDragOverColKey(null); }}
                    className={clsx(
                      'flex items-center gap-2 py-1.5 px-2 rounded cursor-grab transition-colors',
                      dragOverColKey === key && dragColKey !== key ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    )}
                  >
                    <GripVertical size={12} className="text-gray-300 flex-shrink-0" />
                    <input
                      type="checkbox"
                      checked={!hiddenCols.includes(key)}
                      onChange={() => setHiddenCols(toggleColumnVisibility('dashboard', key))}
                      className="rounded accent-blue-600"
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="text-sm text-gray-700 flex-1">{label}</span>
                  </div>
                ));
              })()}
              {colOrder && (
                <button
                  onClick={() => { setColOrder(null); saveColOrder('dashboard', null); }}
                  className="mt-1.5 w-full text-center text-[11px] text-gray-400 hover:text-gray-600 py-1 border-t border-gray-100"
                >
                  Reset column order
                </button>
              )}
            </div>
          )}
        </div>
        {!search && !stageFilter && !productTypeFilter && (
          <span className="text-xs text-gray-400 ml-1">
            {customOrder ? '⋮⋮ Drag rows to reorder' : 'Drag rows to reorder'}
          </span>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-gray-100 mb-4">
        {[
          { id: 'productions', label: '📋 Productions' },
          { id: 'weekly',      label: '📅 Weekly' },
          { id: 'analysis',   label: '📊 Analysis' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={clsx('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all',
              activeTab === t.id
                ? 'border-[var(--brand-accent)] text-[var(--brand-accent)]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {activeTab === 'productions' && <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 1400 }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <Th label="ID" sortKey="id" sortConfig={sortConfig} onSort={handleSort} sticky />
                <Th label="Project Name" sortKey="project_name" sortConfig={sortConfig} onSort={handleSort} wide />
                {orderedCols.map(col => {
                  const sortKeys = {
                    production_type: 'production_type',
                    producer: 'producer',
                    planned_budget: 'planned_budget_2026',
                    est_budget: 'estimated_budget',
                    actual_spent: 'actual_spent',
                    stage: 'stage',
                  };
                  return (
                    <Th key={col.key} label={col.label}
                      sortKey={sortKeys[col.key]}
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                  );
                })}
                <Th label="" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4 + orderedCols.length} className="text-center py-16 text-gray-400 text-sm">
                    {search || stageFilter ? 'No productions match your filters.' : 'No productions yet.'}
                  </td>
                </tr>
              ) : filtered.map(prod => (
                <ProductionRow
                  key={prod.id}
                  prod={prod}
                  fmt={fmt}
                  onOpen={() => navigate(`/production/${prod.id}`)}
                  onUpdates={() => setUpdatesFor(prod.id)}
                  onStageChange={handleStageChange}
                  onProductionTypeChange={handleProductionTypeChange}
                  isEditor={isEditor}
                  editingRow={editingRow}
                  setEditingRow={setEditingRow}
                  onSaveRow={handleSaveRow}
                  onInlineEdit={handleInlineEdit}
                  dragId={dragId}
                  dragOverId={dragOverId}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  canDrag={!search && !stageFilter && !productTypeFilter}
                  hiddenCols={hiddenCols}
                  colorByStatus={colorByStatus}
                  orderedCols={orderedCols}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Weekly Tab */}
      {activeTab === 'weekly' && (
        <WeeklyView
          productions={productions}
          brandId={brandId}
          selectedYear={selectedYear}
        />
      )}

      {/* Analysis Tab */}
      {activeTab === 'analysis' && (
        <AnalysisView
          productions={productions}
          brandId={brandId}
          selectedYear={selectedYear}
        />
      )}

      {/* Updates Panel */}
      {updatesFor && (
        <UpdatesPanel productionId={updatesFor} onClose={() => setUpdatesFor(null)} />
      )}

      {/* New Production Modal */}
      {showNewModal && (
        <NewProductionModal
          brandId={brandId}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
          existingCount={productions.length}
          selectedYear={selectedYear}
        />
      )}

      {/* Import Productions Modal */}
      {showImportModal && (
        <ImportProductionsModal
          brandId={brandId}
          selectedYear={selectedYear}
          onClose={() => setShowImportModal(false)}
          onImported={(newProds) => {
            refresh();
            // Check for past-dated productions
            const pastProds = newProds.filter(p => p.planned_end && new Date(p.planned_end) < new Date());
            if (pastProds.length > 0) setPastProdDialog({ batch: pastProds });
          }}
        />
      )}

      {/* Past Production Dialog */}
      {pastProdDialog && (
        <PastProductionDialog
          production={pastProdDialog}
          onClose={() => { setPastProdDialog(null); refresh(); }}
        />
      )}

      {/* Save View Modal */}
      {showSaveView && (
        <SaveViewModal
          canSaveForAll={canSaveForAll}
          onConfirm={handleSaveViewConfirm}
          onClose={() => setShowSaveView(false)}
        />
      )}

      {/* Crew Auto-Populate Confirmation */}
      {crewConfirm && (
        <CrewConfirmModal
          prodName={crewConfirm.prodName}
          productionType={crewConfirm.productionType}
          onConfirm={() => {
            addStandardCrew(crewConfirm.prodId);
            addNotification('edit', `${user?.name || 'Someone'} added standard crew to ${crewConfirm.prodName}`, crewConfirm.prodId);
            setCrewConfirm(null);
          }}
          onClose={() => setCrewConfirm(null)}
        />
      )}
    </div>
  );
}

// ---- Sub-components ----

function Th({ label, sortKey, sortConfig, onSort, sticky, wide }) {
  const active = sortConfig?.key === sortKey;
  return (
    <th
      className={clsx(sticky && 'sticky-col')}
      style={{ minWidth: wide ? 260 : undefined }}
    >
      {sortKey ? (
        <button onClick={() => onSort(sortKey)} className="flex items-center gap-1 group">
          {label}
          <span className={clsx('opacity-0 group-hover:opacity-60 transition-opacity', active && 'opacity-100')}>
            {active && sortConfig.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>
      ) : label}
    </th>
  );
}

const PROD_TYPE_STYLE = {
  'AI':           { bg: '#EDE7F6', color: '#4527A0' },
  'Remote Shoot': { bg: '#E3F2FD', color: '#1565C0' },
  'Shoot':        { bg: '#E8F5E9', color: '#2E7D32' },
};

const STATUS_ROW_COLORS = {
  'Completed':      'bg-green-100',
  'Production':     'bg-blue-100',
  'Pre Production': 'bg-yellow-100',
  'Post':           'bg-purple-100',
  'Paused':         'bg-orange-100',
  'Pending':        'bg-gray-100',
};

function ProductionRow({
  prod, fmt, onOpen, onUpdates, onStageChange, onProductionTypeChange, isEditor,
  editingRow, setEditingRow, onSaveRow, onInlineEdit,
  dragId, dragOverId, onDragStart, onDragOver, onDrop, onDragEnd, canDrag,
  hiddenCols = [], colorByStatus = true, orderedCols = [],
}) {
  const { lists } = useLists();
  const [pendingEdits, setPendingEdits] = useState({});
  const [addingType, setAddingType] = useState(false); // false | 'select' | 'custom'
  const [customTypeName, setCustomTypeName] = useState('');
  const [editingId, setEditingId] = useState(false);
  const [idSuffix, setIdSuffix] = useState('');

  const isEditingThisRow = editingRow === prod.id;

  // Reset pending edits when row exits edit mode from outside
  useEffect(() => {
    if (!isEditingThisRow) setPendingEdits({});
  }, [isEditingThisRow]);

  function getVal(field) {
    return field in pendingEdits ? pendingEdits[field] : prod[field];
  }
  function setField(field, value) {
    setPendingEdits(prev => ({ ...prev, [field]: value }));
  }
  function startEdit(e) {
    e.stopPropagation();
    setPendingEdits({});
    setEditingRow(prod.id);
  }
  function cancelEdit(e) {
    e?.stopPropagation?.();
    setPendingEdits({});
    setEditingRow(null);
  }
  function saveRow(e) {
    e?.stopPropagation?.();
    onSaveRow(prod.id, pendingEdits);
  }
  function handleInputKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); saveRow(e); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(e); }
  }

  // ID edit (immediate, separate)
  const idMatch = prod.id.match(/^([A-Za-z0-9]+-)(.*)/);
  const idPrefix = idMatch ? idMatch[1] : '';
  const idSuffixDefault = idMatch ? idMatch[2] : prod.id;
  function startEditId(e) { e.stopPropagation(); setIdSuffix(idSuffixDefault); setEditingId(true); }
  function saveId(e) {
    e.stopPropagation();
    const newId = idPrefix + idSuffix.trim();
    if (newId && newId !== prod.id) onInlineEdit(prod.id, 'id', newId);
    setEditingId(false);
  }

  const isDragging = dragId === prod.id;
  const isDragOver = dragOverId === prod.id && dragId !== prod.id;
  const ptStyle = PROD_TYPE_STYLE[prod.production_type] || {};

  const statusBg = colorByStatus && !isDragOver && !isEditingThisRow
    ? (STATUS_ROW_COLORS[prod.stage] || '')
    : '';

  return (
    <tr
      className={clsx(
        'group transition-colors',
        statusBg,
        isDragging && 'opacity-40',
        !isEditingThisRow && !isDragging && 'cursor-pointer',
        isDragOver && 'bg-blue-50 border-t-2 border-blue-400',
        isEditingThisRow && 'bg-blue-50/20',
      )}
      draggable={canDrag && !isEditingThisRow}
      onDragStart={e => onDragStart(e, prod.id)}
      onDragOver={e => onDragOver(e, prod.id)}
      onDrop={e => onDrop(e, prod.id)}
      onDragEnd={onDragEnd}
      onClick={() => { if (isEditingThisRow) return; onOpen(); }}
    >
      {/* Drag Handle */}
      <td style={{ width: 32, padding: '0 8px' }} onClick={e => e.stopPropagation()}>
        {canDrag && !isEditingThisRow && (
          <GripVertical size={14} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing" />
        )}
      </td>

      {/* ID */}
      <td
        className="sticky-col font-mono text-xs font-semibold"
        style={{ background: isEditingThisRow ? '#EFF6FF' : 'white' }}
        onClick={e => e.stopPropagation()}
      >
        {isEditor && editingId ? (
          <span className="flex items-center gap-1">
            <span className="text-gray-400">{idPrefix}</span>
            <input
              autoFocus
              className="border-b-2 outline-none bg-transparent text-xs w-16"
              style={{ borderColor: 'var(--brand-accent)' }}
              value={idSuffix}
              onChange={e => setIdSuffix(e.target.value)}
              onBlur={saveId}
              onKeyDown={e => { if (e.key === 'Enter') saveId(e); if (e.key === 'Escape') setEditingId(false); }}
            />
          </span>
        ) : (
          <span
            style={{ color: 'var(--brand-secondary)' }}
            className="flex items-center gap-1 group/id"
            title={isEditor ? 'Click to edit suffix' : undefined}
            onClick={isEditor ? startEditId : undefined}
          >
            {prod.id}
            {isEditor && <Pencil size={9} className="opacity-0 group-hover/id:opacity-30 flex-shrink-0" />}
          </span>
        )}
      </td>

      {/* Project Name */}
      <td style={{ minWidth: 260 }} onClick={e => isEditingThisRow && e.stopPropagation()}>
        {isEditingThisRow ? (
          <input
            autoFocus
            type="text"
            value={getVal('project_name') ?? ''}
            onChange={e => setField('project_name', e.target.value)}
            onKeyDown={handleInputKeyDown}
            className="w-full border-b-2 outline-none bg-transparent font-semibold text-gray-800"
            style={{ borderColor: 'var(--brand-accent)' }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="font-semibold text-gray-800 group-hover:text-blue-600 group-hover:underline">
            {prod.project_name}
          </span>
        )}
      </td>

      {/* Configurable Columns — rendered in user-defined order */}
      {orderedCols.map(col => {
        const key = col.key;
        if (key === 'product_type') return (
          <td key={key} onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1 items-center">
              {(prod.product_type || []).map(t => (
                <span
                  key={t}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-full font-medium group/tag"
                  style={{ background: 'var(--brand-border)', color: 'var(--brand-primary)' }}
                >
                  {t}
                  {isEditor && (
                    <button
                      className="opacity-0 group-hover/tag:opacity-60 hover:opacity-100 text-red-500 ml-0.5"
                      onClick={e => {
                        e.stopPropagation();
                        onInlineEdit(prod.id, 'product_type', (prod.product_type || []).filter(x => x !== t));
                      }}
                      title="Remove"
                    >
                      <X size={9} />
                    </button>
                  )}
                </span>
              ))}
              {isEditor && (
                addingType === 'custom' ? (
                  <input
                    autoFocus
                    type="text"
                    placeholder="Product name…"
                    value={customTypeName}
                    onChange={e => setCustomTypeName(e.target.value)}
                    className="text-xs border rounded px-1.5 py-0.5 outline-none"
                    style={{ borderColor: 'var(--brand-accent)', width: 110 }}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter' && customTypeName.trim()) {
                        onInlineEdit(prod.id, 'product_type', [...(prod.product_type || []), customTypeName.trim()]);
                        setCustomTypeName(''); setAddingType(false);
                      }
                      if (e.key === 'Escape') { setCustomTypeName(''); setAddingType(false); }
                    }}
                    onBlur={() => {
                      if (customTypeName.trim()) {
                        onInlineEdit(prod.id, 'product_type', [...(prod.product_type || []), customTypeName.trim()]);
                      }
                      setCustomTypeName(''); setAddingType(false);
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : addingType === 'select' ? (
                  <select
                    autoFocus
                    className="text-xs border rounded px-1 py-0.5 outline-none"
                    style={{ borderColor: 'var(--brand-border)' }}
                    defaultValue=""
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '__other__') {
                        setCustomTypeName('');
                        setAddingType('custom');
                      } else if (val && !(prod.product_type || []).includes(val)) {
                        onInlineEdit(prod.id, 'product_type', [...(prod.product_type || []), val]);
                        setAddingType(false);
                      }
                    }}
                    onBlur={() => setTimeout(() => { if (addingType === 'select') setAddingType(false); }, 150)}
                    onClick={e => e.stopPropagation()}
                  >
                    <option value="">+ Add type…</option>
                    {lists.productTypes.filter(t => t !== 'Other' && !(prod.product_type || []).includes(t)).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                    <option value="__other__">Other (custom)…</option>
                  </select>
                ) : (
                  <button
                    className="text-xs px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-all"
                    onClick={e => { e.stopPropagation(); setAddingType('select'); }}
                  >
                    + Add
                  </button>
                )
              )}
            </div>
          </td>
        );
        if (key === 'production_type') return (
          <td key={key} onClick={e => e.stopPropagation()}>
            {isEditor ? (
              <select
                value={prod.production_type ?? ''}
                onChange={e => onProductionTypeChange(prod.id, e.target.value)}
                className="text-xs border-0 bg-transparent font-medium outline-none cursor-pointer"
                style={{ color: ptStyle.color || '#9CA3AF' }}
                onClick={e => e.stopPropagation()}
              >
                <option value="">—</option>
                {lists.productionTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : prod.production_type ? (
              <span className="badge" style={{ background: ptStyle.bg || '#F3F4F6', color: ptStyle.color || '#374151' }}>
                {prod.production_type}
              </span>
            ) : (
              <span className="text-gray-300 text-sm">—</span>
            )}
          </td>
        );
        if (key === 'producer') return (
          <td key={key} onClick={e => isEditingThisRow && e.stopPropagation()}>
            {isEditingThisRow ? (
              <input
                type="text"
                value={getVal('producer') ?? ''}
                onChange={e => setField('producer', e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="w-full border-b-2 outline-none bg-transparent text-sm text-gray-600"
                style={{ borderColor: 'var(--brand-accent)' }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="text-sm text-gray-600">{prod.producer || <span className="text-gray-300">—</span>}</span>
            )}
          </td>
        );
        if (key === 'timeline') {
          const mode = getTimelineMode(prod);
          const isSynced = mode === 'gantt';
          const isUnknown = mode === 'unknown';
          let syncStart = null, syncEnd = null;
          if (isSynced) {
            const events = getGanttEvents(prod.id);
            if (events.length > 0) {
              const starts = events.map(e => e.start_date).filter(Boolean).sort();
              const ends = events.map(e => e.end_date).filter(Boolean).sort().reverse();
              syncStart = starts[0] ?? null;
              syncEnd = ends[0] ?? null;
            }
          }
          const displayStart = isSynced ? syncStart : prod.planned_start;
          const displayEnd = isSynced ? syncEnd : prod.planned_end;
          function cycleMode() {
            const next = mode === 'manual' ? 'gantt' : mode === 'gantt' ? 'unknown' : 'manual';
            onInlineEdit(prod.id, 'timeline_mode', next);
          }
          return (
            <td key={key} onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                {isEditor && (
                  <button
                    title={
                      mode === 'gantt'    ? 'Synced with Gantt — click for Unknown/TBD' :
                      mode === 'unknown'  ? 'Unknown/TBD — click for Manual dates' :
                                           'Manual dates — click to sync with Gantt'
                    }
                    onClick={e => { e.stopPropagation(); cycleMode(); }}
                    className={clsx('flex-shrink-0 p-0.5 rounded transition-colors',
                      mode === 'gantt'   ? 'text-blue-500 hover:text-blue-700' :
                      mode === 'unknown' ? 'text-amber-500 hover:text-amber-700' :
                                          'text-gray-300 hover:text-blue-400'
                    )}
                  >
                    {mode === 'unknown'
                      ? <HelpCircle size={11} />
                      : <RefreshCw size={11} className={isSynced ? 'animate-spin-slow' : ''} />
                    }
                  </button>
                )}
                {isUnknown ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-semibold border border-amber-200">
                    📅 TBD
                  </span>
                ) : isEditingThisRow && mode === 'manual' ? (
                  <div className="flex gap-1 items-center">
                    <input
                      type="date"
                      value={getVal('planned_start') ?? ''}
                      onChange={e => setField('planned_start', e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      className="border-b-2 outline-none bg-transparent text-xs"
                      style={{ borderColor: 'var(--brand-accent)' }}
                    />
                    <span className="text-gray-400">→</span>
                    <input
                      type="date"
                      value={getVal('planned_end') ?? ''}
                      onChange={e => setField('planned_end', e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      className="border-b-2 outline-none bg-transparent text-xs"
                      style={{ borderColor: 'var(--brand-accent)' }}
                    />
                  </div>
                ) : (
                  <span className={clsx('text-xs whitespace-nowrap', isSynced ? 'text-blue-600' : 'text-gray-500')}>
                    {displayStart && displayEnd
                      ? `${new Date(displayStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} → ${new Date(displayEnd).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                      : isSynced ? <span className="text-gray-400 italic text-[10px]">No Gantt events</span> : '—'
                    }
                  </span>
                )}
              </div>
            </td>
          );
        }
        if (key === 'planned_budget') return (
          <td key={key} onClick={e => isEditingThisRow && e.stopPropagation()}>
            {isEditingThisRow ? (
              <input
                type="number"
                value={getVal('planned_budget_2026') ?? 0}
                onChange={e => setField('planned_budget_2026', parseFloat(e.target.value) || 0)}
                onKeyDown={handleInputKeyDown}
                className="w-full border-b-2 outline-none bg-transparent font-semibold text-gray-700"
                style={{ borderColor: 'var(--brand-accent)', maxWidth: 120 }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="font-semibold text-gray-700 whitespace-nowrap">{fmt(prod.planned_budget_2026)}</span>
            )}
          </td>
        );
        if (key === 'est_budget') return (
          <td key={key}>
            <span className="text-gray-400 whitespace-nowrap text-sm">{fmt(prod.estimated_budget)}</span>
          </td>
        );
        if (key === 'actual_spent') return (
          <td key={key}>
            <span className="text-gray-400 whitespace-nowrap text-sm">{fmt(prod.actual_spent)}</span>
          </td>
        );
        if (key === 'stage') return (
          <td key={key} onClick={e => e.stopPropagation()}>
            {isEditor ? (
              <select
                value={prod.stage}
                onChange={e => onStageChange(prod.id, e.target.value)}
                className="text-xs border-0 bg-transparent font-semibold outline-none cursor-pointer"
                style={{ color: 'inherit' }}
                onClick={e => e.stopPropagation()}
              >
                {lists.stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <StageBadge stage={prod.stage} />
            )}
          </td>
        );
        if (key === 'shoot_date') return (
          <td key={key} onClick={e => e.stopPropagation()}>
            {isEditingThisRow ? (
              <input
                type="date"
                value={getVal('shoot_date') ?? ''}
                onChange={e => setField('shoot_date', e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="border-b-2 outline-none bg-transparent text-xs"
                style={{ borderColor: 'var(--brand-accent)' }}
                onClick={e => e.stopPropagation()}
              />
            ) : prod.shoot_date ? (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {new Date(prod.shoot_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            ) : (
              <span className="text-gray-300 text-sm">—</span>
            )}
          </td>
        );
        if (key === 'delivery_date') {
          const isSyncedD = getTimelineMode(prod) === 'gantt';
          let syncEndD = null;
          if (isSyncedD) {
            const evts = getGanttEvents(prod.id);
            if (evts.length > 0) {
              syncEndD = evts.map(e => e.end_date).filter(Boolean).sort().reverse()[0] ?? null;
            }
          }
          const displayDelivery = isSyncedD ? syncEndD : prod.delivery_date;
          return (
            <td key={key} onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                {isSyncedD && (
                  <RefreshCw size={11} className="text-blue-400 flex-shrink-0" title="Auto-synced from Gantt" />
                )}
                {isEditingThisRow && !isSyncedD ? (
                  <input
                    type="date"
                    value={getVal('delivery_date') ?? ''}
                    onChange={e => setField('delivery_date', e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    className="border-b-2 outline-none bg-transparent text-xs"
                    style={{ borderColor: 'var(--brand-accent)' }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className={clsx('text-xs whitespace-nowrap', isSyncedD ? 'text-blue-600' : 'text-gray-500')}>
                    {displayDelivery
                      ? new Date(displayDelivery + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : isSyncedD
                        ? <span className="text-gray-400 italic text-[10px]">No Gantt</span>
                        : <span className="text-gray-300">—</span>
                    }
                  </span>
                )}
              </div>
            </td>
          );
        }
        if (key === 'air_date') return (
          <td key={key} onClick={e => e.stopPropagation()}>
            {isEditingThisRow ? (
              <input
                type="date"
                value={getVal('air_date') ?? ''}
                onChange={e => setField('air_date', e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="border-b-2 outline-none bg-transparent text-xs"
                style={{ borderColor: 'var(--brand-accent)' }}
                onClick={e => e.stopPropagation()}
              />
            ) : prod.air_date ? (
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {new Date(prod.air_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            ) : (
              <span className="text-gray-300 text-sm">—</span>
            )}
          </td>
        );
        return null;
      })}

      {/* Actions */}
      <td onClick={e => e.stopPropagation()}>
        {isEditingThisRow ? (
          <div className="flex items-center gap-1">
            <button
              onClick={saveRow}
              className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
              title="Save (Enter)"
            >
              <Check size={14} />
            </button>
            <button
              onClick={cancelEdit}
              className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
              title="Cancel (Escape)"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {isEditor && (
              <button
                onClick={startEdit}
                className="p-1.5 rounded hover:bg-blue-50 text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                title="Edit row (click pencil)"
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              onClick={onUpdates}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Updates & Comments"
            >
              <MessageSquare size={14} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function SaveViewModal({ canSaveForAll, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Save This View</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Save the current row order. You can save it just for yourself, or for all users if you have permission.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => onConfirm('me')}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-xl">👤</div>
            <div>
              <div className="font-semibold text-gray-800">Only to me</div>
              <div className="text-xs text-gray-400">Saves your personal view order</div>
            </div>
          </button>
          <button
            onClick={() => canSaveForAll ? onConfirm('all') : undefined}
            disabled={!canSaveForAll}
            className={clsx(
              'w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left',
              canSaveForAll
                ? 'border-gray-200 hover:border-purple-400 hover:bg-purple-50 cursor-pointer'
                : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50'
            )}
          >
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-xl">👥</div>
            <div>
              <div className="font-semibold text-gray-800">For all users</div>
              <div className="text-xs text-gray-400">
                {canSaveForAll ? 'Saves as global default view' : 'Admin/Editor only'}
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function CrewConfirmModal({ prodName, productionType, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Add Standard Crew?</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Production type is set to <strong>{productionType}</strong> for <strong>{prodName}</strong>.<br />
          Would you like to add standard crew line items to the budget?
        </p>
        <ul className="text-sm text-gray-500 mb-5 space-y-1 ml-4 list-disc">
          <li>Technical Photographer <span className="text-gray-400">(Crew)</span></li>
          <li>Director <span className="text-gray-400">(Crew)</span></li>
          <li>Offline Editor <span className="text-gray-400">(Post)</span></li>
          <li>Online Editor <span className="text-gray-400">(Post)</span></li>
          <li>Sound Designer <span className="text-gray-400">(Post)</span></li>
        </ul>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Not now</button>
          <button onClick={onConfirm} className="btn-cta">Yes, add crew</button>
        </div>
      </div>
    </div>
  );
}
