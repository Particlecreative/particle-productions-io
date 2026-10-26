import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Loader2, AlertTriangle, Check, Sheet, Plus, X, Clock, Radio, Tag } from 'lucide-react';
import { useBrand } from '../../context/BrandContext';
import { libraryApi, PROMPT_BOXES } from '../../lib/libraryService';
import { buildCatalog, CatalogRow, onAir, lengthBucket } from '../../components/library/Catalog';
import ProductionDrawer from '../../components/library/ProductionDrawer';
import AddFiles from '../../components/library/AddFiles';
import { CountUp } from '../../components/tracker/parts';
import '../../components/tracker/tracker.css';

const ERAS = [['all', 'All commercials'], ['cp', '2026 productions'], ['before', 'Before 2026']];
const LENGTHS = ['15s', '30s', '60s', '90s+'];
const SALES = '__sales';
const shortDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
const relTime = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const isDone = (stage) => /^completed/i.test(stage || '');

/**
 * The Library — every TV commercial's final files in one list. Pick a product (or Sales), narrow by market,
 * length or what's on air, then click a market to download its file. A production's digital versions and
 * sound stems are one click away.
 */
export default function LibraryPage() {
  const { brandId, brand } = useBrand();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [q, setQ] = useState('');
  const [era, setEra] = useState(() => (params.get('view') === 'before' ? 'before' : 'all'));
  const [product, setProduct] = useState('');
  const [market, setMarket] = useState('');
  const [length, setLength] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connect, setConnect] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [missingOpen, setMissingOpen] = useState(false);
  const [adding, setAdding] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { setData(await libraryApi.list(brandId)); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [brandId]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  const fail = (m) => setToast({ text: m, error: true });

  const productions = useMemo(() => data?.productions || [], [data]);
  const before = useMemo(() => data?.before || [], [data]);
  const canEdit = !!data?.can_edit;
  const all = data?.all_productions || productions;
  const source = data?.sources?.[0] || null;
  const open = productions.find(p => p.id === params.get('p')) || null;
  const missing = productions.filter(p => isDone(p.stage) && !p.items.some(i => i.category === 'tv_master' || i.category === 'digital'));

  const catalog = useMemo(() => buildCatalog(productions, before), [productions, before]);
  const inEra = useMemo(() => catalog.filter(e => era === 'all' || (era === 'cp' ? !!e.production : !e.production)), [catalog, era]);
  // Product chips (with Sales), counted inside the chosen era
  const productChips = useMemo(() => {
    const m = new Map();
    for (const e of inEra) if (e.productKey) { const c = m.get(e.productKey) || { key: e.productKey, label: e.product, n: 0 }; c.n++; m.set(e.productKey, c); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [inEra]);
  const salesCount = inEra.filter(e => e.sale).length;
  const markets = useMemo(() => [...new Set(inEra.flatMap(e => e.items.map(i => i.market)).filter(Boolean))], [inEra]);

  const needle = q.trim().toLowerCase();
  const shown = inEra.filter(e =>
    (!product || (product === SALES ? e.sale : e.productKey === product)) &&
    (!market || e.items.some(i => i.market === market)) &&
    (!length || lengthBucket(e.duration) === length) &&
    (!liveOnly || onAir(e)) &&
    (!needle || [e.title, e.product, e.notes, e.production?.id, e.production?.name, ...e.items.flatMap(i => [i.code, i.vanity, i.file_name])]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(needle))))
    .sort((a, b) => (onAir(b) - onAir(a)) || String(b.date || '').localeCompare(String(a.date || '')) || a.title.localeCompare(b.title));
  const filtered = !!(product || market || length || liveOnly || needle);
  // Grouped by product while no product is picked
  const sections = useMemo(() => {
    if (product) return [[null, shown]];
    const m = new Map();
    for (const e of shown) {
      const k = e.product || 'Sales & all products';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown, product]);
  const liveCount = inEra.filter(onAir).length;

  const moveEntry = async (e, productionId) => {
    try {
      for (const it of e.items) await libraryApi.updateItem(it.id, { production_id: productionId });
      const to = all.find(x => x.id === productionId);
      setToast({ text: `“${e.title}” is now in ${to ? `${to.id} ${to.name}` : productionId}` });
      load(true);
    } catch (err) { fail(err.message); }
  };
  const moveGroup = (group, productionId) => moveEntry({ title: group.title, items: group.items }, productionId);
  const removeItem = async (it) => {
    if (!window.confirm(`Remove “${it.title}” from the Library? The file stays in Dropbox.`)) return;
    try { await libraryApi.removeItem(it.id); setToast({ text: 'Removed from the Library' }); load(true); } catch (e) { fail(e.message); }
  };
  const sync = async () => {
    if (!source) return;
    setSyncing(true);
    try {
      const { result } = await libraryApi.syncSheet(source.id);
      setToast(result.ok ? { text: `Synced · ${result.added} new · ${result.updated} updated · ${result.removed} removed` } : { text: `Sync failed: ${result.error}`, error: true });
      await load(true);
    } catch (e) { fail(e.message); } finally { setSyncing(false); }
  };
  const connectSheet = async () => {
    setSyncing(true);
    try {
      const r = await libraryApi.connectSheet(brandId, sheetUrl);
      setToast(r.ok ? { text: `Connected · ${r.result.files} files read` } : { text: `Connected, but the first sync failed: ${r.result?.error}`, error: true });
      setConnect(false); setSheetUrl('');
      await load(true);
    } catch (e) { fail(e.message); } finally { setSyncing(false); }
  };
  const clear = () => { setProduct(''); setMarket(''); setLength(''); setLiveOnly(false); setQ(''); };
  const chip = (on) => `trk-chip !py-1.5 !px-3 !text-[12px] cursor-pointer ${on ? '!bg-white !text-[#030b2e]' : 'hover:!bg-white/15'}`;

  return (
    <div className="trk max-w-[2400px] mx-auto pb-16">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        {/* Hero */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="trk-eyebrow">The Library · {brand?.name || brandId}</div>
            <h1 className="trk-title text-[48px] sm:text-[72px] md:text-[88px] mt-2">
              {data ? <><CountUp value={catalog.filter(e => !e.productionOnly).length} /> commercials</> : 'The Library'}
            </h1>
            <p className="mt-2 text-[15px] trk-muted">Every TV commercial’s final files. Pick a product, then click a market to download its file.</p>
          </div>
          <div className="ml-auto flex flex-col items-end gap-2">
            {source ? (
              <div className="flex items-center gap-2 text-[12px] trk-muted">
                <Sheet size={14} />
                <a href={`https://docs.google.com/spreadsheets/d/${source.sheet_id}`} target="_blank" rel="noopener noreferrer" className="trk-link">{source.title || 'Google Sheet'}</a>
                <span>· synced {relTime(source.last_synced_at)}</span>
                {source.last_result && !source.last_result.ok && <span className="trk-chip red" title={source.last_result.error}>last sync failed</span>}
                {canEdit && <button type="button" className="trk-btn !py-1.5" onClick={sync} disabled={syncing}>{syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync now</button>}
              </div>
            ) : canEdit && data && (
              <button type="button" className="trk-btn" onClick={() => setConnect(true)}><Sheet size={14} /> Sync from a Google Sheet</button>
            )}
            {missing.length > 0 && (
              <button type="button" onClick={() => setMissingOpen(true)} className="trk-btn !py-1.5" style={{ borderColor: 'rgba(255,181,71,.5)', background: 'rgba(255,181,71,.1)', color: '#ffd699' }}>
                <Clock size={13} /> {missing.length} completed production{missing.length > 1 ? 's' : ''} missing their finals
              </button>
            )}
          </div>
        </div>

        {connect && (
          <div className="mt-6 trk-glass p-4 flex flex-wrap items-center gap-2">
            <Sheet size={15} className="trk-muted" />
            <span className="text-[13px] font-semibold">Google Sheet of TV commercials</span>
            <input className="trk-input flex-1 min-w-[240px]" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
            <button type="button" className="trk-btn primary" disabled={!sheetUrl.trim() || syncing} onClick={connectSheet}>{syncing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Connect &amp; sync</button>
            <button type="button" className="trk-btn !p-2" onClick={() => setConnect(false)} aria-label="Cancel"><X size={14} /></button>
          </div>
        )}

        {error && (
          <div className="mt-6 px-4 py-3 rounded-2xl text-sm flex items-center gap-2" style={{ background: 'rgba(255,92,122,.12)', border: '1px solid rgba(255,92,122,.35)' }}>
            <AlertTriangle size={16} /> {error}
            <button type="button" onClick={() => load()} className="ml-auto font-semibold underline">Try again</button>
          </div>
        )}

        {!data ? (
          <div className="py-28 text-center trk-muted flex flex-col items-center gap-3">{!error && <><Loader2 className="animate-spin" /><span className="text-sm">Opening the Library…</span></>}</div>
        ) : (
          <>
            {/* Filters */}
            <div className="mt-8 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="trk-seg overflow-x-auto max-w-full">
                  {ERAS.map(([k, l]) => <button key={k} type="button" className={era === k ? 'on' : ''} onClick={() => { setEra(k); setProduct(''); }}>{l}</button>)}
                </div>
                <div className="relative flex-1 min-w-[200px] max-w-[420px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" />
                  <input className="trk-input !pl-9 !rounded-full" placeholder="Search names, codes, landing pages…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <button type="button" className="trk-btn" onClick={() => setLiveOnly(v => !v)} style={liveOnly ? { background: 'rgba(47,211,138,.2)', borderColor: 'rgba(47,211,138,.6)' } : undefined}>
                  <Radio size={14} style={{ color: '#2fd38a' }} /> On air now · {liveCount}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={chip(!product)} onClick={() => setProduct('')}>All products · {inEra.length}</button>
                {productChips.map(c => <button key={c.key} type="button" className={chip(product === c.key)} onClick={() => setProduct(product === c.key ? '' : c.key)}>{c.label} · {c.n}</button>)}
                {salesCount > 0 && <button type="button" className={chip(product === SALES)} onClick={() => setProduct(product === SALES ? '' : SALES)}><Tag size={11} /> Sales · {salesCount}</button>}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
                {markets.length > 1 && (
                  <span className="flex items-center gap-1.5 flex-wrap"><span className="trk-label">Market</span>
                    {markets.map(m => <button key={m} type="button" className={chip(market === m)} onClick={() => setMarket(market === m ? '' : m)}>{m}</button>)}
                  </span>
                )}
                <span className="flex items-center gap-1.5 flex-wrap"><span className="trk-label">Length</span>
                  {LENGTHS.map(l => <button key={l} type="button" className={chip(length === l)} onClick={() => setLength(length === l ? '' : l)}>{l}</button>)}
                </span>
                <span className="ml-auto trk-muted">{shown.length} shown{filtered && <> · <button type="button" className="trk-link" onClick={clear}>clear filters</button></>}</span>
              </div>
            </div>

            {era === 'before' && (
              <div className="mt-4 text-[12px] trk-muted">Commercials from the TV Commercials sheet with no CP production — mostly before 2026.{canEdit ? ' If one belongs to a production, link it: the sync keeps your choice.' : ''}</div>
            )}

            {/* The list */}
            <div className="mt-5 flex flex-col gap-6">
              {sections.map(([title, list]) => (
                <section key={title || 'all'}>
                  {title && <div className="trk-label mb-2">{title} · {list.length}</div>}
                  <div className="flex flex-col gap-2">
                    {list.map(e => (
                      <CatalogRow key={e.key} e={e} canEdit={canEdit} productions={all} onError={fail}
                        onOpenProduction={(p) => setParams({ p: p.id })} onMove={moveEntry} />
                    ))}
                  </div>
                </section>
              ))}
              {!shown.length && (
                <div className="py-16 text-center trk-muted text-sm">
                  {filtered ? <>Nothing matches. <button type="button" className="trk-link" onClick={clear}>Clear filters</button></> : 'Nothing here yet — files arrive when a production is completed, or from the TV Commercials sheet.'}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {open && (
        <ProductionDrawer p={open} productions={all} canEdit={canEdit} onClose={() => setParams({}, { replace: true })}
          onSaved={() => { setToast({ text: 'Added to the Library' }); load(true); }} onMove={moveGroup} onRemove={removeItem} onError={fail} />
      )}

      {missingOpen && (
        <Modal onClose={() => setMissingOpen(false)} wide>
          <div className="trk-eyebrow">The Library</div>
          <h2 className="trk-title text-[44px] md:text-[56px] mt-2">Missing their finals · {missing.length}</h2>
          <p className="mt-1 text-[14px] trk-muted">Completed productions with no TV master or digital versions in the Library yet.</p>
          <div className="mt-5 flex flex-col gap-2">
            {missing.map(p => (
              <div key={p.id} className="trk-glass px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{p.name}</div>
                  <div className="text-[11px] trk-muted">{[p.id, p.product_type?.join(' · '), p.completed_at && `completed ${shortDate(p.completed_at)}`].filter(Boolean).join(' · ')}</div>
                </div>
                {canEdit && <button type="button" className="trk-btn primary !py-1.5" onClick={() => { setMissingOpen(false); setAdding(p); }}><Plus size={13} /> Add files</button>}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {adding && (
        <Modal onClose={() => setAdding(null)}>
          <div className="trk-eyebrow">{adding.id} · add the finals</div>
          <h2 className="trk-title text-5xl mt-2 mb-5">{adding.name}</h2>
          <AddFiles productionId={adding.id} boxes={PROMPT_BOXES} onCancel={() => setAdding(null)}
            onSaved={() => { setAdding(null); setToast({ text: `Added to the Library — ${adding.name}` }); load(true); }} />
        </Modal>
      )}
      {toast && (
        <div className="trk fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-5 py-3 rounded-full text-sm shadow-2xl max-w-[92vw]"
          style={{ background: toast.error ? '#5a1024' : '#0b1546', border: '1px solid rgba(232,236,255,.15)' }}>
          {toast.error ? <AlertTriangle size={15} /> : <Check size={15} style={{ color: '#2fd38a' }} />}<span className="truncate">{toast.text}</span>
        </div>
      )}
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: 'rgba(3,11,46,.7)' }} onClick={onClose}>
      <div className={`trk trk-canvas w-full ${wide ? 'max-w-[860px]' : 'max-w-[720px]'} max-h-[92vh] overflow-y-auto trk-scroll p-6 md:p-8 relative`} onClick={e => e.stopPropagation()} role="dialog">
        <button type="button" onClick={onClose} className="trk-btn !p-2 absolute right-5 top-5" aria-label="Close"><X size={16} /></button>
        {children}
      </div>
    </div>
  );
}
