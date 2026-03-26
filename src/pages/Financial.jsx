import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useCurrency } from '../context/CurrencyContext';
import { useAuth } from '../context/AuthContext';
import { getProductions, getAllLineItems } from '../lib/dataService';
import { EXPENSE_CATEGORIES } from '../lib/mockData';
import { useLists } from '../context/ListsContext';
import clsx from 'clsx';

const YEARS = [2024, 2025, 2026, 2027, 2028];

const PIE_COLORS = ['#0808f8', '#030b2e', '#27AE60', '#F5A623', '#E74C3C', '#9B59B6', '#3498DB', '#95A5A6'];

export default function Financial() {
  const { brandId } = useBrand();
  const { fmt, currency } = useCurrency();
  const { isEditor } = useAuth();
  const { lists } = useLists();
  const [view, setView] = useState('overview');

  const [selectedYear, setSelectedYear] = useState(2026);
  const [productions, setProductions] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [yearlyBudget, setYearlyBudget] = useState(() =>
    Number(localStorage.getItem(`cp_yearly_budget_${brandId}_${2026}`)) || 600_000
  );
  const [pendingBudget, setPendingBudget] = useState(null); // { newVal: number } | null

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

  const totalPlanned = useMemo(() => productions.reduce((s, p) => s + (parseFloat(p.planned_budget_2026) || 0), 0), [productions]);
  const totalActual = useMemo(() => productions.reduce((s, p) => s + (parseFloat(p.actual_spent) || 0), 0), [productions]);
  const pctSpent = yearlyBudget > 0 ? Math.round((totalActual / yearlyBudget) * 100) : 0;

  // Category breakdown (from line item types → mapped to expense categories)
  const categoryData = useMemo(() => {
    const map = {};
    EXPENSE_CATEGORIES.forEach(c => { map[c] = { planned: 0, actual: 0 }; });

    lineItems.forEach(li => {
      const cat = mapTypeToCategory(li.type);
      if (map[cat]) {
        map[cat].planned += parseFloat(li.planned_budget) || 0;
        map[cat].actual += parseFloat(li.actual_spent) || 0;
      }
    });

    return EXPENSE_CATEGORIES
      .map(c => ({
        name: c,
        planned: map[c].planned,
        actual: map[c].actual,
        pct: totalActual > 0 ? Math.round((map[c].actual / totalActual) * 100) : 0,
      }))
      .filter(c => c.planned > 0 || c.actual > 0);
  }, [lineItems, totalActual]);

  const pieData = useMemo(() =>
    categoryData.filter(c => c.actual > 0).map(c => ({ name: c.name, value: c.actual })),
  [categoryData]);

  const completedProds = useMemo(() =>
    productions.filter(p => p.stage === 'Completed'),
  [productions]);

  // Upcoming spend: non-completed productions grouped by month
  const upcomingByMonth = useMemo(() => {
    const upcoming = productions.filter(p => p.stage !== 'Completed' && p.stage !== 'Archived');
    const monthMap = {};
    upcoming.forEach(p => {
      const dateKey = p.planned_start || p.created_at;
      const month = dateKey ? dateKey.slice(0, 7) : 'Unknown';
      if (!monthMap[month]) monthMap[month] = [];
      monthMap[month].push(p);
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, prods]) => ({
        month,
        label: month === 'Unknown' ? 'Unknown' : new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        prods,
        total: prods.reduce((s, p) => s + (parseFloat(p.planned_budget_2026) || 0), 0),
      }));
  }, [productions]);

  if (loading) {
    return (
      <div className="page-enter">
        <div className="flex items-center justify-between mb-8">
          <div className="skeleton h-8 w-64 rounded-lg" />
          <div className="skeleton h-8 w-48 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="skeleton h-3 w-20 rounded mb-3" />
              <div className="skeleton h-8 w-32 rounded mb-2" />
              <div className="skeleton h-1.5 w-16 rounded" />
            </div>
          ))}
        </div>
        <div className="brand-card">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="skeleton h-4 w-28 rounded" />
                <div className="skeleton h-4 flex-1 rounded" />
                <div className="skeleton h-4 w-20 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter animate-fade-in">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <h1
          className="text-2xl font-black brand-title tracking-tight"
          style={{ color: 'var(--brand-primary)', letterSpacing: '-0.03em' }}
        >
          Financial Overview
        </h1>

        {/* Year Switcher */}
        <div className="flex items-center gap-0 border rounded-xl overflow-hidden bg-white" style={{ borderColor: 'var(--brand-border)' }}>
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={clsx('px-2.5 py-1.5 text-xs font-semibold transition-all',
                selectedYear === y ? 'text-white' : 'text-gray-500 hover:bg-gray-50'
              )}
              style={selectedYear === y ? { background: 'var(--brand-accent)' } : {}}
            >
              {y}
            </button>
          ))}
        </div>

        {/* View Switcher */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border" style={{ borderColor: 'var(--brand-border)' }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'categories', label: 'By Category' },
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                view === v.id ? 'text-white' : 'text-gray-500 hover:text-gray-700'
              )}
              style={view === v.id ? { background: 'var(--brand-accent)' } : {}}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* OVERVIEW */}
      {view === 'overview' && (
        <div>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-5">
            <KPICard label={`${selectedYear} Planned Budget`} value={fmt(yearlyBudget)} editable
              onEdit={v => setPendingBudget({ newVal: parseFloat(v) || 0 })} />
            <KPICard label="Actual Spend to Date" value={fmt(totalActual)} />
            <KPICard label="% Spent of Total" value={`${pctSpent}%`} />
            <KPICard label="Remaining" value={fmt(yearlyBudget - totalActual)} positive={yearlyBudget > totalActual} />
          </div>

          {/* Budget Change Confirmation Strip */}
          {pendingBudget && (
            <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              <span className="text-amber-700 font-medium flex-1">
                Change {selectedYear} budget from <strong>{fmt(yearlyBudget)}</strong> to <strong>{fmt(pendingBudget.newVal)}</strong>?
              </span>
              <button onClick={confirmBudget} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">
                Confirm
              </button>
              <button onClick={() => setPendingBudget(null)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="brand-card" style={{ padding: '32px' }}>
              <h3 className="font-bold text-sm mb-6" style={{ color: 'var(--brand-primary)' }}>
                Spend by Category
              </h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-60 flex items-center justify-center text-gray-300 text-sm">
                  No spending data yet
                </div>
              )}
            </div>

            {/* Bar Chart */}
            <div className="brand-card" style={{ padding: '32px' }}>
              <h3 className="font-bold text-sm mb-6" style={{ color: 'var(--brand-primary)' }}>
                Budget vs Actual by Stage
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[
                  { stage: 'Completed',       planned: totalByStage(productions, 'Completed').planned,       actual: totalByStage(productions, 'Completed').actual },
                  { stage: 'Production',      planned: totalByStage(productions, 'Production').planned,      actual: totalByStage(productions, 'Production').actual },
                  { stage: 'Post Production', planned: totalByStage(productions, 'Post Production').planned, actual: totalByStage(productions, 'Post Production').actual },
                  { stage: 'Pending',         planned: totalByStage(productions, 'Pending').planned,         actual: totalByStage(productions, 'Pending').actual },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${currency === 'ILS' ? '₪' : '$'}${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend />
                  <Bar dataKey="planned" fill="var(--brand-secondary)" name="Planned" radius={[3,3,0,0]} />
                  <Bar dataKey="actual" fill="var(--brand-primary)" name="Actual" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Upcoming Spend by Month */}
          {upcomingByMonth.length > 0 && (
            <div className="mt-6">
              <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--brand-primary)' }}>
                Upcoming Spend by Month
              </h3>
              <div className="space-y-4">
                {upcomingByMonth.map(({ month, label, prods, total }) => (
                  <div key={month} className="brand-card">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>{label}</h4>
                      <span className="text-sm font-bold" style={{ color: 'var(--brand-accent)' }}>{fmt(total)}</span>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Production</th>
                          <th>Stage</th>
                          <th>Planned Budget</th>
                          <th>Actual Spent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prods.map(p => (
                          <tr key={p.id}>
                            <td className="font-mono text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>{p.id}</td>
                            <td className="font-medium">{p.project_name}</td>
                            <td><span className="badge stage-upcoming text-xs">{p.stage}</span></td>
                            <td>{fmt(p.planned_budget_2026)}</td>
                            <td>{fmt(p.actual_spent)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed Productions */}
          {completedProds.length > 0 && (
            <div className="mt-6">
              <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--brand-primary)' }}>
                Completed Productions
              </h3>
              <div className="brand-card p-0 overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Project Name</th>
                      <th>Planned Budget</th>
                      <th>Final Cost</th>
                      <th>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedProds.map(p => {
                      const diff = (parseFloat(p.planned_budget_2026) || 0) - (parseFloat(p.actual_spent) || 0);
                      return (
                        <tr key={p.id}>
                          <td className="font-mono text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>{p.id}</td>
                          <td className="font-medium">{p.project_name}</td>
                          <td>{fmt(p.planned_budget_2026)}</td>
                          <td>{fmt(p.actual_spent)}</td>
                          <td className={diff >= 0 ? 'diff-positive' : 'diff-negative'}>
                            {diff >= 0 ? '+' : ''}{fmt(diff)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CATEGORIES */}
      {view === 'categories' && (
        <CategoryView categoryData={categoryData} totalActual={totalActual} fmt={fmt} />
      )}
    </div>
  );
}

function totalByStage(productions, stage) {
  const prods = productions.filter(p => p.stage === stage);
  return {
    planned: prods.reduce((s, p) => s + (parseFloat(p.planned_budget_2026) || 0), 0),
    actual: prods.reduce((s, p) => s + (parseFloat(p.actual_spent) || 0), 0),
  };
}

function mapTypeToCategory(type) {
  const map = {
    'Crew': 'Talent',
    'Equipment': 'Other',
    'Catering & Transport': 'Other',
    'Post': 'Post Production',
    'Office': 'Other',
    'Director': 'Director',
    'Talent': 'Talent',
    'AI Tools': 'AI Tools',
    'Sound': 'Sound',
    'Offline Editor': 'Offline Editor',
  };
  return map[type] || 'Other';
}

function KPICard({ label, value, editable, onEdit, positive }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      {editing ? (
        <div className="flex gap-2">
          <input
            autoFocus
            type="number"
            className="brand-input text-sm"
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={() => { onEdit(val); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onEdit(val); setEditing(false); } }}
          />
        </div>
      ) : (
        <div
          className={clsx('text-3xl font-black kpi-value tracking-tighter', positive === false ? 'diff-negative' : positive ? 'diff-positive' : '')}
          style={{ color: positive == null ? 'var(--brand-primary)' : undefined, letterSpacing: '-0.04em', lineHeight: 1 }}
          onClick={() => { if (editable) { setVal(''); setEditing(true); } }}
          title={editable ? 'Click to edit' : ''}
        >
          {value}
          {editable && <span className="text-xs text-gray-300 ml-1 font-normal">edit</span>}
        </div>
      )}
    </div>
  );
}

// AllItemsView moved to /accounting page
function _DEAD_AllItemsView({ items, productions, fmt, stageFilter, setStageFilter, statusFilter, setStatusFilter }) {
  const [ledgerTab, setLedgerTab] = useState('summary');
  const totalUSD = items.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);

  // Summary stats
  const paid = items.filter(i => i.payment_status === 'Paid');
  const notPaid = items.filter(i => i.payment_status === 'Not Paid' || !i.payment_status);
  const pending = items.filter(i => i.payment_status === 'Pending');
  const mismatches = items.filter(i => i.invoice && Math.abs((parseFloat(i.invoice.amount) || 0) - (parseFloat(i.actual_spent) || 0)) > 0.01);

  const paidTotal = paid.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const notPaidTotal = notPaid.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const pendingTotal = pending.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);

  // By payment method
  const byMethod = {};
  items.forEach(i => {
    const m = i.payment_method || 'Unspecified';
    if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
    byMethod[m].count++;
    byMethod[m].total += parseFloat(i.actual_spent) || 0;
  });

  // By production
  const byProduction = {};
  items.forEach(i => {
    if (!byProduction[i.production_id]) {
      byProduction[i.production_id] = {
        production: i.production,
        items: [],
        total: 0,
      };
    }
    byProduction[i.production_id].items.push(i);
    byProduction[i.production_id].total += parseFloat(i.actual_spent) || 0;
  });

  // Filters bar (shared across sub-tabs)
  const FiltersBar = () => (
    <div className="flex gap-3 mb-4 flex-wrap items-center">
      <select className="brand-input" style={{ width: 160 }} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
        <option value="">All stages</option>
        {lists.stages.map(s => <option key={s}>{s}</option>)}
      </select>
      <select className="brand-input" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
        <option value="">All pay statuses</option>
        {['Paid', 'Not Paid', 'Pending'].map(s => <option key={s}>{s}</option>)}
      </select>
      <div className="ml-auto text-sm text-gray-500">
        {items.length} items · Total: <strong className="ml-1">{fmt(totalUSD)}</strong>
      </div>
    </div>
  );

  return (
    <div>
      {/* Sub-tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {[
          { id: 'summary', label: '📊 Summary' },
          { id: 'by-production', label: '🎬 By Production' },
          { id: 'full', label: '📋 Full Table' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setLedgerTab(t.id)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              ledgerTab === t.id ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FiltersBar />

      {/* SUMMARY */}
      {ledgerTab === 'summary' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="brand-card border-l-4 border-green-400">
              <div className="text-xs text-gray-400 mb-1">Paid</div>
              <div className="text-xl font-black text-green-700">{fmt(paidTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{paid.length} items</div>
            </div>
            <div className="brand-card border-l-4 border-orange-400">
              <div className="text-xs text-gray-400 mb-1">Not Paid</div>
              <div className="text-xl font-black text-orange-700">{fmt(notPaidTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{notPaid.length} items</div>
            </div>
            <div className="brand-card border-l-4 border-gray-300">
              <div className="text-xs text-gray-400 mb-1">Pending</div>
              <div className="text-xl font-black text-gray-700">{fmt(pendingTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{pending.length} items</div>
            </div>
            <div className="brand-card border-l-4 border-red-400">
              <div className="text-xs text-gray-400 mb-1">⚠ Mismatches</div>
              <div className="text-xl font-black text-red-700">{mismatches.length}</div>
              <div className="text-xs text-gray-400 mt-1">invoice vs recorded</div>
            </div>
          </div>

          {/* Payment Method Breakdown */}
          <div className="brand-card">
            <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--brand-primary)' }}>By Payment Method</h3>
            {Object.keys(byMethod).length === 0 ? (
              <div className="text-gray-300 text-sm py-4 text-center">No payment method data</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Payment Method</th>
                    <th>Items</th>
                    <th>Total Amount</th>
                    <th>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byMethod).sort((a, b) => b[1].total - a[1].total).map(([method, data]) => (
                    <tr key={method}>
                      <td className="font-medium">{method}</td>
                      <td className="text-gray-500">{data.count}</td>
                      <td className="font-bold">{fmt(data.total)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${totalUSD ? Math.round((data.total / totalUSD) * 100) : 0}%`, background: 'var(--brand-accent)' }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">
                            {totalUSD ? Math.round((data.total / totalUSD) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                    <td className="font-bold py-2 px-3">Grand Total</td>
                    <td className="font-bold px-3">{items.length}</td>
                    <td className="font-bold px-3">{fmt(totalUSD)}</td>
                    <td className="px-3 text-gray-400 text-xs">100%</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* BY PRODUCTION */}
      {ledgerTab === 'by-production' && (
        <div className="space-y-4">
          {Object.keys(byProduction).length === 0 ? (
            <div className="brand-card text-center py-16 text-gray-300 text-sm">No items found</div>
          ) : Object.entries(byProduction)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([prodId, data]) => (
              <ProductionLedgerGroup
                key={prodId}
                prodId={prodId}
                data={data}
                fmt={fmt}
              />
            ))}
        </div>
      )}

      {/* FULL TABLE */}
      {ledgerTab === 'full' && (
        <div className="brand-card p-0 overflow-hidden">
          <div className="table-scroll-wrapper">
            <table className="data-table" style={{ minWidth: 1000 }}>
              <thead>
                <tr>
                  <th>Production</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Price</th>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Payment Method</th>
                  <th>Business Type</th>
                  <th>Payment Due</th>
                  <th>⚠</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-gray-400 text-sm">No items found</td></tr>
                ) : items.map(item => {
                  const mismatch = item.invoice && Math.abs((parseFloat(item.invoice.amount) || 0) - (parseFloat(item.actual_spent) || 0)) > 0.01;
                  return (
                    <tr key={item.id}>
                      <td className="font-mono text-xs" style={{ color: 'var(--brand-secondary)' }}>
                        {item.production_id}
                      </td>
                      <td>{item.full_name || '—'}</td>
                      <td>{item.item || '—'}</td>
                      <td className="font-semibold">{fmt(item.actual_spent)}</td>
                      <td>
                        {item.invoice ? (
                          <a href={item.invoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">View ↗</a>
                        ) : (item.invoice_url ? <a href={item.invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 underline">View ↗</a> : '—')}
                      </td>
                      <td>
                        <span className={clsx('badge',
                          item.payment_status === 'Paid' ? 'status-done' :
                          item.payment_status === 'Pending' ? 'status-not-started' : 'status-working'
                        )}>
                          {item.payment_status || 'Not Paid'}
                        </span>
                      </td>
                      <td className="text-xs">{item.payment_method || '—'}</td>
                      <td className="text-xs">{item.business_type || '—'}</td>
                      <td className="text-xs">{item.invoice?.payment_due ? formatDateIST(item.invoice.payment_due) : '—'}</td>
                      <td>
                        {mismatch && <span className="badge invoice-mismatch text-xs">⚠</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductionLedgerGroup({ prodId, data, fmt }) {
  const [expanded, setExpanded] = useState(true);
  const paidTotal = data.items.filter(i => i.payment_status === 'Paid').reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);
  const notPaidTotal = data.items.filter(i => i.payment_status !== 'Paid').reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0);

  return (
    <div className="brand-card">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--brand-secondary)' }}>{prodId}</span>
          <span className="font-semibold text-gray-800">{data.production?.project_name || ''}</span>
          <span className="text-xs text-gray-400">{data.items.length} items</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-green-600 font-semibold">✓ {fmt(paidTotal)}</span>
          <span className="text-xs text-orange-600 font-semibold">⊘ {fmt(notPaidTotal)}</span>
          <span className="font-bold text-sm" style={{ color: 'var(--brand-primary)' }}>{fmt(data.total)}</span>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role / Item</th>
                <th>Amount</th>
                <th>Pay Status</th>
                <th>Method</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(item => (
                <tr key={item.id}>
                  <td className="font-medium">{item.full_name || '—'}</td>
                  <td className="text-gray-500">{item.item || '—'}</td>
                  <td className="font-semibold">{fmt(item.actual_spent)}</td>
                  <td>
                    <span className={clsx('badge text-xs',
                      item.payment_status === 'Paid' ? 'status-done' :
                      item.payment_status === 'Pending' ? 'status-not-started' : 'status-working'
                    )}>
                      {item.payment_status || 'Not Paid'}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500">{item.payment_method || '—'}</td>
                  <td className="text-xs text-gray-400 max-w-xs truncate">{item.payment_note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoryView({ categoryData, totalActual, fmt }) {
  if (categoryData.length === 0) {
    return (
      <div className="brand-card text-center py-16 text-gray-300">
        No category data yet. Add line items to productions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categoryData.map((cat, i) => (
        <div key={cat.name} className="brand-card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-bold" style={{ color: 'var(--brand-primary)' }}>{cat.name}</h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">Planned: <strong>{fmt(cat.planned)}</strong></span>
              <span className="text-gray-500">Actual: <strong>{fmt(cat.actual)}</strong></span>
              <span
                className="font-bold"
                style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}
              >
                {cat.pct}% of total
              </span>
            </div>
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{
                width: `${cat.pct}%`,
                background: PIE_COLORS[i % PIE_COLORS.length],
                animation: 'progressGrow 0.8s ease-out',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
