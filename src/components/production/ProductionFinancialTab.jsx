import { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { useCurrency } from '../../context/CurrencyContext';
import { useLists } from '../../context/ListsContext';
import { getLineItems } from '../../lib/dataService';
import clsx from 'clsx';

const PIE_COLORS = ['#0808f8', '#030b2e', '#27AE60', '#F5A623', '#E74C3C', '#9B59B6', '#3498DB', '#95A5A6'];

export default function ProductionFinancialTab({ productionId, production }) {
  const { fmt } = useCurrency();
  const { lists } = useLists();

  const [items, setItems] = useState([]);
  useEffect(() => {
    async function load() {
      const li = await Promise.resolve(getLineItems(productionId));
      setItems(Array.isArray(li) ? li : []);
    }
    load();
  }, [productionId]);

  const totalPlanned = parseFloat(production?.planned_budget_2026) || 0;

  const totalActual = useMemo(
    () => items.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0),
    [items]
  );

  const pctUsed = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  const remaining = totalPlanned - totalActual;

  const typeData = useMemo(() => {
    return lists.lineItemTypes
      .map(type => {
        const ti = items.filter(i => i.type === type);
        return {
          name: type,
          planned: ti.reduce((s, i) => s + (parseFloat(i.planned_budget) || 0), 0),
          actual: ti.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0),
        };
      })
      .filter(t => t.planned > 0 || t.actual > 0);
  }, [items, lists.lineItemTypes]);

  const pieData = useMemo(
    () => typeData.filter(t => t.actual > 0).map(t => ({ name: t.name, value: t.actual })),
    [typeData]
  );

  const paymentStats = useMemo(() => {
    const paid    = items.filter(i => i.payment_status === 'Paid');
    const pending = items.filter(i => i.payment_status === 'Pending');
    const notPaid = items.filter(i => !i.payment_status || i.payment_status === 'Not Paid');
    return {
      paid,    paidTotal:    paid.reduce((s, i)    => s + (parseFloat(i.actual_spent) || 0), 0),
      pending, pendingTotal: pending.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0),
      notPaid, notPaidTotal: notPaid.reduce((s, i) => s + (parseFloat(i.actual_spent) || 0), 0),
    };
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="brand-card text-center py-16 text-gray-300 text-sm">
        Add line items in the Budget Table to see the financial breakdown.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Planned Budget" value={fmt(totalPlanned)} />
        <KPICard label="Actual Spent" value={fmt(totalActual)} />
        <KPICard
          label="% of Budget Used"
          value={`${pctUsed}%`}
          sub={pctUsed > 100 ? 'Over budget' : `${100 - pctUsed}% remaining`}
          positive={pctUsed <= 100}
        />
        <KPICard
          label="Remaining"
          value={fmt(Math.abs(remaining))}
          sub={remaining < 0 ? 'over budget' : 'left'}
          positive={remaining >= 0}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Donut Pie — Spend by Type */}
        <div className="brand-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--brand-primary)' }}>
            Spend by Type
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={v => [fmt(v), 'Actual']} />
                <Legend iconSize={10} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-300 text-sm">
              No actual spend recorded yet
            </div>
          )}
        </div>

        {/* Bar Chart — Budget vs Actual by Type */}
        <div className="brand-card">
          <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--brand-primary)' }}>
            Budget vs Actual by Type
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={typeData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
                width={48}
              />
              <Tooltip formatter={v => [fmt(v)]} />
              <Legend iconSize={10} />
              <Bar dataKey="planned" fill="var(--brand-secondary, #b0bec5)" name="Planned" radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" fill="var(--brand-primary)" name="Actual" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Type Breakdown Table */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--brand-border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>
            Breakdown by Type
          </h3>
        </div>
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Type</th>
                <th>Planned</th>
                <th>Actual</th>
                <th>Variance</th>
                <th>% of Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {typeData.map(t => {
                const diff = t.planned - t.actual;
                const pct = totalActual > 0 ? Math.round((t.actual / totalActual) * 100) : 0;
                return (
                  <tr key={t.name}>
                    <td className="font-medium">{t.name}</td>
                    <td>{fmt(t.planned)}</td>
                    <td>{fmt(t.actual)}</td>
                    <td className={clsx('font-semibold', diff >= 0 ? 'diff-positive' : 'diff-negative')}>
                      {diff >= 0 ? '+' : ''}{fmt(diff)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5" style={{ minWidth: 60 }}>
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${pct}%`, background: 'var(--brand-primary)' }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--brand-bg)', borderTop: '2px solid var(--brand-border)' }}>
                <td className="font-bold py-2 px-3">Total</td>
                <td className="font-bold px-3">{fmt(typeData.reduce((s, t) => s + t.planned, 0))}</td>
                <td className="font-bold px-3">{fmt(totalActual)}</td>
                <td className={clsx('font-bold px-3', remaining >= 0 ? 'diff-positive' : 'diff-negative')}>
                  {remaining >= 0 ? '+' : ''}{fmt(remaining)}
                </td>
                <td className="px-3 text-sm font-bold">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payment Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="brand-card border-l-4 border-green-400">
          <div className="text-xs text-gray-400 mb-1">Paid</div>
          <div className="text-xl font-black text-green-600">{fmt(paymentStats.paidTotal)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{paymentStats.paid.length} item{paymentStats.paid.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="brand-card border-l-4 border-orange-400">
          <div className="text-xs text-gray-400 mb-1">Not Paid</div>
          <div className="text-xl font-black text-orange-600">{fmt(paymentStats.notPaidTotal)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{paymentStats.notPaid.length} item{paymentStats.notPaid.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="brand-card border-l-4 border-gray-300">
          <div className="text-xs text-gray-400 mb-1">Pending</div>
          <div className="text-xl font-black text-gray-600">{fmt(paymentStats.pendingTotal)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{paymentStats.pending.length} item{paymentStats.pending.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

    </div>
  );
}

function KPICard({ label, value, sub, positive }) {
  return (
    <div className="brand-card">
      <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</div>
      <div className={clsx(
        'text-xl font-black',
        positive === false ? 'diff-negative' : 'text-gray-800'
      )}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
