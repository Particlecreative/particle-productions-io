import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';

const CLUSTER = { aging: 'Visible aging', hair: 'Hair', fragrance: 'Fragrance', shave: 'Shave & daily face' };

/** A/B Lab & Transfers: one variable per test, decided by AfterLife — and the map of which concepts travel. */
export default function Lab({ overview, notify }) {
  const [rows, setRows] = useState(null);
  const [cluster, setCluster] = useState('aging');
  useEffect(() => { mediumApi.affinity().then(r => setRows(r.affinity)).catch(e => notify(e.message, true)); }, [notify]);

  const grid = useMemo(() => {
    const list = (rows || []).filter(r => r.cluster === cluster);
    const products = [...new Set(list.flatMap(r => [r.source, r.target]))];
    const at = (s, t) => list.find(r => r.source === s && r.target === t);
    return { products, at };
  }, [rows, cluster]);

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="trk-glass p-5">
          <div className="trk-label">Tests</div>
          {(overview?.tests || []).length
            ? overview.tests.map(t => <div key={t.id} className="mt-2 text-[13.5px]"><b>{t.hypothesis}</b> <span className="trk-muted">· {t.axis} · {t.status}</span></div>)
            : <p className="mt-2 text-[13.5px] trk-muted">No tests yet. Every brief carries a Test: line; once briefs ship and AfterLife scores them, tests appear here with their progress to the decision floor.</p>}
        </div>
        <div className="trk-glass p-5 text-[13px]">
          <div className="trk-label mb-1">Decision rule</div>
          Win: ≥ 60th percentile in its own lane + product peer set after $1,000 spend or 14 days. Fail: below the 40th. Otherwise inconclusive. <span className="trk-dim">[AfterLife]</span>
        </div>
      </div>

      <div className="trk-glass p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="trk-label">Transfer map</div>
            <div className="text-[13px] trk-muted mt-0.5 max-w-[640px]">If a concept wins on the row product, how likely is it to work on the column product? Scores start from shared problem, buyer and proof — then learn from every transfer test.</div>
          </div>
          <div className="trk-seg ml-auto" role="group" aria-label="Product cluster">{Object.entries(CLUSTER).map(([k, l]) => <button key={k} type="button" aria-pressed={cluster === k} className={cluster === k ? 'on' : ''} onClick={() => setCluster(k)}>{l}</button>)}</div>
        </div>
        {!rows && <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>}
        {rows && (
          <div className="mt-4 overflow-x-auto">
            <table className="text-[13px] border-separate" style={{ borderSpacing: 6 }}>
              <thead><tr><th className="text-left trk-dim text-[11px] uppercase pr-2">From ↓ · To →</th>{grid.products.map(p => <th key={p} className="text-[12px] font-semibold px-1 min-w-[96px]">{p}</th>)}</tr></thead>
              <tbody>
                {grid.products.map(s => (
                  <tr key={s}>
                    <th className="text-left font-semibold pr-2 whitespace-nowrap">{s}</th>
                    {grid.products.map(t => {
                      const r = grid.at(s, t);
                      if (s === t) return <td key={t} className="text-center trk-dim rounded-lg" style={{ background: 'var(--trk-glass)' }}>—</td>;
                      if (!r) return <td key={t} className="text-center trk-dim rounded-lg" style={{ background: 'var(--trk-glass)' }} title="No score yet">·</td>;
                      const v = Number(r.score);
                      const strong = v >= 0.7, mid = v >= 0.4;
                      return (
                        <td key={t} className="text-center rounded-lg py-2 px-1" title={r.note || ''}
                          style={{ background: strong ? '#2E1F8F' : mid ? 'rgba(140,147,255,.45)' : 'var(--trk-glass-hi)', color: strong ? '#fff' : 'var(--trk-text)' }}>
                          <div className="font-bold tabular-nums">{v.toFixed(2)}</div>
                          <div className="text-[10.5px] opacity-80">{r.tested ? `${r.won}/${r.tested} won` : r.note ? 'condition' : 'untested'}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-4 text-[12px] trk-muted">
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: '#2E1F8F' }} /> Strong (≥ 0.7)</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: 'rgba(140,147,255,.45)' }} /> Possible (0.4–0.7)</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: 'var(--trk-glass-hi)' }} /> Weak (&lt; 0.4)</span>
              <span>Hover a cell for its condition. Use the Generator’s “Transfer” moves to brief one.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Holiday Builder — the next step; shows the calendar it will work from and what it still needs. */
export function Holiday({ overview }) {
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
      <div className="trk-glass p-5">
        <div className="trk-label">Holidays Medium is watching</div>
        <div className="mt-2 space-y-2 text-[14px]">
          {(overview?.holidays || []).map(h => (
            <div key={h.name} className="flex flex-wrap gap-2 items-baseline" style={{ borderTop: '1px solid var(--trk-line)', paddingTop: 8 }}>
              <b>{h.name}</b><span className="trk-muted">sale {h.date}</span>
              <span className={`trk-chip ${h.days_to_brief_by < 0 ? 'gray' : h.days_to_brief_by < 10 ? 'amber' : 'green'}`}>{h.days_to_brief_by < 0 ? 'brief window closed' : `briefs due in ${h.days_to_brief_by} days`}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="trk-glass p-5 text-[13.5px]">
        <div className="trk-label mb-2">Holiday Builder — next</div>
        <p className="trk-muted">One setup (holiday, sale window, lanes, tiers and codes, products, templates) becomes the whole ticket matrix in house style. Parents go first; GIFs, iMessage GIFs, translations and remarketing are proposed only after their parent is approved. Every parent goes through Captain Caption’s batch pre-flight (already live) — one code, one end date, one price per product and tier.</p>
        <p className="mt-2 trk-muted">It needs, before it can run: the offer calendar and list prices in Captain Caption’s Brain, and AfterLife holiday tags to recreate last holiday’s winners first.</p>
      </div>
    </div>
  );
}
