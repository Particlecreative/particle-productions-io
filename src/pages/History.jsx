import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { History as HistoryIcon, Search, Filter, RefreshCw, RotateCcw, X } from 'lucide-react';
import { getAllChangeHistory, updateProduction, getProduction } from '../lib/dataService';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { formatIST } from '../lib/timezone';

const FIELD_LABELS = {
  stage: 'Stage',
  project_name: 'Project Name',
  producer: 'Producer',
  planned_budget_2026: 'Planned Budget',
  planned_start: 'Start Date',
  planned_end: 'End Date',
  product_type: 'Product Type',
  id: 'Production ID',
  view_order: 'View Order',
};

function formatValue(field, value) {
  if (value === null || value === undefined || value === '') return <em className="text-gray-300">empty</em>;
  if (Array.isArray(value)) return value.join(', ');
  if (field === 'planned_budget_2026' && typeof value === 'number') return `$${value.toLocaleString()}`;
  return String(value);
}

export default function History() {
  const { brandId } = useBrand();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');
  const [filterField, setFilterField] = useState('');
  const [filterUser, setFilterUser] = useState(searchParams.get('user') || '');
  const [filterProd, setFilterProd] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Restore modal state
  const [restoreEntry, setRestoreEntry] = useState(null); // history entry to restore
  const [restoreCurrentVal, setRestoreCurrentVal] = useState(undefined);

  async function load() {
    const h = await Promise.resolve(getAllChangeHistory());
    setHistory(Array.isArray(h) ? h : []);
  }

  function openRestoreModal(entry) {
    const prod = getProduction(entry.production_id);
    setRestoreCurrentVal(prod ? prod[entry.field] : undefined);
    setRestoreEntry(entry);
  }

  function confirmRestore() {
    if (!restoreEntry) return;
    updateProduction(
      restoreEntry.production_id,
      { [restoreEntry.field]: restoreEntry.old_value },
      user?.id,
      user?.name || 'Someone'
    );
    setRestoreEntry(null);
    load();
  }

  useEffect(() => { load(); }, []);

  // Collect unique values for filter dropdowns
  const uniqueFields = useMemo(() => {
    const s = new Set(history.map(h => h.field).filter(Boolean));
    return [...s].sort();
  }, [history]);

  const uniqueUsers = useMemo(() => {
    const s = new Set(history.map(h => h.user_name).filter(Boolean));
    return [...s].sort();
  }, [history]);

  const uniqueProds = useMemo(() => {
    const s = new Set(history.map(h => h.production_id).filter(Boolean));
    return [...s].sort();
  }, [history]);

  const filtered = useMemo(() => {
    let list = [...history];
    if (filterField) list = list.filter(h => h.field === filterField);
    if (filterUser) list = list.filter(h => h.user_name === filterUser);
    if (filterProd) list = list.filter(h => h.production_id === filterProd);
    if (dateFrom) list = list.filter(h => h.created_at >= dateFrom);
    if (dateTo) list = list.filter(h => h.created_at <= dateTo + 'T23:59:59');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(h =>
        (h.production_id || '').toLowerCase().includes(q) ||
        (h.field || '').toLowerCase().includes(q) ||
        (h.user_name || '').toLowerCase().includes(q) ||
        String(h.new_value || '').toLowerCase().includes(q) ||
        String(h.old_value || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [history, filterField, filterUser, filterProd, dateFrom, dateTo, search]);

  function clearFilters() {
    setSearch('');
    setFilterField('');
    setFilterUser('');
    setFilterProd('');
    setDateFrom('');
    setDateTo('');
  }

  const hasFilters = search || filterField || filterUser || filterProd || dateFrom || dateTo;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
            Change History
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} of {history.length} entries
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-sm transition-all"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="brand-card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: 'var(--brand-primary)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>Filters</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-blue-500 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative col-span-2 md:col-span-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="brand-input pl-8 w-full"
            />
          </div>

          {/* Production */}
          <select value={filterProd} onChange={e => setFilterProd(e.target.value)} className="brand-input">
            <option value="">All productions</option>
            {uniqueProds.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Field */}
          <select value={filterField} onChange={e => setFilterField(e.target.value)} className="brand-input">
            <option value="">All fields</option>
            {uniqueFields.map(f => <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>)}
          </select>

          {/* User */}
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="brand-input">
            <option value="">All users</option>
            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="brand-input"
            title="From date"
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="brand-input"
            title="To date"
          />
        </div>
      </div>

      {/* Restore Preview Modal */}
      {restoreEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <RotateCcw size={16} className="text-orange-500" /> Restore Value
              </h3>
              <button onClick={() => setRestoreEntry(null)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-sm mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase w-24">Field</span>
                <span className="font-semibold px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--brand-bg)', color: 'var(--brand-primary)' }}>
                  {FIELD_LABELS[restoreEntry.field] || restoreEntry.field}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase w-24 pt-0.5">Current</span>
                <span className="text-gray-700">{formatValue(restoreEntry.field, restoreCurrentVal)}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase w-24 pt-0.5">Restore to</span>
                <span className="font-semibold text-orange-700">{formatValue(restoreEntry.field, restoreEntry.old_value)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRestoreEntry(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestore}
                className="flex-1 btn-cta py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
              >
                <RotateCcw size={13} /> Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Production</th>
                <th>Field</th>
                <th>From</th>
                <th>To</th>
                <th>Changed By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400 text-sm">
                    {hasFilters ? 'No entries match your filters.' : 'No change history yet.'}
                  </td>
                </tr>
              ) : filtered.map(entry => (
                <tr key={entry.id}>
                  <td className="text-xs text-gray-500 whitespace-nowrap">
                    {entry.created_at ? formatIST(entry.created_at) : '—'}
                  </td>
                  <td>
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>
                      {entry.production_id || '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-bg)', color: 'var(--brand-primary)' }}>
                      {FIELD_LABELS[entry.field] || entry.field || '—'}
                    </span>
                  </td>
                  <td className="text-sm text-gray-500">
                    <span className="line-through opacity-60">{formatValue(entry.field, entry.old_value)}</span>
                  </td>
                  <td className="text-sm text-gray-800 font-medium">
                    {formatValue(entry.field, entry.new_value)}
                  </td>
                  <td>
                    {entry.user_name ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {entry.user_name}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">system</span>
                    )}
                  </td>
                  <td>
                    {entry.production_id && entry.field && entry.old_value !== undefined && (
                      <button
                        onClick={() => openRestoreModal(entry)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-all"
                        title="Restore this value"
                      >
                        <RotateCcw size={11} /> Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
