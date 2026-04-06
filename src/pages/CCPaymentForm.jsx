import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, CreditCard } from 'lucide-react';
import { generateId } from '../lib/dataService';

const VAT_RATE = 1.18; // Israeli VAT 18%

const STANDALONE_CATEGORIES = [
  'Wardrobe', 'Props', 'Catering', 'Transport', 'Equipment', 'Office', 'Other',
];

// Public API calls (no auth required)
async function publicGet(path) {
  const res = await fetch(`/api/public${path}`);
  if (!res.ok) return null;
  return res.json();
}
async function publicPost(path, body) {
  const res = await fetch(`/api/public${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Submit failed');
  return res.json();
}

export default function CCPaymentForm() {
  const { productionId: prodIdParam } = useParams();
  const [production, setProduction] = useState(null);
  const [lineItems, setLineItems]   = useState([]);
  const [loadError, setLoadError]   = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const prod = await publicGet(`/production/${prodIdParam}`);
        if (!prod) { setLoadError(true); return; }
        setProduction(prod);
        const items = await publicGet(`/line-items/${prod.id}`);
        setLineItems(Array.isArray(items) ? items : []);
      } catch { setLoadError(true); }
    }
    load();
  }, [prodIdParam]);

  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    store_name: '',
    description: '',
    amount_without_vat: '',
    total_amount: '',
    purchase_date: new Date().toISOString().slice(0, 16),
    purchaser_name: '',
    receipt_url: '',
    parent_line_item_id: '',
    category: 'Office',
    notes: '',
  });

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Bidirectional VAT calculation
  function handleTotalChange(val) {
    const total = parseFloat(val);
    const without = isNaN(total) ? '' : (total / VAT_RATE).toFixed(2);
    setForm(prev => ({ ...prev, total_amount: val, amount_without_vat: without }));
  }

  function handleWithoutVatChange(val) {
    const without = parseFloat(val);
    const total = isNaN(without) ? '' : (without * VAT_RATE).toFixed(2);
    setForm(prev => ({ ...prev, amount_without_vat: val, total_amount: total }));
  }

  // Derive parent line item for type inheritance
  const parentLineItem = useMemo(
    () => lineItems.find(li => li.id === form.parent_line_item_id) || null,
    [lineItems, form.parent_line_item_id]
  );

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const errs = {};
    if (!form.store_name.trim()) errs.store_name = 'Store name is required';
    if (!form.total_amount || parseFloat(form.total_amount) <= 0) errs.total_amount = 'Total amount is required';
    if (!form.purchaser_name.trim()) errs.purchaser_name = 'Purchaser name is required';
    if (!form.purchase_date) errs.purchase_date = 'Purchase date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    const amountWithoutVat = parseFloat(form.amount_without_vat) || 0;
    const totalAmount      = parseFloat(form.total_amount)       || 0;
    const ccId = generateId('cc');

    try {
    // 1. Save CC purchase record via public API
    await publicPost('/cc-purchase', {
      store_name:           form.store_name,
      description:          form.description,
      amount_without_vat:   amountWithoutVat,
      total_amount:         totalAmount,
      purchase_date:        form.purchase_date,
      purchaser_name:       form.purchaser_name,
      receipt_url:          form.receipt_url,
      parent_line_item_id:  form.parent_line_item_id || null,
      notes:                form.notes,
      production_id:        production?.id || prodIdParam,
      category:             form.category || 'Office',
    });

    setSubmitted(true);
    } catch (err) {
      setErrors({ submit: err.message || 'Submission failed. Please try again.' });
    }
    setSubmitting(false);
  }

  const bgStyle = { minHeight: '100vh', background: '#f3f4f6' };

  if (!production) {
    return (
      <div style={bgStyle} className="flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-sm">
          <div className="text-4xl mb-4">💳</div>
          <h2 className="text-xl font-black text-gray-800 mb-2">Form not found</h2>
          <p className="text-sm text-gray-400">
            This payment form link is invalid or the production does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={bgStyle} className="flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center max-w-md w-full">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-gray-800 mb-2">Purchase Submitted!</h2>
          <p className="text-sm text-gray-500 mt-2">
            Your purchase from <strong>{form.store_name}</strong> has been submitted for approval on{' '}
            <strong>{production.project_name}</strong>.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Amount without VAT: <strong>₪{parseFloat(form.amount_without_vat || 0).toLocaleString()}</strong> has been added to the budget.
          </p>
          <p className="text-xs text-gray-400 mt-3">You can close this window.</p>
          <button
            onClick={() => {
              setSubmitted(false);
              setForm({
                store_name: '', description: '', amount_without_vat: '', total_amount: '',
                purchase_date: new Date().toISOString().slice(0, 16),
                purchaser_name: '', receipt_url: '', parent_line_item_id: '', category: 'Office', notes: '',
              });
            }}
            className="mt-5 text-sm text-blue-600 hover:underline"
          >
            Submit another purchase
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle} className="flex items-center justify-center p-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="bg-gray-900 text-white rounded-t-2xl px-6 py-5 flex items-center gap-3">
          <CreditCard size={22} className="opacity-80" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest opacity-60">Credit Card Purchase</div>
            <div className="text-lg font-black">{production.project_name}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Row: Store + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Store Name *</label>
              <input
                required
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 ${errors.store_name ? 'border-red-400' : ''}`}
                placeholder="e.g. Zara, Super Pharm…"
                value={form.store_name}
                onChange={e => { set('store_name', e.target.value); setErrors(prev => ({ ...prev, store_name: undefined })); }}
              />
              {errors.store_name && <p className="text-[10px] text-red-500 mt-0.5">{errors.store_name}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date & Time *</label>
              <input
                required
                type="datetime-local"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={form.purchase_date}
                onChange={e => set('purchase_date', e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">What was bought?</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Wardrobe for talent, props, catering…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>

          {/* Amounts — bidirectional VAT */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Total Price (incl. VAT 18%) ₪ *
              </label>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="0.00"
                value={form.total_amount}
                onChange={e => handleTotalChange(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Amount W/O VAT ₪
                <span className="ml-1 text-[10px] text-blue-500 font-normal">÷ 1.18 auto-calc</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="0.00"
                value={form.amount_without_vat}
                onChange={e => handleWithoutVatChange(e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-0.5">כולל מע״מ 18% | Total ÷ 1.18 = without VAT</p>
            </div>
          </div>

          {/* Purchaser */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Purchaser's Name *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Your full name"
              value={form.purchaser_name}
              onChange={e => set('purchaser_name', e.target.value)}
            />
          </div>

          {/* Receipt URL or Photo Upload */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Receipt / Invoice</label>
            <input
              type="url"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Google Drive / Dropbox link to receipt photo"
              value={form.receipt_url}
              onChange={e => set('receipt_url', e.target.value)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Paste a link, or upload a photo of the receipt:</p>
            <label className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Upload Receipt Photo
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) { alert('File too large (max 10MB)'); return; }
                const reader = new FileReader();
                reader.onload = () => set('receipt_url', reader.result);
                reader.readAsDataURL(file);
              }} />
            </label>
            {form.receipt_url && form.receipt_url.startsWith('data:') && (
              <div className="mt-2 flex items-center gap-2">
                <img src={form.receipt_url} alt="Receipt" className="h-16 rounded border" />
                <span className="text-[10px] text-green-600 font-medium">Photo attached</span>
              </div>
            )}
          </div>

          {/* Link to budget item — shows type in dropdown */}
          {lineItems.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Link to Budget Item (optional)</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                value={form.parent_line_item_id}
                onChange={e => set('parent_line_item_id', e.target.value)}
              >
                <option value="">— Not linked —</option>
                {lineItems.map(li => (
                  <option key={li.id} value={li.id}>
                    [{li.type || 'General'}] {li.item || li.full_name || li.id}
                    {li.planned_budget ? ` — ₪${li.planned_budget.toLocaleString()}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">Attach this purchase to a specific budget line (e.g. Wardrobe).</p>
            </div>
          )}

          {/* Category — shown only when NOT linked to a budget item */}
          {!form.parent_line_item_id && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                value={form.category}
                onChange={e => set('category', e.target.value)}
              >
                {STANDALONE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">Used to categorise this expense in the budget table.</p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Any additional info…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {errors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{errors.submit}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[var(--brand-primary,#030b2e)] text-white font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <CreditCard size={16} />
            {submitting ? 'Submitting...' : 'Submit Purchase for Approval'}
          </button>
        </form>
      </div>
    </div>
  );
}
