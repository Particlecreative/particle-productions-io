import { useMemo, useState } from 'react';
import { FileText, Loader2, ExternalLink } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import { ISSUE_TYPES, SEVERITY, money } from './util';

const KINDS = ['super', 'vo', 'voiceover', 'headline', 'subtitle', 'kicker', 'eyebrow', 'badge', 'pill', 'offer', 'cta', 'code', 'price', 'disclaimer', 'translation', 'body'];
const LANGS = ['he', 'fr', 'it', 'es', 'ar', 'de', 'pt'];

/**
 * "V1 9x16 super 0-3s: Your neck ages first" → { version: 'V1', size: '9x16', kind: 'super', start: 0, end: 3, text }.
 * Anything before the colon that isn't a known tag means the colon is part of the copy ("Ends: Dec 21").
 */
export function parseBriefLines(text) {
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean).map((raw, n) => {
    const base = { id: `l${n + 1}`, kind: 'super', text: raw };
    const m = raw.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!m) return base;
    const meta = {};
    for (const t of m[1].trim().split(/\s+/)) {
      const tl = t.toLowerCase();
      if (/^v\d{1,2}$/.test(tl)) meta.version = tl.toUpperCase();
      else if (/^\d{1,2}[x×:]\d{1,2}$/.test(tl)) meta.size = tl.replace(/[×:]/, 'x');
      else if (/^\d+(\.\d+)?[-–]\d+(\.\d+)?s?$/.test(tl)) { const [a, b] = tl.replace(/s$/, '').split(/[-–]/).map(Number); meta.start = a; meta.end = b; }
      else if (KINDS.includes(tl)) meta.kind = tl === 'voiceover' ? 'vo' : tl;
      else if (LANGS.includes(tl)) meta.lang = tl;
      else return base;
    }
    return { ...base, ...meta, text: m[2].trim() };
  });
}

