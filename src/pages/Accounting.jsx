import { useState, useEffect, useMemo } from 'react';
import { X, Plus, ChevronDown, ChevronRight, ExternalLink, Upload, Download } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import ExportMenu from '../components/ui/ExportMenu';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { getProductions, getAllLineItems, updateLineItem, createReceipt, updateReceipt, getReceipts, generateId } from '../lib/dataService';
import { getDownloadUrl } from '../lib/invoiceUtils';
import { formatDateIST } from '../lib/timezone';
import { useLists } from '../context/ListsContext';
import clsx from 'clsx';

const PAYMENT_STATUS = ['Paid', 'Not Paid', 'Pending'];
const INVOICE_STATUS = ['Pending', 'Received'];
const DEFAULT_PAYERS = ['Arina', 'Ortal', 'Omer', 'Dorin', 'Tomer'];

function getPayers() {
  try {
    const stored = localStorage.getItem('cp_payers');
    return stored ? JSON.parse(stored) : DEFAULT_PAYERS;
  } catch { return DEFAULT_PAYERS; }
}
function savePayers(list) {
  localStorage.setItem('cp_payers', JSON.stringify(list));
}

export default function Accounting() {
  const { brandId } = useBrand();
  const { fmt } = useCurrency();
  const { isEditor, user } = useAuth();
  const { addNotification } = useNotifications();

  const [tab, setTab] = useState('by-production');
  const [productions, setProductions] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [filter, setFilter] = useState('');
  const [payStatusFilter, setPayStatusFilter] = useState('');

  // Payment confirmation modal
  const [pendingPayment, setPendingPayment] = useState(null);
  const [payerName, setPayerName] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payTime, setPayTime] = useState('');
  const [payers, setPayers] = useState(getPayers);
  const [newPayer, setNewPayer] = useState('');
  // Invoice guard warning
  const [paymentBlockedId, setPaymentBlockedId] = useState(null);

  useEffect(() => { load(); }, [brandId]);

  async function load() {
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

  function handleUpdate(id, field, value) {
    const item = allItems.find(i => i.id === id);
    const oldVal = item ? item[field] : undefined;
    updateLineItem(id, { [field]: value });
    if (String(oldVal ?? '') !== String(value ?? '')) {
      const prod = productions.find(p => p.id === item?.production_id);
      addNotification('edit',
        `${user?.name || 'Someone'} updated ${field} in accounting for ${prod?.project_name || item?.production_id}`,
        item?.production_id
      );
    }
    load();
  }

  function handleInvoiceUrlUpdate(id, url) {
    const item = allItems.find(i => i.id === id);
    updateLineItem(id, {
      invoice_url: url,
      // auto-set invoice_status to Not Paid when URL first added
      invoice_status: item?.invoice_status || (url ? 'Received' : ''),
    });
    const prod = productions.find(p => p.id === item?.production_id);
    addNotification('invoice_received',
      `Invoice URL set for ${item?.item || item?.full_name || id} in ${prod?.project_name || item?.production_id}`,
      item?.production_id
    );
    load();
  }

  function handlePaymentStatusChange(itemId, newStatus) {
    if (newStatus === 'Paid') {
      // Invoice guard: must have received invoice with a link
      const item = allItems.find(i => i.id === itemId);
      if (item?.invoice_status !== 'Received' || !item?.invoice_url) {
        setPaymentBlockedId(itemId);
        setTimeout(() => setPaymentBlockedId(id => id === itemId ? null : id), 4000);
        return;
      }
      const now = new Date();
      setPayerName(payers[0] || '');
      setPayDate(now.toISOString().slice(0, 10));
      setPayTime(now.toTimeString().slice(0, 5));
      setPendingPayment({ itemId });
    } else {
      const item = allItems.find(i => i.id === itemId);
      const prod = productions.find(p => p.id === item?.production_id);
      updateLineItem(itemId, { payment_status: newStatus, payment_note: null });
      addNotification('edit',
        `${user?.name || 'Someone'} set payment status to "${newStatus}" for ${item?.item || item?.full_name || itemId}`,
        item?.production_id
      );
      load();
    }
  }

  function confirmPayment() {
    if (!pendingPayment) return;
    const note = `Paid by ${payerName} on ${payDate} at ${payTime}`;
    const item = allItems.find(i => i.id === pendingPayment.itemId);
    const prod = productions.find(p => p.id === item?.production_id);
    const paidAt = new Date().toISOString();
    const updates = { payment_status: 'Paid', payment_note: note, date_paid: paidAt };
    // Receipt follow-up: when paying a חשבון עסקה, create a receipt record
    if (item?.invoice_type === 'cheshbon_iska') {
      updates.receipt_required = true;
      updates.paid_at = paidAt;
      createReceipt({
        id: generateId('rcpt'),
        line_item_id: item.id,
        production_id: item.production_id,
        supplier_name: item.full_name || item.item || '',
        amount: parseFloat(item.actual_spent) || parseFloat(item.planned_budget) || 0,
        paid_at: paidAt,
        receipt_url: null,
        reminder_sent: false,
      });
    }
    updateLineItem(pendingPayment.itemId, updates);
    addNotification('edit',
      `${user?.name || 'Someone'} marked "${item?.item || item?.full_name || pendingPayment.itemId}" as Paid (by ${payerName}) in ${prod?.project_name || item?.production_id}`,
      item?.production_id
    );
    setPendingPayment(null);
    load();
  }

  function handleReceiptUpdate(receiptId, url) {
    updateReceipt(receiptId, { receipt_url: url });
    load();
  }

  function addPayer() {
    const name = newPayer.trim();
    if (!name || payers.includes(name)) return;
    const updated = [...payers, name];
    setPayers(updated);
    savePayers(updated);
    setNewPayer('');
  }

  function removePayer(name) {
    const updated = payers.filter(p => p !== name);
    setPayers(updated);
    savePayers(updated);
    if (payerName === name) setPayerName(updated[0] || '');
  }

  // Summary stats
  const paid = useMemo(() => allItems.filter(i => i.payment_status === 'Paid'), [allItems]);
  const notPaid = useMemo(() => allItems.filter(i => !i.payment_status || i.payment_status === 'Not Paid'), [allItems]);
  const pending = useMemo(() => allItems.filter(i => i.payment_status === 'Pending'), [allItems]);
  const paidTotal = useMemo(() => paid.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0), [paid]);
  const notPaidTotal = useMemo(() => notPaid.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0), [notPaid]);
  const pendingTotal = useMemo(() => pending.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0), [pending]);

  // Filtered items
  const filteredItems = useMemo(() => {
    let list = allItems;
    if (payStatusFilter) list = list.filter(i => (i.payment_status || 'Not Paid') === payStatusFilter);
    if (filter) {
      const q = filter.toLowerCase();
      list = list.filter(i =>
        (i.item || '').toLowerCase().includes(q) ||
        (i.full_name || '').toLowerCase().includes(q) ||
        (i.production_id || '').toLowerCase().includes(q) ||
        (productions.find(p => p.id === i.production_id)?.project_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allItems, filter, payStatusFilter, productions]);

  // Group by production
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
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredItems, productions]);

  // By payment date (unpaid only, sorted ascending; then no-due-date; then paid at end)
  const byDate = useMemo(() => {
    const today = new Date();
    const withDue = filteredItems.filter(i => i.payment_due && i.payment_status !== 'Paid');
    const withoutDue = filteredItems.filter(i => !i.payment_due && i.payment_status !== 'Paid');
    const paidItems = filteredItems.filter(i => i.payment_status === 'Paid');
    withDue.sort((a, b) => new Date(a.payment_due) - new Date(b.payment_due));
    return { items: [...withDue, ...withoutDue, ...paidItems], today };
  }, [filteredItems]);

  const ACCOUNTING_EXPORT_COLS = [
    { key: 'production_id', label: 'Production' },
    { key: 'item', label: 'Item' },
    { key: 'full_name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'planned_budget', label: 'Planned' },
    { key: 'actual_spent', label: 'Actual' },
    { key: 'payment_status', label: 'Pay Status' },
    { key: 'payment_method', label: 'Method' },
    { key: 'payment_due', label: 'Due Date' },
    { key: 'invoice_status', label: 'Invoice Status' },
    { key: 'business_type', label: 'Business Type' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Accounting
        </h1>
        <ExportMenu rows={filteredItems} columns={ACCOUNTING_EXPORT_COLS} filename="accounting" title="Accounting" />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div
          className={clsx('brand-card border-l-4 border-green-400 cursor-pointer transition-all', payStatusFilter === 'Paid' && 'ring-2 ring-green-400')}
          onClick={() => setPayStatusFilter(p => p === 'Paid' ? '' : 'Paid')}
        >
          <div className="text-xs text-gray-400 mb-1">Paid</div>
          <div className="text-xl font-black text-green-700">{fmt(paidTotal)}</div>
          <div className="text-xs text-gray-400 mt-1">{paid.length} items</div>
        </div>
        <div
          className={clsx('brand-card border-l-4 border-orange-400 cursor-pointer transition-all', payStatusFilter === 'Not Paid' && 'ring-2 ring-orange-400')}
          onClick={() => setPayStatusFilter(p => p === 'Not Paid' ? '' : 'Not Paid')}
        >
          <div className="text-xs text-gray-400 mb-1">Not Paid</div>
          <div className="text-xl font-black text-orange-700">{fmt(notPaidTotal)}</div>
          <div className="text-xs text-gray-400 mt-1">{notPaid.length} items</div>
        </div>
        <div
          className={clsx('brand-card border-l-4 border-gray-300 cursor-pointer transition-all', payStatusFilter === 'Pending' && 'ring-2 ring-gray-400')}
          onClick={() => setPayStatusFilter(p => p === 'Pending' ? '' : 'Pending')}
        >
          <div className="text-xs text-gray-400 mb-1">Pending</div>
          <div className="text-xl font-black text-gray-700">{fmt(pendingTotal)}</div>
          <div className="text-xs text-gray-400 mt-1">{pending.length} items</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {[
            { id: 'by-production', label: '🎬 By Production' },
            { id: 'full-table', label: '📋 Full Table' },
            { id: 'by-date', label: '📅 By Date' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                tab === t.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="brand-input"
          style={{ width: 220 }}
          placeholder="Search…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {(filter || payStatusFilter) && (
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={() => { setFilter(''); setPayStatusFilter(''); }}
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto text-sm text-gray-400">
          {filteredItems.length} items
        </div>
      </div>

      {/* BY PRODUCTION */}
      {tab === 'by-production' && (
        <div className="space-y-3">
          {byProduction.length === 0 ? (
            <div className="brand-card text-center py-16 text-gray-300 text-sm">No items found</div>
          ) : byProduction.map(([prodId, data]) => (
            <AccountingProductionGroup
              key={prodId}
              prodId={prodId}
              data={data}
              fmt={fmt}
              isEditor={isEditor}
              onUpdate={handleUpdate}
              onPaymentStatusChange={handlePaymentStatusChange}
              paymentBlockedId={paymentBlockedId}
              receipts={receipts}
              onReceiptUpdate={handleReceiptUpdate}
            />
          ))}
        </div>
      )}

      {/* FULL TABLE */}
      {tab === 'full-table' && (
        <AccountingFullTable
          items={filteredItems}
          productions={productions}
          fmt={fmt}
          isEditor={isEditor}
          onUpdate={handleUpdate}
          onPaymentStatusChange={handlePaymentStatusChange}
          paymentBlockedId={paymentBlockedId}
          receipts={receipts}
          onReceiptUpdate={handleReceiptUpdate}
        />
      )}

      {/* BY DATE */}
      {tab === 'by-date' && (
        <div className="brand-card p-0 overflow-hidden">
          <div className="table-scroll-wrapper">
            <table className="data-table" style={{ minWidth: 1300 }}>
              <thead>
                <tr>
                  <th>Production</th>
                  <th>Priority</th>
                  <th>Name</th>
                  <th>Role / Item</th>
                  <th>Amount</th>
                  <th>Invoice</th>
                  <th>Receipt Doc</th>
                  <th>Inv. Status</th>
                  <th>Payment Due</th>
                  <th>Payment Status</th>
                  <th>Method</th>
                  <th style={{ minWidth: 160 }}>Notes</th>
                  <th>Business Type</th>
                  <th>Payment Proof</th>
                </tr>
              </thead>
              <tbody>
                {byDate.items.length === 0 ? (
                  <tr><td colSpan={14} className="text-center py-10 text-gray-400 text-sm">No items found</td></tr>
                ) : byDate.items.map(item => {
                  const isOverdue = item.payment_due && new Date(item.payment_due) < byDate.today && item.payment_status !== 'Paid';
                  const isDueSoon = item.payment_due && !isOverdue && item.payment_status !== 'Paid' &&
                    (new Date(item.payment_due) - byDate.today) < 7 * 86400000;
                  return (
                    <AccountingRow
                      key={item.id}
                      item={item}
                      fmt={fmt}
                      isEditor={isEditor}
                      showProduction
                      productionName={productions.find(p => p.id === item.production_id)?.project_name}
                      onUpdate={handleUpdate}
                      onPaymentStatusChange={handlePaymentStatusChange}
                      paymentBlocked={paymentBlockedId === item.id}
                      receipt={receipts.find(r => r.line_item_id === item.id)}
                      onReceiptUpdate={handleReceiptUpdate}
                      priorityBadge={
                        item.payment_status === 'Paid' ? <span className="text-xs text-green-500">✓ Paid</span> :
                        isOverdue ? <span className="badge text-xs" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>⚠ Overdue</span> :
                        isDueSoon ? <span className="badge text-xs" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}>Due soon</span> :
                        <span className="text-xs text-gray-300">—</span>
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {pendingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Confirm Payment</h3>
              <button onClick={() => setPendingPayment(null)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Who paid?</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {payers.map(name => (
                    <button
                      key={name}
                      onClick={() => setPayerName(name)}
                      className={clsx(
                        'flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                        payerName === name
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}
                    >
                      {name}
                      <span onClick={e => { e.stopPropagation(); removePayer(name); }} className="ml-1 text-gray-400 hover:text-red-500">×</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="brand-input text-sm flex-1"
                    placeholder="Add person…"
                    value={newPayer}
                    onChange={e => setNewPayer(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPayer()}
                  />
                  <button onClick={addPayer} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</label>
                  <input type="date" className="brand-input text-sm" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Time</label>
                  <input type="time" className="brand-input text-sm" value={payTime} onChange={e => setPayTime(e.target.value)} />
                </div>
              </div>
              {payerName && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                  Note: Paid by <strong>{payerName}</strong> on {payDate} at {payTime}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setPendingPayment(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={confirmPayment}
                disabled={!payerName}
                className="flex-1 btn-cta py-2.5 rounded-xl text-sm"
                style={{ opacity: !payerName ? 0.5 : 1 }}
              >
                Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible production group ───────────────────────────────────────────

function AccountingProductionGroup({ prodId, data, fmt, isEditor, onUpdate, onPaymentStatusChange, paymentBlockedId, receipts = [], onReceiptUpdate }) {
  const [expanded, setExpanded] = useState(true);
  const total = data.items.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const paidTotal = data.items.filter(i => i.payment_status === 'Paid').reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const notPaidTotal = total - paidTotal;

  return (
    <div className="brand-card">
      <button className="w-full flex items-center justify-between" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--brand-secondary)' }}>{prodId}</span>
          <span className="font-semibold text-gray-800">{data.production?.project_name || ''}</span>
          <span className="text-xs text-gray-400">{data.items.length} items</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-green-600 font-semibold">✓ {fmt(paidTotal)}</span>
          <span className="text-xs text-orange-600 font-semibold">⊘ {fmt(notPaidTotal)}</span>
          <span className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>{fmt(total)}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 1300 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role / Item</th>
                <th>Amount</th>
                <th>Invoice</th>
                <th>Receipt Doc</th>
                <th>Inv. Status</th>
                <th>Payment Due</th>
                <th>Payment Status</th>
                <th>Method</th>
                <th style={{ minWidth: 160 }}>Notes</th>
                <th>Business Type</th>
                <th>Payment Proof</th>
              </tr>
            </thead>
            <tbody>
              {[...data.items]
                .sort((a, b) => (a.payment_status === 'Paid' ? 1 : 0) - (b.payment_status === 'Paid' ? 1 : 0))
                .map(item => (
                  <AccountingRow
                    key={item.id}
                    item={item}
                    fmt={fmt}
                    isEditor={isEditor}
                    onUpdate={onUpdate}
                    onPaymentStatusChange={onPaymentStatusChange}
                    paymentBlocked={paymentBlockedId === item.id}
                    receipt={receipts.find(r => r.line_item_id === item.id)}
                    onReceiptUpdate={onReceiptUpdate}
                  />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Full table view ─────────────────────────────────────────────────────────

function AccountingFullTable({ items, productions, fmt, isEditor, onUpdate, onPaymentStatusChange, paymentBlockedId, receipts = [], onReceiptUpdate }) {
  const sorted = [...items].sort((a, b) => (a.payment_status === 'Paid' ? 1 : 0) - (b.payment_status === 'Paid' ? 1 : 0));
  return (
    <div className="brand-card p-0 overflow-hidden">
      <div className="table-scroll-wrapper">
        <table className="data-table" style={{ minWidth: 1400 }}>
          <thead>
            <tr>
              <th>Production</th>
              <th>Name</th>
              <th>Role / Item</th>
              <th>Amount</th>
              <th>Invoice</th>
              <th>Receipt Doc</th>
              <th>Inv. Status</th>
              <th>Payment Due</th>
              <th>Payment Status</th>
              <th>Method</th>
              <th style={{ minWidth: 160 }}>Notes</th>
              <th>Business Type</th>
              <th>Payment Proof</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={13} className="text-center py-10 text-gray-400 text-sm">No items found</td></tr>
            ) : sorted.map(item => (
              <AccountingRow
                key={item.id}
                item={item}
                fmt={fmt}
                isEditor={isEditor}
                showProduction
                productionName={productions.find(p => p.id === item.production_id)?.project_name}
                onUpdate={onUpdate}
                onPaymentStatusChange={onPaymentStatusChange}
                paymentBlocked={paymentBlockedId === item.id}
                receipt={receipts.find(r => r.line_item_id === item.id)}
                onReceiptUpdate={onReceiptUpdate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Single editable accounting row ─────────────────────────────────────────

function AccountingRow({ item, fmt, isEditor, showProduction, productionName, onUpdate, onPaymentStatusChange, priorityBadge, paymentBlocked, receipt, onReceiptUpdate }) {
  const { lists } = useLists();
  const [editingScreenshot, setEditingScreenshot] = useState(false);
  const [editingReceiptUrl, setEditingReceiptUrl] = useState(false);

  return (
    <tr className={clsx(
      item.payment_status === 'Paid' && item.invoice_type === 'cheshbon_iska' && !receipt?.receipt_url
        ? 'bg-orange-50'
        : item.payment_status === 'Paid' ? 'paid-row' : ''
    )}>
      {showProduction && (
        <td className="font-mono text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>
          {productionName || item.production_id}
        </td>
      )}
      {priorityBadge !== undefined && <td>{priorityBadge}</td>}

      {/* Name */}
      <td className="font-medium text-sm">{item.full_name || '—'}</td>

      {/* Role / Item */}
      <td className="text-gray-600 text-sm">{item.item || '—'}</td>

      {/* Amount */}
      <td className="font-semibold">{fmt(item.actual_spent)}</td>

      {/* Invoice URL — read-only; set via InvoiceModal on production board */}
      <td>
        {item.invoice_url ? (
          <div className="flex items-center gap-1">
            <a href={item.invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline flex items-center gap-0.5">
              <ExternalLink size={10} /> View ✓
            </a>
            {getDownloadUrl(item.invoice_url) && (
              <a
                href={getDownloadUrl(item.invoice_url)}
                download
                className="text-gray-400 hover:text-gray-600 flex items-center gap-0.5 text-xs"
                title="Download invoice"
              >
                <Download size={10} />
              </a>
            )}
          </div>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      {/* Receipt Doc — only relevant for cheshbon_iska items */}
      <td>
        {item.invoice_type === 'cheshbon_iska' && item.payment_status === 'Paid' ? (
          receipt?.receipt_url ? (
            <div className="flex items-center gap-1">
              <a href={receipt.receipt_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-green-600 underline flex items-center gap-0.5">
                <Download size={10} /> Doc ✓
              </a>
              {isEditor && (
                <button onClick={() => setEditingReceiptUrl(true)} className="text-gray-300 hover:text-gray-500 ml-1 text-xs">✏</button>
              )}
            </div>
          ) : editingReceiptUrl ? (
            <input
              autoFocus
              className="text-xs border rounded px-2 py-1 outline-none"
              style={{ borderColor: 'var(--brand-border)', width: 140 }}
              defaultValue=""
              onBlur={e => { if (receipt && e.target.value) onReceiptUpdate(receipt.id, e.target.value); setEditingReceiptUrl(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') e.target.blur();
                if (e.key === 'Escape') setEditingReceiptUrl(false);
              }}
              placeholder="Paste receipt URL…"
            />
          ) : (
            <button
              onClick={() => isEditor && setEditingReceiptUrl(true)}
              className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 hover:bg-orange-100 transition-colors"
              title="Awaiting חשבונית מס/קבלה receipt"
            >
              ⚠ Missing
            </button>
          )
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      {/* Invoice Status */}
      <td>
        {isEditor ? (
          <select
            value={item.invoice_status || ''}
            onChange={e => onUpdate(item.id, 'invoice_status', e.target.value)}
            className={clsx(
              'text-xs border rounded px-2 py-1 outline-none cursor-pointer font-semibold',
              item.invoice_status === 'Received' ? 'bg-green-50 border-green-200 text-green-700' :
              item.invoice_status === 'Pending' ? 'bg-orange-50 border-orange-200 text-orange-700' :
              'border-gray-200 text-gray-400'
            )}
          >
            <option value="">—</option>
            {INVOICE_STATUS.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : (
          item.invoice_status ? (
            <span className={clsx('badge text-xs',
              item.invoice_status === 'Received' ? 'inv-status-paid' :
              'inv-status-pending'
            )}>
              {item.invoice_status}
            </span>
          ) : <span className="text-gray-300 text-xs">—</span>
        )}
      </td>

      {/* Payment Due */}
      <td className="text-xs text-gray-500 whitespace-nowrap">
        {item.payment_due ? formatDateIST(item.payment_due) : '—'}
      </td>

      {/* Payment Status */}
      <td>
        {isEditor ? (
          <div>
            <select
              value={item.payment_status || 'Not Paid'}
              onChange={e => onPaymentStatusChange(item.id, e.target.value)}
              className={clsx(
                'text-xs border rounded px-2 py-1 outline-none cursor-pointer font-semibold',
                item.payment_status === 'Paid' ? 'bg-green-50 border-green-200 text-green-700' :
                item.payment_status === 'Pending' ? 'bg-gray-100 border-gray-200 text-gray-600' :
                'bg-orange-50 border-orange-200 text-orange-700'
              )}
            >
              {PAYMENT_STATUS.map(s => <option key={s}>{s}</option>)}
            </select>
            {item.payment_note && (
              <div className="text-[10px] text-gray-400 mt-0.5 max-w-[140px] truncate" title={item.payment_note}>
                {item.payment_note}
              </div>
            )}
            {paymentBlocked && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-1 mt-1 max-w-[160px]">
                ⚠ Invoice must be received with a link first
              </div>
            )}
          </div>
        ) : (
          <span className={clsx('badge text-xs',
            item.payment_status === 'Paid' ? 'status-done' :
            item.payment_status === 'Pending' ? 'status-not-started' :
            'status-working'
          )}>
            {item.payment_status || 'Not Paid'}
          </span>
        )}
      </td>

      {/* Payment Method */}
      <td>
        {isEditor ? (
          <select
            value={item.payment_method || ''}
            onChange={e => onUpdate(item.id, 'payment_method', e.target.value)}
            className="text-xs border rounded px-2 py-1 outline-none cursor-pointer"
            style={{ borderColor: 'var(--brand-border)' }}
          >
            <option value="">—</option>
            {lists.paymentMethods.map(m => <option key={m}>{m}</option>)}
          </select>
        ) : (
          <span className="text-xs text-gray-600">{item.payment_method || '—'}</span>
        )}
      </td>

      {/* Notes */}
      <td>
        {isEditor ? (
          <input
            className="text-xs border rounded px-2 py-1 w-full outline-none"
            style={{ borderColor: 'var(--brand-border)' }}
            value={item.notes || ''}
            onChange={e => onUpdate(item.id, 'notes', e.target.value)}
            placeholder="Notes…"
          />
        ) : (
          <span className="text-xs text-gray-500">{item.notes || '—'}</span>
        )}
      </td>

      {/* Business Type */}
      <td>
        {isEditor ? (
          <select
            value={item.business_type || ''}
            onChange={e => onUpdate(item.id, 'business_type', e.target.value)}
            className="text-xs border rounded px-2 py-1 outline-none cursor-pointer"
            style={{ borderColor: 'var(--brand-border)' }}
          >
            <option value="">—</option>
            {lists.businessTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        ) : (
          <span className="text-xs">{item.business_type || '—'}</span>
        )}
      </td>

      {/* Payment Proof */}
      <td>
        {editingScreenshot ? (
          <input
            autoFocus
            className="text-xs border rounded px-2 py-1 outline-none"
            style={{ borderColor: 'var(--brand-border)', width: 140 }}
            defaultValue={item.payment_screenshot_url || ''}
            onBlur={e => { onUpdate(item.id, 'payment_screenshot_url', e.target.value); setEditingScreenshot(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') setEditingScreenshot(false);
            }}
            placeholder="https://…"
          />
        ) : item.payment_screenshot_url ? (
          <div className="flex items-center gap-1">
            <a href={item.payment_screenshot_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-600 underline flex items-center gap-0.5">
              <ExternalLink size={10} /> View ✓
            </a>
            {isEditor && (
              <button onClick={() => setEditingScreenshot(true)} className="text-gray-300 hover:text-gray-500 ml-1 text-xs">✏</button>
            )}
          </div>
        ) : isEditor ? (
          <button onClick={() => setEditingScreenshot(true)}
            className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <Upload size={10} /> Add
          </button>
        ) : <span className="text-gray-300 text-xs">—</span>}
      </td>

    </tr>
  );
}
