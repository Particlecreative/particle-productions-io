import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from 'recharts';
import {
  AlertTriangle, TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle,
  ChevronUp, ChevronDown, X, ExternalLink, ChevronRight, Search,
} from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import { getProductions, getAllLineItems } from '../lib/dataService';
import { EXPENSE_CATEGORIES } from '../lib/mockData';
import clsx from 'clsx';

const YEARS = [2024, 2025, 2026, 2027, 2028];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const IL_VAT = 0.18; // Israeli VAT rate (18% as of Jan 2025)

function VATSub({ ils }) {
  if (!ils || ils < 1) return null;
  return (
    <div className="text-[10px] text-gray-400 mt-1 leading-tight">
      ₪{Math.round(ils).toLocaleString()} excl. · <span className="font-semibold text-gray-500">₪{Math.round(ils * (1 + IL_VAT)).toLocaleString()} incl. VAT</span>
    </div>
  );
}

// ─── Currency helpers (mirrored from Accounting.jsx) ─────────────────────────
function makeHelpers(currency, rate) {
  const effectiveRate = rate || 3.7;
  function toDisplay(amount, code) {
    const num = parseFloat(amount) || 0;
    if (code === 'ILS' && currency === 'ILS') return num;
    if (code === 'ILS' && currency === 'USD') return num / effectiveRate;
    if (code === 'USD' && currency === 'ILS') return num * effectiveRate;
    return num;
  }
  function getAmt(li) {
    return toDisplay(li.actual_spent || li.planned_budget || 0, li.currency_code || 'USD');
  }
  function getPlanned(li) {
    return toDisplay(li.planned_budget || 0, li.currency_code || 'USD');
  }
  return { toDisplay, getAmt, getPlanned };
}

function mapTypeToCategory(type) {
  const map = {
    'Crew': 'Talent', 'Equipment': 'Other', 'Catering & Transport': 'Other',
    'Post': 'Post Production', 'Office': 'Other', 'Director': 'Director',
    'Talent': 'Talent', 'AI Tools': 'AI Tools', 'Sound': 'Sound',
    'Offline Editor': 'Offline Editor',
  };
  return map[type] || 'Other';
}

const TODAY = new Date().toISOString().split('T')[0];

