import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Link2, Loader2, RotateCcw, History, Eye, Trash2, RefreshCw, Type, Bookmark, Plus, Sparkles } from 'lucide-react';
import { creativeApi } from '../../../lib/creativeReportService';
import { relTime, shortDate } from '../deck/format';
import { SPECS } from '../slides/specs';

function Modal({ title, onClose, children, width = 520 }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(3,11,46,.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full p-6" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-[#030b2e]">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ── Share ───────────────────────────────────────────────────────────────────
export function ShareDialog({ report, onClose, onChanged, showLinks, setShowLinks }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(30);
  const [share, setShare] = useState(report.share_token ? { token: report.share_token, expires: report.share_expires_at } : null);
  const url = share ? `${window.location.origin}/creative-report/${share.token}` : '';
  const active = share && (!share.expires || new Date(share.expires) > new Date());

  const create = async (rotate = false) => {
    setBusy(true);
    try {
      const r = await creativeApi.share(report.id, { days, rotate });
      setShare({ token: r.share_token, expires: r.share_expires_at });
      onChanged?.({ share_token: r.share_token, share_expires_at: r.share_expires_at });
    } finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true);
    try { await creativeApi.unshare(report.id); setShare(null); onChanged?.({ share_token: null, share_expires_at: null }); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };

  return (
    <Modal title="Share with Guy & Ayal" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">A private, read-only link. Works on phones (scrolls) and laptops (full deck). Hidden tickets, speaker notes and private notes are never included.</p>
      {active ? (
        <>
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={e => e.target.select()} className="flex-1 text-sm px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 font-mono" />
            <button type="button" onClick={copy} className="px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5" style={{ background: '#0808f8' }}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">{share.expires ? `Expires ${shortDate(share.expires.slice(0, 10))}` : 'Never expires'} · viewers see your saved edits live</div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <select value={days ?? ''} onChange={e => setDays(e.target.value === '' ? null : Number(e.target.value))} className="text-sm px-3 py-2.5 rounded-lg border border-gray-200">
            <option value={7}>Expires in 7 days</option>
            <option value={30}>Expires in 30 days</option>
            <option value={90}>Expires in 90 days</option>
            <option value="">Never expires</option>
          </select>
          <button type="button" disabled={busy} onClick={() => create(false)} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ background: '#0808f8' }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Create link
          </button>
        </div>
      )}
      <label className="flex items-center gap-3 mt-5 text-sm cursor-pointer">
        <input type="checkbox" checked={!!showLinks} onChange={e => setShowLinks(e.target.checked)} />
        <span>Include source links (Monday, Dropbox, Frame.io, Figma) on the shared deck</span>
      </label>
      {active && (
        <div className="flex gap-4 mt-5 pt-4 border-t border-gray-100 text-xs">
          <button type="button" disabled={busy} onClick={() => create(true)} className="text-gray-600 hover:text-gray-900 flex items-center gap-1"><RefreshCw size={12} /> New link (old one stops working)</button>
          <button type="button" disabled={busy} onClick={revoke} className="text-red-600 hover:underline flex items-center gap-1 ml-auto"><Trash2 size={12} /> Revoke</button>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-4">Tip: paste the link into the CP weekly’s “Creative Weekly Link” to keep everything in one place.</p>
    </Modal>
  );
}

// ── Versions ────────────────────────────────────────────────────────────────
const REASON = { manual: 'Saved', pre_refresh: 'Before refresh', pre_restore: 'Before restore', finalize: 'Marked final', auto: 'Auto' };

export function VersionsDrawer({ reportId, onClose, onPreview, onRestored }) {
  const [list, setList] = useState(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setList((await creativeApi.versions(reportId)).versions || []); } catch { setList([]); } };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reportId]);
  const save = async () => {
    setBusy(true);
    try { await creativeApi.saveVersion(reportId, label.trim() || null); setLabel(''); await load(); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[85] flex justify-end" style={{ background: 'rgba(3,11,46,.35)' }} onClick={onClose}>
      <div className="h-full w-full max-w-sm bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <History size={16} className="text-gray-500" />
          <span className="font-bold text-[#030b2e]">Version history</span>
          <button type="button" onClick={onClose} className="ml-auto p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-gray-100 flex gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') save(); }} placeholder="Name this version (optional)" className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200" />
          <button type="button" disabled={busy} onClick={save} className="px-3 rounded-lg text-sm font-semibold text-white" style={{ background: '#030b2e' }}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}</button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {!list && <div className="py-8 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>}
          {list?.map(v => (
            <div key={v.id} className="p-3 rounded-xl hover:bg-gray-50 flex items-start gap-3">
              <span className="text-[11px] font-mono text-gray-400 pt-0.5">v{v.version_number}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{v.label || REASON[v.reason] || v.reason}</div>
                <div className="text-[11px] text-gray-500">{relTime(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ''}</div>
              </div>
              <button type="button" title="Preview" onClick={() => onPreview(v)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700"><Eye size={15} /></button>
              <button type="button" title="Restore" onClick={async () => { if (window.confirm('Restore this version? Your current state is saved as a version first.')) { const r = await creativeApi.restoreVersion(reportId, v.id); onRestored(r); onClose(); } }} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700"><RotateCcw size={15} /></button>
            </div>
          ))}
          {list && !list.length && <div className="text-sm text-gray-400 text-center py-8">No versions yet. Refreshing data and marking final save one automatically.</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Refresh diff ────────────────────────────────────────────────────────────
export function DiffToast({ diff, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 9000); return () => clearTimeout(t); }, [onClose]);
  if (!diff) return null;
  return createPortal(
    <div className="fixed top-20 right-6 z-[95] max-w-sm bg-[#030b2e] text-white rounded-2xl shadow-2xl p-4">
      <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#8c93ff]"><RefreshCw size={13} /> Live data refreshed</div>
      <ul className="mt-2 text-sm space-y-1">
        {diff.summary.map((s, i) => <li key={i}>• {s}</li>)}
      </ul>
      <div className="text-[11px] text-white/50 mt-2">Your edits were kept. A version was saved before refreshing.</div>
      <button type="button" onClick={onClose} className="absolute top-3 right-3 text-white/50 hover:text-white"><X size={14} /></button>
    </div>,
    document.body
  );
}

// ── Add slide ───────────────────────────────────────────────────────────────
export function AddSlideMenu({ onClose, onAdd, onAddTemplateType, existingTypes }) {
  const addable = ['highlights', 'by_product', 'by_type', 'workload', 'planned_next', 'risks', 'cp_productions', 'cp_updates', 'kpis', 'exec_summary']
    .filter(t => !existingTypes.has(t));
  return (
    <Modal title="Add a slide" onClose={onClose} width={480}>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onAdd('custom')} className="p-4 rounded-xl border border-gray-200 hover:border-[#4a55ff] text-left">
          <Type size={18} className="text-[#0808f8]" />
          <div className="font-semibold text-sm mt-2">Custom slide</div>
          <div className="text-xs text-gray-500">Title, text, optional image</div>
        </button>
        <button type="button" onClick={() => onAdd('section')} className="p-4 rounded-xl border border-gray-200 hover:border-[#4a55ff] text-left">
          <Bookmark size={18} className="text-[#0808f8]" />
          <div className="font-semibold text-sm mt-2">Section divider</div>
          <div className="text-xs text-gray-500">Electric-blue chapter break</div>
        </button>
      </div>
      {addable.length > 0 && (
        <>
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-5 mb-2">Data slides not in this deck</div>
          <div className="flex flex-wrap gap-2">
            {addable.map(t => (
              <button key={t} type="button" onClick={() => onAddTemplateType(t)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 hover:border-[#4a55ff] flex items-center gap-1">
                <Plus size={12} /> {SPECS[t]?.label}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export function NarrativeHint({ onWrite, busy }) {
  return (
    <button type="button" onClick={onWrite} disabled={busy} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-60" style={{ background: '#0808f8' }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Write summary with Claude
    </button>
  );
}