/** Paste a brief's copy → the same pre-flight Medium runs (costs about a cent). */
export default function BriefCheck({ notify }) {
  const [f, setF] = useState({ lane: 'Particle', product: '', campaign: '', code: '', tier: '', ends: '', layout: '', board: '' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const lines = useMemo(() => parseBriefLines(text), [text]);

  const run = async (e) => {
    e?.preventDefault();
    if (!lines.length) return;
    setBusy(true);
    setResult(null);
    try {
      const offer = f.code || f.tier || f.ends ? { code: f.code || null, tier: f.tier || null, ends: f.ends || null } : null;
      const r = await captainApi.checkBrief({
        brief_id: `hq-${Date.now()}`, lane: f.lane, product: f.product || null, campaign: f.campaign || null, board: f.board || null,
        layout_ref: f.layout || null, offer, lines,
      });
      setResult({ ...r, lines });
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  };

  const byLine = (id) => (result?.issues || []).filter(i => i.line_id === id);
  const whole = (result?.issues || []).filter(i => !i.line_id);
  return (
    <form className="trk-glass p-5 sm:p-6" onSubmit={run}>
      <div className="trk-label">Check brief text</div>
      <p className="text-sm trk-muted mt-1">The same pre-flight Medium runs before a brief can be approved: spelling and Brain rules, reading speed, layout fit, offer code / date / price, versions, claims and required elements. Nothing is posted anywhere.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="grid gap-1"><span className="trk-label">Lane</span>
          <select className="trk-input" value={f.lane} onChange={set('lane')}>{['Particle', 'SFY', 'GT', 'WAC'].map(l => <option key={l}>{l}</option>)}</select>
        </label>
        <label className="grid gap-1"><span className="trk-label">Product</span><input className="trk-input" value={f.product} onChange={set('product')} placeholder="Neck Cream" /></label>
        <label className="grid gap-1"><span className="trk-label">Campaign</span><input className="trk-input" value={f.campaign} onChange={set('campaign')} placeholder="Christmas 2026" /></label>
        <label className="grid gap-1"><span className="trk-label">Format</span>
          <select className="trk-input" value={f.board} onChange={set('board')}><option value="">Not decided</option><option value="video">🎬 Video</option><option value="design">🎨 Design</option></select>
        </label>
        <label className="grid gap-1"><span className="trk-label">Code</span><input className="trk-input" value={f.code} onChange={set('code')} placeholder="XMAS30" /></label>
        <label className="grid gap-1"><span className="trk-label">Discount %</span><input className="trk-input" inputMode="numeric" value={f.tier} onChange={set('tier')} placeholder="30" /></label>
        <label className="grid gap-1"><span className="trk-label">Sale ends</span><input type="date" className="trk-input" value={f.ends} onChange={set('ends')} /></label>
        <label className="grid gap-1"><span className="trk-label">Layout (template)</span><input className="trk-input" value={f.layout} onChange={set('layout')} placeholder="5 Bucks. 5 Problems." /></label>
      </div>
      <label className="grid gap-1 mt-3"><span className="trk-label">Lines — one per line, tags optional before a colon</span>
        <textarea className="trk-input min-h-[150px] font-mono !text-[13px]" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'V1 9x16 headline: Your neck ages first\nsuper 0-3s: The skin on your neck thins first\nvo 0-6: Nobody treats their neck. Until now.\ncode: USE CODE: XMAS30 · Ends Dec 21\ncta: Shop Now'} />
      </label>
      <div className="mt-2 text-[12px] trk-dim">Tags: V1–V3 · size (9x16, 4x5, 1x1) · element (headline, super, vo, subtitle, cta, code, price, disclaimer…) · time (0-3s) · language (he, fr, it…). {lines.length > 0 && <b>{lines.length} line{lines.length === 1 ? '' : 's'}</b>}</div>
      <button type="submit" className="trk-btn primary mt-4" disabled={busy || !lines.length}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {busy ? 'Reading the brief…' : 'Check brief'}</button>

      {result && (
        <div className="mt-6" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`trk-chip ${result.verdict === 'passed' ? 'green' : 'red'}`}>{result.verdict === 'passed' ? '✅ Passed pre-flight' : `🔴 ${result.must_fix} must-fix`}</span>
            {result.issues.length > result.must_fix && <span className="trk-chip amber">{result.issues.length - result.must_fix} to look at</span>}
            {result.cached && <span className="trk-chip gray" title="Same brief, same Brain — the earlier answer">from cache</span>}
            {result.cost_usd != null && !result.cached && <span className="trk-chip gray">{money(result.cost_usd)}</span>}
            {result.check_id && <a className="trk-btn !py-1 ml-auto" href={`/captain?tab=activity&check=${result.check_id}`}><ExternalLink size={12} /> Open in Activity</a>}
          </div>
          {(result.notes || []).length > 0 && <ul className="mt-3 text-[13px] trk-muted list-disc pl-5 space-y-0.5">{result.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>}
          {whole.length > 0 && <div className="mt-3 space-y-1.5">{whole.map(i => <Finding key={i.id || i.found} i={i} />)}</div>}
          <div className="mt-3 space-y-2">
            {result.lines.map(l => {
              const mine = byLine(l.id);
              return (
                <div key={l.id} className="rounded-xl px-3 py-2" style={{ background: mine.length ? 'var(--trk-glass-hi)' : 'transparent' }}>
                  <div className="text-[13.5px]"><span className="trk-dim mr-2">{l.id} · {l.kind}{l.version ? ` · ${l.version}` : ''}{l.size ? ` · ${l.size}` : ''}</span>{l.text}</div>
                  {mine.map(i => <Finding key={i.id || `${i.type}${i.found}`} i={i} />)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}

function Finding({ i }) {
  const sev = i.severity === 'should_fix' ? 'check' : i.severity;
  const [label, tone] = SEVERITY[sev] || SEVERITY.must_fix;
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-1.5 text-[13px]">
      <span className={`trk-chip ${tone}`}>{label}</span>
      <span className="trk-chip gray">{ISSUE_TYPES[i.type] || i.type}</span>
      <span><b>{i.found}</b>{i.fix ? <> → {i.fix}</> : null}</span>
      {i.rule && <span className="trk-muted">· {i.rule}</span>}
    </div>
  );
}
