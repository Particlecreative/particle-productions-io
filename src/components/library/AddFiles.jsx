import { useState } from 'react';
import { Loader2, Link2, Plus, Check, X, FolderOpen, Film, Music, FileText } from 'lucide-react';
import { libraryApi, CATEGORY, CATEGORY_ORDER } from '../../lib/libraryService';
import { fmtSize, sourceOf } from './parts';

const ICON = { tv_master: Film, digital: Film, sound: Music, other: FileText };
const AUTO = { key: 'auto', category: null, label: 'Dropbox link', hint: 'a file, or the whole finals folder — files are sorted by their names' };

/** A box decides for videos; audio is always a stem, documents and subtitles stay "other". */
function pick(box, e, plain) {
  if (plain) return box.category || 'tv_master';
  if (!box.category) return e.category;
  if (e.kind === 'audio') return 'sound';
  if (e.kind === 'video') {
    if (box.category === 'sound') return e.category;
    // A file that says it's the TV master stays one, whichever box it came from
    if (e.category === 'tv_master' && /(master|broadcast|(^|[^a-z])tv([^a-z]|$))/i.test(e.name || '')) return 'tv_master';
    return box.category;
  }
  return e.category;
}

/**
 * Paste Dropbox links (a file or a whole folder): the files are listed and sorted into TV master / digital /
 * sound stems by name. Check, fix a category if needed, save. Nothing is saved before "Add".
 * boxes: labelled inputs (the completion prompt asks for each kind separately); a box's category wins.
 */
export default function AddFiles({ productionId, boxes = [AUTO], onSaved, onCancel, saveLabel = 'Add to the Library' }) {
  const [inputs, setInputs] = useState({});
  const [busy, setBusy] = useState({});
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const resolve = async (box, given) => {
    const url = String(given ?? inputs[box.key] ?? '').trim();
    if (!url) return;
    setBusy(b => ({ ...b, [box.key]: true })); setErr(null);
    try {
      const r = await libraryApi.resolve(url);
      if (r.error && !r.entries?.length) throw new Error(r.error);
      const plain = r.link_kind === 'link';
      const found = (r.entries || []).map((e, i) => ({
        uid: `${r.url}|${e.key || i}`,
        checked: e.category !== 'other' || plain || r.entries.length === 1,
        category: pick(box, e, plain),
        title: plain ? `${box.category ? CATEGORY[box.category].label : 'File'} · ${sourceOf(r.url)}` : e.name,
        url: r.url, entry_key: e.key, file_name: plain ? null : e.name, ext: plain ? null : e.ext, size_bytes: e.size, specs: e.specs || {},
        folder: r.link_kind === 'dropbox_folder', path: e.path,
      }));
      if (!found.length) throw new Error('No files in that link');
      setRows(prev => [...prev.filter(p => !found.some(f => f.uid === p.uid)), ...found]);
      setInputs(v => ({ ...v, [box.key]: '' }));
    } catch (e) { setErr(e.message); } finally { setBusy(b => ({ ...b, [box.key]: false })); }
  };

  const picked = rows.filter(r => r.checked);
  const save = async () => {
    if (!picked.length) return;
    setSaving(true); setErr(null);
    try {
      const res = await libraryApi.addItems(productionId, picked.map(r => ({
        category: r.category, title: r.title, url: r.url, entry_key: r.entry_key, file_name: r.file_name, ext: r.ext, size_bytes: r.size_bytes, specs: r.specs,
      })));
      setRows([]);
      onSaved?.(res.production);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const set = (uid, patch) => setRows(rs => rs.map(r => (r.uid === uid ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      {boxes.map(box => (
        <div key={box.key}>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-[13px] font-semibold">{box.label}</span>
            <span className="text-[11px] trk-dim">{box.hint}</span>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); resolve(box); }}>
            <div className="relative flex-1">
              <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" />
              <input className="trk-input !pl-9" placeholder="https://www.dropbox.com/…" value={inputs[box.key] || ''}
                onChange={(e) => setInputs(v => ({ ...v, [box.key]: e.target.value }))}
                onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/^https?:\/\//.test(t.trim())) { e.preventDefault(); setInputs(v => ({ ...v, [box.key]: t.trim() })); resolve(box, t.trim()); } }} />
            </div>
            <button type="submit" className="trk-btn" disabled={busy[box.key] || !(inputs[box.key] || '').trim()}>
              {busy[box.key] ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Read
            </button>
          </form>
        </div>
      ))}

      {err && <div className="trk-chip red !whitespace-normal !rounded-xl !py-2">{err}</div>}

      {rows.length > 0 && (
        <div className="trk-glass p-2 flex flex-col gap-1 max-h-[44vh] overflow-y-auto trk-scroll">
          {rows.map(r => {
            const Icon = ICON[r.category] || FileText;
            return (
              <div key={r.uid} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${r.checked ? '' : 'opacity-50'}`} style={{ background: r.checked ? 'rgba(255,255,255,.04)' : 'transparent' }}>
                <button type="button" onClick={() => set(r.uid, { checked: !r.checked })} aria-label={r.checked ? 'Leave out' : 'Include'}
                  className="w-5 h-5 rounded-md flex items-center justify-center flex-none" style={{ background: r.checked ? '#4a55ff' : 'rgba(255,255,255,.08)' }}>
                  {r.checked && <Check size={13} color="#fff" />}
                </button>
                <Icon size={14} className="trk-muted flex-none" />
                <div className="min-w-0 flex-1">
                  <input className="bg-transparent w-full text-[13px] font-semibold outline-none truncate" value={r.title} onChange={(e) => set(r.uid, { title: e.target.value })} />
                  <div className="text-[10px] trk-dim flex items-center gap-1.5 truncate">
                    {r.folder && <FolderOpen size={10} />}{r.path || sourceOf(r.url)}{r.size_bytes ? ` · ${fmtSize(r.size_bytes)}` : ''}
                    {r.specs?.duration ? ` · ${r.specs.duration}s` : ''}{r.specs?.aspect ? ` · ${r.specs.aspect}` : ''}
                  </div>
                </div>
                <select className="trk-input !w-auto !py-1 !text-[12px]" value={r.category} onChange={(e) => set(r.uid, { category: e.target.value, checked: true })}>
                  {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY[c].label}</option>)}
                </select>
                <button type="button" className="trk-dim hover:text-white" aria-label="Remove" onClick={() => setRows(rs => rs.filter(x => x.uid !== r.uid))}><X size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" className="trk-btn primary" onClick={save} disabled={!picked.length || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Saving…' : picked.length ? `${saveLabel} · ${picked.length} file${picked.length > 1 ? 's' : ''}` : saveLabel}
        </button>
        {picked.length > 0 && (
          <span className="text-[11px] trk-muted">
            {CATEGORY_ORDER.map(c => [c, picked.filter(p => p.category === c).length]).filter(([, n]) => n).map(([c, n]) => `${n} ${n > 1 ? CATEGORY[c].plural.toLowerCase() : CATEGORY[c].label.toLowerCase()}`).join(' · ')}
          </span>
        )}
        {onCancel && <button type="button" className="ml-auto text-[13px] font-semibold trk-muted hover:text-white" onClick={onCancel}>Later</button>}
      </div>
    </div>
  );
}
