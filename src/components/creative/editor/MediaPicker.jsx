import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, RefreshCw, Film, ImageIcon, FileText, Check, Star, AlertTriangle } from 'lucide-react';
import { creativeApi } from '../../../lib/creativeReportService';

const KIND_LABEL = { dropbox_folder: 'Dropbox', dropbox_file: 'Dropbox', frameio: 'Frame.io', monday_asset: 'Monday file (reference)', figma: 'Figma', link: 'Link' };
const KIND_ORDER = { design: ['figma', 'dropbox_folder', 'dropbox_file', 'frameio', 'monday_asset'], video: ['frameio', 'dropbox_folder', 'dropbox_file', 'figma', 'monday_asset'] };

/**
 * Pick the cover + ordered gallery for one ticket from every file behind its Dropbox / Frame.io /
 * Monday links (this replaces the former "choose which files to show" app).
 */
export default function MediaPicker({ reportId, item, snapshot, media, value, onSave, onClose }) {
  const refs = useMemo(() => (item?.media_refs || [])
    .map(id => ({ id, ...(snapshot.media_refs?.[id] || {}) }))
    .filter(r => r.kind && r.kind !== 'link')
    .sort((a, b) => {
      const order = KIND_ORDER[item?.board] || KIND_ORDER.video;
      return order.indexOf(a.kind) - order.indexOf(b.kind);
    }), [item, snapshot]);
  const [tab, setTab] = useState(refs[0]?.id || null);
  const [listings, setListings] = useState({});
  const [cover, setCover] = useState(value?.cover || null);
  const [gallery, setGallery] = useState(value?.gallery || []);

  const load = async (refId, refresh = false) => {
    setListings(l => ({ ...l, [refId]: { loading: true } }));
    try {
      const res = await creativeApi.mediaListing(reportId, refId, refresh);
      setListings(l => ({ ...l, [refId]: { entries: res.entries || [], error: res.error } }));
    } catch (e) {
      setListings(l => ({ ...l, [refId]: { entries: [], error: e.message } }));
    }
  };
  useEffect(() => { if (tab && !listings[tab]) load(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const isCover = (refId, key) => cover?.refId === refId && cover?.key === key;
  const galIdx = (refId, key) => gallery.findIndex(g => g.refId === refId && g.key === key);
  const toggleGallery = (refId, e) => {
    const i = galIdx(refId, e.key);
    if (i >= 0) setGallery(g => g.filter((_, j) => j !== i));
    else setGallery(g => [...g, { refId, key: e.key, kind: e.kind, name: e.name }].slice(0, 12));
  };
  const cur = tab ? listings[tab] : null;

  return createPortal(
    <div data-media-picker-open className="fixed inset-0 z-[90] flex justify-end" onClick={onClose} style={{ background: 'rgba(3,11,46,.45)' }}>
      <div className="h-full w-full max-w-[640px] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Choose media</div>
            <div className="font-bold text-gray-900 truncate">{item.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">Click a file to make it the <b>cover</b>. Use ✓ to add it to the <b>gallery</b> (showcase slide + in-deck viewer). Monday files are usually references — prefer Figma or Dropbox.</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-5 pt-3 flex gap-2 flex-wrap">
          {refs.map(r => (
            <button key={r.id} type="button" onClick={() => setTab(r.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${tab === r.id ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'border-gray-200 text-gray-600'}`}>
              {KIND_LABEL[r.kind] || r.kind}{r.kind === 'monday_asset' && r.name ? ` · ${r.name.slice(0, 18)}` : ''}
            </button>
          ))}
          {tab && <button type="button" onClick={() => load(tab, true)} className="ml-auto text-xs text-gray-500 flex items-center gap-1 hover:text-gray-800"><RefreshCw size={12} /> Refresh</button>}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {!refs.length && <div className="text-sm text-gray-500 text-center py-12">This ticket has no Figma, Dropbox, Frame.io or Monday files.</div>}
          {cur?.loading && <div className="py-12 text-center text-gray-400"><Loader2 className="animate-spin inline" /> Loading files…</div>}
          {cur?.error && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 text-amber-900 text-xs flex gap-2"><AlertTriangle size={14} className="flex-none mt-0.5" /> {cur.error}</div>
          )}
          {cur?.entries && (
            <div className="grid grid-cols-3 gap-3">
              {cur.entries.map(e => {
                const thumbable = e.kind === 'image' || e.kind === 'video';
                const coverOn = isCover(tab, e.key);
                const gi = galIdx(tab, e.key);
                return (
                  <div key={e.key} className={`relative rounded-xl overflow-hidden border-2 cursor-pointer ${coverOn ? 'border-[#0808f8]' : 'border-transparent hover:border-gray-300'}`}
                    onClick={() => thumbable && setCover(coverOn ? null : { refId: tab, key: e.key, kind: e.kind, name: e.name })}>
                    <div className="aspect-[4/5] bg-gray-100 flex items-center justify-center">
                      {thumbable
                        ? <img src={media.ref(tab, e.key, 'thumb')} alt="" loading="lazy" className="w-full h-full object-cover" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
                        : <FileText className="text-gray-300" size={32} />}
                    </div>
                    <div className="absolute top-1.5 left-1.5 flex gap-1">
                      {e.kind === 'video' && <span className="px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] flex items-center gap-1"><Film size={10} /> Video</span>}
                      {e.version && <span className="px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px]">v{e.version}</span>}
                      {coverOn && <span className="px-1.5 py-0.5 rounded bg-[#0808f8] text-white text-[10px] flex items-center gap-1"><Star size={10} fill="#fff" /> Cover</span>}
                    </div>
                    {thumbable && (
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); toggleGallery(tab, e); }}
                        className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${gi >= 0 ? 'bg-[#0808f8] text-white' : 'bg-white/90 text-gray-500'}`}
                        title={gi >= 0 ? 'Remove from gallery' : 'Add to gallery'}>
                        {gi >= 0 ? gi + 1 : <Check size={12} />}
                      </button>
                    )}
                    <div className="px-2 py-1.5 text-[11px] text-gray-600 truncate bg-white">{e.name}</div>
                  </div>
                );
              })}
              {!cur.entries.length && !cur.error && <div className="col-span-3 text-sm text-gray-500 text-center py-10">No files found behind this link.</div>}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
          <span className="text-xs text-gray-500 flex items-center gap-1.5">
            {cover ? <><ImageIcon size={13} /> Cover chosen</> : 'Automatic cover'}{gallery.length ? ` · ${gallery.length} in gallery` : ''}
          </span>
          <button type="button" onClick={() => { setCover(null); setGallery([]); }} className="ml-auto text-xs text-gray-500 hover:text-gray-800">Clear</button>
          <button type="button" onClick={() => { onSave({ cover, gallery }); onClose(); }} className="px-4 py-2 rounded-full text-sm font-semibold text-white" style={{ background: '#0808f8' }}>Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
