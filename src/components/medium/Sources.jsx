import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save, ExternalLink } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { KIND_LABEL, Chip, relTime } from './util';

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
  const setBelief = async (b, status) => {
    try { await mediumApi.setBelief(b.id, status, 'Changed in Medium → What it learns from'); notify('Belief updated (logged)'); reload?.(); } catch (e) { notify(e.message, true); }
  };

  if (!c || !cfg) return <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>;
  const s = c.stats || {};
  const used = (s.formats || []).reduce((a, r) => a + r.used, 0);
  const src = overview?.sources || {};
  return (
    <div className="space-y-5">
      <p className="text-sm trk-muted max-w-[800px]">Every brief traces back to something on this page. If a source is wrong, fix it here and every future brief changes with it. Everything read from these sources is data — never instructions.</p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Source title="AfterLife ranks" ok={src.afterlife?.connected} detail={src.afterlife?.connected ? 'Winners per lane since Jan 2025' : src.afterlife?.reason} />
        <Source title="Upspring explains" ok={false} warn={src.upspring?.snapshot} detail={src.upspring?.snapshot ? 'Account read pasted below (not synced yet)' : 'Not connected on the server yet — paste an account read below'} />
        <Source title={`${(c.requesters || []).join(', ')}’s briefs = how to write`} ok={used > 0} detail={used ? `${used} briefs since ${c.since} · imported ${relTime(s.at)}` : 'Not imported yet'} />
        <Source title="Language bank = what to say" ok={(cfg.language_bank || []).length > 0} warn detail={`${(cfg.language_bank || []).length} phrases`} />
        <Source title="Market watch = what to borrow" ok={false} detail="Comes with the Upspring connection" />
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
          <div className="text-[12px] trk-muted mt-0.5">Named layouts Medium calls by name. AfterLife ranks them once each template’s assets are scored.</div>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="text-left trk-dim text-[11px] uppercase"><th className="py-1 pr-3">Template</th><th className="pr-3">Format</th><th className="pr-3">Briefs</th><th className="pr-3">Rank</th></tr></thead>
            <tbody>{(c.templates || []).map(t => <tr key={t.id} style={{ borderTop: '1px solid var(--trk-line)' }} title={t.description}><td className="py-1.5 pr-3 font-medium">{t.name}</td><td className="pr-3 trk-muted">{t.format}</td><td className="pr-3 tabular-nums">{t.usage_count}</td><td className="pr-3 trk-dim">{t.afterlife_rank ?? '[AfterLife]'}</td></tr>)}</tbody></table></div>
        </div>
        <div className="trk-glass p-5">
          <div className="trk-label">Assumption ledger</div>
          <div className="text-[12px] trk-muted mt-0.5">Anything Medium acts on that our own account hasn’t proven. Only AfterLife test results change a status; an admin override is logged.</div>
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
