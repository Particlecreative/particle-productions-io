import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X, CalendarDays, Wand2, ShieldCheck, CheckCheck, Copy } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { STATUS, Chip, money } from './util';

const STATIC_T = ['Hero', 'Extra / Stock-Up', 'Receipt Vertical', 'Price Drop', 'Her Note', 'Gift Search Bar'];
const VIDEO_T = ['Three Quick Reasons', 'Her Shopping Trip', 'Static → Motion'];
const LANES = ['Particle', 'SFY', 'GT', 'WAC'];

/** Holiday sales are mass production: one setup → the whole ticket matrix, in house style (spec §17). */
export default function Holiday({ overview, notify, onOpen }) {
  const products = overview?.options?.products || [];
  const next = (overview?.holidays || []).find(h => h.days_to_brief_by >= 0) || overview?.holidays?.[0];
  const [s, setS] = useState(() => ({
    holiday: next?.name?.replace(/\s\d{4}$/, '') || 'Christmas', starts: '', ends: next?.date || '', lanes: ['Particle'],
    tiers: [{ tier: 25, code: '' }, { tier: 30, code: '' }], products: [], static_templates: ['Hero', 'Extra / Stock-Up'], video_templates: ['Three Quick Reasons'],
    derivatives: { gif: true, imessage: true, translations: true, remarketing: false },
  }));
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [batch, setBatch] = useState(null);
  const [rows, setRows] = useState([]);
  const [pf, setPf] = useState(null);
  const set = (k, v) => { setS(x => ({ ...x, [k]: v })); setPlan(null); };
  const toggle = (k, v) => { setS(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] })); setPlan(null); };

  const loadCampaigns = useCallback(async () => { try { setCampaigns((await mediumApi.holidayCampaigns()).campaigns); } catch (e) { notify(e.message, true); } }, [notify]);
  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  const loadBatch = useCallback(async (id) => { try { setRows((await mediumApi.holidayBatch(id)).briefs); } catch (e) { notify(e.message, true); } }, [notify]);
  useEffect(() => {
    if (!batch) return undefined;
    loadBatch(batch);
    const t = setInterval(() => loadBatch(batch), 6000);
    return () => clearInterval(t);
  }, [batch, loadBatch]);
  useEffect(() => {
    if (!pf?.batch_id || ['done', 'error'].includes(pf.status)) return undefined;
    const t = setInterval(async () => { try { setPf(await mediumApi.holidayPreflightStatus(pf.batch_id)); } catch { /* keep polling */ } }, 5000);
    return () => clearInterval(t);
  }, [pf]);

  const doPlan = async () => {
    setBusy('plan');
    try { setPlan((await mediumApi.holidayPlan(s)).plan); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const generate = async () => {
    if (!window.confirm(`Write ${plan.parents.length} parent briefs for ${plan.holiday}? About $${plan.est_cost} in AI cost. Each one is style-checked, scored and proofread by Captain Caption.`)) return;
    setBusy('gen');
    try {
      const r = await mediumApi.holidayGenerate(s, plan.parents.length);
      notify(`Writing ${r.ids.length} parent briefs — they fill in below as they finish`);
      setBatch(r.batch_id); setPlan(null); loadCampaigns();
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const act = async (key, fn, msg) => {
    setBusy(key);
    try { const r = await fn(); notify(typeof msg === 'function' ? msg(r) : msg); loadBatch(batch); loadCampaigns(); return r; } catch (e) { notify(e.message, true); return null; } finally { setBusy(null); }
  };

  const parents = rows.filter(r => r.source === 'holiday');
  const derivs = rows.filter(r => r.source === 'derivative');
  const ready = parents.filter(r => r.status === 'PENDING_REVIEW' && r.score >= 80 && r.preflight === 'passed').length;
  return (
    <div className="space-y-5">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="trk-glass p-5 grid gap-3">
          <div className="trk-label flex items-center gap-1.5"><CalendarDays size={13} /> Campaign setup</div>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="grid gap-1"><span className="trk-label">Holiday</span><input className="trk-input" value={s.holiday} onChange={(e) => set('holiday', e.target.value)} list="md-holidays" /><datalist id="md-holidays">{(overview?.holidays || []).map(h => <option key={h.name} value={h.name.replace(/\s\d{4}$/, '')} />)}</datalist></label>
            <label className="grid gap-1"><span className="trk-label">Sale starts</span><input type="date" className="trk-input" value={s.starts} onChange={(e) => set('starts', e.target.value)} /></label>
            <label className="grid gap-1"><span className="trk-label">Sale ends (on every asset)</span><input type="date" className="trk-input" value={s.ends} onChange={(e) => set('ends', e.target.value)} /></label>
          </div>
          <fieldset><legend className="trk-label mb-1">Lanes</legend><div className="flex flex-wrap gap-3 text-[13px]">{LANES.map(l => <label key={l} className="flex items-center gap-1.5"><input type="checkbox" checked={s.lanes.includes(l)} onChange={() => toggle('lanes', l)} /> {l}</label>)}</div></fieldset>
          <div className="grid gap-2">
            <span className="trk-label">Offer tiers & codes</span>
            {s.tiers.map((t, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className="trk-input !w-[90px]" inputMode="numeric" value={t.tier} onChange={(e) => set('tiers', s.tiers.map((x, k) => (k === i ? { ...x, tier: e.target.value } : x)))} aria-label="Discount %" /><span className="text-[13px] trk-muted">% off · code</span>
                <input className="trk-input" value={t.code} onChange={(e) => set('tiers', s.tiers.map((x, k) => (k === i ? { ...x, code: e.target.value } : x)))} placeholder="XMAS30" aria-label="Code" />
                {s.tiers.length > 1 && <button type="button" className="trk-btn !p-2" aria-label="Remove tier" onClick={() => set('tiers', s.tiers.filter((_, k) => k !== i))}><X size={13} /></button>}
              </div>
            ))}
            <button type="button" className="trk-btn !py-1.5 justify-self-start" onClick={() => set('tiers', [...s.tiers, { tier: '', code: '' }])}><Plus size={13} /> Add a tier</button>
          </div>
          <fieldset><legend className="trk-label mb-1">Products ({s.products.length})</legend>
            <div className="flex flex-wrap gap-1.5">{products.map(p => <button key={p} type="button" aria-pressed={s.products.includes(p)} onClick={() => toggle('products', p)} className={`trk-chip ${s.products.includes(p) ? 'green' : 'gray'}`}>{p}</button>)}</div>
          </fieldset>
          <div className="grid sm:grid-cols-2 gap-3">
            <fieldset><legend className="trk-label mb-1">Static templates</legend><div className="grid gap-1 text-[13px]">{STATIC_T.map(t => <label key={t} className="flex items-center gap-1.5"><input type="checkbox" checked={s.static_templates.includes(t)} onChange={() => toggle('static_templates', t)} /> {t}</label>)}</div></fieldset>
            <fieldset><legend className="trk-label mb-1">Video templates</legend><div className="grid gap-1 text-[13px]">{VIDEO_T.map(t => <label key={t} className="flex items-center gap-1.5"><input type="checkbox" checked={s.video_templates.includes(t)} onChange={() => toggle('video_templates', t)} /> {t}</label>)}</div></fieldset>
          </div>
          <fieldset><legend className="trk-label mb-1">Derivatives (proposed only after their parent is approved)</legend>
            <div className="flex flex-wrap gap-3 text-[13px]">{[['gif', 'GIF loops'], ['imessage', 'iMessage GIF'], ['translations', 'Translations'], ['remarketing', 'Remarketing']].map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={!!s.derivatives[k]} onChange={() => set('derivatives', { ...s.derivatives, [k]: !s.derivatives[k] })} /> {l}</label>)}</div>
          </fieldset>
          <button type="button" className="trk-btn primary justify-self-start" disabled={busy === 'plan' || !s.products.length} onClick={doPlan}>{busy === 'plan' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Plan the campaign</button>
        </div>

        <div className="trk-glass p-5">
          <div className="trk-label">This campaign will create</div>
          {!plan && <p className="mt-3 text-[13.5px] trk-muted">Pick products and templates, then Plan. You’ll see every ticket, the price math and the cost before anything is written. Black Friday 2026 was 102 tickets.</p>}
          {plan && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                {[['Statics', plan.counts.statics], ['Videos', plan.counts.videos], ['Derivatives later', plan.counts.derivatives]].map(([l, n]) => <div key={l} className="rounded-xl p-3" style={{ background: 'var(--trk-glass-hi)' }}><div className="cc-stat !text-[34px]">{n}</div><div className="text-[12px] trk-muted">{l}</div></div>)}
              </div>
              {plan.prices.length > 0 && <div className="mt-3 text-[13px]"><div className="trk-label mb-1">Price math — written onto every asset</div>{plan.prices.map((p, i) => <div key={i} className={p.list ? '' : 'trk-dim'}>{p.product} · {p.text}</div>)}</div>}
              <details className="mt-3"><summary className="trk-label">The {plan.parents.length} parent tickets</summary><div className="mt-1 text-[12.5px] space-y-0.5 max-h-[240px] overflow-y-auto trk-scroll">{plan.parents.map((p, i) => <div key={i}>{p.format === 'video' ? '🎬' : '🎨'} {p.ticket_name}{p.code ? ` · ${p.code}` : ''}</div>)}</div></details>
              <button type="button" className="trk-btn primary mt-4" disabled={busy === 'gen' || !plan.parents.length} onClick={generate}>{busy === 'gen' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Write {plan.parents.length} parent briefs (~{money(plan.est_cost)})</button>
              <p className="mt-2 text-[12px] trk-dim">Parents go first. GIFs, translations and remarketing are proposed only after their parent is approved — the way the team already works.</p>
            </>
          )}
        </div>
      </div>

      <div className="trk-glass p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="trk-label">Campaigns</div>
          <select className="trk-input !w-auto ml-2" value={batch || ''} onChange={(e) => { setBatch(e.target.value || null); setPf(null); }} aria-label="Campaign">
            <option value="">Pick a campaign…</option>
            {campaigns.map(c => <option key={c.batch_id} value={c.batch_id}>{c.holiday} · {c.briefs} briefs ({c.waiting} waiting, {c.approved} approved{c.writing ? `, ${c.writing} writing` : ''})</option>)}
          </select>
          {batch && (
            <span className="ml-auto flex flex-wrap gap-2">
              <button type="button" className="trk-btn !py-1.5" disabled={!!busy} onClick={() => act('pf', () => mediumApi.holidayPreflight(batch), 'Campaign pre-flight queued — Captain Caption checks every parent together').then(r => r && setPf({ batch_id: r.batch_id, status: 'queued' }))}><ShieldCheck size={13} /> Campaign pre-flight</button>
              <button type="button" className="trk-btn !py-1.5" disabled={!!busy || !ready} onClick={() => window.confirm(`Approve the ${ready} parent briefs that score 80+ and passed Captain Caption?`) && act('approve', () => mediumApi.holidayApprove(batch), (r) => `${r.approved} approved · ${r.monday}`)}><CheckCheck size={13} /> Approve {ready} ready</button>
              <button type="button" className="trk-btn !py-1.5" disabled={!!busy} onClick={() => act('deriv', () => mediumApi.holidayDerivatives(batch), (r) => (r.proposed ? `${r.proposed} derivatives proposed` : r.parents_ready ? 'Nothing new to propose' : 'Approve parents first'))}><Copy size={13} /> Propose derivatives</button>
            </span>
          )}
        </div>
        {pf && (
          <div className="mt-3 rounded-xl p-3 text-[13px]" style={{ background: 'var(--trk-glass-hi)' }}>
            {pf.status !== 'done' ? <><Loader2 size={13} className="inline animate-spin mr-1" /> Captain Caption is checking the campaign ({pf.done ?? 0}/{pf.total ?? '…'})</> : (
              <>
                <b>{pf.summary?.passed}/{pf.summary?.briefs} passed</b> · {pf.summary?.must_fix} must-fix · {pf.summary?.lines_checked} lines
                {(pf.summary?.cross_brief || []).length > 0 && <ul className="mt-1 list-disc pl-5">{pf.summary.cross_brief.map((x, i) => <li key={i}>{x.found} → {x.fix} <span className="trk-dim">({x.rule})</span></li>)}</ul>}
                {!(pf.summary?.cross_brief || []).length && <div className="mt-1 trk-muted">One code, one end date and one price per product across the campaign ✓</div>}
              </>
            )}
          </div>
        )}
        {batch && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left trk-dim text-[11px] uppercase"><th className="py-1 pr-3">Ticket</th><th className="pr-3">Status</th><th className="pr-3">Score</th><th className="pr-3">Captain</th></tr></thead>
              <tbody>
                {[...parents, ...derivs].map(r => { const [l, t] = STATUS[r.status] || [r.status, 'gray']; return (
                  <tr key={r.id} className="cursor-pointer hover:bg-[var(--trk-glass-hi)]" style={{ borderTop: '1px solid var(--trk-line)' }} onClick={() => onOpen(r.id)}>
                    <td className="py-1.5 pr-3">{r.format === 'video' ? '🎬' : '🎨'} {r.ticket_name || `${r.product} — writing…`}{r.derivative ? <span className="trk-dim"> · {r.derivative}</span> : null}</td>
                    <td className="pr-3"><Chip tone={t}>{l}</Chip></td>
                    <td className="pr-3 tabular-nums">{r.score ?? (r.band === 'blocked' ? 'blocked' : '—')}</td>
                    <td className="pr-3">{r.preflight === 'passed' ? '✓' : r.preflight === 'issues' ? `${r.must_fix} must-fix` : '—'}</td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
