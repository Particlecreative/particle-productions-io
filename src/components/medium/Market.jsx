import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ExternalLink, Plus, X, Sparkles } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { niceDate, relTime } from './util';

export const PREFILL_KEY = 'md_prefill';
const DIM_LABEL = { hook_archetype: 'How winning ads open', persona: 'Who winning ads talk to' };

/** Market Watch — what men's-grooming brands and listicle / advertorial pages ran lately, and what's worth briefing. */
export default function Market({ notify, isAdmin, go }) {
  const [data, setData] = useState(null);
  const [part, setPart] = useState('brands');
  const [brand, setBrand] = useState('');
  const [view, setView] = useState('new');
  const [busy, setBusy] = useState(null);
  const [domain, setDomain] = useState('');

  const load = useCallback(async () => { try { setData(await mediumApi.market()); } catch (e) { notify(e.message, true); } }, [notify]);
  useEffect(() => { load(); }, [load]);

  const run = data?.run;
  const ads = useMemo(() => (run?.ads || []).filter(a => (!brand || a.brand_id === brand) && (view === 'new' ? a.new : a.backed || a.best))
    .sort((x, y) => (view === 'new' ? (x.days ?? 99) - (y.days ?? 99) : (Number(y.strength?.impressions) || 0) - (Number(x.strength?.impressions) || 0) || (y.days || 0) - (x.days || 0))), [run, brand, view]);
  const b = (run?.brands || []).find(x => x.id === brand);

  const briefFrom = (prefill) => {
    try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill)); } catch { /* private mode: the form just opens empty */ }
    go('create', 'idea');
  };
  const briefAd = (a) => briefFrom({ idea: `Take what’s working in this ${a.brand} ad — ${a.hook ? `it opens with “${a.hook}”` : a.one_line || 'see the reference'} — and make it Particle’s own: same structure, our product, our proof.`, references: [`upspring-ad:${a.id}`] });
  const briefPage = (p) => briefFrom({ idea: `A ${String(p.type || 'listicle').toLowerCase()} page like ${p.brand}’s “${p.title || p.display_url}” — for one of our lanes (SFY, GT or WAC): the same page logic, with our products and our proof.`, references: [p.url].filter(Boolean) });

  const refresh = async () => {
    setBusy('refresh');
    try { const r = await mediumApi.marketRefresh(); notify(r.already_queued ? 'Already refreshing — give it a minute or two' : 'Refreshing — about a minute'); setTimeout(load, 70000); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const watch = async (e) => {
    e.preventDefault();
    setBusy('watch');
    try { const r = await mediumApi.marketWatch(domain); notify(`Watching ${r.name} — their ads show up after the next refresh`); setDomain(''); load(); } catch (err) { notify(err.message, true); } finally { setBusy(null); }
  };
  const unwatch = async (id, name) => {
    try { await mediumApi.marketUnwatch(id); notify(`Stopped watching ${name}`); if (brand === id) setBrand(''); load(); } catch (e) { notify(e.message, true); }
  };

  if (!data) return <div className="py-16 text-center trk-muted"><Loader2 className="inline animate-spin" size={18} /></div>;
  if (!data.connected) return <Empty emoji="🔌" title="Upspring isn’t connected yet" line={data.reason || 'Once the Upspring key is on the server, Market Watch fills in on its own.'} />;
  if (!run) return <Empty emoji="🌍" title="The first market read is on its way" line="Medium reads Upspring a few minutes after it’s connected, then every Sunday at 06:00." action={isAdmin && <button type="button" className="trk-btn mt-4" disabled={busy === 'refresh'} onClick={refresh}><RefreshCw size={13} /> Read it now</button>} />;

  const pages = (run.pages || []);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <h2 className="md-h2">What the market ran lately</h2>
          <p className="md-sub mt-1">From Upspring’s ad library — men’s grooming brands and the listicle and advertorial pages in the category. Updated {niceDate(String(run.run_at).slice(0, 10))} ({relTime(run.run_at)}).</p>
        </div>
        {isAdmin && <button type="button" className="trk-btn ml-auto" disabled={busy === 'refresh'} onClick={refresh}>{busy === 'refresh' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh</button>}
      </div>

      {run.summary?.bullets?.length > 0 && (
        <div className="trk-glass rounded-3xl p-6">
          <div className="font-semibold text-[15.5px]">🗞️ This week in the market</div>
          <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">{run.summary.bullets.map((x, i) => <li key={i} className="flex gap-2"><span className="trk-dim">•</span><span>{x}</span></li>)}</ul>
          {run.summary.try_this && (
            <div className="mt-4 rounded-2xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--trk-glass-hi)' }}>
              <span className="text-[15px] flex-1 min-w-[240px]">💡 <b>Try this:</b> {run.summary.try_this}</span>
              <button type="button" className="trk-btn primary" onClick={() => briefFrom({ idea: run.summary.try_this, references: [] })}><Sparkles size={13} /> Brief this</button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2" role="tablist">
        {[['brands', '🧴', 'Particle vs DTC grooming brands'], ['pages', '📰', 'Our lanes vs listicles & advertorials']].map(([k, e, l]) => (
          <button key={k} type="button" role="tab" aria-selected={part === k} className={`md-action compact ${part === k ? 'on' : ''}`} onClick={() => setPart(k)}><span className="md-emoji" aria-hidden>{e}</span><span className="md-action-title">{l}</span></button>
        ))}
      </div>

      {part === 'brands' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={`trk-btn !py-1.5 ${!brand ? 'primary' : ''}`} onClick={() => setBrand('')}>All brands</button>
            {(run.brands || []).map(x => (
              <span key={x.id} className="inline-flex items-center">
                <button type="button" className={`trk-btn !py-1.5 ${brand === x.id ? 'primary' : ''}`} onClick={() => setBrand(brand === x.id ? '' : x.id)}>{x.name}{x.new_count ? <span className="md-count !h-[18px] !min-w-[18px] !text-[10.5px] ml-1">{x.new_count}</span> : null}</button>
                {isAdmin && <button type="button" className="trk-dim hover:text-[var(--trk-red)] -ml-1 p-1" aria-label={`Stop watching ${x.name}`} title="Stop watching" onClick={() => unwatch(x.id, x.name)}><X size={12} /></button>}
              </span>
            ))}
            {isAdmin && (
              <form className="inline-flex gap-1.5 ml-auto" onSubmit={watch}>
                <input className="trk-input !py-1.5 !w-[180px]" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Watch a brand: website" aria-label="Brand website to watch" />
                <button type="submit" className="trk-btn !py-1.5" disabled={busy === 'watch' || !domain.trim()} aria-label="Watch">{busy === 'watch' ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}</button>
              </form>
            )}
          </div>

          {b && (
            <div className="trk-glass rounded-3xl p-5 text-[14px]">
              <div className="font-semibold text-[15.5px]">{b.name}</div>
              {b.one_line && <p className="mt-1 trk-muted">{b.one_line}</p>}
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {b.hook_themes?.length > 0 && <div><div className="md-doc-label">What their ads lean on</div>{b.hook_themes.map(h => <div key={h.name} className="capitalize">{String(h.name).toLowerCase()}</div>)}</div>}
                {b.lp_types?.length > 0 && <div><div className="md-doc-label">Where they send people</div>{b.lp_types.map(t => <div key={t}>{t}</div>)}</div>}
              </div>
            </div>
          )}

          <div className="trk-seg">
            <button type="button" className={view === 'new' ? 'on' : ''} onClick={() => setView('new')}>New lately</button>
            <button type="button" className={view === 'backed' ? 'on' : ''} onClick={() => setView('backed')}>What they keep backing</button>
          </div>

          {ads.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {ads.slice(0, 24).map(a => (
                <div key={`${a.brand_id}-${a.id}`} className="md-brief !p-0 overflow-hidden">
                  <div className={`${a.image ? 'aspect-[4/5] max-h-[260px]' : 'h-[84px]'} w-full flex items-center justify-center text-3xl`} style={{ background: 'var(--trk-glass-hi)' }}>
                    {a.image ? <img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <span aria-hidden>{a.media_type === 'video' ? '🎬' : '🖼️'}</span>}
                  </div>
                  <div className="p-4 pt-1 flex flex-col gap-2 flex-1">
                    <div className="md-brief-top"><b style={{ color: 'var(--trk-text)' }}>{a.brand}</b><span>· {a.media_type === 'video' ? 'Video' : 'Static'}</span>
                      <span className="ml-auto text-[12px]">{a.new ? <span className="md-ready green">New</span> : a.days != null ? `${a.days} days running` : ''}</span></div>
                    <div className="text-[14.5px] leading-snug" style={{ color: 'var(--trk-text)' }}>{a.hook ? `“${a.hook}”` : a.one_line}</div>
                    {a.hook && a.one_line && <div className="md-brief-why">{a.one_line}</div>}
                    {a.backed && <div className="text-[12px] trk-dim">💪 They’re putting real spend behind it</div>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <button type="button" className="trk-btn primary !py-1 !text-[12.5px]" onClick={() => briefAd(a)}><Sparkles size={12} /> Brief from this</button>
                      {a.ad_library_url && <a className="trk-btn !py-1 !text-[12.5px]" href={a.ad_library_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> See the ad</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty emoji="🔭" title={view === 'new' ? 'Nothing new in the last two weeks' : 'Nothing heavily backed right now'} line={view === 'new' ? 'Switch to “What they keep backing” to see their long-running ads.' : 'Try another brand.'} small />}
        </div>
      )}

      {part === 'pages' && (
        <div className="space-y-4">
          <p className="md-sub">Listicle and advertorial pages that men’s grooming brands send ads to — the pages SFY, GT and WAC compete with. Sorted by how many ads point at them.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...pages].sort((x, y) => (y.ads || 0) - (x.ads || 0)).map(p => (
              <div key={p.id || p.url} className="md-brief !p-0 overflow-hidden">
                <div className={`${p.shot ? 'h-[180px] items-start' : 'h-[84px] items-center'} w-full overflow-hidden flex justify-center`} style={{ background: 'var(--trk-glass-hi)' }}>
                  {p.shot ? <img src={p.shot} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full object-cover object-top" /> : <span className="text-3xl" aria-hidden>📰</span>}
                </div>
                <div className="p-4 pt-1 flex flex-col gap-2 flex-1">
                  <div className="md-brief-top"><b style={{ color: 'var(--trk-text)' }}>{p.brand}</b><span>· {p.type}</span>{p.ours && <span className="md-ready gray ml-auto">Ours</span>}</div>
                  <div className="text-[14.5px] leading-snug line-clamp-3" style={{ color: 'var(--trk-text)' }}>{p.title || p.display_url}</div>
                  <div className="text-[12.5px] trk-dim">{p.ads} active ad{p.ads === 1 ? '' : 's'} point here{p.share != null ? ` · ${p.share}% of their ads` : ''}</div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {!p.ours && <button type="button" className="trk-btn primary !py-1 !text-[12.5px]" onClick={() => briefPage(p)}><Sparkles size={12} /> Brief one like this</button>}
                    {p.url && <a className="trk-btn !py-1 !text-[12.5px]" href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Open the page</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(run.norms || {}).some(k => (run.norms[k] || []).length) && (
        <details className="md-more">
          <summary>🏆 What winning ads in the category do differently <span className="md-more-hint">Medium uses this when it writes</span></summary>
          <div className="pb-4 grid md:grid-cols-2 gap-5 text-[14px]">
            {Object.entries(run.norms).map(([dim, rows]) => (
              <div key={dim}>
                <div className="md-doc-label">{DIM_LABEL[dim] || dim}</div>
                {rows.filter(r => Math.abs(r.lift) >= 0.8).slice(0, 6).map(r => (
                  <div key={r.id} className="flex justify-between gap-3 py-0.5"><span>{r.label}</span><span className="tabular-nums" style={{ color: r.lift > 0 ? 'var(--trk-green)' : 'var(--trk-red)' }}>{r.lift > 0 ? 'more' : 'less'} · {r.winners}% vs {r.all}%</span></div>
                ))}
              </div>
            ))}
            <p className="md:col-span-2 text-[12.5px] trk-dim">“Winning” here means ads the brands keep putting heavy spend behind (Upspring’s delivery signal, 4–5 of 5) — not their sales.</p>
          </div>
        </details>
      )}
    </div>
  );
}

function Empty({ emoji, title, line, action, small }) {
  return (
    <div className={`trk-glass rounded-3xl md-empty ${small ? '!py-8' : ''}`}>
      <div className="md-emoji" aria-hidden>{emoji}</div>
      <div className="mt-3 text-[17px] font-semibold">{title}</div>
      <div className="mt-1 md-sub">{line}</div>
      {action}
    </div>
  );
}
