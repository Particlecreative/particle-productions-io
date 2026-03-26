import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Settings2, ExternalLink, ClipboardCopy, Check as CheckIcon, FileSpreadsheet } from 'lucide-react';
import {
  getSuppliers, upsertSupplier, updateSupplier, deleteSupplier,
  getProductions, generateId,
} from '../lib/dataService';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import ExportMenu from '../components/ui/ExportMenu';
import ImportSuppliersModal from '../components/shared/ImportSuppliersModal';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import clsx from 'clsx';

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

const DEALER_TYPE_LABELS = {
  osek_patur:  'Osek Patur (Exempt)',
  osek_murshe: 'Osek Murshe',
  ltd:         'Ltd. Company',
  foreign:     'Foreign / Other',
};

// ── Column definitions ──────────────────────────────────────────────────────
const ALL_COLS = [
  { key: 'full_name',       label: 'Name',           defaultVisible: true  },
  { key: 'role',            label: 'Role',            defaultVisible: true  },
  { key: 'email',           label: 'Email',           defaultVisible: true  },
  { key: 'phone',           label: 'Phone',           defaultVisible: true  },
  { key: 'business_type',   label: 'Business',        defaultVisible: true  },
  { key: 'supplier_type',   label: 'Type',            defaultVisible: true  },
  { key: 'dealer_type',     label: 'Dealer Type',     defaultVisible: false },
  { key: 'productions',     label: 'Productions',     defaultVisible: true  },
  { key: 'source',          label: 'Source',          defaultVisible: true  },
  { key: 'id_number',       label: 'ID / TZ',         defaultVisible: false },
  { key: 'bank_name',       label: 'Bank',            defaultVisible: false },
  { key: 'account_number',  label: 'Account No.',     defaultVisible: false },
  { key: 'branch',          label: 'Branch',          defaultVisible: false },
  { key: 'swift',           label: 'SWIFT',           defaultVisible: false },
  { key: 'food_restrictions', label: 'Food',          defaultVisible: false },
  { key: 'dietary_notes',   label: 'Dietary',         defaultVisible: false },
  { key: 'notes',           label: 'Notes',           defaultVisible: false },
];

const DEFAULT_HIDDEN = ALL_COLS.filter(c => !c.defaultVisible).map(c => c.key);