// ─── Status badge ─────────────────────────────────────────────────────────────
function PayBadge({ status }) {
  const cls = status === 'Paid'
    ? 'bg-green-100 text-green-700'
    : status === 'Pending'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-gray-100 text-gray-500';
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{status || 'Not Paid'}</span>;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon: Icon, onClick, editable, onEdit, signal }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  const signalColor = signal === 'red' ? 'text-red-600' : signal === 'green' ? 'text-green-600' : signal === 'amber' ? 'text-amber-600' : '';
  const borderColor = signal === 'red' ? 'border-red-200' : signal === 'amber' ? 'border-amber-200' : signal === 'green' ? 'border-green-200' : 'border-gray-100';

  return (
    <div
      className={clsx('kpi-card border-l-4 transition-all', borderColor, onClick && 'cursor-pointer hover:shadow-md')}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="kpi-label">{label}</span>
        {Icon && <Icon size={14} className={clsx('shrink-0', signal ? signalColor : 'text-gray-300')} />}
      </div>
      {editing ? (
        <div className="flex gap-2">
          <input autoFocus type="number" className="brand-input text-sm w-full"
            value={val} onChange={e => setVal(e.target.value)}
            onBlur={() => { onEdit(val); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onEdit(val); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
          />
        </div>
      ) : (
        <div
          className={clsx('text-2xl font-black tracking-tighter leading-tight', signalColor || 'text-gray-900')}
          style={{ letterSpacing: '-0.04em' }}
          onClick={e => { if (editable) { e.stopPropagation(); setVal(''); setEditing(true); } }}
          title={editable ? 'Click to edit' : onClick ? 'Click to view details' : ''}
        >
          {value}
          {editable && <span className="text-[10px] text-gray-300 ml-1 font-normal align-middle">edit</span>}
        </div>
      )}
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Drill-down Drawer ────────────────────────────────────────────────────────
function DrillDownPanel({ drillDown, lineItems, productionRows, fmt, getAmt, onClose, productions }) {
  const ref = useRef(null);

  // Escape key closes
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!drillDown) return null;

  // Filter line items based on drill context
  let items = [];
  let title = '';
  let subtitle = '';

  if (drillDown.type === 'filter' && drillDown.filter === 'paid') {
    items = lineItems.filter(li => li.payment_status === 'Paid');
    title = 'Cash Out — All Paid Items';
    subtitle = `${items.length} payments`;
  } else if (drillDown.type === 'filter' && drillDown.filter === 'committed') {
    items = lineItems.filter(li => li.payment_status !== 'Paid' && li.invoice_status === 'Received');
    title = 'Committed — Invoice Received, Not Paid';
    subtitle = `${items.length} items`;
  } else if (drillDown.type === 'filter' && drillDown.filter === 'overdue') {
    items = lineItems.filter(li => li.payment_status !== 'Paid' && li.payment_due && li.payment_due < TODAY);
    title = 'Overdue Payments';
    subtitle = `${items.length} items past due date`;
  } else if (drillDown.type === 'filter' && drillDown.filter === 'exposure') {
    items = lineItems.filter(li => (parseFloat(li.actual_spent) || 0) > 0);
    title = 'Total Exposure — All Active Spend';
    subtitle = `${items.length} items`;
  } else if (drillDown.type === 'month') {
    const mi = drillDown.monthIndex;
    items = lineItems.filter(li => {
      const dateStr = li.paid_at || li.payment_due;
      if (!dateStr) return false;
      const m = new Date(dateStr).getMonth();
      return m === mi;
    });
    title = `${MONTH_NAMES[mi]} — All Items`;
    subtitle = `${items.length} items`;
  } else if (drillDown.type === 'production') {
    items = lineItems.filter(li => li.production_id === drillDown.id);
    const prod = productions.find(p => p.id === drillDown.id);
    title = prod ? prod.project_name : drillDown.id;
    subtitle = `${drillDown.id} · ${items.length} items`;
  } else if (drillDown.type === 'category') {
    items = lineItems.filter(li => mapTypeToCategory(li.type) === drillDown.cat);
    title = drillDown.cat;
    subtitle = `${items.length} items`;
  }

  const totalAmt = items.reduce((s, li) => s + getAmt(li), 0);
  const paidAmt = items.filter(li => li.payment_status === 'Paid').reduce((s, li) => s + getAmt(li), 0);
  const pendingAmt = items.filter(li => li.payment_status !== 'Paid').reduce((s, li) => s + getAmt(li), 0);

  return (
    <>
      {/* Overlay */}
      <div className="drawer-overlay" onClick={onClose} />
      {/* Panel */}
      <div
        ref={ref}
        className="drawer-panel"
        style={{ width: 'min(600px, 100vw)' }}
      >
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-base" style={{ color: 'var(--brand-primary)' }}>{title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
              <X size={16} />
            </button>
          </div>
          {/* Summary chips */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-xs bg-gray-100 rounded-full px-2.5 py-1 font-semibold text-gray-700">
              Total: <strong>{fmt(totalAmt)}</strong>
            </span>
            {paidAmt > 0 && (
              <span className="text-xs bg-green-100 rounded-full px-2.5 py-1 font-semibold text-green-700">
                ✓ Paid: {fmt(paidAmt)}
              </span>
            )}
            {pendingAmt > 0 && (
              <span className="text-xs bg-amber-100 rounded-full px-2.5 py-1 font-semibold text-amber-700">
                ○ Unpaid: {fmt(pendingAmt)}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-0">
          {items.length === 0 ? (
            <div className="p-8 text-center text-gray-300 text-sm">No items found</div>
          ) : (
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Production</th>
                  <th>Name / Item</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Due Date</th>
                  <th>Paid At</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(li => {
                  const prod = productions.find(p => p.id === li.production_id);
                  const isOverdue = li.payment_status !== 'Paid' && li.payment_due && li.payment_due < TODAY;
                  return (
                    <tr key={li.id} className={isOverdue ? 'bg-red-50/30' : undefined}>
                      <td>
                        <span className="font-mono text-[10px] font-bold text-gray-400">{li.production_id}</span>
                        {prod && <div className="text-xs text-gray-600 truncate max-w-[90px]">{prod.project_name}</div>}
                      </td>
                      <td>
                        <div className="font-medium text-gray-800">{li.full_name || '—'}</div>
                        <div className="text-gray-400">{li.item || ''}</div>
                      </td>
                      <td className="font-bold tabular-nums">{fmt(getAmt(li))}</td>
                      <td><PayBadge status={li.payment_status} /></td>
                      <td className="text-gray-500">{li.payment_method || '—'}</td>
                      <td className={clsx('tabular-nums', isOverdue && 'text-red-600 font-semibold')}>
                        {li.payment_due ? li.payment_due : '—'}
                      </td>
                      <td className="tabular-nums text-gray-500">{li.paid_at ? li.paid_at : '—'}</td>
                      <td>
                        {(li.invoice_url || li.drive_url) && (
                          <a href={li.invoice_url || li.drive_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                  <td colSpan={2} className="font-bold py-2 px-3 text-xs">Total ({items.length} items)</td>
                  <td className="font-black text-sm px-3">
                    {fmt(totalAmt)}
                    {(() => {
                      const rawILS = items.filter(li => (li.currency_code || 'USD') === 'ILS').reduce((s, li) => s + (parseFloat(li.actual_spent) || parseFloat(li.planned_budget) || 0), 0);
                      return rawILS > 0 ? <div className="text-[9px] text-gray-400 font-normal mt-0.5">₪{Math.round(rawILS).toLocaleString()} excl. · ₪{Math.round(rawILS * 1.18).toLocaleString()} incl. VAT</div> : null;
                    })()}
                  </td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Custom tooltip for the monthly chart ────────────────────────────────────
function MonthTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs">
      <p className="font-bold text-gray-800 mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.fill || p.stroke }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold">{typeof p.value === 'number' ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Financial() {
  const { brandId } = useBrand();
  const { fmt, currency, rate } = useCurrency();
  const { isEditor } = useAuth();

  const [tab, setTab] = useState('cashflow');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [productions, setProductions] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [yearlyBudget, setYearlyBudget] = useState(() =>
    Number(localStorage.getItem(`cp_yearly_budget_${brandId}_${2026}`)) || 600_000
  );
  const [pendingBudget, setPendingBudget] = useState(null);

  // Drill-down drawer
  const [drillDown, setDrillDown] = useState(null);

  // Productions tab sort + filter
  const [sortKey, setSortKey] = useState('_planned');
  const [sortDir, setSortDir] = useState('desc');
  const [prodFilter, setProdFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  // Currency helpers
  const { getAmt, getPlanned } = useMemo(() => makeHelpers(currency, rate), [currency, rate]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const prods = await Promise.resolve(getProductions(brandId, selectedYear));
      const prodsArr = Array.isArray(prods) ? prods : [];
      setProductions(prodsArr);
      const prodIds = new Set(prodsArr.map(p => p.id));
      const items = await Promise.resolve(getAllLineItems());
      setLineItems((Array.isArray(items) ? items : []).filter(li => prodIds.has(li.production_id)));
      const saved = Number(localStorage.getItem(`cp_yearly_budget_${brandId}_${selectedYear}`));
      setYearlyBudget(saved || 600_000);
      setLoading(false);
    }
    load();
  }, [brandId, selectedYear]);

  function confirmBudget() {
    if (!isEditor) return;
    setYearlyBudget(pendingBudget.newVal);
    localStorage.setItem(`cp_yearly_budget_${brandId}_${selectedYear}`, String(pendingBudget.newVal));
    setPendingBudget(null);
  }

  // ── Core financial computations ──────────────────────────────────────────
  const totalPaid = useMemo(() =>
    lineItems.filter(li => li.payment_status === 'Paid').reduce((s, li) => s + getAmt(li), 0),
  [lineItems, getAmt]);

  const totalCommitted = useMemo(() =>
    lineItems.filter(li => li.payment_status !== 'Paid' && li.invoice_status === 'Received')
      .reduce((s, li) => s + getAmt(li), 0),
  [lineItems, getAmt]);

  const totalUnpaidNoInvoice = useMemo(() =>
    lineItems.filter(li => li.payment_status !== 'Paid' && li.invoice_status !== 'Received' && (parseFloat(li.actual_spent) || 0) > 0)
      .reduce((s, li) => s + getAmt(li), 0),
  [lineItems, getAmt]);

  const totalExposure = totalPaid + totalCommitted + totalUnpaidNoInvoice;

  const overdueItems = useMemo(() =>
    lineItems.filter(li => li.payment_status !== 'Paid' && li.payment_due && li.payment_due < TODAY),
  [lineItems]);

  const variance = yearlyBudget - totalExposure;

  // ILS-denominated amounts (raw ₪, for VAT display — VAT only applies to ILS)
  const ilsPaid = useMemo(() =>
    lineItems.filter(li => li.payment_status === 'Paid' && (li.currency_code || 'USD') === 'ILS')
      .reduce((s, li) => s + (parseFloat(li.actual_spent) || 0), 0),
  [lineItems]);
  const ilsCommitted = useMemo(() =>
    lineItems.filter(li => li.payment_status !== 'Paid' && li.invoice_status === 'Received' && (li.currency_code || 'USD') === 'ILS')
      .reduce((s, li) => s + (parseFloat(li.actual_spent) || parseFloat(li.planned_budget) || 0), 0),
  [lineItems]);
  const ilsExposure = useMemo(() =>
    lineItems.filter(li => (li.currency_code || 'USD') === 'ILS' && (parseFloat(li.actual_spent) || 0) > 0)
      .reduce((s, li) => s + (parseFloat(li.actual_spent) || 0), 0),
  [lineItems]);

  // ── Monthly cash flow chart (12 months always shown) ─────────────────────
  const monthlyChartData = useMemo(() => {
    const paid = Array(12).fill(0);
    const committed = Array(12).fill(0);

    lineItems.forEach(li => {
      const isPaid = li.payment_status === 'Paid';
      const isCommitted = !isPaid && li.invoice_status === 'Received';

      // paid: use paid_at, fallback to payment_due as month proxy
      if (isPaid) {
        const dateStr = li.paid_at || li.payment_due;
        if (dateStr) {
          const d = new Date(dateStr);
          if (d.getFullYear() === selectedYear) paid[d.getMonth()] += getAmt(li);
        }
      }
      // committed: use payment_due
      if (isCommitted && li.payment_due) {
        const d = new Date(li.payment_due);
        if (d.getFullYear() === selectedYear) committed[d.getMonth()] += getAmt(li);
      }
    });

    const monthlyBudget = yearlyBudget / 12;
    return MONTH_NAMES.map((month, i) => ({
      month,
      monthIndex: i,
      paid: Math.round(paid[i]),
      committed: Math.round(committed[i]),
      budgetLine: Math.round(monthlyBudget * (i + 1)), // cumulative budget pacing
    }));
  }, [lineItems, selectedYear, yearlyBudget, getAmt]);

  // ── Per-production rows ───────────────────────────────────────────────────
  const productionRows = useMemo(() => {
    return productions.map(prod => {
      const items = lineItems.filter(li => li.production_id === prod.id);
      const _paid = items.filter(li => li.payment_status === 'Paid').reduce((s, li) => s + getAmt(li), 0);
      const _committed = items.filter(li => li.payment_status !== 'Paid' && li.invoice_status === 'Received').reduce((s, li) => s + getAmt(li), 0);
      const _unpaid = items.filter(li => li.payment_status !== 'Paid' && li.invoice_status !== 'Received' && (parseFloat(li.actual_spent) || 0) > 0).reduce((s, li) => s + getAmt(li), 0);
      const _planned = items.reduce((s, li) => s + getPlanned(li), 0) || (parseFloat(prod.planned_budget_2026) || 0);
      const _variance = _planned - (_paid + _committed + _unpaid);
      const _overdue = items.filter(li => li.payment_status !== 'Paid' && li.payment_due && li.payment_due < TODAY).length;
      return { ...prod, _paid, _committed, _unpaid, _planned, _variance, _overdue, _items: items };
    });
  }, [productions, lineItems, getAmt, getPlanned]);

  const sortedProductionRows = useMemo(() => {
    let rows = productionRows;
    if (prodFilter) {
      const q = prodFilter.toLowerCase();
      rows = rows.filter(r => r.project_name?.toLowerCase().includes(q) || r.id?.toLowerCase().includes(q));
    }
    if (stageFilter) rows = rows.filter(r => r.stage === stageFilter);
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [productionRows, prodFilter, stageFilter, sortKey, sortDir]);

  // ── Category data ─────────────────────────────────────────────────────────
  const categoryData = useMemo(() => {
    const map = {};
    EXPENSE_CATEGORIES.forEach(c => { map[c] = { planned: 0, paid: 0, committed: 0 }; });
    lineItems.forEach(li => {
      const cat = mapTypeToCategory(li.type);
      if (!map[cat]) map[cat] = { planned: 0, paid: 0, committed: 0 };
      map[cat].planned += getPlanned(li);
      if (li.payment_status === 'Paid') map[cat].paid += getAmt(li);
      else if (li.invoice_status === 'Received') map[cat].committed += getAmt(li);
    });
    return EXPENSE_CATEGORIES
      .map(c => ({ name: c, ...map[c] }))
      .filter(c => c.planned > 0 || c.paid > 0 || c.committed > 0)
      .sort((a, b) => (b.paid + b.committed) - (a.paid + a.committed));
  }, [lineItems, getAmt, getPlanned]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ k }) {
    if (sortKey !== k) return <ChevronDown size={10} className="text-gray-300 ml-0.5" />;
    return sortDir === 'asc' ? <ChevronUp size={10} className="text-indigo-500 ml-0.5" /> : <ChevronDown size={10} className="text-indigo-500 ml-0.5" />;
  }

  const allStages = useMemo(() => [...new Set(productions.map(p => p.stage).filter(Boolean))], [productions]);

  if (loading) {
    return (
      <div className="page-enter">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="skeleton h-3 w-20 rounded mb-3" />
              <div className="skeleton h-8 w-32 rounded mb-2" />
              <div className="skeleton h-2 w-16 rounded" />
            </div>
          ))}
        </div>
        <div className="brand-card"><div className="skeleton h-48 w-full rounded" /></div>
      </div>
    );
  }

  return (
    <div className="page-enter animate-fade-in">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-black brand-title tracking-tight" style={{ color: 'var(--brand-primary)', letterSpacing: '-0.03em' }}>
          Budget Overview
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Year switcher */}
          <div className="flex items-center gap-0 border rounded-xl overflow-hidden bg-white" style={{ borderColor: 'var(--brand-border)' }}>
            {YEARS.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)}
                className={clsx('px-2.5 py-1.5 text-xs font-semibold transition-all', selectedYear === y ? 'text-white' : 'text-gray-500 hover:bg-gray-50')}
                style={selectedYear === y ? { background: 'var(--brand-accent)' } : {}}>
                {y}
              </button>
            ))}
          </div>
          {/* Tab switcher */}
          <div className="flex gap-1 bg-white rounded-xl p-1 border" style={{ borderColor: 'var(--brand-border)' }}>
            {[{ id: 'cashflow', label: 'Cash Flow' }, { id: 'productions', label: 'Productions' }, { id: 'categories', label: 'Categories' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={clsx('px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all', tab === t.id ? 'text-white' : 'text-gray-500 hover:text-gray-700')}
                style={tab === t.id ? { background: 'var(--brand-accent)' } : {}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── VAT info strip ── */}
      <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
        <span className="font-bold shrink-0">₪ VAT</span>
        <span>All ILS (₪) amounts are <strong>excl. VAT</strong>. Israeli VAT rate: <strong>18%</strong>. Multiply by 1.18 for gross. Hover KPI cards for incl. VAT figures.</span>
      </div>

      {/* ── Budget confirm strip ── */}
      {pendingBudget && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <span className="text-amber-700 font-medium flex-1">
            Change {selectedYear} budget from <strong>{fmt(yearlyBudget)}</strong> to <strong>{fmt(pendingBudget.newVal)}</strong>?
          </span>
          <button onClick={confirmBudget} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">Confirm</button>
          <button onClick={() => setPendingBudget(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">Cancel</button>
        </div>
      )}

      {/* ── 6 KPI Cards (always visible) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KPICard
          label="Cash Out"
          value={fmt(totalPaid)}
          sub={<><span>{lineItems.filter(li => li.payment_status === 'Paid').length} paid items</span><VATSub ils={ilsPaid} /></>}
          icon={CheckCircle}
          signal="green"
          onClick={() => setDrillDown({ type: 'filter', filter: 'paid' })}
        />
        <KPICard
          label="Committed"
          value={fmt(totalCommitted)}
          sub={<><span>Invoice received, not paid</span><VATSub ils={ilsCommitted} /></>}
          icon={Clock}
          signal={totalCommitted > 0 ? 'amber' : null}
          onClick={() => setDrillDown({ type: 'filter', filter: 'committed' })}
        />
        <KPICard
          label="Total Exposure"
          value={fmt(totalExposure)}
          sub={<><span>Paid + committed + unpaid</span><VATSub ils={ilsExposure} /></>}
          icon={DollarSign}
          signal={totalExposure > yearlyBudget ? 'red' : null}
          onClick={() => setDrillDown({ type: 'filter', filter: 'exposure' })}
        />
        <KPICard
          label={`${selectedYear} Budget`}
          value={fmt(yearlyBudget)}
          sub="Click value to edit"
          icon={TrendingUp}
          editable={isEditor}
          onEdit={v => { const n = parseFloat(v); if (n > 0) setPendingBudget({ newVal: n }); }}
        />
        <KPICard
          label="Variance"
          value={fmt(Math.abs(variance))}
          sub={variance >= 0 ? 'Under budget' : 'Over budget'}
          icon={variance >= 0 ? TrendingUp : TrendingDown}
          signal={variance < 0 ? 'red' : 'green'}
        />
        <KPICard
          label="Overdue"
          value={overdueItems.length}
          sub={overdueItems.length === 0 ? 'No overdue items' : 'items past due date'}
          icon={AlertTriangle}
          signal={overdueItems.length > 0 ? 'red' : null}
          onClick={overdueItems.length > 0 ? () => { setTab('productions'); setDrillDown({ type: 'filter', filter: 'overdue' }); } : undefined}
        />
      </div>

      {/* ═══════════════════ CASH FLOW TAB ═══════════════════ */}
      {tab === 'cashflow' && (
        <div className="space-y-6">
          {/* Overdue banner */}
          {overdueItems.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm">
              <AlertTriangle size={14} className="text-red-500 shrink-0" />
              <span className="text-red-700 font-semibold">
                {overdueItems.length} overdue payment{overdueItems.length > 1 ? 's' : ''} — click the Overdue card above to review
              </span>
            </div>
          )}

          {/* Monthly stacked bar chart */}
          <div className="brand-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>Monthly Cash Flow — {selectedYear}</h3>
              <p className="text-xs text-gray-400">Click any bar to drill into that month</p>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={monthlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                onClick={d => { if (d?.activePayload) { const mi = d.activePayload[0]?.payload?.monthIndex; if (mi != null) setDrillDown({ type: 'month', monthIndex: mi }); } }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${currency === 'ILS' ? '₪' : '$'}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
                <Tooltip content={<MonthTooltip fmt={fmt} />} />
                <Legend />
                <Bar dataKey="paid" name="Paid" fill="var(--brand-accent, #6366f1)" radius={[3,3,0,0]} stackId="a" cursor="pointer" />
                <Bar dataKey="committed" name="Committed" fill="#f59e0b" radius={[3,3,0,0]} stackId="a" cursor="pointer" />
                <Line dataKey="budgetLine" name="Budget pacing" stroke="#cbd5e1" strokeDasharray="5 3" strokeWidth={1.5} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Quick summary table */}
          <div className="brand-card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--brand-border)' }}>
              <h3 className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>Monthly Summary</h3>
            </div>
            <div className="table-scroll-wrapper">
              <table className="data-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Paid Out</th>
                    <th>Committed</th>
                    <th>Total</th>
                    <th>Budget Pacing</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyChartData.filter(r => r.paid > 0 || r.committed > 0).map(row => (
                    <tr key={row.month} className="cursor-pointer hover:bg-indigo-50/30"
                      onClick={() => setDrillDown({ type: 'month', monthIndex: row.monthIndex })}>
                      <td className="font-semibold">{row.month}</td>
                      <td className="text-green-700 font-semibold">{row.paid > 0 ? fmt(row.paid) : '—'}</td>
                      <td className="text-amber-700">{row.committed > 0 ? fmt(row.committed) : '—'}</td>
                      <td className="font-bold">{fmt(row.paid + row.committed)}</td>
                      <td className="text-gray-500">{fmt(row.budgetLine)}</td>
                      <td><ChevronRight size={12} className="text-gray-300" /></td>
                    </tr>
                  ))}
                  {monthlyChartData.every(r => r.paid === 0 && r.committed === 0) && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-300 text-sm">No payment data recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ PRODUCTIONS TAB ═══════════════════ */}
      {tab === 'productions' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={prodFilter} onChange={e => setProdFilter(e.target.value)}
                placeholder="Search productions…"
                className="text-xs pl-7 pr-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 w-48"
                style={{ borderColor: 'var(--brand-border)', '--tw-ring-color': 'var(--brand-glow, #c7d2fe)' }} />
            </div>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="text-xs border rounded-lg px-2 py-2 bg-white"
              style={{ borderColor: 'var(--brand-border)' }}>
              <option value="">All stages</option>
              {allStages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(prodFilter || stageFilter) && (
              <button onClick={() => { setProdFilter(''); setStageFilter(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                Clear
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">{sortedProductionRows.length} productions</span>
          </div>

          <div className="brand-card p-0 overflow-hidden">
            <div className="table-scroll-wrapper" style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
              <table className="data-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    {[
                      { k: 'id', label: 'ID' }, { k: 'project_name', label: 'Project' },
                      { k: 'stage', label: 'Stage' }, { k: '_planned', label: 'Planned' },
                      { k: '_paid', label: 'Paid' }, { k: '_committed', label: 'Committed' },
                      { k: '_unpaid', label: 'Unpaid' }, { k: '_variance', label: 'Variance' },
                      { k: '_overdue', label: 'Overdue' },
                    ].map(col => (
                      <th key={col.k} className="cursor-pointer select-none hover:bg-gray-50 transition-colors"
                        onClick={() => handleSort(col.k)}>
                        <span className="flex items-center gap-0.5">{col.label}<SortIcon k={col.k} /></span>
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProductionRows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-10 text-gray-400 text-sm">No productions found</td></tr>
                  ) : sortedProductionRows.map(row => (
                    <tr key={row.id}
                      className={clsx('cursor-pointer transition-colors', row._overdue > 0 ? 'bg-red-50/20' : 'hover:bg-indigo-50/20')}
                      onClick={() => setDrillDown({ type: 'production', id: row.id })}>
                      <td className="font-mono text-[11px] font-bold text-gray-500">{row.id}</td>
                      <td className="font-semibold max-w-[160px] truncate">{row.project_name}</td>
                      <td>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{row.stage || '—'}</span>
                      </td>
                      <td className="font-medium">{fmt(row._planned)}</td>
                      <td className="text-green-700 font-semibold">{row._paid > 0 ? fmt(row._paid) : '—'}</td>
                      <td className="text-amber-700">{row._committed > 0 ? fmt(row._committed) : '—'}</td>
                      <td className="text-gray-500">{row._unpaid > 0 ? fmt(row._unpaid) : '—'}</td>
                      <td className={row._variance >= 0 ? 'diff-positive font-semibold' : 'diff-negative font-semibold'}>
                        {row._variance >= 0 ? '+' : ''}{fmt(row._variance)}
                      </td>
                      <td>
                        {row._overdue > 0
                          ? <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">{row._overdue} overdue</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td><ChevronRight size={12} className="text-gray-300" /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                    <td colSpan={3} className="font-bold text-sm py-3 px-3">Totals</td>
                    <td className="font-bold px-3">{fmt(sortedProductionRows.reduce((s, r) => s + r._planned, 0))}</td>
                    <td className="font-bold px-3 text-green-700">{fmt(sortedProductionRows.reduce((s, r) => s + r._paid, 0))}</td>
                    <td className="font-bold px-3 text-amber-700">{fmt(sortedProductionRows.reduce((s, r) => s + r._committed, 0))}</td>
                    <td className="font-bold px-3 text-gray-500">{fmt(sortedProductionRows.reduce((s, r) => s + r._unpaid, 0))}</td>
                    <td className="font-bold px-3" />
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ CATEGORIES TAB ═══════════════════ */}
      {tab === 'categories' && (
        <div className="space-y-5">
          {categoryData.length === 0 ? (
            <div className="brand-card text-center py-16 text-gray-300 text-sm">
              No category data yet. Add line items to productions.
            </div>
          ) : (
            <>
              {/* Grouped bar chart */}
              <div className="brand-card">
                <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--brand-primary)' }}>Planned vs Paid vs Committed by Category</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={categoryData} margin={{ top: 4, right: 8, left: 0, bottom: 30 }}
                    onClick={d => { if (d?.activePayload) { const cat = d.activePayload[0]?.payload?.name; if (cat) setDrillDown({ type: 'category', cat }); } }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={55} />
                    <YAxis tickFormatter={v => `${currency === 'ILS' ? '₪' : '$'}${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
                    <Tooltip content={<MonthTooltip fmt={fmt} />} />
                    <Legend />
                    <Bar dataKey="planned" name="Planned" fill="#e0e7ff" radius={[3,3,0,0]} cursor="pointer" />
                    <Bar dataKey="paid" name="Paid" fill="var(--brand-accent, #6366f1)" radius={[3,3,0,0]} cursor="pointer" />
                    <Bar dataKey="committed" name="Committed" fill="#f59e0b" radius={[3,3,0,0]} cursor="pointer" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Categories table */}
              <div className="brand-card p-0 overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Planned</th>
                      <th>Paid</th>
                      <th>Committed</th>
                      <th>Remaining</th>
                      <th>% of Paid Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryData.map(cat => {
                      const remaining = cat.planned - cat.paid - cat.committed;
                      const pct = totalPaid > 0 ? Math.round((cat.paid / totalPaid) * 100) : 0;
                      return (
                        <tr key={cat.name} className="cursor-pointer hover:bg-indigo-50/20 transition-colors"
                          onClick={() => setDrillDown({ type: 'category', cat: cat.name })}>
                          <td className="font-semibold">{cat.name}</td>
                          <td>{fmt(cat.planned)}</td>
                          <td className="text-green-700 font-semibold">{cat.paid > 0 ? fmt(cat.paid) : '—'}</td>
                          <td className="text-amber-700">{cat.committed > 0 ? fmt(cat.committed) : '—'}</td>
                          <td className={remaining >= 0 ? 'diff-positive' : 'diff-negative'}>{fmt(remaining)}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-[60px]">
                                <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-8 tabular-nums">{pct}%</span>
                            </div>
                          </td>
                          <td><ChevronRight size={12} className="text-gray-300" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                      <td className="font-bold py-2 px-3">Total</td>
                      <td className="font-bold px-3">{fmt(categoryData.reduce((s, c) => s + c.planned, 0))}</td>
                      <td className="font-bold px-3 text-green-700">{fmt(totalPaid)}</td>
                      <td className="font-bold px-3 text-amber-700">{fmt(totalCommitted)}</td>
                      <td className="font-bold px-3" />
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Drill-down drawer ── */}
      {drillDown && (
        <DrillDownPanel
          drillDown={drillDown}
          lineItems={lineItems}
          productionRows={productionRows}
          fmt={fmt}
          getAmt={getAmt}
          onClose={() => setDrillDown(null)}
          productions={productions}
        />
      )}
    </div>
  );
}
