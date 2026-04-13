import { useState, useEffect, useMemo, useRef } from 'react';
import { User, ExternalLink, Search, X, Plus, ChevronDown, ChevronRight, Upload, Calendar, Tag, Play, Clock, RefreshCw } from 'lucide-react';
import FileUploadButton, { CloudLinks, detectCloudUrl } from '../components/shared/FileUploadButton';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import { getAllCasting, getProductions, createCastMember, updateCastMember, deleteCastMember, createGanttEvent, generateId } from '../lib/dataService';
import { apiPost, apiGet } from '../lib/apiClient';
import clsx from 'clsx';

const ROLES   = ['Model', 'Actor', 'Actress', 'Extra'];
const PERIODS = ['Perpetually', '1 Year', '6 Months', '3 Months'];
const USAGE_OPTIONS = ['Any Use', 'Digital', 'TV', 'Stills', 'OOH'];

// Format date string — handles both "2026-04-30" and "2026-04-30T00:00:00.000Z"
function fmtDate(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10); // take YYYY-MM-DD only
  const [y, m, day] = s.split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Rights restrictiveness order: Stills most restricted → Any Use least restricted
const RIGHTS_RESTRICTIVENESS = ['Stills', 'OOH', 'TV', 'Digital', 'Any Use'];

const CONTRACT_STATUS_STYLES = {
  'Running':          'bg-green-100 text-green-700 border-green-200',
  'Close to Overdue': 'bg-orange-100 text-orange-700 border-orange-200',
  'Overdue':          'bg-red-100 text-red-700 border-red-200',
  'Done':             'bg-gray-100 text-gray-500 border-gray-200',
};
const CONTRACT_STATUS_ORDER = ['Running', 'Close to Overdue', 'Overdue', 'Done'];

const USAGE_COLORS = {
  'Any Use': 'bg-purple-100 text-purple-700',
  'Digital': 'bg-blue-100   text-blue-700',
  'TV':      'bg-yellow-100 text-yellow-700',
  'Stills':  'bg-pink-100   text-pink-700',
  'OOH':     'bg-teal-100   text-teal-700',
};

