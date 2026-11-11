import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Copy, Check, RefreshCw, X, Loader2, Power } from 'lucide-react';
import { studioApi } from '../../lib/studioService';

/** The ticket creator's public request link: copy it; admins create, replace or turn it off. */
export default function RequestLink() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open && !data) studioApi.ticketLink().then(setData).catch(e => setError(e.message)); }, [open, data]);
  const url = data?.link ? `${window.location.origin}${data.link.path}` : '';
  const act = async (key, fn) => { setBusy(key); setError(null); try { setData({ ...data, ...(await fn()) }); } catch (e) { setError(e.message); } finally { setBusy(null); } };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select it instead */ } };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-gray-500 hover:text-[#0808f8] flex items-center gap-1" title="A link anyone can use to request a ticket — they say who they are">
        <Link2 size={13} /> Request link
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(3,11,46,.5)' }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-none" style={{ background: '#0808f80f' }}><Link2 size={18} className="text-[#0808f8]" /></span>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-[#030b2e]">Request link</div>
                <p className="text-sm text-gray-500 mt-0.5">Anyone with this link can ask the studio for a ticket — no CP login. They say who they are first, and the ticket is <b className="text-gray-700">Requested by</b> them, not you.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={16} /></button>
            </div>

            {!data && !error && <div className="py-8 text-center text-gray-400"><Loader2 className="animate-spin inline" size={18} /></div>}
            {data && (data.link ? (
              <div className="mt-5">
                <div className="flex gap-2">
                  <input readOnly value={url} onFocus={e => e.target.select()} className="flex-1 min-w-0 text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-800" aria-label="Request link" />
                  <button type="button" onClick={copy} className="text-sm font-semibold px-4 rounded-xl text-white flex items-center gap-1.5" style={{ background: '#0808f8' }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
                </div>
                <div className="text-xs text-gray-400 mt-2">{data.link.uses ? `${data.link.uses} ticket${data.link.uses === 1 ? '' : 's'} requested through it` : 'No tickets through it yet'}{data.link.created_by ? ` · created by ${data.link.created_by}` : ''}</div>
                {data.can_manage && (
                  <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
                    <button type="button" disabled={!!busy} onClick={() => window.confirm('Make a new link? The current one stops working right away.') && act('rotate', studioApi.rotateTicketLink)} className="text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5">{busy === 'rotate' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} New link</button>
                    <button type="button" disabled={!!busy} onClick={() => window.confirm('Turn the link off? Nobody can request through it until you make a new one.') && act('off', async () => { await studioApi.disableTicketLink(); return { link: null }; })} className="text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-red-600 flex items-center gap-1.5">{busy === 'off' ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />} Turn off</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 text-sm text-gray-600">
                {data.can_manage
                  ? <button type="button" disabled={!!busy} onClick={() => act('rotate', studioApi.rotateTicketLink)} className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white flex items-center gap-1.5" style={{ background: '#0808f8' }}>{busy === 'rotate' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Create the request link</button>
                  : 'There’s no request link yet — an admin can create one here.'}
              </div>
            ))}
            {error && <div className="mt-4 px-3 py-2 rounded-xl bg-red-50 text-red-700 text-xs">{error}</div>}
          </div>
        </div>, document.body)}
    </>
  );
}
