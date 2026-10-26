import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Loader2, AlertTriangle, Check, Download, Archive, Sheet, Plus, X, Film, Music, Clock } from 'lucide-react';
import { useBrand } from '../../context/BrandContext';
import { libraryApi, download, CATEGORY, PROMPT_BOXES } from '../../lib/libraryService';
import { Poster, posterOf } from '../../components/library/parts';
import ProductionDrawer from '../../components/library/ProductionDrawer';
import BeforeModal from '../../components/library/BeforeModal';
import AddFiles from '../../components/library/AddFiles';
import { CountUp } from '../../components/tracker/parts';
import '../../components/tracker/tracker.css';

const FILTERS = [['', 'Everything'], ['tv_master', 'TV masters'], ['digital', 'Digital'], ['sound', 'Sound stems']];
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

/** The Library — where the final files live: every commercial's TV master, digital versions and sound stems. */
export default function LibraryPage() {
  const { brandId, brand } = useBrand();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [connect, setConnect] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [adding, setAdding] = useState(null); // production waiting for files

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { setData(await libraryApi.list(brandId)); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [brandId]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);
  const fail = (m) => setToast({ text: m, error: true });

  const productions = data?.productions || [];
  const before = data?.before || [];
  const canEdit = !!data?.can_edit;
  const all = data?.all_productions || productions;
  const openId = params.get('p');
  const open = productions.find(p => p.id === openId) || null;
  const beforeOpen = params.get('view') === 'before';

  const needle = q.trim().toLowerCase();
  const match = (p) => !needle || [p.id, p.name, ...(p.product_type || []), ...p.items.flatMap(i => [i.title, i.code, i.file_name, i.market])]
    .filter(Boolean).some(v => String(v).toLowerCase().includes(needle));
  const shelf = productions.filter(p => p.items.length && (!cat || p.items.some(i => i.category === cat)) && match(p));
  const waiting = productions.filter(p => isDone(p.stage) && !p.items.some(i => i.category === 'tv_master' || i.category === 'digital'));
  const files = productions.reduce((a, p) => a + p.items.length, 0) + before.length;
  const commercials = useMemo(() => {
    const keys = new Set();
    for (const it of [...productions.flatMap(p => p.items), ...before]) if (it.category === 'tv_master') keys.add(it.specs?.group || it.id);
    return keys.size;
  }, [productions, before]);
  const source = data?.sources?.[0] || null;

  const moveGroup = async (group, productionId) => {
    try {
      for (const it of group.items) await libraryApi.updateItem(it.id, { production_id: productionId });
      const to = all.find(x => x.id === productionId);
      setToast({ text: productionId ? `“${group.title}” is now in ${to?.name || productionId}` : `“${group.title}” moved to Before 2026` });
      load(true);
    } catch (e) { fail(e.message); }
  };
  const removeItem = async (it) => {
    if (!window.confirm(`Remove “${it.title}” from the Library? The file stays in Dropbox.`)) return;
    try { await libraryApi.removeItem(it.id); setToast({ text: 'Removed from the Library' }); load(true); } catch (e) { fail(e.message); }
  };
  const sync = async () => {
    if (!source) return;
    setSyncing(true);
    try {
      const { result } = await libraryApi.syncSheet(source.id);
      setToast(result.ok
        ? { text: `Synced · ${result.files} files · ${result.added} new · ${result.updated} updated · ${result.removed} removed` }
        : { text: `Sync failed: ${result.error}`, error: true });
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

  return (
    <div className="trk max-w-[2400px] mx-auto pb-16">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        {/* Hero */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0">
            <div className="trk-eyebrow">The Library · {brand?.name || brandId} · final files, ready to pull</div>
            <h1 className="trk-title text-[52px] sm:text-[88px] md:text-[112px] mt-3">
              {data ? <><CountUp value={commercials} /> commercial{commercials === 1 ? '' : 's'}</> : 'The Library'}
            </h1>
            {data && (
              <div className="mt-3 text-[15px] trk-muted">
                {files} files · {shelf.length} productions · {before.length ? `${new Set(before.map(i => i.specs?.group || i.id)).size} from before 2026` : 'nothing from before 2026 yet'}
              </div>
            )}
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
          </div>
        </div>

        {connect && (
          <div className="mt-6 trk-glass p-4 flex flex-wrap items-center gap-2">
            <Sheet size={15} className="trk-muted" />
            <span className="text-[13px] font-semibold">Google Sheet of TV commercials</span>
            <input className="trk-input flex-1 min-w-[240px]" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
            <button type="button" className="trk-btn primary" disabled={!sheetUrl.trim() || syncing} onClick={connectSheet}>{syncing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Connect &amp; sync</button>
            <button type="button" className="trk-btn !p-2" onClick={() => setConnect(false)} aria-label="Cancel"><X size={14} /></button>
            <div className="w-full text-[11px] trk-dim">A tab per product, a row per commercial, and per market a checkbox, the file link, the landing URL and the code. New rows show up here every 15 minutes.</div>
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
            {/* Waiting for files */}
            {waiting.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3"><Clock size={14} style={{ color: '#ffb547' }} /><span className="trk-label" style={{ color: '#ffd699' }}>Completed — waiting for the finals · {waiting.length}</span></div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  {waiting.map(p => (
                    <div key={p.id} className="trk-glass p-4 flex items-center gap-3" style={{ borderColor: 'rgba(255,181,71,.35)' }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] trk-muted">{p.id}{p.completed_at ? ` · completed ${shortDate(p.completed_at)}` : ''}</div>
                        <div className="trk-title text-[22px] truncate">{p.name}</div>
                      </div>
                      {canEdit && <button type="button" className="trk-btn primary !py-1.5" onClick={() => setAdding(p)}><Plus size={13} /> Add files</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <div className="trk-seg overflow-x-auto max-w-full">
                {FILTERS.map(([k, l]) => <button key={k} type="button" className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{l}</button>)}
              </div>
              <div className="relative flex-1 min-w-[200px] max-w-[380px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" />
                <input className="trk-input !pl-9 !rounded-full" placeholder="Search productions, files, codes…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button type="button" className="trk-btn ml-auto" onClick={() => load(false)} disabled={loading}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>
            </div>

            {/* Shelf */}
            <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {shelf.map(p => <ProductionCard key={p.id} p={p} onOpen={() => setParams({ p: p.id })} onError={fail} />)}
              {/* Before 2026 */}
              {(before.length > 0 || source) && (!needle || before.some(i => [i.title, i.code, i.product].filter(Boolean).some(v => v.toLowerCase().includes(needle)))) && (
                <button type="button" onClick={() => setParams({ view: 'before' })} className="trk-card overflow-hidden flex flex-col text-left" style={{ minHeight: 260 }}>
                  <div className="relative flex-1 flex items-end p-5" style={{ background: 'radial-gradient(500px 260px at 100% 0%, rgba(8,8,248,.65), transparent 70%), linear-gradient(160deg, #0b1546, #030b2e)' }}>
                    <Archive size={88} className="absolute right-4 top-4 opacity-15" />
                    <div>
                      <div className="trk-eyebrow">Archive</div>
                      <div className="trk-title text-[56px] mt-1">Before 2026</div>
                      <div className="text-[13px] trk-muted mt-1">{new Set(before.map(i => i.specs?.group || i.id)).size} commercials · {[...new Set(before.map(i => i.product).filter(Boolean))].length} products · every market’s link in one place</div>
                    </div>
                  </div>
                </button>
              )}
            </div>
            {!shelf.length && !before.length && (
              <div className="py-16 text-center trk-muted text-sm">
                {needle || cat ? 'Nothing matches.' : 'Nothing in the Library yet — files arrive when a production is completed, or connect the TV Commercials sheet.'}
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <ProductionDrawer p={open} productions={all} canEdit={canEdit} onClose={() => setParams({}, { replace: true })}
          onSaved={() => { setToast({ text: 'Added to the Library' }); load(true); }} onMove={moveGroup} onRemove={removeItem} onError={fail} />
      )}
      {beforeOpen && data && (
        <BeforeModal items={before} productions={all} canEdit={canEdit} onClose={() => setParams({}, { replace: true })} onMove={moveGroup} onError={fail} />
      )}
      {adding && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: 'rgba(3,11,46,.7)' }} onClick={() => setAdding(null)}>
          <div className="trk trk-canvas w-full max-w-[720px] max-h-[92vh] overflow-y-auto trk-scroll p-6 md:p-8" onClick={e => e.stopPropagation()}>
            <div className="trk-eyebrow">{adding.id} · add the finals</div>
            <h2 className="trk-title text-5xl mt-2 mb-5">{adding.name}</h2>
            <AddFiles productionId={adding.id} boxes={PROMPT_BOXES} onCancel={() => setAdding(null)}
              onSaved={() => { setAdding(null); setToast({ text: `Added to the Library — ${adding.name}` }); load(true); }} />
          </div>
        </div>
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

function ProductionCard({ p, onOpen, onError }) {
  const masters = p.items.filter(i => i.category === 'tv_master');
  const lead = posterOf(masters) || posterOf(p.items) || masters[0] || p.items[0];
  const count = (c) => p.items.filter(i => i.category === c).length;
  const masterGroups = new Set(masters.map(i => i.specs?.group || i.id)).size;
  const markets = [...new Set(p.items.map(i => i.market).filter(Boolean))];
  const live = p.items.some(i => i.on_air);
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="trk-card overflow-hidden flex flex-col">
      <div className="relative aspect-video">
        <Poster item={lead} className="absolute inset-0 w-full h-full" icon={Film} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 35%, rgba(3,11,46,.92))' }} />
        <div className="absolute left-4 right-4 bottom-3">
          <div className="text-[11px] trk-muted flex items-center gap-2">
            {p.id}{p.air_date ? ` · on air ${shortDate(p.air_date)}` : p.delivery_date ? ` · delivered ${shortDate(p.delivery_date)}` : ''}
            {live && <span className="trk-chip green !py-0 !px-1.5 !text-[10px]">checked</span>}
          </div>
          <div className="trk-title text-[30px] truncate">{p.name}</div>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {masterGroups > 0 && <span className="trk-chip"><Film size={11} />{masterGroups} TV {masterGroups > 1 ? 'masters' : 'master'}</span>}
          {count('digital') > 0 && <span className="trk-chip">{count('digital')} digital</span>}
          {count('sound') > 0 && <span className="trk-chip"><Music size={11} />{count('sound')} stems</span>}
          {markets.length > 0 && <span className="trk-chip gray">{markets.join(' · ')}</span>}
          {!masters.length && <span className="trk-chip amber">No TV master</span>}
        </div>
        {masters[0] && (
          <button type="button" className="trk-btn primary self-start !py-1.5" onClick={async (e) => { e.stopPropagation(); try { await download(masters[0]); } catch (err) { onError(err.message); } }}>
            <Download size={13} /> {CATEGORY.tv_master.label}{masters[0].market ? ` · ${masters[0].market}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
