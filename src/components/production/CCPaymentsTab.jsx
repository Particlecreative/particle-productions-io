import { useState, useEffect, useMemo } from 'react';
import { CreditCard, Copy, Check, ExternalLink, Trash2, Search, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  getCCPurchases, updateCCPurchase, deleteCCPurchase,
  getLineItems, getLineItemByCcPurchaseId, getLineItem,
  updateLineItem, createInvoice, generateId,
} from '../../lib/dataService';
import clsx from 'clsx';

const STATUS_COLORS = {
  Pending:  'bg-orange-100 text-orange-700 border-orange-200',
  Approved: 'bg-green-100  text-green-700  border-green-200',
  Rejected: 'bg-red-100    text-red-700    border-red-200',
};

export default function CCPaymentsTab({ productionId, production }) {
  const { isEditor, isAdmin, user } = useAuth();
  const { rate } = useCurrency();
  const [purchases, setPurchases]     = useState([]);
  const [lineItems, setLineItems]     = useState([]);
  const [filter, setFilter]           = useState('All');
  const [search, setSearch]           = useState('');
  const [copied, setCopied]           = useState(false);
  // Dialog for CC → parent line item approval
  const [approveDialog, setApproveDialog] = useState(null); // { purchase, parentItem, addedILS }

  const formUrl = `${window.location.origin}/cc-payment/${productionId}`;

  useEffect(() => {
    async function load() {
      const [purchases, items] = await Promise.all([
        Promise.resolve(getCCPurchases(productionId)),
        Promise.resolve(getLineItems(productionId)),
      ]);
      setPurchases(Array.isArray(purchases) ? purchases : []);
      setLineItems(Array.isArray(items) ? items : []);
    }
    load();
  }, [productionId]);

  async function refresh() {
    const [purchases, items] = await Promise.all([
      Promise.resolve(getCCPurchases(productionId)),
      Promise.resolve(getLineItems(productionId)),
    ]);
    setPurchases(Array.isArray(purchases) ? purchases : []);
    setLineItems(Array.isArray(items) ? items : []);
  }

  function copyFormLink() {
    navigator.clipboard.writeText(formUrl).catch(() => {
      const el = document.createElement('textarea');
      el.value = formUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function attachInvoice(purchase, targetItem) {
    if (purchase?.receipt_url && targetItem) {
      await Promise.resolve(createInvoice({
        id: generateId('inv'),
        line_item_id: targetItem.id,
        production_id: targetItem.production_id,
        file_url: purchase.receipt_url,
        amount: purchase.amount_without_vat || purchase.total_amount,
        invoice_type: 'receipt',
        status: 'Received',
        date_received: new Date().toISOString().split('T')[0],
      }));
    }
  }

  async function approve(id) {
    const purchase = purchases.find(p => p.id === id);
    // Mark CC purchase as Approved immediately
    await Promise.resolve(updateCCPurchase(id, { approval_status: 'Approved', approved_by: user?.name || 'Admin' }));

    // Path A: standalone CC line item (no parent_line_item_id on purchase)
    const linkedItem = await Promise.resolve(getLineItemByCcPurchaseId(id));
    if (linkedItem) {
      await Promise.resolve(updateLineItem(linkedItem.id, {
        payment_status: 'Paid',
        payment_method: 'Credit Card',
        date_paid: new Date().toISOString().split('T')[0],
        payment_note: purchase ? `Paid by CC – ${purchase.store_name} (${purchase.purchaser_name})` : 'Paid by CC',
      }));
      await attachInvoice(purchase, linkedItem);
      await refresh();
      return;
    }

    // Path B: linked to existing parent budget row — show confirmation dialog
    if (purchase?.parent_line_item_id) {
      const parentItem = await Promise.resolve(getLineItem(purchase.parent_line_item_id));
      if (parentItem) {
        setApproveDialog({
          purchase,
          parentItem,
          addedILS: purchase.amount_without_vat || 0,
        });
        await refresh(); // update approval badge immediately
        return;
      }
    }

    await refresh();
  }

  async function handleDialogYes() {
    if (!approveDialog) return;
    const { purchase, parentItem, addedILS } = approveDialog;
    const parentIsUSD = (parentItem.currency_code || 'USD') !== 'ILS';
    // Convert ILS amount to parent's currency for actual_spent update
    const converted = parentIsUSD ? addedILS / (rate || 3.7) : addedILS;
    const note = `CC: ₪${addedILS.toLocaleString()} (${purchase.store_name}, by ${purchase.purchaser_name})`;
    await Promise.resolve(updateLineItem(parentItem.id, {
      actual_spent: (parseFloat(parentItem.actual_spent) || 0) + converted,
      payment_note: parentItem.payment_note ? `${parentItem.payment_note} | ${note}` : note,
    }));
    await attachInvoice(purchase, parentItem);
    setApproveDialog(null);
    await refresh();
  }

  async function handleDialogNo() {
    if (!approveDialog) return;
    const { purchase, parentItem, addedILS } = approveDialog;
    const note = `CC noted ₪${addedILS.toLocaleString()} (${purchase.store_name}) — not added to actual`;
    await Promise.resolve(updateLineItem(parentItem.id, {
      payment_note: parentItem.payment_note ? `${parentItem.payment_note} | ${note}` : note,
    }));
    await attachInvoice(purchase, parentItem);
    setApproveDialog(null);
    await refresh();
  }

  async function reject(id) {
    await Promise.resolve(updateCCPurchase(id, { approval_status: 'Rejected', approved_by: user?.name || 'Admin' }));
    await refresh();
  }

  async function remove(id) {
    if (!confirm('Delete this purchase record?')) return;
    await Promise.resolve(deleteCCPurchase(id));
    await refresh();
  }

  const liMap = useMemo(() => {
    const m = {};
    lineItems.forEach(li => { m[li.id] = li.item || li.full_name || li.id; });
    return m;
  }, [lineItems]);

  const filtered = useMemo(() => {
    let list = [...purchases];
    if (filter !== 'All') list = list.filter(p => p.approval_status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.store_name || '').toLowerCase().includes(q) ||
        (p.purchaser_name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  }, [purchases, filter, search]);

  const totalApproved = purchases.filter(p => p.approval_status === 'Approved').reduce((s, p) => s + (p.total_amount || 0), 0);
  const pendingCount  = purchases.filter(p => p.approval_status === 'Pending').length;
  const rejectedCount = purchases.filter(p => p.approval_status === 'Rejected').length;

  function fmtDate(dt) {
    if (!dt) return '—';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div>
      {/* ── Approve Dialog ───────────────────────────────────────────────── */}
      {approveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={18} className="text-orange-500 shrink-0" />
              <h3 className="font-black text-gray-900 text-base">Apply CC charge to budget row?</h3>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">CC Charge (excl. VAT)</span>
                <span className="font-bold text-blue-700">₪{approveDialog.addedILS.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Store</span>
                <span className="font-medium">{approveDialog.purchase.store_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Budget Row</span>
                <span className="font-medium text-gray-700">{approveDialog.parentItem.item || approveDialog.parentItem.full_name}</span>
              </div>
              {(approveDialog.parentItem.currency_code || 'USD') !== 'ILS' && (
                <div className="flex justify-between text-xs border-t border-gray-200 pt-2 mt-1">
                  <span className="text-gray-400">Approx. in USD (rate ₪{(rate || 3.7).toFixed(2)}/$1)</span>
                  <span className="font-semibold text-gray-600">
                    ≈ ${(approveDialog.addedILS / (rate || 3.7)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mb-4">
              <strong>Yes</strong> adds this amount to the row's Actual Spent.{' '}
              <strong>Note only</strong> records it as a payment note without changing the amount.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleDialogNo}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-all"
              >
                Note only
              </button>
              <button
                onClick={handleDialogYes}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-700 transition-all"
              >
                ✓ Yes — add to Actual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={copyFormLink}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              copied
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700'
            )}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Link Copied!' : 'Copy Submission Form Link'}
          </button>
          <a href={formUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <ExternalLink size={12} /> Preview form
          </a>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-300 w-36"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <X size={11} />
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {['All', 'Pending', 'Approved', 'Rejected'].map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  filter === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                )}
              >{s}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="brand-card py-3 px-4">
          <div className="text-xs text-gray-400 mb-0.5">Total Approved</div>
          <div className="text-lg font-black text-green-600">₪{totalApproved.toLocaleString()}</div>
        </div>
        <div className="brand-card py-3 px-4">
          <div className="text-xs text-gray-400 mb-0.5">Pending Approval</div>
          <div className="text-lg font-black text-orange-500">{pendingCount}</div>
        </div>
        <div className="brand-card py-3 px-4">
          <div className="text-xs text-gray-400 mb-0.5">Rejected</div>
          <div className="text-lg font-black text-red-500">{rejectedCount}</div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>Store</th>
                <th style={{ minWidth: 180 }}>Description</th>
                <th style={{ minWidth: 110 }}>Total (₪ incl. VAT)</th>
                <th style={{ minWidth: 110 }}>W/O VAT (₪)</th>
                <th style={{ minWidth: 130 }}>Purchaser</th>
                <th style={{ minWidth: 150 }}>Date</th>
                <th style={{ minWidth: 150 }}>Linked Budget Row</th>
                <th style={{ minWidth: 80 }}>Receipt</th>
                <th style={{ minWidth: 110 }}>Status</th>
                {(isEditor || isAdmin) && <th style={{ minWidth: 100 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isEditor || isAdmin ? 10 : 9} className="text-center py-12 text-gray-400 text-sm">
                    <CreditCard size={32} className="mx-auto mb-2 opacity-20" />
                    {filter !== 'All' || search ? 'No purchases match your filter.' : 'No credit card purchases yet.'}
                    <div className="text-xs mt-1">
                      Share the <button onClick={copyFormLink} className="text-blue-500 hover:underline">submission form link</button> with your team.
                    </div>
                  </td>
                </tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-medium text-sm">{p.store_name || '—'}</td>
                  <td className="text-sm text-gray-600">{p.description || '—'}</td>
                  <td className="font-semibold text-sm">₪{(p.total_amount || 0).toLocaleString()}</td>
                  <td className="text-sm">
                    {p.amount_without_vat
                      ? <><span className="font-medium">₪{p.amount_without_vat.toLocaleString()}</span><span className="text-gray-400 text-[10px] ml-1">excl. VAT</span></>
                      : '—'}
                  </td>
                  <td className="text-sm">{p.purchaser_name || '—'}</td>
                  <td className="text-xs text-gray-500">{fmtDate(p.purchase_date || p.submitted_at)}</td>
                  <td className="text-xs">
                    {p.parent_line_item_id && liMap[p.parent_line_item_id] ? (
                      <div>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 text-xs font-medium">
                          {liMap[p.parent_line_item_id]}
                        </span>
                        <div className="text-[10px] text-gray-400 mt-0.5">₪ charge → deducted from this row</div>
                      </div>
                    ) : (
                      <span className="text-gray-300">standalone</span>
                    )}
                  </td>
                  <td>
                    {p.receipt_url ? (
                      <a href={p.receipt_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink size={11} /> View
                      </a>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td>
                    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', STATUS_COLORS[p.approval_status] || STATUS_COLORS.Pending)}>
                      {p.approval_status}
                    </span>
                    {p.approved_by && <div className="text-[10px] text-gray-400 mt-0.5">by {p.approved_by}</div>}
                  </td>
                  {(isEditor || isAdmin) && (
                    <td>
                      <div className="flex items-center gap-1.5">
                        {p.approval_status === 'Pending' && (
                          <>
                            <button
                              onClick={() => approve(p.id)}
                              title="Approve"
                              className="flex items-center gap-0.5 px-2 py-1 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg hover:bg-green-100 font-semibold"
                            >
                              <Check size={11} /> ✓
                            </button>
                            <button
                              onClick={() => reject(p.id)}
                              title="Reject"
                              className="flex items-center gap-0.5 px-2 py-1 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg hover:bg-red-100 font-semibold"
                            >
                              ✗
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => remove(p.id)}
                            title="Delete"
                            className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                  <td colSpan={2} className="font-bold text-sm py-3 px-3">Totals ({filtered.length} purchases)</td>
                  <td className="font-bold px-3 text-sm">₪{filtered.reduce((s, p) => s + (p.total_amount || 0), 0).toLocaleString()}</td>
                  <td className="font-bold px-3 text-sm text-gray-500">₪{filtered.reduce((s, p) => s + (p.amount_without_vat || 0), 0).toLocaleString()}</td>
                  <td colSpan={isEditor || isAdmin ? 6 : 5} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Form URL */}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
        <CreditCard size={12} />
        <span>Form URL:</span>
        <code className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 select-all">{formUrl}</code>
      </div>
    </div>
  );
}
