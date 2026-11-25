// My AFTERLIFE (Tomer, 25 Nov 2026: "see my profile embedded in AfterLife — chosen automatically by user — with an option to
// open a new tab"). AfterLife's /embed/me: the person's own spend, ROAS, retention and creatives. CP signs a one-use pass
// with their e-mail and Monday id; AfterLife matches them to their profile.
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, Gauge } from 'lucide-react';
import CreativeShell from '../../components/creative-team/CreativeShell';
import { meApi } from '../../lib/meService';

export default function MyAfterlife() {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  const [dev, setDev] = useState(false);
  const [opening, setOpening] = useState(false);
  const load = useCallback(async () => {
    setErr(null); setUrl(null);
    try { const r = await meApi.afterlifeMe(); if (r?.dev) setDev(true); else setUrl(r.url); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { meApi.pageView('My AfterLife'); load(); }, [load]);
  // a new tab needs its own pass (each one opens AfterLife once)
  const newTab = async () => {
    setOpening(true);
    const w = window.open('', '_blank');
    try { const r = await meApi.afterlifeMe(); if (r?.url && w) w.location.href = r.url; else w?.close(); } catch (e) { w?.close(); setErr(e.message); } finally { setOpening(false); }
  };
  return (
    <CreativeShell eyebrow="Powered by AfterLife" title="My AfterLife" sub="How your work does on Meta — spend, ROAS, hook and hold, and every creative of yours that ran."
      actions={<span className="flex gap-2">
        <button type="button" onClick={load} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-gray-900"><RefreshCw size={13} /> Reload</button>
        <button type="button" onClick={newTab} disabled={opening} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white disabled:opacity-60" style={{ background: '#030b2e' }}>
          {opening ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />} Open in a new tab
        </button>
      </span>}>
      <div className="rounded-3xl overflow-hidden border border-gray-200 bg-white shadow-sm" style={{ height: 'calc(100vh - 230px)', minHeight: 560 }}>
        {err && <div className="p-10 text-center text-red-600 text-sm">{err}</div>}
        {dev && !err && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8 text-gray-500">
            <span className="w-12 h-12 rounded-2xl bg-[#0808f8]/10 text-[#0808f8] flex items-center justify-center"><Gauge size={22} /></span>
            <b className="text-[#030b2e]">Your AfterLife profile shows here</b>
            <span className="text-sm max-w-md">On the live CP this is your own page in AfterLife — picked from your CP account and your Monday. (This local preview has no AfterLife.)</span>
          </div>
        )}
        {!url && !err && !dev && <div className="h-full flex items-center justify-center text-gray-400 text-sm"><Loader2 className="animate-spin mr-2" size={16} /> Opening AfterLife…</div>}
        {url && <iframe title="My AfterLife" src={url} className="w-full h-full border-0" allow="fullscreen; autoplay" referrerPolicy="no-referrer" />}
      </div>
    </CreativeShell>
  );
}
