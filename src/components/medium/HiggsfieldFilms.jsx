import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Clapperboard, Minus, Plus, Sparkles, CalendarClock } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { money, relTime } from './util';
import { BriefRow } from './BriefItems';

const LENGTH_LABEL = { 40: '40s', 60: '60s', 90: '90s', 120: '2 min' };
const SHARE = [[1, 'Realistic only'], [0.8, 'Mostly realistic'], [0.5, 'Half and half']];
const COST_EACH = 0.6;   // measured: the first film briefs cost about 60¢ each (written, scored, proofread, improved)
const MAX_COUNT = 10;

/** One story card from Ads Studio, as a picker tile. */
function CardTile({ card, on, fresh, onPick }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={on}
      className="text-left rounded-2xl overflow-hidden transition"
      style={{ border: `2px solid ${on ? 'var(--trk-accent, #4a55ff)' : 'var(--trk-border, rgba(127,127,127,.2))'}`, background: 'var(--trk-glass)' }}>
      <div className="relative" style={{ aspectRatio: '9 / 12', background: 'rgba(127,127,127,.12)' }}>
        {card.poster && <img src={card.poster} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />}
        {fresh && <span className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: '#16a34a', color: '#fff' }}>New in Ads Studio</span>}
        <span className="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'rgba(3,11,46,.72)', color: '#fff' }}>{card.style}</span>
      </div>
      <div className="p-2.5">
        <div className="font-semibold text-[13.5px] leading-snug" style={{ color: 'var(--trk-text)' }}>{card.title}</div>
        {card.subtitle && <div className="text-[12px] trk-muted line-clamp-2 mt-0.5">{card.subtitle}</div>}
      </div>
    </button>
  );
}

/**
 * Higgsfield story films (Tomer, 15 Nov 2026): a 40–60s drama — up to 2 minutes — with the product at its turn, written
 * by Medium and made by the editor in Higgsfield Ads Studio. Every day Medium reads what changed in Ads Studio and
 * writes the day's brief(s) on its own (the switch at the bottom).
 */
