import { useState } from 'react';
import { Download, ExternalLink, Copy, Check, Film, Music, FileText, Trash2, Globe, Loader2 } from 'lucide-react';
import { download, CATEGORY } from '../../lib/libraryService';

export const fmtSize = (b) => {
  const n = Number(b) || 0;
  if (!n) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
};
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const sourceOf = (u) => (/dropbox\.com/i.test(u) ? 'Dropbox' : /drive\.google\.com/i.test(u) ? 'Drive' : /box\.com/i.test(u) ? 'Box' : host(u));

/** Commercials: the sheet's rows (one item per market) grouped back together; CP files stay one per row. */
export function groupCommercials(items) {
  const groups = new Map();
  for (const it of items) {
    const k = it.specs?.group ? `g:${it.specs.group}` : `i:${it.id}`;
    if (!groups.has(k)) groups.set(k, { key: k, title: it.title, product: it.product, notes: it.notes, duration: it.specs?.duration || null, items: [] });
    groups.get(k).items.push(it);
  }
  return [...groups.values()];
}

export function Poster({ item, className = '', icon }) {
  const [failed, setFailed] = useState(false);
  const Icon = icon || (item?.file_kind === 'audio' ? Music : item?.file_kind === 'video' ? Film : FileText);
  if (item?.thumb_url && !failed) {
    return <img src={item.thumb_url} alt="" loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} style={{ background: '#0b1546' }} />;
  }
  return (
    <span className={`flex items-center justify-center ${className}`} style={{ background: 'linear-gradient(135deg, rgba(74,85,255,.35), rgba(8,8,248,.12))' }}>
      <Icon size={18} className="opacity-70" />
    </span>
  );
}

function useCopy() {
  const [done, setDone] = useState(false);
  return [done, (text) => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }];
}

export function Actions({ item, onError, compact }) {
  const [copied, copy] = useCopy();
  const [busy, setBusy] = useState(false);
  const btn = 'trk-muted hover:text-white p-1 rounded';
  return (
    <span className="flex items-center gap-0.5 flex-none">
      <button type="button" title="Download" className={btn} disabled={busy}
        onClick={async (e) => { e.stopPropagation(); setBusy(true); try { await download(item); } catch (err) { onError?.(err.message); } finally { setBusy(false); } }}>
        {busy ? <Loader2 size={compact ? 13 : 15} className="animate-spin" /> : <Download size={compact ? 13 : 15} />}
      </button>
      <a href={item.url} target="_blank" rel="noopener noreferrer" title={`Open in ${sourceOf(item.url)}`} className={btn} onClick={e => e.stopPropagation()}><ExternalLink size={compact ? 13 : 15} /></a>
      <button type="button" title="Copy link" className={btn} onClick={(e) => { e.stopPropagation(); copy(item.url); }}>{copied ? <Check size={compact ? 13 : 15} style={{ color: '#2fd38a' }} /> : <Copy size={compact ? 13 : 15} />}</button>
    </span>
  );
}

export function SpecChips({ item, skipDuration }) {
  const s = item.specs || {};
  const chips = [
    !skipDuration && s.duration ? `${s.duration}s` : null,
    s.aspect,
    s.language,
    s.version,
    item.ext ? item.ext.toUpperCase() : null,
    fmtSize(item.size_bytes) || null,
  ].filter(Boolean);
  return chips.map(c => <span key={c} className="trk-chip gray !text-[10px] !px-2 !py-0.5">{c}</span>);
}

/** One file (CP-added): poster, name, specs, actions. */
export function FileRow({ item, canEdit, onRemove, onError }) {
  return (
    <div className="flex items-center gap-3 trk-glass px-3 py-2.5">
      <Poster item={item} className="w-16 h-9 rounded-lg flex-none overflow-hidden" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate" title={item.file_name || item.title}>{item.title}</div>
        <div className="mt-1 flex flex-wrap gap-1 items-center">
          <SpecChips item={item} />
          {item.market && <MarketTag item={item} />}
          <span className="text-[10px] trk-dim">{sourceOf(item.url)}</span>
        </div>
      </div>
      <Actions item={item} onError={onError} />
      {canEdit && item.source !== 'sheet' && onRemove && (
        <button type="button" title="Remove from the Library" className="trk-dim hover:text-white p-1" onClick={() => onRemove(item)}><Trash2 size={14} /></button>
      )}
    </div>
  );
}

export function MarketTag({ item }) {
  return (
    <span className="trk-chip !text-[10px] !px-2 !py-0.5" title={item.on_air ? 'Checked in the sheet' : undefined}>
      {item.on_air && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2fd38a' }} />}{item.market}
    </span>
  );
}

/** A commercial from the sheet: one line, its markets side by side (each with code, landing page and file). */
export function CommercialRow({ group, onError, right }) {
  const lead = group.items[0];
  return (
    <div className="trk-glass p-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-3 min-w-0 w-full md:w-[32%] flex-none">
        <Poster item={group.items.find(i => i.thumb_url) || lead} className="w-20 h-11 rounded-lg flex-none overflow-hidden" />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold truncate" title={group.title}>{group.title}</div>
          <div className="text-[11px] trk-muted truncate">{[group.product, group.notes].filter(Boolean).join(' · ') || CATEGORY[lead.category]?.label}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 flex-1 min-w-[240px]">
        {group.items.map(it => (
          <div key={it.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--trk-line)' }}>
            <span className="flex items-center gap-1.5 text-[12px] font-bold">
              {it.on_air && <span className="w-2 h-2 rounded-full" style={{ background: '#2fd38a' }} title="Checked in the sheet" />}
              {it.market || '—'}
            </span>
            {it.code && <span className="text-[11px] font-mono trk-muted">{it.code}</span>}
            {it.landing_url && <a href={it.landing_url} target="_blank" rel="noopener noreferrer" title={it.vanity || it.landing_url} className="trk-dim hover:text-white"><Globe size={12} /></a>}
            <span className="text-[10px] trk-dim">{sourceOf(it.url)}</span>
            <Actions item={it} onError={onError} compact />
          </div>
        ))}
      </div>
      {right}
    </div>
  );
}
