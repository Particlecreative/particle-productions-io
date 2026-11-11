import Lab from './Lab';
import { LANE_LABEL } from './util';
import Sources from './Sources';

const BELIEF = { proven: ['Proven', 'green'], testing: ['Being tested', 'amber'], assumption: ['A hunch', 'gray'], retired: ['Retired', 'gray'] };
const PARTS = [['thinks', '🧠', 'What it believes'], ['tests', '🧪', 'Tests & transfers'], ['sources', '🔌', 'Sources & settings']];

function Status({ ok, warn, label, title }) {
  return <span className="trk-chip gray" title={title}><span className="cc-dot" style={{ background: ok ? 'var(--trk-green)' : warn ? 'var(--trk-amber)' : 'var(--trk-red)' }} /> {label}</span>;
}

/** How Medium decides — beliefs, tests, sources and switches. Nobody needs this to make a brief. */
export default function Behind({ part, setPart, overview, notify, isAdmin, reload, onOpen }) {
  const p = PARTS.some(x => x[0] === part) ? part : 'thinks';
  const src = overview?.sources || {};
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="md-sub max-w-[620px]">How Medium makes its calls: what it believes, what it’s testing, and where it learns from. You don’t need any of this to make a brief — it’s here when you’re curious.</p>
        {overview && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Status ok={src.upspring_account?.connected} label="Upspring account" title={src.upspring_account?.connected ? `Ranks Particle’s own ads${src.upspring_account?.ranks?.as_of ? ` — updated ${new Date(src.upspring_account.ranks.as_of).toLocaleString()}` : ''}` : 'Not connected — Sources & settings → Connect Upspring'} />
            <Status ok={src.upspring?.connected} label="Upspring market" title={src.upspring?.connected ? 'Competitor ad library connected' : src.upspring?.reason || 'Not connected'} />
            <Status ok={(src.corpus?.used || 0) > 0} label={`${src.corpus?.used || 0} past briefs`} title="Briefs Medium learns the house style from" />
            <Status ok={src.worker?.alive} label="Writer" title={src.worker?.alive ? 'The background writer is running' : 'The background writer is not responding'} />
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3" role="tablist">
        {PARTS.map(([k, emoji, label]) => (
          <button key={k} type="button" role="tab" aria-selected={p === k} className={`md-action compact ${p === k ? 'on' : ''}`} onClick={() => setPart(k)}>
            <span className="md-emoji" aria-hidden>{emoji}</span><span className="md-action-title">{label}</span>
          </button>
        ))}
      </div>

      {p === 'thinks' && (
        <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-start">
          <div className="trk-glass rounded-3xl p-6">
            <h3 className="md-h2">What Medium believes right now</h3>
            <p className="md-sub mt-1">Every belief says what would change its mind. Tests move them from hunch to proven — or retire them.</p>
            <div className="mt-4 space-y-4">
              {(overview?.beliefs || []).map(x => { const [l, t] = BELIEF[x.status] || BELIEF.assumption; return (
                <div key={x.id}>
                  <div className="text-[15px] leading-snug"><span className={`trk-chip ${t} mr-2 align-middle`}>{l}</span>{x.claim}</div>
                  {x.change_condition && <div className="text-[13px] trk-dim mt-1">Would change its mind if: {x.change_condition}</div>}
                </div>
              ); })}
              {!(overview?.beliefs || []).length && <div className="md-sub">No beliefs yet.</div>}
            </div>
          </div>
          <div className="space-y-5">
            <div className="trk-glass rounded-3xl p-6">
              <h3 className="md-h2">How customers talk</h3>
              <p className="md-sub mt-1">Phrases Medium borrows for hooks and supers.</p>
              {(overview?.language_bank || []).length
                ? <div className="mt-3 flex flex-wrap gap-2">{overview.language_bank.slice(0, 12).map((q, i) => <span key={i} className="trk-chip gray !text-[13px] !py-1.5">“{q}”</span>)}</div>
                : <div className="mt-3 md-sub">Empty for now — it fills from real ad comments once Upspring is connected.</div>}
              {overview?.language && [['Objections', 'objections'], ['What moves them', 'motivators'], ['What they ask', 'questions']].map(([label, k]) => (overview.language[k] || []).length > 0 && (
                <div key={k} className="mt-4"><div className="md-doc-label">{label}</div><ul className="space-y-1 text-[14px]">{overview.language[k].slice(0, 6).map((x, i) => <li key={i}>• {x.text}{x.product ? <span className="trk-dim"> · {x.product}</span> : null}</li>)}</ul></div>
              ))}
              {overview?.language && <p className="mt-3 text-[12px] trk-dim">From {overview.language.comments_read} comments on {overview.language.ads_read} of Particle’s ads (Upspring) — no names kept. Refreshed every Sunday.</p>}
            </div>
            {overview?.mix?.current && (
              <div className="trk-glass rounded-3xl p-6">
                <h3 className="md-h2">Autopilot’s weekly mix</h3>
                <p className="md-sub mt-1">How many briefs each lane gets every Sunday. It shifts toward what wins in tests — one slot at a time.</p>
                <div className="mt-3 grid gap-y-1.5 text-[14px]">
                  {Object.entries(overview.mix.current).map(([lane, m]) => (
                    <div key={lane} className="flex justify-between gap-3"><span>{lane === 'transfers' ? 'Transfers' : LANE_LABEL[lane] || lane}</span><span className="trk-muted tabular-nums">🎬 {Number(m?.video) || 0} · 🎨 {Number(m?.static) || 0}</span></div>
                  ))}
                </div>
                {(overview.mix.history || []).length > 0 && (
                  <div className="mt-4 space-y-1.5 text-[13.5px]">
                    <div className="font-semibold">Recent changes</div>
                    {overview.mix.history.slice(-4).reverse().flatMap(h => (h.changes || []).map((c, i) => <div key={`${h.at}${i}`}>• {c.why} <span className="trk-dim">— {new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div>))}
                  </div>
                )}
              </div>
            )}
            <div className="trk-glass rounded-3xl p-6">
              <h3 className="md-h2">Brands it borrows structure from</h3>
              <div className="mt-3 space-y-2 text-[14px]">{(overview?.donors || []).map(d => <div key={d.brand}><b>{d.brand}</b> <span className="trk-muted">— {d.takes}</span></div>)}</div>
            </div>
          </div>
        </div>
      )}
      {p === 'tests' && <Lab overview={overview} notify={notify} onOpen={onOpen} />}
      {p === 'sources' && <Sources overview={overview} notify={notify} isAdmin={isAdmin} reload={reload} />}
    </div>
  );
}
