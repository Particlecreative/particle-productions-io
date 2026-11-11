import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';

const CLUSTER = { aging: 'Visible aging', hair: 'Hair', fragrance: 'Fragrance', shave: 'Shave & daily face' };

/** A/B Lab & Transfers: one variable per test, decided by AfterLife — and the map of which concepts travel. */
const TEST_STATUS = { waiting: ['Waiting to ship', 'gray'], running: ['Running', 'amber'], won: ['Won', 'green'], failed: ['Failed', 'red'], inconclusive: ['Inconclusive', 'gray'], idea: ['Idea', 'gray'] };
const CLUSTERS_ALL = { aging: 'Visible aging', hair: 'Hair', fragrance: 'Fragrance', shave: 'Shave & daily face', learned: 'Learned' };

export default function Lab({ overview, notify }) {
  const [rows, setRows] = useState(null);
  const [cluster, setCluster] = useState('aging');
  const [sc, setSc] = useState(null);
  useEffect(() => { mediumApi.affinity().then(r => setRows(r.affinity)).catch(e => notify(e.message, true)); }, [notify]);
  useEffect(() => { mediumApi.scorecard().then(setSc).catch(() => setSc({ rows: [], tests: [] })); }, []);

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
            ? overview.tests.map(t => { const [l, tone] = TEST_STATUS[t.status] || [t.status, 'gray']; return (
              <div key={t.id} className="mt-2 text-[13.5px] flex flex-wrap items-baseline gap-2" style={{ borderTop: '1px solid var(--trk-line)', paddingTop: 8 }}>
                <span className={`trk-chip ${tone}`}>{l}</span><span className="trk-chip gray">{t.axis}</span><span className="flex-1 min-w-[200px]">{t.hypothesis}</span>
                {t.result?.percentile != null && <span className="trk-muted tabular-nums">{t.result.percentile}th pct · ${Math.round(t.result.spend || 0).toLocaleString()}</span>}
              </div>
            ); })
            : <p className="mt-2 text-[13.5px] trk-muted">No tests yet. Every approved brief becomes a test (its Test: line); once it ships, its results decide it — won, failed or inconclusive — and transfer results update the map below.</p>}
        </div>
        <div className="trk-glass p-5 text-[13px]">
          <div className="trk-label mb-1">Decision rule</div>
          Win: ≥ 60th percentile in its own lane + product peer set after $1,000 spend or 14 days. Fail: below the 40th. Otherwise inconclusive. <span className="trk-dim">[AfterLife links each shipped ad to its brief]</span>
        </div>
      </div>

      <div className="trk-glass p-5">
        <div className="trk-label">Articles — where lane ads land</div>
        <div className="text-[12px] trk-muted mt-0.5">Found in past SFY / GT / WAC tickets. A lane brief must point at one that exists; when the best idea needs one that doesn’t, Medium logs an Article Opportunity for the editorial owner.</div>
        <div className="mt-3 grid md:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          {(overview?.articles || []).filter(a => !a.opportunity).slice(0, 24).map(a => (
            <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="flex gap-2 hover:underline underline-offset-2 min-w-0"><span className="trk-chip gray">{a.lane}</span><span className="truncate">{a.title || a.url}</span>{a.products?.length ? <span className="trk-dim truncate">· {a.products.slice(0, 2).join(', ')}</span> : null}</a>
          ))}
          {!(overview?.articles || []).some(a => !a.opportunity) && <div className="trk-dim">None found yet — they appear after the next corpus import.</div>}
        </div>
        {(overview?.articles || []).some(a => a.opportunity) && (
          <div className="mt-3 text-[13px]"><div className="trk-label mb-1">Article opportunities</div>{overview.articles.filter(a => a.opportunity).map(a => <div key={a.url}><span className="trk-chip amber">{a.lane}</span> {a.title}</div>)}</div>
        )}
      </div>

      {sc?.rows?.length > 0 && (
        <div className="trk-glass p-5">
          <div className="trk-label">Scorecard — by lane, source and move</div>
          <div className="text-[12px] trk-muted mt-0.5">Approval and edit rates now; shipped and winners fill in as briefs reach Monday and their ads get results. Lane mix and transfer scores reweight from this.</div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-[13px]">
            <thead><tr className="text-left trk-dim text-[11px] uppercase"><th className="py-1 pr-3">Lane</th><th className="pr-3">Source</th><th className="pr-3">Move</th><th className="pr-3">Briefs</th><th className="pr-3">Approved</th><th className="pr-3">Edited</th><th className="pr-3">Rejected</th><th className="pr-3">On Monday</th><th className="pr-3">Avg score</th><th className="pr-3">Cost</th></tr></thead>
            <tbody>{sc.rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--trk-line)' }}>
                <td className="py-1.5 pr-3">{r.lane}</td><td className="pr-3 trk-muted">{r.source}</td><td className="pr-3 trk-muted">{r.move}</td><td className="pr-3 tabular-nums">{r.briefs}</td>
                <td className="pr-3 tabular-nums">{r.briefs ? `${Math.round((100 * r.approved) / r.briefs)}%` : '—'}</td><td className="pr-3 tabular-nums">{r.approved ? `${Math.round((100 * r.edited) / Math.max(r.approved, 1))}%` : '—'}</td>
                <td className="pr-3 tabular-nums">{r.rejected}</td><td className="pr-3 tabular-nums">{r.shipped}</td><td className="pr-3 tabular-nums">{r.avg_score ?? '—'}</td><td className="pr-3 tabular-nums">${(r.cost || 0).toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      <div className="trk-glass p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="trk-label">Transfer map</div>
            <div className="text-[13px] trk-muted mt-0.5 max-w-[640px]">If a concept wins on the row product, how likely is it to work on the column product? Scores start from shared problem, buyer and proof — then learn from every transfer test.</div>
          </div>
          <div className="trk-seg ml-auto" role="group" aria-label="Product cluster">{Object.entries(rows?.some(r => r.cluster === 'learned') ? CLUSTERS_ALL : CLUSTER).map(([k, l]) => <button key={k} type="button" aria-pressed={cluster === k} className={cluster === k ? 'on' : ''} onClick={() => setCluster(k)}>{l}</button>)}</div>
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
