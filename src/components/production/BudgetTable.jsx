import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Plus, Trash2, Mail, FileSignature, ExternalLink, Download, Check, ChevronUp, ChevronDown, ChevronRight, SlidersHorizontal, X, Upload, User, CreditCard, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotifications } from '../../context/NotificationsContext';
import {
  getLineItems,
  createLineItem,
  updateLineItem,
  deleteLineItem,
  syncProductionTotals,
  generateId,
  getContract,
  deleteContract,
  updateProduction,
  getGlobalBudgetCustomCols,
  saveGlobalBudgetCustomCols,
  getProductionCustomCols,
  createCastMember,
  deleteCastMember,
  getCastMembers,
  createGanttEvent,
  getCCPurchases,
} from '../../lib/dataService';
import { getDownloadUrl } from '../../lib/invoiceUtils';
import { getTablePrefs, toggleColumnVisibility, updateSort } from '../../lib/tablePrefs';
import { useLists } from '../../context/ListsContext';
import InvoiceModal from './InvoiceModal';
import ContractModal from './ContractModal';
import { CloudLinks, detectCloudUrl, getDriveThumbnail } from '../shared/FileUploadButton';
import clsx from 'clsx';

const TYPE_CLASSES = {
  'Crew': 'type-crew',
  'Equipment': 'type-equipment',
  'Catering & Transport': 'type-catering',
  'Post': 'type-post',
  'Office': 'type-office',
  'Cast': 'type-cast',
};

const CAST_PERIODS = ['Perpetually', '1 Year', '6 Months', '3 Months'];
const CAST_ROLES   = ['Model', 'Actor', 'Actress', 'Extra'];
const CAST_USAGE_OPTIONS = ['Any Use', 'Digital', 'TV', 'Stills', 'OOH'];

function calcCastEndDate(startDate, period) {
  if (!startDate || period === 'Perpetually') return '';
  const d = new Date(startDate);
  if (period === '1 Year')   d.setFullYear(d.getFullYear() + 1);
  if (period === '6 Months') d.setMonth(d.getMonth() + 6);
  if (period === '3 Months') d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0];
}

