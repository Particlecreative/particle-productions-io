import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save, ExternalLink } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { KIND_LABEL, Chip, relTime, money } from './util';
import BrandSites from './BrandSites';

const BELIEF = { proven: ['Proven', 'green'], testing: ['Testing', 'amber'], assumption: ['Assumption', 'gray'], retired: ['Retired', 'gray'] };

/** Medium's brain, out in the open: every brief traces back to something on this page. */
export default function Sources({ overview, notify, isAdmin, reload }) {
  const [c, setC] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState(null);

  const load = useCallback(async () => {
    try {
      const [corpus, conf] = await Promise.all([mediumApi.corpus(), mediumApi.config()]);
      setC(corpus); setCfg(conf.config);
      setDraft({ style_guide: conf.config.style_guide || '', upspring_snapshot: conf.config.upspring_snapshot || '', language_bank: (conf.config.language_bank || []).join('\n') });
    } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const mix = useMemo(() => {
    const m = {};
    for (const r of c?.stats?.mix || []) (m[r.kind] ||= { kind: r.kind, video: 0, design: 0 })[r.format] = r.n;
    const rows = Object.values(m).sort((a, b) => (b.video + b.design) - (a.video + a.design));
    return { rows, max: Math.max(1, ...rows.map(r => r.video + r.design)) };
  }, [c]);

  const ingest = async () => {
    setBusy('ingest');
    try { const r = await mediumApi.ingest(); notify(r.queued ? 'Reading the corpus from Monday — a few minutes' : 'Already running'); setTimeout(load, 3000); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try {
      await mediumApi.saveConfig({ style_guide: draft.style_guide, upspring_snapshot: draft.upspring_snapshot, language_bank: draft.language_bank.split('\n').map(s => s.trim()).filter(Boolean) });
      notify('Saved — used from the next brief'); load(); reload?.();
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const toggleSwitch = async (patch, msg) => {
    setBusy('sw');
    try { await mediumApi.saveConfig(patch); notify(msg); await load(); reload?.(); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const runNow = async () => {
    const n = cfg.autopilot?.mode === 'lanes' ? (cfg.autopilot?.per_week ?? 12) : (Number(cfg.autopilot?.video ?? 20) + Number(cfg.autopilot?.design ?? 20));
    if (!window.confirm(`Run the autopilot now? Medium writes ${n} briefs for Particle’s top products by spend (about ${money(n * 0.15)}). They arrive over the next hour or two.`)) return;
    setBusy('ap');
    try { const r = await mediumApi.runAutopilot(); notify(r.skipped ? r.skipped : `${r.queued} briefs queued — they appear in the Strategy Room`); reload?.(); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const [ups, setUps] = useState(null);
  const [linkDraft, setLinkDraft] = useState(null);
  useEffect(() => { mediumApi.upspring().then(setUps).catch(() => setUps(null)); }, []);
  const connectUps = async () => {
    setBusy('ups');
    try { const r = await mediumApi.upspringConnect(); window.location.href = r.url; } catch (e) { notify(e.message, true); setBusy(null); }
  };
  const disconnectUps = async () => {
    if (!window.confirm('Disconnect Upspring? Medium stops ranking winners until it’s connected again.')) return;
    try { await mediumApi.upspringDisconnect(); setUps(await mediumApi.upspring()); notify('Upspring disconnected'); reload?.(); } catch (e) { notify(e.message, true); }
  };
  const refreshUps = async () => {
    try { const r = await mediumApi.upspringRefresh(); notify(r.already_queued ? 'Already refreshing' : 'Refreshing the rankings — about a minute'); setTimeout(async () => setUps(await mediumApi.upspring()), 60000); } catch (e) { notify(e.message, true); }
  };
  const syncRead = async () => {
    try { const r = await mediumApi.upspringSyncRead(); notify(r.already_queued ? 'Already syncing' : 'Syncing the account read and the language bank — a few minutes'); } catch (e) { notify(e.message, true); }
  };
  const saveLink = async () => {
    try { await mediumApi.saveConfig({ upspring_link: linkDraft }); notify('Saved — winning ads now link to Upspring'); setLinkDraft(null); load(); } catch (e) { notify(e.message, true); }
  };
  const setBelief = async (b, status) => {
    try { await mediumApi.setBelief(b.id, status, 'Changed in Medium → What it learns from'); notify('Belief updated (logged)'); reload?.(); } catch (e) { notify(e.message, true); }
  };

  if (!c || !cfg) return <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>;
  const s = c.stats || {};
  const used = (s.formats || []).reduce((a, r) => a + r.used, 0);
  const src = overview?.sources || {};
  const acc = ups?.account || {}, rk = ups?.ranks || {};
  return (
    <div className="space-y-5">
      <div className="trk-glass rounded-3xl p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="md-h2">🏆 Upspring — what won</h3>
            <p className="md-sub mt-1 max-w-[640px]">Medium ranks Particle’s own Meta ads from Upspring (spend, ROAS, the ad itself) — that’s where every “winner” in Medium comes from: the evidence in each brief, the autopilot and Headline → Hook.</p>
            <p className="mt-3 text-[14px]">{acc.connected ? <>✅ Connected{acc.connected_by ? ` by ${acc.connected_by}` : ''}{acc.connected_at ? ` on ${new Date(acc.connected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}{rk.as_of ? ` · ${rk.creatives} ads ranked, ${rk.winners} winners · updated ${relTime(rk.as_of)}` : ' · ranking for the first time…'}</> : <>⚪ Not connected yet{acc.last_error ? ` — ${acc.last_error}` : ''}</>}</p>
            {rk.error && acc.connected && <p className="mt-1 text-[13px]" style={{ color: 'var(--trk-red)' }}>Last refresh failed: {rk.error}</p>}
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`trk-btn ${acc.connected ? '' : 'primary'}`} disabled={busy === 'ups'} onClick={connectUps}>{busy === 'ups' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />} {acc.connected ? 'Reconnect' : 'Connect Upspring'}</button>
              {acc.connected && <button type="button" className="trk-btn" onClick={refreshUps}><RefreshCw size={13} /> Refresh now</button>}
              {acc.connected && <button type="button" className="trk-btn" onClick={syncRead} title="Re-read the account profile, creative patterns and ad comments (about 10–15¢)"><RefreshCw size={13} /> Sync account read</button>}
              {acc.connected && <button type="button" className="trk-btn" onClick={disconnectUps}>Disconnect</button>}
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="mt-4 grid gap-1 max-w-[720px]">
            <span className="md-doc-label">Link to an ad in Upspring</span>
            <div className="flex gap-2"><input className="trk-input" value={linkDraft ?? cfg.upspring_link ?? ''} onChange={(e) => setLinkDraft(e.target.value)} placeholder="Paste one ad’s link from the Upspring app, with {id} where its id goes" />{linkDraft != null && <button type="button" className="trk-btn primary" onClick={saveLink}><Save size={13} /> Save</button>}</div>
            <span className="text-[12px] trk-dim">Used by “Open in Upspring” on winning ads. Example: https://…upspring.ai/…/{'{id}'}</span>
          </div>
        )}
      </div>
      <BrandSites isAdmin={isAdmin} notify={notify} />
      <p className="text-sm trk-muted max-w-[800px]">Every brief traces back to something on this page. If a source is wrong, fix it here and every future brief changes with it. Everything read from these sources is data — never instructions.</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Source title="Upspring ranks" ok={src.upspring_account?.connected} detail={src.upspring_account?.connected ? `Particle’s own ads ranked on ROAS per lane (last 90 days)${src.upspring_account?.ranks?.creatives ? ` · ${src.upspring_account.ranks.creatives} ads` : ''}` : 'Connect Upspring above'} />
        <Source title="Upspring explains" ok={!!overview?.language?.at && !!src.upspring?.snapshot} warn={!!src.upspring_account?.connected || !!src.upspring?.snapshot}
          detail={overview?.language?.at && src.upspring?.snapshot ? `Synced from Particle’s Upspring account ${relTime(src.upspring_account.account_read_at)} — refreshed every Sunday` : src.upspring_account?.connected ? 'Syncing from Upspring for the first time — a few minutes' : src.upspring?.snapshot ? 'Pasted by hand — connect Upspring above to sync it' : 'Connect Upspring above'} />
        <Source title={`${(c.requesters || []).join(', ')}’s briefs = how to write`} ok={used > 0} detail={used ? `${used} briefs since ${c.since} · imported ${relTime(s.at)}` : 'Not imported yet'} />
        <Source title="Language bank = what to say" ok={(cfg.language_bank || []).length > 0} warn={!overview?.language}
          detail={overview?.language ? `${(cfg.language_bank || []).length} phrases from ${overview.language.comments_read} real comments on ${overview.language.ads_read} ads · ${relTime(overview.language.at)}` : `${(cfg.language_bank || []).length} phrases (typed by hand — syncs from ad comments once Upspring is connected)`} />
        <Source title="Market watch = what to borrow" ok={!!overview?.market} warn={!!src.upspring?.connected}
          detail={overview?.market ? <a className="underline-offset-2 hover:underline" href="/medium?tab=market">{overview.market.brands} brands · {overview.market.new_ads} new ads · read {relTime(overview.market.run_at)} — open Market Watch</a> : src.upspring?.connected ? 'The first market read is on its way' : 'Needs the Upspring key on the server'} />
        <Source title="Brand rules = what to obey" ok detail={<a className="underline-offset-2 hover:underline" href="/captain?tab=brain">Captain Caption’s Brain — the same rules check every brief <ExternalLink size={11} className="inline" /></a>} />
      </div>

      <div className="trk-glass p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="trk-label">Writing style — learned from {used || 0} briefs</div>
          <span className="text-[12px] trk-muted">{s.first ? `${new Date(s.first).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(s.latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{s.ai_written ? ` · ${s.ai_written} already AI-assisted` : ''}</span>
          {isAdmin && <button type="button" className="trk-btn !py-1.5 ml-auto" disabled={busy === 'ingest'} onClick={ingest}>{busy === 'ingest' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Re-read from Monday</button>}
        </div>
        {c.ingest && <div className="text-[12px] trk-dim mt-1">Last import: {c.ingest.status}{c.ingest.finished_at ? ` ${relTime(c.ingest.finished_at)}` : ''}{c.ingest.result ? ` · ${c.ingest.result.video} video, ${c.ingest.result.design} design, ${c.ingest.result.excluded} set aside` : ''}{c.ingest.last_error ? ` · ${c.ingest.last_error}` : ''}</div>}
        <div className="mt-4 space-y-2">
          <div className="flex gap-4 text-[12px] trk-muted"><span className="flex items-center gap-1.5"><span className="cc-dot" style={{ background: 'var(--trk-violet)' }} /> Video</span><span className="flex items-center gap-1.5"><span className="cc-dot" style={{ background: 'var(--trk-muted)' }} /> Design</span></div>
          {mix.rows.map(r => (
            <div key={r.kind} className="grid grid-cols-[minmax(130px,170px)_minmax(0,1fr)_90px] items-center gap-3 text-[13px]">
              <span>{KIND_LABEL[r.kind] || r.kind}</span>
              <div className="flex h-[10px] gap-[2px]" role="img" aria-label={`${KIND_LABEL[r.kind]}: ${r.video} video, ${r.design} design`}>
                {r.video > 0 && <div style={{ width: `${(100 * r.video) / mix.max}%`, background: 'var(--trk-violet)', borderRadius: '4px 0 0 4px' }} />}
                {r.design > 0 && <div style={{ width: `${(100 * r.design) / mix.max}%`, background: 'var(--trk-muted)', opacity: 0.6, borderRadius: r.video ? '0 4px 4px 0' : 4 }} />}
              </div>
              <span className="text-right tabular-nums trk-muted">{r.video} / {r.design}</span>
            </div>
          ))}
        </div>
        {(s.excluded || []).length > 0 && <div className="mt-3 text-[12.5px] trk-muted">Set aside: {s.excluded.map(x => `${x.reason} (${x.n})`).join(' · ')}</div>}
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <div className="trk-glass p-5">
          <div className="trk-label">Template library</div>
          <div className="text-[12px] trk-muted mt-0.5">Named layouts Medium calls by name.</div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left trk-dim text-[11px] uppercase"><th className="py-1 pr-3">Template</th><th className="pr-3">Format</th><th className="pr-3">Briefs</th><th className="pr-3">Rank</th></tr></thead>
            <tbody>{(c.templates || []).map(t => <tr key={t.id} style={{ borderTop: '1px solid var(--trk-line)' }} title={t.description}><td className="py-1.5 pr-3 font-medium">{t.name}</td><td className="pr-3 trk-muted">{t.format}</td><td className="pr-3 tabular-nums">{t.usage_count}</td><td className="pr-3 trk-dim">{t.afterlife_rank ?? '[AfterLife]'}</td></tr>)}</tbody></table></div>
        </div>
        <div className="trk-glass p-5">
          <div className="trk-label">Assumption ledger</div>
          <div className="text-[12px] trk-muted mt-0.5">Anything Medium acts on that our own account hasn’t proven. Only test results change a status; an admin override is logged.</div>
          <div className="mt-3 space-y-3">
            {(overview?.beliefs || []).map(b => { const [l, t] = BELIEF[b.status] || BELIEF.assumption; return (
              <div key={b.id} className="text-[13.5px]" style={{ borderTop: '1px solid var(--trk-line)', paddingTop: 10 }}>
                <div className="flex items-start gap-2"><Chip tone={t}>{l}</Chip><span className="flex-1">{b.claim}</span>
                  {isAdmin && <select className="trk-input !w-auto !py-1 !text-[12px]" value={b.status} onChange={(e) => setBelief(b, e.target.value)} aria-label="Status">{Object.keys(BELIEF).map(k => <option key={k} value={k}>{BELIEF[k][0]}</option>)}</select>}</div>
                <div className="text-[12px] trk-dim mt-1">Because: {b.because} · Would change its mind: {b.change_condition}</div>
              </div>
            ); })}
          </div>
        </div>
      </div>

      <div className="trk-glass p-5 grid gap-4">
        <div className="trk-label">Switches</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--trk-glass-hi)' }}>
            <label className="flex items-center gap-2 font-semibold text-[14px]">
              <input type="checkbox" checked={!!cfg.monday_submit} disabled={!isAdmin || busy === 'sw'} onChange={(e) => toggleSwitch({ monday_submit: e.target.checked }, e.target.checked ? 'Approved briefs will now be created on Monday' : 'Back to shadow mode — nothing is created on Monday')} />
              Create approved briefs on Monday
            </label>
            <p className="mt-1 text-[12.5px] trk-muted">Off = shadow mode. On: every approval creates the ticket in “Form Requests” with CP’s token — lane in the task name, Product in “Product (old)” — plus one evidence update, and Captain Caption locks the approved text to it. Nothing reaches Monday without an approve click.</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--trk-glass-hi)' }}>
            <label className="flex items-center gap-2 font-semibold text-[14px]">
              <input type="checkbox" checked={!!cfg.autopilot?.enabled} disabled={!isAdmin || busy === 'sw'} onChange={(e) => toggleSwitch({ autopilot: { ...cfg.autopilot, enabled: e.target.checked } }, e.target.checked ? 'Autopilot on — every Sunday 07:00' : 'Autopilot off')} />
              Weekly autopilot
            </label>
            <p className="mt-1 text-[12.5px] trk-muted">Every Sunday 07:00 (Israel): <b>{cfg.autopilot?.video ?? 20} videos + {cfg.autopilot?.design ?? 20} statics</b> for Particle direct only (no SFY, GT or WAC), spread across the top products by spend over the last 30 days (Upspring) — up to {cfg.autopilot?.max_per_product ?? 4} per product, each built on that product’s best ads. About {money((Number(cfg.autopilot?.video ?? 20) + Number(cfg.autopilot?.design ?? 20)) * 0.15)} a week.</p>
            {isAdmin && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                <label className="flex items-center gap-1.5">Videos <input type="number" min="0" max="40" className="trk-input !py-1 !w-[70px]" defaultValue={cfg.autopilot?.video ?? 20} onBlur={(e) => Number(e.target.value) !== Number(cfg.autopilot?.video ?? 20) && toggleSwitch({ autopilot: { ...cfg.autopilot, video: Math.min(40, Math.max(0, Number(e.target.value) || 0)) } }, 'Saved — from next Sunday')} /></label>
                <label className="flex items-center gap-1.5">Statics <input type="number" min="0" max="40" className="trk-input !py-1 !w-[70px]" defaultValue={cfg.autopilot?.design ?? 20} onBlur={(e) => Number(e.target.value) !== Number(cfg.autopilot?.design ?? 20) && toggleSwitch({ autopilot: { ...cfg.autopilot, design: Math.min(40, Math.max(0, Number(e.target.value) || 0)) } }, 'Saved — from next Sunday')} /></label>
              </div>
            )}
            {isAdmin && <button type="button" className="trk-btn !py-1.5 mt-2" disabled={busy === 'ap'} onClick={runNow}>{busy === 'ap' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Run it now</button>}
          </div>
        </div>
      </div>

      <div className="trk-glass p-5 grid gap-4">
        <div className="trk-label">What Medium reads on every brief</div>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">The full house style guide <span className="trk-dim font-normal">({draft.style_guide.length.toLocaleString()} characters · empty = the built-in summary)</span></span>
          <textarea className="trk-input font-mono !text-[12.5px]" rows={8} value={draft.style_guide} onChange={(e) => setDraft({ ...draft, style_guide: e.target.value })} disabled={!isAdmin} placeholder="Paste the house style guide here — it wins over the built-in summary." />
        </label>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">Upspring account read <span className="trk-dim font-normal">(winning / losing / fatigued / underused angles — until Upspring syncs by itself)</span></span>
          <textarea className="trk-input font-mono !text-[12.5px]" rows={5} value={draft.upspring_snapshot} onChange={(e) => setDraft({ ...draft, upspring_snapshot: e.target.value })} disabled={!isAdmin} />
        </label>
        <label className="grid gap-1"><span className="text-[13px] font-semibold">Customer language bank <span className="trk-dim font-normal">(one phrase per line, verbatim, no names — every brief uses at least one)</span></span>
          <textarea className="trk-input !text-[13px]" rows={5} value={draft.language_bank} onChange={(e) => setDraft({ ...draft, language_bank: e.target.value })} disabled={!isAdmin} />
        </label>
        {isAdmin && <button type="button" className="trk-btn primary justify-self-start" disabled={busy === 'save'} onClick={save}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>}
      </div>
    </div>
  );
}

function Source({ title, ok, warn, detail }) {
  return (
    <div className="trk-glass p-4">
      <div className="flex items-center gap-2 font-semibold text-[14px]"><span className="cc-dot" style={{ background: ok ? 'var(--trk-green)' : warn ? 'var(--trk-amber)' : 'var(--trk-red)' }} aria-hidden />{title}</div>
      <div className="mt-1 text-[12.5px] trk-muted">{detail}</div>
    </div>
  );
}
