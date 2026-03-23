import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Upload, Download } from 'lucide-react';
import InvoiceModal from './InvoiceModal';
import { useCurrency } from '../../context/CurrencyContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { getLineItems, getAllInvoices, updateLineItem, generateId, createReceipt } from '../../lib/dataService';
import { getDownloadUrl } from '../../lib/invoiceUtils';
import { useLists } from '../../context/ListsContext';
import { formatDateIST } from '../../lib/timezone';
import clsx from 'clsx';

const PAYMENT_STATUS = ['Paid', 'Not Paid', 'Pending'];
const SUPPLIER_TYPE = ['New Supplier', 'Worked with before'];
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

export default function LedgerTab({ productionId, production }) {
  const { fmt } = useCurrency();
  const { isEditor, user } = useAuth();
  const { addNotification } = useNotifications();
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const [invoiceFor, setInvoiceFor] = useState(null); // lineItemId

  // Payment confirmation modal state
  const [pendingPayment, setPendingPayment] = useState(null); // { itemId }
  const [payerName, setPayerName] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payTime, setPayTime] = useState('');
  const [payers, setPayers] = useState(getPayers);
  const [newPayer, setNewPayer] = useState('');
  // Invoice guard: shows warning when trying to pay without a received invoice+link
  const [paymentBlockedId, setPaymentBlockedId] = useState(null);

  useEffect(() => {
    async function load() {
      const [lineItems, allInvoices] = await Promise.all([
        Promise.resolve(getLineItems(productionId)),
        Promise.resolve(getAllInvoices()),
      ]);
      setItems(Array.isArray(lineItems) ? lineItems : []);
      setInvoices(Array.isArray(allInvoices) ? allInvoices : []);
    }
    load();
  }, [productionId]);

  async function refresh() {
    const [lineItems, allInvoices] = await Promise.all([
      Promise.resolve(getLineItems(productionId)),
      Promise.resolve(getAllInvoices()),
    ]);
    setItems(Array.isArray(lineItems) ? lineItems : []);
    setInvoices(Array.isArray(allInvoices) ? allInvoices : []);
  }

  function handleUpdate(id, field, value) {
    // B2: skip notification if value hasn't changed
    const item = items.find(i => i.id === id);
    const oldVal = item ? item[field] : undefined;
    updateLineItem(id, { [field]: value });
    if (String(oldVal ?? '') !== String(value ?? '')) {
      addNotification('edit', `${user?.name || 'Someone'} updated ${field} in ledger for ${production?.project_name || productionId}${item ? ` (${item.item || item.full_name || id})` : ''}`, productionId);
    }
    refresh();
  }

  function handlePaymentStatusChange(itemId, newStatus) {
    if (newStatus === 'Paid') {
      // Invoice guard: must have received invoice with a link
      const item = items.find(i => i.id === itemId);
      if (item?.invoice_status !== 'Received' || !item?.invoice_url) {
        setPaymentBlockedId(itemId);
        setTimeout(() => setPaymentBlockedId(id => id === itemId ? null : id), 4000);
        return;
      }
      const now = new Date();
      const localDate = now.toISOString().slice(0, 10);
      const localTime = now.toTimeString().slice(0, 5);
      setPayerName(payers[0] || '');
      setPayDate(localDate);
      setPayTime(localTime);
      setPendingPayment({ itemId });
    } else {
      const item = items.find(i => i.id === itemId);
      updateLineItem(itemId, { payment_status: newStatus, payment_note: null });
      addNotification('edit', `${user?.name || 'Someone'} set payment status to "${newStatus}" for ${item?.item || item?.full_name || itemId} in ${production?.project_name || productionId}`, productionId);
      refresh();
    }
  }

  function confirmPayment() {
    if (!pendingPayment) return;
    const note = `Paid by ${payerName} on ${payDate} at ${payTime}`;
    const item = items.find(i => i.id === pendingPayment.itemId);
    const paidAt = new Date().toISOString();
    const updates = { payment_status: 'Paid', payment_note: note, date_paid: paidAt };
    // Receipt follow-up for חשבון עסקה
    if (item?.invoice_type === 'cheshbon_iska') {
      updates.receipt_required = true;
      updates.paid_at = paidAt;
      createReceipt({
        id: generateId('rcpt'),
        line_item_id: item.id,
        production_id: productionId,
        supplier_name: item.full_name || item.item || '',
        amount: item.actual_spent || item.planned_budget || 0,
        paid_at: paidAt,
        receipt_url: null,
        reminder_sent: false,
      });
    }
    updateLineItem(pendingPayment.itemId, updates);
    addNotification('edit', `${user?.name || 'Someone'} marked "${item?.item || item?.full_name || pendingPayment.itemId}" as Paid (by ${payerName}) in ${production?.project_name || productionId}`, productionId);
    setPendingPayment(null);
    refresh();
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

  const totalUSD = items.reduce((s, i) => s + (i.actual_spent || 0), 0);
  const invoice = (itemId) => invoices.find(inv => inv.line_item_id === itemId);

  return (
    <div>
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 1250 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job / Role</th>
                <th>Price (USD)</th>
                <th>Invoice</th>
                <th>Status</th>
                <th>Payment Method</th>
                <th style={{ minWidth: 180 }}>Bank Details</th>
                <th>Business Type</th>
                <th>Supplier Type</th>
                <th>Payment Due</th>
                <th>Payment Proof</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-gray-400 text-sm">
                    Add line items in Budget Table to populate the Ledger.
                  </td>
                </tr>
              ) : [...items].sort((a, b) => (a.payment_status === 'Paid' ? 1 : 0) - (b.payment_status === 'Paid' ? 1 : 0)).map(item => {
                const inv = invoice(item.id);
                const mismatch = inv && Math.abs((inv.amount || 0) - (item.actual_spent || 0)) > 0.01;
                return (
                  <LedgerRow
                    key={item.id}
                    item={item}
                    invoice={inv}
                    mismatch={mismatch}
                    fmt={fmt}
                    isEditor={isEditor}
                    onUpdate={handleUpdate}
                    onPaymentStatusChange={handlePaymentStatusChange}
                    onInvoice={() => setInvoiceFor(item.id)}
                    paymentBlocked={paymentBlockedId === item.id}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                <td colSpan={2} className="font-bold py-3 px-3">Total</td>
                <td className="font-bold px-3">{fmt(totalUSD)}</td>
                <td colSpan={8} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Invoice Modal */}
      {invoiceFor && (
        <InvoiceModal
          lineItemId={invoiceFor}
          productionId={productionId}
          onClose={() => { setInvoiceFor(null); refresh(); }}
        />
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
              {/* Who paid */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Who paid?
                </label>
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
                      <span
                        onClick={e => { e.stopPropagation(); removePayer(name); }}
                        className="ml-1 text-gray-400 hover:text-red-500 leading-none"
                      >
                        ×
                      </span>
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

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    className="brand-input text-sm"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Time
                  </label>
                  <input
                    type="time"
                    className="brand-input text-sm"
                    value={payTime}
                    onChange={e => setPayTime(e.target.value)}
                  />
                </div>
              </div>

              {payerName && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                  Note: Paid by <strong>{payerName}</strong> on {payDate} at {payTime}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPendingPayment(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
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

function LedgerRow({ item, invoice, mismatch, fmt, isEditor, onUpdate, onPaymentStatusChange, onInvoice, paymentBlocked }) {
  const { lists } = useLists();
  const [editingScreenshot, setEditingScreenshot] = useState(false);
  return (
    <tr className={clsx(item.payment_status === 'Paid' && 'paid-row')}>
      <td className="font-medium">{item.full_name || '—'}</td>
      <td className="text-gray-600">{item.item || '—'}</td>
      <td className="font-semibold">{fmt(item.actual_spent)}</td>

      {/* Invoice */}
      <td>
        <div className="flex flex-col gap-1">
          {/* Status badge */}
          {invoice ? (
            <span className="badge invoice-received text-xs">
              Received · {fmt(invoice.amount || 0)}
            </span>
          ) : item.invoice_status === 'Received' ? (
            <span className="badge invoice-received text-xs">Received</span>
          ) : (
            <span className="badge invoice-pending text-xs">Pending</span>
          )}

          {/* View + Download links */}
          {(invoice?.file_url || item.invoice_url) && (() => {
            const url = invoice?.file_url || item.invoice_url;
            const dl = getDownloadUrl(url);
            return (
              <span className="flex items-center gap-1">
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
                  View ↗
                </a>
                {dl && (
                  <a href={dl} download className="text-gray-400 hover:text-gray-600" title="Download invoice">
                    <Download size={10} />
                  </a>
                )}
              </span>
            );
          })()}

          {/* Mismatch warning */}
          {mismatch && (
            <span
              className="badge invoice-mismatch text-xs cursor-help"
              title={`Invoice: ${fmt(invoice.amount)} vs recorded: ${fmt(item.actual_spent)}`}
            >
              ⚠ {fmt(Math.abs((invoice?.amount || 0) - (item.actual_spent || 0)))} diff
            </span>
          )}

          {/* Send / Re-request button */}
          {isEditor && (
            <button
              onClick={onInvoice}
              className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors mt-0.5"
            >
              {invoice ? 'Re-request' : 'Send'}
            </button>
          )}
        </div>
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
            {paymentBlocked && (
              <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-1 mt-1 max-w-[160px]">
                ⚠ Invoice must be received with a link first
              </div>
            )}
            {item.payment_note && !paymentBlocked && (
              <div className="text-[10px] text-gray-400 mt-0.5 max-w-[140px] truncate" title={item.payment_note}>
                {item.payment_note}
              </div>
            )}
          </div>
        ) : (
          <div>
            <span className={clsx('badge',
              item.payment_status === 'Paid' ? 'status-done' :
              item.payment_status === 'Pending' ? 'status-not-started' :
              'status-working'
            )}>
              {item.payment_status || 'Not Paid'}
            </span>
            {item.payment_note && (
              <div className="text-[10px] text-gray-400 mt-0.5" title={item.payment_note}>
                {item.payment_note}
              </div>
            )}
          </div>
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

      {/* Bank Details */}
      <td>
        {isEditor ? (
          <input
            className="text-xs border rounded px-2 py-1 w-full outline-none"
            style={{ borderColor: 'var(--brand-border)' }}
            value={item.bank_details || ''}
            onChange={e => onUpdate(item.id, 'bank_details', e.target.value)}
            placeholder="Account / IBAN…"
          />
        ) : (
          <span className="text-xs text-gray-500">{item.bank_details || '—'}</span>
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

      {/* Supplier Type */}
      <td>
        {isEditor ? (
          <select
            value={item.supplier_type || 'New Supplier'}
            onChange={e => onUpdate(item.id, 'supplier_type', e.target.value)}
            className={clsx(
              'text-xs border rounded px-2 py-1 outline-none cursor-pointer font-medium',
              item.supplier_type === 'Worked with before'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            )}
          >
            {SUPPLIER_TYPE.map(s => <option key={s}>{s}</option>)}
          </select>
        ) : (
          <span className={clsx('badge text-xs',
            item.supplier_type === 'Worked with before' ? 'status-done' : 'stage-in-progress'
          )}>
            {item.supplier_type || 'New'}
          </span>
        )}
      </td>

      {/* Payment Due */}
      <td className="text-xs text-gray-500 whitespace-nowrap">
        {item.payment_due
          ? formatDateIST(item.payment_due)
          : invoice?.payment_due
            ? formatDateIST(invoice.payment_due)
            : '—'}
      </td>

      {/* Payment Proof */}
      <td>
        {editingScreenshot ? (
          <input
            autoFocus
            className="text-xs border rounded px-2 py-1 outline-none w-full"
            style={{ borderColor: 'var(--brand-border)', minWidth: 160 }}
            placeholder="https://…"
            defaultValue={item.payment_screenshot_url || ''}
            onBlur={e => {
              onUpdate(item.id, 'payment_screenshot_url', e.target.value);
              setEditingScreenshot(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') setEditingScreenshot(false);
            }}
          />
        ) : item.payment_screenshot_url ? (
          <div className="flex items-center gap-1">
            <a
              href={item.payment_screenshot_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 underline"
            >
              View ✓
            </a>
            {isEditor && (
              <button
                onClick={() => setEditingScreenshot(true)}
                className="text-gray-400 hover:text-gray-600 ml-1"
              >
                ✏
              </button>
            )}
          </div>
        ) : isEditor ? (
          <button
            onClick={() => setEditingScreenshot(true)}
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            <Upload size={10} /> Add
          </button>
        ) : (
          <span className="text-gray-300 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}
