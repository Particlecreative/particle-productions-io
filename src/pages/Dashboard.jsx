import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, EyeOff, ChevronUp, ChevronDown, MessageSquare, GripVertical, Save, X, Check, Pencil, SlidersHorizontal, RefreshCw, HelpCircle, Upload, Lock, Unlock, Trash2, Loader2 } from 'lucide-react';
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
import { getListItemColor } from '../lib/listService';
import UpdatesPanel from '../components/updates/UpdatesPanel';
import NewProductionModal from '../components/dashboard/NewProductionModal';
import ImportProductionsModal from '../components/dashboard/ImportProductionsModal';
import PastProductionDialog from '../components/shared/PastProductionDialog';
import StageBadge from '../components/ui/StageBadge';
import clsx from 'clsx';
import { getTablePrefs, toggleColumnVisibility, getColOrder, saveColOrder } from '../lib/tablePrefs';
import WeeklyView from '../components/dashboard/WeeklyView';
import AnalysisView from '../components/dashboard/AnalysisView';
import GlobalUpdatesTab from '../components/dashboard/GlobalUpdatesTab';
import SkeletonLoader from '../components/shared/SkeletonLoader';

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
  const { fmt, currency } = useCurrency();
  const { addNotification } = useNotifications();
  const { lists } = useLists();
  const navigate = useNavigate();

  const [selectedYear, setSelectedYear] = useState(2026);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pastProdDialog, setPastProdDialog] = useState(null); // production to show past-dialog for

  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load filters from localStorage on mount
  const [hideCompleted, setHideCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').hideCompleted ?? false; } catch { return false; }
  });
  const [colorByStatus, setColorByStatus] = useState(true);
  const [stickyHeader, setStickyHeader] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_sticky') || 'true'); } catch { return true; }
  });
  const [compactMode, setCompactMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_compact') || 'false'); } catch { return false; }
  });
  const [summaryOpen, setSummaryOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_summary') || 'true'); } catch { return true; }
  });
  const [search, setSearch] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').search ?? ''; } catch { return ''; }
  });
  // Debounced search for performance on large lists
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const [stageFilter, setStageFilter] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_dash_filters') || '{}').stageFilter ?? ''; } catch { return ''; }
  });
  const [sortConfig, setSortConfig] = useState({ key: 'id', dir: 'asc' });
  const [updatesFor, setUpdatesFor] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  // Row-level editing (replaces cell-level editing)
  const [editingRow, setEditingRow] = useState(null);
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
  const [deleting, setDeleting] = useState(false);

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
  // Sub-view within productions: table | cards | kanban
  const [prodView, setProdView] = useState(() => localStorage.getItem('cp_dash_prodview') || 'table');

  // Drag & reorder
  const [customOrder, setCustomOrder] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Save View modal
  const [showSaveView, setShowSaveView] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const prods = await Promise.resolve(getProductions(brandId, selectedYear));
      setProductions(Array.isArray(prods) ? prods : []);
      if (user) {
        const saved = await Promise.resolve(getViewOrder(`dashboard_${brandId}`, user.id));
        if (saved) setCustomOrder(saved);
      }
      setLoading(false);
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
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(p =>
        p.id.toLowerCase().includes(q) ||
        p.project_name.toLowerCase().includes(q) ||
        (p.producer || '').toLowerCase().includes(q) ||
        (p.product_type || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (customOrder && !debouncedSearch && !stageFilter && !productTypeFilter) {
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

  async function handleLock(prodId, locked) {
    try {
      const res = await fetch(`/api/productions/${prodId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('cp_auth_token')}` },
        body: JSON.stringify({ locked }),
      });
      if (res.ok) {
        refresh();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to lock/unlock');
      }
    } catch {}
  }

  async function handleDeleteProduction() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/productions/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('cp_auth_token')}` },
      });
      const data = await res.json();
      if (data.success) {
        setProductions(prev => prev.filter(p => p.id !== deleteConfirm.id));
        setDeleteConfirm(null);
        addNotification('delete', `Production "${deleteConfirm.name}" deleted`, null);
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch { alert('Failed to delete production'); }
    setDeleting(false);
  }

  async function handleCreate(data) {
    try {
      const prod = await createProduction(data);
      if (!prod || prod.error) {
        alert(prod?.error || 'Failed to create production');
        return null;
      }
      setShowNewModal(false);
      await refresh();
      if (prod?.planned_end && new Date(prod.planned_end) < new Date()) {
        setPastProdDialog(prod);
      }
      return prod;
    } catch (err) {
      alert('Failed to create production: ' + (err.message || 'Server error'));
      return null;
    }
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
  // Read yearly budget — same key as Financial page, same default
  const yearlyBudget = Number(localStorage.getItem(`cp_yearly_budget_${brandId}_${selectedYear}`)) || 600000;
  const canSaveForAll = isAdmin || isEditor;

  // Compact number formatter: $50,000 → $50K, $1,200,000 → $1.2M
  function fmtShort(amount) {
    const n = parseFloat(amount) || 0;
    const prefix = currency === 'ILS' ? '₪' : '$';
    if (Math.abs(n) >= 1000000) return `${prefix}${(n / 1000000).toFixed(1)}M`;
    if (Math.abs(n) >= 1000) return `${prefix}${(n / 1000).toFixed(0)}K`;
    return `${prefix}${n.toLocaleString()}`;
  }
  const df = compactMode ? fmtShort : fmt; // display formatter

  const budgetBase = yearlyBudget > 0 ? yearlyBudget : totalBudget; // yearly budget is the anchor
  const pctAllocated = budgetBase > 0 ? Math.round((totalBudget / budgetBase) * 100) : 0;
  const pctSpent = budgetBase > 0 ? Math.round((totalSpent / budgetBase) * 100) : 0;
  const remaining = budgetBase - totalSpent;
  const stageBreakdown = productions.reduce((m, p) => {
    const s = p.stage || 'Pending';
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});

  return (
    <div className="animate-fadeIn">
      {/* ── Title Row ──────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
            Productions
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {filtered.length} of {productions.length} · {selectedYear}
          </p>
        </div>
      </div>

      {/* ── Summary Strip (collapsible) — hidden on weekly tab ──── */}
      {activeTab !== 'weekly' && (() => {
        const [showSummary, setShowSummary] = [summaryOpen, setSummaryOpen];
        return (
          <div className="mb-4">
            <button
              onClick={() => { const v = !showSummary; setSummaryOpen(v); localStorage.setItem('cp_dash_summary', JSON.stringify(v)); }}
              className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-gray-600 mb-2 transition-colors"
            >
              {showSummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showSummary ? 'Hide Summary' : 'Show Summary'}
            </button>
            {showSummary && (
              <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(3,11,46,0.04) 0%, rgba(8,8,248,0.04) 100%)', border: '1px solid rgba(8,8,248,0.08)' }}>
                <div className={clsx('grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 p-3', compactMode ? 'gap-2' : 'gap-3')}>

                  {/* Yearly Budget — the anchor */}
                  <div className="kpi-card flex flex-col justify-center min-w-0 p-3">
                    <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{selectedYear} Total Budget</div>
                    <div className="text-base sm:text-lg font-black tracking-tight kpi-value" style={{ color: 'var(--brand-primary)', letterSpacing: '-0.03em' }}>
                      {fmtShort(budgetBase)}
                    </div>
                    <div className="mt-1.5 text-[9px] text-gray-400">
                      {yearlyBudget > 0 ? 'Set in Financial' : 'Sum of productions'}
                    </div>
                  </div>

                  {/* Allocated — sum of production planned budgets */}
                  <div className="kpi-card flex flex-col justify-center min-w-0 p-3">
                    <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Allocated</div>
                    <div className="text-base sm:text-lg font-black tracking-tight kpi-value" style={{ color: 'var(--brand-primary)', letterSpacing: '-0.03em' }}>
                      {fmtShort(totalBudget)}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(pctAllocated, 100)}%`, background: 'var(--brand-accent)' }} />
                      </div>
                      <span className="text-[9px] text-gray-400">{pctAllocated}% of budget</span>
                    </div>
                  </div>

                  {/* Spent — total actual spend */}
                  <div className="kpi-card flex flex-col justify-center min-w-0 p-3">
                    <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Spent</div>
                    <div className="text-base sm:text-lg font-black tracking-tight kpi-value" style={{ color: pctSpent > 90 ? '#dc2626' : '#16a34a' }}>
                      {fmtShort(totalSpent)}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(pctSpent, 100)}%`, background: pctSpent > 90 ? '#dc2626' : '#22c55e' }} />
                      </div>
                      <span className="text-[9px] text-gray-400">{pctSpent}% of budget</span>
                    </div>
                  </div>

                  {/* Remaining — out of yearly budget */}
                  <div className="kpi-card flex flex-col justify-center min-w-0 p-3">
                    <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Remaining</div>
                    <div className={`text-base sm:text-lg font-black tracking-tight kpi-value`} style={{ color: remaining >= 0 ? 'var(--brand-secondary)' : '#dc2626' }}>
                      {fmtShort(Math.abs(remaining))}
                      {remaining < 0 && <span className="text-[10px] ml-1">over</span>}
                    </div>
                    <div className="mt-1.5 text-[9px] text-gray-400">
                      {remaining >= 0 ? `${100 - pctSpent}% of budget left` : `${Math.abs(100 - pctSpent)}% over budget`}
                    </div>
                  </div>

                  {/* Stage Bar — clickable segments */}
                  <div className="kpi-card flex flex-col justify-center min-w-0 p-3 col-span-2 sm:col-span-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest">
                        {stageFilter ? stageFilter : 'By Stage'}
                      </div>
                      <div className="flex items-center gap-2">
                        {stageFilter && (
                          <button onClick={() => { setStageFilter(''); localStorage.setItem('cp_dash_filters', JSON.stringify({ ...JSON.parse(localStorage.getItem('cp_dash_filters') || '{}'), stageFilter: '' })); }}
                            className="text-[9px] font-semibold text-red-500 hover:text-red-700 flex items-center gap-0.5 transition-colors">
                            <X size={9} /> Clear
                          </button>
                        )}
                        <span className="text-sm font-black text-gray-800">{productions.length}</span>
                        <span className="text-[9px] text-gray-400">total</span>
                      </div>
                    </div>
                    {/* Stacked bar */}
                    <div className="flex h-3 rounded-full overflow-hidden mb-2 cursor-pointer">
                      {(() => {
                        const stageColors = { 'Pending': '#8b5cf6', 'Pre-Production': '#6366f1', 'Production': '#3b82f6', 'Post Production': '#f97316', 'Completed': '#22c55e', 'Paused': '#eab308' };
                        const total = productions.length || 1;
                        return Object.entries(stageBreakdown).map(([stage, count]) => (
                          <div
                            key={stage}
                            onClick={() => {
                              const newFilter = stageFilter === stage ? '' : stage;
                              setStageFilter(newFilter);
                              localStorage.setItem('cp_dash_filters', JSON.stringify({ ...JSON.parse(localStorage.getItem('cp_dash_filters') || '{}'), stageFilter: newFilter }));
                            }}
                            className={`h-full transition-all duration-300 hover:opacity-80 ${stageFilter === stage ? 'ring-2 ring-offset-1 ring-gray-800 z-10' : ''}`}
                            style={{ width: `${(count / total) * 100}%`, background: stageColors[stage] || '#6b7280', minWidth: count > 0 ? '8px' : 0 }}
                            title={`${stage}: ${count} (click to filter)`}
                          />
                        ));
                      })()}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {(() => {
                        const stageColors = { 'Pending': '#8b5cf6', 'Pre-Production': '#6366f1', 'Production': '#3b82f6', 'Post Production': '#f97316', 'Completed': '#22c55e', 'Paused': '#eab308' };
                        return Object.entries(stageBreakdown).map(([stage, count]) => (
                          <button key={stage}
                            onClick={() => {
                              const newFilter = stageFilter === stage ? '' : stage;
                              setStageFilter(newFilter);
                              localStorage.setItem('cp_dash_filters', JSON.stringify({ ...JSON.parse(localStorage.getItem('cp_dash_filters') || '{}'), stageFilter: newFilter }));
                            }}
                            className={`flex items-center gap-1 text-[9px] transition-all ${stageFilter === stage ? 'font-black' : 'text-gray-500 hover:text-gray-700'}`}>
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stageColors[stage] || '#6b7280' }} />
                            {stage.replace('Production', 'Prod').replace('Pre-Prod', 'Pre')} <span className="font-bold">{count}</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {activeTab !== 'weekly' && customOrder && !search && !stageFilter && !productTypeFilter && (
        <button
          onClick={handleSaveViewClick}
          className="flex items-center gap-2 px-3 py-2 mb-3 rounded-full text-xs font-semibold border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 transition-all"
        >
          <Save size={13} />
          Save This View
        </button>
      )}

      {/* Toolbar — hidden on weekly tab */}
      {activeTab !== 'weekly' && <div className="flex items-center gap-3 mb-4 flex-wrap">
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
            className="brand-input pl-10"
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
        <button
          onClick={() => setStickyHeader(v => { const n = !v; localStorage.setItem('cp_dash_sticky', JSON.stringify(n)); return n; })}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
            stickyHeader ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
          )}
        >
          📌 {stickyHeader ? 'Sticky On' : 'Sticky Off'}
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
      </div>}

      {/* Tab Bar + New Production */}
      <div className="flex items-center gap-1 border-b border-gray-100 mb-4">
        {[
          { id: 'productions', label: 'Productions' },
          { id: 'updates',    label: 'Updates' },
          { id: 'weekly',      label: 'Weekly' },
          { id: 'analysis',   label: 'Analysis' },
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
        {activeTab !== 'weekly' && (
          <div className="ml-auto flex items-center gap-2">
            {/* View mode toggle (table / cards / kanban) — only in productions tab */}
            {activeTab === 'productions' && (
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                {[
                  { id: 'table', label: '☰', title: 'Table' },
                  { id: 'cards', label: '▦', title: 'Cards' },
                  { id: 'kanban', label: '▥', title: 'Kanban' },
                ].map(v => (
                  <button key={v.id} title={v.title}
                    onClick={() => { setProdView(v.id); localStorage.setItem('cp_dash_prodview', v.id); }}
                    className={clsx('px-2 py-1 rounded-md text-xs font-medium transition-colors',
                      prodView === v.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'
                    )}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            {activeTab === 'productions' && prodView === 'table' && (
              <button
                onClick={() => setCompactMode(v => { const n = !v; localStorage.setItem('cp_dash_compact', JSON.stringify(n)); return n; })}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  compactMode ? 'bg-violet-50 border-violet-200 text-violet-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                )}
              >
                {compactMode ? '⊟' : '⊞'} {compactMode ? 'Compact' : 'Fit'}
              </button>
            )}
            {isEditor && (
              <button
                className="btn-cta flex items-center gap-1.5 text-xs px-4 py-1.5"
                onClick={() => setShowNewModal(true)}
              >
                <Plus size={13} strokeWidth={2.5} />
                New Production
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {activeTab === 'productions' && loading && (
        <SkeletonLoader rows={8} type={prodView === 'cards' ? 'cards' : 'table'} />
      )}
      {/* Cards View */}
      {activeTab === 'productions' && !loading && prodView === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <p className="text-sm font-medium">No productions match your filters</p>
            </div>
          )}
          {filtered.map(prod => {
            const spent = prod.actual_spent || 0;
            const budget = prod.planned_budget_2026 || 0;
            const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
            const pctColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-green-500';
            return (
              <div
                key={prod.id}
                onClick={() => navigate(`/production/${prod.id}`)}
                className="group brand-card p-4 rounded-xl cursor-pointer hover:shadow-lg transition-all border border-gray-100 dark:border-gray-700/50 hover:border-gray-300 dark:hover:border-gray-600"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-mono text-gray-400">{prod.id}</span>
                  <StageBadge stage={prod.stage} size="xs" />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 line-clamp-2 mb-2 group-hover:text-[var(--brand-accent)] transition-colors">
                  {prod.project_name || 'Untitled'}
                </h3>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(Array.isArray(prod.product_type) ? prod.product_type : [prod.product_type]).filter(Boolean).map((t, i) => (
                    <span key={i} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{t}</span>
                  ))}
                </div>
                {prod.producer && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{prod.producer}</p>}
                {budget > 0 && (
                  <div className="mt-auto">
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                      <span>{fmt(spent)}</span>
                      <span>{fmt(budget)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pctColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                )}
                {prod.planned_start && (
                  <p className="text-[10px] text-gray-400 mt-2">
                    {new Date(prod.planned_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {prod.planned_end && ` – ${new Date(prod.planned_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Kanban View (by stage) */}
      {activeTab === 'productions' && !loading && prodView === 'kanban' && (() => {
        const stageOrder = (lists.stages || ['Pending', 'Pre-Production', 'Production', 'Post Production', 'Completed', 'Paused']);
        const grouped = {};
        stageOrder.forEach(s => grouped[s] = []);
        filtered.forEach(p => {
          const s = p.stage || 'Pending';
          if (!grouped[s]) grouped[s] = [];
          grouped[s].push(p);
        });
        const stageColors = {
          'Pending': 'border-gray-300', 'Pre-Production': 'border-blue-400', 'Production': 'border-green-400',
          'Post Production': 'border-purple-400', 'Completed': 'border-emerald-500', 'Paused': 'border-amber-400',
        };
        return (
          <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
            {stageOrder.filter(s => grouped[s]?.length > 0 || !hideCompleted).map(stage => (
              <div key={stage} className={`shrink-0 w-64 bg-gray-50 dark:bg-gray-800/30 rounded-xl border-t-2 ${stageColors[stage] || 'border-gray-300'}`}>
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{stage}</span>
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{(grouped[stage] || []).length}</span>
                </div>
                <div className="px-2 pb-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                  {(grouped[stage] || []).map(prod => (
                    <div
                      key={prod.id}
                      onClick={() => navigate(`/production/${prod.id}`)}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all"
                    >
                      <p className="text-[10px] font-mono text-gray-400 mb-1">{prod.id}</p>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-100 line-clamp-2 mb-1.5">{prod.project_name || 'Untitled'}</p>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(Array.isArray(prod.product_type) ? prod.product_type : [prod.product_type]).filter(Boolean).slice(0, 2).map((t, i) => (
                          <span key={i} className="text-[8px] font-semibold px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">{t}</span>
                        ))}
                      </div>
                      {prod.producer && <p className="text-[10px] text-gray-500 truncate">{prod.producer}</p>}
                    </div>
                  ))}
                  {(grouped[stage] || []).length === 0 && (
                    <p className="text-[10px] text-gray-400 text-center py-4 italic">No productions</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Table View */}
      {activeTab === 'productions' && !loading && prodView === 'table' && <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper" style={stickyHeader ? { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' } : {}}>
          <table className={clsx('data-table', compactMode && 'compact-table')} style={{ minWidth: compactMode ? 700 : 1200 }}>
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
                  isAdmin={isAdmin}
                  editingRow={editingRow}
                  setEditingRow={setEditingRow}
                  onSaveRow={handleSaveRow}
                  onInlineEdit={handleInlineEdit}
                  onLock={handleLock}
                  onDelete={(id, name) => setDeleteConfirm({ id, name })}
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
                  compactMode={compactMode}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Weekly Tab */}
      {/* Updates Tab */}
      {activeTab === 'updates' && (
        <GlobalUpdatesTab brandId={brandId} productions={productions} />
      )}

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
          existingProductions={productions}
          selectedYear={selectedYear}
          productions={productions}
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

      {/* Delete Production Confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="modal-panel" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-gray-900">Delete Production</h2>
                <p className="text-xs text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold mb-2">
                Are you sure you want to delete "{deleteConfirm.name}"?
              </p>
              <p className="text-xs text-red-600 leading-relaxed">
                This will permanently delete all associated data including:
              </p>
              <ul className="text-xs text-red-600 mt-1.5 space-y-0.5 list-disc pl-4">
                <li>Budget line items & payments</li>
                <li>Cast members & contracts linked to this production</li>
                <li>Gantt events & timelines</li>
                <li>Call sheets & crew assignments</li>
                <li>Links, comments, invoices & receipts</li>
                <li>Change history</li>
                <li>CC purchases</li>
              </ul>
              <p className="text-xs text-red-500 mt-2 italic">Scripts and contracts will be unlinked (not deleted).</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProduction}
                disabled={deleting}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting...' : 'Yes, Delete Production'}
              </button>
            </div>
          </div>
        </div>
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
  'Completed':       'bg-green-100',
  'Production':      'bg-blue-100',
  'Pre Production':  'bg-yellow-100',
  'Pre-Production':  'bg-yellow-100',
  'Post':            'bg-purple-100',
  'Post Production': 'bg-purple-100',
  'Paused':          'bg-orange-100',
  'Pending':         'bg-gray-100',
  'On Hold':         'bg-orange-100',
};

function ProductionRow({
  prod, fmt, onOpen, onUpdates, onStageChange, onProductionTypeChange, isEditor, isAdmin,
  editingRow, setEditingRow, onSaveRow, onInlineEdit, onLock, onDelete,
  dragId, dragOverId, onDragStart, onDragOver, onDrop, onDragEnd, canDrag,
  hiddenCols = [], colorByStatus = true, orderedCols = [], compactMode = false,
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

  // Compact formatter for row values
  function fmtC(amount) {
    if (!compactMode) return fmt(amount);
    const n = parseFloat(amount) || 0;
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return fmt(n);
  }
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
            onClick={isEditor && !prod.locked ? startEditId : undefined}
          >
            {prod.locked && <Lock size={8} className="text-amber-400 flex-shrink-0" />}
            {prod.id}
            {isEditor && !prod.locked && <Pencil size={9} className="opacity-0 group-hover/id:opacity-30 flex-shrink-0" />}
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
              <span className="font-semibold text-gray-700 whitespace-nowrap">{fmtC(prod.planned_budget_2026)}</span>
            )}
          </td>
        );
        if (key === 'est_budget') return (
          <td key={key}>
            <span className="text-gray-400 whitespace-nowrap text-sm">{fmtC(prod.estimated_budget)}</span>
          </td>
        );
        if (key === 'actual_spent') return (
          <td key={key}>
            <span className="text-gray-400 whitespace-nowrap text-sm">{fmtC(prod.actual_spent)}</span>
          </td>
        );
        if (key === 'stage') {
          const stageColor = colorByStatus && getListItemColor('stages', prod.stage);
          return (
          <td key={key} onClick={e => e.stopPropagation()}>
            {isEditor ? (
              <select
                value={prod.stage}
                onChange={e => onStageChange(prod.id, e.target.value)}
                className="text-xs border-0 bg-transparent font-semibold outline-none cursor-pointer"
                style={stageColor ? { color: stageColor } : { color: 'inherit' }}
                onClick={e => e.stopPropagation()}
              >
                {lists.stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span
                className="badge"
                style={stageColor ? {
                  backgroundColor: stageColor + '20',
                  color: stageColor,
                  borderColor: stageColor + '40',
                } : {}}
              >
                {prod.stage}
              </span>
            )}
          </td>
        );
        }
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
            {isEditor && !prod.locked && (
              <button
                onClick={startEdit}
                className="p-1.5 rounded hover:bg-blue-50 text-gray-300 hover:text-blue-500 transition-colors sm:opacity-0 opacity-60 sm:group-hover:opacity-100"
                title="Edit row"
              >
                <Pencil size={14} />
              </button>
            )}
            {prod.locked && (
              <span className="p-1.5 text-amber-500" title={`Locked by ${prod.locked_by || 'admin'}`}>
                <Lock size={13} />
              </span>
            )}
            {isAdmin && (
              <button
                onClick={(e) => { e.stopPropagation(); onLock(prod.id, !prod.locked); }}
                className={`p-1.5 rounded transition-colors sm:opacity-0 opacity-60 sm:group-hover:opacity-100 ${prod.locked ? 'hover:bg-green-50 text-amber-400 hover:text-green-600' : 'hover:bg-amber-50 text-gray-300 hover:text-amber-500'}`}
                title={prod.locked ? 'Unlock production' : 'Lock production'}
              >
                {prod.locked ? <Unlock size={13} /> : <Lock size={13} />}
              </button>
            )}
            <button
              onClick={onUpdates}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Updates & Comments"
            >
              <MessageSquare size={14} />
            </button>
            {isAdmin && !prod.locked && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(prod.id, prod.project_name); }}
                className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                title="Delete production"
              >
                <Trash2 size={13} />
              </button>
            )}
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
