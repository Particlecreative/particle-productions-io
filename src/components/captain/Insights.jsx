import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import { money } from './util';

// Issue types grouped into the families a reviewer recognises, so a brief and a finished asset can be compared
const FAMILY = {
  spelling: 'Spelling & wrong words', wrong_word: 'Spelling & wrong words', grammar: 'Spelling & wrong words', vo_wrong_word: 'Spelling & wrong words',
  brand_name: 'Names & terms', label_mismatch: 'Names & terms',
  inconsistent: 'Consistency', inconsistent_code: 'Consistency', inconsistent_date: 'Consistency', inconsistent_guarantee: 'Consistency', size_mismatch: 'Consistency', caption_vs_voiceover: 'Consistency',
  offer_code: 'Offer, code & price', offer_date: 'Offer, code & price', offer_tier: 'Offer, code & price', price: 'Offer, code & price', leftover_code: 'Offer, code & price',
  leftover_date: 'Offer, code & price', campaign_code: 'Offer, code & price', campaign_date: 'Offer, code & price', campaign_price: 'Offer, code & price', missing_code: 'Offer, code & price', missing_end_date: 'Offer, code & price',
  claim: 'Claims', claim_unverified: 'Claims', claim_article: 'Claims',
  rule: 'House & lane rules', lane: 'House & lane rules', placeholder: 'House & lane rules', translation: 'House & lane rules', translation_currency: 'House & lane rules', missing_cta: 'House & lane rules', missing_disclaimer: 'House & lane rules',
  reading_speed: 'Timing & fit', vo_speed: 'Timing & fit', timing: 'Timing & fit', fit: 'Timing & fit', overflow: 'Timing & fit', cut_off: 'Timing & fit',
  vo_unclear: 'Voiceover', vo_pronunciation: 'Voiceover', vo_script_mismatch: 'Voiceover', vo_order: 'Voiceover',
  script_mismatch: 'Differs from the brief',
};
const DELIVERY = new Set(['brief_mismatch', 'brief_missing']);
const BEFORE = 'var(--trk-violet)';
const AFTER = 'var(--trk-muted)';