function calcEndDate(startDate, period) {
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

// Most restrictive right a member holds
function mostRestrictiveRight(usage) {
  if (!usage || usage.length === 0) return 'No Rights';
  for (const right of RIGHTS_RESTRICTIVENESS) {
    if (usage.includes(right)) return right;
  }
  return usage[0];
}

const BLANK = {
  name: '', photo_url: '', role: 'Model', period: 'Perpetually',
  start_date: '', end_date: '', warning_date: '', contract_status: 'Running',
  usage: [], signed_contract_url: '', contract_manager_name: '', notes: '',
  production_id: '', project_name: '', brand_id: '',
};

const VIEW_MODES = [
  { id: 'By Status',       label: 'By Status',       icon: Tag },
  { id: 'By Expiry Date',  label: 'By Expiry Date',  icon: Calendar },
  { id: 'By Rights Type',  label: 'By Rights Type',  icon: Tag },
];

export default function CastingRights() {
  const { isEditor, isAdmin } = useAuth();
  const { currentBrand }      = useBrand();
  const brandId = currentBrand?.id || 'particle';

  const [cast, setCast]         = useState([]);
  const [prods, setProds]       = useState([]);
  const [search, setSearch]     = useState('');
  const [filterProd, setFilterProd]   = useState('');
  const [filterRole, setFilterRole]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing]   = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [viewMode, setViewMode] = useState('By Status');
  const [photoFullscreen, setPhotoFullscreen] = useState(null);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationResult, setAutomationResult] = useState(null);
  const [lastRunTime, setLastRunTime] = useState(null);

  // Fetch last automation run time
  useEffect(() => {
    apiGet('/api/casting-auto/last-run')
      .then(data => { if (data?.lastRun) setLastRunTime(data.lastRun); })
      .catch(() => {});
  }, []);

  async function handleRunAutomations() {
    setAutomationRunning(true);
    setAutomationResult(null);
    try {
      const data = await apiPost('/api/casting-auto/run-automations');
      setAutomationResult(data.summary);
      setLastRunTime(new Date().toISOString());
      // Refresh cast data after automation
      await refresh();
    } catch (err) {
      setAutomationResult({ errors: [err.message || 'Automation failed'] });
    } finally {
      setAutomationRunning(false);
    }
  }

  useEffect(() => {
    async function load() {
      const prodsResult = await Promise.resolve(getProductions(brandId));
      const prodsArr = Array.isArray(prodsResult) ? prodsResult : [];
      setProds(prodsArr);
      const brandProdIds = new Set(prodsArr.map(p => p.id));
      const castResult = await Promise.resolve(getAllCasting());
      const castArr = Array.isArray(castResult) ? castResult : [];
      setCast(castArr.filter(c => brandProdIds.has(c.production_id)));
    }
    load();
  }, [brandId]);

  async function refresh() {
    const prodsResult = await Promise.resolve(getProductions(brandId));
    const prodsArr = Array.isArray(prodsResult) ? prodsResult : [];
    const brandProdIds = new Set(prodsArr.map(p => p.id));
    const castResult = await Promise.resolve(getAllCasting());
    const castArr = Array.isArray(castResult) ? castResult : [];
    setCast(castArr.filter(c => brandProdIds.has(c.production_id)));
  }

  function prodName(id) {
    return prods.find(p => p.id === id)?.project_name || id;
  }

  function handleSave(data) {
    if (data.id) {
      updateCastMember(data.id, data);
    } else {
      const prod = prods.find(p => p.id === data.production_id);
      const newId = generateId('cm');
      createCastMember({
        ...data,
        id: newId,
        project_name: prod?.project_name || '',
        brand_id: brandId,
        created_at: new Date().toISOString(),
      });
      // Create Gantt warning event if non-Perpetually
      if (data.warning_date && data.period !== 'Perpetually') {
        createGanttEvent({
          production_id: data.production_id,
          phase: 'post_production',
          name: `⚠️ Rights renewal: ${data.name} (${(data.usage || []).join(', ')}) — 1 month remaining`,
          start_date: data.warning_date,
          end_date: data.warning_date,
          color: '#f97316',
        });
      }
    }
    refresh();
    setEditing(null);
  }

  function handleDelete(id) {
    deleteCastMember(id);
    setDelConfirm(null);
    refresh();
  }

  function toggleGroup(key) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const filtered = useMemo(() => {
    let list = [...cast];
    if (filterProd)   list = list.filter(c => c.production_id === filterProd);
    if (filterRole)   list = list.filter(c => c.role === filterRole);
    if (filterStatus) list = list.filter(c => c.contract_status === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.contract_manager_name || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [cast, filterProd, filterRole, filterStatus, search]);

  // ── By Status grouping ──────────────────────────────────────────────────────
  const groupedByStatus = useMemo(() => {
    const g = {};
    CONTRACT_STATUS_ORDER.forEach(s => { g[s] = filtered.filter(c => c.contract_status === s); });
    return g;
  }, [filtered]);

  // ── By Rights Type grouping ─────────────────────────────────────────────────
  const groupedByRights = useMemo(() => {
    const order = [...RIGHTS_RESTRICTIVENESS, 'No Rights'];
    const g = {};
    order.forEach(r => { g[r] = filtered.filter(c => mostRestrictiveRight(c.usage) === r); });
    return g;
  }, [filtered]);

  // ── By Expiry Date — flat, sorted ascending ─────────────────────────────────
  const sortedByExpiry = useMemo(() => {
    const today = new Date();
    const in30  = new Date(); in30.setDate(today.getDate() + 30);
    return [...filtered].sort((a, b) => {
      // Perpetually / no end_date → sort to bottom
      if (!a.end_date && !b.end_date) return 0;
      if (!a.end_date) return 1;
      if (!b.end_date) return -1;
      return new Date(a.end_date) - new Date(b.end_date);
    }).map(m => ({
      ...m,
      _expiresWithin30: m.end_date && new Date(m.end_date) <= in30 && new Date(m.end_date) >= today,
      _expired: m.end_date && new Date(m.end_date) < today,
    }));
  }, [filtered]);

  const totalRunning  = cast.filter(c => c.contract_status === 'Running').length;
  const totalOverdue  = cast.filter(c => c.contract_status === 'Overdue' || c.contract_status === 'Close to Overdue').length;

  function clearFilters() {
    setSearch(''); setFilterProd(''); setFilterRole(''); setFilterStatus('');
  }
  const hasFilters = search || filterProd || filterRole || filterStatus;

  // ── Shared table columns ────────────────────────────────────────────────────
  const TABLE_MIN_WIDTH = 1200;

  function CastRow({ m, showStatus = false }) {
    return (
      <tr key={m.id} className={clsx(m._expiresWithin30 && 'bg-orange-50', m._expired && 'bg-red-50')}>
        <td>
          {m.photo_url ? (
            <img
              src={m.photo_url}
              alt={m.name}
              className="w-9 h-9 rounded-full object-cover border border-gray-200 cursor-pointer"
              onClick={() => setPhotoFullscreen(m.photo_url)}
              onError={e => { e.target.style.display='none'; }}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <User size={16} className="text-gray-400" />
            </div>
          )}
        </td>
        <td className="font-semibold text-sm">{m.name || '—'}</td>
        <td>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            {m.project_name || prodName(m.production_id)}
          </span>
        </td>
        <td>
          <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{m.role}</span>
        </td>
        <td className="text-sm text-gray-600">{m.period}</td>
        <td className="text-xs text-gray-500">{fmtDate(m.start_date) || '—'}</td>
        <td className="text-xs">
          {m.end_date ? (
            <span className={clsx('font-medium', m._expired ? 'text-red-600' : m._expiresWithin30 ? 'text-orange-600' : 'text-gray-500')}>
              {m._expired ? '⚠️ ' : m._expiresWithin30 ? '🔔 ' : ''}{fmtDate(m.end_date)}
            </span>
          ) : <span className="text-gray-300">Ongoing</span>}
        </td>
        <td className="text-xs">
          {m.warning_date ? (
            <span className="text-orange-600 font-medium">⚠️ {fmtDate(m.warning_date)}</span>
          ) : <span className="text-gray-300">—</span>}
        </td>
        {showStatus && (
          <td>
            <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', CONTRACT_STATUS_STYLES[m.contract_status] || CONTRACT_STATUS_STYLES['Running'])}>
              {m.contract_status}
            </span>
          </td>
        )}
        <td>
          <div className="flex flex-wrap gap-1">
            {(m.usage || []).map(u => (
              <span key={u} className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', USAGE_COLORS[u] || 'bg-gray-100 text-gray-600')}>
                {u}
              </span>
            ))}
            {(!m.usage || m.usage.length === 0) && <span className="text-gray-300 text-xs">—</span>}
          </div>
        </td>
        <td>
          {m.signed_contract_url ? (
            <CloudLinks {...detectCloudUrl(m.signed_contract_url)} size="sm" />
          ) : <span className="text-gray-300 text-xs">—</span>}
        </td>
        <td className="text-sm text-gray-600">{m.contract_manager_name || <span className="text-gray-300">—</span>}</td>
        <td className="text-xs text-gray-500">{m.notes || <span className="text-gray-300">—</span>}</td>
        {(isEditor || isAdmin) && (
          <td>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setEditing({ ...m })}
                className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500"
                title="Edit"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              {delConfirm === m.id ? (
                <button onClick={() => handleDelete(m.id)}
                  className="text-[10px] text-red-600 font-semibold px-1.5 py-0.5 bg-red-50 rounded border border-red-200">
                  Confirm
                </button>
              ) : (
                <button onClick={() => setDelConfirm(m.id)}
                  className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" title="Delete">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  }

  function TableHead({ showStatus = false }) {
    return (
      <thead>
        <tr>
          <th style={{ minWidth: 50 }}>Photo</th>
          <th style={{ minWidth: 160 }}>Cast Member</th>
          <th style={{ minWidth: 160 }}>Production</th>
          <th style={{ minWidth: 90 }}>Role</th>
          <th style={{ minWidth: 110 }}>Period</th>
          <th style={{ minWidth: 100 }}>Start Date</th>
          <th style={{ minWidth: 110 }}>End Date</th>
          <th style={{ minWidth: 120 }}>Warning Date</th>
          {showStatus && <th style={{ minWidth: 150 }}>Status</th>}
          <th style={{ minWidth: 170 }}>Usage</th>
          <th style={{ minWidth: 100 }}>Signed Contract</th>
          <th style={{ minWidth: 130 }}>Contract Manager</th>
          <th style={{ minWidth: 150 }}>Notes</th>
          {(isEditor || isAdmin) && <th style={{ minWidth: 80 }}></th>}
        </tr>
      </thead>
    );
  }

  return (
    <div className="page-container">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Casting Rights</h1>
          <p className="text-sm text-gray-400 mt-0.5">All cast members across productions — contract status & usage rights</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock size={10} /> Automations run daily at 8:00 AM
          </span>
          {(isEditor || isAdmin) && (
            <button
              onClick={() => setEditing({ ...BLANK })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
            >
              <Plus size={14} /> New Cast Member
            </button>
          )}
        </div>
      </div>

      {/* Automation result banner */}
      {automationResult && (
        <div className={clsx(
          'mb-4 rounded-xl border px-4 py-3 text-sm',
          automationResult.errors?.length > 0
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        )}>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold">Automation Complete</span>
              {' — '}Checked {automationResult.checked || 0} members.
              {automationResult.overdue?.length > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  Overdue: {automationResult.overdue.join(', ')}
                </span>
              )}
              {automationResult.closeToOverdue?.length > 0 && (
                <span className="ml-2 text-orange-600 font-medium">
                  Close to Overdue: {automationResult.closeToOverdue.join(', ')}
                </span>
              )}
              {automationResult.startDateNotified?.length > 0 && (
                <span className="ml-2 text-blue-600 font-medium">
                  Start notified: {automationResult.startDateNotified.join(', ')}
                </span>
              )}
              {automationResult.errors?.length > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  Errors: {automationResult.errors.join('; ')}
                </span>
              )}
            </div>
            <button onClick={() => setAutomationResult(null)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Last run info */}
      {lastRunTime && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
          <Clock size={11} />
          Last automation run: {new Date(lastRunTime).toLocaleString()}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="brand-card py-3 px-4">
          <div className="text-xs text-gray-400 mb-0.5">Total Cast</div>
          <div className="text-2xl font-black text-gray-800">{cast.length}</div>
        </div>
        <div className="brand-card py-3 px-4">
          <div className="text-xs text-gray-400 mb-0.5">Active Contracts</div>
          <div className="text-2xl font-black text-green-600">{totalRunning}</div>
        </div>
        <div className="brand-card py-3 px-4">
          <div className="text-xs text-gray-400 mb-0.5">Expiring / Overdue</div>
          <div className="text-2xl font-black text-orange-500">{totalOverdue}</div>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        {VIEW_MODES.map(vm => (
          <button
            key={vm.id}
            onClick={() => setViewMode(vm.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              viewMode === vm.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            )}
          >
            {vm.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cast member…"
            className="pl-10 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-300 w-44"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={11} /></button>}
        </div>

        <select value={filterProd} onChange={e => setFilterProd(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-600">
          <option value="">All Productions</option>
          {prods.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
        </select>

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-600">
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-600">
          <option value="">All Statuses</option>
          {CONTRACT_STATUS_ORDER.map(s => <option key={s}>{s}</option>)}
        </select>

        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 hover:border-gray-400">
            <X size={11} /> Clear
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} cast member{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── VIEW: By Status ─────────────────────────────────────────────────── */}
      {viewMode === 'By Status' && (
        <div className="space-y-4">
          {CONTRACT_STATUS_ORDER.map(status => {
            const members = groupedByStatus[status];
            if (members.length === 0) return null;
            const isCollapsed = collapsed[status];
            return (
              <div key={status} className="brand-card p-0 overflow-hidden">
                <button
                  onClick={() => toggleGroup(status)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full border', CONTRACT_STATUS_STYLES[status])}>{status}</span>
                  <span className="text-sm font-semibold text-gray-600">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                </button>
                {!isCollapsed && (
                  <div className="table-scroll-wrapper">
                    <table className="data-table" style={{ minWidth: TABLE_MIN_WIDTH }}>
                      <TableHead showStatus={false} />
                      <tbody>
                        {members.map(m => <CastRow key={m.id} m={m} showStatus={false} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <EmptyState hasFilters={hasFilters} />}
        </div>
      )}

      {/* ── VIEW: By Expiry Date ─────────────────────────────────────────────── */}
      {viewMode === 'By Expiry Date' && (
        <div className="brand-card p-0 overflow-hidden">
          {sortedByExpiry.length === 0 ? (
            <EmptyState hasFilters={hasFilters} padded />
          ) : (
            <div className="table-scroll-wrapper">
              <table className="data-table" style={{ minWidth: TABLE_MIN_WIDTH }}>
                <TableHead showStatus />
                <tbody>
                  {sortedByExpiry.map(m => <CastRow key={m.id} m={m} showStatus />)}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100 flex gap-4">
            <span>🔔 Expires within 30 days</span>
            <span>⚠️ Already expired</span>
            <span>Perpetual contracts shown at bottom</span>
          </div>
        </div>
      )}

      {/* ── VIEW: By Rights Type ─────────────────────────────────────────────── */}
      {viewMode === 'By Rights Type' && (
        <div className="space-y-4">
          {[...RIGHTS_RESTRICTIVENESS, 'No Rights'].map(right => {
            const members = groupedByRights[right];
            if (!members || members.length === 0) return null;
            const isCollapsed = collapsed[`rights_${right}`];
            const restrictLabel = right === 'Stills' ? '(most restricted)' : right === 'Any Use' ? '(least restricted)' : '';
            return (
              <div key={right} className="brand-card p-0 overflow-hidden">
                <button
                  onClick={() => toggleGroup(`rights_${right}`)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', USAGE_COLORS[right] || 'bg-gray-100 text-gray-600')}>
                    {right}
                  </span>
                  {restrictLabel && <span className="text-[10px] text-gray-400">{restrictLabel}</span>}
                  <span className="text-sm font-semibold text-gray-600">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                </button>
                {!isCollapsed && (
                  <div className="table-scroll-wrapper">
                    <table className="data-table" style={{ minWidth: TABLE_MIN_WIDTH }}>
                      <TableHead showStatus />
                      <tbody>
                        {members.map(m => <CastRow key={m.id} m={m} showStatus />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <EmptyState hasFilters={hasFilters} />}
        </div>
      )}

      {/* Add/Edit Modal */}
      {editing && (
        <CastingModal
          initial={editing}
          productions={prods}
          onSave={handleSave}
          onClose={() => setEditing(null)}
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
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl" onClick={() => setPhotoFullscreen(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ hasFilters, padded }) {
  return (
    <div className={clsx('brand-card text-center text-gray-400', padded ? 'py-16' : 'py-16')}>
      <User size={40} className="mx-auto mb-3 opacity-20" />
      <p className="text-sm font-medium">No cast members found</p>
      {hasFilters && <p className="text-xs mt-1">Try clearing your filters</p>}
    </div>
  );
}

// ─── Casting Modal (global version — includes production picker, photo upload, auto-dates) ──────────────
function CastingModal({ initial, productions, onSave, onClose }) {
  // Normalize date fields to YYYY-MM-DD for <input type="date">
  const norm = { ...initial };
  ['start_date', 'end_date', 'warning_date'].forEach(k => {
    if (norm[k] && String(norm[k]).length > 10) norm[k] = String(norm[k]).slice(0, 10);
  });
  const [form, setForm] = useState(norm);
  const [photoPreview, setPhotoPreview] = useState(initial.photo_url || '');
  const fileInputRef = useRef(null);

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'period' || field === 'start_date') {
        const end = calcEndDate(next.start_date, next.period);
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
      usage: prev.usage.includes(u)
        ? prev.usage.filter(x => x !== u)
        : [...prev.usage, u],
    }));
  }

  function handlePhotoFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      setPhotoPreview(e.target.result);
      setForm(prev => ({ ...prev, photo_url: e.target.result }));
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoUrlChange(url) {
    setForm(prev => ({ ...prev, photo_url: url }));
    setPhotoPreview(url);
  }

  const isEdit = !!form.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-base font-bold">{isEdit ? 'Edit Cast Member' : 'Add Cast Member'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="p-6 space-y-4">
          {/* Production picker — only for new records */}
          {!isEdit && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Production *</label>
              <select
                required
                className="brand-input w-full"
                value={form.production_id}
                onChange={e => set('production_id', e.target.value)}
              >
                <option value="">— Select production —</option>
                {productions.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
              </select>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name *</label>
            <input required className="brand-input w-full" placeholder="e.g. Savanna Chilchik" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          {/* Photo: upload + URL + preview */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Photo</label>
            <div className="flex items-center gap-4">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 shrink-0"
                  onError={e => { e.target.style.display='none'; }}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0">
                  <User size={20} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <FileUploadButton
                  accept="image/*"
                  category="cast-photos"
                  subfolder={form.production_id || ''}
                  fileName={`${form.full_name || 'cast'}-photo`}
                  label="Upload Photo"
                  size="sm"
                  onUploaded={(data) => {
                    const link = data?.drive?.viewLink || data?.dropbox?.link;
                    if (link) set('photo_url', link);
                  }}
                />
                <input
                  type="url"
                  className="brand-input w-full text-xs"
                  placeholder="Or paste image URL…"
                  value={form.photo_url?.startsWith('data:') ? '' : (form.photo_url || '')}
                  onChange={e => handlePhotoUrlChange(e.target.value)}
                />
                {form.photo_url && !form.photo_url.startsWith('data:') && (
                  <CloudLinks {...detectCloudUrl(form.photo_url)} size="sm" />
                )}
              </div>
            </div>
          </div>

          {/* Role + Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Role</label>
              <select className="brand-input w-full" value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Period</label>
              <select className="brand-input w-full" value={form.period} onChange={e => set('period', e.target.value)}>
                {PERIODS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
              <input type="date" className="brand-input w-full" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                End Date
                {form.period !== 'Perpetually' && <span className="ml-1 text-[10px] text-blue-400 font-normal">auto-calc</span>}
              </label>
              <input type="date" className="brand-input w-full" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>

          {/* Warning date — read-only computed */}
          {form.end_date && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-orange-700">⚠️ Warning Date</span>
              <span className="text-xs text-orange-600 font-mono">{fmtDate(form.warning_date) || '—'}</span>
              <span className="text-[10px] text-orange-400 ml-auto">1 month before end · Gantt event added on save</span>
            </div>
          )}

          {/* Contract Status */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Contract Status</label>
            <select className="brand-input w-full" value={form.contract_status} onChange={e => set('contract_status', e.target.value)}>
              <option>Running</option>
              <option>Close to Overdue</option>
              <option>Overdue</option>
              <option>Done</option>
            </select>
          </div>

          {/* Usage */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Usage Rights</label>
            <div className="flex flex-wrap gap-2">
              {USAGE_OPTIONS.map(u => (
                <label key={u} className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-medium transition-all',
                  form.usage.includes(u)
                    ? (USAGE_COLORS[u] || 'bg-gray-100 text-gray-700') + ' border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                )}>
                  <input type="checkbox" className="sr-only" checked={form.usage.includes(u)} onChange={() => toggleUsage(u)} />
                  {u}
                </label>
              ))}
            </div>
          </div>

          {/* Signed contract + manager */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Signed Contract</label>
              <FileUploadButton
                accept=".pdf,image/*"
                category="contracts"
                subfolder={`casting/${form.full_name || 'contract'}`}
                fileName={`Signed-Contract-${form.full_name || 'cast'}`}
                label="Upload Contract"
                size="sm"
                onUploaded={(data) => {
                  const link = data?.drive?.viewLink || data?.dropbox?.link;
                  if (link) set('signed_contract_url', link);
                }}
              />
              <input type="url" className="brand-input w-full mt-1" placeholder="Or paste Drive link" value={form.signed_contract_url} onChange={e => set('signed_contract_url', e.target.value)} />
              {form.signed_contract_url && <CloudLinks {...detectCloudUrl(form.signed_contract_url)} size="sm" />}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Contract Manager</label>
              <input className="brand-input w-full" placeholder="e.g. Yuli Group" value={form.contract_manager_name} onChange={e => set('contract_manager_name', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
            <textarea rows={2} className="brand-input w-full resize-none" placeholder="Agency name, deal notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl border text-gray-500 hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm rounded-xl bg-gray-900 text-white hover:bg-gray-700 font-semibold">
              {isEdit ? 'Save Changes' : 'Add to Cast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
