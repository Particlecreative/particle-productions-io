import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Link as LinkIcon, Mail, Check, Download, MessageCircle, AlertTriangle } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { getProductions, getAllLineItems, updateLineItem, getReceipts, updateReceipt } from '../lib/dataService';
import { getDownloadUrl } from '../lib/invoiceUtils';
import { formatDateIST } from '../lib/timezone';
import InvoiceModal from '../components/production/InvoiceModal';
import ExportMenu from '../components/ui/ExportMenu';
import { CloudLinks, detectCloudUrl } from '../components/shared/FileUploadButton';
import clsx from 'clsx';

const INVOICE_STATUS = ['Pending', 'Received'];

const INV_TYPE_LABELS = {
  cheshbon_iska:       'חשבון עסקה',
  receipt:             'קבלה',
  tax_invoice:         'חשבונית מס',
  tax_invoice_receipt: 'חשבונית מס/קבלה',
  sachar_omanim:       'שכר אומנים',
  proforma:            'Proforma',
  Israeli:             'Israeli',
  American:            'American',
  Other:               'Other',
};

const RECEIPT_REMINDER_HOURS = 48;

export default function Invoices() {
  const { brandId } = useBrand();
  const { fmt } = useCurrency();
  const { isEditor } = useAuth();
  const { addNotification } = useNotifications();

  const [tab, setTab] = useState('invoices'); // 'invoices' | 'receipts'
  const [productions, setProductions] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [filter, setFilter] = useState('');
  const [filterProd, setFilterProd] = useState('');
  const [filterPrdId, setFilterPrdId] = useState('');
  const [invModal, setInvModal] = useState(null); // { lineItemId, productionId, step }
  const [bannerExpanded, setBannerExpanded] = useState(false);

  useEffect(() => { loadData(); }, [brandId]);

  async function loadData() {
    const prods = await Promise.resolve(getProductions(brandId));
    const prodsArr = Array.isArray(prods) ? prods : [];
    setProductions(prodsArr);
    const prodIds = new Set(prodsArr.map(p => p.id));
    const [items, receiptsRes] = await Promise.all([
      Promise.resolve(getAllLineItems()),
      Promise.resolve(getReceipts()),
    ]);
    setAllItems((Array.isArray(items) ? items : []).filter(li => prodIds.has(li.production_id)));
    setReceipts(Array.isArray(receiptsRes) ? receiptsRes : []);
  }

  function handleReceiptUrlUpdate(receiptId, url) {
    updateReceipt(receiptId, { receipt_url: url });
    loadData();
  }

  function handleStatusChange(id, status) {
    const item = allItems.find(i => i.id === id);
    updateLineItem(id, { invoice_status: status });
    const prod = productions.find(p => p.id === item?.production_id);
    addNotification('invoice_received',
      `Invoice status set to "${status}" for ${item?.item || item?.full_name || id} in ${prod?.project_name || item?.production_id}`,
      item?.production_id
    );
    loadData();
  }

  function handleInvoiceUrlUpdate(id, url) {
    const item = allItems.find(i => i.id === id);
    updateLineItem(id, {
      invoice_url: url,
      invoice_status: item?.invoice_status || (url ? 'Received' : ''),
    });
    const prod = productions.find(p => p.id === item?.production_id);
    addNotification('invoice_received',
      `Invoice URL set for ${item?.item || item?.full_name || id} in ${prod?.project_name || item?.production_id}`,
      item?.production_id
    );
    loadData();
  }

  function handleAction(lineItemId, productionId, step) {
    if (step === 'request') {
      // Mark as Pending before opening modal
      updateLineItem(lineItemId, { invoice_status: 'Pending' });
      loadData();
      setInvModal({ lineItemId, productionId, step: 'send' });
    } else {
      setInvModal({ lineItemId, productionId, step });
    }
  }

  // Summary stats
  const pendingItems  = useMemo(() => allItems.filter(i => !i.invoice_status || i.invoice_status === 'Pending'), [allItems]);
  const receivedItems = useMemo(() => allItems.filter(i => i.invoice_status === 'Received'), [allItems]);
  const getAmount = (i) => parseFloat(i.actual_spent) || parseFloat(i.planned_budget) || 0;
  const pendingTotal  = useMemo(() => pendingItems.reduce((s, i) => s + getAmount(i), 0), [pendingItems]);
  const receivedTotal = useMemo(() => receivedItems.reduce((s, i) => s + getAmount(i), 0), [receivedItems]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let list = allItems;
    if (filterProd) list = list.filter(i => i.production_id === filterProd);
    if (filterPrdId) {
      const q = filterPrdId.toLowerCase();
      list = list.filter(i => (i.production_id || '').toLowerCase().includes(q));
    }
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(i =>
        (i.item || '').toLowerCase().includes(q) ||
        (i.full_name || '').toLowerCase().includes(q) ||
        (productions.find(p => p.id === i.production_id)?.project_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allItems, filter, filterProd, filterPrdId, productions]);

  // By production groups — Received items sink to bottom within each group
  const byProduction = useMemo(() => {
    const map = {};
    filteredItems.forEach(item => {
      if (!map[item.production_id]) {
        map[item.production_id] = {
          production: productions.find(p => p.id === item.production_id),
          items: [],
        };
      }
      map[item.production_id].items.push(item);
    });
    // Sort each group: non-Received first, Received last
    Object.values(map).forEach(group => {
      group.items.sort((a, b) => {
        const aReceived = a.invoice_status === 'Received' ? 1 : 0;
        const bReceived = b.invoice_status === 'Received' ? 1 : 0;
        return aReceived - bReceived;
      });
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems, productions]);

  const hasFilters = filter || filterProd || filterPrdId;

  // 48-hour overdue receipt reminder
  const overdueReceipts = useMemo(() => {
    const now = Date.now();
    return receipts.filter(r =>
      !r.receipt_url &&
      r.paid_at &&
      (now - new Date(r.paid_at).getTime()) >= RECEIPT_REMINDER_HOURS * 3600 * 1000
    ).map(r => {
      const item = allItems.find(i => i.id === r.line_item_id);
      const prod = productions.find(p => p.id === r.production_id);
      const daysSince = Math.floor((now - new Date(r.paid_at).getTime()) / (24 * 3600 * 1000));
      return { ...r, item, prod, daysSince };
    });
  }, [receipts, allItems, productions]);

  const INVOICES_EXPORT_COLS = [
    { key: 'production_id', label: 'Production' },
    { key: 'item', label: 'Item' },
    { key: 'full_name', label: 'Name' },
    { key: 'actual_spent', label: 'Amount' },
    { key: 'invoice_status', label: 'Invoice Status' },
    { key: 'invoice_url', label: 'Invoice URL' },
    { key: 'invoice_type', label: 'Invoice Type' },
    { key: 'payment_due', label: 'Payment Due' },
    { key: 'payment_status', label: 'Pay Status' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Invoices
        </h1>
        <ExportMenu rows={filteredItems} columns={INVOICES_EXPORT_COLS} filename="invoices" title="Invoices" />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-5">
        {[
          { id: 'invoices', label: '📄 Invoices' },
          { id: 'receipts', label: `🧾 Receipts (חשבוניות מס)${receipts.length > 0 ? ` · ${receipts.length}` : ''}` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-semibold border transition-all',
              tab === t.id ? 'border-transparent text-white' : 'border-gray-200 text-gray-500 bg-white hover:bg-gray-50'
            )}
            style={tab === t.id ? { background: 'var(--brand-accent)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 48h Receipt Reminder Banner */}
      {overdueReceipts.length > 0 && (
        <div className="mb-5 rounded-xl border border-orange-300 bg-orange-50 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            onClick={() => setBannerExpanded(e => !e)}
          >
            <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-orange-800 flex-1">
              ⚠️ {overdueReceipts.length} payment{overdueReceipts.length > 1 ? 's' : ''} require{overdueReceipts.length === 1 ? 's' : ''} חשבונית מס/קבלה — 48+ hours since payment
            </span>
            <span className="text-xs text-orange-500">{bannerExpanded ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {bannerExpanded && (
            <div className="border-t border-orange-200 divide-y divide-orange-100">
              {overdueReceipts.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {r.item?.full_name || r.item?.item || r.supplier_name || '—'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.prod?.project_name || r.production_id} · {fmt(r.item?.actual_spent || r.amount || 0)} · {r.daysSince} day{r.daysSince !== 1 ? 's' : ''} since payment
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {r.item?.full_name && (
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`שלום ${r.item.full_name}, אנא שלח/י חשבונית מס/קבלה עבור תשלום של ₪${(r.item?.actual_spent || r.amount || 0).toLocaleString()} מתאריך ${new Date(r.paid_at).toLocaleDateString('he-IL')}.`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap"
                      >
                        <MessageCircle size={11} /> WhatsApp
                      </a>
                    )}
                    <span
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-orange-200 text-orange-600 cursor-pointer hover:bg-orange-100 whitespace-nowrap"
                      onClick={() => setTab('receipts')}
                    >
                      View in Receipts →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── INVOICES TAB ── */}
      {tab === 'invoices' && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="brand-card border-l-4 border-orange-400">
              <div className="text-xs text-gray-400 mb-1">Pending</div>
              <div className="text-xl font-black text-orange-700">{fmt(pendingTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{pendingItems.length} items</div>
            </div>
            <div className="brand-card border-l-4 border-green-400">
              <div className="text-xs text-gray-400 mb-1">Received</div>
              <div className="text-xl font-black text-green-700">{fmt(receivedTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{receivedItems.length} items</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <input
              className="brand-input"
              style={{ width: 200 }}
              placeholder="Search…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <input
              className="brand-input"
              style={{ width: 140 }}
              placeholder="PRD number…"
              value={filterPrdId}
              onChange={e => setFilterPrdId(e.target.value)}
            />
            <select
              className="brand-input"
              style={{ width: 180 }}
              value={filterProd}
              onChange={e => setFilterProd(e.target.value)}
            >
              <option value="">All productions</option>
              {productions.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
            </select>
            {hasFilters && (
              <button
                className="text-xs text-blue-500 hover:underline"
                onClick={() => { setFilter(''); setFilterProd(''); setFilterPrdId(''); }}
              >
                Clear filters
              </button>
            )}
            <div className="ml-auto text-sm text-gray-400">{filteredItems.length} items</div>
          </div>

          {/* BY PRODUCTION */}
          <div className="space-y-3">
            {byProduction.length === 0 ? (
              <div className="brand-card text-center py-16 text-gray-300 text-sm">No items found</div>
            ) : byProduction.map(([prodId, data]) => (
              <InvoiceProductionGroup
                key={prodId}
                data={data}
                fmt={fmt}
                isEditor={isEditor}
                receipts={receipts}
                onStatusChange={handleStatusChange}
                onInvoiceUrlUpdate={handleInvoiceUrlUpdate}
                onAction={handleAction}
              />
            ))}
          </div>
        </>
      )}

      {/* ── RECEIPTS TAB ── */}
      {tab === 'receipts' && (
        <ReceiptsTab
          receipts={receipts}
          allItems={allItems}
          productions={productions}
          fmt={fmt}
          isEditor={isEditor}
          onReceiptUrlUpdate={handleReceiptUrlUpdate}
        />
      )}

      {/* Invoice Modal */}
      {invModal && (
        <InvoiceModal
          lineItemId={invModal.lineItemId}
          productionId={invModal.productionId}
          initialStep={invModal.step}
          onClose={() => { setInvModal(null); loadData(); }}
        />
      )}
    </div>
  );
}

// ─── Production group (collapsible) ──────────────────────────────────────────

function InvoiceProductionGroup({ data, fmt, isEditor, receipts = [], onStatusChange, onInvoiceUrlUpdate, onAction }) {
  const [expanded, setExpanded] = useState(true);
  const total = data.items.reduce((s, i) => s + (parseFloat(i.actual_spent) || parseFloat(i.planned_budget) || 0), 0);
  const invoicedCount = data.items.filter(i => i.invoice_url || i.invoice_status).length;

  return (
    <div className="brand-card">
      <button className="w-full flex items-center justify-between" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          {expanded
            ? <ChevronDown size={14} className="text-gray-400" />
            : <ChevronRight size={14} className="text-gray-400" />}
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--brand-secondary)' }}>
            {data.production?.id || ''}
          </span>
          <span className="font-semibold text-gray-800">{data.production?.project_name || '—'}</span>
          <span className="text-xs text-gray-400">{data.items.length} items</span>
          {invoicedCount > 0 && (
            <span className="text-xs text-green-600 font-semibold">{invoicedCount} invoiced</span>
          )}
        </div>
        <span className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>{fmt(total)}</span>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
          <InvoiceTable
            items={data.items}
            productions={data.production ? [data.production] : []}
            fmt={fmt}
            isEditor={isEditor}
            showProduction={false}
            receipts={receipts}
            onStatusChange={onStatusChange}
            onInvoiceUrlUpdate={onInvoiceUrlUpdate}
            onAction={onAction}
          />
        </div>
      )}
    </div>
  );
}

// ─── Shared table ─────────────────────────────────────────────────────────────

function InvoiceTable({ items, productions, fmt, isEditor, showProduction, receipts = [], onStatusChange, onInvoiceUrlUpdate, onAction }) {
  const colCount = showProduction ? 7 : 6;
  return (
    <table className="data-table" style={{ minWidth: showProduction ? 960 : 800 }}>
      <thead>
        <tr>
          {showProduction && <th>Production</th>}
          <th>Name</th>
          <th>Role / Item</th>
          <th>Amount</th>
          <th style={{ minWidth: 180 }}>Invoice</th>
          <th>Inv. Status</th>
          <th>Payment Due</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={colCount} className="text-center py-8 text-gray-400 text-sm">No items</td>
          </tr>
        ) : items.map(item => (
          <InvoiceRow
            key={item.id}
            item={item}
            productionName={productions.find(p => p.id === item.production_id)?.project_name}
            fmt={fmt}
            isEditor={isEditor}
            showProduction={showProduction}
            receipt={receipts.find(r => r.line_item_id === item.id)}
            onStatusChange={onStatusChange}
            onInvoiceUrlUpdate={onInvoiceUrlUpdate}
            onAction={onAction}
          />
        ))}
      </tbody>
    </table>
  );
}

// ─── Receipts Tab (חשבוניות מס) ───────────────────────────────────────────────

function ReceiptsTab({ receipts, allItems, productions, fmt, isEditor, onReceiptUrlUpdate }) {
  const [editingId, setEditingId]   = useState(null);
  const [urlVal, setUrlVal]         = useState('');
  const now = Date.now();

  function formatTimeSince(paid_at) {
    if (!paid_at) return '—';
    const ms    = now - new Date(paid_at).getTime();
    const hours = Math.floor(ms / (3600 * 1000));
    const days  = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    return `${hours}h ago`;
  }

  function saveUrl(receiptId) {
    if (urlVal.trim()) onReceiptUrlUpdate(receiptId, urlVal.trim());
    setEditingId(null);
    setUrlVal('');
  }

  if (receipts.length === 0) {
    return (
      <div className="brand-card text-center py-16 text-gray-300">
        <div className="text-4xl mb-3">🧾</div>
        <div className="text-sm font-semibold">No חשבוניות מס records yet</div>
        <div className="text-xs mt-1 text-gray-300">Records appear here when a חשבון עסקה payment is marked Paid</div>
      </div>
    );
  }

  const enriched = receipts.map(r => {
    const item = allItems.find(i => i.id === r.line_item_id);
    const prod = productions.find(p => p.id === r.production_id);
    return { ...r, item, prod };
  }).sort((a, b) => {
    // pending first, then by paid_at descending
    if (!a.receipt_url && b.receipt_url) return -1;
    if (a.receipt_url && !b.receipt_url) return 1;
    return new Date(b.paid_at) - new Date(a.paid_at);
  });

  const pendingCount  = enriched.filter(r => !r.receipt_url).length;
  const resolvedCount = enriched.filter(r =>  r.receipt_url).length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="brand-card border-l-4 border-orange-400">
          <div className="text-xs text-gray-400 mb-1">Pending Receipts</div>
          <div className="text-xl font-black text-orange-600">{pendingCount}</div>
        </div>
        <div className="brand-card border-l-4 border-green-400">
          <div className="text-xs text-gray-400 mb-1">Resolved</div>
          <div className="text-xl font-black text-green-600">{resolvedCount}</div>
        </div>
      </div>

      {/* Table */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
        <table className="data-table" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>Production</th>
              <th>Supplier</th>
              <th>Amount</th>
              <th>Paid Date</th>
              <th>Time Since</th>
              <th style={{ minWidth: 220 }}>Receipt Doc</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map(r => {
              const isOverdue = !r.receipt_url && r.paid_at &&
                (now - new Date(r.paid_at).getTime()) >= RECEIPT_REMINDER_HOURS * 3600 * 1000;
              return (
                <tr
                  key={r.id}
                  className={r.receipt_url ? 'bg-green-50' : isOverdue ? 'bg-orange-50' : ''}
                >
                  {/* Production */}
                  <td className="text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>
                    {r.prod?.project_name || r.production_id || '—'}
                  </td>
                  {/* Supplier */}
                  <td className="text-sm font-medium">
                    {r.item?.full_name || r.supplier_name || '—'}
                  </td>
                  {/* Amount */}
                  <td className="font-semibold">
                    {fmt(r.item?.actual_spent || r.amount || 0)}
                  </td>
                  {/* Paid Date */}
                  <td className="text-xs text-gray-500 whitespace-nowrap">
                    {r.paid_at ? new Date(r.paid_at).toLocaleDateString('he-IL') : '—'}
                  </td>
                  {/* Time Since */}
                  <td className={clsx(
                    'text-xs whitespace-nowrap',
                    isOverdue ? 'text-orange-600 font-semibold' : 'text-gray-400'
                  )}>
                    {formatTimeSince(r.paid_at)}{isOverdue ? ' ⚠️' : ''}
                  </td>
                  {/* Receipt Doc */}
                  <td>
                    {r.receipt_url ? (
                      <div className="flex items-center gap-1.5">
                        <a
                          href={r.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-green-700 hover:underline font-semibold"
                        >
                          <Download size={10} /> View Doc ✓
                        </a>
                        {isEditor && (
                          <button
                            onClick={() => { setEditingId(r.id); setUrlVal(r.receipt_url); }}
                            className="text-gray-300 hover:text-gray-500 text-xs"
                            title="Edit URL"
                          >✏</button>
                        )}
                      </div>
                    ) : editingId === r.id ? (
                      <input
                        autoFocus
                        className="text-xs border rounded px-2 py-1 outline-none w-full"
                        style={{ borderColor: 'var(--brand-accent)' }}
                        value={urlVal}
                        onChange={e => setUrlVal(e.target.value)}
                        onBlur={() => saveUrl(r.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveUrl(r.id);
                          if (e.key === 'Escape') { setEditingId(null); setUrlVal(''); }
                        }}
                        placeholder="Paste Google Drive / Dropbox link…"
                      />
                    ) : (
                      <button
                        onClick={() => isEditor && (setEditingId(r.id), setUrlVal(''))}
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded border font-semibold transition-all',
                          isEditor
                            ? 'cursor-pointer hover:bg-orange-100 text-orange-600 bg-orange-50 border-orange-200'
                            : 'cursor-default text-orange-500 bg-orange-50 border-orange-200'
                        )}
                      >
                        ⚠ Missing{isEditor ? ' — Click to add' : ''}
                      </button>
                    )}
                  </td>
                  {/* Status */}
                  <td>
                    {r.receipt_url ? (
                      <span className="text-xs font-semibold text-green-700 bg-green-100 border border-green-200 rounded px-1.5 py-0.5">
                        ✓ Resolved
                      </span>
                    ) : (
                      <span className={clsx(
                        'text-xs font-semibold rounded px-1.5 py-0.5 border',
                        isOverdue
                          ? 'text-orange-700 bg-orange-100 border-orange-300'
                          : 'text-yellow-600 bg-yellow-50 border-yellow-200'
                      )}>
                        {isOverdue ? '⚠ Overdue' : '⏳ Pending'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ─── Single invoice row ───────────────────────────────────────────────────────

function InvoiceRow({ item, productionName, fmt, isEditor, showProduction, receipt, onStatusChange, onInvoiceUrlUpdate, onAction }) {
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlVal, setUrlVal] = useState(item.invoice_url || '');

  function saveUrl() {
    if (urlVal !== (item.invoice_url || '')) onInvoiceUrlUpdate(item.id, urlVal);
    setEditingUrl(false);
  }

  const invStatus = item.invoice_status;
  const invUrl    = item.invoice_url;
  const dlUrl     = getDownloadUrl(invUrl);

  // State-driven invoice cell content
  function InvoiceCell() {
    if (editingUrl) {
      return (
        <input
          autoFocus
          className="text-xs border rounded px-2 py-1 outline-none"
          style={{ borderColor: 'var(--brand-border)', width: 180 }}
          value={urlVal}
          onChange={e => setUrlVal(e.target.value)}
          onBlur={saveUrl}
          onKeyDown={e => {
            if (e.key === 'Enter') saveUrl();
            if (e.key === 'Escape') setEditingUrl(false);
          }}
          placeholder="Paste Google Drive / Dropbox link…"
        />
      );
    }

    if (invStatus === 'Received' && invUrl) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
            <Check size={10} /> Received
          </span>
          {item.invoice_type && (
            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
              {INV_TYPE_LABELS[item.invoice_type] || item.invoice_type}
            </span>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <CloudLinks {...detectCloudUrl(invUrl, item.drive_url, item.dropbox_url)} />
            {isEditor && (
              <button
                onClick={() => { setUrlVal(invUrl); setEditingUrl(true); }}
                className="text-gray-300 hover:text-gray-500 text-xs"
                title="Edit link"
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
              onClick={() => onAction(item.id, item.production_id, 'receive')}
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              <LinkIcon size={10} /> Add link
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
              onClick={() => onAction(item.id, item.production_id, 'receive')}
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
        onClick={() => onAction(item.id, item.production_id, 'request')}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium transition-all whitespace-nowrap"
      >
        <Mail size={11} /> Request Invoice
      </button>
    ) : (
      <span className="text-gray-300 text-xs">—</span>
    );
  }

  // Row background: cheshbon_iska + paid takes priority
  const trClass = clsx(
    item.invoice_type === 'cheshbon_iska' && item.payment_status === 'Paid'
      ? receipt?.receipt_url ? 'bg-green-50' : 'bg-orange-50'
      : invStatus === 'Received' ? 'opacity-60' : ''
  );

  return (
    <tr className={trClass}>
      {showProduction && (
        <td className="text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>
          {productionName || item.production_id}
        </td>
      )}

      {/* Name */}
      <td className="font-medium text-sm">{item.full_name || '—'}</td>

      {/* Role / Item */}
      <td className="text-gray-600 text-sm">{item.item || '—'}</td>

      {/* Amount */}
      <td className="font-semibold">{fmt(parseFloat(item.actual_spent) || parseFloat(item.planned_budget) || 0)}</td>

      {/* Invoice — state driven, merged with old Actions */}
      <td><InvoiceCell /></td>

      {/* Invoice Status */}
      <td>
        {isEditor ? (
          <select
            value={item.invoice_status || ''}
            onChange={e => onStatusChange(item.id, e.target.value)}
            className={clsx(
              'text-xs border rounded px-2 py-1 outline-none cursor-pointer font-semibold',
              item.invoice_status === 'Received' ? 'bg-green-50 border-green-200 text-green-700' :
              item.invoice_status === 'Pending'  ? 'bg-orange-50 border-orange-200 text-orange-700' :
              'border-gray-200 text-gray-400'
            )}
          >
            <option value="">—</option>
            {INVOICE_STATUS.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : item.invoice_status ? (
          <span className={clsx('badge text-xs',
            item.invoice_status === 'Received' ? 'inv-status-paid' :
            'inv-status-pending'
          )}>
            {item.invoice_status}
          </span>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      {/* Payment Due */}
      <td className="text-xs text-gray-500 whitespace-nowrap">
        {item.payment_due ? formatDateIST(item.payment_due) : '—'}
      </td>
    </tr>
  );
}