export default function HiggsfieldFilms({ notify, onOpen, onQueued, isAdmin }) {
  const [ov, setOv] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ brand: 'Particle', product_key: '', look: 'realistic', card_id: '', length: 60, count: 1, note: '' });
  const [ids, setIds] = useState([]);
  const [rows, setRows] = useState([]);
  const set = (patch) => setForm(f => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    try { setOv(await mediumApi.higgsfield()); } catch (e) { notify(e.message, true); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ids.length) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await mediumApi.briefs({ ids: ids.join(',') });
        if (!stop) setRows(r.briefs);
        if (r.briefs.some(b => ['QUEUED', 'WRITING'].includes(b.status))) setTimeout(() => !stop && tick(), 6000);
        else onQueued?.();
      } catch (e) { notify(e.message, true); }
    };
    tick();
    return () => { stop = true; };
  }, [ids, notify, onQueued]);

  const fresh = useMemo(() => new Set((ov?.changes || []).filter(c => Date.now() - new Date(c.at).getTime() < 7 * 86400000).flatMap(c => (c.added_cards || []).map(x => x.id))), [ov]);
  const cards = useMemo(() => (ov?.catalog?.cards || []).filter(c => c.realistic === (form.look === 'realistic'))
    .sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id))), [ov, form.look, fresh]);
  const products = (ov?.catalog?.products || []).filter(p => p.ready && (p.brand || 'Particle') === 'Particle');
  const s = ov?.settings || {};
  // every studio brand, with its products — Ads Studio's first; the rest are added in Ads Studio by the editor (the brief says how)
  const brands = ov?.brands?.length ? ov.brands : [{ name: 'Particle', ads_studio: true, products: products.map(p => ({ key: `hf:${p.id}`, product: p.product, ready: true, ads_studio: true })) }];
  const brand = brands.find(b => b.name === form.brand) || brands[0];
  const inStudio = (brand?.products || []).filter(p => p.ads_studio);
  const notInStudio = (brand?.products || []).filter(p => p.ready && !p.ads_studio);
  const chosen = (brand?.products || []).find(p => p.key === form.product_key) || null;

  const refresh = async () => {
    setBusy('refresh');
    try { const r = await mediumApi.higgsfieldRefresh(); notify(r.changed ? 'Read Ads Studio — there are changes' : `Read Ads Studio — ${r.cards} story cards, nothing new`); await load(); }
    catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const generate = async () => {
    setBusy('write');
    try {
      const r = await mediumApi.higgsfieldBriefs(form);
      setIds(r.ids);
      notify(`Writing ${r.queued} film brief${r.queued === 1 ? '' : 's'} — they arrive in Briefs in a minute or two`);
    } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const saveDaily = async (patch) => {
    setBusy('daily');
    try { await mediumApi.saveConfig({ higgsfield: { ...s, ...patch } }); await load(); notify('Saved'); }
    catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };

  if (!ov) return <div className="p-8 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div>;
  const catalog = ov.catalog;
  return (
    <div className="max-w-[1200px] space-y-6">
      <div className="trk-glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <span className="text-[28px]" aria-hidden>🎬</span>
          <div className="flex-1 min-w-[260px]">
            <h3 className="md-h2">Story films in Higgsfield Ads Studio</h3>
            <p className="md-sub mt-1 max-w-[720px]">A real little drama — 40–60 seconds, up to 2 minutes — where the product turns the story. Medium writes the story, the cast, the lines and the step-by-step; the editor makes it in Higgsfield Ads Studio. Realistic by default.</p>
          </div>
          <div className="text-right">
            <div className="text-[12.5px] trk-muted">{catalog ? `Ads Studio read ${relTime(ov.read_at)} · ${catalog.cards.length} story cards · ${products.length} products` : 'Ads Studio not read yet'}</div>
            <button type="button" className="trk-btn mt-2" onClick={refresh} disabled={busy === 'refresh' || !ov.connected}>
              {busy === 'refresh' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Read Ads Studio now
            </button>
          </div>
        </div>
        {!ov.connected && <p className="mt-3 text-[14px]" style={{ color: 'var(--trk-amber)' }}>Higgsfield isn’t connected — an admin connects it in Settings → Integrations → Higgsfield.</p>}
        {ov.error && ov.connected && <p className="mt-3 text-[13px]" style={{ color: 'var(--trk-amber)' }}>Last read failed: {ov.error}</p>}
        {ov.changes.length > 0 && (
          <div className="mt-4 grid gap-2">
            <div className="text-[12px] font-semibold uppercase tracking-wide trk-muted">What changed in Ads Studio</div>
            {ov.changes.slice(0, 4).map(c => (
              <div key={c.at} className="text-[13.5px]">
                <span className="trk-muted">{new Date(c.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — </span>
                {[c.added_cards?.length && `New story cards: ${c.added_cards.map(x => `${x.title}${x.style ? ` (${x.style})` : ''}`).join(', ')}`,
                  c.added_styles?.length && `New styles: ${c.added_styles.map(x => x.title).join(', ')}`,
                  c.added_products?.length && `New products: ${c.added_products.map(x => x.title).join(', ')}`,
                  c.removed_cards?.length && `Gone: ${c.removed_cards.map(x => x.title).join(', ')}`].filter(Boolean).join(' · ')}
              </div>
            ))}
          </div>
        )}
      </div>

      {catalog && (
        <div className="trk-glass rounded-3xl p-5 sm:p-7 grid gap-5">
          <div className="grid gap-4 sm:grid-cols-[250px_minmax(0,1fr)_auto] items-end">
            <label className="grid gap-1"><span className="trk-label">Brand</span>
              <select className="trk-input" value={brand?.name || 'Particle'} onChange={(e) => set({ brand: e.target.value, product_key: '' })}>
                {brands.map(b => <option key={b.name} value={b.name}>{b.name}{b.ads_studio ? '' : ' — not in Ads Studio yet'}</option>)}
              </select>
            </label>
            <label className="grid gap-1"><span className="trk-label">Product</span>
              <select className="trk-input" value={chosen ? chosen.key : ''} onChange={(e) => set({ product_key: e.target.value })}>
                <option value="">{brand?.name === 'Particle' ? 'Medium picks (top sellers first)' : `Medium picks (takes turns across ${brand?.name}’s products)`}</option>
                {inStudio.length > 0 && <optgroup label="In Ads Studio">{inStudio.map(p => <option key={p.key} value={p.key}>{p.product}{p.ready ? '' : ' — copy still being written in Ads Studio'}</option>)}</optgroup>}
                {notInStudio.length > 0 && <optgroup label="Not in Ads Studio yet — the brief says how to add it">{notInStudio.map(p => <option key={p.key} value={p.key}>{p.product}</option>)}</optgroup>}
              </select>
            </label>
            <div className="grid gap-1"><span className="trk-label">How many briefs</span>
              <div className="flex items-center gap-1.5 p-1 rounded-xl" style={{ background: 'var(--trk-glass)' }}>
                <button type="button" className="trk-btn !p-2" aria-label="Fewer briefs" disabled={form.count <= 1} onClick={() => set({ count: Math.max(1, form.count - 1) })}><Minus size={13} /></button>
                <input className="trk-input !w-14 text-center !px-1 font-semibold tabular-nums" type="number" min={1} max={MAX_COUNT} aria-label="How many briefs" value={form.count}
                  onChange={(e) => set({ count: Math.min(MAX_COUNT, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                <button type="button" className="trk-btn !p-2" aria-label="More briefs" disabled={form.count >= MAX_COUNT} onClick={() => set({ count: Math.min(MAX_COUNT, form.count + 1) })}><Plus size={13} /></button>
              </div>
            </div>
          </div>
          {(!brand?.ads_studio || (chosen && !chosen.ads_studio)) && (
            <p className="-mt-2 text-[13px]" style={{ color: 'var(--trk-amber)' }}>
              {!brand?.ads_studio
                ? `${brand?.name} isn’t set up in Higgsfield Ads Studio yet — each brief starts with the editor adding the brand (from ${brand?.site || 'its website'}) and the product, a few minutes the first time. It’s written for ${brand?.name}’s buyer and claims, and lands on Monday as ${brand?.name}.`
                : `${chosen.product} isn’t in Ads Studio yet — the brief starts with the editor adding it from its page${chosen.url ? '' : ' on the website'} (a few minutes).`}
            </p>
          )}
          {brand?.name !== 'Particle' && brand?.products?.length === 0 && <p className="-mt-2 text-[13px]" style={{ color: 'var(--trk-red)' }}>Medium doesn’t know {brand.name}’s products yet — Captain Caption reads them from the website (Captain → Brain → Brand websites).</p>}

          <div className="flex flex-wrap gap-4 items-end">
            <div className="grid gap-1"><span className="trk-label">Look</span>
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--trk-glass)' }}>
                {[['realistic', 'Realistic'], ['stylized', 'Stylized']].map(([k, l]) => (
                  <button key={k} type="button" className={`trk-btn !py-1.5 ${form.look === k ? 'primary' : ''}`} onClick={() => set({ look: k, card_id: '' })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="grid gap-1"><span className="trk-label">Length</span>
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--trk-glass)' }}>
                {(ov.lengths || [40, 60, 90, 120]).map(n => (
                  <button key={n} type="button" className={`trk-btn !py-1.5 ${form.length === n ? 'primary' : ''}`} onClick={() => set({ length: n })}>{LENGTH_LABEL[n] || `${n}s`}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <span className="trk-label">The story it borrows from Ads Studio</span>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <button type="button" onClick={() => set({ card_id: '' })} aria-pressed={!form.card_id}
                className="rounded-2xl p-4 text-left flex flex-col justify-between"
                style={{ border: `2px solid ${!form.card_id ? 'var(--trk-accent, #4a55ff)' : 'var(--trk-border, rgba(127,127,127,.2))'}`, background: 'var(--trk-glass)', minHeight: 180 }}>
                <Sparkles size={22} />
                <span><span className="font-semibold block" style={{ color: 'var(--trk-text)' }}>Let Medium pick</span><span className="text-[12px] trk-muted">New cards first, then the ones we used least</span></span>
              </button>
              {cards.map(c => <CardTile key={c.id} card={c} on={form.card_id === c.id} fresh={fresh.has(c.id)} onPick={() => set({ card_id: c.id })} />)}
            </div>
          </div>

          <label className="grid gap-1"><span className="trk-label">Anything to steer it? (optional)</span>
            <textarea className="trk-input" rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Set it at a wedding · the wife is the one who notices · keep it funny" />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="trk-btn primary !px-5 !py-2.5" onClick={generate} disabled={busy === 'write' || (brand?.name !== 'Particle' && !brand?.products?.length)}>
              {busy === 'write' ? <Loader2 size={15} className="animate-spin" /> : <Clapperboard size={15} />} Write {form.count === 1 ? 'the film brief' : `${form.count} film briefs`}{brand?.name !== 'Particle' ? ` for ${brand.name}` : ''}
            </button>
            <span className="md-sub">About {money(form.count * COST_EACH)} · a minute or two each{form.count > 1 ? ' — each with its own setting, cast and conflict' : ''} · nothing goes to Monday until you approve it</span>
          </div>
        </div>
      )}

      <div className="trk-glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <CalendarClock size={18} />
          <div className="flex-1 min-w-[240px]">
            <div className="font-semibold" style={{ color: 'var(--trk-text)' }}>Every day, on its own</div>
            <div className="text-[13.5px] trk-muted">
              {s.enabled
                ? `From ${String(s.hour ?? 7).padStart(2, '0')}:00 Medium reads what changed in Ads Studio and writes ${s.per_day || 1} film brief${(s.per_day || 1) === 1 ? '' : 's'} — ${(SHARE.find(([v]) => v === Number(s.realistic_share ?? 0.8)) || [0, 'mostly realistic'])[1].toLowerCase()}, ${LENGTH_LABEL[s.length || 60] || `${s.length}s`}. They wait for you in Briefs.`
                : 'Off — Medium still reads what changed in Ads Studio every morning, but writes no films on its own.'}
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`trk-btn ${s.enabled ? 'primary' : ''}`} disabled={busy === 'daily'} onClick={() => saveDaily({ enabled: !s.enabled })}>{s.enabled ? 'On' : 'Off'}</button>
              <select className="trk-input !w-auto" aria-label="Films per day" value={s.per_day || 1} onChange={(e) => saveDaily({ per_day: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} a day</option>)}
              </select>
              <select className="trk-input !w-auto" aria-label="Look" value={Number(s.realistic_share ?? 0.8)} onChange={(e) => saveDaily({ realistic_share: Number(e.target.value) })}>
                {SHARE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select className="trk-input !w-auto" aria-label="Length" value={s.length || 60} onChange={(e) => saveDaily({ length: Number(e.target.value) })}>
                {(ov.lengths || [40, 60, 90, 120]).map(n => <option key={n} value={n}>{LENGTH_LABEL[n] || `${n}s`}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid gap-2">
          {rows.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}
        </div>
      )}
    </div>
  );
}