/** Caught before production (brief pre-flight) vs after (video + design) — where the Captain saves revision rounds. */
export default function Insights({ notify }) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try { setData(await captainApi.insights(days)); } catch (e) { notify(e.message, true); }
  }, [days, notify]);
  useEffect(() => { setData(null); load(); }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const stage = Object.fromEntries((data.stages || []).map(s => [s.discipline, s]));
    const fam = {};
    let before = 0, beforeMust = 0, after = 0, afterMust = 0, delivered = 0;
    const fb = { brief: { good: 0, wrong: 0 }, after: { good: 0, wrong: 0 } };
    for (const t of data.types || []) {
      if (DELIVERY.has(t.type)) { delivered += t.n; continue; }
      const f = FAMILY[t.type] || 'Other';
      const row = (fam[f] ||= { family: f, before: 0, after: 0 });
      const key = t.discipline === 'brief' ? 'brief' : 'after';
      if (key === 'brief') { row.before += t.n; before += t.n; if (t.severity === 'must_fix') beforeMust += t.n; } else { row.after += t.n; after += t.n; if (t.severity === 'must_fix') afterMust += t.n; }
      fb[key].good += t.good || 0; fb[key].wrong += t.wrong || 0;
    }
    const rows = Object.values(fam).sort((a, b) => (b.before + b.after) - (a.before + a.after));
    const max = Math.max(1, ...rows.map(r => r.before + r.after));
    return { stage, rows, max, before, beforeMust, after, afterMust, delivered, fb, share: before + after ? Math.round((100 * before) / (before + after)) : null };
  }, [data]);

  if (!view) return <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>;
  const briefs = view.stage.brief?.checks || 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm trk-muted max-w-[760px]">Every issue the Captain catches in a brief is one that never reaches an editor or designer. This compares what he caught <b>before production</b> (brief pre-flight) with what he caught <b>after</b> (finished videos and designs).</p>
        <div className="trk-seg ml-auto">{[30, 90, 365].map(d => <button key={d} type="button" className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d === 365 ? '1 year' : `${d} days`}</button>)}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Caught before production" value={view.before} sub={`${view.beforeMust} must-fix · ${briefs} brief${briefs === 1 ? '' : 's'} checked`} />
        <Tile label="Caught after (video + design)" value={view.after} sub={`${view.afterMust} must-fix · ${(view.stage.video?.checks || 0) + (view.stage.design?.checks || 0)} checks`} />
        <Tile label="Share caught early" value={view.share == null ? '—' : `${view.share}%`} sub="of all issues, at the brief stage" />
        <Tile label="Approved texts locked" value={data.approved_items} sub={`${view.delivered} delivered differently from the brief${data.overrides ? ` · ${data.overrides} override${data.overrides === 1 ? '' : 's'}` : ''}`} />
      </div>

      <div className="trk-glass p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="trk-label">What gets caught where</div>
          <span className="flex items-center gap-1.5 text-[12px] trk-muted"><span className="cc-dot" style={{ background: BEFORE }} /> Before production (brief)</span>
          <span className="flex items-center gap-1.5 text-[12px] trk-muted"><span className="cc-dot" style={{ background: AFTER }} /> After (video + design)</span>
        </div>
        {!view.rows.length && <div className="mt-4 text-[13px] trk-dim">Nothing caught in this period yet.</div>}
        <div className="mt-4 space-y-3">
          {view.rows.map(r => (
            <div key={r.family} className="grid grid-cols-[minmax(120px,190px)_minmax(0,1fr)_88px] items-center gap-3 text-[13px]">
              <div className="truncate" title={r.family}>{r.family}</div>
              <div className="flex h-[10px] gap-[2px]" role="img" aria-label={`${r.family}: ${r.before} before production, ${r.after} after`}>
                {r.before > 0 && <div style={{ width: `${(100 * r.before) / view.max}%`, background: BEFORE, borderRadius: '4px 0 0 4px' }} />}
                {r.after > 0 && <div style={{ width: `${(100 * r.after) / view.max}%`, background: AFTER, opacity: 0.55, borderRadius: r.before ? '0 4px 4px 0' : 4 }} />}
              </div>
              <div className="text-right tabular-nums trk-muted"><b style={{ color: 'var(--trk-text)' }}>{r.before}</b> / {r.after}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="trk-glass p-5 text-[13.5px]">
          <div className="trk-label mb-2">Team feedback</div>
          <div>Briefs: ✅ {view.fb.brief.good} good catch{view.fb.brief.good === 1 ? '' : 'es'} · ❌ {view.fb.brief.wrong} not a typo</div>
          <div className="mt-1">Videos + designs: ✅ {view.fb.after.good} · ❌ {view.fb.after.wrong}</div>
          <div className="mt-2 text-[12px] trk-dim">“Not a typo” goes to the Brain’s review queue, so both stages learn together.</div>
        </div>
        <div className="trk-glass p-5 text-[13.5px]">
          <div className="trk-label mb-2">AI cost in this period</div>
          {['brief', 'video', 'design'].map(d => <div key={d} className="flex justify-between"><span className="capitalize">{d === 'brief' ? '📝 Briefs' : d === 'video' ? '🎬 Videos' : '🎨 Designs'}</span><span className="tabular-nums">{money(view.stage[d]?.cost || 0) || '$0'}</span></div>)}
          <div className="mt-2 text-[12px] trk-dim">Revision rounds saved needs Monday time tracking — not connected yet.</div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className="trk-glass p-5">
      <div className="trk-label">{label}</div>
      <div className="cc-stat mt-2">{value}</div>
      <div className="mt-1 text-[12px] trk-muted">{sub}</div>
    </div>
  );
}
