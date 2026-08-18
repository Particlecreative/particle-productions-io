import { useState, useEffect } from 'react';
import { X, FileSpreadsheet, ExternalLink, RefreshCw, Link2, Unlink, Users, AlertTriangle, Check, Loader2, Plus } from 'lucide-react';
import {
  getFinanceSheet, createFinanceSheet, syncFinanceSheet,
  linkFinanceSheet, unlinkFinanceSheet, getFinanceSheetMismatches, shareFinanceSheet,
} from '../../lib/dataService';
import { toast } from '../../lib/toast';

function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function FinanceSheetModal({ productionId, production, onClose, onChanged }) {
  const [state, setState] = useState(null); // { linked, url, mode, synced_at }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');       // 'create' | 'sync' | 'link' | 'unlink' | 'share' | 'mismatch'
  const [linkUrl, setLinkUrl] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [mismatches, setMismatches] = useState(null);

  async function load() {
    setLoading(true);
    try { setState(await getFinanceSheet(productionId)); }
    catch { setState({ linked: false }); }
    setLoading(false);
  }
  useEffect(() => { load(); }, [productionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key, fn, okMsg) {
    setBusy(key);
    try {
      const r = await fn();
      if (r?.error) throw new Error(r.error);
      if (okMsg) toast.success(okMsg);
      await load();
      onChanged?.();
      return r;
    } catch (e) {
      toast.error(e.message || 'Something went wrong');
      return null;
    } finally { setBusy(''); }
  }

  const handleCreate = () => run('create', () => createFinanceSheet(productionId), 'Finance sheet created & shared with the team');
  const handleSync   = () => run('sync', () => syncFinanceSheet(productionId), 'Synced to the sheet');
  const handleShare  = () => run('share', () => shareFinanceSheet(productionId), 'Re-shared with the finance team');
  const handleUnlink = () => { if (confirm('Unlink this sheet from the production? The sheet itself is not deleted.')) run('unlink', () => unlinkFinanceSheet(productionId), 'Unlinked'); };
  async function handleLink() {
    if (!linkUrl.trim()) return;
    const r = await run('link', () => linkFinanceSheet(productionId, linkUrl.trim()), 'Sheet linked');
    if (r) { setShowLink(false); setLinkUrl(''); }
  }
  async function handleMismatch() {
    setBusy('mismatch'); setMismatches(null);
    try {
      const r = await getFinanceSheetMismatches(productionId);
      if (r?.error) throw new Error(r.error);
      setMismatches(r);
    } catch (e) { toast.error(e.message || 'Could not read the sheet'); }
    finally { setBusy(''); }
  }

  const linked = state?.linked;
  const isMirror = state?.mode === 'mirror';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="brand-card rounded-2xl w-full max-w-md p-0 overflow-hidden" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <FileSpreadsheet size={16} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-800 dark:text-gray-100">Finance Sheet</h2>
              <p className="text-[10px] text-gray-400">{production?.project_name || productionId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
          ) : !linked ? (
            /* ── Not linked: generate or connect ── */
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">This production has no finance sheet yet. Create a live mirror of the budget, or connect an existing sheet.</p>

              <button onClick={handleCreate} disabled={!!busy}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border-2 border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-900/10 hover:border-green-400 transition-all text-left disabled:opacity-50">
                <div className="w-9 h-9 rounded-lg bg-green-600 text-white flex items-center justify-center shrink-0">
                  {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Generate finance sheet</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Creates a Google Sheet that mirrors the CP budget live, and shares it with the finance team as editors.</p>
                </div>
              </button>

              {!showLink ? (
                <button onClick={() => setShowLink(true)} disabled={!!busy}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition-all text-left disabled:opacity-50">
                  <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center shrink-0"><Link2 size={16} /></div>
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Connect an existing sheet</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Link a sheet you already have (kept read-only — its data is never changed). For older productions.</p>
                  </div>
                </button>
              ) : (
                <div className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                  <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Paste the Google Sheet link</p>
                  <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLink(); }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 dark:bg-gray-800 dark:text-gray-200 outline-none focus:border-green-400" />
                  <div className="flex gap-2">
                    <button onClick={handleLink} disabled={!linkUrl.trim() || busy === 'link'}
                      className="flex-1 text-xs font-bold py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40">
                      {busy === 'link' ? 'Linking…' : 'Link sheet'}
                    </button>
                    <button onClick={() => { setShowLink(false); setLinkUrl(''); }} className="px-3 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Linked ── */
            <div className="space-y-3">
              <div className={`flex items-center gap-2 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg w-fit ${isMirror ? 'bg-green-50 text-green-700 dark:bg-green-900/20' : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20'}`}>
                <Check size={12} />
                {isMirror ? 'Live mirror — auto-updates from the CP' : 'Linked (read-only) — CP never changes this sheet'}
              </div>

              <a href={state.url} target="_blank" rel="noreferrer"
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-green-400 transition-all text-sm font-semibold text-gray-800 dark:text-gray-100">
                <FileSpreadsheet size={16} className="text-green-600" /> Open finance sheet <ExternalLink size={13} className="ml-auto text-gray-400" />
              </a>

              {isMirror && (
                <>
                  <p className="text-[11px] text-gray-400">Last synced {timeAgo(state.synced_at)}.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleSync} disabled={!!busy}
                      className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-400 disabled:opacity-50">
                      {busy === 'sync' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync now
                    </button>
                    <button onClick={handleShare} disabled={!!busy}
                      className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-400 disabled:opacity-50">
                      {busy === 'share' ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />} Re-share
                    </button>
                  </div>
                </>
              )}

              {!isMirror && (
                <button onClick={handleMismatch} disabled={!!busy}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg border border-amber-200 text-amber-700 hover:border-amber-400 disabled:opacity-50">
                  {busy === 'mismatch' ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />} Check mismatches vs CP
                </button>
              )}

              {mismatches && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 max-h-56 overflow-y-auto">
                  {mismatches.diffs?.length === 0 ? (
                    <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5"><Check size={13} /> No mismatches — sheet matches the CP.</p>
                  ) : (
                    <>
                      <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-2">{mismatches.diffs.length} difference{mismatches.diffs.length !== 1 ? 's' : ''} ({mismatches.sheetRowCount} sheet rows vs {mismatches.cpRowCount} CP rows)</p>
                      <div className="space-y-1.5">
                        {mismatches.diffs.map((d, i) => (
                          <div key={i} className="text-[11px] leading-snug">
                            {d.type === 'only_in_sheet' && <span className="text-amber-600">• <b>{d.name}</b> — only in the sheet, not in CP</span>}
                            {d.type === 'only_in_cp' && <span className="text-blue-600">• <b>{d.name}</b> — only in CP, not in the sheet</span>}
                            {d.type === 'changed' && (
                              <span className="text-gray-600 dark:text-gray-300">• <b>{d.name}</b>: {d.fields.map((f, fi) => (
                                <span key={fi}>{fi > 0 ? ', ' : ''}{f.field} (sheet {String(f.sheet)} → CP {String(f.cp)})</span>
                              ))}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <button onClick={handleUnlink} disabled={!!busy}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 text-gray-400 hover:text-red-500 disabled:opacity-50">
                <Unlink size={11} /> Unlink sheet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
