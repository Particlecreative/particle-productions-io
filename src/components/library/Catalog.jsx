import { useState } from 'react';
import { Download, ExternalLink, Copy, Check, Globe, Loader2, Film, Music, ChevronRight } from 'lucide-react';
import { download } from '../../lib/libraryService';
import { groupCommercials, posterOf, Poster, sourceOf } from './parts';

// ── The catalog: one entry per commercial (sheet row or CP TV master), plus productions that only have other files ──
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SALE = /(\bsale\b|black friday|cyber|new year|memorial|july 4|4th of july|independence|labor day|father|mother|valentine|holiday|prime day|\bbfcm\b)/i;

export function buildCatalog(productions, before) {
  const entries = [];
  const add = (e) => entries.push({ ...e, sale: SALE.test(e.title) || (!e.product && !e.production), productKey: fold(e.product) || null });
  for (const p of productions) {
    if (!p.items.length) continue;
    const extras = { digital: p.items.filter(i => i.category === 'digital').length, sound: p.items.filter(i => i.category === 'sound').length };
    const masters = p.items.filter(i => i.category === 'tv_master');
    const product = p.product_type?.[0] || null;
    for (const g of groupCommercials(masters)) {
      add({ key: `${p.id}|${g.key}`, title: g.title, duration: g.duration, notes: g.notes, product: g.product || product, production: p, items: g.items, extras, date: latest(g.items) || p.air_date || p.completed_at });
    }
    if (!masters.length) add({ key: p.id, title: p.name, duration: null, notes: null, product, production: p, items: [], extras, date: p.air_date || p.completed_at, productionOnly: true });
  }
  for (const g of groupCommercials(before)) {
    add({ key: `before|${g.key}`, title: g.title, duration: g.duration, notes: g.notes, product: g.product, production: null, items: g.items, extras: null, date: latest(g.items), suggestions: g.items[0].suggestions || [] });
  }
  return entries;
}
const latest = (items) => items.map(i => i.file_modified).filter(Boolean).sort().pop() || null;
export const onAir = (e) => e.items.some(i => i.on_air);
export const lengthBucket = (d) => (!d ? null : d <= 20 ? '15s' : d <= 45 ? '30s' : d <= 75 ? '60s' : '90s+');

/** One commercial: poster, name, product · production, its markets (click to download), digital & stems. */
export function CatalogRow({ e, canEdit, productions, onOpenProduction, onMove, onError }) {
  const live = onAir(e);
  return (
    <div className="trk-glass p-3 md:p-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-4 min-w-0 w-full lg:w-[38%] flex-none">
        <div className="relative w-[112px] h-[63px] rounded-xl overflow-hidden flex-none">
          <Poster item={posterOf(e.items) || e.items[0] || { file_kind: 'video' }} className="w-full h-full" icon={Film} />
          {e.duration && <span className="absolute right-1 bottom-1 text-[10px] font-bold px-1.5 rounded" style={{ background: 'rgba(3,11,46,.8)' }}>{e.duration}s</span>}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="trk-title text-[24px] truncate" title={e.title}>{e.title}</span>
            {live && <span className="trk-chip green !py-0.5 flex-none"><span className="w-1.5 h-1.5 rounded-full bg-current" />On air</span>}
          </div>
          <div className="text-[12px] trk-muted truncate">
            {[e.product || (e.sale ? 'Sale' : null)].filter(Boolean).join('')}
            {e.production
              ? <> · <button type="button" className="trk-link" onClick={() => onOpenProduction(e.production)}>{e.production.id} {e.production.name}</button></>
              : <> · Before 2026</>}
            {e.notes && <span className="trk-dim"> · {e.notes}</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 flex-1 min-w-[260px]">
        {e.items.map(it => <MarketButton key={it.id} it={it} onError={onError} />)}
        {e.productionOnly && <span className="text-[12px] trk-dim">No TV master yet</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-none max-w-full">
        {e.extras?.digital > 0 && <button type="button" className="trk-btn !py-1.5 !text-[12px]" onClick={() => onOpenProduction(e.production)}><Film size={12} />{e.extras.digital} digital</button>}
        {e.extras?.sound > 0 && <button type="button" className="trk-btn !py-1.5 !text-[12px]" onClick={() => onOpenProduction(e.production)}><Music size={12} />{e.extras.sound} stems</button>}
        {e.production && <button type="button" className="trk-dim hover:text-white p-1" title="Everything from this production" onClick={() => onOpenProduction(e.production)}><ChevronRight size={16} /></button>}
        {!e.production && canEdit && (
          <>
            {e.suggestions.slice(0, 1).map(sg => (
              <button key={sg.id} type="button" title={`Link to ${sg.id} · ${sg.name}${sg.why ? ` — ${sg.why}` : ''}`} onClick={() => onMove(e, sg.id)}
                className="trk-chip !py-1.5 hover:!bg-white/20 max-w-[220px]"><span className="trk-muted">→</span><span className="truncate">{sg.id} · {sg.name}</span></button>
            ))}
            <select value="" title="This commercial belongs to a CP production" className="trk-input !w-auto max-w-[180px] !py-1 !text-[12px]"
              onChange={(ev) => ev.target.value && onMove(e, ev.target.value)}>
              <option value="">{e.suggestions.length ? 'Another…' : 'Link to production…'}</option>
              {productions.map(x => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}
            </select>
          </>
        )}
      </div>
    </div>
  );
}

/** A market's file: the whole chip downloads; open / copy / landing page beside it. */
function MarketButton({ it, onError }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const get = async () => { setBusy(true); try { await download(it); } catch (err) { onError?.(err.message); } finally { setBusy(false); } };
  return (
    <span className="inline-flex items-stretch rounded-xl overflow-hidden" style={{ border: `1px solid ${it.on_air ? 'rgba(47,211,138,.45)' : 'var(--trk-line)'}`, background: it.on_air ? 'rgba(47,211,138,.08)' : 'rgba(255,255,255,.04)' }}>
      <button type="button" onClick={get} disabled={busy} title={`Download the ${it.market || ''} file (${sourceOf(it.url)})${it.on_air ? ' — on air' : ''}`}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 hover:bg-white/10">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        <span className="text-[12px] font-bold">{it.market || 'File'}</span>
        {it.on_air && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2fd38a' }} />}
        {it.code && <span className="text-[11px] font-mono trk-muted">{it.code}</span>}
      </button>
      <span className="flex items-center gap-0.5 px-1" style={{ borderLeft: '1px solid var(--trk-line)' }}>
        {it.landing_url && <a href={it.landing_url} target="_blank" rel="noopener noreferrer" title={it.vanity ? `Landing page: ${it.vanity}` : 'Landing page'} className="trk-dim hover:text-white p-1"><Globe size={12} /></a>}
        <a href={it.url} target="_blank" rel="noopener noreferrer" title={`Open in ${sourceOf(it.url)}`} className="trk-dim hover:text-white p-1"><ExternalLink size={12} /></a>
        <button type="button" title="Copy link" className="trk-dim hover:text-white p-1"
          onClick={() => navigator.clipboard?.writeText(it.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {})}>
          {copied ? <Check size={12} style={{ color: '#2fd38a' }} /> : <Copy size={12} />}
        </button>
      </span>
    </span>
  );
}
