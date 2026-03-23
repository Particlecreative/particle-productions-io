import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  Legend, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { getAllCasting } from '../../lib/dataService';
import { useCurrency } from '../../context/CurrencyContext';
import clsx from 'clsx';

const STAGES = ['Pre Production', 'Production', 'Post', 'Paused', 'Pending', 'Completed'];
const PRODUCTION_TYPES = ['Shoot', 'Remote Shoot', 'AI'];

const PROD_TYPE_COLORS = {
  'Shoot':        '#0808f8',
  'Remote Shoot': '#0891b2',
  'AI':           '#7c3aed',
};

const STAGE_COLORS = {
  'Completed':      '#16a34a',
  'Production':     '#2563eb',
  'Pre Production': '#d97706',
  'Post':           '#7c3aed',
  'Paused':         '#ea580c',
  'Pending':        '#9ca3af',
};

const PIE_COLORS = ['#0808f8', '#0891b2', '#7c3aed', '#f59e0b', '#ef4444', '#10b981'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── helpers ───────────────────────────────────────────────────────────────────

function sumField(arr, field) {
  return arr.reduce((s, p) => s + (p[field] || 0), 0);
}

function KPICard({ label, value, sub, color }) {
  return (
    <div className="brand-card flex flex-col justify-between min-h-[90px]">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-black" style={{ color: color || 'var(--brand-primary)' }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, icon, children }) {
  return (
    <div className="brand-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className="font-bold text-gray-700 text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.value > 1000 && fmt ? fmt(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AnalysisView({ productions, brandId, selectedYear }) {
  const { fmt } = useCurrency();
  const [casting, setCasting] = useState([]);

  useEffect(() => {
    async function load() {
      const all = await Promise.resolve(getAllCasting());
      setCasting((Array.isArray(all) ? all : []).filter(c => c.brand_id === brandId));
    }
    load();
  }, [brandId]);

  // ── KPI ────────────────────────────────────────────────────────────────────
  const totalPlanned = sumField(productions, 'planned_budget_2026');
  const totalActual  = sumField(productions, 'actual_spent');
  const completed    = productions.filter(p => p.stage === 'Completed').length;
  const pctDone      = productions.length ? Math.round((completed / productions.length) * 100) : 0;

  // ── By Production Type (Pie) ───────────────────────────────────────────────
  const byProdType = useMemo(() =>
    PRODUCTION_TYPES.map(t => ({
      name: t,
      value: productions.filter(p => p.production_type === t).length,
    })).filter(d => d.value > 0),
    [productions]
  );

  // ── By Product Type (Horizontal Bar) ──────────────────────────────────────
  const byProductType = useMemo(() => {
    const types = [...new Set(productions.flatMap(p => p.product_type || []))];
    return types
      .map(t => ({ name: t, count: productions.filter(p => (p.product_type || []).includes(t)).length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [productions]);

  // ── By Stage (Bar: count + budget) ────────────────────────────────────────
  const byStage = useMemo(() =>
    STAGES.map(s => {
      const prods = productions.filter(p => p.stage === s);
      return {
        stage: s,
        count: prods.length,
        planned: sumField(prods, 'planned_budget_2026'),
        actual:  sumField(prods, 'actual_spent'),
      };
    }).filter(d => d.count > 0),
    [productions]
  );

  // ── Monthly distribution ───────────────────────────────────────────────────
  const byMonth = useMemo(() =>
    MONTHS.map((month, i) => ({
      month,
      count: productions.filter(p => {
        const m = p.planned_start ? new Date(p.planned_start + 'T00:00:00').getMonth() : -1;
        return m === i;
      }).length,
    })),
    [productions]
  );

  // ── Rights renewals ────────────────────────────────────────────────────────
  const overdue    = casting.filter(c => c.contract_status === 'Overdue');
  const closeToExp = casting.filter(c => c.contract_status === 'Close to Overdue');
  const perpetual  = casting.filter(c => c.period === 'Perpetually');
  const done       = casting.filter(c => c.contract_status === 'Done');
  const atRisk     = [...overdue, ...closeToExp];

  // ── Budget by type table ───────────────────────────────────────────────────
  const budgetByType = PRODUCTION_TYPES.map(t => {
    const prods = productions.filter(p => p.production_type === t);
    const planned = sumField(prods, 'planned_budget_2026');
    const actual  = sumField(prods, 'actual_spent');
    return { type: t, count: prods.length, planned, actual, pct: planned ? Math.round((actual / planned) * 100) : 0 };
  });

  if (productions.length === 0) {
    return (
      <div className="brand-card py-20 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="font-bold text-gray-600 mb-1">No data for {selectedYear}</h3>
        <p className="text-sm text-gray-400">Switch year or add productions to see analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Row 1: KPIs ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label={`${selectedYear} Productions`}
          value={productions.length}
          sub={`${completed} completed`}
          color="var(--brand-primary)"
        />
        <KPICard
          label="Completion Rate"
          value={`${pctDone}%`}
          sub={`${productions.length - completed} still active`}
          color={pctDone >= 75 ? '#16a34a' : pctDone >= 40 ? '#d97706' : '#ef4444'}
        />
        <KPICard
          label="Total Planned Budget"
          value={fmt(totalPlanned)}
          color="var(--brand-secondary)"
        />
        <KPICard
          label="Total Actual Spend"
          value={fmt(totalActual)}
          sub={totalPlanned ? `${Math.round((totalActual / totalPlanned) * 100)}% of planned` : ''}
          color="#16a34a"
        />
      </div>

      {/* ── Row 2: 3 charts ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Chart A: By Production Type (Donut) */}
        <ChartCard title="By Production Type" icon="🎬">
          {byProdType.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No production type data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={byProdType}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {byProdType.map((entry, i) => (
                    <Cell key={i} fill={PROD_TYPE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-1 justify-center">
            {byProdType.map(d => (
              <span key={d.name} className="flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PROD_TYPE_COLORS[d.name] || '#999' }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </ChartCard>

        {/* Chart B: By Stage */}
        <ChartCard title="By Stage" icon="📋">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byStage} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Productions" radius={[0, 4, 4, 0]}>
                {byStage.map(d => (
                  <Cell key={d.stage} fill={STAGE_COLORS[d.stage] || '#9ca3af'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart C: Monthly distribution */}
        <ChartCard title="Productions by Month" icon="📅">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth} margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Productions" fill="var(--brand-secondary)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Row 3: Product type + Rights ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Chart D: By Product Type */}
        <ChartCard title="By Product Type" icon="🏷️">
          {byProductType.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No product type tags found</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, byProductType.length * 28)}>
              <BarChart data={byProductType} layout="vertical" margin={{ left: 8, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Productions" fill="var(--brand-accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Card E: Rights Renewals */}
        <ChartCard title="Casting Rights Renewals" icon="⚖️">
          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Overdue',      count: overdue.length,    color: 'bg-red-100 text-red-700 border-red-200' },
              { label: 'Expiring',     count: closeToExp.length, color: 'bg-orange-100 text-orange-700 border-orange-200' },
              { label: 'Done',         count: done.length,       color: 'bg-green-100 text-green-700 border-green-200' },
              { label: 'Perpetual',    count: perpetual.length,  color: 'bg-blue-100 text-blue-700 border-blue-200' },
            ].map(s => (
              <div key={s.label} className={clsx('rounded-xl border text-center p-2', s.color)}>
                <div className="text-xl font-black">{s.count}</div>
                <div className="text-[10px] font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* At-risk table */}
          {atRisk.length === 0 ? (
            <p className="text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2 text-center">
              ✅ No cast members currently at risk
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Name</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Production</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Expires</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.slice(0, 8).map(c => (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-700">{c.name}</td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[130px]">{c.project_name || c.production_id}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {c.end_date
                          ? new Date(c.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold',
                          c.contract_status === 'Overdue'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-orange-100 text-orange-700'
                        )}>
                          {c.contract_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {atRisk.length > 8 && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={4} className="px-3 py-2 text-center text-gray-400 text-[11px]">
                        +{atRisk.length - 8} more — view Casting Rights for full list
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 4: Budget by Type full-width ───────────────────────────────── */}
      <ChartCard title={`Budget Breakdown by Production Type — ${selectedYear}`} icon="💰">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs text-gray-500 font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-semibold">Count</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-semibold">Planned</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-semibold">Actual</th>
                  <th className="px-4 py-2.5 text-right text-xs text-gray-500 font-semibold">% Used</th>
                </tr>
              </thead>
              <tbody>
                {budgetByType.filter(r => r.count > 0).map(r => (
                  <tr key={r.type} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PROD_TYPE_COLORS[r.type] }} />
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{r.count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-700">{fmt(r.planned)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{fmt(r.actual)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={clsx(
                        'text-xs font-semibold px-2 py-0.5 rounded-full',
                        r.pct >= 100 ? 'bg-red-100 text-red-700' :
                        r.pct >= 75  ? 'bg-orange-100 text-orange-700' :
                                       'bg-green-100 text-green-700'
                      )}>
                        {r.pct}%
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                  <td className="px-4 py-2.5 text-gray-700">Total</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{productions.length}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{fmt(totalPlanned)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{fmt(totalActual)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                      {totalPlanned ? Math.round((totalActual / totalPlanned) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grouped bar chart: planned vs actual by type */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={budgetByType.filter(r => r.count > 0)}
              margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="type" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip fmt={fmt} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="planned" name="Planned" fill="var(--brand-secondary)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual"  name="Actual"  fill="var(--brand-primary)"   radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