function calcWarningDate(endDate) {
  if (!endDate) return '';
  const d = new Date(endDate);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

const STATUS_CLASSES = {
  'Working on it': 'status-working',
  'Done': 'status-done',
  'Stuck': 'status-stuck',
  'Not Started': 'status-not-started',
};

const BUDGET_TOGGLE_KEYS = ['full_name','planned_budget','type','status','timeline','actual_spent','difference','invoice','contract'];

export default function BudgetTable({ productionId, production, onRefresh, prodRate, onImport, onAccountingImport }) {
  const { isEditor, user } = useAuth();
  const { fmt, currency, rate } = useCurrency();

  // Use production-specific delivery date rate, fallback to live rate
  const effectiveRate = prodRate || rate || 3.7;

  // Per-row currency helpers (parseFloat handles PostgreSQL NUMERIC→string)
  function fmtRow(amount, code) {
    const n = parseFloat(amount) || 0;
    return code === 'ILS' ? `₪${n.toLocaleString()}` : `$${n.toLocaleString()}`;
  }
  // Convert any amount to the current display currency (USD or ILS)
  function toDisplay(amount, code) {
    const num = parseFloat(amount) || 0;
    if (code === 'ILS' && currency === 'ILS') return num;           // ILS→ILS: no conversion
    if (code === 'ILS' && currency === 'USD') return num / effectiveRate; // ILS→USD
    if (code === 'USD' && currency === 'ILS') return num * effectiveRate; // USD→ILS
    return num;                                                      // USD→USD: no conversion
  }
  // Format a number already in display currency (no re-conversion)
  function fmtDisplay(n) {
    const num = parseFloat(n) || 0;
    const symbol = currency === 'ILS' ? '₪' : '$';
    return `${symbol}${Math.round(num).toLocaleString()}`;
  }
  // Compact number format ($50K, $1.2M)
  function fmtShort(n) {
    const num = parseFloat(n) || 0;
    const symbol = currency === 'ILS' ? '₪' : '$';
    if (Math.abs(num) >= 1_000_000) return `${symbol}${(num / 1_000_000).toFixed(1)}M`;
    if (Math.abs(num) >= 1_000) return `${symbol}${(num / 1_000).toFixed(0)}K`;
    return `${symbol}${Math.round(num).toLocaleString()}`;
  }
  const { addNotification } = useNotifications();
  const { lists } = useLists();
  const [items, setItems] = useState([]);
  const [editingCell, setEditingCell] = useState(null); // { itemId, field }
  const [invoiceFor, setInvoiceFor] = useState(null);   // { id, step } | null
  const [contractFor, setContractFor] = useState(null); // lineItem object
  const [hiddenCols, setHiddenCols] = useState(() => getTablePrefs('budget').hidden);
  const [showColPanel, setShowColPanel] = useState(false);
  const [stickyHeader, setStickyHeader] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_budget_sticky') || 'true'); } catch { return true; }
  });
  const [compactMode, setCompactMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_budget_compact') || 'false'); } catch { return false; }
  });
  const [sortState, setSortState] = useState(() => {
    const prefs = getTablePrefs('budget');
    return prefs.sort.col ? prefs.sort : { col: null, dir: 'asc' };
  });

  // Custom columns state
  const [customCols, setCustomCols] = useState([]);
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [newColForm, setNewColForm] = useState({ label: '', type: 'Text', scope: 'board' });
  const [deleteColConfirm, setDeleteColConfirm] = useState(null); // key to delete

  // Cast modal + photo fullscreen
  const [castModalItem, setCastModalItem] = useState(null); // line item that triggered Cast type
  const [photoFullscreen, setPhotoFullscreen] = useState(null); // photo URL to show fullscreen

  // CC purchase sub-rows
  const [ccPurchases, setCcPurchases] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());

  useEffect(() => {
    async function load() {
      const [items, cc] = await Promise.all([
        Promise.resolve(getLineItems(productionId)),
        Promise.resolve(getCCPurchases(productionId)),
      ]);
      setItems(Array.isArray(items) ? items : []);
      setCcPurchases(Array.isArray(cc) ? cc : []);
    }
    load();
  }, [productionId]);

  // Load custom columns — handles both sync (DEV) and async (PROD) returns
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.resolve(getProductionCustomCols(production))
      .then(cols => setCustomCols(cols || []));
  }, [production?.id, production?.custom_columns]);

  // Keyboard shortcut: Cmd+N to add new line
  useEffect(() => {
    if (!isEditor) return;
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        addRow();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditor]);

  // CC purchases grouped by parent line item
  const ccByLineItem = useMemo(() => {
    const m = {};
    ccPurchases.forEach(cc => {
      if (cc.parent_line_item_id) {
        m[cc.parent_line_item_id] = m[cc.parent_line_item_id] || [];
        m[cc.parent_line_item_id].push(cc);
      }
    });
    return m;
  }, [ccPurchases]);

  async function refresh() {
    const [items, cc] = await Promise.all([
      Promise.resolve(getLineItems(productionId)),
      Promise.resolve(getCCPurchases(productionId)),
    ]);
    setItems(Array.isArray(items) ? items : []);
    setCcPurchases(Array.isArray(cc) ? cc : []);
    syncProductionTotals(productionId);
    onRefresh?.();
  }

  const vis = key => !hiddenCols.includes(key);

  function handleAddColumn() {
    if (!newColForm.label.trim()) return;
    const key = `custom_${Date.now()}`;
    const col = { key, label: newColForm.label.trim(), type: newColForm.type };
    if (newColForm.scope === 'global') {
      const global = [...getGlobalBudgetCustomCols(), col];
      saveGlobalBudgetCustomCols(global);
    } else {
      const perBoard = [...(production?.custom_columns || []), col];
      updateProduction(productionId, { custom_columns: perBoard });
    }
    setCustomCols(prev => [...prev, col]);
    setNewColForm({ label: '', type: 'Text', scope: 'board' });
    setShowAddColModal(false);
  }

  function handleDeleteColumn(colKey) {
    // Remove from global
    const global = getGlobalBudgetCustomCols().filter(c => c.key !== colKey);
    saveGlobalBudgetCustomCols(global);
    // Remove from per-board
    const perBoard = (production?.custom_columns || []).filter(c => c.key !== colKey);
    updateProduction(productionId, { custom_columns: perBoard });
    setCustomCols(prev => prev.filter(c => c.key !== colKey));
    setDeleteColConfirm(null);
  }

  function handleBudgetSort(col) {
    const newSort = updateSort('budget', col);
    setSortState(newSort);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortedItems = useMemo(() => {
    if (!sortState.col) return items;
    return [...items].sort((a, b) => {
      const col = sortState.col;
      const av = col === 'difference' ? (a.planned_budget - a.actual_spent) : (a[col] ?? '');
      const bv = col === 'difference' ? (b.planned_budget - b.actual_spent) : (b[col] ?? '');
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortState]);

  const [newRowId, setNewRowId] = useState(null);

  async function addRow() {
    if (!isEditor) return;
    const id = generateId('li');
    const item = {
      id,
      production_id: productionId,
      item: '',
      full_name: '',
      planned_budget: 0,
      type: 'Crew',
      status: 'Not Started',
      timeline_start: '',
      timeline_end: '',
      actual_spent: 0,
    };
    await Promise.resolve(createLineItem(item));
    addNotification('edit', `${user?.name || 'Someone'} added a line item to ${production?.project_name || productionId}`, productionId);
    setNewRowId(id);
    await refresh();
    // Clear highlight after animation
    setTimeout(() => setNewRowId(null), 2000);
    // Auto-focus the first cell of the new row
    setTimeout(() => setEditingCell({ itemId: id, field: 'item' }), 300);
  }

  async function handleUpdate(id, field, value) {
    if (!isEditor) return;
    const item = items.find(i => i.id === id);
    const oldVal = item ? item[field] : undefined;
    await Promise.resolve(updateLineItem(id, { [field]: value }));
    if (String(oldVal ?? '') !== String(value ?? '')) {
      addNotification('edit', `${user?.name || 'Someone'} updated ${field} in ${production?.project_name || productionId}${item ? ` (${item.item || item.full_name || id})` : ''}`, productionId);
    }
    await refresh();
    setEditingCell(null);
  }

  // Cascade delete state
  const [deleteModal, setDeleteModal] = useState(null); // { id, item }
  const [deleteOpts, setDeleteOpts] = useState({ contract: true, cast: true, driveFiles: false });
  const [deleting, setDeleting] = useState(false);

  function handleDelete(id) {
    if (!isEditor) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    // Check what related data exists
    const contractKey = `${productionId}_li_${id}`;
    const contract = getContract(contractKey);
    const isCast = (item.type || '').toLowerCase().includes('cast') || (item.category || '').toLowerCase().includes('cast');
    setDeleteOpts({ contract: !!contract, cast: isCast, driveFiles: false });
    setDeleteModal({ id, item, contract, isCast });
  }

  async function confirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    const { id, item } = deleteModal;
    try {
      const params = new URLSearchParams({
        deleteContract: deleteOpts.contract ? 'true' : 'false',
        deleteCast: deleteOpts.cast ? 'true' : 'false',
        deleteDriveFiles: deleteOpts.driveFiles ? 'true' : 'false',
      });
      const token = localStorage.getItem('cp_auth_token');
      await fetch(`/api/line-items/${encodeURIComponent(id)}?${params}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      addNotification('edit', `${user?.name || 'Someone'} deleted "${item.item || item.full_name}" from ${production?.project_name || productionId}`, productionId);
      await refresh();
    } catch (e) {
      console.error('Delete failed:', e);
    }
    setDeleting(false);
    setDeleteModal(null);
  }

  /**
   * Handle invoice button clicks:
   *  step = 'request' → mark Pending + open modal on send tab
   *  step = 'receive' → open modal on receive tab directly
   */
  async function handleInvoiceAction(itemId, step) {
    if (step === 'request') {
      // Immediately mark as Pending so the UI updates
      await Promise.resolve(updateLineItem(itemId, { invoice_status: 'Pending' }));
      await refresh();
      setInvoiceFor({ id: itemId, step: 'send' });
    } else {
      setInvoiceFor({ id: itemId, step: 'receive' });
    }
  }

  // Separate subtotals by original currency
  const usdPlanned = items.filter(i => (i.currency_code || 'USD') === 'USD').reduce((s, i) => s + (parseFloat(i.planned_budget) || 0), 0);
  const ilsPlanned = items.filter(i => i.currency_code === 'ILS').reduce((s, i) => s + (parseFloat(i.planned_budget) || 0), 0);
  const usdActual  = items.filter(i => (i.currency_code || 'USD') === 'USD').reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const ilsActual  = items.filter(i => i.currency_code === 'ILS').reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const hasMixed   = usdPlanned > 0 && ilsPlanned > 0;

  // Combined totals converted to display currency
  const totalPlanned = items.reduce((s, i) => s + toDisplay(i.planned_budget || 0, i.currency_code || 'USD'), 0);
  const totalActual  = items.reduce((s, i) => s + toDisplay(i.actual_spent  || 0, i.currency_code || 'USD'), 0);
  const totalDiff    = totalPlanned - totalActual;

  // Budget cap: line items sum vs production planned_budget_2026
  const capBudget  = toDisplay(production?.planned_budget_2026 || 0, 'USD');
  const isOverCap  = capBudget > 0 && totalPlanned > capBudget;
  const overAmount = isOverCap ? totalPlanned - capBudget : 0;

  const totalVisibleCols = 1 + BUDGET_TOGGLE_KEYS.filter(k => vis(k)).length + customCols.length + (isEditor ? 1 : 0);
  const colsBefore   = ['full_name'].filter(k => vis(k)).length + 1; // item always
  const colsMid      = ['type','status','timeline'].filter(k => vis(k)).length;
  const colsTail     = ['invoice','contract'].filter(k => vis(k)).length + customCols.length + (isEditor ? 1 : 0);

  return (
    <div>
      {/* Cascade Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !deleting && setDeleteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-red-50 px-6 py-4 border-b border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">Delete "{deleteModal.item.item || deleteModal.item.full_name}"?</h3>
                  <p className="text-xs text-gray-400">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Body — what will be deleted */}
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600 font-medium">The following will be deleted:</p>

              {/* Always: line item */}
              <label className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                <input type="checkbox" checked disabled className="rounded" />
                <CreditCard size={14} className="text-gray-400" />
                <span className="text-sm text-gray-700">Line item & budget entry</span>
              </label>

              {/* Contract */}
              {deleteModal.contract && (
                <label className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input type="checkbox" checked={deleteOpts.contract}
                    onChange={e => setDeleteOpts(o => ({ ...o, contract: e.target.checked }))}
                    className="rounded accent-red-500" />
                  <FileSignature size={14} className="text-blue-400" />
                  <span className="text-sm text-gray-700">Contract & signatures</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{deleteModal.contract.status}</span>
                </label>
              )}

              {/* Cast */}
              {deleteModal.isCast && (
                <label className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input type="checkbox" checked={deleteOpts.cast}
                    onChange={e => setDeleteOpts(o => ({ ...o, cast: e.target.checked }))}
                    className="rounded accent-red-500" />
                  <User size={14} className="text-purple-400" />
                  <span className="text-sm text-gray-700">Cast member entry & photo</span>
                </label>
              )}

              {/* Drive files */}
              {(deleteModal.item.invoice_url || deleteModal.item.drive_url) && (
                <label className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                  <input type="checkbox" checked={deleteOpts.driveFiles}
                    onChange={e => setDeleteOpts(o => ({ ...o, driveFiles: e.target.checked }))}
                    className="rounded accent-red-500" />
                  <svg width="14" height="14" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L29 52.2H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                    <path d="M43.65 25.15L29 1.2C27.65 2 26.5 3.1 25.7 4.5l-24.5 42.4c-.8 1.4-1.2 2.95-1.2 4.5H29z" fill="#00AC47"/>
                    <path d="M58.3 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L73.7 52.2H58.3L43.65 25.15 29 52.2z" fill="#EA4335"/>
                  </svg>
                  <span className="text-sm text-gray-700">Files on Google Drive</span>
                  <span className="text-[10px] text-red-400 ml-auto">permanent</span>
                </label>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                style={{ opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> Deleting...</>
                ) : (
                  <><Trash2 size={14} /> Delete Selected</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget cap warning */}
      {isOverCap && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={13} className="shrink-0 text-red-500" />
          <span>
            Line items total <strong>{fmtDisplay(totalPlanned)}</strong> exceeds the production planned budget of{' '}
            <strong>{fmtDisplay(capBudget)}</strong> — over by <strong className="text-red-800">{fmtDisplay(overAmount)}</strong>.
          </span>
        </div>
      )}

      {/* Toolbar: Import + Columns */}
      <div className="flex justify-end gap-2 mb-2">
        {isEditor && onImport && (
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-all"
          >
            <Upload size={12} />
            Import
          </button>
        )}
        {isEditor && onAccountingImport && (
          <button
            onClick={onAccountingImport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-200 bg-white text-green-600 hover:text-green-700 hover:border-green-400 transition-all"
          >
            <Upload size={12} />
            PRD Sheet
          </button>
        )}
        {/* Sticky toggle */}
        <button
          onClick={() => { const v = !stickyHeader; setStickyHeader(v); localStorage.setItem('cp_budget_sticky', JSON.stringify(v)); }}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
            stickyHeader ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
          )}
          title={stickyHeader ? 'Disable sticky header' : 'Enable sticky header'}
        >
          Sticky
        </button>
        {/* Compact toggle */}
        <button
          onClick={() => { const v = !compactMode; setCompactMode(v); localStorage.setItem('cp_budget_compact', JSON.stringify(v)); }}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
            compactMode ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
          )}
          title={compactMode ? 'Disable compact mode' : 'Enable compact mode'}
        >
          Compact
        </button>
        <div className="relative">
          {showColPanel && <div className="fixed inset-0 z-10" onClick={() => setShowColPanel(false)} />}
          <button
            onClick={() => setShowColPanel(p => !p)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              showColPanel ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
            )}
          >
            <SlidersHorizontal size={12} />
            Columns
          </button>
          {showColPanel && (
            <div className="absolute z-20 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[190px]">
              {/* Fixed columns */}
              {[
                { key: 'full_name',      label: 'Full Name' },
                { key: 'planned_budget', label: 'Est. Budget' },
                { key: 'type',           label: 'Type' },
                { key: 'status',         label: 'Status' },
                { key: 'timeline',       label: 'Timeline' },
                { key: 'actual_spent',   label: 'Actual Spent' },
                { key: 'difference',     label: 'Difference' },
                { key: 'invoice',        label: 'Invoice' },
                { key: 'contract',       label: 'Contract' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vis(key)}
                    onChange={() => setHiddenCols(toggleColumnVisibility('budget', key))}
                    className="rounded accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
              {/* Custom columns */}
              {customCols.length > 0 && (
                <div className="border-t border-gray-100 mt-1 pt-1">
                  {customCols.map(col => (
                    <div key={col.key} className="flex items-center gap-1 py-1 px-2 hover:bg-gray-50 rounded group">
                      <span className="flex-1 text-sm text-gray-700">{col.label}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">{col.type}</span>
                      {isEditor && (
                        deleteColConfirm === col.key ? (
                          <button
                            onClick={() => handleDeleteColumn(col.key)}
                            className="text-[10px] text-red-600 font-semibold px-1 rounded hover:bg-red-50"
                          >✓ Delete</button>
                        ) : (
                          <button
                            onClick={() => setDeleteColConfirm(col.key)}
                            className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          ><X size={11} /></button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Add Column button */}
              {isEditor && (
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button
                    onClick={() => { setShowColPanel(false); setShowAddColModal(true); }}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Plus size={12} /> Add Column
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper" style={stickyHeader ? { maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' } : undefined}>
          <table className={clsx('data-table', compactMode && 'compact-table')} style={{ minWidth: 1050 }}>
            <thead>
              <tr>
                <BudgetTh label="Item"           colKey="item"           sortState={sortState} onSort={handleBudgetSort} minWidth={120} />
                {vis('full_name') && <BudgetTh label="Full Name"     colKey="full_name"      sortState={sortState} onSort={handleBudgetSort} minWidth={150} />}
                {vis('planned_budget') && <BudgetTh label="Est. Budget" colKey="planned_budget" sortState={sortState} onSort={handleBudgetSort} />}
                {vis('type') && <BudgetTh label="Type"           colKey="type"           sortState={sortState} onSort={handleBudgetSort} minWidth={130} />}
                {vis('status') && <BudgetTh label="Status"         colKey="status"         sortState={sortState} onSort={handleBudgetSort} minWidth={130} />}
                {vis('timeline') && <th style={{ minWidth: 200 }}>Timeline</th>}
                {vis('actual_spent') && <BudgetTh label="Actual Spent"  colKey="actual_spent"  sortState={sortState} onSort={handleBudgetSort} />}
                {vis('difference') && <BudgetTh label="Difference"    colKey="difference"    sortState={sortState} onSort={handleBudgetSort} />}
                {vis('invoice') && <th style={{ minWidth: 140 }}>Invoice</th>}
                {vis('contract') && <th>Contract</th>}
                {customCols.map(col => (
                  <th key={col.key} style={{ minWidth: 120 }}>{col.label}</th>
                ))}
                {isEditor && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={totalVisibleCols} className="text-center py-10 text-gray-400 text-sm">
                    No line items. {isEditor && 'Add one below.'}
                  </td>
                </tr>
              ) : sortedItems.map(item => (
                <Fragment key={item.id}>
                  <BudgetRow
                    item={item}
                    isEditor={isEditor}
                    production={production}
                    fmt={fmt}
                    fmtRow={fmtRow}
                    editingCell={editingCell}
                    setEditingCell={setEditingCell}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onInvoice={handleInvoiceAction}
                    onContract={() => setContractFor(item)}
                    lineItemTypes={lists.lineItemTypes}
                    lineItemStatuses={lists.lineItemStatuses}
                    hiddenCols={hiddenCols}
                    customCols={customCols}
                    onOpenCastModal={setCastModalItem}
                    onPhotoFullscreen={setPhotoFullscreen}
                    ccChildren={ccByLineItem[item.id] || []}
                    isExpanded={expandedRows.has(item.id)}
                    onToggleExpand={() => setExpandedRows(prev => {
                      const next = new Set(prev);
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                      return next;
                    })}
                    isNew={newRowId === item.id}
                  />
                  {expandedRows.has(item.id) && (ccByLineItem[item.id] || []).map(cc => (
                    <CCSubRow key={cc.id} cc={cc} totalCols={totalVisibleCols} />
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                <td colSpan={colsBefore} className="font-bold text-sm py-3 px-3">Totals</td>
                {vis('planned_budget') && (
                  <td className={clsx('font-bold px-3', isOverCap && 'text-red-600')}>
                    <div>{fmtDisplay(totalPlanned)}</div>
                    {hasMixed && (
                      <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                        ${usdPlanned.toLocaleString()} + ₪{ilsPlanned.toLocaleString()}
                      </div>
                    )}
                  </td>
                )}
                {colsMid > 0 && <td colSpan={colsMid} />}
                {vis('actual_spent') && (
                  <td className="font-bold px-3">
                    <div>{fmtDisplay(totalActual)}</div>
                    {hasMixed && (usdActual > 0 || ilsActual > 0) && (
                      <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                        ${usdActual.toLocaleString()} + ₪{ilsActual.toLocaleString()}
                      </div>
                    )}
                  </td>
                )}
                {vis('difference') && (
                  <td className={clsx('font-bold px-3', totalDiff >= 0 ? 'diff-positive' : 'diff-negative')}>
                    {fmtDisplay(Math.abs(totalDiff))} {totalDiff >= 0 ? '▲' : '▼'}
                  </td>
                )}
                {colsTail > 0 && <td colSpan={colsTail} />}
              </tr>
            </tfoot>
          </table>

          {/* Add Line — right under the table */}
          {isEditor && (
            <button
              onClick={addRow}
              className="group mt-0 flex items-center gap-3 w-full px-4 py-3 text-sm
                         border-t border-dashed border-gray-200
                         text-gray-400 hover:text-blue-600 hover:bg-blue-50/50
                         transition-all duration-200"
            >
              <div className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                <Plus size={14} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <span className="font-medium">Add Line Item</span>
              <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-400 font-mono group-hover:bg-blue-100 group-hover:text-blue-500 transition-colors">
                ⌘ N
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Currency Breakdown */}
      <div className="mt-4 flex gap-4 text-sm flex-wrap">
        <div className="brand-card flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-gray-400 mb-1">Total Estimated</div>
          <div className="font-bold text-gray-800">{fmtDisplay(totalPlanned)}</div>
        </div>
        <div className="brand-card flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-gray-400 mb-1">Total Actual</div>
          <div className="font-bold text-gray-800">{fmtDisplay(totalActual)}</div>
        </div>
        <div className="brand-card flex-1" style={{ minWidth: 160 }}>
          <div className="text-xs text-gray-400 mb-1">Budget Remaining</div>
          <div className={clsx('font-bold', totalDiff >= 0 ? 'diff-positive' : 'diff-negative')}>
            {totalDiff >= 0 ? '+' : ''}{fmtDisplay(totalDiff)}
          </div>
        </div>
      </div>
      )}

      {invoiceFor && (
        <InvoiceModal
          lineItemId={invoiceFor.id}
          productionId={productionId}
          initialStep={invoiceFor.step}
          onClose={() => { setInvoiceFor(null); refresh(); }}
        />
      )}

      {contractFor && (
        <ContractModal
          production={production}
          lineItem={contractFor}
          onClose={() => setContractFor(null)}
        />
      )}

      {/* Cast Member Modal (triggered when type = Cast) */}
      {castModalItem && (
        <CastModalFromBudget
          item={castModalItem}
          production={production}
          onSave={(castData, photoUrl) => {
            const castId = generateId('cm');
            // Persist the cast member
            createCastMember({
              id: castId,
              production_id: production.id,
              project_name: production.project_name || '',
              brand_id: production.brand_id || '',
              name: castData.name,
              photo_url: photoUrl || '',
              role: castData.role,
              period: castData.period,
              start_date: castData.start_date,
              end_date: castData.end_date,
              warning_date: castData.warning_date,
              contract_status: 'Running',
              usage: castData.usage,
              contract_manager_name: castData.contract_manager_name,
              notes: castData.notes,
              signed_contract_url: '',
              created_at: new Date().toISOString(),
            });
            // Update the line item with type + cast metadata
            updateLineItem(castModalItem.id, {
              type: 'Cast',
              cast_photo_url: photoUrl || '',
              cast_member_id: castId,
              full_name: castData.name,
            });
            // Create Gantt warning event
            if (castData.warning_date && castData.period !== 'Perpetually') {
              createGanttEvent({
                production_id: production.id,
                phase: 'post_production',
                name: `⚠️ Rights renewal: ${castData.name} (${(castData.usage || []).join(', ')}) — 1 month remaining`,
                start_date: castData.warning_date,
                end_date: castData.warning_date,
                color: '#f97316',
              });
            }
            refresh();
            setCastModalItem(null);
          }}
          onClose={() => setCastModalItem(null)}
        />
      )}

      {/* Fullscreen photo overlay */}
      {photoFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setPhotoFullscreen(null)}
        >
          <img
            src={photoFullscreen}
            alt="Cast member"
            className="max-w-2xl max-h-screen rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none"
            onClick={() => setPhotoFullscreen(null)}
          >✕</button>
        </div>
      )}

      {/* Add Custom Column Modal */}
      {showAddColModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddColModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-4">Add Custom Column</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Column Name</label>
                <input
                  autoFocus
                  className="brand-input w-full"
                  placeholder="e.g. Notes, Priority…"
                  value={newColForm.label}
                  onChange={e => setNewColForm(f => ({ ...f, label: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Column Type</label>
                <select
                  className="brand-input w-full"
                  value={newColForm.type}
                  onChange={e => setNewColForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option>Text</option>
                  <option>Number</option>
                  <option>Date</option>
                  <option>Checkbox</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Apply to</label>
                <div className="flex gap-3">
                  {[{ v: 'board', l: 'This production' }, { v: 'global', l: 'All productions' }].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="colScope"
                        value={v}
                        checked={newColForm.scope === v}
                        onChange={() => setNewColForm(f => ({ ...f, scope: v }))}
                        className="accent-blue-600"
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setShowAddColModal(false)} className="text-xs px-3 py-1.5 rounded-lg border text-gray-500 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleAddColumn}
                disabled={!newColForm.label.trim()}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              >Add Column</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetRow({ item, isEditor, production, fmt, fmtRow, editingCell, setEditingCell, onUpdate, onDelete, onInvoice, onContract, lineItemTypes, lineItemStatuses, hiddenCols = [], customCols = [], onOpenCastModal, onPhotoFullscreen, ccChildren = [], isExpanded, onToggleExpand, isNew }) {
  const vis = key => !hiddenCols.includes(key);
  const diff = (parseFloat(item.planned_budget) || 0) - (parseFloat(item.actual_spent) || 0);
  const isEditing = (field) => editingCell?.itemId === item.id && editingCell?.field === field;
  const contractKey = production ? `${production.id}_li_${item.id}` : null;
  const [contract, setContract] = useState(null);
  useEffect(() => {
    if (!contractKey) return;
    const result = getContract(contractKey);
    if (result && typeof result.then === 'function') {
      result.then(data => setContract(data)).catch(() => {});
    } else {
      setContract(result);
    }
  }, [contractKey]);

  function cell(field, children, className) {
    if (!isEditor) return <td className={className}>{children}</td>;
    return (
      <td
        className={clsx(className, 'cursor-pointer hover:bg-blue-50 transition-colors')}
        onClick={() => setEditingCell({ itemId: item.id, field })}
      >
        {isEditing(field) ? (
          <InlineEdit
            value={item[field]}
            onSave={v => onUpdate(item.id, field, v)}
            type={field === 'planned_budget' || field === 'actual_spent' ? 'number' : 'text'}
          />
        ) : children}
      </td>
    );
  }

  // Invoice cell — state driven
  const invStatus = item.invoice_status;
  const invUrl    = item.invoice_url;
  const dlUrl     = getDownloadUrl(invUrl);

  function InvoiceCell() {
    if (invStatus === 'Received' && invUrl) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={10} /> Received
          </span>
          {item.invoice_type && (
            <span className="text-[10px] text-gray-400">{item.invoice_type}</span>
          )}
          <div className="flex items-center gap-2 mt-0.5" onClick={e => e.stopPropagation()}>
            <CloudLinks {...detectCloudUrl(invUrl, item.drive_url, item.dropbox_url)} />
            {isEditor && (
              <button
                onClick={e => { e.stopPropagation(); onInvoice(item.id, 'receive'); }}
                className="text-gray-300 hover:text-gray-500 text-xs"
                title="Edit / re-log invoice"
              >
                ✏
              </button>
            )}
          </div>
        </div>
      );
    }

    if (invStatus === 'Received' && !invUrl) {
      return (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={10} /> Received
          </span>
          {isEditor && (
            <button
              onClick={e => { e.stopPropagation(); onInvoice(item.id, 'receive'); }}
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              ✏ Add link
            </button>
          )}
        </div>
      );
    }

    if (invStatus === 'Pending') {
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-orange-500">⏳ Requested</span>
          {isEditor && (
            <button
              onClick={e => { e.stopPropagation(); onInvoice(item.id, 'receive'); }}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap"
            >
              Mark Received
            </button>
          )}
        </div>
      );
    }

    // No invoice yet
    return isEditor ? (
      <button
        onClick={e => { e.stopPropagation(); onInvoice(item.id, 'request'); }}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all hover:bg-blue-50 text-blue-600 border-blue-200"
      >
        <Mail size={11} /> Request
      </button>
    ) : (
      <span className="text-gray-300 text-xs">—</span>
    );
  }

  return (
    <tr
      className={isNew ? 'animate-[budget-row-flash_1.5s_ease-out]' : ''}
      style={isNew ? { background: 'rgba(59,130,246,0.08)' } : undefined}
    >
      {cell('item',
        <div className="flex items-center gap-2">
          {ccChildren.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
              className="shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
              title={`${ccChildren.length} CC purchase${ccChildren.length > 1 ? 's' : ''}`}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          )}
          {item.type === 'Cast' && (
            item.cast_photo_url ? (
              <img
                src={getDriveThumbnail(item.cast_photo_url, 200) || item.cast_photo_url}
                alt={item.full_name || 'cast'}
                className="w-7 h-7 rounded-full object-cover cursor-pointer shrink-0 border border-gray-200"
                onClick={e => { e.stopPropagation(); onPhotoFullscreen?.(item.cast_photo_url); }}
                onError={e => { if (e.target.src !== item.cast_photo_url) e.target.src = item.cast_photo_url; }}
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                <User size={12} className="text-gray-400" />
              </div>
            )
          )}
          {item.item || <span className="text-gray-300">—</span>}
        </div>
      )}
      {vis('full_name') && cell('full_name', item.full_name || <span className="text-gray-300">—</span>)}
      {vis('planned_budget') && cell('planned_budget', (
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{fmtRow(item.planned_budget, item.currency_code || 'USD')}</span>
          {isEditor && (
            <button
              onClick={e => { e.stopPropagation(); onUpdate(item.id, 'currency_code', (item.currency_code || 'USD') === 'ILS' ? 'USD' : 'ILS'); }}
              className="text-[9px] px-1 py-0.5 rounded border border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors shrink-0"
              title="Toggle currency for this row"
            >
              {(item.currency_code || 'USD') === 'ILS' ? '₪' : '$'}
            </button>
          )}
        </div>
      ))}

      {/* Type */}
      {vis('type') && <td>
        {isEditor ? (
          <select
            value={item.type}
            onChange={e => {
              const newType = e.target.value;
              if (newType === 'Cast') {
                onOpenCastModal?.(item);
              } else {
                onUpdate(item.id, 'type', newType);
              }
            }}
            className="text-xs border-0 bg-transparent outline-none cursor-pointer font-medium"
          >
            {lineItemTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        ) : (
          <span className={clsx('badge', TYPE_CLASSES[item.type])}>{item.type}</span>
        )}
      </td>}

      {/* Status */}
      {vis('status') && <td>
        {isEditor ? (
          <select
            value={item.status}
            onChange={e => onUpdate(item.id, 'status', e.target.value)}
            className="text-xs border-0 bg-transparent outline-none cursor-pointer font-medium"
          >
            {lineItemStatuses.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : (
          <span className={clsx('badge', STATUS_CLASSES[item.status])}>{item.status}</span>
        )}
      </td>}

      {/* Timeline */}
      {vis('timeline') && <td className="text-xs text-gray-500">
        {isEditor ? (
          <div className="flex gap-1 items-center">
            <input
              type="date"
              value={item.timeline_start || ''}
              onChange={e => onUpdate(item.id, 'timeline_start', e.target.value)}
              className="border rounded px-1 py-0.5 text-xs outline-none"
              style={{ borderColor: 'var(--brand-border)' }}
            />
            <span>→</span>
            <input
              type="date"
              value={item.timeline_end || ''}
              onChange={e => onUpdate(item.id, 'timeline_end', e.target.value)}
              className="border rounded px-1 py-0.5 text-xs outline-none"
              style={{ borderColor: 'var(--brand-border)' }}
            />
          </div>
        ) : (
          item.timeline_start ? `${item.timeline_start} → ${item.timeline_end || '?'}` : '—'
        )}
      </td>}

      {vis('actual_spent') && cell('actual_spent', <span>{fmtRow(item.actual_spent, item.currency_code || 'USD')}</span>)}

      {/* Difference */}
      {vis('difference') && <td className={clsx('font-semibold', diff >= 0 ? 'diff-positive' : 'diff-negative')}>
        {diff >= 0 ? '+' : ''}{fmtRow(Math.abs(diff), item.currency_code || 'USD')}
      </td>}

      {/* Invoice — state driven */}
      {vis('invoice') && <td><InvoiceCell /></td>}

      {/* Contract */}
      {vis('contract') && <td>
        {contract ? (
          <div className="flex flex-col gap-0.5">
            <button
              onClick={onContract}
              className={clsx(
                'flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all w-fit',
                contract.status === 'signed' ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' :
                contract.status === 'sent'   ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' :
                contract.status === 'awaiting_hocp' ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' :
                'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              )}
            >
              <FileSignature size={11} />
              {contract.status === 'signed' ? '✓ Signed' :
               contract.status === 'sent'   ? '⏳ Sent' :
               contract.status === 'awaiting_hocp' ? '🖊️ HOCP' : 'Pending'}
            </button>
            {contract.status === 'signed' && (contract.drive_url || contract.pdf_url) && (
              <CloudLinks {...detectCloudUrl(contract.drive_url || contract.pdf_url, contract.drive_url, contract.dropbox_url)} />
            )}
          </div>
        ) : (
          <button
            onClick={onContract}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border transition-all hover:bg-purple-50 text-purple-600 border-purple-200"
          >
            <FileSignature size={11} />
            Contract
          </button>
        )}
      </td>}

      {/* Custom columns */}
      {customCols.map(col => (
        <td key={col.key}>
          {col.type === 'Checkbox' ? (
            <input
              type="checkbox"
              checked={!!item[col.key]}
              onChange={e => isEditor && onUpdate(item.id, col.key, e.target.checked)}
              disabled={!isEditor}
              className="accent-blue-600 cursor-pointer"
            />
          ) : col.type === 'Date' ? (
            <input
              type="date"
              value={item[col.key] || ''}
              onChange={e => isEditor && onUpdate(item.id, col.key, e.target.value)}
              readOnly={!isEditor}
              className="text-xs border rounded px-1 py-0.5 outline-none w-full"
              style={{ borderColor: 'var(--brand-border)' }}
            />
          ) : col.type === 'Number' ? (
            <input
              type="number"
              value={item[col.key] ?? ''}
              onChange={e => isEditor && onUpdate(item.id, col.key, e.target.value)}
              readOnly={!isEditor}
              className="text-xs border rounded px-1 py-0.5 outline-none w-20"
              style={{ borderColor: 'var(--brand-border)' }}
            />
          ) : (
            <input
              type="text"
              value={item[col.key] || ''}
              onChange={e => isEditor && onUpdate(item.id, col.key, e.target.value)}
              readOnly={!isEditor}
              placeholder="—"
              className="text-xs border rounded px-1 py-0.5 outline-none w-full"
              style={{ borderColor: 'var(--brand-border)' }}
            />
          )}
        </td>
      ))}

      {/* Delete */}
      {isEditor && (
        <td>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </td>
      )}
    </tr>
  );
}

function BudgetTh({ label, colKey, sortState, onSort, minWidth }) {
  const active = sortState?.col === colKey;
  return (
    <th style={{ minWidth }}>
      {colKey ? (
        <button onClick={() => onSort(colKey)} className="flex items-center gap-1 group">
          {label}
          <span className={clsx('transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')}>
            {active && sortState.dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        </button>
      ) : label}
    </th>
  );
}

// ── CC Purchase sub-row ──────────────────────────────────────────────────────
function CCSubRow({ cc, totalCols }) {
  const statusColor = cc.approval_status === 'Approved' ? 'text-green-600 bg-green-50 border-green-200'
    : cc.approval_status === 'Rejected' ? 'text-red-600 bg-red-50 border-red-200'
    : 'text-orange-500 bg-orange-50 border-orange-200';
  // CC amounts are always in ILS (CC form is ILS-only)
  const amountWoVat = cc.amount_without_vat || 0;
  const amountTotal = cc.total_amount || 0;
  return (
    <tr className="bg-blue-50/60" style={{ borderLeft: '3px solid #3b82f6' }}>
      <td colSpan={totalCols} className="px-4 py-2">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <CreditCard size={12} className="text-blue-400 shrink-0" />
          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-bold text-[10px] border border-blue-200 shrink-0">
            💳 CC · ILS
          </span>
          <span className="font-semibold text-gray-700">{cc.store_name}</span>
          {cc.description && <span className="text-gray-500">{cc.description}</span>}
          <span className="font-medium text-blue-700">
            ₪{amountWoVat.toLocaleString()}
            <span className="text-gray-400 font-normal"> excl. VAT</span>
          </span>
          {amountTotal > 0 && amountWoVat !== amountTotal && (
            <span className="text-gray-400">(₪{amountTotal.toLocaleString()} incl.)</span>
          )}
          {cc.purchaser_name && <span className="text-gray-400">by {cc.purchaser_name}</span>}
          {cc.purchase_date && <span className="text-gray-400">{cc.purchase_date.slice(0, 10)}</span>}
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${statusColor}`}>
            {cc.approval_status || 'Pending'}
          </span>
          {cc.approval_status === 'Approved' && (
            <span className="text-[10px] text-green-600 italic">· added to actual</span>
          )}
          {cc.receipt_url && (
            <a href={cc.receipt_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="flex items-center gap-0.5 text-blue-500 hover:underline">
              <ExternalLink size={10} /> Receipt
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function CastModalFromBudget({ item, production, onSave, onClose }) {
  const defaultStart = production?.delivery_date || production?.planned_end || '';
  const [form, setForm] = useState({
    name: item.full_name || item.item || '',
    role: 'Model',
    period: 'Perpetually',
    start_date: defaultStart,
    end_date: '',
    warning_date: '',
    usage: [],
    contract_manager_name: '',
    notes: '',
  });
  const [photoPreview, setPhotoPreview] = useState(item.cast_photo_url || '');
  const [photoUrl, setPhotoUrl] = useState(item.cast_photo_url || '');
  const fileInputRef = useRef(null);

  function setField(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calc end_date + warning_date when period or start_date changes
      if (field === 'period' || field === 'start_date') {
        const end = calcCastEndDate(next.start_date, next.period);
        next.end_date = end;
        next.warning_date = calcWarningDate(end);
      }
      if (field === 'end_date') {
        next.warning_date = calcWarningDate(value);
      }
      return next;
    });
  }

  function toggleUsage(u) {
    setForm(prev => ({
      ...prev,
      usage: prev.usage.includes(u) ? prev.usage.filter(x => x !== u) : [...prev.usage, u],
    }));
  }

  function handlePhotoFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      setPhotoPreview(e.target.result);
      setPhotoUrl(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoUrlInput(url) {
    setPhotoUrl(url);
    setPhotoPreview(url);
  }

  function handleSave() {
    if (!form.name.trim()) { alert('Name is required'); return; }
    onSave(form, photoUrl);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Add Cast Member</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-4">
            {photoPreview ? (
              <img src={photoPreview} alt="preview" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                <User size={20} className="text-gray-400" />
              </div>
            )}
            <div className="flex-1 space-y-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
              >
                <Upload size={11} /> Upload Photo (≤2MB)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handlePhotoFile(e.target.files?.[0])}
              />
              <input
                type="url"
                placeholder="Or paste image URL…"
                className="w-full border rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                value={photoUrl.startsWith('data:') ? '' : photoUrl}
                onChange={e => handlePhotoUrlInput(e.target.value)}
              />
            </div>
          </div>

          {/* Name + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Name *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={form.name}
                onChange={e => setField('name', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Role</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                value={form.role}
                onChange={e => setField('role', e.target.value)}
              >
                {CAST_ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Period + Start Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Period</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                value={form.period}
                onChange={e => setField('period', e.target.value)}
              >
                {CAST_PERIODS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Start Date
                {defaultStart && <span className="ml-1 text-[10px] text-blue-400 font-normal">(from Gantt)</span>}
              </label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={form.start_date}
                onChange={e => setField('start_date', e.target.value)}
              />
            </div>
          </div>

          {/* End date + Warning (computed, non-Perpetually) */}
          {form.period !== 'Perpetually' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">End Date</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                  value={form.end_date}
                  onChange={e => setField('end_date', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Warning Date
                  <span className="ml-1 text-[10px] text-orange-400 font-normal">1 month before end</span>
                </label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-orange-50 border-orange-200 outline-none"
                  value={form.warning_date}
                  readOnly
                />
              </div>
            </div>
          )}

          {/* Usage */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Usage Rights</label>
            <div className="flex flex-wrap gap-2">
              {CAST_USAGE_OPTIONS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => toggleUsage(u)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                    form.usage.includes(u)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Contract Manager */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Contract Manager</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Name of person managing this contract"
              value={form.contract_manager_name}
              onChange={e => setField('contract_manager_name', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg border">Cancel</button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Save Cast Member
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineEdit({ value, onSave, type = 'text' }) {
  const [val, setVal] = useState(String(value ?? ''));
  return (
    <input
      type={type}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSave(type === 'number' ? parseFloat(val) || 0 : val)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(type === 'number' ? parseFloat(val) || 0 : val); }}
      autoFocus
      className="w-full border-b-2 outline-none bg-transparent text-sm"
      style={{ borderColor: 'var(--brand-accent)', minWidth: 60 }}
    />
  );
}
