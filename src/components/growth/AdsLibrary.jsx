// Ads Library (Tomer, 17 Nov 2026): AfterLife's "Fresh to test" — finished creative that never ran on Meta — live inside CP.
// CP signs a 2-minute pass (/api/growth/afterlife-pass) and AfterLife opens a frame-only page with its own session,
// because AfterLife's sign-in can't work inside another site's frame. "Open AfterLife" opens it in its own tab.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { meApi } from '../../lib/meService';

const AFTERLIFE = 'https://afterlife.particle-creative.cloud';

export default function AdsLibrary({ header = false }) {
  const [st, setSt] = useState({ url: null, base: null, error: null, n: 0 });
  const load = useCallback(() => {
    setSt(s => ({ ...s, url: null, error: null }));
    meApi.afterlifePass().then(r => setSt(s => ({ ...s, url: r.url, base: r.base, n: s.n + 1 }))).catch(e => setSt(s => ({ ...s, error: e.message })));
  }, []);
  // once per mount — a pass works once, and React's dev double-run would ask twice and spoil it
  const started = useRef(false);
  useEffect(() => { if (started.current) return; started.current = true; load(); }, [load]);
  const base = st.base || AFTERLIFE;

  return (
    <div className="flex flex-col gap-3">
      {header && (
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <h1 className="font-black uppercase leading-none text-[36px] sm:text-[48px]" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>Ads Library</h1>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 pb-1">powered by AfterLife</span>
        </div>
      )}
      <a href={`${base}/audit`} target="_blank" rel="noopener noreferrer"
        className="group flex items-center gap-4 rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 text-white shadow-sm transition-transform hover:-translate-y-0.5"
        style={{ background: 'linear-gradient(100deg, #030b2e 0%, #0b1a6b 55%, #0808f8 100%)' }}>
        <span className="min-w-0 flex-1">
          <span className="block font-black uppercase leading-none text-[24px] sm:text-[30px]" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>Open AfterLife</span>
          <span className="block text-[12px] sm:text-[12.5px] text-white/70 mt-1">Fresh to test, full screen in its own tab — filters, quick view and downloads</span>
        </span>
        <span className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/15 group-hover:bg-white/25 flex-none"><ExternalLink size={18} /></span>
      </a>

      {st.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} /> {st.error}
          <button type="button" onClick={load} className="ml-auto font-semibold underline">Try again</button>
        </div>
      ) : st.url ? (
        <iframe key={st.n} src={st.url} title="Fresh to test — AfterLife" className="w-full rounded-2xl border border-gray-200 bg-[#030b2e] h-[calc(100dvh-260px)] min-h-[520px] sm:h-[calc(100vh-240px)] sm:min-h-[620px]"
          allow="fullscreen; clipboard-write" referrerPolicy="no-referrer" />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white py-24 text-center text-gray-400 flex flex-col items-center gap-3">
          <Loader2 className="animate-spin" /><span className="text-sm">Opening Fresh to test from AfterLife…</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-[11px] text-gray-400 px-1">
        <span>Live from AfterLife · finished creative that never ran on Meta. Downloads are logged in AfterLife under your name.</span>
        <button type="button" onClick={load} className="ml-auto flex items-center gap-1 font-semibold text-gray-500 hover:text-gray-800 flex-none"><RefreshCw size={12} /> Reload</button>
      </div>
    </div>
  );
}