export default function Suppliers() {
  const { brandId } = useBrand();
  const { isEditor } = useAuth();

  const [tab, setTab] = useState('list'); // 'list' | 'dashboard'
  const [suppliers, setSuppliers] = useState([]);
  const [productions, setProductions] = useState([]);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProd, setFilterProd] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Column visibility — persisted to localStorage
  const [hiddenCols, setHiddenCols] = useState(() => {
    try {
      const saved = localStorage.getItem('cp_suppliers_cols');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_HIDDEN;
  });
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef(null);

  // Load async data
  useEffect(() => {
    async function load() {
      const [supp, prods] = await Promise.all([
        Promise.resolve(getSuppliers(brandId)),
        Promise.resolve(getProductions(brandId)),
      ]);
      setSuppliers(Array.isArray(supp) ? supp : []);
      setProductions(Array.isArray(prods) ? prods : []);
    }
    load();
  }, [brandId]);

  // Persist column visibility
  useEffect(() => {
    try { localStorage.setItem('cp_suppliers_cols', JSON.stringify(hiddenCols)); } catch {}
  }, [hiddenCols]);

  // Inline add state
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!showColPanel) return;
    function onOutside(e) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target)) setShowColPanel(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showColPanel]);

  async function refresh() {
    const supp = await Promise.resolve(getSuppliers(brandId));
    setSuppliers(Array.isArray(supp) ? supp : []);
  }
  function vis(key) { return !hiddenCols.includes(key); }
  function toggleCol(key) {
    setHiddenCols(h => h.includes(key) ? h.filter(k => k !== key) : [...h, key]);
  }

  const filtered = useMemo(() => {
    const brandProdIds = new Set(productions.map(p => p.id));
    let list = suppliers.filter(s => {
      const prods = s.productions || [];
      // Show supplier if they're linked to any production in this brand, or if no productions yet (unassigned)
      return prods.length === 0 || prods.some(pid => brandProdIds.has(pid));
    });
    if (filterType) list = list.filter(s => s.supplier_type === filterType);
    if (filterProd) list = list.filter(s => (s.productions || []).includes(filterProd));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.role || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, filterType, filterProd, search]);

  function handleDelete(id) {
    if (!confirm('Delete this supplier?')) return;
    deleteSupplier(id);
    refresh();
  }

  function openEdit(s) { setEditingSupplier(s); setShowModal(true); }

  function formLink(type) {
    const base = window.location.origin;
    return `${base}/supplier-form/${filterProd}?type=${type}`;
  }

  function copyLink(type) {
    navigator.clipboard.writeText(formLink(type)).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  // ── DASHBOARD DATA ──────────────────────────────────────────────
  const totalCount = suppliers.length;
  const onSetCount = suppliers.filter(s => s.supplier_type === 'production').length;
  const postCount  = suppliers.filter(s => s.supplier_type === 'post_production').length;
  const pieData = [
    { name: 'On-Set', value: onSetCount,  fill: '#3b82f6' },
    { name: 'Post',   value: postCount,   fill: '#8b5cf6' },
    { name: 'Other',  value: totalCount - onSetCount - postCount, fill: '#d1d5db' },
  ].filter(d => d.value > 0);

  const roleCounts = useMemo(() => {
    const map = {};
    suppliers.forEach(s => {
      const r = (s.role || 'Unknown').trim();
      map[r] = (map[r] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [suppliers]);

  const prodCounts = useMemo(() => {
    const map = {};
    suppliers.forEach(s => {
      (s.productions || []).forEach(pid => {
        map[pid] = (map[pid] || 0) + 1;
      });
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([pid, count]) => ({ name: pid, count }));
  }, [suppliers]);

  const thisMonth = useMemo(() => {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    return suppliers.filter(s => s.created_at && new Date(s.created_at) >= start).length;
  }, [suppliers]);

  const exportRows = useMemo(() => filtered.map(s => ({
    ...s,
    productions: (s.productions || []).join(', '),
  })), [filtered]);

  const EXPORT_COLS = ALL_COLS.filter(c => vis(c.key));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-3xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Suppliers
        </h1>
        <div className="flex items-center gap-3">
          {isEditor && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-sm font-semibold text-gray-600 hover:text-blue-700 transition-all"
            >
              <FileSpreadsheet size={15} /> Import Crew List
            </button>
          )}
          <ExportMenu rows={exportRows} columns={EXPORT_COLS} filename="suppliers" title="Suppliers" />
        </div>
      </div>

      {/* Inner tabs */}
      <div className="brand-tabs mb-6">
        {['list', 'dashboard'].map(t => (
          <button
            key={t}
            className={clsx('brand-tab', tab === t && 'active')}
            onClick={() => setTab(t)}
          >
            {t === 'list' ? 'List' : 'Dashboard'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="brand-input pl-8"
                style={{ width: 220 }}
                placeholder="Search name / email / role…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="brand-input"
              style={{ width: 160 }}
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="production">On-Set</option>
              <option value="post_production">Post-Production</option>
            </select>
            <select
              className="brand-input"
              style={{ width: 200 }}
              value={filterProd}
              onChange={e => setFilterProd(e.target.value)}
            >
              <option value="">All Productions</option>
              {productions.map(p => (
                <option key={p.id} value={p.id}>{p.id} — {p.project_name}</option>
              ))}
            </select>
            {(search || filterType || filterProd) && (
              <button
                className="text-xs text-blue-500 hover:underline"
                onClick={() => { setSearch(''); setFilterType(''); setFilterProd(''); }}
              >
                Clear
              </button>
            )}

            {/* Column toggle */}
            <div className="relative ml-auto" ref={colPanelRef}>
              <button
                onClick={() => setShowColPanel(v => !v)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
                  showColPanel
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                )}
              >
                <Settings2 size={13} /> Columns
              </button>
              {showColPanel && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 z-30 p-3" style={{ width: 200 }}>
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Show / Hide Columns</div>
                  {ALL_COLS.filter(c => c.key !== 'full_name').map(col => (
                    <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hiddenCols.includes(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="accent-blue-600"
                      />
                      <span className="text-xs text-gray-700">{col.label}</span>
                    </label>
                  ))}
                  <button
                    className="text-[10px] text-blue-500 hover:underline mt-2"
                    onClick={() => setHiddenCols(DEFAULT_HIDDEN)}
                  >
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>

            <div className="text-sm text-gray-400">
              {filtered.length} supplier{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="brand-card p-0 overflow-hidden">
            <div className="table-scroll-wrapper">
              <table className="data-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    {vis('role')            && <th>Role</th>}
                    {vis('email')           && <th>Email</th>}
                    {vis('phone')           && <th>Phone</th>}
                    {vis('business_type')   && <th>Business</th>}
                    {vis('supplier_type')   && <th>Type</th>}
                    {vis('dealer_type')     && <th>Dealer Type</th>}
                    {vis('productions')     && <th>Productions</th>}
                    {vis('source')          && <th>Source</th>}
                    {vis('id_number')       && <th>ID / TZ</th>}
                    {vis('bank_name')       && <th>Bank</th>}
                    {vis('account_number')  && <th>Account No.</th>}
                    {vis('branch')          && <th>Branch</th>}
                    {vis('swift')           && <th>SWIFT</th>}
                    {vis('food_restrictions') && <th>Food</th>}
                    {vis('dietary_notes')   && <th>Dietary</th>}
                    {vis('notes')           && <th>Notes</th>}
                    {isEditor && <th style={{ width: 70 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="text-center py-12 text-gray-400 text-sm">
                        No suppliers found.
                      </td>
                    </tr>
                  ) : filtered.map(s => (
                    <tr key={s.id} className="group">
                      <td className="font-medium text-sm">{s.full_name}</td>
                      {vis('role')          && <td className="text-sm text-gray-500">{s.role || '—'}</td>}
                      {vis('email')         && <td className="text-xs text-gray-500">{s.email || '—'}</td>}
                      {vis('phone')         && <td className="text-xs text-gray-500">{s.phone || '—'}</td>}
                      {vis('business_type') && (
                        <td className="text-xs text-gray-500">
                          {s.business_type === 'company' ? (s.company_name || 'Company') : 'Individual'}
                        </td>
                      )}
                      {vis('supplier_type') && (
                        <td>
                          <span
                            className={clsx('badge text-xs',
                              s.supplier_type === 'post_production' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              s.supplier_type === 'production' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-gray-100 text-gray-500 border border-gray-200'
                            )}
                            style={
                              s.supplier_type === 'post_production' ? { boxShadow: '0 0 6px 1px rgba(139,92,246,0.25)' } :
                              s.supplier_type === 'production' ? { boxShadow: '0 0 6px 1px rgba(59,130,246,0.25)' } :
                              undefined
                            }
                          >
                            {s.supplier_type === 'post_production' ? 'Post' :
                             s.supplier_type === 'production' ? 'On-Set' : '—'}
                          </span>
                        </td>
                      )}
                      {vis('dealer_type') && (
                        <td>
                          <span className="text-xs text-gray-500">{DEALER_TYPE_LABELS[s.dealer_type] || '—'}</span>
                        </td>
                      )}
                      {vis('productions') && (
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(s.productions || []).slice(0, 3).map(pid => {
                              const prod = productions.find(p => p.id === pid);
                              return (
                                <span key={pid} className="badge text-xs bg-gray-100 text-gray-600 border border-gray-200 font-mono">
                                  {prod?.id || pid}
                                </span>
                              );
                            })}
                            {(s.productions || []).length > 3 && (
                              <span className="text-xs text-gray-400">+{s.productions.length - 3}</span>
                            )}
                          </div>
                        </td>
                      )}
                      {vis('source') && (
                        <td>
                          <span className={clsx('badge text-xs',
                            s.source === 'form'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-200'
                          )}>
                            {s.source === 'form' ? 'Form' : 'Manual'}
                          </span>
                        </td>
                      )}
                      {vis('id_number')       && <td className="text-xs text-gray-500">{s.id_number || '—'}</td>}
                      {vis('bank_name')       && <td className="text-xs text-gray-500">{s.bank_name || '—'}</td>}
                      {vis('account_number')  && <td className="text-xs font-mono text-gray-500">{s.account_number || '—'}</td>}
                      {vis('branch')          && <td className="text-xs text-gray-500">{s.branch || '—'}</td>}
                      {vis('swift')           && <td className="text-xs font-mono text-gray-500">{s.swift || '—'}</td>}
                      {vis('food_restrictions') && <td className="text-xs text-gray-500">{s.food_restrictions || '—'}</td>}
                      {vis('dietary_notes')   && <td className="text-xs text-gray-500">{s.dietary_notes || '—'}</td>}
                      {vis('notes')           && <td className="text-xs text-gray-500 max-w-[160px] truncate">{s.notes || '—'}</td>}
                      {isEditor && (
                        <td>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Inline Add Row — always visible ── */}
            {isEditor && (
              <div className="border-t border-dashed border-gray-200">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-600">Add Supplier</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Production Form */}
                    <div className={clsx(
                      'flex items-center gap-1 px-3 py-2 rounded-lg border transition-all',
                      filterProd ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50 opacity-50'
                    )}>
                      <div className="flex flex-col">
                        <span className={clsx('text-xs font-semibold', filterProd ? 'text-blue-700' : 'text-gray-500')}>
                          📋 On-Set Supplier Form
                        </span>
                        <span className={clsx('text-[10px]', filterProd ? 'text-blue-400' : 'text-gray-400')}>
                          {filterProd ? 'share link with production supplier' : 'select a PRD filter to enable'}
                        </span>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <a
                          href={filterProd ? formLink('production') : '#'}
                          target={filterProd ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          className={clsx('p-1.5 rounded', filterProd ? 'hover:bg-blue-100 text-blue-500' : 'text-gray-300 pointer-events-none')}
                          title="Open form"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          onClick={() => filterProd && copyLink('production')}
                          disabled={!filterProd}
                          className={clsx('p-1.5 rounded', filterProd ? 'hover:bg-blue-100 text-blue-500' : 'text-gray-300 cursor-default')}
                          title="Copy link"
                        >
                          {copied === 'production' ? <CheckIcon size={12} /> : <ClipboardCopy size={12} />}
                        </button>
                      </div>
                    </div>
                    {/* Post-Production Form */}
                    <div className={clsx(
                      'flex items-center gap-1 px-3 py-2 rounded-lg border transition-all',
                      filterProd ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50 opacity-50'
                    )}>
                      <div className="flex flex-col">
                        <span className={clsx('text-xs font-semibold', filterProd ? 'text-purple-700' : 'text-gray-500')}>
                          📋 Post-Production Form
                        </span>
                        <span className={clsx('text-[10px]', filterProd ? 'text-purple-400' : 'text-gray-400')}>
                          {filterProd ? 'share link with post-production supplier' : 'select a PRD filter to enable'}
                        </span>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <a
                          href={filterProd ? formLink('post_production') : '#'}
                          target={filterProd ? '_blank' : undefined}
                          rel="noopener noreferrer"
                          className={clsx('p-1.5 rounded', filterProd ? 'hover:bg-purple-100 text-purple-500' : 'text-gray-300 pointer-events-none')}
                          title="Open form"
                        >
                          <ExternalLink size={12} />
                        </a>
                        <button
                          onClick={() => filterProd && copyLink('post_production')}
                          disabled={!filterProd}
                          className={clsx('p-1.5 rounded', filterProd ? 'hover:bg-purple-100 text-purple-500' : 'text-gray-300 cursor-default')}
                          title="Copy link"
                        >
                          {copied === 'post_production' ? <CheckIcon size={12} /> : <ClipboardCopy size={12} />}
                        </button>
                      </div>
                    </div>
                    {/* Manual Fill */}
                    <button
                      onClick={() => { setEditingSupplier(null); setShowModal(true); }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 bg-white text-xs font-semibold text-gray-600 hover:text-gray-800 transition-all"
                    >
                      ✏ Fill Manually
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Suppliers', value: totalCount, color: 'blue' },
              { label: 'On-Set',          value: onSetCount, color: 'blue' },
              { label: 'Post-Production', value: postCount,  color: 'purple' },
              { label: 'New This Month',  value: thisMonth,  color: 'green' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`brand-card border-l-4 border-${color}-400`}>
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className={`text-3xl font-black text-${color}-600 animate-count-up`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="brand-card">
              <div className="text-sm font-bold mb-4" style={{ color: 'var(--brand-primary)' }}>Supplier Types</div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-gray-300 text-sm">No data</div>
              )}
            </div>

            <div className="brand-card">
              <div className="text-sm font-bold mb-4" style={{ color: 'var(--brand-primary)' }}>Top Roles</div>
              {roleCounts.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={roleCounts} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {roleCounts.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-gray-300 text-sm">No data</div>
              )}
            </div>
          </div>

          {prodCounts.length > 0 && (
            <div className="brand-card">
              <div className="text-sm font-bold mb-4" style={{ color: 'var(--brand-primary)' }}>Productions by Supplier Count</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={prodCounts} margin={{ left: 10, right: 20, bottom: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {prodCounts.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      {showModal && (
        <SupplierModal
          supplier={editingSupplier}
          productions={productions}
          defaultProd={filterProd}
          onClose={() => setShowModal(false)}
          onSave={(data) => {
            if (editingSupplier) {
              updateSupplier(editingSupplier.id, data);
            } else {
              upsertSupplier({ ...data, id: generateId('sup'), source: 'manual' });
            }
            refresh();
            setShowModal(false);
          }}
        />
      )}

      {/* ── IMPORT CREW LIST MODAL ── */}
      {showImportModal && (
        <ImportSuppliersModal
          brandId={brandId}
          productionId={filterProd || null}
          onClose={() => setShowImportModal(false)}
          onImported={() => refresh()}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, productions, defaultProd, onClose, onSave }) {
  const [modalTab, setModalTab] = useState('info'); // 'info' | 'banking' | 'productions'
  const [form, setForm] = useState({
    full_name:       supplier?.full_name       || '',
    role:            supplier?.role            || '',
    email:           supplier?.email           || '',
    phone:           supplier?.phone           || '',
    business_type:   supplier?.business_type   || 'individual',
    company_name:    supplier?.company_name    || '',
    tax_id:          supplier?.tax_id          || '',
    supplier_type:   supplier?.supplier_type   || '',
    id_number:       supplier?.id_number       || '',
    bank_name:       supplier?.bank_name       || '',
    account_number:  supplier?.account_number  || '',
    branch:          supplier?.branch          || '',
    swift:           supplier?.swift           || '',
    food_restrictions: supplier?.food_restrictions || '',
    dietary_notes:   supplier?.dietary_notes   || '',
    notes:           supplier?.notes           || '',
    dealer_type:     supplier?.dealer_type     || '',
    productions:     supplier?.productions     || (defaultProd ? [defaultProd] : []),
  });

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); }

  function toggleProd(pid) {
    setForm(p => ({
      ...p,
      productions: p.productions.includes(pid)
        ? p.productions.filter(x => x !== pid)
        : [...p.productions, pid],
    }));
  }

  const MODAL_TABS = [
    { id: 'info',        label: 'Info' },
    { id: 'banking',     label: 'Banking' },
    { id: 'productions', label: `Productions (${form.productions.length})` },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
            {supplier ? 'Edit Supplier' : 'Add Supplier'}
          </h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-gray-200 mb-4 gap-0">
          {MODAL_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setModalTab(t.id)}
              className={clsx(
                'px-4 py-2 text-xs font-semibold border-b-2 transition-all -mb-px',
                modalTab === t.id
                  ? 'border-[var(--brand-accent)] text-[var(--brand-primary)]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {/* ── INFO TAB ── */}
          {modalTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="field-label">Full Name *</label>
                  <input className="brand-input" required value={form.full_name}
                    onChange={e => set('full_name', e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="field-label">Role</label>
                  <input className="brand-input" value={form.role} onChange={e => set('role', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Supplier Type</label>
                  <select className="brand-input" value={form.supplier_type} onChange={e => set('supplier_type', e.target.value)}>
                    <option value="">—</option>
                    <option value="production">On-Set</option>
                    <option value="post_production">Post-Production</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Email</label>
                  <input className="brand-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Phone</label>
                  <input className="brand-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">ID / TZ Number</label>
                  <input className="brand-input" value={form.id_number} onChange={e => set('id_number', e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Business Type</label>
                  <select className="brand-input" value={form.business_type} onChange={e => set('business_type', e.target.value)}>
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Dealer Type (VAT)</label>
                  <select className="brand-input" value={form.dealer_type} onChange={e => set('dealer_type', e.target.value)}>
                    <option value="">— Not set —</option>
                    <option value="osek_patur">Osek Patur (Exempt, no VAT)</option>
                    <option value="osek_murshe">Osek Murshe (17% VAT)</option>
                    <option value="ltd">Ltd. Company (17% VAT)</option>
                    <option value="foreign">Foreign / Other</option>
                  </select>
                </div>
                {form.business_type === 'company' && (
                  <>
                    <div>
                      <label className="field-label">Company Name</label>
                      <input className="brand-input" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">VAT / Tax ID</label>
                      <input className="brand-input" value={form.tax_id} onChange={e => set('tax_id', e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              {/* Food Preferences (production type) */}
              {(form.supplier_type === 'production' || form.supplier_type === '') && (
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Food Preferences</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Food Restrictions</label>
                      <input className="brand-input" value={form.food_restrictions} onChange={e => set('food_restrictions', e.target.value)} placeholder="e.g. Vegetarian, Halal…" />
                    </div>
                    <div>
                      <label className="field-label">Dietary Notes</label>
                      <input className="brand-input" value={form.dietary_notes} onChange={e => set('dietary_notes', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BANKING TAB ── */}
          {modalTab === 'banking' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Bank Name</label>
                <input className="brand-input" value={form.bank_name} onChange={e => set('bank_name', e.target.value)} />
              </div>
              <div>
                <label className="field-label">Account Number</label>
                <input className="brand-input" value={form.account_number} onChange={e => set('account_number', e.target.value)} />
              </div>
              <div>
                <label className="field-label">Branch</label>
                <input className="brand-input" value={form.branch} onChange={e => set('branch', e.target.value)} />
              </div>
              <div>
                <label className="field-label">SWIFT / BIC</label>
                <input className="brand-input" value={form.swift} onChange={e => set('swift', e.target.value)} />
              </div>
            </div>
          )}

          {/* ── PRODUCTIONS TAB ── */}
          {modalTab === 'productions' && (
            <div className="space-y-4">
              <div>
                <label className="field-label mb-2 block">Linked Productions</label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {productions.map(p => (
                    <label key={p.id} className={clsx(
                      'flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs cursor-pointer transition-all',
                      form.productions.includes(p.id)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}>
                      <input type="checkbox" checked={form.productions.includes(p.id)}
                        onChange={() => toggleProd(p.id)} className="accent-blue-600" />
                      <span className="font-mono">{p.id}</span>
                      <span className="text-gray-400 truncate max-w-[100px]">{p.project_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="field-label">Notes</label>
                <textarea className="brand-input resize-none" rows={3} value={form.notes}
                  onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={() => form.full_name.trim() && onSave(form)}
            disabled={!form.full_name.trim()}
            className="btn-cta flex-1 disabled:opacity-50"
          >
            {supplier ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
