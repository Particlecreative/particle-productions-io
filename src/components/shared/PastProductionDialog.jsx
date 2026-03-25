import { useState } from 'react';
import { Calendar, CheckCircle, X, Loader } from 'lucide-react';
import { updateProduction, getLineItems, updateLineItem } from '../../lib/dataService';
import { useAuth } from '../../context/AuthContext';

/**
 * PastProductionDialog — shown when a production (or batch of productions)
 * has a timeline in the past. Offers to auto-mark everything as Completed.
 *
 * Props:
 *   production  — single prod object { id, project_name, planned_end }
 *                 OR { batch: [prod, prod, ...] } for a batch from import
 *   onClose     — callback when dismissed (also called after confirming)
 */
export default function PastProductionDialog({ production, onClose }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState('');

  const isBatch = Array.isArray(production?.batch);
  const prods = isBatch ? production.batch : [production].filter(Boolean);
  const prodCount = prods.length;
  const displayName = isBatch
    ? `${prodCount} production${prodCount !== 1 ? 's' : ''}`
    : (production?.project_name || 'This production');
  const endDate = !isBatch && production?.planned_end
    ? new Date(production.planned_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Check if already prompted (per production)
  function isAlreadyChecked(id) {
    return localStorage.getItem(`cp_past_checked_${id}`) === '1';
  }

  const unCheckedProds = prods.filter(p => !isAlreadyChecked(p.id));
  if (unCheckedProds.length === 0) {
    // All already handled — close immediately
    setTimeout(onClose, 0);
    return null;
  }

  async function handleConfirm() {
    setLoading(true);
    let totalItems = 0;
    for (const prod of unCheckedProds) {
      await Promise.resolve(updateProduction(prod.id, { stage: 'Completed', accounting_status: 'Completed' }, user?.id, user?.name));
      const rawItems = await Promise.resolve(getLineItems(prod.id));
      const items = Array.isArray(rawItems) ? rawItems : [];
      const unpaid = items.filter(li => li.payment_status !== 'Paid');
      for (const li of unpaid) {
        await Promise.resolve(updateLineItem(li.id, { payment_status: 'Paid', invoice_status: 'Received' }));
      }
      totalItems += unpaid.length;
      localStorage.setItem(`cp_past_checked_${prod.id}`, '1');
    }
    setSummary(
      `${unCheckedProds.length} production${unCheckedProds.length !== 1 ? 's' : ''} marked Completed` +
      (totalItems > 0 ? ` · ${totalItems} line item${totalItems !== 1 ? 's' : ''} marked Paid` : '')
    );
    setLoading(false);
    setDone(true);
  }

  function handleLater() {
    unCheckedProds.forEach(p => localStorage.setItem(`cp_past_checked_${p.id}`, '1'));
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleLater}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-auto"
        onClick={e => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-4">
            <CheckCircle size={40} className="mx-auto mb-3 text-green-500" />
            <p className="font-semibold text-gray-800 text-sm">{summary}</p>
            <button onClick={onClose} className="mt-4 btn-cta w-full">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Calendar size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-sm">Past timeline detected</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isBatch
                    ? `${prodCount} imported productions have timelines in the past.`
                    : `"${displayName}" ended on ${endDate}.`
                  }
                </p>
              </div>
              <button onClick={handleLater} className="ml-auto text-gray-300 hover:text-gray-500 shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-5">
              Are all invoices paid? You can auto-mark {isBatch ? 'these productions' : 'this production'} as{' '}
              <strong>Completed</strong> and all unpaid line items as <strong>Paid</strong>.
            </div>

            {isBatch && (
              <div className="mb-4 max-h-32 overflow-auto rounded-lg border border-gray-200 text-xs">
                {unCheckedProds.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 last:border-0">
                    <span className="font-mono text-gray-400">{p.id}</span>
                    <span className="text-gray-700 truncate">{p.project_name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleLater}
                className="btn-secondary flex-1 text-sm"
                disabled={loading}
              >
                Later
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="btn-cta flex-1 text-sm flex items-center justify-center gap-2"
              >
                {loading ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {loading ? 'Updating…' : `Yes — mark Completed`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
