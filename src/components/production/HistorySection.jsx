import { useState, useEffect } from 'react';
import { RotateCcw, Clock } from 'lucide-react';
import { getChangeHistory, updateProduction } from '../../lib/dataService';
import { formatIST } from '../../lib/timezone';
import { useAuth } from '../../context/AuthContext';

export default function HistorySection({ productionId }) {
  const [history, setHistory] = useState([]);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    Promise.resolve(getChangeHistory(productionId)).then(r => setHistory(Array.isArray(r) ? r : []));
  }, [productionId]);

  async function handleRewind(entry) {
    if (!confirm(`Rewind "${entry.field}" from "${entry.new_value}" back to "${entry.old_value}"?`)) return;
    updateProduction(productionId, { [entry.field]: entry.old_value }, user?.id, user?.name);
    const r = await Promise.resolve(getChangeHistory(productionId));
    setHistory(Array.isArray(r) ? r : []);
  }

  if (history.length === 0) {
    return (
      <div className="brand-card text-center py-10">
        <Clock size={24} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">No change history yet.</p>
      </div>
    );
  }

  return (
    <div className="brand-card">
      <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--brand-primary)' }}>
        Change History
      </h3>
      <div className="space-y-3">
        {history.map(entry => (
          <div
            key={entry.id}
            className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0"
          >
            <div className="w-2 h-2 rounded-full bg-gray-300 mt-2 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <strong>{entry.user_name || 'System'}</strong> changed{' '}
                <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{entry.field}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                <span className="line-through text-red-400">{String(entry.old_value ?? '—')}</span>
                {' → '}
                <span className="text-green-600">{String(entry.new_value ?? '—')}</span>
              </div>
              <div className="text-xs text-gray-300 mt-0.5">
                {formatIST(entry.created_at)}
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => handleRewind(entry)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-orange-200 text-orange-600 hover:bg-orange-50 transition-all flex-shrink-0"
                title="Rewind this change"
              >
                <RotateCcw size={11} />
                Rewind
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
